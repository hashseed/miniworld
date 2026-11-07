// The foliage worker (spec foliage.md, section 7): keeps the foliage slices the app sends it
// and, asked for a slot tile with its terrain samples, works out where its plants stand with
// placePlants, the same function the app runs itself, and posts them back. It also makes
// the ground tint of each slice it receives (groundTint, section 6) and posts the bytes back,
// transferred, so the main thread does not spend a frame on it.

import type { FoliageSlice } from '../content/formats.ts';
import type { TileKey } from '../geo/cube.ts';
import { placePlants, type Plant } from './foliagePlace.ts';
import { groundTint } from './groundTint.ts';
import type { TileSamples } from './terrainStore.ts';

/** What the app sends: a slice, or a tile to place plants on. */
export type FoliageMessage =
  | { type: 'slice'; k: number; slice: FoliageSlice }
  | {
      type: 'place';
      id: string;
      key: TileKey;
      samples: TileSamples;
      ka: number;
      kb: number;
      t: number;
      seaLevel: number;
      glacialIndex: number;
    };

/** What the worker answers: a slice's ground tint, or a tile's plants. */
export type FoliageAnswer =
  | { type: 'ground'; k: number; tint: Uint8Array }
  | { type: 'plants'; id: string; plants: Plant[] | undefined };

const slices = new Map<number, FoliageSlice>();

self.onmessage = (e: MessageEvent<FoliageMessage>) => {
  const m = e.data;
  if (m.type === 'slice') {
    slices.set(m.k, m.slice);
    const tint = groundTint(m.slice);
    (self as unknown as Worker).postMessage(
      { type: 'ground', k: m.k, tint } satisfies FoliageAnswer,
      [tint.buffer],
    );
    return;
  }
  const [sa, sb] = [slices.get(m.ka), slices.get(m.kb)];
  const plants =
    sa && sb ? placePlants(m.key, m.samples, m.seaLevel, m.glacialIndex, sa, sb, m.t) : undefined;
  (self as unknown as Worker).postMessage({
    type: 'plants',
    id: m.id,
    plants,
  } satisfies FoliageAnswer);
};
