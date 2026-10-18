// The pool of terrain workers (spec milestone 1, section 11.5). Tile builds
// wait here until the end of the frame; then the most urgent ones go to a
// worker with fewer than two jobs in hand, and builds no longer asked for
// are dropped. Climate slices are resampled the same way. Without Web
// Workers the jobs run on the main thread at the end of the frame.

import type { ClimateSlice, TerrainTile } from '../content/formats.ts';
import type { TileKey } from '../geo/cube.ts';
import { runJob, type Job, type JobResult } from './terrainJobs.ts';
import type { TileArrays } from './tileArrays.ts';

/** Jobs a worker may hold at once, so urgent tiles never wait behind a long queue. */
const JOBS_PER_WORKER = 2;

/** What the pool needs of a worker; tests pass a fake. */
export interface WorkerLike {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
}

interface Waiting {
  job: Job;
  priority: number;
  /** Frame in which the job was last asked for; tile jobs not asked for again are dropped. */
  frame: number;
  resolve?: (r: JobResult) => void;
}

interface Slot {
  worker: WorkerLike;
  busy: number;
}

export class TerrainWorkers {
  private slots: Slot[] = [];
  private waiting = new Map<string, Waiting>();
  private running = new Map<number, { id: string; slot: Slot | undefined; w: Waiting }>();
  private done = new Map<string, TileArrays>();
  private nextId = 1;
  private frame = 0;

  /** Starts `count` workers; with none, jobs run on the main thread. */
  constructor(workers: WorkerLike[]) {
    for (const worker of workers) {
      const slot: Slot = { worker, busy: 0 };
      worker.onmessage = (e: MessageEvent<{ id: number; result: JobResult }>) =>
        this.finish(e.data.id, e.data.result);
      this.slots.push(slot);
    }
  }

  /**
   * A tile's vertex data once built; until then the build is queued (or kept
   * queued) for this frame at the given priority, lower being more urgent.
   */
  tile(
    id: string,
    key: TileKey,
    source: TerrainTile | 'deep',
    exaggeration: number,
    lowestSeaLevel: number,
    priority: number,
  ): TileArrays | undefined {
    const ready = this.done.get(id);
    if (ready) {
      this.done.delete(id);
      return ready;
    }
    const w = this.waiting.get(id);
    if (w) {
      w.priority = priority;
      w.frame = this.frame;
    } else if (!this.isRunning(id)) {
      this.waiting.set(id, {
        job: { kind: 'tile', key, source, exaggeration, lowestSeaLevel },
        priority,
        frame: this.frame,
      });
    }
    return undefined;
  }

  /** The RG climate texture of a slice (terrainJobs.ts), resampled off the main thread. */
  climate(id: string, slice: ClimateSlice, priority: number): Promise<Uint8Array> {
    return new Promise((resolve) => {
      this.waiting.set(`climate:${id}`, {
        job: { kind: 'climate', slice },
        priority,
        frame: Infinity,
        resolve: resolve as (r: JobResult) => void,
      });
    });
  }

  /** Ends a frame: drops tile builds not asked for and sends the most urgent jobs out. */
  endFrame(): void {
    for (const [id, w] of this.waiting) if (w.frame < this.frame) this.waiting.delete(id);
    this.frame++;
    if (this.waiting.size === 0) return;
    const order = [...this.waiting].sort((a, b) => a[1].priority - b[1].priority);
    for (const [id, w] of order) {
      const slot = this.freeSlot();
      if (slot === null) break;
      this.waiting.delete(id);
      const n = this.nextId++;
      this.running.set(n, { id, slot, w });
      if (slot) {
        slot.busy++;
        // Structured clone copies the inputs; only results are transferred.
        slot.worker.postMessage({ id: n, job: w.job }, []);
      } else this.finish(n, runJob(w.job).result);
    }
  }

  /** Jobs waiting or running, for the first view and stats. */
  get pending(): number {
    return this.waiting.size + this.running.size;
  }

  /** A worker with room, undefined to run on the main thread, or null when all are busy. */
  private freeSlot(): Slot | undefined | null {
    if (this.slots.length === 0) return undefined;
    let best: Slot | null = null;
    for (const s of this.slots)
      if (s.busy < JOBS_PER_WORKER && (!best || s.busy < best.busy)) best = s;
    return best;
  }

  private isRunning(id: string): boolean {
    for (const r of this.running.values()) if (r.id === id) return true;
    return false;
  }

  private finish(n: number, result: JobResult): void {
    const r = this.running.get(n);
    if (!r) return;
    this.running.delete(n);
    if (r.slot) r.slot.busy--;
    if (r.w.resolve) r.w.resolve(result);
    else this.done.set(r.id, result as TileArrays);
  }
}

/** The pool for this device: two workers where there are cores to spare, else one. */
export function startTerrainWorkers(): TerrainWorkers {
  if (typeof Worker === 'undefined') return new TerrainWorkers([]);
  const count = (navigator.hardwareConcurrency ?? 2) >= 6 ? 2 : 1;
  const workers = Array.from(
    { length: count },
    () => new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' }),
  );
  return new TerrainWorkers(workers);
}
