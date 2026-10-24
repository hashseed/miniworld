// The scene worker gets each chunk as a structured-clone copy and computes on a fresh memo,
// while the main thread keeps its memo warm across frames (humankind.md section 8). Neither
// may change the scene: it is a pure function of the chunk and the clock (spec section 9).

import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, TIMELINE_START } from '../time/calendar.ts';
import { msAtDay } from '../time/rate.ts';
import { encodeMask, MASK_RINGS, MASK_SECTORS } from './fieldMask.ts';
import { NEVER, type TreeFigure, type TreeLodging } from './tree.ts';
import { treeScene, type TreeChunk } from './treeScene.ts';

const d0 = TIMELINE_START;
const years = (y: number) => Math.round(y * DAYS_PER_YEAR);
const land = encodeMask(new Array<boolean>(MASK_RINGS * MASK_SECTORS).fill(true));

/** Hunter-gatherer camps of several cultures, a farming village and a herders' camp. */
function chunk(): TreeChunk {
  const camps: Partial<TreeLodging>[] = [
    { culture: 'african-stone-age' },
    { culture: 'ice-age-hunter' },
    { culture: 'first-australians' },
    { culture: 'lbk-farmer', fieldLand: land },
    { herding: true },
  ];
  const figures: TreeFigure[] = [];
  const lodgings: TreeLodging[] = [];
  camps.forEach((c, camp) => {
    for (let s = 0; s < 3; s++) {
      const id = lodgings.length;
      lodgings.push({
        id,
        camp,
        lat: 10_000_000 + camp * 4_000_000,
        lon: 20_000_000 + camp * 5_000_000,
        built: d0 + years(s * 40),
        gone: s === 2 ? d0 + years(900) : NEVER,
        builder: figures.length,
        slot: s,
        reach: [80, 60, 40, 80, 70],
        kind: 'hut',
        ...c,
      });
      for (let p = 0; p < 3; p++)
        figures.push({
          id: figures.length,
          parent: figures.length ? figures.length - 1 : NEVER,
          born: d0 + years(s * 40 + p * 15),
          branch: camp,
          depth: p,
          homes: [[d0 + years(s * 40 + p * 15), id, p + s * 3]],
          lost: NEVER,
        });
    }
  });
  // Every third figure moves on to the next camp after 500 years, the herders' camp by canoe,
  // so the walks and crossings between camps are in the scene too.
  const first = (camp: number) => lodgings.find((l) => l.camp === camp)!;
  figures.forEach((f, i) => {
    if (i % 3) return;
    const camp = lodgings.find((l) => l.id === f.homes[0]![1])!.camp;
    const to = first((camp + 1) % camps.length);
    f.homes.push([d0 + years(500 + (i % 7) * 30), to.id, 20 + (i % 9)]);
  });
  const boat = first(camps.length - 1);
  boat.voyage = {
    id: 'crossing',
    way: [[boat.lat - 1_000_000, boat.lon - 2_000_000]],
    water: [false, true],
  };
  return { fromDay: d0, toDay: d0 + years(10000), figures, lodgings };
}

const times = [100, 520, 560, 640].flatMap((y) =>
  Array.from({ length: 8 }, (_, k) => msAtDay(d0 + years(y), d0) + k * 7_919 + (k % 5) * 61_000),
);

describe('the tree scene', () => {
  it('is the same on a structured-clone copy with a fresh memo as on a warm one', () => {
    const warm = chunk();
    for (const ms of times) {
      const main = treeScene(warm, ms, d0);
      const worker = treeScene(structuredClone(warm), ms, d0);
      expect(structuredClone(worker)).toEqual(structuredClone(main));
    }
  });

  it('does not depend on the order frames were asked for', () => {
    const forward = chunk();
    const backward = chunk();
    const a = times.map((ms) => treeScene(forward, ms, d0));
    const b = [...times].reverse().map((ms) => treeScene(backward, ms, d0));
    expect(b.reverse()).toEqual(a);
  });
});
