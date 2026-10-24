// Scenes at anchors (spec humankind.md section 8.2): cave paintings, burials, the monument and the
// bone hut, their places beyond the ring of lodgings, their sessions and timings.

import { hash32 } from '../../core/hash.ts';
import { detAtan2, detCos, detSin } from '../../core/detmath.ts';
import { msAtDay } from '../../time/rate.ts';
import type { Day } from '../../time/calendar.ts';
import type { TreeStage } from '../tree.ts';
import { MINIMAL_SITE, COMPACT_SITE, slotPoint, ringOf, gapDirection, TURN_MS } from './camp.ts';
import { type Pt, TEMPO } from './units.ts';

/**
 * A scene at an anchor stands this far beyond the ring of lodgings (humankind.md section 8.2),
 * or, where the land is too narrow, nearer: the first of these that is dry.
 */
export const STAGE_BEYOND_M = [12, 10, 8];

/** A cave's hill stands further out, so its watchers are clear of the lodging in front of it. */
export const CAVE_BEYOND_M = [12, 10, 8];

/** A monument stands further out still: its ring is 11 metres across and its dancers round it. */
export const MONUMENT_BEYOND_M = [15, 14, 13];

/** A monument is raised in this many sessions and danced round in as many (humankind.md section 8.2). */
export const MONUMENT_BUILD_SESSIONS = 6;

export const MONUMENT_DANCE_SESSIONS = 6;

/** Its first session falls this many windows after the anchor's day, the guests having walked there. */
export const MONUMENT_LEAD_WINDOWS = 4;

/** The ring sinks into the ground by itself over its last 250 years, linearly with the date. */
export const MONUMENT_SINK_DAYS = Math.round(250 * 365.2425);

/** The monument's model is drawn at this share of the scene's size: a small enclosure. */
export const MONUMENT_SCALE = 0.48;

/** Layout metres in one of the ring's own metres: a figure's metre is three layout metres. */
export const MONUMENT_M = MONUMENT_SCALE * 3;

/** The model's own metres: the rings the walkers go round by, outside the wall and inside it. */
export const MONUMENT_OUT_R = 7.6;

export const MONUMENT_IN_R = 2.6;

/** A cave's cut and this many layout metres round it keep clear of water where they can. */
export const CAVE_WATER_CLEAR_M = 16;

/** A bone hut is seven metres across at a full camp, with its pile of bones beside it. */
export const BONE_HUT_BEYOND_M = [15, 13, 11];

/** Mammoths are hunted, their bones taken out and carried, and the hut built, in this many rounds. */
export const BONE_ROUNDS = 3;

/** A round's windows: the hunt in the first, the bones taken out in the third, carried and built in with in the fourth. */
export const BONE_ROUND_WINDOWS = 4;

export const stageBeyond = (kind: TreeStage['kind']) =>
  kind === 'cave-painting'
    ? CAVE_BEYOND_M
    : kind === 'monument'
      ? MONUMENT_BEYOND_M
      : kind === 'bone-hut'
        ? BONE_HUT_BEYOND_M
        : STAGE_BEYOND_M;

/** A scene's prop and places at a full, a compact and a minimal camp, as a share of full size. */
export const stageScale = (camp: number) =>
  camp >= MINIMAL_SITE ? 0.5 : camp >= COMPACT_SITE ? 0.75 : 1;

/** Mourners stand round a grave this far from it, on the hearth's side. */
export const MOURN_R = 5.5;

/** At most this many mourners at a burial, round the grave. */
export const MOURNERS = 6;

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
  // A bone hut's pile of bones beside it, and the place by it where bones are taken up.
  const pile = at(3, 16);
  const pick = at(3, 12);
  return { prop, u, at, gap, door, pile, pick };
}

/** A monument's session needs at least this many people (humankind.md section 8.2). */
export const MONUMENT_MIN = 3;

/** At most this many people at a session, and the pause between one setting out and the next. */
export const MONUMENT_MAX = 6;

/** The host camp takes at most this many places at a monument session; its visitors take the rest. */
export const MONUMENT_HOST = 3;

export const MONUMENT_LAG_MS = 500;

/** At a bone hut each sets out a moment after the one before; bones are taken out and set in place in this long. */
export const BONE_LAG_MS = 600;

/** The hut shows, rising out of the ground, over this long when its first bones are set. */
export const BONE_RISE_MS = 2_000;

export const BONE_TAKE_MS = Math.round(3_000 / TEMPO);

export const BONE_SET_MS = Math.round(1_500 / TEMPO);

/** People at a monument stand at least this far apart, in the model's metres (1.4 layout metres). */
export const MONUMENT_APART = 3;

/**
 * The way from the camp's side of a monument to a place at it, in the model's metres: round
 * the outside of the wall at a safe distance, or, for a place inside, in by the gate on the
 * camp's side, then round the inside, never through the wall; a step each 30 degrees.
 */
export function monumentPath(
  to: Pt,
  prop: Pt,
  at: (back: number, side: number) => Pt,
  k: number,
  who: number,
): Pt[] {
  const [dx, dz] = [(to.x - prop.x) / (k * MONUMENT_M), (to.z - prop.z) / (k * MONUMENT_M)];
  const [back, side] = [at(1, 0), at(0, 1)];
  const [bx, bz] = [(back.x - prop.x) / k, (back.z - prop.z) / k];
  const [sx, sz] = [(side.x - prop.x) / k, (side.z - prop.z) / k];
  // The angle from the camp's side, and the point on a ring of a radius at an angle.
  const a = detAtan2(dx * sx + dz * sz, dx * bx + dz * bz);
  const onRing = (ang: number, rad: number) =>
    at(rad * MONUMENT_M * detCos(ang), rad * MONUMENT_M * detSin(ang));
  const inside = Math.sqrt(dx * dx + dz * dz) < 5;
  // Each goes round at its own distance from the wall, so they do not walk in a clump.
  const off = ((who * 7) % 5) - 2;
  const rad = inside ? MONUMENT_IN_R + 0.3 * off : MONUMENT_OUT_R + 0.45 * off;
  const path = inside ? [onRing(0, MONUMENT_OUT_R), onRing(0, MONUMENT_IN_R + 0.3 * off)] : [];
  const n = Math.max(1, Math.ceil(Math.abs(a) / (Math.PI / 6)));
  for (let j = 1; j <= n; j++) path.push(onRing((a * j) / n, rad));
  return path;
}

/**
 * Where a monument's people stand for a session, in the model's metres, handed out one by
 * one: wherever the session's stones are set (the floor, the wall, the near and then the far
 * pillars, the figures, the arms and reliefs), or the dancers in two rings, or the carriers
 * of earth round the wall (humankind.md section 8.2).
 */
export function monumentStands(at: (back: number, side: number) => Pt, session: number): Pt[] {
  // A place by its angle from the gate and its share of the ellipse of the ring pillars.
  const ell = (a: number, f: number): [number, number] => [detSin(a) * 5.5 * f, detCos(a) * 5 * f];
  const pillar = (i: number) => ((i + 0.5) / 8) * Math.PI * 2;
  const spots: [number, number][] = [];
  if (session === 0) {
    // The floor: laid across.
    for (let i = 0; i < 5; i++) spots.push(ell(1 + (i * 2 * Math.PI) / 5, i % 2 ? 0.25 : 0.62));
  } else if (session === 1) {
    // The wall: round the outside of it.
    for (let i = 0; i < 6; i++) spots.push(ell(0.7 + (i * (2 * Math.PI - 1.4)) / 5, 1.3));
  } else if (session === 2 || session === 3) {
    // The ring pillars, the near four, then the far four: a stone is set up at each.
    const first = session === 2 ? [0, 1, 6, 7] : [2, 3, 4, 5];
    for (const i of first) spots.push(ell(pillar(i), 0.72));
    spots.push(ell(pillar(first[0]!) + (session === 2 ? -0.5 : 0.5), 0.45));
  } else if (session === 4) {
    // The two tall figure-pillars in the middle.
    spots.push([2, -1.3], [-2, 1.3], [0.4, -2.3], [-0.4, 2.3], [1.6, 1.1]);
  } else if (session === 5) {
    // Their arms and the reliefs on the ring pillars, among the pillars.
    for (const i of [0, 2, 4, 6]) spots.push(ell(pillar(i), 0.72));
    spots.push([1.4, -1.8]);
  } else {
    // Dancers in two rings, inside and outside, handed out alternately so a small party
    // still makes two rings.
    const ring = (n: number, r: number) =>
      Array.from({ length: n }, (_, k): [number, number] => {
        const a = ((k + 0.5) / n) * 2 * Math.PI;
        return [detSin(a) * r, detCos(a) * r];
      });
    const inner = ring(3, 2.7);
    const outer = ring(4, 3.5);
    outer.forEach((q, k) => spots.push(q, ...(k < inner.length ? [inner[k]!] : [])));
  }
  // Pushed apart until nobody stands against another, each keeping to the floor inside the
  // wall or to the ground round the outside of it; the model's +X lies on the other side of
  // the camp's axis from the layout's sides.
  const placed = spots.slice(0, MONUMENT_MAX);
  const within = placed.map((q) => Math.sqrt(q[0] * q[0] + q[1] * q[1]) < 5);
  for (let round = 0; round < 40; round++) {
    for (const [i, a] of placed.entries())
      for (const b of placed.slice(i + 1)) {
        const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d >= MONUMENT_APART) continue;
        const [ux, uz] = d < 1e-6 ? [detSin(i + 1), detCos(i + 1)] : [dx / d, dz / d];
        const push = (MONUMENT_APART - d) / 2;
        a[0] -= ux * push;
        a[1] -= uz * push;
        b[0] += ux * push;
        b[1] += uz * push;
      }
    for (const [i, q] of placed.entries()) {
      const r = Math.sqrt(q[0] * q[0] + q[1] * q[1]) || 1e-6;
      const into = Math.min(
        Math.max(r, within[i]! ? (session > 5 ? 2.6 : 0.6) : 6.4),
        within[i]! ? 3.5 : 9.5,
      );
      q[0] *= into / r;
      q[1] *= into / r;
    }
  }
  return placed.map(([x, z]) => at(z * MONUMENT_M, -x * MONUMENT_M));
}

/** Where the people of a scene stand: the painter and two watchers, or two diggers and the mourners. */
export function stageStands(
  camp: number,
  slot: number,
  beyond: number,
  kind: TreeStage['kind'],
  session = 0,
): Pt[] {
  const { at } = stageSpots(camp, slot, beyond);
  if (kind === 'monument') return monumentStands(at, session);
  // The painter at the rock face, the watchers behind; diggers at the grave's heap of earth.
  if (kind === 'cave-painting') return [at(1.8, 0), at(5, -2.2), at(5, 2.2)];
  // Round the front of the bone hut, outside its wall, where its builders set bones in place.
  if (kind === 'bone-hut') return [at(9.5, -3), at(9.5, 3), at(8, -7.5), at(8, 7.5)];
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
  const { prop, gap, at, door, pile, pick } = stageSpots(camp, slot, beyond);
  const out: Pt[] = [prop];
  if (kind === 'bone-hut') {
    // The hut and the ground round its wall, the pile, where bones are taken up, and the ways there.
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 2 * Math.PI;
      out.push(at(8.5 * detCos(a), 8.5 * detSin(a)));
      out.push({
        x: pile.x + 3 * stageScale(camp) * detCos(a),
        z: pile.z + 3 * stageScale(camp) * detSin(a),
      });
    }
    const stands = stageStands(camp, slot, beyond, kind);
    out.push(pile, pick, ...stands, gap);
    const walk = (a: Pt, b: Pt) => {
      const n = Math.ceil(Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2));
      for (let k = 1; k < n; k++)
        out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
    };
    walk(gap, pick);
    for (const q of stands) walk(pick, q);
    return out;
  }
  // Round the prop as it lies, in layout metres: the cave's rock face and the ground before
  // it (its hill is the ground, which does not rise over water); the grave's heap 4.2 by 2.6.
  const cave = kind === 'cave-painting';
  const [wide, deep, mid] = cave ? [6, 4, -2] : [4.2, 2.6, 0];
  if (kind === 'monument') {
    // The ring and the ground round it where its people stand and walk, and the way there.
    for (const r of [MONUMENT_IN_R, 5, MONUMENT_OUT_R, MONUMENT_OUT_R + 1.5])
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * 2 * Math.PI;
        out.push(at(r * MONUMENT_M * detCos(a), r * MONUMENT_M * detSin(a)));
      }
    out.push(gap);
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
export const STAGE_LEAD_MS = Math.round(15_000 / TEMPO);

/** A burial's people are in place when the dead dies; the grave is dug, the dead carried in, then covered. */
export const BURIAL_LEAD_MS = Math.round(10_000 / TEMPO);

/** From the heap's rise: the grave is dug this long, and the dead is laid in at BODY_AFTER_MS. */
export const DIG_MS = 1_500;

export const BODY_AFTER_MS = 10_300;

/** The two diggers fetch the dead, and lift it, this long after the digging, then carry it in. */
export const FETCH_MS = 3_000;

/** The belongings are added, then the grave covered, in this long after the dead is laid in. */
export const FILL_GRAVE_MS = 1_200;

export const CORPSE_LIFT_MS = 500;

/** The dead is set down into the grave over this long before it is laid in. */
export const LAY_MS = 1_200;

export const CARRIED_M = 0.9;

/** The two who carry the dead stand this far (layout metres) before and behind its middle, at its head and feet. */
export const BEARER_HALF_M = 3;

export const STAGE_MS = Math.round(27_000 / TEMPO);

/** A monument's inner ring is further to walk to, so its people come later and work a little shorter. */
export const MONUMENT_LEAD_MS = Math.round(26_000 / TEMPO);

export const MONUMENT_STAGE_MS = Math.round(12_000 / TEMPO);

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
export const HEAP_MS = 1_500;

/** A grave sinks back flat over GRAVE_FADE_DAYS, or this much watching where that passes quicker. */
export const GRAVE_SINK_MS = 60_000;

export const GRASS_AFTER_MS = 10_000;

export const GRASS_MS = 10_000;

/** The dead sits ill this long from the start of the burial's window, then lies dead; the soul rises for SOUL_MS. */
export const ILL_MS = 3_000;

export const SOUL_MS = 4_000;

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
        : stage.kind === 'bone-hut'
          ? boneWindows(w0).flatMap((r) => [r.extract, r.haul])
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

/** The windows of a bone hut's rounds, from its camp's first window: the hunt, then the bones taken out and the bones carried in and built. */
export function boneWindows(w0: number) {
  return Array.from({ length: BONE_ROUNDS }, (_, c) => {
    const hunt = w0 + 1 + BONE_ROUND_WINDOWS * c;
    return { hunt, extract: hunt + 2, haul: hunt + 3 };
  });
}

/** The windows in which a bone hut's mammoth hunts are held, with each window's start. */
export function stageHunts(stage: TreeStage, startDay: Day): { w: number; start: number }[] {
  const shift = hash32(stage.camp, 113) % TURN_MS;
  const w0 = Math.ceil((msAtDay(stage.from, startDay) + shift) / TURN_MS);
  const end = msAtDay(stage.until, startDay);
  return boneWindows(w0)
    .map((r) => ({ w: r.hunt, start: r.hunt * TURN_MS - shift }))
    .filter((x) => x.start + 2 * TURN_MS <= end);
}
