// The vignette player (spec milestone 2, sections 6 and 18.5): pure functions
// from a compiled vignette, the day and the life clock to instances and the
// poses of their cast. No state, no engine-dependent maths: only integers,
// + − × ÷ and Math.sqrt, so every device computes the same scene.

import { hash32, hashString } from '../core/hash.ts';

export type Verb =
  | 'wait'
  | 'walk-to'
  | 'run-to'
  | 'carry-to'
  | 'haul'
  | 'work-at'
  | 'point'
  | 'throw-at'
  | 'cheer'
  | 'fall'
  | 'cut-up'
  | 'appear';

export type Clip =
  'idle' | 'walk' | 'run' | 'carry' | 'haul' | 'work' | 'point' | 'throw' | 'cheer' | 'fall';

/** Every verb the player understands, with what its object names. */
export const VERBS: Record<Verb, 'none' | 'mark' | 'group' | 'optional-group'> = {
  wait: 'none',
  'walk-to': 'mark',
  'run-to': 'mark',
  'carry-to': 'mark',
  haul: 'mark',
  'work-at': 'mark',
  point: 'optional-group',
  'throw-at': 'group',
  cheer: 'optional-group',
  fall: 'none',
  'cut-up': 'none',
  appear: 'none',
};

/** Stage speeds in centimetres per second, three times life (section 18.3). */
const SPEED_CM_S: Partial<Record<Verb, number>> = {
  'walk-to': 400,
  'run-to': 1200,
  'carry-to': 350,
  haul: 300,
  'work-at': 400,
};
const MOVE_CLIP: Partial<Record<Verb, Clip>> = {
  'walk-to': 'walk',
  'run-to': 'run',
  'carry-to': 'carry',
  haul: 'haul',
  'work-at': 'walk',
};
const FALL_MS = 3000;
/** How long a fallen animal takes to be cut up and sink away. */
const CUT_MS = 12000;
const APPEAR_MS = 2000;
/** Length of a point or a throw before the member stands idle again. */
const GESTURE_MS = 3000;
/** A member closer than this to its target does not walk there first. */
const NEAR_CM = 50;
/** Formation spacing between members (section 18.3). */
const SPACING_CM = { human: 250, animal: 1400, prop: 300 };

export interface CompiledAction {
  atMs: number;
  verb: Verb;
  /** A mark for movement verbs, a group for facing verbs. */
  object?: string;
}

/** A cast member is a person, an animal or a prop that is moved about (giza.md section 11.3). */
export type CastKind = 'human' | 'animal' | 'prop';

export interface CompiledGroup {
  name: string;
  kind: CastKind;
  /** The culture, animal or prop asset id, after the record's parameters are filled in. */
  look: string;
  role?: string;
  count: number;
  at: string;
  /** Where the group stands relative to its marks, in centimetres, like a formation (giza.md section 11.3). */
  offsetCm?: [number, number];
  actions: CompiledAction[];
}

export interface CompiledTemplate {
  id: string;
  loopMs: number;
  radiusCm: number;
  /** The landmark size the marks are written for (giza.md section 11.3), if any. */
  fitCm?: number;
  /** Mark positions in whole centimetres: x forward, z to the left. */
  marks: Record<string, [number, number]>;
  groups: CompiledGroup[];
}

export interface CompiledSite {
  name: string;
  /** Latitude and longitude in whole microdegrees. */
  lat: number;
  lon: number;
  fromDay?: number;
  toDay?: number;
}

/** The structure file of a vignette record (section 18.4). */
export interface CompiledVignette {
  id: string;
  fromDay: number;
  toDay: number;
  periodDays: number;
  count: number;
  sites: CompiledSite[];
  icon: string;
  template: CompiledTemplate;
  /** For a singular vignette: the landmark part it builds, at whose centre it stands (giza.md section 11.4). */
  progress?: { landmark: string; part: string };
}

export interface Instance {
  id: string;
  recordId: string;
  site: CompiledSite;
  /** The instance's shown span: its period, clipped to the record's span. */
  fromDay: number;
  toDay: number;
  offsetMs: number;
  /** Stage orientation: the compass direction of +x as (east, north). */
  orient: [number, number];
}

const R = 0.7071067811865476; // √½, written out so no engine maths is needed
const ORIENTATIONS: [number, number][] = [
  [1, 0],
  [R, R],
  [0, 1],
  [-R, R],
  [-1, 0],
  [-R, -R],
  [0, -1],
  [R, -R],
];

/** The instances of a repeated vignette standing on a day (section 18.5). */
export function instancesAt(v: CompiledVignette, day: number): Instance[] {
  if (day < v.fromDay || day >= v.toDay) return [];
  const seed = hashString(v.id);
  const period = Math.floor((day - v.fromDay) / v.periodDays);
  const fromDay = v.fromDay + period * v.periodDays;
  const toDay = Math.min(fromDay + v.periodDays, v.toDay);
  const candidates = v.sites.filter(
    (s) => (s.fromDay ?? -Infinity) <= fromDay && (s.toDay ?? Infinity) > fromDay,
  );
  const out: Instance[] = [];
  for (let k = 0; k < v.count && candidates.length > 0; k++) {
    const pick = hash32(seed, period, k) % candidates.length;
    const site = candidates.splice(pick, 1)[0]!;
    const h = hash32(seed, period, k, 7);
    out.push({
      id: `${v.id}:${period}:${k}`,
      recordId: v.id,
      site,
      fromDay,
      toDay,
      offsetMs: h % v.template.loopMs,
      // A stage on a landmark keeps the landmark's frame: +x east.
      orient: v.progress ? ORIENTATIONS[0]! : ORIENTATIONS[hash32(h, 11) % 8]!,
    });
  }
  return out;
}

// --- Segments --------------------------------------------------------------------

/** One stretch of a member's loop: a move or a rest (spec milestone 2, section 2.2). */
export interface Segment {
  t0: number;
  t1: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  clip: Clip;
  /** Facing as a direction; zero length keeps the previous one. */
  dx: number;
  dz: number;
  /** Visibility from vis0 at t0 to vis1 at t0 + visMs, then vis1. */
  vis0: number;
  vis1: number;
  visMs: number;
  /** For facing verbs: the group to face, resolved in a second pass. */
  face?: string;
  /** When the clip started, if before t0 (a held clip, as for cut-up). */
  clipT0?: number;
}

export interface Member {
  group: string;
  index: number;
  kind: CastKind;
  look: string;
  role?: string;
  segments: Segment[];
}

/**
 * Formation offset of member i of n in a group, in centimetres: a grid
 * ⌈√n⌉ members wide across z, centred on the mark, so members never overlap.
 */
export function formationOffset(group: CompiledGroup, i: number): [number, number] {
  let cols = 1;
  while (cols * cols < group.count) cols++;
  const rows = Math.ceil(group.count / cols);
  const row = Math.floor(i / cols);
  const inRow = row === rows - 1 ? group.count - row * cols : cols;
  const col = i - row * cols;
  const step = SPACING_CM[group.kind];
  const [ox, oz] = group.offsetCm ?? [0, 0];
  return [
    ox + Math.round((row - (rows - 1) / 2) * step),
    oz + Math.round((col - (inRow - 1) / 2) * step),
  ];
}

function posAt(s: Segment, t: number): [number, number] {
  if (t >= s.t1 || s.t1 === s.t0) return [s.x1, s.z1];
  if (t <= s.t0) return [s.x0, s.z0];
  const f = (t - s.t0) / (s.t1 - s.t0);
  return [s.x0 + (s.x1 - s.x0) * f, s.z0 + (s.z1 - s.z0) * f];
}

function visAt(s: Segment, t: number): number {
  if (s.visMs <= 0 || t >= s.t0 + s.visMs) return s.vis1;
  const f = (t - s.t0) / s.visMs;
  return s.vis0 + (s.vis1 - s.vis0) * (f < 0 ? 0 : f);
}

function rest(t: number, x: number, z: number, clip: Clip, vis: number): Segment {
  return {
    t0: t,
    t1: Infinity,
    x0: x,
    z0: z,
    x1: x,
    z1: z,
    clip,
    dx: 0,
    dz: 0,
    vis0: vis,
    vis1: vis,
    visMs: 0,
  };
}

/** Builds every member's segments over one loop (section 18.5). */
export function buildMembers(t: CompiledTemplate): Member[] {
  const members: Member[] = [];
  for (const g of t.groups) {
    const start = t.marks[g.at]!;
    for (let i = 0; i < g.count; i++) {
      const [ox, oz] = formationOffset(g, i);
      const home: [number, number] = [start[0] + ox, start[1] + oz];
      const segs: Segment[] = [rest(0, home[0], home[1], 'idle', 1)];
      for (const a of g.actions) {
        // Cut the timeline at the action: drop what was planned after it.
        while (segs.length > 1 && segs[segs.length - 1]!.t0 >= a.atMs) segs.pop();
        const last = segs[segs.length - 1]!;
        const [x, z] = posAt(last, a.atMs);
        const vis = visAt(last, a.atMs);
        last.t1 = a.atMs;
        last.x1 = x;
        last.z1 = z;
        const speed = SPEED_CM_S[a.verb];
        if (speed !== undefined) {
          const m = t.marks[a.object!]!;
          const tx = m[0] + ox;
          const tz = m[1] + oz;
          const dist = Math.sqrt((tx - x) * (tx - x) + (tz - z) * (tz - z));
          let t0 = a.atMs;
          if (dist > NEAR_CM || a.verb !== 'work-at') {
            const dur = Math.round((dist * 1000) / speed);
            segs.push({
              t0,
              t1: t0 + dur,
              x0: x,
              z0: z,
              x1: tx,
              z1: tz,
              clip: MOVE_CLIP[a.verb]!,
              dx: dist > 0 ? (tx - x) / dist : 0,
              dz: dist > 0 ? (tz - z) / dist : 0,
              vis0: vis,
              vis1: vis,
              visMs: 0,
            });
            t0 += dur;
          }
          segs.push(rest(t0, tx, tz, a.verb === 'work-at' ? 'work' : 'idle', vis));
        } else if (a.verb === 'fall') {
          // People sink away; an animal rolls onto its side and stays down.
          if (g.kind === 'animal') segs.push(rest(a.atMs, x, z, 'fall', vis));
          else segs.push({ ...rest(a.atMs, x, z, 'fall', 0), vis0: vis, visMs: FALL_MS });
        } else if (a.verb === 'cut-up') {
          // The fallen body keeps lying as it was and sinks away.
          const held = last.clip === 'fall' ? (last.clipT0 ?? last.t0) : a.atMs;
          segs.push({
            ...rest(a.atMs, x, z, 'fall', 0),
            vis0: vis,
            visMs: CUT_MS,
            clipT0: held,
          });
        } else if (a.verb === 'appear') {
          segs.push({ ...rest(a.atMs, home[0], home[1], 'idle', 1), vis0: 0, visMs: APPEAR_MS });
        } else {
          const clip: Clip =
            a.verb === 'point'
              ? 'point'
              : a.verb === 'throw-at'
                ? 'throw'
                : a.verb === 'cheer'
                  ? 'cheer'
                  : 'idle';
          const s = rest(a.atMs, x, z, clip, vis);
          if (a.object) s.face = a.object;
          segs.push(s);
          // Pointing and throwing are single gestures; cheering goes on.
          if (clip === 'point' || clip === 'throw')
            segs.push(rest(a.atMs + GESTURE_MS, x, z, 'idle', vis));
        }
      }
      const tail = segs[segs.length - 1]!;
      if (tail.t1 === Infinity) tail.t1 = t.loopMs;
      members.push({
        group: g.name,
        index: i,
        kind: g.kind,
        look: g.look,
        role: g.role,
        segments: segs,
      });
    }
  }
  // Second pass: facing verbs turn towards the first member of their target group.
  for (const m of members)
    for (const s of m.segments) {
      if (!s.face) continue;
      const target = members.find((o) => o.group === s.face);
      if (!target) continue;
      const [tx, tz] = positionAt(target.segments, s.t0);
      const dx = tx - s.x0;
      const dz = tz - s.z0;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0) {
        s.dx = dx / d;
        s.dz = dz / d;
      }
    }
  return members;
}

function segmentAt(segs: Segment[], t: number): { seg: Segment; index: number } {
  for (let i = segs.length - 1; i >= 0; i--)
    if (segs[i]!.t0 <= t) return { seg: segs[i]!, index: i };
  return { seg: segs[0]!, index: 0 };
}

function positionAt(segs: Segment[], t: number): [number, number] {
  return posAt(segmentAt(segs, t).seg, t);
}

/** The last facing direction set at or before a segment. */
function facingAt(segs: Segment[], index: number): [number, number] {
  for (let i = index; i >= 0; i--) {
    const s = segs[i]!;
    if (s.dx !== 0 || s.dz !== 0) return [s.dx, s.dz];
  }
  return [1, 0];
}

// --- Poses ------------------------------------------------------------------------

export interface Pose {
  group: string;
  index: number;
  kind: CastKind;
  look: string;
  role?: string;
  /** Position in whole centimetres: x east, z north of the stage centre. */
  x: number;
  z: number;
  /** Facing as a unit direction (east, north). */
  dirX: number;
  dirZ: number;
  clip: Clip;
  /** Milliseconds since the clip started. */
  clipMs: number;
  /** 1 fully there, 0 gone (section 18.3, fall and appear). */
  visibility: number;
}

/** The loop phase of an instance at a life-clock time, in whole milliseconds. */
export function phaseOf(t: CompiledTemplate, instance: Instance, lifeMs: number): number {
  const p = (lifeMs + instance.offsetMs) % t.loopMs;
  return p < 0 ? p + t.loopMs : p;
}

/** Every cast member's pose for an instance at a life-clock time (section 18.5). */
export function posesAt(
  t: CompiledTemplate,
  members: Member[],
  instance: Instance,
  lifeMs: number,
): Pose[] {
  const phase = phaseOf(t, instance, lifeMs);
  const [c, s] = instance.orient;
  return members.map((m) => {
    const { seg, index } = segmentAt(m.segments, phase);
    const [x, z] = posAt(seg, phase);
    const [fx, fz] = facingAt(m.segments, index);
    return {
      group: m.group,
      index: m.index,
      kind: m.kind,
      look: m.look,
      role: m.role,
      x: Math.round(c * x - s * z),
      z: Math.round(s * x + c * z),
      dirX: c * fx - s * fz,
      dirZ: s * fx + c * fz,
      clip: seg.clip,
      clipMs: phase - (seg.clipT0 ?? seg.t0),
      visibility: visAt(seg, phase),
    };
  });
}

// --- Validation -------------------------------------------------------------------

/** Lists every member that does not end its loop where and as it started (section 6.5). */
export function loopErrors(t: CompiledTemplate): string[] {
  const errors: string[] = [];
  for (const m of buildMembers(t)) {
    const first = m.segments[0]!;
    const segs = m.segments;
    const end = segmentAt(segs, t.loopMs).seg;
    const [ex, ez] = posAt(end, t.loopMs);
    const lastMove = segs.reduce(
      (a, s) => (s.x0 !== s.x1 || s.z0 !== s.z1 ? Math.max(a, s.t1) : a),
      0,
    );
    const name = `${t.id}: ${m.group} #${m.index}`;
    if (lastMove > t.loopMs) errors.push(`${name} is still moving when the loop ends`);
    if (Math.abs(ex - first.x0) > 1 || Math.abs(ez - first.z0) > 1)
      errors.push(`${name} ends away from its starting mark`);
    if (visAt(end, t.loopMs) !== first.vis0) errors.push(`${name} ends hidden`);
  }
  return errors;
}
