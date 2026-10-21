// The vignette player (spec milestone 2, sections 6 and 18.5): pure functions
// from a compiled vignette and the clock to instances and the poses of their
// cast, props and spears. No state, no engine-dependent maths: only integers,
// + − × ÷ and Math.sqrt, so every device computes the same scene.

import { hash32, hashString } from '../core/hash.ts';
import { dayAtMs, msAtDay } from '../time/rate.ts';

/**
 * The actions the player implements, exactly those of data/curated/vocab/actions.yaml
 * (section 6.4), which says what each one's object names.
 */
export const VERBS = [
  'wait',
  'walk-to',
  'run-to',
  'carry-to',
  'haul',
  'work-at',
  'point',
  'throw-at',
  'cheer',
  'struggle',
  'fall',
  'cut-up',
  'appear',
  'vanish',
  'show',
  'hide',
] as const;
export type Verb = (typeof VERBS)[number];

export type Clip =
  | 'idle'
  | 'walk'
  | 'run'
  | 'carry'
  | 'haul'
  | 'work'
  | 'knap'
  | 'point'
  | 'throw'
  | 'cheer'
  | 'struggle'
  | 'fall'
  // The tree's hunts (humankind.md section 8.1): the pole carry, a kill bound and hung.
  | 'pole'
  | 'bound'
  | 'hung'
  // Camp life (humankind.md section 8.1).
  | 'strike'
  | 'crouch'
  | 'dance'
  | 'scrape'
  | 'crack'
  // Painting a cave wall; falling ill and dying before a burial (humankind.md section 8.2).
  | 'paint'
  | 'ill'
  | 'lie'
  | 'bearBehind'
  | 'bearAhead'
  | 'sit'
  // Crossing the sea in a canoe (peopling.md section 6).
  | 'paddle';

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
/** How long a prop takes to be put up or taken down. */
const PROP_MS = 6000;
/** A thrown spear leaves the hand this long into the throw (THROW_RELEASE). */
const RELEASE_MS = 550;
/** How long a spear flies before it lands. */
export const FLIGHT_MS = 700;
/** Length of a point or a throw before the member stands idle again. */
const GESTURE_MS = 3000;
/** A member closer than this to its target does not walk there first. */
const NEAR_CM = 50;
/** Closest two members of a group come: one step (section 18.3). */
const SPACING_CM = { human: 250, animal: 1400, prop: 300 };
/** Grid cells are this many steps apart; spots wander 0.3 steps within them. */
const CELL_STEPS = 1.6;

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
  /** The role's cast rules from vocab/roles.yaml, copied in by the build. */
  man?: true;
  tool?: string;
  count: number;
  at: string;
  /** Where the group stands relative to its marks, in centimetres, like a formation (giza.md section 11.3). */
  offsetCm?: [number, number];
  actions: CompiledAction[];
}

export interface CompiledProp {
  name: string;
  /** A culture's camp shelter, or an asset by id. */
  kind: 'shelter' | 'asset';
  /** The culture (after the record's parameters are filled in) or asset id. */
  look: string;
  at: string;
  /** A mark the prop's front turns to. */
  face?: string;
  actions: CompiledAction[];
}

export interface CompiledTemplate {
  id: string;
  /** Script length in milliseconds of clock time; with once, played once per instance. */
  loopMs: number;
  once: boolean;
  radiusCm: number;
  /** The landmark size the marks are written for (giza.md section 11.3), if any. */
  fitCm?: number;
  /** Mark positions in whole centimetres: x forward, z to the left. */
  marks: Record<string, [number, number]>;
  groups: CompiledGroup[];
  props: CompiledProp[];
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
  /** The instance's period, clipped to the record's span. */
  fromDay: number;
  toDay: number;
  /** The instance's shown span on the clock (section 6.5), in whole milliseconds. */
  startMs: number;
  endMs: number;
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

/**
 * A repeated vignette's periods are a cadence of watching time (section 6.6): `per`
 * years count as they did at the old even rate of 25 years a minute (10 years are 24
 * seconds), so a scene recurs as often in the deep past as in written history. A
 * singular vignette, one period for its whole span, keeps the span.
 */
export function periodMsOf(v: CompiledVignette, startDay: number): number {
  if (v.periodDays >= v.toDay - v.fromDay)
    return Math.max(1, msAtDay(v.toDay, startDay) - msAtDay(v.fromDay, startDay));
  return Math.max(1, Math.round((v.periodDays * 960000) / 146097));
}

/** The instances of a repeated vignette shown at a clock time (section 18.5). */
export function instancesAt(v: CompiledVignette, ms: number, startDay: number): Instance[] {
  const day = dayAtMs(ms, startDay);
  if (day < v.fromDay) return [];
  const loopMs = v.template.loopMs;
  const first = msAtDay(v.fromDay, startDay);
  const last = msAtDay(v.toDay, startDay);
  const each = periodMsOf(v, startDay);
  const out: Instance[] = [];
  // An instance can run past its period when the period is shorter than its script.
  let period = Math.floor((Math.min(ms, last - 1) - first) / each);
  for (; period >= 0; period--) {
    const periodStart = first + period * each;
    if (periodStart + Math.max(each, 2 * loopMs) <= ms) break;
    for (const i of periodInstances(v, period, startDay))
      if (i.startMs <= ms && ms < i.endMs) out.push(i);
  }
  return out;
}

/**
 * The instances of one period (section 6.6): each starts at the period's start
 * plus a hashed offset and lasts its script once, or as many whole loops as fit
 * before the period's end, at least one.
 */
export function periodInstances(v: CompiledVignette, period: number, startDay: number): Instance[] {
  const first = msAtDay(v.fromDay, startDay);
  const last = msAtDay(v.toDay, startDay);
  const each = periodMsOf(v, startDay);
  const periodStart = first + period * each;
  if (period < 0 || periodStart >= last) return [];
  const periodMs = Math.min(periodStart + each, last) - periodStart;
  const fromDay = dayAtMs(periodStart, startDay);
  const toDay = dayAtMs(periodStart + periodMs, startDay);
  const t = v.template;
  const seed = hashString(v.id);
  const candidates = v.sites.filter(
    (s) => (s.fromDay ?? -Infinity) <= fromDay && (s.toDay ?? Infinity) > fromDay,
  );
  const out: Instance[] = [];
  for (let k = 0; k < v.count && candidates.length > 0; k++) {
    const pick = hash32(seed, period, k) % candidates.length;
    const site = candidates.splice(pick, 1)[0]!;
    const h = hash32(seed, period, k, 7);
    let offset: number;
    let length: number;
    if (t.once) {
      const room = periodMs - t.loopMs;
      offset = room > 0 ? h % (room + 1) : 0;
      length = t.loopMs;
    } else {
      // A singular vignette building a landmark starts with its span.
      offset = periodMs > t.loopMs && !v.progress ? h % t.loopMs : 0;
      length = Math.max(1, Math.floor((periodMs - offset) / t.loopMs)) * t.loopMs;
    }
    out.push({
      id: `${v.id}:${period}:${k}`,
      recordId: v.id,
      site,
      fromDay,
      toDay,
      startMs: periodStart + offset,
      endMs: periodStart + offset + length,
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
  /** The visibility change fades the model in or out instead of sinking it. */
  fade?: boolean;
}

/** A role's cast rules (vocab/roles.yaml), copied into each group by the build. */
export interface CastRules {
  /** Always played by a man of the profile. */
  man?: true;
  /** The tool the role holds instead of the profile's own. */
  tool?: string;
}

export interface Member extends CastRules {
  group: string;
  index: number;
  kind: CastKind;
  look: string;
  role?: string;
  segments: Segment[];
}

/**
 * Where member i of a group stands around its target, in centimetres: its own
 * cell of a grid ⌈√n⌉ cells wide across z, cells 1.6 steps apart, at a spot
 * offset by up to 0.3 steps chosen by hash for each beat, so members are
 * scattered, never move as a block and are never closer than one step.
 * Beat 0 is the member's home spot.
 */
export function formationOffset(group: CompiledGroup, i: number, beat = 0): [number, number] {
  let cols = 1;
  while (cols * cols < group.count) cols++;
  const rows = Math.ceil(group.count / cols);
  const row = Math.floor(i / cols);
  const inRow = row === rows - 1 ? group.count - row * cols : cols;
  const col = i - row * cols;
  const step = SPACING_CM[group.kind];
  const [ox, oz] = group.offsetCm ?? [0, 0];
  const h = hashString(group.name);
  const jitter = (k: number) =>
    group.count === 1 ? 0 : ((hash32(h, i, beat, k) % 601) / 1000 - 0.3) * step;
  return [
    ox + Math.round((row - (rows - 1) / 2) * step * CELL_STEPS + jitter(1)),
    oz + Math.round((col - (inRow - 1) / 2) * step * CELL_STEPS + jitter(2)),
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
  // A script played once starts with an empty stage (section 6.5).
  const startVis = t.once ? 0 : 1;
  for (const g of t.groups) {
    const start = t.marks[g.at]!;
    for (let i = 0; i < g.count; i++) {
      const [ox, oz] = formationOffset(g, i);
      const home: [number, number] = [start[0] + ox, start[1] + oz];
      const segs: Segment[] = [rest(0, home[0], home[1], 'idle', startVis)];
      for (let k = 0; k < g.actions.length; k++) {
        const a = g.actions[k]!;
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
          // A new spot near each mark; back home, the home spot, so the loop closes.
          const [sx, sz] = a.object === g.at ? [ox, oz] : formationOffset(g, i, k + 1);
          const tx = m[0] + sx;
          const tz = m[1] + sz;
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
          segs.push({
            ...rest(a.atMs, home[0], home[1], 'idle', 1),
            vis0: 0,
            visMs: APPEAR_MS,
            fade: true,
          });
        } else if (a.verb === 'vanish') {
          segs.push({ ...rest(a.atMs, x, z, 'idle', 0), vis0: vis, visMs: APPEAR_MS, fade: true });
        } else if (a.verb === 'struggle') {
          segs.push(rest(a.atMs, x, z, 'struggle', vis));
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
        ...(g.man ? { man: g.man } : {}),
        ...(g.tool ? { tool: g.tool } : {}),
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
  /** Whether a visibility below 1 fades the model rather than sinking it. */
  fade: boolean;
}

/**
 * The phase of an instance in whole milliseconds of its script (section 6.5):
 * the clock time since the start of its shown span, once or modulo the loop.
 */
export function phaseOf(t: CompiledTemplate, instance: Instance, ms: number): number {
  const p = ms - instance.startMs;
  if (t.once) return p < 0 ? 0 : p >= t.loopMs ? t.loopMs - 1 : p;
  const q = p % t.loopMs;
  return q < 0 ? q + t.loopMs : q;
}

/** Every cast member's pose for an instance at a phase (section 18.5). */
export function posesAt(instance: Instance, members: Member[], phase: number): Pose[] {
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
      fade: seg.fade === true,
    };
  });
}

// --- Props ----------------------------------------------------------------------

export interface PropTrack {
  name: string;
  kind: 'shelter' | 'asset';
  look: string;
  x: number;
  z: number;
  dx: number;
  dz: number;
  /** Visibility only; props stand still. */
  segments: Segment[];
}

/** Builds every prop's place, heading and visibility over the script. */
export function buildProps(t: CompiledTemplate): PropTrack[] {
  return t.props.map((p) => {
    const [x, z] = t.marks[p.at]!;
    let dx = 1;
    let dz = 0;
    const f = p.face ? t.marks[p.face] : undefined;
    if (f) {
      const d = Math.sqrt((f[0] - x) * (f[0] - x) + (f[1] - z) * (f[1] - z));
      if (d > 0) {
        dx = (f[0] - x) / d;
        dz = (f[1] - z) / d;
      }
    }
    const segs: Segment[] = [rest(0, x, z, 'idle', t.once ? 0 : 1)];
    for (const a of p.actions) {
      const last = segs[segs.length - 1]!;
      const vis = visAt(last, a.atMs);
      last.t1 = a.atMs;
      const to = a.verb === 'show' ? 1 : 0;
      segs.push({ ...rest(a.atMs, x, z, 'idle', to), vis0: vis, visMs: PROP_MS, fade: true });
    }
    segs[segs.length - 1]!.t1 = t.loopMs;
    return { name: p.name, kind: p.kind, look: p.look, x, z, dx, dz, segments: segs };
  });
}

export interface PropPose {
  name: string;
  kind: 'shelter' | 'asset';
  look: string;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  visibility: number;
}

/** Every prop's pose for an instance at a phase. */
export function propPosesAt(instance: Instance, props: PropTrack[], phase: number): PropPose[] {
  const [c, s] = instance.orient;
  return props.map((p) => ({
    name: p.name,
    kind: p.kind,
    look: p.look,
    x: Math.round(c * p.x - s * p.z),
    z: Math.round(s * p.x + c * p.z),
    dirX: c * p.dx - s * p.dz,
    dirZ: s * p.dx + c * p.dz,
    visibility: visAt(segmentAt(p.segments, phase).seg, phase),
  }));
}

// --- Spears -----------------------------------------------------------------------

/** One thrown spear (section 18.3): its flight and the target it sticks in. */
export interface Spear {
  /** Indexes into the member list. */
  thrower: number;
  target: number;
  releaseMs: number;
  landMs: number;
  /** When the target has gone (sunk away), and the spear with it. */
  goneMs: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Where along the target's back it sticks, 0 to 999. */
  spot: number;
}

/** Every spear thrown in the script, from the throw-at gestures. */
export function buildSpears(t: CompiledTemplate, members: Member[]): Spear[] {
  const spears: Spear[] = [];
  members.forEach((m, mi) => {
    m.segments.forEach((s, k) => {
      if (s.clip !== 'throw' || !s.face) return;
      const target = members.findIndex((o) => o.group === s.face);
      if (target < 0) return;
      const releaseMs = s.t0 + RELEASE_MS;
      const landMs = releaseMs + FLIGHT_MS;
      const tsegs = members[target]!.segments;
      const [x1, z1] = positionAt(tsegs, landMs);
      const gone = tsegs.find((g) => g.t0 >= landMs && g.vis1 === 0);
      spears.push({
        thrower: mi,
        target,
        releaseMs,
        landMs,
        goneMs: gone ? gone.t0 + gone.visMs : t.loopMs,
        x0: s.x0,
        z0: s.z0,
        x1,
        z1,
        spot: hash32(hashString(m.group), m.index, k) % 1000,
      });
    });
  });
  return spears.filter((sp) => sp.landMs < t.loopMs);
}

export interface SpearPose {
  /** In flight: stage position in centimetres and how far along, 0 to 1. */
  flying?: { x: number; z: number; dirX: number; dirZ: number; f: number };
  /** Landed: the member it sticks in and where along its back. */
  stuck?: { target: number; spot: number };
}

/** Each spear at a phase: in the air, stuck in its target, or still in the hand (neither). */
export function spearsAt(instance: Instance, spears: Spear[], phase: number): SpearPose[] {
  const [c, s] = instance.orient;
  const out: SpearPose[] = [];
  for (const sp of spears) {
    if (phase < sp.releaseMs || phase >= sp.goneMs) {
      out.push({});
      continue;
    }
    if (phase >= sp.landMs) {
      out.push({ stuck: { target: sp.target, spot: sp.spot } });
      continue;
    }
    const f = (phase - sp.releaseMs) / FLIGHT_MS;
    const x = sp.x0 + (sp.x1 - sp.x0) * f;
    const z = sp.z0 + (sp.z1 - sp.z0) * f;
    const dx = sp.x1 - sp.x0;
    const dz = sp.z1 - sp.z0;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    out.push({
      flying: {
        x: Math.round(c * x - s * z),
        z: Math.round(s * x + c * z),
        dirX: (c * dx - s * dz) / d,
        dirZ: (s * dx + c * dz) / d,
        f,
      },
    });
  }
  return out;
}

// --- Validation -------------------------------------------------------------------

/**
 * Lists every member or prop that does not end its loop where and as it
 * started, or, in a script played once, does not end hidden (section 6.5).
 */
export function loopErrors(t: CompiledTemplate): string[] {
  const errors: string[] = [];
  for (const p of buildProps(t)) {
    const end = visAt(segmentAt(p.segments, t.loopMs).seg, t.loopMs);
    if (end !== p.segments[0]!.vis0)
      errors.push(`${t.id}: prop ${p.name} ends ${end ? 'shown' : 'hidden'}`);
  }
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
    // A script played once may end anywhere, as long as the member has left.
    if (!t.once && (Math.abs(ex - first.x0) > 1 || Math.abs(ez - first.z0) > 1))
      errors.push(`${name} ends away from its starting mark`);
    if (visAt(end, t.loopMs) !== first.vis0)
      errors.push(`${name} ends ${first.vis0 ? 'hidden' : 'on the stage'}`);
  }
  return errors;
}
