// The work a terrain worker does (spec milestone 1, section 11.5): building a
// tile's vertex data and resampling a climate slice for the graphics card.
// Pure functions of their inputs, run in the worker or, where there is none,
// on the main thread.

import {
  ARID_GRID_H,
  ARID_GRID_W,
  ICE_GRID_H,
  ICE_GRID_W,
  type ClimateSlice,
  type TerrainTile,
} from '../content/formats.ts';
import type { TileKey } from '../geo/cube.ts';
import { sampleGrid } from '../planet/sample.ts';
import { buildTileArrays, tileBuffers, type TileArrays } from './tileArrays.ts';
import { sampleTile } from './terrainStore.ts';

export type Job =
  | {
      kind: 'tile';
      key: TileKey;
      source: TerrainTile | 'deep';
      exaggeration: number;
      lowestSeaLevel: number;
    }
  | { kind: 'climate'; slice: ClimateSlice };

export type JobResult = TileArrays | Uint8Array;

/** Runs a job; also returns the buffers to transfer with its result. */
export function runJob(job: Job): { result: JobResult; transfer: ArrayBuffer[] } {
  if (job.kind === 'climate') {
    const data = climateTextureData(job.slice);
    return { result: data, transfer: [data.buffer as ArrayBuffer] };
  }
  const arrays = buildTileArrays(
    job.key,
    sampleTile(job.key, job.source),
    job.exaggeration,
    job.lowestSeaLevel,
  );
  return { result: arrays, transfer: tileBuffers(arrays) };
}

/** One RG texture on the ice grid: ice distance in red, aridity (resampled) in green. */
export function climateTextureData(s: ClimateSlice): Uint8Array {
  const data = new Uint8Array(ICE_GRID_W * ICE_GRID_H * 2);
  for (let r = 0; r < ICE_GRID_H; r++) {
    const lat = 90 - ((r + 0.5) * 180) / ICE_GRID_H;
    for (let c = 0; c < ICE_GRID_W; c++) {
      const lon = -180 + ((c + 0.5) * 360) / ICE_GRID_W;
      const i = r * ICE_GRID_W + c;
      data[i * 2] = s.ice[i]!;
      data[i * 2 + 1] = Math.round(sampleGrid(s.aridity, ARID_GRID_W, ARID_GRID_H, lat, lon));
    }
  }
  return data;
}
