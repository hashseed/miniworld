// The tree of humankind (spec humankind.md, section 3): the tables the data
// build writes and the world query reads. Every ordinary figure came out of a
// lodging and has a parent figure, back to one of the roots.

import type { Day } from '../time/calendar.ts';

/** No value: a figure that is never lost, a lodging that still stands. */
export const NEVER = -1;

export interface TreeFigure {
  id: number;
  /** The figure it came from; NEVER for a root. */
  parent: number;
  /** The day it steps out of its first lodging. */
  born: Day;
  branch: number;
  /** Steps from its root through its parents. */
  depth: number;
  /**
   * Its lodgings over time, as [day, lodging id, spot] from the day it moves in; the
   * spot is its own place at the camp's hearth, free of everyone else's (section 8.1).
   */
  homes: [Day, number, number][];
  /** The day it is lost to an event, or NEVER. */
  lost: Day;
}

export interface TreeLodging {
  id: number;
  camp: number;
  /** Position in whole microdegrees. */
  lat: number;
  lon: number;
  built: Day;
  /** The day it is taken down or abandoned, or NEVER. */
  gone: Day;
  builder: number;
  /** Its place on the ring round the camp's hearth, free of the camp's other lodgings (section 8.1). */
  slot: number;
  /**
   * How far its people can go out on land through each gap between the camp's lodgings,
   * in layout metres, for their outings (section 8.1); 0 where water is close.
   */
  reach: number[];
  /** Asset id of its model, from the architecture set of its culture. */
  kind: string;
  /** Tree cover at its camp's place, 0 to 1, when it was built (section 8.1); the band fells it first. */
  wood?: number;
}

export interface TreeBranch {
  id: number;
  /** The branch it split from; NEVER for a root's branch. */
  parent: number;
  /** The figure that founded it and the day it did. */
  figure: number;
  day: Day;
  /** Why it starts: a root, a migration, a culture or a settlement id. */
  reason: string;
}

/** Key moments of the tree, for the family tree view (section 6.2). */
export type MomentKind = 'root' | 'first-born' | 'camp-founded' | 'camp-moved-away' | 'branch';

export interface TreeMoment {
  day: Day;
  kind: MomentKind;
  figure: number;
  camp: number;
  branch: number;
  /** Position in whole microdegrees. */
  lat: number;
  lon: number;
}

export interface Tree {
  figures: TreeFigure[];
  lodgings: TreeLodging[];
  branches: TreeBranch[];
  moments: TreeMoment[];
}

/** Whether a figure lives on a day: born and not yet lost. */
export function aliveOn(f: TreeFigure, day: Day): boolean {
  return f.born <= day && (f.lost === NEVER || day < f.lost);
}

/** The lodging a figure lives in on a day, or NEVER before it is born. */
export function homeOn(f: TreeFigure, day: Day): number {
  let home = NEVER;
  for (const [from, lodging] of f.homes) {
    if (from > day) break;
    home = lodging;
  }
  return home;
}

/** The figure's line back to its root, nearest first, including itself. */
export function lineage(tree: Tree, id: number): number[] {
  const line: number[] = [];
  for (let f = id; f !== NEVER; f = tree.figures[f]!.parent) line.push(f);
  return line;
}
