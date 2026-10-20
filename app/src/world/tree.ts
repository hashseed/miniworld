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
  /**
   * The ways of its trips to an encounter and home again (sites.md section 4.3), as [day,
   * lodging id, way] of the home it walks to: it walks there along the way instead of the
   * lodging's own.
   */
  walks?: [Day, number, NonNullable<TreeLodging['voyage']>][];
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
  /**
   * How far round its hearth the camp has dry land all round, in layout metres, when it was
   * built (section 8.1): catch is played on a smaller ring where it is short.
   */
  room?: number;
  /** On a steep mountainside: no game of catch on the slope round it (humankind.md section 8.1). */
  steep?: boolean;
  /** Asset id of its model, from the architecture set of its culture. */
  kind: string;
  /** Tree cover at its camp's place, 0 to 1, when it was built (section 8.1); the band fells it first. */
  wood?: number;
  /** The culture profile of its camp (peopling.md section 5.1); its people wear its clothes. */
  culture?: string;
  /**
   * The first lodging of a camp founded across the sea (peopling.md section 6): the crossing's
   * way, [lat, lon] in whole microdegrees, and for each stretch of the trip, from the old camp
   * to the first point, between the points and on to this camp, whether it is paddled.
   */
  voyage?: { id: string; way: [number, number][]; water: boolean[] };
}

/** A red flag at a Neolithic threshold (peopling.md section 3.6). */
export interface TreeFlag {
  /** The threshold's id. */
  id: string;
  camp: number;
  /** The day it goes up, and the day its camp moves away from rising water, or NEVER. */
  day: Day;
  until: Day;
  /** The camp's place in whole microdegrees; settled camps move only away from water. */
  lat: number;
  lon: number;
  /** The lodging slot it stands behind. */
  slot: number;
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
export type MomentKind =
  | 'root'
  | 'first-born'
  | 'camp-founded'
  | 'camp-moved-away'
  | 'branch'
  | 'voyage'
  | 'neolithic-threshold';

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
  /** Red flags at the Neolithic thresholds (peopling.md section 3.6). */
  flags?: TreeFlag[];
  /** Scenes at anchors: cave paintings and burials (humankind.md section 8.2). */
  stages?: TreeStage[];
}

/** A scene at an anchor's camp (humankind.md section 8.2). */
export interface TreeStage {
  /** The anchor's id. */
  id: string;
  kind: 'cave-painting' | 'burial';
  /** Asset id of its prop: the painted wall or the grave. */
  prop: string;
  /** The camp's site key and place in whole microdegrees. */
  camp: number;
  lat: number;
  lon: number;
  /** The lodging place it stands behind, and how far beyond the ring of lodgings, in layout metres. */
  slot: number;
  beyond: number;
  /** Its prop shows from this day: a cave from the start of the timeline, a grave from its burial. */
  shown: Day;
  /** Its sessions come from this day, to the anchor's end. */
  from: Day;
  until: Day;
  /** Its prop stands until this day: a painting to the tree's end, a grave to the anchor's. */
  keep: Day;
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
