// Hunts (spec humankind.md section 8.1): prey, spear throws and bow shots, carrying the kill
// home, and the herds' and hunts' plans.

import { astronomicalYear, dayOfYearStart, type Day } from '../../time/calendar.ts';
import type { TreeStage } from '../tree.ts';
import { TEMPO, LAYOUT_KM_PER_M, WALK_M_PER_S, type Pt, PACE } from './units.ts';
import { MAX_OUTING_M } from './camp.ts';
import type { Leg } from './routes.ts';

/** How long gatherers pick, hunters butcher and strollers look about at the far end. */
export const GATHER_MS = Math.round(9000 / TEMPO);

export const BUTCHER_MS = Math.round(4000 / TEMPO);

export const LOOK_MS = Math.round(4000 / TEMPO);

/**
 * Prey of a hunt grazes this far out in its hunter's lane, flees to this far when the hunter
 * runs at it and falls there; the hunter stops short of it to butcher (layout metres).
 */
export const PREY_GRAZE_M = 34;

export const PREY_FALL_M = 40;

export const PREY_REACH_M = PREY_FALL_M + 4;

/** Gatherers pick this far out (layout metres). */
export const GATHER_M = 22;

/** Prey fades in when the hunter sets out and out once the meat is carried off. */
export const PREY_FADE_MS = 400;

/** The animals the first people hunt (wildlife.md section 6 models). */
export type PreyKind =
  | 'animal-zebra'
  | 'animal-eland'
  | 'animal-gazelle'
  | 'animal-kangaroo'
  | 'animal-reindeer'
  | 'animal-guanaco'
  | 'animal-mammoth'
  | 'animal-aurochs'
  // A village's herd (section 8.5).
  | 'animal-sheep'
  | 'animal-goat'
  | 'animal-cattle'
  | 'animal-pig'
  | 'animal-dog'
  | 'animal-zebu'
  | 'animal-water-buffalo'
  | 'animal-llama'
  | 'animal-guinea-pig';

/**
 * Hunts (section 8.1): the hunter throws from this far short of the animal (layout
 * metres; about 5 life-size metres at the figures' scale, so the flight reads), and a
 * missed spear sticks this far beyond it, a little to the side; the animal bolts this far.
 */
export const THROW_GAP_M = 16;

export const MISS_BEYOND_M = 5;

export const MISS_SIDE_M = 1.6;

/** About one throw in three misses (section 8.1). */
export const MISS_SHARE = 0.35;

/** The throw clip runs this long; the spear leaves the hand at THROW_RELEASE (0.55 s of clip). */
export const THROW_MS = Math.ceil(1600 / TEMPO);

export const RELEASE_MS = Math.round(550 / TEMPO);

/** A spear is in the air this long. */
export const FLIGHT_MS = 600;

/** It leaves the hand this high and lands this high in the animal, in life-size metres. */
export const HAND_H = 1.7;

export const HIT_H = 1.05;

/** The arc of a flight rises by this share of its length at the figures' scale. */
export const SPEAR_ARC = 0.18;

/** The animal runs from the missed spear for this long. */
export const BOLT_MS = 450;

/** A hunter pulls a missed spear out of the ground over this long. */
export const PICK_MS = Math.round(1200 / TEMPO);

/** Hunter and helper kneel this far to either side of the kill, and bind it for BIND_SECONDS. */
export const KNEEL_SIDE_M = 3.5;

export const BIND_MS = Math.ceil(2400 / TEMPO);

/**
 * Half the length of the carrying pole in layout metres (1.6 life-size metres at the figures'
 * scale), and how long lifting it and laying it down take.
 */
export const POLE_HALF_M = 4.5;

export const LIFT_MS = Math.round(1200 / TEMPO);

export const PUT_MS = Math.round(1200 / TEMPO);

/**
 * Height of the pole on the carriers' shoulders and of its middle lying on the ground, in
 * life-size metres (POLE_HEIGHT in assets/src/clips.ts, POLE_R in assets/src/shelters.ts).
 */
export const POLE_ON_SHOULDERS_M = 1.42;

export const POLE_ON_GROUND_M = 0.045;

/** The kill is carried to here in the hunter's gap, between the people and the lodgings. */
export const DROP_M = 14;

/** It lies there this long before it fades away. */
export const DROP_LINGER_MS = Math.round(40_000 / TEMPO);

/** Trees make way this far round points of a hunt's lane, in drawn kilometres. */
/** How far the trees keep from a scene's middle, in layout metres at a full camp. */
export const STAGE_CLEARING_M: Record<TreeStage['kind'], number> = {
  'cave-painting': 22,
  burial: 8,
  monument: 20,
  'bone-hut': 16,
};

export const HUNT_CLEARING_KM = 8 * LAYOUT_KM_PER_M;

/**
 * The hunted animal and one or two of its herd walk in from the treeline at the far end of
 * the hunter's lane (Yang, 2026-10-19: animals appeared out of thin air), at this pace in
 * layout metres per millisecond, a little apart; they graze this long before the hunter
 * throws, and the companions bolt back to the trees when the spear lands.
 */
export const PREY_WALK = (WALK_M_PER_S * 2.4 * TEMPO) / 1000;

export const HERD_SIDE_M = 3.5;

export const GRAZE_FIRST_MS = Math.round(1500 / TEMPO);

/**
 * The hunted animal comes out of the trees this long before the hunters set out, and grazes,
 * so it is seen in its place before the hunt (Yang, 2026-10-20: "they should spawn and roam
 * for some time before being hunted").
 */
export const ROAM_MS = Math.round(30_000 / TEMPO);

/** A hunted animal keeps this far from another camp's hearth, where its people are (layout m). */
export const OTHER_CAMP_M = 25;

/** A monument's visitors come from camps within this many layout metres: up to two camps, two people each. */
export const VISIT_M = 60;

export const VISIT_SLACK_MS = 8000;

/** Visitors set out this long before the session's start, to be at their places when it begins. */
export const VISIT_EARLY_MS = 4000;

export const VISIT_CAMPS = 2;

export const VISIT_PEOPLE = 2;

/**
 * The survivors scatter to their own spots aside, stand there looking back for this long and
 * more by hash, and fade one by one (Yang, 2026-10-19: they should not fade right away).
 */
export const SCATTER_LINGER_MS = Math.round(10_000 / TEMPO);

export const SCATTER_MORE_MS = Math.round(10_000 / TEMPO);

/**
 * Mammoth hunts (Yang, 2026-10-19: "implement mammoth hunting"): a mammoth is far too big
 * for the pole, so hunter and helper butcher it where it falls and carry the meat home, and
 * its remains lie there a while. Being large, it grazes further out, the hunter throws from
 * further off and the herd keeps further apart; only in lanes with land to MAX_OUTING_M, and
 * only while mammoths lived on the mainland, to 10,000 BCE (wildlife.md section 2).
 */
export const MAMMOTH = {
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

/** Hunters of every culture but the Neanderthals' shoot with bows from about 45,000 BCE (section 8.1). */
export const BOW_FROM: Day = dayOfYearStart(astronomicalYear(45_000, 'BCE'));

/** The shoot clip runs this long; the arrow leaves the string at SHOOT_RELEASE_MS. */
export const SHOOT_MS = Math.ceil(2400 / TEMPO);

export const SHOOT_RELEASE_MS = Math.round(1100 / TEMPO);

/** A wounded animal walks on for this long, slowly, and a bow hunter lets it settle before the next arrow. */
export const WOUND_MS = Math.ceil(4000 / TEMPO);

export const SETTLE_MS = 300;

/** The larger game takes two arrows. */
export const LARGE_GAME: ReadonlySet<PreyKind> = new Set([
  'animal-zebra',
  'animal-eland',
  'animal-reindeer',
  'animal-aurochs',
]);

/** Each arrow strikes an animal this much further out along the lane than the one before. */
export const BOW_STEP_M = 3;

/** The bow is held this far ahead of the archer and this far to his left, the arrow leaves the string at this height (life-size metres). */
export const BOW_AHEAD_M = 0.6;

export const BOW_ASIDE_M = 0.2;

export const BOW_H = 1.38;

/** The arrow's middle at the draw, ahead of the archer in life-size metres: at rest on the bow, then drawn back. */
export const NOCK_REST_M = 0.9;

export const NOCK_DRAWN_M = 0.4;

export const MAMMOTH_UNTIL: Day = dayOfYearStart(astronomicalYear(10_000, 'BCE'));

/** A spear's flight in a hunt: from the hand to the animal or the grass, and when it is pulled out. */
export interface Flight {
  from: Pt;
  to: Pt;
  release: number;
  hit: boolean;
  pulled: number;
}

/** A hunt (section 8.1): who takes part, the places and the moments of its steps. */
export interface Hunt {
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
  /** The hunter shoots with a bow (from BOW_FROM), the party too. */
  bow: boolean;
  /** A bow hunt's animal moves on after an arrow that does not kill it: when, how long, from where to where, running or walking. */
  steps: { at: number; dur: number; from: Pt; to: Pt; run: boolean }[];
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

export interface HerdMate {
  entry: Pt;
  graze: Pt;
  scatter: Pt;
  linger: number;
}

/** When a herd mate that bolts as the first spear lands reaches its spot aside. */
export function scatterAt(c: HerdMate, landed: number): number {
  return (
    landed +
    Math.ceil(Math.sqrt((c.scatter.x - c.graze.x) ** 2 + (c.scatter.z - c.graze.z) ** 2) / PACE.run)
  );
}
