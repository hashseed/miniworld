// The tree scenes the on-land check samples (onLand.ts), worked out in a worker thread that runs
// the modules as Node loads them, outside the test runner's module transform, which makes the
// scene's hot code several times slower. A pure function of the built tree files: each sampled
// figure as [window, ms, figure id, paddling 0 or 1, lat, lon, x, z] in one Float64Array.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import '../../../data/build/lib/worldTables.ts';
import { msAtDay } from '../time/rate.ts';
import { treeScene, type TreeChunk } from './treeScene.ts';

/** About 30 moments a minute of watching, an odd step so they do not fall on turns. */
const SAMPLE_STEP_MS = 1999;

const { dir, files, start } = workerData as {
  dir: string;
  files: [number, string][];
  start: number;
};
const out: number[] = [];
const clips: string[] = [];
for (const [w, file] of files) {
  const chunk = JSON.parse(readFileSync(join(dir, file), 'utf8')) as TreeChunk;
  const from = msAtDay(chunk.fromDay, start);
  const to = msAtDay(chunk.toDay, start);
  for (let ms = from; ms < to; ms += SAMPLE_STEP_MS)
    for (const f of treeScene(chunk, ms, start).figures) {
      out.push(w, ms, f.id, f.clip === 'paddle' ? 1 : 0, f.lat, f.lon, f.x, f.z);
      clips.push(f.clip);
    }
}
const samples = Float64Array.from(out);
parentPort!.postMessage({ samples, clips }, [samples.buffer]);
