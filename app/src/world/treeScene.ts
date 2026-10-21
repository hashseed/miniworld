// What the tree of humankind shows at a clock time (spec humankind.md,
// section 8.1): the hearths and lodgings of the camps standing, and every
// figure at its spot, coming out of its lodging, building or taking down a
// lodging, off gathering or hunting, or walking to a new home. A pure
// function of the tree chunk and the clock time.

import { hash01, hash32 } from '../core/hash.ts';
import { detAtan2, detCos, detSin, RAD } from '../core/detmath.ts';
import { dayAtMs, msAtDay } from '../time/rate.ts';
import { astronomicalYear, dayOfYearStart, type Day } from '../time/calendar.ts';
import { NEVER, type TreeFigure, type TreeFlag, type TreeLodging, type TreeStage } from './tree.ts';

/** One time window's share of the tree (section 8). */
export interface TreeChunk {
  fromDay: Day;
  toDay: Day;
  figures: TreeFigure[];
  lodgings: TreeLodging[];
  /** Red flags standing in the chunk's time (peopling.md section 3.6). */
  flags?: TreeFlag[];
  /** Scenes at anchors standing in the chunk's time (humankind.md section 8.2). */
  stages?: TreeStage[];
}

/**
 * Drawn kilometres per life-size metre of a figure: 1.7 times a vignette's 50 (milestone 2,
 * section 5.1; Yang, 2026-10-18: "make the humans and their buildings/fire places 70% larger").
 */
export const FIGURE_KM_PER_M = 72.25;
/**
 * Figures act this many times faster than life: their clips play faster and they cover
 * ground faster, so the feet still do not slide (Yang, 2026-10-18: livelier camps).
 */
export const TEMPO = 3.6;
/** A figure's walking pace in life-size metres per second, matching the walk clip's stride. */
export const WALK_M_PER_S = 1.2;
/** Running and carrying paces, matching those clips' strides at the same leg length. */
const RUN_M_PER_S = 4.2;
const CARRY_M_PER_S = 0.87;
/** The camp layout is drawn three times smaller than the figures (milestone 2, section 5.1). */
export const LAYOUT_KM_PER_M = FIGURE_KM_PER_M / 3;
/** Drawn kilometres a figure covers per millisecond of watching. */
const WALK_KM_PER_MS = (TEMPO * WALK_M_PER_S * FIGURE_KM_PER_M) / 1000;
/** Layout metres covered per millisecond of watching, by clip. */
const PACE: Record<
  'walk' | 'run' | 'carry' | 'pole' | 'crouch' | 'bearBehind' | 'bearAhead',
  number
> = {
  walk: (WALK_M_PER_S * 3 * TEMPO) / 1000,
  run: (RUN_M_PER_S * 3 * TEMPO) / 1000,
  carry: (CARRY_M_PER_S * 3 * TEMPO) / 1000,
  pole: (CARRY_M_PER_S * 3 * TEMPO) / 1000,
  bearBehind: (CARRY_M_PER_S * 3 * TEMPO) / 1000,
  bearAhead: (CARRY_M_PER_S * 3 * TEMPO) / 1000,
  crouch: (WALK_M_PER_S * 0.55 * 3 * TEMPO) / 1000,
};
/**
 * Lodgings stand this far from the hearth, in layout metres; lodgings are drawn at
 * figure size, three times the layout, so the ring keeps them clear of the people.
 */
export const LODGING_RING_M = 12;
/** Places for lodgings round a hearth, evenly spaced so lodgings never overlap. */
export const LODGING_SLOTS = 5;
/** Spots for figures at a hearth: an inner ring and an outer ring, spaced so figures never overlap. */
export const INNER_SPOTS = 8;
const INNER_M = 5;
const OUTER_SPOTS = 12;
const OUTER_M = 8.5;
export const HEARTH_SPOTS = INNER_SPOTS + OUTER_SPOTS;
const INNER_ORDER = [0, 4, 2, 6, 1, 5, 3, 7];
const OUTER_ORDER = [0, 6, 3, 9, 1, 7, 4, 10, 2, 8, 5, 11];
/** Paths keep this far from the middle of the hearth, in layout metres, so nobody walks through the fire. */
const FIRE_CLEAR_M = 3;
/** Figures leave and enter a camp at this distance from its hearth, between the people and the lodgings. */
const GATE_M = 7;
/** The farthest out anyone goes, in layout metres; the build measures land this far out. */
export const MAX_OUTING_M = 50;
/**
 * The build needs land all round a camp spot out to this many layout metres, past the inner
 * ring of people's spots, which a band of three to five never outgrows (peopling.md
 * section 4: coastal camps). Catch, on its wider ring, is played only where the land goes
 * further.
 */
export const CAMP_ROOM_M = INNER_M + 2;
/** Figures change between idle and work every 20 to 40 seconds of life, sped up by TEMPO. */
const ACTIVITY_MIN_MS = 20_000 / TEMPO;
const ACTIVITY_SPREAD_MS = Math.round(20_000 / TEMPO);
/** Each figure plans its day in turns of this long: an outing, a stroll or a rest. */
const TURN_MS = 60_000 / TEMPO;
/** Camp life (section 8.1): how long each activity's work at its place lasts. */
const FIREWOOD_M = 20;
const BREAK_MS = Math.round(7200 / TEMPO);
const FILL_MS = Math.round(5400 / TEMPO);
/** Fishing at the water's edge: watching with the spear raised, and each stab down. */
const FISH_WATCH_MS = Math.round(5400 / TEMPO);
const FISH_STAB_MS = Math.round(2400 / TEMPO);
const SCRAPE_MS = Math.round(14_400 / TEMPO);
/** Skinning a kill, hanging its hide on the rack, and taking a dried one down (section 8.1). */
const FLAY_MS = Math.round(9000 / TEMPO);
const HANG_HIDE_MS = Math.round(4800 / TEMPO);
const TAKE_HIDE_MS = Math.round(4800 / TEMPO);
const CRACK_MS = Math.round(14_400 / TEMPO);
const KNAP_POINT_MS = Math.round(10_800 / TEMPO);
const BIND_POINT_MS = Math.round(7200 / TEMPO);
const BUTCHER_MEAT_MS = Math.round(7200 / TEMPO);
const ROAST_MS = Math.round(14_400 / TEMPO);
const INSIDE_MS = Math.round(14_400 / TEMPO);
/**
 * The layout offset of a figure on its way between camps, on leg `n` at `u` of it and `t` of
 * the whole way: from the old camp's edge to the new camp's when there is one leg, else
 * from the old camp's edge to nothing on the first leg and from nothing to the new camp's
 * edge on the last, so the figure keeps to the route's way in between.
 */
function edgeOffset(
  c: { exit: Pt; entry: Pt; legs: unknown[] },
  n: number,
  u: number,
  t: number,
): Pt {
  if (c.legs.length === 1)
    return { x: c.exit.x + (c.entry.x - c.exit.x) * t, z: c.exit.z + (c.entry.z - c.exit.z) * t };
  if (n === 0) return { x: c.exit.x * (1 - u), z: c.exit.z * (1 - u) };
  if (n === c.legs.length - 1) return { x: c.entry.x * u, z: c.entry.z * u };
  return { x: 0, z: 0 };
}

/**
 * A band on its way walks as a loose group, not on one line (Yang, 2026-10-20: "multiple
 * people bunched together"): by its spot at the new camp, each walker leaves and comes in
 * GROUP_SIDE_M (layout metres) to one side of the camps' gates, in the middle or to the
 * other side, and walks in rows of three GROUP_BACK_M apart, the rows forming over the first
 * GROUP_FADE of the way and closing up over the last.
 */
const GROUP_SIDE_M = 2.2;
const GROUP_BACK_M = 3;
const GROUP_FADE = 0.1;
/** Walkers keep within this of the way's line in layout metres on the open way, inside the 15 km a link is checked. */
const GROUP_WAY_SIDE_M = 0.45;
function groupOffset(
  p: Pt,
  way: { dirX: number; dirZ: number },
  spot: number,
  t: number,
  km: number,
  side = 0,
): Pt {
  const fade = Math.max(0, Math.min(1, t / GROUP_FADE, (1 - t) / GROUP_FADE));
  // Never further behind than a twentieth of the walk: less than the way covered while the
  // rows form, so nobody walks backwards on a short walk.
  const back = Math.min(Math.floor(spot / 3) * GROUP_BACK_M, (0.05 * km) / LAYOUT_KM_PER_M) * fade;
  // On the open way walkers close in to within GROUP_WAY_SIDE_M of the line, the strip a
  // link is checked for water (sites.md section 3); they spread out again near the camps.
  const across = p.x * -way.dirZ + p.z * way.dirX + side;
  const capped = Math.max(-GROUP_WAY_SIDE_M, Math.min(GROUP_WAY_SIDE_M, across));
  const shift = across + (capped - across) * fade - (across - side);
  return {
    x: p.x - way.dirX * back - way.dirZ * shift,
    z: p.z - way.dirZ * back + way.dirX * shift,
  };
}

/** A red flag stands this far from the hearth, behind a lodging and its rack (peopling.md section 3.6). */
const FLAG_R = 24;
/** Walks reach a lodging's door this far in front of its middle, before crouching in. */
export const HUT_DOOR_M = 4.8;
/**
 * Camp events (section 8.1): catch and dancing last EVENT_MS once everyone is in place.
 * Children run round a ring CATCH_R from the hearth at a little over half a run, "it"
 * catching the next every CHASE_MS; dancers turn slowly on a ring DANCE_R round the fire.
 */
const EVENT_MS = Math.round(36_000 / TEMPO);
const CHASE_MS = Math.round(9000 / TEMPO);
const CATCH_R = 7;
const DANCE_R = 4.5;
const CATCH_SHARE = 1 / 3;
const DANCE_SHARE = 1 / 6;
/**
 * A lodging's drying rack stands behind it, this far from the hearth, out of every lane,
 * and whoever scrapes a hide works from behind it, facing in (Yang, 2026-10-19: a kill
 * carried through a hide hung out to dry).
 */
export const RACK_R = 18;
/** The scraper stands this far behind the rack, and walks round its end this far along it. */
export const SCRAPE_BACK_M = 2;
export const SCRAPE_SIDE_M = 5.6;
/** How long gatherers pick, hunters butcher and strollers look about at the far end. */
const GATHER_MS = Math.round(9000 / TEMPO);
const BUTCHER_MS = Math.round(4000 / TEMPO);
const LOOK_MS = Math.round(4000 / TEMPO);
/**
 * Prey of a hunt grazes this far out in its hunter's lane, flees to this far when the hunter
 * runs at it and falls there; the hunter stops short of it to butcher (layout metres).
 */
const PREY_GRAZE_M = 34;
const PREY_FALL_M = 40;
const PREY_REACH_M = PREY_FALL_M + 4;
/** Gatherers pick this far out (layout metres). */
const GATHER_M = 22;
/** Prey fades in when the hunter sets out and out once the meat is carried off. */
const PREY_FADE_MS = 400;
/** The animals the first people hunt (wildlife.md section 6 models). */
type PreyKind =
  | 'animal-zebra'
  | 'animal-eland'
  | 'animal-gazelle'
  | 'animal-kangaroo'
  | 'animal-reindeer'
  | 'animal-guanaco'
  | 'animal-mammoth'
  | 'animal-aurochs';
/** What each culture hunts (peopling.md sections 5.5 and 9.1); the founder's people hunt zebra and eland. */
const PREY_OF: Record<string, readonly PreyKind[]> = {
  'african-stone-age': ['animal-zebra', 'animal-eland'],
  'coastal-asia-hunter': ['animal-gazelle'],
  // Aurochs, the wild cattle of Europe, the Near East and North Africa (Yang, 2026-10-20).
  'west-asia-hunter': ['animal-gazelle', 'animal-aurochs'],
  'east-asia-hunter': ['animal-gazelle'],
  natufian: ['animal-gazelle', 'animal-aurochs'],
  'first-australians': ['animal-kangaroo'],
  'ice-age-hunter': ['animal-reindeer', 'animal-aurochs', 'animal-mammoth'],
  'steppe-beringia-hunter': ['animal-reindeer', 'animal-mammoth'],
  'first-americans': ['animal-guanaco'],
};
/**
 * Hunts (section 8.1): the hunter throws from this far short of the animal (layout
 * metres; about 5 life-size metres at the figures' scale, so the flight reads), and a
 * missed spear sticks this far beyond it, a little to the side; the animal bolts this far.
 */
const THROW_GAP_M = 16;
const MISS_BEYOND_M = 5;
const MISS_SIDE_M = 1.6;
/** About one throw in three misses (section 8.1). */
const MISS_SHARE = 0.35;
/** The throw clip runs this long; the spear leaves the hand at THROW_RELEASE (0.55 s of clip). */
const THROW_MS = Math.ceil(1600 / TEMPO);
const RELEASE_MS = Math.round(550 / TEMPO);
/** A spear is in the air this long. */
const FLIGHT_MS = 600;
/** It leaves the hand this high and lands this high in the animal, in life-size metres. */
const HAND_H = 1.7;
const HIT_H = 1.05;
/** The arc of a flight rises by this share of its length at the figures' scale. */
const SPEAR_ARC = 0.18;
/** The animal runs from the missed spear for this long. */
const BOLT_MS = 450;
/** A hunter pulls a missed spear out of the ground over this long. */
const PICK_MS = Math.round(1200 / TEMPO);
/** Hunter and helper kneel this far to either side of the kill, and bind it for BIND_SECONDS. */
const KNEEL_SIDE_M = 3.5;
const BIND_MS = Math.ceil(2400 / TEMPO);
/**
 * Half the length of the carrying pole in layout metres (1.6 life-size metres at the figures'
 * scale), and how long lifting it and laying it down take.
 */
export const POLE_HALF_M = 4.5;
const LIFT_MS = Math.round(1200 / TEMPO);
const PUT_MS = Math.round(1200 / TEMPO);
/**
 * Height of the pole on the carriers' shoulders and of its middle lying on the ground, in
 * life-size metres (POLE_HEIGHT in assets/src/clips.ts, POLE_R in assets/src/shelters.ts).
 */
export const POLE_ON_SHOULDERS_M = 1.42;
export const POLE_ON_GROUND_M = 0.045;
/** The kill is carried to here in the hunter's gap, between the people and the lodgings. */
const DROP_M = 14;
/** It lies there this long before it fades away. */
const DROP_LINGER_MS = Math.round(40_000 / TEMPO);
/** Trees make way this far round points of a hunt's lane, in drawn kilometres. */
const HUNT_CLEARING_KM = 8 * LAYOUT_KM_PER_M;
/**
 * The hunted animal and one or two of its herd walk in from the treeline at the far end of
 * the hunter's lane (Yang, 2026-10-19: animals appeared out of thin air), at this pace in
 * layout metres per millisecond, a little apart; they graze this long before the hunter
 * throws, and the companions bolt back to the trees when the spear lands.
 */
const PREY_WALK = (WALK_M_PER_S * 2.4 * TEMPO) / 1000;
const HERD_SIDE_M = 3.5;
const GRAZE_FIRST_MS = Math.round(1500 / TEMPO);
/**
 * The hunted animal comes out of the trees this long before the hunters set out, and grazes,
 * so it is seen in its place before the hunt (Yang, 2026-10-20: "they should spawn and roam
 * for some time before being hunted").
 */
const ROAM_MS = Math.round(30_000 / TEMPO);
/** A hunted animal keeps this far from another camp's hearth, where its people are (layout m). */
const OTHER_CAMP_M = 25;
/**
 * The survivors scatter to their own spots aside, stand there looking back for this long and
 * more by hash, and fade one by one (Yang, 2026-10-19: they should not fade right away).
 */
const SCATTER_LINGER_MS = Math.round(10_000 / TEMPO);
const SCATTER_MORE_MS = Math.round(10_000 / TEMPO);
/**
 * Mammoth hunts (Yang, 2026-10-19: "implement mammoth hunting"): a mammoth is far too big
 * for the pole, so hunter and helper butcher it where it falls and carry the meat home, and
 * its remains lie there a while. Being large, it grazes further out, the hunter throws from
 * further off and the herd keeps further apart; only in lanes with land to MAX_OUTING_M, and
 * only while mammoths lived on the mainland, to 10,000 BCE (wildlife.md section 2).
 */
const MAMMOTH = {
  /** The hunting party: the hunter and up to three more; at least two more are needed. */
  party: 4,
  /** Across the lane between the party's throwers, and between their throws (layout m, ms). */
  spread: 4.5,
  throwEvery: Math.round(2200 / TEMPO),
  graze: 38,
  fall: 42,
  gap: THROW_GAP_M + 5,
  kneel: 7,
  herdSide: 9,
  reach: MAX_OUTING_M,
  butcher: Math.round(7000 / TEMPO),
  remains: Math.round(20_000 / TEMPO),
};
const MAMMOTH_UNTIL: Day = dayOfYearStart(astronomicalYear(10_000, 'BCE'));

/** Clip changes ease over this long (milestone 2, section 5.3). */
export const BLEND_MS = 350;
/** The band takes this long to build a new lodging, about a year of history. */
export const BUILD_MS = Math.round(8000 / TEMPO);
/** And this long to take one down before it leaves. */
export const TAKE_DOWN_MS = Math.round(5000 / TEMPO);
/** Builders stand this far from the middle of the lodging they build, in layout metres. */
export const BUILD_RING_M = 5;
/**
 * The trees of a place wither over THIN_MS before its band arrives, planned from the tree
 * (sites.md section 6), and grow back over REGROW_MS (about five years) after it leaves.
 */
export const THIN_MS = 10_000;
export const REGROW_MS = 12_000;
/** A new camp (section 8.1): the first builder lights the fire with flint stones for FLINT_MS before building. */
const FLINT_MS = Math.round(9000 / TEMPO);
/** The lighter kneels this far from the middle of the hearth, just outside the paths' clearance. */
const LIGHT_M = 3.1;
/** Plants keep this far from a hearth while the camp stands, in drawn kilometres. */
export const CAMP_CLEARING_KM = (LODGING_RING_M + 6) * LAYOUT_KM_PER_M;
/**
 * Wild animals keep this far from a hearth while its camp stands, in drawn kilometres
 * (wildlife.md section 4): the lodgings' ring, a lodging's width and a margin.
 */
export const CAMP_KEEP_OUT_KM = (LODGING_RING_M + 8) * LAYOUT_KM_PER_M;
/** Moves shorter than this are within the camp and not walked. */
const SAME_PLACE_KM = 1;
const KM_PER_DEG = 111.195;

export type FigureLook = 'founder' | 'woman' | 'man' | 'child';
export type TreeClip =
  | 'idle'
  | 'work'
  // At a cave painting; falling ill and dying before a burial (section 8.2).
  | 'paint'
  | 'ill'
  | 'lie'
  | 'sit'
  // Telling a story by the fire (section 8.1).
  | 'point'
  | 'knap'
  | 'walk'
  | 'run'
  | 'carry'
  | 'throw'
  | 'pole'
  | 'bearBehind'
  | 'bearAhead'
  | 'strike'
  | 'crouch'
  | 'dance'
  | 'scrape'
  | 'crack'
  | 'paddle';

/** A point of the scene: a place on the globe, and an offset there in layout metres east and north. */
export interface Placed {
  lat: number;
  lon: number;
  x: number;
  z: number;
  /** Facing, east and north. */
  dirX: number;
  dirZ: number;
}

export interface FigurePose extends Placed {
  id: number;
  look: FigureLook;
  clip: TreeClip;
  clipMs: number;
  /** The clip being eased out of, while a change is under way. */
  from?: { clip: TreeClip; clipMs: number; weight: number };
  /** The hand is empty: the figure's spear is in the air, in the prey or in the grass. */
  unarmed?: boolean;
  /** Inside its hut, out of sight (section 8.1). */
  hidden?: boolean;
  /** The culture whose clothes it wears (peopling.md section 5.3); the founder's when not given. */
  profile?: string;
  /** A dead's soul (section 8.2): how far it shows, 0 to 1, and how high it floats, in life-size metres. */
  soul?: { fade: number; height: number };
  /** Held up off the ground by its bearers, in life-size metres (a dead carried to its grave). */
  lift?: number;
}

export type PreyClip = 'idle' | 'walk' | 'run' | 'fall' | 'bound' | 'hung' | 'struggle';

/** An animal of a hunt: it grazes, flees when the hunter runs at it, falls and is butchered. */
export interface PreyPose extends Placed {
  /** The hunter's id and the turn of the hunt, unique while it is shown. */
  id: string;
  kind: PreyKind;
  clip: PreyClip;
  clipMs: number;
  /** 0 to 1, fading in and out. */
  visibility: number;
}

export interface LodgingPose extends Placed {
  id: number;
  kind: string;
  /** 0 to 1: how far it is put up, while the band builds it or takes it down. */
  built: number;
}

export interface HearthPose {
  camp: number;
  lat: number;
  lon: number;
  /** 0 before the fire is lit at a new camp, rising to 1 as it catches (section 8.1). */
  lit: number;
}

/** A spark from the flint stones of a fire being lit: layout point, height in life-size metres, 0 to 1 of its life. */
export interface SparkPose {
  lat: number;
  lon: number;
  x: number;
  z: number;
  height: number;
  life: number;
}

/** A prop of camp life at a layout point: a drying rack beside a lodging, a spit over the fire. */
export interface CampPropPose extends Placed {
  id: string;
  /** A drying rack, the spit, a canoe, a red flag, or a scene's wall or grave (section 8.2). */
  kind: string;
  /** 0 to 1: how far a scene's prop has grown in, painted or filled. */
  built?: number;
  /** A share of its full size, for a scene's prop at a smaller camp. */
  scale?: number;
  /** Whether a cave's torch is lit. */
  lit?: boolean;
  /** 0 to 1: how far a scene's hill or heap of earth has risen out of the ground. */
  rise?: number;
  /** 0 to 1: how far a cave's painting shows, fading before the cave sinks back. */
  paint?: number;
  /** 0 to 1: how far a prop has faded, 1 drawn in full: the dead's skull. */
  fade?: number;
  /** Height above the ground in life-size metres: the dead's skull rising. */
  height?: number;
}

/** Where the trees make way for a camp: 1 cleared, 0 grown back. */
export interface ClearingPose {
  lat: number;
  lon: number;
  amount: number;
  /** True while the trees are being felled, false while they grow back. */
  felling: boolean;
  /** Off the hearth in layout metres, and the radius in drawn kilometres, for a hunt's ground. */
  x?: number;
  z?: number;
  km?: number;
}

/** A hunter's spear away from his hand: its middle, height above the ground in life-size metres, and pitch. */
export interface SpearPose extends Placed {
  id: string;
  height: number;
  /** Rise per unit along (dirX, dirZ), tip first; negative points down. */
  slope: number;
}

/** The carrying pole of a hunt: its middle, and its height above the ground in life-size metres. */
export interface PolePose extends Placed {
  id: string;
  height: number;
}

export interface TreeScene {
  figures: FigurePose[];
  prey: PreyPose[];
  spears: SpearPose[];
  poles: PolePose[];
  sparks: SparkPose[];
  props: CampPropPose[];
  lodgings: LodgingPose[];
  hearths: HearthPose[];
  clearings: ClearingPose[];
}

/** The look of a figure: the first person keeps hers; the others are women, men and children. */
export function lookOf(id: number): FigureLook {
  if (id === 0) return 'founder';
  return (['woman', 'man', 'child'] as const)[hash32(id, 31) % 3]!;
}

const deg = (micro: number) => micro / 1e6;

/** Degrees east from one longitude to another, the short way round, across the date line too. */
const eastOf = (from: number, to: number): number => {
  const d = to - from;
  return d > 180 ? d - 360 : d < -180 ? d + 360 : d;
};
/** A longitude brought back between -180 and 180. */
const wrapLon = (lon: number): number => (lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon);

/** A place in degrees. */
interface LatLon {
  lat: number;
  lon: number;
}

function kmBetween(a: LatLon, b: LatLon): number {
  const x = eastOf(a.lon, b.lon) * detCos(((a.lat + b.lat) / 2) * RAD);
  const y = b.lat - a.lat;
  return Math.sqrt(x * x + y * y) * KM_PER_DEG;
}

const placeOf = (l: TreeLodging): LatLon => ({ lat: deg(l.lat), lon: deg(l.lon) });

interface Pt {
  x: number;
  z: number;
}

/**
 * Sites from this id on have a compact camp, and from MINIMAL_SITE on a minimal one (sites.md
 * section 2): land too small for a full camp where a band must stand, so its huts stand closer
 * to the fire, its people on one ring, with no drying racks and no catch. The camp's own id
 * tells, so the scene needs nothing else.
 */
export const COMPACT_SITE = 1_000_000;
export const MINIMAL_SITE = 2_000_000;
export const isCompact = (camp: number): boolean => camp >= COMPACT_SITE;

/** A camp's layout, in layout metres: hut ring, people's ring, door, core, gate, flag, dancers, builders, and people at most. */
export interface Layout {
  ring: number;
  inner: number;
  door: number;
  core: number;
  gate: number;
  flag: number;
  dance: number;
  build: number;
  people: number;
  /** Walks keep this far from a lodging's middle. */
  clear: number;
  /** Rings round a lodging's middle, out to its door, that must be dry, in layout metres. */
  floor: number[];
}
const FULL: Layout = {
  ring: LODGING_RING_M,
  inner: INNER_M,
  door: HUT_DOOR_M,
  core: OUTER_M + 1,
  gate: GATE_M,
  flag: FLAG_R,
  dance: DANCE_R,
  build: BUILD_RING_M,
  people: INNER_SPOTS + OUTER_SPOTS,
  clear: 4.6,
  floor: [1, 2, 3, 4, HUT_DOOR_M],
};
const COMPACT: Layout = {
  ring: 9,
  inner: 3.8,
  door: 4.6,
  core: 5,
  gate: 4.5,
  flag: 14.5,
  dance: 3.4,
  build: BUILD_RING_M,
  people: INNER_SPOTS,
  clear: 4.6,
  floor: [1, 2, 3, 4, HUT_DOOR_M],
};
/** A minimal camp has one small brush shelter (shelter-small-hut, about 1.7 m across) near its fire. */
const MINIMAL: Layout = {
  ring: 6.2,
  inner: 3.1,
  door: 3.1,
  core: 3.6,
  gate: 3.4,
  flag: 9.5,
  dance: 3.1,
  build: 3.2,
  people: 4,
  clear: 3,
  floor: [0.7, 1.4, 2.1, 2.6, 3.1],
};
/** The lodging of every minimal camp, whatever the culture. */
export const MINIMAL_LODGING = 'shelter-small-hut';
export const layoutOf = (camp: number): Layout =>
  camp >= MINIMAL_SITE ? MINIMAL : camp >= COMPACT_SITE ? COMPACT : FULL;
/** The ring of lodging places round a camp's hearth. */
export const ringOf = (camp: number): number => layoutOf(camp).ring;
const doorM = (camp: number) => layoutOf(camp).door;
const gateM = (camp: number) => layoutOf(camp).gate;

/** The turn of a camp's ring of places, by its hash. */
const campTurn = (camp: number) => hash01(camp, 41);

/** The point of a lodging slot round a camp's hearth, in layout metres: evenly spaced, turned by the camp's hash. */
export function slotPoint(camp: number, slot: number): Pt {
  const a = (campTurn(camp) + slot / LODGING_SLOTS) * 2 * Math.PI;
  return { x: ringOf(camp) * detCos(a), z: ringOf(camp) * detSin(a) };
}

/**
 * A scene at an anchor stands this far beyond the ring of lodgings (humankind.md section 8.2),
 * or, where the land is too narrow, nearer: the first of these that is dry.
 */
export const STAGE_BEYOND_M = [12, 10, 8];
/** A cave's hill stands further out, so its watchers are clear of the lodging in front of it. */
export const CAVE_BEYOND_M = [12, 10, 8];
/** A monument stands further out still: its ring is 11 metres across and its dancers round it. */
export const MONUMENT_BEYOND_M = [10, 9, 8];
/** A monument is raised in this many sessions, then danced round in as many (humankind.md section 8.2). */
export const MONUMENT_BUILD_SESSIONS = 6;
export const MONUMENT_DANCE_SESSIONS = 6;
/** Its first session falls this many windows after the anchor's day, the guests having walked there. */
export const MONUMENT_LEAD_WINDOWS = 6;
/** The ring sinks over its last 500 years, linearly with the date. */
export const MONUMENT_SINK_DAYS = Math.round(500 * 365.2425);
/** Dancers' and workers' rings round the monument's middle, in layout metres at full size. */
const MONUMENT_INNER_R = 2;
const MONUMENT_OUTER_R = 5.2;
const MONUMENT_INNER = 4;
const MONUMENT_OUTER = 6;
/** The monument's model is drawn at this share of the scene's size: a small enclosure. */
export const MONUMENT_SCALE = 0.6;
/** A cave's cut and this many layout metres round it keep clear of water where they can. */
export const CAVE_WATER_CLEAR_M = 16;
export const stageBeyond = (kind: TreeStage['kind']) =>
  kind === 'cave-painting'
    ? CAVE_BEYOND_M
    : kind === 'monument'
      ? MONUMENT_BEYOND_M
      : STAGE_BEYOND_M;
/** A scene's prop and places at a full, a compact and a minimal camp, as a share of full size. */
export const stageScale = (camp: number) =>
  camp >= MINIMAL_SITE ? 0.5 : camp >= COMPACT_SITE ? 0.75 : 1;
/** Mourners stand round a grave this far from it, on the hearth's side. */
const MOURN_R = 5.5;
/** At most this many mourners at a burial, round the grave. */
const MOURNERS = 6;

/**
 * The places of a scene behind a lodging place, in layout metres: its prop, a point `back`
 * metres from it towards the hearth and `side` metres to one side, and the way there out of
 * the gap beside the lodging (humankind.md section 8.2).
 */
export function stageSpots(camp: number, slot: number, beyond: number) {
  const p = slotPoint(camp, slot);
  const ring = ringOf(camp);
  const u = { x: p.x / ring, z: p.z / ring };
  // Smaller at a smaller camp, as its lodgings are (section 8.2).
  const k = stageScale(camp);
  const r = ring + beyond * k;
  const prop = { x: u.x * r, z: u.z * r };
  const at = (back: number, side: number): Pt => ({
    x: prop.x - u.x * back * k - u.z * side * k,
    z: prop.z - u.z * back * k + u.x * side * k,
  });
  const g = gapDirection(camp, slot);
  const gap = { x: g.x * (ring + 4), z: g.z * (ring + 4) };
  // In front of a cave's rock face, clear of the lodging before it: the way to it (section 8.2).
  const door = at(6, 0);
  return { prop, u, at, gap, door };
}

/** A monument's session needs at least this many people (humankind.md section 8.2). */
export const MONUMENT_MIN = 4;

/**
 * The way from the camp's side of a monument to a place at it: along the outer ring, or for
 * the inner ring in by the gate on the camp's side, then along the inner ring, never through
 * the wall; a step each 30 degrees round the shorter way.
 */
function monumentPath(to: Pt, prop: Pt, at: (back: number, side: number) => Pt, k: number): Pt[] {
  const [dx, dz] = [(to.x - prop.x) / k, (to.z - prop.z) / k];
  const [back, side] = [at(1, 0), at(0, 1)];
  const [bx, bz] = [(back.x - prop.x) / k, (back.z - prop.z) / k];
  const [sx, sz] = [(side.x - prop.x) / k, (side.z - prop.z) / k];
  // The angle from the camp's side, and the point on a ring of a radius at an angle.
  const a = detAtan2(dx * sx + dz * sz, dx * bx + dz * bz);
  const onRing = (ang: number, rad: number) => at(rad * detCos(ang), rad * detSin(ang));
  const inside = Math.sqrt(dx * dx + dz * dz) < MONUMENT_OUTER_R - 0.6;
  const rad = inside ? MONUMENT_INNER_R : MONUMENT_OUTER_R;
  const path = inside ? [onRing(0, MONUMENT_OUTER_R), onRing(0, MONUMENT_INNER_R)] : [];
  const n = Math.max(1, Math.ceil(Math.abs(a) / (Math.PI / 6)));
  for (let j = 1; j <= n; j++) path.push(onRing((a * j) / n, rad));
  return path;
}

/** Where the people of a scene stand: the painter and two watchers, or two diggers and the mourners. */
function stageStands(
  camp: number,
  slot: number,
  beyond: number,
  kind: TreeStage['kind'],
  dance = false,
): Pt[] {
  const { at } = stageSpots(camp, slot, beyond);
  if (kind === 'monument') {
    // Workers all round the ring; dancers in two rings, inside it and outside, handed out
    // alternately so a small party still makes two rings (angles from the camp's side).
    const ring = (n: number, r: number, turn: number) =>
      Array.from({ length: n }, (_, k) => {
        const a = ((k + turn) / n) * 2 * Math.PI;
        return at(r * detCos(a), r * detSin(a));
      });
    if (!dance) return ring(MONUMENT_INNER + MONUMENT_OUTER, MONUMENT_OUTER_R, 0.5);
    const inner = ring(MONUMENT_INNER, MONUMENT_INNER_R, 0.5);
    const outer = ring(MONUMENT_OUTER, MONUMENT_OUTER_R, 0.5);
    return outer.flatMap((q, k) => (k < inner.length ? [q, inner[k]!] : [q]));
  }
  // The painter at the rock face, the watchers behind; diggers at the grave's heap of earth.
  if (kind === 'cave-painting') return [at(1.8, 0), at(5, -2.2), at(5, 2.2)];
  const out = [at(2.4, -1.5), at(2.4, 1.5)];
  for (let k = 0; k < MOURNERS; k++) {
    const a = ((k + 0.5) / MOURNERS - 0.5) * (2 * Math.PI) * 0.45;
    out.push(at(MOURN_R * detCos(a), MOURN_R * detSin(a)));
  }
  return out;
}

/** Every point of a scene that must be dry land: its prop and round it, its people's places and the way there. */
export function stagePoints(
  camp: number,
  slot: number,
  beyond: number,
  kind: TreeStage['kind'],
): Pt[] {
  const { prop, gap, at, door } = stageSpots(camp, slot, beyond);
  const out: Pt[] = [prop];
  // Round the prop as it lies, in layout metres: the cave's rock face and the ground before
  // it (its hill is the ground, which does not rise over water); the grave's heap 4.2 by 2.6.
  const cave = kind === 'cave-painting';
  const [wide, deep, mid] = cave ? [6, 4, -2] : [4.2, 2.6, 0];
  if (kind === 'monument') {
    // The ring and the ground round it where its dancers stand and walk.
    for (const r of [MONUMENT_INNER_R, 6.5, MONUMENT_OUTER_R + 1.2])
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * 2 * Math.PI;
        out.push(at(r * detCos(a), r * detSin(a)));
      }
    out.push(at(MONUMENT_OUTER_R + 0.5, 0), gap);
    return out;
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * 2 * Math.PI;
    out.push(at(mid + deep * detCos(a), wide * detSin(a)));
  }
  const stands = stageStands(camp, slot, beyond, kind);
  out.push(...stands, gap);
  const line = (a: Pt, b: Pt) => {
    const n = Math.ceil(Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2));
    for (let k = 1; k < n; k++)
      out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  };
  for (const q of stands) {
    if (cave) {
      line(gap, door);
      line(door, q);
    } else line(gap, q);
  }
  return out;
}

/**
 * A scene's people are in place this long after their window starts and paint or bury for
 * STAGE_MS, leaving time to walk back before the window ends.
 */
const STAGE_LEAD_MS = Math.round(15_000 / TEMPO);
/** A burial's people are in place when the dead dies; the grave is dug, the dead carried in, then covered. */
const BURIAL_LEAD_MS = Math.round(10_000 / TEMPO);
/** From the heap's rise: the grave is dug this long, and the dead is laid in at BODY_AFTER_MS. */
const DIG_MS = 1_500;
const BODY_AFTER_MS = 10_300;
/** The two diggers fetch the dead, and lift it, this long after the digging, then carry it in. */
const FETCH_MS = 3_000;
/** The belongings are added, then the grave covered, in this long after the dead is laid in. */
const FILL_GRAVE_MS = 1_200;
const CORPSE_LIFT_MS = 500;
/** The dead is set down into the grave over this long before it is laid in. */
const LAY_MS = 1_200;
const CARRIED_M = 0.9;
/** The two who carry the dead stand this far (layout metres) before and behind its middle, at its head and feet. */
const BEARER_HALF_M = 3;
const STAGE_MS = Math.round(27_000 / TEMPO);
/** A monument's inner ring is further to walk to, so its people come later and work a little shorter. */
const MONUMENT_LEAD_MS = Math.round(21_000 / TEMPO);
const MONUMENT_STAGE_MS = Math.round(15_000 / TEMPO);
/**
 * A cave fades in over CAVE_FADE_MS of watching from CAVE_LEAD_MS before its first session,
 * and out over CAVE_FADE_MS from CAVE_LINGER_MS after its last; a closed grave fades into the
 * ground over GRAVE_FADE_DAYS (humankind.md section 8.2).
 */
export const CAVE_LEAD_MS = 60_000;
export const CAVE_LINGER_MS = 60_000;
export const CAVE_FADE_MS = 10_000;
export const PAINT_FADE_MS = 5_000;
export const GRAVE_FADE_DAYS = Math.round(50 * 365.2425);
/** A grave's heap rises this long, grass grows over it this long after it is closed, taking GRASS_MS. */
const HEAP_MS = 1_500;
/** A grave sinks back flat over GRAVE_FADE_DAYS, or this much watching where that passes quicker. */
export const GRAVE_SINK_MS = 60_000;
const GRASS_AFTER_MS = 10_000;
const GRASS_MS = 10_000;
/** The dead sits ill this long from the start of the burial's window, then lies dead; the soul rises for SOUL_MS. */
const ILL_MS = 3_000;
const SOUL_MS = 4_000;

/**
 * The moments of a burial (section 8.2): its window's start, when its dead dies and when the
 * body is laid in the grave, its session, and when grass has grown over the grave.
 */
export function burialTimes(stage: TreeStage, startDay: Day) {
  const q = stageSessions(stage, startDay)[0];
  if (!q) return undefined;
  const dig = q.begin + HEAP_MS;
  return {
    w: q.w,
    start: q.start,
    death: q.start + ILL_MS,
    digEnd: dig + DIG_MS,
    carry: dig + DIG_MS + FETCH_MS,
    // The body is laid in after the two diggers fetched and carried it (section 8.2).
    body: dig + BODY_AFTER_MS,
    begin: q.begin,
    dig,
    stop: q.stop,
    grown: q.stop + GRASS_AFTER_MS + GRASS_MS,
  };
}
/** A cave painting grows in this many sessions, one window in two (humankind.md section 8.2). */
export const PAINT_SESSIONS = 6;

/**
 * The sessions of a scene (humankind.md section 8.2): the windows of its camp's day it takes,
 * fixed from the anchor's day by the camp alone, whoever is free; each with the window's start,
 * when its people are in place and when they stop.
 */
export function stageSessions(
  stage: TreeStage,
  startDay: Day,
): { w: number; start: number; begin: number; stop: number }[] {
  const shift = hash32(stage.camp, 113) % TURN_MS;
  const w0 = Math.ceil((msAtDay(stage.from, startDay) + shift) / TURN_MS);
  const end = msAtDay(stage.until, startDay);
  const ws =
    stage.kind === 'cave-painting'
      ? Array.from({ length: PAINT_SESSIONS }, (_, k) => w0 + 2 * k)
      : stage.kind === 'monument'
        ? Array.from(
            { length: MONUMENT_BUILD_SESSIONS + MONUMENT_DANCE_SESSIONS },
            (_, k) => w0 + MONUMENT_LEAD_WINDOWS + k,
          )
        : [w0 + 1];
  return ws
    .map((w) => {
      const start = w * TURN_MS - shift;
      const monument = stage.kind === 'monument';
      const lead =
        stage.kind === 'burial' ? BURIAL_LEAD_MS : monument ? MONUMENT_LEAD_MS : STAGE_LEAD_MS;
      const long = stage.kind === 'burial' ? HEAP_MS + BODY_AFTER_MS + FILL_GRAVE_MS - STAGE_MS : 0;
      return {
        w,
        start,
        begin: start + lead,
        stop: start + lead + (monument ? MONUMENT_STAGE_MS : STAGE_MS) + long,
      };
    })
    .filter((x) => x.start + TURN_MS <= end);
}

/** Where a lodging stands around its hearth, in layout metres, by its slot. Its door faces the hearth. */
export function lodgingSpot(l: TreeLodging): Pt {
  return slotPoint(l.camp, l.slot);
}

/** The direction out from the hearth through the middle of a gap between the lodging slots. */
export function gapDirection(camp: number, gap: number): Pt {
  const a = (campTurn(camp) + (gap + 0.5) / LODGING_SLOTS) * 2 * Math.PI;
  return { x: detCos(a), z: detSin(a) };
}

/** A figure's own spot at the hearth of a camp, in layout metres: the inner ring first, then the outer. */
export function figureSpot(spot: number, camp: number): Pt {
  const inner = spot < INNER_SPOTS;
  // Spots fill in an order that keeps a small band spread round the fire.
  const k = (inner ? INNER_ORDER : OUTER_ORDER)[inner ? spot : spot - INNER_SPOTS]!;
  const n = inner ? INNER_SPOTS : OUTER_SPOTS;
  const r = isCompact(camp) ? layoutOf(camp).inner + (inner ? 0 : 2) : inner ? INNER_M : OUTER_M;
  const a = (hash01(camp, 43) + (k + (inner ? 0 : 0.5)) / n) * 2 * Math.PI;
  return { x: r * detCos(a), z: r * detSin(a) };
}

/**
 * A point out from the hearth through a gap between the lodgings, for a figure's own
 * outings: the gap and the lane in it come from its spot, which no one else in the camp
 * has, so two figures never head for the same place.
 */
function outingPoint(spot: number, camp: number, distance: number): Pt {
  const lane = Math.floor(spot / LODGING_SLOTS);
  const a =
    (campTurn(camp) + ((spot % LODGING_SLOTS) + 0.5) / LODGING_SLOTS) * 2 * Math.PI +
    (lane - 1.5) * 0.1;
  const r = distance + 3.5 * lane;
  return { x: r * detCos(a), z: r * detSin(a) };
}

/** The farthest a figure's outings may go from the hearth: the land in its gap, less its lane. */
function outingRoom(spot: number, home: TreeLodging): number {
  return (home.reach[spot % LODGING_SLOTS] ?? 0) - 3.5 * Math.floor(spot / LODGING_SLOTS);
}

/** Unit vector from (x0, z0) to (x1, z1), or the fallback when they meet. */
function towards(x0: number, z0: number, x1: number, z1: number, fx = 1, fz = 0) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dz * dz);
  return len < 1e-9 ? { dirX: fx, dirZ: fz } : { dirX: dx / len, dirZ: dz / len };
}

/**
 * What a figure does at its spot by the fire at a clock time, with the clip it eases out of:
 * stands, tends the fire, or (grown-ups) knaps a stone hand axe.
 */
function activity(
  id: number,
  ms: number,
  knaps: boolean,
): Pick<FigurePose, 'clip' | 'clipMs' | 'from'> {
  const period = ACTIVITY_MIN_MS + (hash32(id, 53) % ACTIVITY_SPREAD_MS);
  const shifted = ms + (hash32(id, 59) % period);
  const k = Math.floor(shifted / period);
  // Standing a quarter of the time, sitting a quarter, tending the fire a fifth, cracking
  // nuts a tenth, telling a story a twelfth and knapping an eighth (humankind.md section 8.1).
  const clipOf = (n: number): TreeClip => {
    const h = hash32(id, n, 61) % 120;
    if (h < 30) return 'idle';
    if (h < 60) return 'sit';
    if (h < 84) return 'work';
    if (h < 96) return 'crack';
    if (h < 106) return 'point';
    return knaps ? 'knap' : 'sit';
  };
  const clip = clipOf(k);
  const clipMs = shifted - k * period;
  const prev = clipOf(k - 1);
  if (clipMs < BLEND_MS && prev !== clip)
    return {
      clip,
      clipMs,
      from: { clip: prev, clipMs: period + clipMs, weight: clipMs / BLEND_MS },
    };
  return { clip, clipMs };
}

/**
 * Where a figure stands while the band builds or takes down a lodging: around it on the
 * hearth's side, the `k`-th of `n`, evenly spread so they never overlap.
 */
function buildSpot(k: number, n: number, lodging: TreeLodging): Pt {
  const hut = lodgingSpot(lodging);
  const toHearth = Math.sqrt(hut.x * hut.x + hut.z * hut.z);
  const a = n > 1 ? (k / (n - 1) - 0.5) * 0.75 * Math.PI : 0;
  const c = detCos(a);
  const sn = detSin(a);
  // On the hearth's side, or behind the hut at a compact camp, whose people stand close by.
  const side = isCompact(lodging.camp) ? 1 : -1;
  const ux = (side * hut.x) / toHearth;
  const uz = (side * hut.z) / toHearth;
  return {
    x: hut.x + layoutOf(lodging.camp).build * (ux * c - uz * sn),
    z: hut.z + layoutOf(lodging.camp).build * (ux * sn + uz * c),
  };
}

/**
 * The way from a to b within a camp: straight, or round the fire by a point beside it
 * when the straight line would pass through it.
 */
function route(a: Pt, b: Pt, camp?: number): Pt[] {
  // The same walks are asked for frame after frame: remember them (a pure function).
  const key = `${camp}|${a.x}|${a.z}|${b.x}|${b.z}`;
  const known = routes.get(key);
  if (known) return known;
  if (routes.size >= ROUTES_KEPT) routes.clear();
  const way = routeOf(a, b, camp);
  routes.set(key, way);
  return way;
}
const routes = new Map<string, Pt[]>();
const ROUTES_KEPT = 50_000;

function routeOf(a: Pt, b: Pt, camp?: number): Pt[] {
  const all = camp === undefined ? FIRE_ONLY : campObstacles(camp);
  // Obstacles at either end are where the walk is going, or leaving from: a hut door, a rack.
  const live = all.filter(
    (c) =>
      Math.sqrt((a.x - c.x) ** 2 + (a.z - c.z) ** 2) >= c.r &&
      Math.sqrt((b.x - c.x) ** 2 + (b.z - c.z) ** 2) >= c.r,
  );
  return detour(a, b, live, 4);
}

/** A circle a walk keeps out of, in layout metres. */
interface Circle {
  x: number;
  z: number;
  r: number;
}

const FIRE_ONLY: Circle[] = [{ x: 0, z: 0, r: FIRE_CLEAR_M }];
/** Walks keep this far from the middle of a drying rack (section 8.1); from a lodging, its layout's clear. */
const RACK_CLEAR_M = 4.4;

/** The fire, the lodgings of every slot and their racks: what walks at a camp go round. */
const obstacles = new Map<number, Circle[]>();
function campObstacles(camp: number): Circle[] {
  let list = obstacles.get(camp);
  if (!list) {
    list = [...FIRE_ONLY];
    for (let k = 0; k < LODGING_SLOTS; k++) {
      list.push({ ...slotPoint(camp, k), r: layoutOf(camp).clear });
      if (hasRack(camp, k)) list.push({ ...rackAt(camp, k), r: RACK_CLEAR_M });
    }
    obstacles.set(camp, list);
  }
  return list;
}

/**
 * The way from a to b round the first circle the straight line passes through, by a point
 * beside it on the side the line already passes; each part is checked again in turn.
 */
function detour(a: Pt, b: Pt, circles: Circle[], depth: number): Pt[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9 || depth === 0) return [a, b];
  let hit: { c: Circle; t: number; px: number; pz: number } | undefined;
  for (const c of circles) {
    const t = Math.min(1, Math.max(0, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2));
    if (t <= 0 || t >= 1) continue;
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    if (Math.sqrt((px - c.x) ** 2 + (pz - c.z) ** 2) >= c.r) continue;
    if (!hit || t < hit.t) hit = { c, t, px, pz };
  }
  if (!hit) return [a, b];
  const { c, px, pz } = hit;
  const d = Math.sqrt((px - c.x) ** 2 + (pz - c.z) ** 2);
  const len = Math.sqrt(len2);
  let [sx, sz] = d > 1e-6 ? [(px - c.x) / d, (pz - c.z) / d] : [-dz / len, dx / len];
  // Round a lodging or rack on the fire's side, not away from the hearth, where the land is
  // not checked: an empty lodging place may lie in the sea (sites.md section 2).
  const out = Math.sqrt(c.x * c.x + c.z * c.z);
  if (out > 1e-6 && (sx * c.x + sz * c.z) / out > 0.5) [sx, sz] = [-c.x / out, -c.z / out];
  const w = { x: c.x + sx * c.r * 1.3, z: c.z + sz * c.r * 1.3 };
  return [...detour(a, w, circles, depth - 1), ...detour(w, b, circles, depth - 1).slice(1)];
}

function routeLength(points: Pt[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++)
    m += Math.sqrt((points[i]!.x - points[i - 1]!.x) ** 2 + (points[i]!.z - points[i - 1]!.z) ** 2);
  return m;
}

/** A stretch of a figure's time at a camp: walking a route, or standing at a point. */
interface Leg {
  start: number;
  end: number;
  /** A clip, a rest, inside the hut (out of sight), or a camp event's own motion. */
  clip: TreeClip | 'rest' | 'inside' | 'event';
  route: Pt[];
  /** What a standing figure faces. */
  face?: Pt;
  /** A prop shown while the leg lasts: the spit over the fire while cooking. */
  prop?: 'prop-spit';
}

/** Builds a figure's legs one after another from a point and a time. */
class Itinerary {
  legs: Leg[] = [];
  t: number;
  at: Pt;
  /** The camp whose fire, lodgings and racks its walks go round. */
  camp: number | undefined;
  constructor(t: number, at: Pt, camp?: number) {
    this.t = t;
    this.at = at;
    this.camp = camp;
  }
  go(
    to: Pt,
    clip: 'walk' | 'run' | 'carry' | 'pole' | 'crouch' | 'bearBehind' | 'bearAhead' = 'walk',
  ): this {
    // A carrying pole keeps to its lane, so its two carriers walk in step.
    const way = route(this.at, to, clip === 'pole' ? undefined : this.camp);
    const m = routeLength(way);
    if (m < 1e-6) return this;
    const end = this.t + Math.ceil(m / PACE[clip]);
    this.legs.push({ start: this.t, end, clip, route: way });
    this.t = end;
    this.at = to;
    return this;
  }
  stay(until: number, clip: Leg['clip'], face?: Pt, prop?: Leg['prop']): this {
    if (until <= this.t) return this;
    this.legs.push({ start: this.t, end: until, clip, route: [this.at], face, prop });
    this.t = until;
    return this;
  }
}

/** The point a fraction of the way along a route, and the direction it goes there. */
function along(way: Pt[], f: number): Pt & { dirX: number; dirZ: number } {
  if (way.length === 1) return { ...way[0]!, dirX: 0, dirZ: 0 };
  let left = routeLength(way) * f;
  for (let i = 1; i < way.length; i++) {
    const [a, b] = [way[i - 1]!, way[i]!];
    const m = Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
    if (left <= m || i === way.length - 1) {
      const t = m < 1e-9 ? 1 : Math.min(1, left / m);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, ...towards(a.x, a.z, b.x, b.z) };
    }
    left -= m;
  }
  return { ...way.at(-1)!, dirX: 0, dirZ: 0 };
}

type Outing =
  | 'rest'
  | 'gather'
  | 'hunt'
  | 'stroll'
  | 'firewood'
  | 'water'
  | 'scrape'
  | 'crack'
  | 'spear'
  | 'cook'
  | 'flay'
  | 'rack'
  | 'fish'
  | 'hut';

/** Shares of a figure's turns by activity (section 8.1), the rest of its turns rests. */
// Hunting was most of a man's turns until Yang, 2026-10-20: "activities are often just
// hunting. what about other activities?"
const OUTING_SHARES: Record<FigureLook, [Outing, number][]> = {
  man: [
    ['hunt', 0.25],
    ['spear', 0.12],
    ['firewood', 0.1],
    ['water', 0.05],
    ['fish', 0.08],
    ['hut', 0.1],
    ['flay', 0.08],
    ['rack', 0.04],
    ['stroll', 0.05],
  ],
  founder: [
    ['hunt', 0.18],
    ['gather', 0.1],
    ['firewood', 0.08],
    ['water', 0.06],
    ['crack', 0.1],
    ['cook', 0.08],
    ['flay', 0.05],
    ['hut', 0.1],
    ['stroll', 0.05],
  ],
  woman: [
    ['gather', 0.18],
    ['scrape', 0.12],
    ['crack', 0.1],
    ['water', 0.1],
    ['fish', 0.04],
    ['firewood', 0.08],
    ['cook', 0.12],
    ['flay', 0.06],
    ['rack', 0.06],
    ['hut', 0.1],
    ['stroll', 0.04],
  ],
  child: [
    ['gather', 0.15],
    ['crack', 0.12],
    ['hut', 0.14],
    ['stroll', 0.15],
  ],
};

/** What a figure does in one of its turns (section 8.1), chosen by hash from its look's shares. */
function outingOf(id: number, look: FigureLook, turn: number): Outing {
  let roll = hash01(id, turn, 71);
  for (const [outing, share] of OUTING_SHARES[look]) {
    if (roll < share) return outing;
    roll -= share;
  }
  return 'rest';
}

/** A figure's stay at one of its homes (section 8.1). */
interface Stay {
  f: TreeFigure;
  i: number;
  home: TreeLodging;
  look: FigureLook;
  /** Its spot's number at the hearth, and the spot. */
  s: number;
  spot: Pt;
  hut: Pt;
  plan: Itinerary;
  free: number;
  busy: number;
  leave: number;
  takes: boolean;
  takeSpot: Pt;
  /** The clothes it came in, while they differ from its new camp's, and when it changes them. */
  wore: string | undefined;
  changeAt: number;
}

/**
 * What the scene of a chunk works out that does not change with the clock: lodgings by id,
 * builders and takers, when each lodging appears, who lives at each camp, the places camps
 * stand, and the stays, hunts, events and walks between camps worked out so far. Kept per
 * chunk, so each frame only works out what is new; the scene is a pure function of the
 * clock either way.
 */
interface Memo {
  startDay: Day;
  ready: boolean;
  lodgings: Map<number, TreeLodging>;
  builders: Map<number, number[]>;
  takers: Map<number, number[]>;
  appears: Map<number, number>;
  campmates: Map<number, TreeFigure[]>;
  places: Map<string, Place>;
  stays: Map<string, Stay | undefined>;
  hunts: Map<string, Hunt | undefined>;
  events: Map<string, CampEvent | undefined>;
  crossings: Map<string, unknown>;
  /** The stay at its site each lodging belongs to (setPlaces). */
  stayOf: Map<number, string>;
}
const memos = new WeakMap<TreeChunk, Memo>();

/**
 * When a lodging first shows in the scene, in watching ms: not the day it is built, but when
 * its builder has walked there, the trees are felled and the fire lit (the events dialog
 * travels there then, milestone-1 section 8.3). Undefined for a lodging not in the chunk.
 */
export function shownAtMs(chunk: TreeChunk, startDay: Day, id: number): number | undefined {
  if (!memoOf(chunk, startDay).ready) treeScene(chunk, 0, startDay);
  return memoOf(chunk, startDay).appears.get(id);
}
function memoOf(chunk: TreeChunk, startDay: Day): Memo {
  let m = memos.get(chunk);
  if (!m || m.startDay !== startDay) {
    m = {
      startDay,
      ready: false,
      lodgings: new Map(chunk.lodgings.map((l) => [l.id, l])),
      builders: new Map(),
      takers: new Map(),
      appears: new Map(),
      campmates: new Map(),
      places: new Map(),
      stays: new Map(),
      hunts: new Map(),
      events: new Map(),
      crossings: new Map(),
      stayOf: new Map(),
    };
    memos.set(chunk, m);
  }
  return m;
}

/** Everything the tree shows at a clock time (section 8.1). */
export function treeScene(
  chunk: TreeChunk,
  ms: number,
  startDay: Day,
  /**
   * Whether a camp at a place may be in view: figures whose home and last home are both
   * out of view are left out, unless they are on their way between camps (humankind.md
   * section 8). Without it, everyone is worked out.
   */
  near?: (lat: number, lon: number) => boolean,
): TreeScene {
  // What does not change with the clock is worked out once per chunk and kept (memoOf).
  const memo = memoOf(chunk, startDay);
  const lodgings = memo.lodgings;
  const at = (day: Day) => msAtDay(day, startDay);

  // When each lodging's people start taking it down, so it is gone by the day they leave.
  const takeDown = (l: TreeLodging) =>
    l.gone === NEVER
      ? Infinity
      : Math.max(appears.get(l.id)! + BUILD_MS, at(l.gone) - TAKE_DOWN_MS);

  // The builders of each lodging (moving in on the day it is built) and the figures that
  // take it down (leaving on the day it is gone), by id.
  const { builders, takers, appears, stays, hunts, events, campmates, places } = memo;
  if (!memo.ready)
    for (const f of chunk.figures)
      f.homes.forEach(([day, id], i) => {
        const l = lodgings.get(id);
        if (!l) return;
        if (l.built === day) builders.set(id, [...(builders.get(id) ?? []), f.id]);
        const next = f.homes[i + 1];
        if (next && l.gone === next[0]) takers.set(id, [...(takers.get(id) ?? []), f.id]);
      });

  // When each lodging appears: when it is built, or when its builder reaches it from far away.
  if (!memo.ready) for (const l of chunk.lodgings) appears.set(l.id, at(l.built));
  if (!memo.ready)
    for (const f of chunk.figures)
      for (let i = 1; i < f.homes.length; i++) {
        const [day, id] = f.homes[i]!;
        const to = lodgings.get(id);
        const c = crossing(f, i);
        if (!to || !c || to.builder !== f.id || day !== to.built) continue;
        const crew = builders.get(id)!;
        const work = buildSpot(crew.indexOf(f.id), crew.length, to);
        appears.set(id, c.end + Math.ceil(routeLength(route(c.entry, work, to.camp)) / PACE.walk));
      }

  const scene: TreeScene = {
    figures: [],
    prey: [],
    spears: [],
    poles: [],
    sparks: [],
    props: [],
    lodgings: [],
    hearths: [],
    clearings: [],
  };
  // Who ever lives at each camp, so the camp-wide lookups of hunts, helpers, events and
  // kills look only at its people, not everyone.
  if (!memo.ready)
    for (const f of chunk.figures)
      for (const c of new Set(f.homes.map(([, id]) => lodgings.get(id)?.camp))) {
        if (c === undefined) continue;
        const list = campmates.get(c);
        if (list) list.push(f);
        else campmates.set(c, [f]);
      }
  const mates = (camp: number) => campmates.get(camp) ?? [];
  // Each place a camp stands: from the band's arrival up to the last lodging gone, with
  // the felling and the lighting of its fire (section 8.1).
  // One place for each stay of a band at a site: its lodgings standing without a gap.
  const placeKey = (l: TreeLodging) => memo.stayOf.get(l.id)!;
  if (!memo.ready) setPlaces();
  memo.ready = true;
  function setPlaces() {
    const bySite = new Map<string, TreeLodging[]>();
    for (const l of chunk.lodgings) {
      const at = `${l.camp}:${l.lat}:${l.lon}`;
      bySite.set(at, [...(bySite.get(at) ?? []), l]);
    }
    for (const list of bySite.values()) {
      list.sort((a, b) => a.built - b.built || a.id - b.id);
      let key = '';
      let until = -Infinity;
      for (const l of list) {
        if (l.built > until) key = `${l.camp}:${l.lat}:${l.lon}:${l.id}`;
        memo.stayOf.set(l.id, key);
        until = Math.max(until, l.gone === NEVER ? Infinity : l.gone);
      }
    }
    for (const l of chunk.lodgings) {
      const arrived = appears.get(l.id)!;
      const gone = l.gone === NEVER ? Infinity : at(l.gone);
      const p = places.get(placeKey(l));
      if (!p)
        places.set(placeKey(l), {
          camp: l.camp,
          lat: deg(l.lat),
          lon: deg(l.lon),
          from: arrived,
          to: gone,
          wood: l.wood ?? 0,
          first: l,
          fellEnd: arrived,
          litStart: arrived,
          litEnd: arrived,
        });
      else {
        if (arrived < p.from) [p.from, p.first] = [arrived, l];
        p.to = Math.max(p.to, gone);
        p.wood = Math.max(p.wood, l.wood ?? 0);
      }
    }
    for (const p of places.values()) {
      if (p.from <= 0) continue;
      p.fellEnd = p.from;
      p.litStart = p.fellEnd;
      p.litEnd = p.litStart + FLINT_MS;
    }
    // No lodging goes up before the felling is done, nor the lighter's before the fire is lit.
    for (const l of chunk.lodgings) {
      const p = places.get(placeKey(l))!;
      if (p.from <= 0) continue;
      let shown = Math.max(appears.get(l.id)!, p.fellEnd);
      if (l === p.first) {
        const crew = builders.get(l.id) ?? [l.builder];
        const work = buildSpot(Math.max(0, crew.indexOf(l.builder)), crew.length, l);
        shown = Math.max(
          shown,
          p.litEnd + Math.ceil(routeLength(route(lightSpot(l.builder), work, l.camp)) / PACE.walk),
        );
      }
      appears.set(l.id, shown);
    }
  }
  for (const l of chunk.lodgings) {
    const shown = appears.get(l.id)!;
    const gone = l.gone === NEVER ? Infinity : at(l.gone);
    if (ms < shown || ms >= gone) continue;
    const spot = lodgingSpot(l);
    const down = takeDown(l);
    // A drying rack stands behind some lodgings while they are up (section 8.1).
    if (ms >= shown + BUILD_MS && ms < down && hasRack(l.camp, l.slot)) {
      const rack = rackSpot(l);
      scene.props.push({
        id: `rack:${l.id}`,
        kind: 'prop-drying-rack',
        lat: deg(l.lat),
        lon: deg(l.lon),
        ...rack,
        ...towards(rack.x, rack.z, 0, 0),
      });
    }
    scene.lodgings.push({
      id: l.id,
      kind: l.kind,
      lat: deg(l.lat),
      lon: deg(l.lon),
      ...spot,
      ...towards(spot.x, spot.z, 0, 0),
      // Lodgings standing when the timeline starts are already up; then built, then taken down.
      built:
        ms >= down
          ? Math.max(0, 1 - (ms - down) / (at(l.gone) - down))
          : shown <= 0
            ? 1
            : Math.min(1, (ms - shown) / BUILD_MS),
    });
  }
  for (const p of places.values()) {
    if (ms >= p.from && ms < p.to && !scene.hearths.some((h) => h.camp === p.camp)) {
      // The flames rise from nothing as the fire catches.
      const lit = p.from <= 0 ? 1 : Math.min(1, Math.max(0, (ms - p.litStart) / FLINT_MS));
      scene.hearths.push({ camp: p.camp, lat: p.lat, lon: p.lon, lit });
      if (ms >= p.litStart && ms < p.litEnd) sparksAt(p, ms);
    }
    // The trees wither over THIN_MS before the band arrives and grow back after it leaves
    // (sites.md section 6); nobody fells them.
    const amount =
      p.from <= 0 || (ms >= p.from && ms < p.to)
        ? ms < p.to
          ? 1
          : 1 - (ms - p.to) / REGROW_MS
        : ms < p.from
          ? (ms - (p.from - THIN_MS)) / THIN_MS
          : 1 - (ms - p.to) / REGROW_MS;
    if (amount > 0)
      scene.clearings.push({ lat: p.lat, lon: p.lon, amount: Math.min(1, amount), felling: false });
  }
  // Red flags at the Neolithic thresholds, behind a lodging of their settled camps.
  for (const flag of chunk.flags ?? []) {
    if (ms < at(flag.day) || (flag.until !== NEVER && ms >= at(flag.until))) continue;
    const p = slotPoint(flag.camp, flag.slot);
    const r = layoutOf(flag.camp).flag / ringOf(flag.camp);
    scene.props.push({
      id: `flag:${flag.id}`,
      kind: 'prop-red-flag',
      lat: deg(flag.lat),
      lon: deg(flag.lon),
      x: p.x * r,
      z: p.z * r,
      dirX: -p.x / ringOf(flag.camp),
      dirZ: -p.z / ringOf(flag.camp),
    });
  }
  // Scenes at anchors (section 8.2). A cave's hill rises out of the ground over CAVE_FADE_MS
  // from CAVE_LEAD_MS before its first session, its painting grows over its sessions, and it
  // sinks back over CAVE_FADE_MS from CAVE_LINGER_MS after its last. A grave's heap rises as
  // its burial begins, is dug, filled and closed, grows grass and sinks back flat over
  // GRAVE_FADE_DAYS. The dead's skull rises and fades away.
  for (const stage of chunk.stages ?? []) {
    if (ms < at(stage.shown) || ms >= at(stage.keep)) continue;
    const sessions = stageSessions(stage, startDay);
    let rise: number;
    let built: number;
    let paint: number | undefined;
    if (stage.kind === 'cave-painting') {
      if (!sessions.length) continue;
      const from = sessions[0]!.begin - CAVE_LEAD_MS;
      const to = sessions.at(-1)!.stop + CAVE_LINGER_MS;
      // The painting fades away over the PAINT_FADE_MS before the cave starts to sink back.
      paint = Math.min(1, Math.max(0, (to - ms) / PAINT_FADE_MS));
      rise = Math.min(1, (ms - from) / CAVE_FADE_MS, (to + CAVE_FADE_MS - ms) / CAVE_FADE_MS);
      const done = (q: { begin: number; stop: number }) =>
        Math.min(1, Math.max(0, (ms - q.begin) / (q.stop - q.begin)));
      built = sessions.reduce((n, q) => n + done(q), 0) / PAINT_SESSIONS;
    } else if (stage.kind === 'monument') {
      if (!sessions.length) continue;
      // Raised session by session, it stands for a thousand years, then sinks into the ground
      // over the last five hundred, linearly with the date (section 8.2).
      const raise = sessions.slice(0, MONUMENT_BUILD_SESSIONS);
      built =
        raise.reduce(
          (n, q) => n + Math.min(1, Math.max(0, (ms - q.begin) / (q.stop - q.begin))),
          0,
        ) / MONUMENT_BUILD_SESSIONS;
      const sinks = stage.until - MONUMENT_SINK_DAYS;
      rise = Math.min(1, Math.max(0, (stage.until - dayAtMs(ms, startDay)) / MONUMENT_SINK_DAYS));
      if (dayAtMs(ms, startDay) <= sinks) rise = 1;
      if (built <= 0) continue;
    } else {
      const g = burialTimes(stage, startDay);
      if (!g) continue;
      if (ms < g.begin) continue;
      // It sinks over 50 years, or a minute of watching where 50 years pass quicker.
      const end = Math.max(
        msAtDay(dayAtMs(g.stop, startDay) + GRAVE_FADE_DAYS, startDay),
        g.grown + GRAVE_SINK_MS,
      );
      rise = Math.min(
        1,
        (ms - g.begin) / HEAP_MS,
        ms <= g.grown ? 1 : 1 - (ms - g.grown) / Math.max(1, end - g.grown),
      );
      // Five steps: the trench dug, the body laid in, the belongings added, the grave covered,
      // then grass over it (the prop's steps, humankind.md section 8.2).
      const part = (a: number, b: number) => Math.min(1, Math.max(0, (ms - a) / (b - a)));
      built =
        0.2 * part(g.dig, g.digEnd) +
        0.2 * part(g.body - LAY_MS, g.body) +
        0.4 * part(g.body, g.stop) +
        0.2 * part(g.stop + GRASS_AFTER_MS, g.stop + GRASS_AFTER_MS + GRASS_MS);
    }
    if (rise <= 0) continue;
    const { prop, u } = stageSpots(stage.camp, stage.slot, stage.beyond);
    scene.props.push({
      id: `stage:${stage.id}`,
      kind: stage.prop,
      lat: deg(stage.lat),
      lon: deg(stage.lon),
      x: prop.x,
      z: prop.z,
      dirX: -u.x,
      dirZ: -u.z,
      built,
      scale: stageScale(stage.camp) * (stage.kind === 'monument' ? MONUMENT_SCALE : 1),
      rise,
      ...(paint !== undefined ? { paint } : {}),
      // A cave's torch burns while a session is painted.
      ...(stage.kind === 'cave-painting'
        ? { lit: sessions.some((q) => ms >= q.begin - 1500 && ms < q.stop) }
        : {}),
    });
  }
  // In place order, so a time window's chunk gives the same scene as the whole tree.
  scene.clearings.sort((a, b) => a.lat - b.lat || a.lon - b.lon || a.amount - b.amount);

  for (const f of chunk.figures) {
    const born = at(f.born);
    if (ms < born || (f.lost !== NEVER && ms >= at(f.lost))) continue;
    let i = 0;
    while (i + 1 < f.homes.length && at(f.homes[i + 1]![0]) <= ms) i++;
    if (near) {
      const home = lodgings.get(f.homes[i]![1]);
      const last = i > 0 ? lodgings.get(f.homes[i - 1]![1]) : undefined;
      const seen = (l: TreeLodging | undefined) => !!l && near(deg(l.lat), deg(l.lon));
      if (!seen(home) && !seen(last)) {
        const c = crossing(f, i);
        if (!c || ms >= c.end) continue;
      }
    }
    // A burial's dead sits ill by the fire, then lies dead until laid in the grave (section 8.2).
    const dying = (chunk.stages ?? []).find((x) => x.dead === f.id);
    const g = dying && burialTimes(dying, startDay);
    const sick = g && ms >= g.start ? stayAt(f, g.start) : undefined;
    const pose: FigurePose | undefined = sick
      ? {
          id: f.id,
          look: lookOf(f.id),
          lat: deg(sick.home.lat),
          lon: deg(sick.home.lon),
          x: sick.spot.x,
          z: sick.spot.z,
          ...towards(sick.spot.x, sick.spot.z, 0, 0),
          clip: ms < g!.death ? 'ill' : 'lie',
          clipMs: ms - (ms < g!.death ? g!.start : g!.death),
        }
      : poseAt(f, i, ms);
    const lying = pose && { ...pose };
    // From its death, two of the diggers carry it to the grave and lay it in (section 8.2).
    if (sick && ms >= g!.death) {
      const ev = eventOf(sick, g!.w);
      if (ev) Object.assign(pose!, corpseAt(ev, g!, ms));
    }
    // The dead's soul: a see-through copy of them lifting out of the body as it lies, righting
    // itself as it floats up, and fading away (section 8.2).
    if (sick && ms >= g!.death && ms < g!.death + SOUL_MS) {
      const u = (ms - g!.death) / SOUL_MS;
      const stand = smoothstep(Math.min(1, u * 1.6));
      scene.figures.push({
        ...lying!,
        id: -1 - f.id,
        clip: 'idle',
        clipMs: ms - g!.death,
        from: { clip: 'lie', clipMs: ms - g!.death, weight: Math.max(1e-3, stand) },
        soul: { fade: 0.55 * (1 - u), height: 0.15 + 2.6 * u * u },
      });
    }
    if (!pose) continue;
    // Its clothes: the old camp's until it changes in its new hut (peopling.md section 5.3).
    const c = crossing(f, i);
    const st = c && ms < c.end ? undefined : stayOf(f, i);
    const profile = st ? (ms < st.changeAt ? st.wore : st.home.culture) : c?.prev.culture;
    if (profile) pose.profile = profile;
    scene.figures.push(pose);
  }
  // Each hunt's animal, spears and pole, once; an animal lies by the camp after its hunt.
  const shown = new Set<string>();
  // The next turn's too: its animal comes out of the trees before the hunters set out.
  for (const f of chunk.figures)
    for (let k = turnOf(f.id, ms) - 2; k <= turnOf(f.id, ms) + 1; k++) {
      const st = stayAt(f, turnStartOf(f.id, k));
      const h = st && huntOf(st, k);
      if (!h || shown.has(h.id)) continue;
      shown.add(h.id);
      huntProps(h, ms);
    }
  return scene;

  /**
   * A figure's walk from its old camp to its `i`-th home, when that is somewhere else: round
   * the old fire to the edge of the old camp facing the new one, across the land, and in at
   * the edge of the new camp facing the old one, so it never walks through a fire.
   */
  function crossing(f: TreeFigure, i: number) {
    const key = `${f.id}:${i}`;
    if (memo.crossings.has(key)) return memo.crossings.get(key) as ReturnType<typeof crossingOf>;
    const c = crossingOf(f, i);
    memo.crossings.set(key, c);
    return c;
  }
  function crossingOf(f: TreeFigure, i: number) {
    const home = lodgings.get(f.homes[i]![1]);
    const prev = i > 0 ? lodgings.get(f.homes[i - 1]![1]) : undefined;
    if (!home || !prev) return undefined;
    // The band that founds a camp along a route follows the route's way, by canoe across
    // water (peopling.md section 6); everyone else walks straight from camp to camp.
    // A trip to or from an encounter keeps its own way (sites.md section 4.3).
    const walk = f.walks?.find((w) => w[0] === f.homes[i]![0] && w[1] === f.homes[i]![1]);
    const voyage = walk
      ? walk[2]
      : home.voyage && home.built === f.homes[i]![0] && prev.camp !== home.camp
        ? home.voyage
        : undefined;
    const stops: LatLon[] = [
      placeOf(prev),
      ...(voyage?.way.map(([lat, lon]) => ({ lat: deg(lat), lon: deg(lon) })) ?? []),
      placeOf(home),
    ];
    const kms = stops.slice(1).map((b, k) => kmBetween(stops[k]!, b));
    const km = kms.reduce((a, b) => a + b, 0);
    if (km < SAME_PLACE_KM) return undefined;
    const travel = Math.ceil(km / WALK_KM_PER_MS);
    // Each way aimed as it leaves or comes in, at the latitude there.
    const heading = (a: LatLon, b: LatLon, at: LatLon = b) =>
      towards(0, 0, eastOf(a.lon, b.lon) * detCos(at.lat * RAD), b.lat - a.lat);
    const way = heading(stops[0]!, stops[1]!, stops[0]!);
    const inward = heading(stops.at(-2)!, stops.at(-1)!);
    // Each walker leaves and comes in at its own place beside the others (groupOffset).
    const side = ((f.homes[i]![2] % 3) - 1) * GROUP_SIDE_M;
    const exit = {
      x: way.dirX * gateM(prev.camp) - way.dirZ * side,
      z: way.dirZ * gateM(prev.camp) + way.dirX * side,
    };
    const entry = {
      x: -inward.dirX * gateM(home.camp) - inward.dirZ * side,
      z: -inward.dirZ * gateM(home.camp) + inward.dirX * side,
    };
    const out = route(endOfStay(f, i - 1), exit, prev.camp);
    const start = at(f.homes[i]![0]);
    const across = start + Math.ceil(routeLength(out) / PACE.walk);
    const legs = kms.map((k, n) => ({
      from: stops[n]!,
      to: stops[n + 1]!,
      km: k,
      water: voyage?.water[n] ?? false,
      way: heading(stops[n]!, stops[n + 1]!),
    }));
    return { prev, home, way, out, start, across, end: across + travel, exit, entry, legs, km };
  }

  /** Where a figure stands at the end of its stay in its `i`-th home: at its spot, or where it took the lodging down. */
  function endOfStay(f: TreeFigure, i: number): Pt {
    const home = lodgings.get(f.homes[i]![1])!;
    const crew = takers.get(home.id);
    if (crew?.includes(f.id)) return buildSpot(crew.indexOf(f.id), crew.length, home);
    return figureSpot(f.homes[i]![2], home.camp);
  }

  /** The camp event of a camp's window `w`, if any (section 8.1); the same for every member. */
  function eventOf(ref: Stay, w: number): CampEvent | undefined {
    const camp = ref.home.camp;
    const key = `${camp}:${ref.home.lat}:${ref.home.lon}:${w}`;
    if (events.has(key)) return events.get(key);
    events.set(key, undefined);
    const shift = hash32(camp, 113) % TURN_MS;
    const start = w * TURN_MS - shift;
    // A scene's session takes its window: no catch or dance then (section 8.2).
    const stage = (chunk.stages ?? []).find(
      (x) =>
        x.camp === camp &&
        x.lat === ref.home.lat &&
        x.lon === ref.home.lon &&
        stageSessions(x, startDay).some((q) => q.w === w),
    );
    if (stage) {
      // A burial's bearers may be a little longer walking home than the window.
      const ev = stageEvent(
        stage,
        w,
        start,
        start + TURN_MS + (stage.kind === 'burial' ? 2_000 : 0),
      );
      events.set(key, ev);
      return ev;
    }
    const roll = hash01(camp, w, 97);
    const kind =
      roll < CATCH_SHARE
        ? // Not at a compact camp, nor on a steep mountainside (Yang, 2026-10-20).
          isCompact(camp) || ref.home.steep
          ? undefined
          : 'catch'
        : roll < CATCH_SHARE + DANCE_SHARE
          ? 'dance'
          : undefined;
    let ev: CampEvent | undefined;
    if (kind) {
      const until = start + TURN_MS;
      const members = mates(camp)
        .filter((g) => kind === 'dance' || lookOf(g.id) === 'child')
        .map((g) => stayAt(g, start))
        .filter(
          (g): g is Stay =>
            !!g &&
            sameCamp(g, ref) &&
            g.free <= start &&
            g.busy >= until &&
            huntsOf(g, start, until).length === 0,
        );
      if (members.length >= (kind === 'catch' ? 2 : 3))
        ev = planEvent(kind, members, w, start, until);
    }
    events.set(key, ev);
    return ev;
  }

  /** Where a leg plan has a figure at a time, in layout metres. */
  function legPoint(legs: Leg[], ms: number): Pt {
    const leg = legs.find((l) => ms < l.end) ?? legs.at(-1)!;
    const u =
      leg.end === leg.start
        ? 1
        : Math.min(1, Math.max(0, (ms - leg.start) / (leg.end - leg.start)));
    return along(leg.route, u);
  }

  /**
   * The dead between its death and the grave (section 8.2): lifted by the two who dug the
   * grave once it is dug, carried between them, and lowered into it just before it is laid there.
   */
  function corpseAt(
    ev: CampEvent,
    g: NonNullable<ReturnType<typeof burialTimes>>,
    ms: number,
  ): Partial<FigurePose> {
    const [a, b] = [ev.legs.get(ev.members[0]!), ev.legs.get(ev.members[1]!)];
    if (!a || !b || ms < g.carry - CORPSE_LIFT_MS) return {};
    const [pa, pb] = [legPoint(a, ms), legPoint(b, ms)];
    const grave = ev.face!;
    let at = { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 };
    let lift =
      CARRIED_M * smoothstep(Math.min(1, (ms - (g.carry - CORPSE_LIFT_MS)) / CORPSE_LIFT_MS));
    const k = smoothstep(Math.min(1, Math.max(0, (ms - (g.body - LAY_MS)) / LAY_MS)));
    if (k > 0) {
      at = { x: at.x + (grave.x - at.x) * k, z: at.z + (grave.z - at.z) * k };
      lift = CARRIED_M * (1 - k) * 0.6 + 0.1 * (1 - k);
    }
    return { x: at.x, z: at.z, ...towards(at.x, at.z, grave.x, grave.z), lift };
  }

  /**
   * A scene's session (section 8.2): the camp's people free for the whole window walk out
   * beside a lodging to the wall or the grave; one grown-up paints and two watch, or two dig
   * and the others mourn; then they walk back. Undefined when nobody can come.
   */
  function stageEvent(stage: TreeStage, w: number, start: number, until: number) {
    const members = mates(stage.camp)
      .filter((g) => g.id !== stage.dead)
      .map((g) => stayAt(g, start))
      .filter(
        (g): g is Stay =>
          !!g &&
          g.home.camp === stage.camp &&
          g.home.lat === stage.lat &&
          g.home.lon === stage.lon &&
          g.free <= start &&
          g.busy >= until &&
          huntsOf(g, start, until).length === 0,
      );
    const grown = members.filter((m) => lookOf(m.f.id) !== 'child');
    const others = members.filter((m) => lookOf(m.f.id) === 'child');
    // Grown-ups first: the painter, or the two who dig.
    const cast = [...grown, ...others];
    const paint = stage.kind === 'cave-painting';
    const monument = stage.kind === 'monument';
    const sessions = stageSessions(stage, startDay);
    const session = sessions.find((q) => q.w === w)!;
    // A monument is raised in its first sessions and danced round in the rest.
    const dance = monument && sessions.indexOf(session) >= MONUMENT_BUILD_SESSIONS;
    // A grown-up paints or digs where there is one, else a child: children made hand stencils too.
    if (cast.length < (paint ? 1 : monument ? MONUMENT_MIN : 2)) return undefined;
    const stands = stageStands(stage.camp, stage.slot, stage.beyond, stage.kind, dance);
    const { prop, gap, door, at } = stageSpots(stage.camp, stage.slot, stage.beyond);
    const k = stageScale(stage.camp);
    // Into a cave by its mouth, never through the rock; to a monument round its wall and,
    // for the inner ring, in by the gate on the camp's side.
    const mono = (to: Pt) => monumentPath(to, prop, at, k);
    const way = (trip: Itinerary, to: Pt) => {
      trip.go(gap);
      if (monument) for (const q of mono(to)) trip.go(q);
      return paint ? trip.go(door) : trip;
    };
    // The two who dig first carry the dead from where it lies by the fire (section 8.2).
    const dead = paint ? undefined : mates(stage.camp).find((g) => g.id === stage.dead);
    const lying = dead && stayAt(dead, start)?.spot;
    const g = dead ? burialTimes(stage, startDay) : undefined;
    const burial = !!lying && !!g;
    // Each place goes to the next of the cast who can be there when the session begins and
    // back by the end of the window; whoever cannot stays at the camp.
    const chosen: Stay[] = [];
    const legs = new Map<number, Leg[]>();
    let end = start;
    for (const m of cast) {
      const i = chosen.length;
      if (i === stands.length) break;
      const trip = way(new Itinerary(start, m.spot, m.home.camp), stands[i]!).go(stands[i]!);
      if (trip.t > session.begin) continue;
      if (burial && i < 2) {
        // The two who dig: dig the grave, fetch the dead and carry it in, then add the
        // belongings and cover the grave (section 8.2).
        trip.stay(g!.dig, 'idle', prop);
        trip.legs.push({ start: g!.dig, end: g!.digEnd, clip: 'event', route: [stands[i]!] });
        trip.t = g!.digEnd;
        // One takes the feet and one the head, in line with the way they carry it, so the
        // body hangs between them rather than beside or through them.
        const [bx, bz] = [prop.x - lying!.x, prop.z - lying!.z];
        const bl = Math.sqrt(bx * bx + bz * bz) || 1;
        const sign = i === 0 ? -1 : 1;
        const end = (c: Pt): Pt => ({
          x: c.x + (sign * BEARER_HALF_M * bx) / bl,
          z: c.z + (sign * BEARER_HALF_M * bz) / bl,
        });
        trip.go(end(lying!));
        if (trip.t > g!.carry - CORPSE_LIFT_MS) continue;
        trip.stay(g!.carry, 'idle', prop);
        trip.go(end(prop), i === 0 ? 'bearBehind' : 'bearAhead');
        if (trip.t > g!.body - LAY_MS) continue;
        trip.stay(g!.body, 'idle', prop);
        trip.go(stands[i]!);
        trip.legs.push({ start: trip.t, end: session.stop, clip: 'event', route: [stands[i]!] });
        trip.t = session.stop;
      } else {
        trip.stay(session.begin, 'idle', prop);
        trip.legs.push({
          start: session.begin,
          end: session.stop,
          clip: 'event',
          route: [stands[i]!],
        });
        trip.t = session.stop;
      }
      trip.at = stands[i]!;
      if (paint) trip.go(door);
      if (monument) for (const q of mono(stands[i]!).reverse()) trip.go(q);
      trip.go(gap).go(m.spot);
      if (trip.t > until || trip.t > m.busy) continue;
      chosen.push(m);
      legs.set(m.f.id, trip.legs);
      end = Math.max(end, trip.t);
    }
    if (chosen.length < (paint ? 1 : monument ? MONUMENT_MIN : 2)) return undefined;
    return {
      id: `${stage.id}:${w}`,
      kind: paint ? 'paint' : monument ? (dance ? 'celebrate' : 'raise') : 'burial',
      camp: stage.camp,
      members: chosen.map((m) => m.f.id),
      a0: 0,
      r: 0,
      start,
      begin: session.begin,
      stop: session.stop,
      end,
      legs,
      stands: stands.slice(0, chosen.length),
      face: prop,
    } satisfies CampEvent;
  }

  /** Everyone walks to their place on the ring, plays or dances, and walks back. */
  function planEvent(
    kind: 'catch' | 'dance',
    members: Stay[],
    w: number,
    start: number,
    until: number,
  ): CampEvent | undefined {
    const ref = members[0]!;
    // Catch runs round its ring past the people's spots only where there is land all round
    // it; else round the dancers' ring (peopling.md section 4: camps by the water).
    const r = isCompact(ref.home.camp)
      ? layoutOf(ref.home.camp).dance
      : kind === 'catch' && (ref.home.room ?? CATCH_R + 1.5) >= CATCH_R + 1.5
        ? CATCH_R
        : DANCE_R;
    const a0 = hash01(ref.home.camp, w, 99) * 2 * Math.PI;
    const ev: CampEvent = {
      id: `${ref.home.camp}:${w}`,
      kind,
      camp: ref.home.camp,
      members: members.map((m) => m.f.id),
      a0,
      r,
      start,
      begin: start,
      stop: start,
      end: start,
      legs: new Map(),
    };
    const ring = members.map((_, i) => ringPoint(ev, i, 0));
    const trips = members.map((m, i) => new Itinerary(start, m.spot, m.home.camp).go(ring[i]!));
    ev.begin = Math.max(...trips.map((t) => t.t));
    ev.stop = ev.begin + EVENT_MS;
    members.forEach((m, i) => {
      const trip = trips[i]!;
      trip.stay(ev.begin, 'idle', { x: 0, z: 0 });
      trip.legs.push({ start: ev.begin, end: ev.stop, clip: 'event', route: [ring[i]!] });
      trip.t = ev.stop;
      trip.at = eventPoint(ev, i, ev.stop);
      trip.go(m.spot);
      ev.end = Math.max(ev.end, trip.t);
      ev.legs.set(m.f.id, trip.legs);
    });
    if (ev.end > until || members.some((m) => ev.end > m.busy)) return undefined;
    return ev;
  }

  /** The camp events a figure takes part in that overlap a span. */
  function eventsOf(st: Stay, from: number, to: number): CampEvent[] {
    const shift = hash32(st.home.camp, 113) % TURN_MS;
    const out: CampEvent[] = [];
    for (let w = Math.floor((from - TURN_MS + shift) / TURN_MS); w * TURN_MS - shift < to; w++) {
      const ev = eventOf(st, w);
      if (ev && ev.members.includes(st.f.id) && ev.start < to && ev.end > from) out.push(ev);
    }
    return out;
  }

  /** A member's pose in a camp event while it plays or dances. */
  function eventPose(
    ev: CampEvent,
    id: number,
    ms: number,
    base: Pick<FigurePose, 'id' | 'look' | 'lat' | 'lon'>,
  ): FigurePose {
    const i = ev.members.indexOf(id);
    const p = eventPoint(ev, i, ms);
    const tau = ms - ev.begin;
    // At a scene: the painter paints and the others watch; two dig and the others mourn.
    if (ev.kind === 'raise' || ev.kind === 'celebrate') {
      const clip = ev.kind === 'raise' ? 'work' : 'dance';
      return { ...base, ...p, ...towards(p.x, p.z, ev.face!.x, ev.face!.z), clip, clipMs: tau };
    }
    if (ev.kind === 'paint' || ev.kind === 'burial') {
      const working = ev.kind === 'paint' ? i === 0 : i < 2;
      const clip = !working ? 'idle' : ev.kind === 'paint' ? 'paint' : 'work';
      return { ...base, ...p, ...towards(p.x, p.z, ev.face!.x, ev.face!.z), clip, clipMs: tau };
    }
    if (ev.kind === 'dance')
      return { ...base, ...p, ...towards(p.x, p.z, 0, 0), clip: 'dance', clipMs: tau };
    const q = eventPoint(ev, i, ms + 30);
    // A little over half a run, the run clip slowed to match, so the feet do not slide.
    return {
      ...base,
      ...p,
      ...towards(p.x, p.z, q.x, q.z),
      clip: 'run',
      clipMs: Math.round(tau * CATCH_PACE_SHARE),
    };
  }

  /** A few sparks jumping from the flint stones, a pure function of the clock (section 8.1). */
  function sparksAt(p: Place, ms: number): void {
    const at0 = lightSpot(p.first.builder);
    const toward = { x: at0.x * 0.4, z: at0.z * 0.4 };
    for (let k = 0; k < 6; k++) {
      const life = ((ms - p.litStart) / 260 + k / 6) % 1;
      const n = Math.floor((ms - p.litStart) / 260 + k / 6);
      const a = hash01(p.camp, n, k, 101) * 2 * Math.PI;
      const r = 0.6 * life * (0.5 + hash01(p.camp, n, k, 103));
      scene.sparks.push({
        lat: p.lat,
        lon: p.lon,
        x: toward.x + r * detCos(a),
        z: toward.z + r * detSin(a),
        height: 0.15 + 0.5 * life * (1 - 0.6 * life),
        life,
      });
    }
  }

  /** A figure's stay in its `i`-th home: the camp, its spot, its plan up to when it is free, and when it must be busy again. */

  function stayOf(f: TreeFigure, i: number): Stay | undefined {
    const key = `${f.id}:${i}`;
    if (stays.has(key)) return stays.get(key);
    const home = lodgings.get(f.homes[i]![1]);
    let st: Stay | undefined;
    if (home) {
      const s = f.homes[i]![2];
      const spot = figureSpot(s, home.camp);
      const prev = i > 0 ? lodgings.get(f.homes[i - 1]![1]) : undefined;
      const left = at(f.homes[i]![0]);
      const born = at(f.born);
      // Figures that move in on the day their lodging is built help build it.
      const shown = appears.get(home.id)!;
      const builds = f.homes[i]![0] === home.built && shown > 0;
      const crew = builders.get(home.id) ?? [f.id];
      const work = builds ? buildSpot(crew.indexOf(f.id), crew.length, home) : spot;
      const hut = lodgingSpot(home);
      const c = crossing(f, i);
      // The stay, leg by leg: arriving, building, outings and rests, taking down.
      const plan = c
        ? new Itinerary(c.end, c.entry, home.camp)
        : prev
          ? new Itinerary(left, endOfStay(f, i - 1), home.camp)
          : i === 0 && born > 0
            ? // Out of its lodging: crouched through the door, then on its feet.
              new Itinerary(born, hut, home.camp).go(doorOf(home), 'crouch')
            : new Itinerary(-Infinity, spot, home.camp);
      // At a new camp the first builder lights the fire with flint stones (section 8.1).
      const place = places.get(placeKey(home))!;
      if (builds && home === place.first && f.id === home.builder && place.from > 0)
        plan
          .go(lightSpot(f.id))
          .stay(place.litStart, 'idle', { x: 0, z: 0 })
          .stay(place.litEnd, 'strike', { x: 0, z: 0 });
      if (builds) {
        plan
          .go(work)
          .stay(shown, 'idle', hut)
          .stay(shown + BUILD_MS, 'work', hut);
        plan.go(spot);
      } else plan.go(spot);
      // Into a new land: into the hut, and out in its people's clothes (peopling.md section 5.3).
      const wore = prev && prev.culture !== home.culture ? prev.culture : undefined;
      let changeAt = -Infinity;
      if (wore !== undefined) {
        plan.go(doorOf(home)).go(hut, 'crouch');
        changeAt = plan.t + INSIDE_MS / 2;
        plan
          .stay(plan.t + INSIDE_MS, 'inside')
          .go(doorOf(home), 'crouch')
          .go(spot);
      }
      const free = plan.t;
      const next = f.homes[i + 1];
      const leave = next ? at(next[0]) : f.lost !== NEVER ? at(f.lost) : Infinity;
      const takeCrew = takers.get(home.id);
      const takes = !!takeCrew?.includes(f.id) && home.gone !== NEVER;
      const takeSpot = takes ? buildSpot(takeCrew!.indexOf(f.id), takeCrew!.length, home) : spot;
      const takeStart = takes ? takeDown(home) : leave;
      const busy = takes
        ? takeStart - Math.ceil(routeLength(route(spot, takeSpot, home.camp)) / PACE.walk)
        : leave;
      st = {
        f,
        i,
        home,
        look: lookOf(f.id),
        s,
        spot,
        hut,
        plan,
        free,
        busy,
        leave,
        takes,
        takeSpot,
        wore,
        changeAt,
      };
    }
    stays.set(key, st);
    return st;
  }

  /** The stay of a figure at a clock time, if it is alive and at a camp then. */
  function stayAt(f: TreeFigure, t: number): Stay | undefined {
    if (t < at(f.born) || (f.lost !== NEVER && t >= at(f.lost))) return undefined;
    let i = 0;
    while (i + 1 < f.homes.length && at(f.homes[i + 1]![0]) <= t) i++;
    return stayOf(f, i);
  }

  /** The start of a figure's `k`-th turn, and the turn a clock time falls in. */
  function turnStartOf(id: number, k: number): number {
    return k * TURN_MS - (hash32(id, 73) % TURN_MS);
  }
  function turnOf(id: number, t: number): number {
    return Math.floor((t + (hash32(id, 73) % TURN_MS)) / TURN_MS);
  }

  /**
   * What a figure goes out to do in its `k`-th turn on its own, as far as its gap has land
   * (section 8.1): a gathering or a stroll with its legs, a hunt (planned as a camp event
   * by huntOf), or nothing.
   */
  function soloTurn(st: Stay, k: number, plain = false): { go: Outing; trip?: Itinerary } {
    const turnStart = turnStartOf(st.f.id, k);
    if (turnStart < st.free) return { go: 'rest' };
    // After a hunt that brought its kill home, the hunter roasts it on the spit, unless an
    // earlier kill holds the fire (Yang, 2026-10-20). Whether a turn hunts never depends on
    // this (`plain`), so working it out does not reach back through every earlier turn.
    const planned = outingOf(st.f.id, st.look, k);
    const own = !plain && planned !== 'hunt' ? huntOf(st, k - 1) : undefined;
    const roast = !!own && own.pole && killAt(st, turnStart) === own;
    const outing = roast ? 'cook' : planned;
    // Outings stay on land: each goes only as far as its gap has land, or not at all.
    const room = outingRoom(st.s, st.home);
    const kind =
      outing === 'hunt' && room < PREY_REACH_M ? (room >= GATHER_M ? 'gather' : 'rest') : outing;
    const sure = kind === 'gather' && room < GATHER_M ? (room >= 16 ? 'stroll' : 'rest') : kind;
    let go: Outing = sure === 'stroll' && room < 13 ? 'rest' : sure;
    if (go === 'firewood' && room < FIREWOOD_M + 1) go = 'rest';
    // A compact camp has no drying racks.
    if ((go === 'scrape' || go === 'rack' || go === 'flay') && !hasRack(st.home.camp, st.home.slot))
      go = 'rest';
    const camp = st.home.camp;
    const trip = new Itinerary(turnStart, st.spot, st.home.camp);
    const out = (p: Pt): Pt => ({ x: p.x * 2, z: p.z * 2 });
    if (go === 'gather') {
      const far = outingPoint(st.s, camp, GATHER_M);
      trip
        .go(far)
        .stay(trip.t + GATHER_MS, 'work', out(far))
        .go(st.spot, 'carry');
    } else if (go === 'stroll') {
      const far = outingPoint(st.s, camp, 13);
      trip
        .go(far)
        .stay(trip.t + LOOK_MS, 'idle', out(far))
        .go(st.spot);
    } else if (go === 'firewood') {
      // Out among the trees, break branches, back with the bundle.
      const far = outingPoint(st.s, camp, FIREWOOD_M);
      trip
        .go(far)
        .stay(trip.t + BREAK_MS, 'work', out(far))
        .go(st.spot, 'carry');
    } else if (go === 'water' || go === 'fish') {
      // Out through the gap whose land ends nearest, to its last metre, if any is in reach.
      const reach = st.home.reach;
      let gap = 0;
      for (let g = 1; g < reach.length; g++) if (reach[g]! < reach[gap]!) gap = g;
      if (reach[gap]! >= MAX_OUTING_M - 1) return { go: 'rest' };
      const d = gapDirection(camp, gap);
      // At a compact camp people stand close round the fire: water only out along a lane.
      if (isCompact(camp) && reach[gap]! < 10) return { go: 'rest' };
      // Where the water comes within the gap's first metres, to the edge of the camp's room.
      const edge = reach[gap]! >= 10 ? reach[gap]! - 1 : Math.min(9, (st.home.room ?? 9.5) - 0.5);
      // Each a little further back by its spot, so two at the water never stand on one place.
      const back = Math.max(Math.min(6, edge), edge - 2 * (st.s % 6));
      const far = { x: d.x * back, z: d.z * back };
      trip.go(far);
      if (go === 'fish')
        // At the water's edge, spear raised, watching; a stab down; watching again; home
        // with the catch (Yang, 2026-10-20: "can we have coastal people fish").
        trip
          .stay(trip.t + FISH_WATCH_MS, 'idle', out(far))
          .stay(trip.t + FISH_STAB_MS, 'work', out(far))
          .stay(trip.t + FISH_WATCH_MS, 'idle', out(far))
          .stay(trip.t + FISH_STAB_MS, 'work', out(far));
      else trip.stay(trip.t + FILL_MS, 'work', out(far));
      trip.go(st.spot, 'carry');
    } else if (go === 'scrape') {
      // At the drying rack beside its own lodging.
      // Round the end of the rack to behind its middle, never through the hide.
      const rack = rackSpot(st.home);
      const [ux, uz] = [rack.x / RACK_R, rack.z / RACK_R];
      const behind = { x: rack.x + ux * SCRAPE_BACK_M, z: rack.z + uz * SCRAPE_BACK_M };
      const side = { x: behind.x - uz * SCRAPE_SIDE_M, z: behind.z + ux * SCRAPE_SIDE_M };
      trip
        .go(side)
        .go(behind)
        .stay(trip.t + SCRAPE_MS, 'scrape', rack)
        .go(side)
        .go(st.spot);
    } else if (go === 'rack') {
      // A dried hide taken off the rack, carried in to the hut and back out.
      const { side, behind, rack } = rackSides(st.home);
      const door = doorOf(st.home);
      trip
        .go(side)
        .go(behind)
        .stay(trip.t + TAKE_HIDE_MS, 'work', rack)
        .go(side, 'carry')
        .go(door, 'carry')
        .go(lodgingSpot(st.home), 'crouch')
        .stay(trip.t + INSIDE_MS / 2, 'inside')
        .go(door, 'crouch')
        .go(st.spot);
    } else if (go === 'flay') {
      // Only while a kill lies at the camp: skin it, and hang the hide on the rack to dry.
      const meat = killAt(st, turnStart);
      if (!meat) return { go: 'rest' };
      const by = { x: meat.drop.x * 0.88, z: meat.drop.z * 0.88 };
      trip.go(by);
      if (trip.t + FLAY_MS > meat.gone - PREY_FADE_MS) return { go: 'rest' };
      const { side, behind, rack } = rackSides(st.home);
      trip
        .stay(trip.t + FLAY_MS, 'work', meat.drop)
        .go(side, 'carry')
        .go(behind, 'carry')
        .stay(trip.t + HANG_HIDE_MS, 'work', rack)
        .go(side)
        .go(st.spot);
    } else if (go === 'crack') {
      trip.stay(trip.t + CRACK_MS, 'crack', { x: 0, z: 0 });
    } else if (go === 'spear') {
      // A stone point knapped, then bound to the shaft.
      trip
        .stay(trip.t + KNAP_POINT_MS, 'knap', { x: 0, z: 0 })
        .stay(trip.t + KNAP_POINT_MS + BIND_POINT_MS, 'work', { x: 0, z: 0 });
    } else if (go === 'hut') {
      // To the door, crouch inside, stay a while out of sight, crouch out.
      const hut = lodgingSpot(st.home);
      // The door is outside the walls, on the hearth side; the last steps are crouched.
      const door = doorOf(st.home);
      trip
        .go(door)
        .go(hut, 'crouch')
        .stay(trip.t + INSIDE_MS, 'inside')
        .go(door, 'crouch')
        .go(st.spot);
    } else if (go === 'cook') {
      // Only while a kill lies at the camp: butcher it, roast the meat over the fire.
      const meat = killAt(st, turnStart);
      if (!meat) return { go: 'rest' };
      const by = { x: meat.drop.x * 0.88, z: meat.drop.z * 0.88 };
      const fire = lightSpot(st.f.id);
      trip.go(by);
      if (trip.t + BUTCHER_MEAT_MS > meat.gone - PREY_FADE_MS) return { go: 'rest' };
      trip
        .stay(trip.t + BUTCHER_MEAT_MS, 'work', meat.drop)
        .go(fire, 'carry')
        .stay(trip.t + ROAST_MS, 'work', { x: 0, z: 0 }, 'prop-spit')
        .go(st.spot);
    } else return { go };
    return trip.t <= Math.min(st.busy, turnStart + TURN_MS) ? { go, trip } : { go: 'rest' };
  }

  /** The kill of a hunt lying at a figure's camp at a clock time, if any (section 8.1). */
  function killAt(st: Stay, t: number): Hunt | undefined {
    // The one laid down first, whose meat goes on the spit first.
    let first: Hunt | undefined;
    for (const g of mates(st.home.camp)) {
      if (lookOf(g.id) === 'child') continue;
      for (let k = turnOf(g.id, t) - 3; k <= turnOf(g.id, t); k++) {
        const gs = stayAt(g, turnStartOf(g.id, k));
        if (!gs || !sameCamp(gs, st)) continue;
        const h = huntOf(gs, k);
        if (h && h.pole && h.laid <= t && t < h.gone - PREY_FADE_MS)
          if (!first || h.laid < first.laid || (h.laid === first.laid && h.id < first.id))
            first = h;
      }
    }
    return first;
  }

  /** Whether two stays are at the same camp: the same camp number and place. */
  function sameCamp(a: Stay, b: Stay): boolean {
    return a.home.camp === b.home.camp && a.home.lat === b.home.lat && a.home.lon === b.home.lon;
  }

  /**
   * The hunt a figure leads in its `k`-th turn, if it hunts then and it fits (section 8.1):
   * with a helper from its camp when one is free, else alone. The same for every clock time.
   */
  function huntOf(st: Stay, k: number): Hunt | undefined {
    const key = `${st.f.id}:${k}`;
    if (hunts.has(key)) return hunts.get(key);
    hunts.set(key, undefined);
    let hunt: Hunt | undefined;
    const turnStart = turnStartOf(st.f.id, k);
    if (soloTurn(st, k, true).go === 'hunt') {
      const until = Math.min(st.busy, turnStart + TURN_MS);
      // Helpers: grown-ups of the camp, free for the whole hunt, not hunting then and not
      // helping a hunter with a lower id, in an order chosen by hash.
      const helpers = mates(st.home.camp)
        .filter((g) => g.id !== st.f.id && lookOf(g.id) !== 'child')
        .map((g) => stayAt(g, turnStart))
        .filter((h): h is Stay => !!h && sameCamp(h, st) && h.free <= turnStart)
        .sort((a, b) => hash01(st.f.id, k, a.f.id, 83) - hash01(st.f.id, k, b.f.id, 83));
      const fits = (plan: Hunt, party: Stay[]) =>
        plan.end <= until &&
        party.every(
          (h) =>
            plan.end <= h.busy &&
            !huntsDuring(h, turnStart, plan.end) &&
            !helpedBefore(st, h, turnStart, plan.end),
        );
      if (preyKindOf(st, k) === 'animal-mammoth') {
        // A mammoth takes a party of three or four, each throwing a spear (Yang, 2026-10-20:
        // "mammoths need multiple hunters and multiple spears to go down"); without enough
        // free hands the hunter goes after smaller game.
        const party: Stay[] = [];
        for (const h of helpers) {
          if (party.length === MAMMOTH.party - 1) break;
          if (fits(huntPlan(st, k, [...party, h]), [...party, h])) party.push(h);
        }
        if (party.length >= MAMMOTH.party - 2) hunt = huntPlan(st, k, party);
      }
      for (const h of hunt ? [] : helpers) {
        const plan = huntPlan(st, k, [h], true);
        if (!fits(plan, [h])) continue;
        hunt = plan;
        break;
      }
      if (!hunt) {
        const alone = huntPlan(st, k, [], true);
        if (alone.end <= until) hunt = alone;
      }
    }
    // Not where its animal would come out among another camp's people (Yang, 2026-10-20:
    // "when animals like mammoths spawn for the hunt, they often spawn on top of people").
    if (
      hunt &&
      (nearOtherCamp(st, hunt.entry, hunt.appear) || nearOtherCamp(st, hunt.graze, hunt.appear))
    )
      hunt = undefined;
    hunts.set(key, hunt);
    return hunt;
  }

  /** Whether a point of a figure's camp lies near another camp standing at a clock time. */
  function nearOtherCamp(st: Stay, p: Pt, t: number): boolean {
    const lat = deg(st.home.lat);
    const lon = deg(st.home.lon);
    const kmLat = (p.z * LAYOUT_KM_PER_M) / 111.2;
    const kmLon = (p.x * LAYOUT_KM_PER_M) / (111.2 * Math.max(0.05, detCos(lat * RAD)));
    const at = { lat: lat + kmLat, lon: lon + kmLon };
    const reach = OTHER_CAMP_M * LAYOUT_KM_PER_M;
    for (const l of lodgings.values()) {
      if (l.camp === st.home.camp && l.lat === st.home.lat && l.lon === st.home.lon) continue;
      if (msAtDay(l.built, startDay) > t || (l.gone !== NEVER && msAtDay(l.gone, startDay) <= t))
        continue;
      const dLat = deg(l.lat) - at.lat;
      const dLon = (deg(l.lon) - at.lon) * detCos(at.lat * RAD);
      if (Math.sqrt(dLat * dLat + dLon * dLon) * 111.2 < reach) return true;
    }
    return false;
  }

  /** Whether a figure leads a hunt of its own that overlaps a span. */
  function huntsDuring(st: Stay, from: number, to: number): boolean {
    for (let k = turnOf(st.f.id, from) - 1; k <= turnOf(st.f.id, to); k++) {
      if (soloTurn(st, k, true).go !== 'hunt') continue;
      const start = turnStartOf(st.f.id, k);
      if (start < to && start + TURN_MS > from) return true;
    }
    return false;
  }

  /** Whether a hunter of the camp with a lower id than `hunter` already has `helper` in a span. */
  function helpedBefore(hunter: Stay, helper: Stay, from: number, to: number): boolean {
    for (const g of mates(hunter.home.camp)) {
      if (g.id >= hunter.f.id || g.id === helper.f.id) continue;
      for (let k = turnOf(g.id, from - TURN_MS); k <= turnOf(g.id, to); k++) {
        const gs = stayAt(g, turnStartOf(g.id, k));
        if (!gs || !sameCamp(gs, hunter)) continue;
        const h = huntOf(gs, k);
        if (h && h.helpers.includes(helper.f.id) && h.start < to && h.end > from) return true;
      }
    }
    return false;
  }

  /** The hunts in which a figure takes part, as hunter or helper, that overlap a span. */
  function huntsOf(st: Stay, from: number, to: number): Hunt[] {
    const out: Hunt[] = [];
    for (const g of mates(st.home.camp)) {
      if (lookOf(g.id) === 'child') continue;
      for (let k = turnOf(g.id, from - TURN_MS); k <= turnOf(g.id, to); k++) {
        const gs = g.id === st.f.id ? st : stayAt(g, turnStartOf(g.id, k));
        if (!gs || !sameCamp(gs, st)) continue;
        const h = huntOf(gs, k);
        if (
          h &&
          (h.hunter === st.f.id || h.helpers.includes(st.f.id)) &&
          h.start < to &&
          h.end > from
        )
          out.push(h);
      }
    }
    return out;
  }

  /**
   * A hunt from start to end (section 8.1): both walk out, the hunter throws, perhaps
   * misses, picks the spear up and throws again; then they bind the kill to the pole and
   * carry it back, or a hunter alone butchers it and carries the meat.
   */
  /** What a hunt goes after, by hash; a mammoth only where and when it can be (MAMMOTH). */
  function preyKindOf(st: Stay, k: number, small = false): PreyKind {
    const kinds = PREY_OF[st.home.culture ?? ''] ?? PREY_OF['african-stone-age']!;
    const kind = kinds[hash32(st.f.id, k, 79) % kinds.length]!;
    const start = turnStartOf(st.f.id, k);
    if (
      kind === 'animal-mammoth' &&
      (small || start >= at(MAMMOTH_UNTIL) || outingRoom(st.s, st.home) < MAMMOTH.reach)
    ) {
      const others = kinds.filter((x) => x !== 'animal-mammoth');
      return others[hash32(st.f.id, k, 81) % others.length]!;
    }
    return kind;
  }

  function huntPlan(st: Stay, k: number, party: Stay[], small = false): Hunt {
    const camp = st.home.camp;
    const lane = (d: number) => outingPoint(st.s, camp, d);
    const start = turnStartOf(st.f.id, k);
    const kind = preyKindOf(st, k, small);
    const big = kind === 'animal-mammoth';
    const helper = big ? undefined : party[0];
    const grazeM = big ? MAMMOTH.graze : PREY_GRAZE_M;
    const fallM = big ? MAMMOTH.fall : PREY_FALL_M;
    const gapM = big ? MAMMOTH.gap : THROW_GAP_M;
    const out = towards(0, 0, lane(grazeM).x, lane(grazeM).z);
    const side = { x: -out.dirZ, z: out.dirX };
    const offset = (p: Pt, along: number, across: number): Pt => ({
      x: p.x + out.dirX * along + side.x * across,
      z: p.z + out.dirZ * along + side.z * across,
    });
    const graze = lane(grazeM);
    const miss = hash01(st.f.id, k, 87) < MISS_SHARE;
    const kill = miss ? lane(fallM) : graze;
    // The herd comes out of the trees at the far end of the lane, where its land ends.
    const entry = lane(Math.min(outingRoom(st.s, st.home), MAX_OUTING_M) - 1);
    const appear = start - ROAM_MS;
    const arrive =
      appear +
      PREY_FADE_MS +
      Math.ceil(Math.sqrt((entry.x - graze.x) ** 2 + (entry.z - graze.z) ** 2) / PREY_WALK);
    const herdSide = big ? MAMMOTH.herdSide : HERD_SIDE_M;
    const herd = Array.from({ length: 1 + (hash32(st.f.id, k, 89) % 2) }, (_, n) => {
      const sign = n === 0 ? 1 : -1;
      const across = sign * herdSide;
      return {
        entry: offset(entry, 0, across),
        graze: offset(graze, 1.5 * n, across),
        // Its own spot aside, a little short of the trees, where it stands looking back.
        scatter: offset(
          entry,
          -2 - 6 * hash01(st.f.id, k, 91 + n),
          across * (1.3 + 0.4 * hash01(st.f.id, k, 93 + n)),
        ),
        linger: SCATTER_LINGER_MS + Math.round(SCATTER_MORE_MS * hash01(st.f.id, k, 95 + n)),
      };
    });
    if (big) {
      // A mammoth: the party stands in a row across the lane and throws one after another;
      // it struggles from the first spear and goes down with the last. Then they all butcher
      // it where it fell, round it, and carry the meat home.
      const members = [st, ...party];
      const n = members.length;
      const across = (i: number) => (i - (n - 1) / 2) * MAMMOTH.spread;
      const stand = (i: number) => offset(lane(grazeM - gapM), 0, across(i));
      const trips = members.map((m, i) => new Itinerary(start, m.spot, camp).go(stand(i)));
      const ready = Math.max(...trips.map((x) => x.t), arrive + GRAZE_FIRST_MS);
      const flights: Flight[] = members.map((_, i) => ({
        from: stand(i),
        // Into its flank, a little apart, so every spear shows.
        to: offset(graze, (i - (n - 1) / 2) * 1.2, 0),
        release: ready + i * MAMMOTH.throwEvery + RELEASE_MS,
        hit: true,
        pulled: Infinity,
      }));
      trips.forEach((trip, i) => {
        const at = ready + i * MAMMOTH.throwEvery;
        trip.stay(at, 'idle', graze).stay(at + THROW_MS, 'throw', graze);
      });
      const killed = flights.at(-1)!.release + FLIGHT_MS;
      const round: [number, number][] = [
        [-MAMMOTH.kneel, 0],
        [MAMMOTH.kneel, 0],
        [0, MAMMOTH.kneel * 0.7],
        [0, -MAMMOTH.kneel * 0.7],
      ];
      trips.forEach((trip, i) => {
        trip.stay(killed, 'idle', graze);
        const [along, side] = round[i % round.length]!;
        trip.go(offset(graze, along, side));
      });
      const bind = Math.max(...trips.map((x) => x.t));
      trips.forEach((trip, i) => {
        trip.stay(bind, 'idle', graze).stay(bind + MAMMOTH.butcher, 'work', graze);
        trip.go(members[i]!.spot, 'carry');
      });
      for (const f of flights) f.pulled = bind;
      const landed = flights[0]!.release + FLIGHT_MS;
      const herdGone = Math.max(
        0,
        ...herd.map((c) => scatterAt(c, landed) + c.linger + PREY_FADE_MS),
      );
      return {
        id: `${st.f.id}:${k}`,
        spot: st.s,
        camp: st.home.camp,
        hunter: st.f.id,
        helpers: party.map((h) => h.f.id),
        pole: false,
        start,
        end: Math.max(...trips.map((x) => x.t)),
        lat: deg(st.home.lat),
        lon: deg(st.home.lon),
        kind,
        out,
        entry,
        appear,
        arrive,
        herd,
        graze,
        kill: graze,
        drop: lane(DROP_M),
        alert: Infinity,
        killed,
        bind,
        lift: Infinity,
        carry: Infinity,
        put: Infinity,
        laid: Infinity,
        gone: Math.max(herdGone, bind + MAMMOTH.butcher + MAMMOTH.remains + PREY_FADE_MS),
        flights,
        legs: new Map(members.map((m, i) => [m.f.id, trips[i]!.legs] as const)),
      };
    }
    const hunter = new Itinerary(start, st.spot, camp).go(lane(grazeM - gapM));
    const aide = helper && new Itinerary(start, helper.spot, camp).go(lane(grazeM - gapM - 3));
    const ready = Math.max(hunter.t, aide?.t ?? 0, arrive + GRAZE_FIRST_MS);
    hunter.stay(ready, 'idle', graze).stay(ready + THROW_MS, 'throw', graze);
    const flights: Flight[] = [];
    const first = {
      from: lane(grazeM - gapM),
      to: miss ? offset(graze, MISS_BEYOND_M, MISS_SIDE_M) : graze,
      release: ready + RELEASE_MS,
      hit: !miss,
      pulled: Infinity,
    };
    flights.push(first);
    let killed = first.release + FLIGHT_MS;
    let alert = Infinity;
    if (miss) {
      // Walk to the spear, pull it out of the ground, walk closer and throw again.
      hunter.go(offset(first.to, -1.2, 0)).stay(hunter.t + PICK_MS, 'work', first.to);
      first.pulled = hunter.t - PICK_MS / 2;
      alert = first.release + FLIGHT_MS;
      const from = lane(fallM - gapM);
      hunter.go(from);
      const t2 = hunter.t;
      hunter.stay(t2 + THROW_MS, 'throw', kill);
      flights.push({ from, to: kill, release: t2 + RELEASE_MS, hit: true, pulled: Infinity });
      killed = t2 + RELEASE_MS + FLIGHT_MS;
    }
    const thrown = hunter.t;
    const hit = flights.at(-1)!;
    let bind: number;
    let lift = Infinity;
    let carry = Infinity;
    let put = Infinity;
    let laid = Infinity;
    const drop = lane(DROP_M);
    if (aide) {
      // Kneel on either side of the kill and bind its legs to the pole.
      aide.stay(thrown, 'idle', kill);
      hunter.go(offset(kill, 0, KNEEL_SIDE_M));
      aide.go(offset(kill, 0, -KNEEL_SIDE_M));
      bind = Math.max(hunter.t, aide.t);
      hunter.stay(bind, 'idle', kill).stay(bind + BIND_MS, 'work', kill);
      aide.stay(bind, 'idle', kill).stay(bind + BIND_MS, 'work', kill);
      hit.pulled = bind + BIND_MS / 2;
      // To the ends of the pole, the hunter in front; lift it and carry it home in step.
      hunter.go(offset(kill, -POLE_HALF_M, 0));
      aide.go(offset(kill, POLE_HALF_M, 0));
      lift = Math.max(hunter.t, aide.t);
      hunter.stay(lift, 'idle', kill).stay(lift + LIFT_MS, 'work', drop);
      aide.stay(lift, 'idle', kill).stay(lift + LIFT_MS, 'work', drop);
      carry = lift + LIFT_MS;
      hunter.go(offset(drop, -POLE_HALF_M, 0), 'pole');
      aide.go(offset(drop, POLE_HALF_M, 0), 'pole');
      put = Math.max(hunter.t, aide.t);
      hunter.stay(put + PUT_MS, 'work', drop);
      aide.stay(put + PUT_MS, 'work', drop);
      laid = put + PUT_MS;
      hunter.go(st.spot);
      aide.go(helper!.spot);
    } else {
      // Alone: butcher the kill where it fell and carry the meat home.
      hunter.go(offset(kill, big ? -MAMMOTH.kneel : -1.5, 0));
      bind = hunter.t;
      hunter.stay(bind + (big ? MAMMOTH.butcher : BUTCHER_MS), 'work', kill);
      hit.pulled = bind;
      hunter.go(st.spot, 'carry');
    }
    const end = Math.max(hunter.t, aide?.t ?? 0);
    const pole = !!aide && !big;
    const landed = flights[0]!.release + FLIGHT_MS;
    // The last survivor fades once it has run to its spot and stood there.
    const herdGone = Math.max(
      0,
      ...herd.map((c) => scatterAt(c, landed) + c.linger + PREY_FADE_MS),
    );
    const gone = Math.max(
      herdGone,
      pole
        ? laid + DROP_LINGER_MS + PREY_FADE_MS
        : big
          ? bind + MAMMOTH.butcher + MAMMOTH.remains + PREY_FADE_MS
          : bind + BUTCHER_MS + PREY_FADE_MS,
    );
    return {
      id: `${st.f.id}:${k}`,
      spot: st.s,
      camp: st.home.camp,
      hunter: st.f.id,
      helpers: helper ? [helper.f.id] : [],
      pole,
      start,
      end,
      lat: deg(st.home.lat),
      lon: deg(st.home.lon),
      kind,
      out,
      entry,
      appear,
      arrive,
      herd,
      graze,
      kill,
      drop,
      alert,
      killed,
      bind,
      lift,
      carry,
      put,
      laid,
      gone,
      flights,
      legs: new Map([
        [st.f.id, hunter.legs],
        ...(aide ? [[helper!.f.id, aide.legs] as const] : []),
      ]),
    };
  }

  /** The hunted animal, the spears away from the hand and the pole of a hunt at a clock time. */
  function huntProps(h: Hunt, ms: number): void {
    if (ms < h.appear || ms >= h.gone) return;
    const base = { id: h.id, kind: h.kind, lat: h.lat, lon: h.lon };
    const inward = { dirX: -h.out.dirX, dirZ: -h.out.dirZ };
    const sideOn = { dirX: -h.out.dirZ, dirZ: h.out.dirX };
    const fadeIn = Math.min(1, (ms - h.appear) / PREY_FADE_MS);
    const fadeOut = Math.min(1, (h.gone - ms) / PREY_FADE_MS);
    const visibility = Math.min(fadeIn, fadeOut);
    const t = (from: number, to: number) => Math.min(1, Math.max(0, (ms - from) / (to - from)));
    const lerp = (a: Pt, b: Pt, f: number) => ({
      x: a.x + (b.x - a.x) * f,
      z: a.z + (b.z - a.z) * f,
    });
    let prey: PreyPose;
    if (ms < h.arrive)
      // Out of the trees and in to graze.
      prey = {
        ...base,
        ...lerp(h.entry, h.graze, t(h.appear + PREY_FADE_MS, h.arrive)),
        ...inward,
        clip: 'walk',
        clipMs: ms - h.appear,
        visibility,
      };
    else if (
      h.flights.length > 1 &&
      h.alert === Infinity &&
      ms >= h.flights[0]!.release + FLIGHT_MS &&
      ms < h.killed
    )
      // A mammoth struck by the first spears, rearing and stamping until the last.
      prey = {
        ...base,
        ...h.kill,
        ...sideOn,
        clip: 'struggle',
        clipMs: ms - h.flights[0]!.release - FLIGHT_MS,
        visibility,
      };
    else if (ms < h.alert && ms < h.killed)
      // Grazing side on to the camp until the spear comes.
      prey = { ...base, ...h.graze, ...sideOn, clip: 'idle', clipMs: ms - h.arrive, visibility };
    else if (h.alert < Infinity && ms < h.alert + BOLT_MS)
      prey = {
        ...base,
        ...lerp(h.graze, h.kill, t(h.alert, h.alert + BOLT_MS)),
        ...h.out,
        clip: 'run',
        clipMs: ms - h.alert,
        visibility,
      };
    else if (ms < h.killed)
      // Bolted from the missed spear; standing alert, looking back.
      prey = { ...base, ...h.kill, ...inward, clip: 'idle', clipMs: ms - h.alert, visibility };
    else if (ms < h.bind || !h.pole)
      prey = { ...base, ...h.kill, ...sideOn, clip: 'fall', clipMs: ms - h.killed, visibility };
    else if (ms < h.carry)
      prey = { ...base, ...h.kill, ...inward, clip: 'bound', clipMs: ms - h.bind, visibility };
    else if (ms < h.put)
      prey = {
        ...base,
        ...lerp(h.kill, h.drop, t(h.carry, h.put)),
        ...inward,
        clip: 'hung',
        clipMs: ms - h.carry,
        visibility,
      };
    else prey = { ...base, ...h.drop, ...inward, clip: 'bound', clipMs: BIND_MS * 10, visibility };
    scene.prey.push(prey);
    // The rest of the herd: in beside it, grazing, then off to its own spot once a spear
    // lands, where it stands looking back for a while before it fades.
    const landed = h.flights[0]!.release + FLIGHT_MS;
    h.herd.forEach((c, n) => {
      const id = `${h.id}:${n}`;
      const there = scatterAt(c, landed);
      const fades = there + c.linger;
      if (ms >= fades + PREY_FADE_MS) return;
      const seen = Math.min(fadeIn, Math.min(1, (fades + PREY_FADE_MS - ms) / PREY_FADE_MS));
      const herdBase = { ...base, id };
      if (ms < h.arrive)
        scene.prey.push({
          ...herdBase,
          ...lerp(c.entry, c.graze, t(h.appear + PREY_FADE_MS, h.arrive)),
          ...inward,
          clip: 'walk',
          clipMs: ms - h.appear + 137 * n,
          visibility: seen,
        });
      else if (ms < landed)
        scene.prey.push({
          ...herdBase,
          ...c.graze,
          ...sideOn,
          clip: 'idle',
          clipMs: ms - h.arrive + 911 * n,
          visibility: seen,
        });
      else if (ms < there)
        scene.prey.push({
          ...herdBase,
          ...lerp(c.graze, c.scatter, t(landed, there)),
          ...towards(c.graze.x, c.graze.z, c.scatter.x, c.scatter.z),
          clip: 'run',
          clipMs: ms - landed,
          visibility: seen,
        });
      else
        scene.prey.push({
          ...herdBase,
          ...c.scatter,
          ...inward,
          clip: 'idle',
          clipMs: ms - there + 577 * n,
          visibility: seen,
        });
    });
    // The trees make way along the hunter's lane while the hunt is on (as for the animals,
    // wildlife.md section 4), so trees beyond the camp's clearing never hide it.
    for (const d of [DROP_M + 4, (DROP_M + PREY_FALL_M) / 2, PREY_FALL_M - 2])
      scene.clearings.push({
        lat: h.lat,
        lon: h.lon,
        ...outingPoint(h.spot, h.camp, d),
        km: HUNT_CLEARING_KM,
        amount: visibility,
        felling: ms < h.end,
      });

    // The spears: in the air, stuck in the animal or the ground, or back in the hand.
    h.flights.forEach((fl, n) => {
      const land = fl.release + FLIGHT_MS;
      if (ms < fl.release || ms >= fl.pulled) return;
      const dist = Math.sqrt((fl.to.x - fl.from.x) ** 2 + (fl.to.z - fl.from.z) ** 2);
      const way = towards(fl.from.x, fl.from.z, fl.to.x, fl.to.z);
      const id = `${h.id}:${n}`;
      if (ms < land) {
        // At the figures' scale: three layout metres to a life-size one.
        const life = dist / 3;
        const f = (ms - fl.release) / FLIGHT_MS;
        const end = fl.hit ? HIT_H : 0;
        const arc = SPEAR_ARC * life;
        const height = HAND_H + (end - HAND_H) * f + 4 * f * (1 - f) * arc;
        const climb = end - HAND_H + 4 * arc * (1 - 2 * f);
        scene.spears.push({
          id,
          lat: h.lat,
          lon: h.lon,
          ...lerp(fl.from, fl.to, f),
          ...way,
          height,
          slope: climb / life,
        });
      } else {
        // Stuck: in the grass, slanting down from where it came; or in the animal, sinking
        // with it as it falls.
        const sink = fl.hit ? Math.min(1, (ms - land) / 1000) : 0;
        const back = 0.5;
        scene.spears.push({
          id,
          lat: h.lat,
          lon: h.lon,
          x: fl.to.x - way.dirX * back,
          z: fl.to.z - way.dirZ * back,
          ...way,
          height: fl.hit ? HIT_H - 0.45 * sink : 0.55,
          slope: fl.hit ? -0.5 - 0.3 * sink : -1.3,
        });
      }
    });

    // The pole: laid along the bound legs, lifted onto the shoulders, carried, laid down.
    if (!h.pole || ms < h.bind + BIND_MS / 2) return;
    let height = POLE_ON_GROUND_M;
    let at = h.kill;
    if (ms >= h.lift && ms < h.carry)
      height += (POLE_ON_SHOULDERS_M - POLE_ON_GROUND_M) * smoothstep(t(h.lift, h.carry));
    else if (ms >= h.carry && ms < h.put) {
      height = POLE_ON_SHOULDERS_M;
      at = lerp(h.kill, h.drop, t(h.carry, h.put));
    } else if (ms >= h.put) {
      at = h.drop;
      height += (POLE_ON_SHOULDERS_M - POLE_ON_GROUND_M) * (1 - smoothstep(t(h.put, h.laid)));
    }
    scene.poles.push({ id: h.id, lat: h.lat, lon: h.lon, ...at, ...inward, height });
  }

  /**
   * Whether a clock time falls in the turn in which a burial's dead falls ill (section 8.2): it
   * stays at its place by the fire then, so it never goes into its lodging and reappears.
   */
  function fallsIllIn(id: number, ms: number): boolean {
    const stage = (chunk.stages ?? []).find((x) => x.dead === id);
    const g = stage && burialTimes(stage, startDay);
    return !!g && turnOf(id, ms) === turnOf(id, g.start);
  }

  function poseAt(f: TreeFigure, i: number, ms: number): FigurePose | undefined {
    const home = lodgings.get(f.homes[i]![1]);
    if (!home) return undefined;
    const look = lookOf(f.id);
    const base = { id: f.id, look, lat: deg(home.lat), lon: deg(home.lon) };
    const c = crossing(f, i);
    if (c && ms < c.across) {
      // Leaving: round the old fire to the edge of the old camp.
      const p = along(c.out, (ms - c.start) / (c.across - c.start));
      return {
        ...base,
        lat: deg(c.prev.lat),
        lon: deg(c.prev.lon),
        x: p.x,
        z: p.z,
        ...(p.dirX || p.dirZ ? { dirX: p.dirX, dirZ: p.dirZ } : c.way),
        clip: 'walk',
        clipMs: ms - c.start,
      };
    }
    if (c && ms < c.end) {
      // On the way to the new home: across the land, from the edge of one camp to the next,
      // leg by leg, paddling a canoe where a leg crosses water.
      const t = (ms - c.across) / (c.end - c.across);
      let km = t * c.km;
      let n = 0;
      while (n + 1 < c.legs.length && km > c.legs[n]!.km) km -= c.legs[n++]!.km;
      const leg = c.legs[n]!;
      const u = leg.km > 0 ? Math.min(1, km / leg.km) : 1;
      const pose: FigurePose = {
        ...base,
        lat: leg.from.lat + (leg.to.lat - leg.from.lat) * u,
        lon: wrapLon(leg.from.lon + eastOf(leg.from.lon, leg.to.lon) * u),
        // From the edge of the old camp on its first leg, to the edge of the new one on its
        // last: a straight walk has both, a route keeps to its way in between; each walker
        // keeps its own place in the group, beside and behind the others.
        ...groupOffset(
          edgeOffset(c, n, u, t),
          leg.way,
          f.homes[i]![2],
          t,
          c.km,
          // Along a route's way, between the camps' edges, the walker keeps its side too.
          c.legs.length === 1
            ? 0
            : ((f.homes[i]![2] % 3) - 1) *
                GROUP_SIDE_M *
                (n === 0 ? u : n === c.legs.length - 1 ? 1 - u : 1),
        ),
        ...leg.way,
        clip: leg.water ? 'paddle' : 'walk',
        clipMs: ms - c.start,
      };
      if (leg.water)
        scene.props.push({
          id: `canoe:${f.id}`,
          kind: 'prop-canoe',
          lat: pose.lat,
          lon: pose.lon,
          x: pose.x,
          z: pose.z,
          dirX: pose.dirX,
          dirZ: pose.dirZ,
        });
      return pose;
    }

    const st = stayOf(f, i)!;
    const plan = new Itinerary(st.plan.t, st.plan.at, st.home.camp);
    plan.legs.push(...st.plan.legs);
    let unarmed = false;
    let event: CampEvent | undefined;
    if (ms >= st.busy && st.takes) {
      plan.stay(Math.max(st.free, st.busy), 'rest').go(st.takeSpot).stay(st.leave, 'work', st.hut);
    } else if (ms >= st.free && !fallsIllIn(f.id, ms)) {
      // Turns of the day: the hunts it takes part in, else its own outing, or a rest.
      const k = turnOf(f.id, ms);
      const turnStart = turnStartOf(f.id, k);
      const joined = huntsOf(st, turnStart, turnStart + TURN_MS).sort((a, b) => a.start - b.start);
      const hunt = joined.find((h) => ms < h.end) ?? joined.at(-1);
      const games = hunt ? [] : eventsOf(st, turnStart, turnStart + TURN_MS);
      const game = games.find((e) => ms < e.end) ?? games.at(-1);
      if (hunt) {
        plan.stay(hunt.start, 'rest');
        plan.legs.push(...hunt.legs.get(f.id)!);
        plan.t = hunt.end;
        if (hunt.hunter === f.id)
          unarmed = hunt.flights.some((fl) => ms >= fl.release && ms < fl.pulled);
      } else if (game) {
        plan.stay(game.start, 'rest');
        plan.legs.push(...game.legs.get(f.id)!);
        plan.t = game.end;
        event = game;
      } else {
        const own = soloTurn(st, k);
        if (own.trip && turnStart >= st.free) {
          plan.stay(turnStart, 'rest');
          plan.legs.push(...own.trip.legs);
          plan.t = own.trip.t;
        }
      }
    }
    plan.stay(Infinity, 'rest');

    // The leg under way, eased from the one before.
    const n = plan.legs.findIndex((l) => ms < l.end);
    const leg = plan.legs[n]!;
    const before = plan.legs[n - 1];
    const f01 =
      leg.end === Infinity || leg.end === leg.start ? 0 : (ms - leg.start) / (leg.end - leg.start);
    const p = along(leg.route, f01);
    const face = leg.face
      ? towards(p.x, p.z, leg.face.x, leg.face.z)
      : p.dirX || p.dirZ
        ? { dirX: p.dirX, dirZ: p.dirZ }
        : towards(p.x, p.z, 0, 0);
    if (leg.prop === 'prop-spit' && !scene.props.some((q) => q.id === `spit:${home.camp}`))
      scene.props.push({
        id: `spit:${home.camp}`,
        kind: 'prop-spit',
        lat: base.lat,
        lon: base.lon,
        x: 0,
        z: 0,
        ...towards(0, 0, p.x, p.z),
      });
    if (leg.clip === 'event' && event) return eventPose(event, f.id, ms, base);
    const motion =
      leg.clip === 'rest'
        ? activity(f.id, ms, look !== 'child')
        : leg.clip === 'inside' || leg.clip === 'event'
          ? { clip: 'idle' as const, clipMs: 0 }
          : { clip: leg.clip, clipMs: ms - (leg.start === -Infinity ? 0 : leg.start) };
    const pose: FigurePose = { ...base, x: p.x, z: p.z, ...face, ...motion };
    if (leg.clip === 'inside') pose.hidden = true;
    if (unarmed) pose.unarmed = true;
    if (
      before &&
      ms - leg.start < BLEND_MS &&
      before.clip !== leg.clip &&
      before.clip !== 'rest' &&
      before.clip !== 'inside' &&
      before.clip !== 'event' &&
      leg.clip !== 'inside'
    )
      pose.from = {
        clip: before.clip,
        clipMs: ms - before.start,
        weight: (ms - leg.start) / BLEND_MS,
      };
    else if (
      before?.clip === 'rest' &&
      ms - leg.start < BLEND_MS &&
      leg.clip !== 'rest' &&
      leg.clip !== 'inside'
    ) {
      const was = activity(f.id, leg.start, look !== 'child').clip;
      if (was !== leg.clip)
        pose.from = { clip: was, clipMs: ms - leg.start, weight: (ms - leg.start) / BLEND_MS };
    }
    return pose;
  }
}

/** A camp event (section 8.1): children's catch or a dance round the fire. */
interface CampEvent {
  id: string;
  /** Catch and dancing, or a scene's session (section 8.2). */
  kind: 'catch' | 'dance' | 'paint' | 'burial' | 'raise' | 'celebrate';
  camp: number;
  /** Figure ids, in their order round the ring. */
  members: number[];
  a0: number;
  r: number;
  /** Everyone sets off at start, is in place at begin, stops at stop and is back by end. */
  start: number;
  begin: number;
  stop: number;
  end: number;
  legs: Map<number, Leg[]>;
  /** At a scene: where each member stands, and what they face. */
  stands?: Pt[];
  face?: Pt;
}

/** Catch is played at this share of a full run. */
const CATCH_PACE_SHARE = 0.6;

/** Member i's place on the ring at a share of its own turning (radians already run). */
function ringPoint(ev: CampEvent, i: number, turned: number): Pt {
  const a = ev.a0 + (2 * Math.PI * i) / ev.members.length + turned;
  return { x: ev.r * detCos(a), z: ev.r * detSin(a) };
}

/**
 * Where member i is at a clock time while the event runs: dancers turn slowly round the
 * fire; in catch everyone runs round the ring, and in each chase "it" runs on ahead along
 * the ring to catch the next and drops back into its place, so nobody crosses the fire.
 */
function eventPoint(ev: CampEvent, i: number, ms: number): Pt {
  if (ev.stands) return ev.stands[i]!;
  const tau = Math.min(Math.max(0, ms - ev.begin), ev.stop - ev.begin);
  const n = ev.members.length;
  if (ev.kind === 'dance') return ringPoint(ev, i, (tau * PACE.walk * 0.12) / ev.r);
  const turned = (tau * PACE.run * CATCH_PACE_SHARE) / ev.r;
  const j = Math.floor(tau / CHASE_MS);
  const u = (tau - j * CHASE_MS) / CHASE_MS;
  if (j % n !== i) return ringPoint(ev, i, turned);
  const ahead = (2 * Math.PI) / n;
  const s = u < 0.7 ? smoothstep(u / 0.7) : 1 - smoothstep((u - 0.7) / 0.3);
  return ringPoint(ev, i, turned + s * ahead);
}

/** A place a camp stands (section 8.1): its time span, tree cover and the founding times. */
interface Place {
  camp: number;
  lat: number;
  lon: number;
  from: number;
  to: number;
  wood: number;
  /** Its first lodging, whose builder lights the fire. */
  first: TreeLodging;
  fellEnd: number;
  litStart: number;
  litEnd: number;
}

/** Where walks reach a lodging's door: outside its walls, on the hearth side. */
function doorOf(l: TreeLodging): Pt {
  const p = lodgingSpot(l);
  const k = 1 - doorM(l.camp) / ringOf(l.camp);
  return { x: p.x * k, z: p.z * k };
}

/** Where the drying rack of a lodging slot stands: behind the lodging, out of the lanes. */
/**
 * Whether a lodging place of a camp has a drying rack behind it: about one in three, by hash,
 * never at a compact camp (section 8.1; Yang, 2026-10-19: "every camp has hides hung up.
 * that's weird. let's only have some").
 */
export function hasRack(camp: number, slot: number): boolean {
  return !isCompact(camp) && hash32(camp, slot, 151) % 3 === 0;
}

function rackAt(camp: number, slot: number): Pt {
  const p = slotPoint(camp, slot);
  return { x: (p.x * RACK_R) / LODGING_RING_M, z: (p.z * RACK_R) / LODGING_RING_M };
}

/** Where a figure stands behind a lodging's rack, the way round its end to there, and the rack. */
function rackSides(l: TreeLodging): { side: Pt; behind: Pt; rack: Pt } {
  const rack = rackSpot(l);
  const [ux, uz] = [rack.x / RACK_R, rack.z / RACK_R];
  const behind = { x: rack.x + ux * SCRAPE_BACK_M, z: rack.z + uz * SCRAPE_BACK_M };
  const side = { x: behind.x - uz * SCRAPE_SIDE_M, z: behind.z + ux * SCRAPE_SIDE_M };
  return { side, behind, rack };
}

function rackSpot(l: TreeLodging): Pt {
  return rackAt(l.camp, l.slot);
}

/** Where a figure kneels to light the fire: beside the hearth, on a side of its own. */
function lightSpot(id: number): Pt {
  const a = hash01(id, 109) * 2 * Math.PI;
  return { x: LIGHT_M * detCos(a), z: LIGHT_M * detSin(a) };
}

/** A spear's flight in a hunt: from the hand to the animal or the grass, and when it is pulled out. */
interface Flight {
  from: Pt;
  to: Pt;
  release: number;
  hit: boolean;
  pulled: number;
}

/** A hunt (section 8.1): who takes part, the places and the moments of its steps. */
interface Hunt {
  id: string;
  /** The hunter's spot at the hearth and the camp, whose lane the hunt follows. */
  spot: number;
  camp: number;
  hunter: number;
  /** Who hunts with the hunter: one helper, or for a mammoth the rest of the party. */
  helpers: number[];
  /** Hunter and helper carry the kill home on the pole (not a mammoth, not alone). */
  pole: boolean;
  start: number;
  end: number;
  lat: number;
  lon: number;
  kind: PreyKind;
  /** The hunter's lane, out from the hearth. */
  out: { dirX: number; dirZ: number };
  /**
   * Where the hunted animal comes out of the trees, when it does (ROAM_MS before the
   * hunters set out, so it is seen grazing first), and when it has walked in to graze.
   */
  entry: Pt;
  appear: number;
  arrive: number;
  /**
   * One or two of its herd, which walk in beside it, scatter to their own spots when the
   * spear lands, stand there for `linger` and fade one by one.
   */
  herd: HerdMate[];
  graze: Pt;
  kill: Pt;
  drop: Pt;
  /** When a missed spear lands and the animal bolts (Infinity without a miss). */
  alert: number;
  killed: number;
  bind: number;
  lift: number;
  carry: number;
  put: number;
  laid: number;
  /** When the animal has faded away. */
  gone: number;
  flights: Flight[];
  legs: Map<number, Leg[]>;
}

interface HerdMate {
  entry: Pt;
  graze: Pt;
  scatter: Pt;
  linger: number;
}

/** When a herd mate that bolts as the first spear lands reaches its spot aside. */
function scatterAt(c: HerdMate, landed: number): number {
  return (
    landed +
    Math.ceil(Math.sqrt((c.scatter.x - c.graze.x) ** 2 + (c.scatter.z - c.graze.z) ** 2) / PACE.run)
  );
}

const smoothstep = (x: number) => x * x * (3 - 2 * x);
