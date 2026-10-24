// What the parts of the tree scene share while one scene is made (spec humankind.md section 8):
// the clock, the chunk's memo and the lookups treeScene() builds once per call. Each part takes
// the members it needs; nothing here changes the world.

import type { CampEvent, Place } from './camp.ts';
import type { FigurePose, TreeChunk, TreeScene } from './types.ts';
import type { TreeFigure, TreeLodging, TreeStage } from '../tree.ts';
import type { Itinerary, Leg } from './routes.ts';
import type { Field, Pt } from '../fieldShapes.ts';
import type { ForcedHunt, Memo, Stay, Village } from './memo.ts';
import type { Hunt, PreyKind } from './hunt.ts';
import type { FieldClock } from '../fieldWork.ts';
import type { Outing } from './outings.ts';
import type { LatLon } from './units.ts';

/** The lookups of one call of treeScene(). */
export interface SceneCx {
  appears: Map<number, number>;
  assignedField: (st: Stay, k: number) => number | undefined;
  at: (day: number) => number;
  boneTrip: (
    stage: TreeStage,
    nth: number,
    session: { begin: number; stop: number },
    m: Stay,
    i: number,
    start: number,
    stand: Pt,
    where: { prop: Pt; gap: Pt; pile: Pt; pick: Pt },
  ) => Itinerary;
  builders: Map<number, number[]>;
  chunk: TreeChunk;
  crossing: (
    f: TreeFigure,
    i: number,
  ) =>
    | {
        prev: TreeLodging;
        home: TreeLodging;
        way: { dirX: number; dirZ: number };
        out: Pt[];
        start: number;
        across: number;
        end: number;
        exit: { x: number; z: number };
        entry: { x: number; z: number };
        legs: {
          from: LatLon;
          to: LatLon;
          km: number;
          water: boolean;
          way: { dirX: number; dirZ: number };
        }[];
        km: number;
      }
    | undefined;
  endOfStay: (f: TreeFigure, i: number) => Pt;
  eventOf: (ref: Stay, w: number) => CampEvent | undefined;
  eventPose: (
    ev: CampEvent,
    id: number,
    ms: number,
    base: Pick<FigurePose, 'id' | 'look' | 'lat' | 'lon'>,
  ) => FigurePose;
  events: Map<string, CampEvent | undefined>;
  eventsOf: (st: Stay, from: number, to: number) => CampEvent[];
  fallsIllIn: (id: number, ms: number) => boolean;
  farmOuting: (st: Stay, k: number, turnStart: number) => Outing | undefined;
  fieldClockOf: (camp: number, v: Village) => FieldClock;
  fieldSpot: (st: Stay, k: number) => { field: Field; at: Pt; face: Pt } | undefined;
  forced: Map<string, ForcedHunt | undefined>;
  forcedHunt: (st: Stay, k: number) => ForcedHunt | undefined;
  forcedRound: (stage: TreeStage, round: number) => ForcedHunt | undefined;
  helpedBefore: (hunter: Stay, helper: Stay, from: number, to: number) => boolean;
  huntHeld: (st: Stay, turnStart: number) => boolean;
  huntOf: (st: Stay, k: number) => Hunt | undefined;
  huntPlan: (st: Stay, k: number, party: Stay[], small?: boolean) => Hunt;
  hunts: Map<string, Hunt | undefined>;
  huntsDuring: (st: Stay, from: number, to: number) => boolean;
  huntsOf: (st: Stay, from: number, to: number) => Hunt[];
  jobWorker: (camp: number, slot: number) => number | undefined;
  killAt: (st: Stay, t: number) => Hunt | undefined;
  legPoint: (legs: Leg[], ms: number) => Pt;
  lodgings: Map<number, TreeLodging>;
  mates: (camp: number) => TreeFigure[];
  memo: Memo;
  nearOtherCamp: (st: Stay, p: Pt, t: number) => boolean;
  offsetM: (
    from: { camp: number; lat: number; lon: number },
    to: { camp: number; lat: number; lon: number },
  ) => Pt;
  placeKey: (l: TreeLodging) => string;
  places: Map<string, Place>;
  planEvent: (
    kind: 'catch' | 'dance',
    members: Stay[],
    w: number,
    start: number,
    until: number,
  ) => CampEvent | undefined;
  preyKindOf: (st: Stay, k: number, small?: boolean) => PreyKind;
  sameCamp: (a: Stay, b: Stay) => boolean;
  scene: TreeScene;
  sessionsOf: (stage: TreeStage) => { w: number; start: number; begin: number; stop: number }[];
  soloTurn: (st: Stay, k: number, plain?: boolean) => { go: Outing; trip?: Itinerary | undefined };
  stageEvent: (
    stage: TreeStage,
    w: number,
    start: number,
    until: number,
  ) =>
    | {
        id: string;
        kind: 'burial' | 'paint' | 'celebrate' | 'raise' | 'haul';
        camp: number;
        members: number[];
        a0: number;
        r: number;
        start: number;
        begin: number;
        stop: number;
        end: number;
        legs: Map<number, Leg[]>;
        stands: Pt[];
        face: { x: number; z: number };
      }
    | undefined;
  startDay: number;
  stayAt: (f: TreeFigure, t: number) => Stay | undefined;
  stayOf: (f: TreeFigure, i: number) => Stay | undefined;
  stays: Map<string, Stay | undefined>;
  takeDown: (l: TreeLodging) => number;
  takers: Map<number, number[]>;
  turnOf: (id: number, t: number) => number;
  turnStartOf: (id: number, k: number) => number;
  villageOf: (camp: number) => Village | undefined;
  visitorEvents: (
    stage: TreeStage,
    session: { w: number; start: number; begin: number; stop: number },
  ) => CampEvent[];
  visitsOf: (st: Stay, from: number, to: number) => CampEvent[];
  withHost: (pose: FigurePose, ev: CampEvent, id: number, ms: number) => FigurePose;
}
