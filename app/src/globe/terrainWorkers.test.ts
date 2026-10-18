import { DataUtils } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ARID_GRID_H,
  ARID_GRID_W,
  ICE_GRID_H,
  ICE_GRID_W,
  type ClimateSlice,
} from '../content/formats.ts';
import { climateTextureData, runJob, type Job } from './terrainJobs.ts';
import { TerrainWorkers, type WorkerLike } from './terrainWorkers.ts';
import { toHalfFloat, type TileArrays } from './tileArrays.ts';

/** A worker that keeps its jobs until the test runs them. */
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  jobs: { id: number; job: Job }[] = [];
  postMessage(message: unknown): void {
    this.jobs.push(message as { id: number; job: Job });
  }
  runAll(): void {
    for (const { id, job } of this.jobs.splice(0))
      this.onmessage?.({ data: { id, result: runJob(job).result } } as MessageEvent);
  }
}

const key = (x: number) => ({ face: 0, level: 3, x, y: 0 });
const ask = (pool: TerrainWorkers, x: number, priority: number) =>
  pool.tile(`t${x}`, key(x), 'deep', 100, -120, priority);

describe('terrain worker pool', () => {
  it('sends the most urgent builds, at most two per worker', () => {
    const w = new FakeWorker();
    const pool = new TerrainWorkers([w]);
    for (let x = 0; x < 5; x++) ask(pool, x, 10 - x);
    pool.endFrame();
    expect(w.jobs.map((j) => (j.job as { key: { x: number } }).key.x)).toEqual([4, 3]);
    expect(pool.pending).toBe(5);
  });

  it('drops builds no longer asked for and hands back finished ones once', () => {
    const w = new FakeWorker();
    const pool = new TerrainWorkers([w]);
    for (let x = 0; x < 4; x++) ask(pool, x, x);
    pool.endFrame(); // 0 and 1 go out
    ask(pool, 3, 3); // 2 is no longer wanted
    pool.endFrame();
    expect(pool.pending).toBe(3);
    w.runAll();
    const t = ask(pool, 0, 0) as TileArrays;
    expect(t.alwaysSea).toBe(true);
    expect(t.position.length).toBeGreaterThan(0);
    // Handed back once; asking again queues a new build.
    expect(ask(pool, 0, 0)).toBeUndefined();
    ask(pool, 3, 3);
    pool.endFrame();
    expect(w.jobs.map((j) => (j.job as { key: { x: number } }).key.x)).toEqual([0, 3]);
  });

  it('runs jobs on the main thread without workers', async () => {
    const pool = new TerrainWorkers([]);
    expect(ask(pool, 1, 0)).toBeUndefined();
    const slice = flatSlice(7, 90);
    const texture = pool.climate('a', slice, 0);
    pool.endFrame();
    expect(ask(pool, 1, 0)).toMatchObject({ alwaysSea: true });
    const data = await texture;
    expect(data[0]).toBe(7);
    expect(data[1]).toBe(90);
    expect(pool.pending).toBe(0);
  });
});

function flatSlice(ice: number, aridity: number): ClimateSlice {
  return {
    day: 0,
    ice: new Uint8Array(ICE_GRID_W * ICE_GRID_H).fill(ice),
    aridity: new Uint8Array(ARID_GRID_W * ARID_GRID_H).fill(aridity),
  };
}

describe('terrain jobs', () => {
  it('resamples a climate slice onto the ice grid', () => {
    const data = climateTextureData(flatSlice(3, 200));
    expect(data.length).toBe(ICE_GRID_W * ICE_GRID_H * 2);
    expect(data.every((v, i) => v === (i % 2 ? 200 : 3))).toBe(true);
  });

  it('converts half floats exactly as Three.js does', () => {
    for (const v of [0, -0, 1, -1, 0.5, 1e-5, 3e-8, -130, 40.25, 0.3333, 65504, 1e6, -1e6])
      expect(toHalfFloat(v), String(v)).toBe(DataUtils.toHalfFloat(v));
    for (let v = -140; v < 60; v += 0.137) expect(toHalfFloat(v)).toBe(DataUtils.toHalfFloat(v));
  });
});
