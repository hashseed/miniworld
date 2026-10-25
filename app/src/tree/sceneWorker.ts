// The camp scene worker (spec humankind.md, section 8): keeps the tree files the app sends
// it and, asked for a time and the camera's side of the globe, works out the camp scene
// there with treeScene, the same function the app runs itself, and posts it back.

import { latLonToDir } from '../geo/cube.ts';
import { FarmingGrid, setFarmingGrid } from '../world/farmingOnset.ts';
import { setWorldTables, type WorldTables } from '../world/tables.ts';
import { treeScene, type TreeChunk } from '../world/treeScene.ts';

/** What the app sends: a tree file, a file to forget, or a request for a scene. */
export type SceneMessage =
  | { type: 'chunk'; w: number; chunk: TreeChunk }
  | { type: 'drop'; w: number }
  | { type: 'farming'; bytes: Uint8Array }
  | { type: 'tables'; tables: WorldTables }
  | {
      type: 'scene';
      id: number;
      w: number;
      ms: number;
      startDay: number;
      /** The camera's direction from the globe's centre, and the cosine of the angle around it in view. */
      camDir: [number, number, number];
      cosLimit: number;
    };

const chunks = new Map<number, TreeChunk>();

self.onmessage = (e: MessageEvent<SceneMessage>) => {
  const m = e.data;
  if (m.type === 'chunk') chunks.set(m.w, m.chunk);
  else if (m.type === 'drop') chunks.delete(m.w);
  else if (m.type === 'farming') setFarmingGrid(new FarmingGrid(m.bytes));
  else if (m.type === 'tables') setWorldTables(m.tables);
  else {
    const chunk = chunks.get(m.w);
    const [cx, cy, cz] = m.camDir;
    const near = (lat: number, lon: number) => {
      const [x, y, z] = latLonToDir(lat, lon);
      return x * cx + y * cy + z * cz >= m.cosLimit;
    };
    const scene = chunk ? treeScene(chunk, m.ms, m.startDay, near) : undefined;
    (self as unknown as Worker).postMessage({ id: m.id, w: m.w, ms: m.ms, scene });
  }
};
