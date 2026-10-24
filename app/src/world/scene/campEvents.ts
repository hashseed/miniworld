// The camp's shared moments (spec humankind.md section 8.1): catch, dances, visits and feasts,
// who takes part, where everyone stands, and the sparks of a lit fire.

import type { Stay } from './memo.ts';
import {
  type CampEvent,
  TURN_MS,
  CATCH_SHARE,
  isCompact,
  DANCE_SHARE,
  layoutOf,
  CATCH_R,
  DANCE_R,
  ringPoint,
  EVENT_MS,
  eventPoint,
  towards,
  CATCH_PACE_SHARE,
  type Place,
  lightSpot,
} from './camp.ts';
import { hash32, hash01 } from '../../core/hash.ts';
import {
  stageSessions,
  stageStands,
  stageSpots,
  stageScale,
  MONUMENT_BUILD_SESSIONS,
  MONUMENT_LAG_MS,
  monumentPath,
} from './stages.ts';
import { VISIT_M, VISIT_EARLY_MS, VISIT_SLACK_MS, VISIT_CAMPS, VISIT_PEOPLE } from './hunt.ts';
import { lookOf, type Pt, deg } from './units.ts';
import { Itinerary } from './routes.ts';
import type { FigurePose } from './types.ts';
import { detCos, detSin } from '../../core/detmath.ts';
import { type TreeStage, NEVER } from '../tree.ts';
import { msAtDay } from '../../time/rate.ts';
import type { SceneCx } from './context.ts';

/** The camp event of a camp's window `w`, if any (section 8.1); the same for every member. */
export function eventOf(
  cx: Pick<
    SceneCx,
    | 'chunk'
    | 'events'
    | 'huntsOf'
    | 'mates'
    | 'offsetM'
    | 'planEvent'
    | 'sameCamp'
    | 'stageEvent'
    | 'startDay'
    | 'stayAt'
  >,
  ref: Stay,
  w: number,
): CampEvent | undefined {
  const {
    chunk,
    events,
    huntsOf,
    mates,
    offsetM,
    planEvent,
    sameCamp,
    stageEvent,
    startDay,
    stayAt,
  } = cx;
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
    const ev = stageEvent(stage, w, start, start + TURN_MS + (stage.kind === 'burial' ? 2_000 : 0));
    events.set(key, ev);
    return ev;
  }
  // A camp within reach of a monument keeps its evenings free while a session runs there:
  // its people may be on their way to it (humankind.md section 8.2).
  const busyWithMonument = (chunk.stages ?? []).some((x) => {
    if (x.kind !== 'monument') return false;
    if (x.camp === camp && x.lat === ref.home.lat && x.lon === ref.home.lon) return false;
    const off = offsetM(x, ref.home);
    if (off.x * off.x + off.z * off.z > VISIT_M * VISIT_M) return false;
    return stageSessions(x, startDay).some(
      (q) =>
        q.start - VISIT_EARLY_MS < start + TURN_MS && q.start + TURN_MS + VISIT_SLACK_MS > start,
    );
  });
  const roll = hash01(camp, w, 97);
  const kind = busyWithMonument
    ? undefined
    : roll < CATCH_SHARE
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

/** Everyone walks to their place on the ring, plays or dances, and walks back. */
export function planEvent(
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
export function eventsOf(
  cx: Pick<SceneCx, 'eventOf' | 'visitsOf'>,
  st: Stay,
  from: number,
  to: number,
): CampEvent[] {
  const { eventOf, visitsOf } = cx;
  const shift = hash32(st.home.camp, 113) % TURN_MS;
  const out: CampEvent[] = [];
  for (let w = Math.floor((from - TURN_MS + shift) / TURN_MS); w * TURN_MS - shift < to; w++) {
    const ev = eventOf(st, w);
    if (ev && ev.members.includes(st.f.id) && ev.start < to && ev.end > from) out.push(ev);
  }
  out.push(...visitsOf(st, from, to));
  return out;
}

/** A visitor's pose, drawn towards the host's frame as it nears the monument (see Placed.anchor). */
export function withHost(pose: FigurePose, ev: CampEvent, id: number, ms: number): FigurePose {
  const ramp = ev.host?.ramps.get(id);
  if (!ev.host || !ramp) return pose;
  const [leaves, atGate, gateBack, home] = ramp;
  const mix =
    ms <= leaves || ms >= home
      ? 0
      : ms < atGate
        ? (ms - leaves) / Math.max(1, atGate - leaves)
        : ms <= gateBack
          ? 1
          : (home - ms) / Math.max(1, home - gateBack);
  if (mix <= 0) return pose;
  const { lat, lon, off } = ev.host;
  pose.anchor = { lat, lon, x: pose.x + off.x, z: pose.z + off.z, mix };
  return pose;
}

/** A member's pose in a camp event while it plays or dances. */
export function eventPose(
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
export function sparksAt(cx: Pick<SceneCx, 'scene'>, p: Place, ms: number): void {
  const { scene } = cx;
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

/**
 * The people of the camps round a monument who come to a session (humankind.md section
 * 8.2): from the nearest camps standing then, a few each, they set out from their own
 * hearths, walk there by the gate side of the ring and, when it is over, home again. They
 * take the places the host's people leave. Worked out in each visiting camp's own frame.
 */
export function visitorEvents(
  cx: Pick<
    SceneCx,
    | 'eventOf'
    | 'events'
    | 'huntsOf'
    | 'lodgings'
    | 'mates'
    | 'memo'
    | 'offsetM'
    | 'sessionsOf'
    | 'stageEvent'
    | 'startDay'
    | 'stayAt'
    | 'visitorEvents'
  >,
  stage: TreeStage,
  session: { w: number; start: number; begin: number; stop: number },
): CampEvent[] {
  const {
    eventOf,
    events,
    huntsOf,
    lodgings,
    mates,
    memo,
    offsetM,
    sessionsOf,
    stageEvent,
    startDay,
    stayAt,
    visitorEvents,
  } = cx;
  const key = `${stage.id}:${session.w}`;
  const known = memo.visits.get(key);
  if (known) return known;
  memo.visits.set(key, []);
  const [hostStart, until] = [session.start, session.start + TURN_MS + VISIT_SLACK_MS];
  const start = hostStart - VISIT_EARLY_MS;
  const sessions = sessionsOf(stage);
  const nth = sessions.findIndex((q) => q.w === session.w);
  const hostKey = `${stage.camp}:${stage.lat}:${stage.lon}:${session.w}`;
  if (!events.has(hostKey)) events.set(hostKey, stageEvent(stage, session.w, hostStart, until));
  const taken = events.get(hostKey)?.members.length ?? 0;
  const stands = stageStands(stage.camp, stage.slot, stage.beyond, stage.kind, nth);
  const { prop, gap, at } = stageSpots(stage.camp, stage.slot, stage.beyond);
  const k = stageScale(stage.camp);
  // The camps standing through the session within reach, the nearest first.
  const camps = new Map<string, { off: Pt; d: number; lat: number; lon: number; camp: number }>();
  for (const l of lodgings.values()) {
    if (l.camp === stage.camp && l.lat === stage.lat && l.lon === stage.lon) continue;
    if (
      msAtDay(l.built, startDay) > start ||
      (l.gone !== NEVER && msAtDay(l.gone, startDay) <= until)
    )
      continue;
    const off = offsetM(stage, l);
    const d = Math.sqrt(off.x * off.x + off.z * off.z);
    if (d > VISIT_M || d < 1) continue;
    camps.set(`${l.camp}:${l.lat}:${l.lon}`, { off, d, lat: l.lat, lon: l.lon, camp: l.camp });
  }
  // Whoever is still on the way home from the session before is not free to set out again.
  const before = nth > 0 ? visitorEvents(stage, sessions[nth - 1]!) : [];
  const pools = [...camps.values()]
    .sort((a, b) => a.d - b.d)
    .slice(0, VISIT_CAMPS)
    .map((c) => ({
      c,
      people: mates(c.camp)
        .map((g) => stayAt(g, start))
        .filter(
          (g): g is Stay =>
            !!g &&
            g.home.camp === c.camp &&
            g.home.lat === c.lat &&
            g.home.lon === c.lon &&
            g.free <= start &&
            g.busy >= until &&
            huntsOf(g, start, until).length === 0 &&
            !before.some((ev) => ev.members.includes(g.f.id) && ev.end > start) &&
            [session.w - 1, session.w, session.w + 1].every((x) => {
              const ev = eventOf(g, x);
              return (
                !ev ||
                !ev.members.includes(g.f.id) ||
                ev.end <= start ||
                ev.start >= session.stop + VISIT_SLACK_MS
              );
            }),
        )
        .sort((a, b) => Number(lookOf(a.f.id) === 'child') - Number(lookOf(b.f.id) === 'child'))
        .slice(0, VISIT_PEOPLE),
    }));
  const dance = nth >= MONUMENT_BUILD_SESSIONS;
  const made = new Map<string, CampEvent>();
  let n = taken;
  for (let r = 0; r < VISIT_PEOPLE; r++)
    for (const { c, people } of pools) {
      const m = people[r];
      if (!m || n >= stands.length) continue;
      const i = n;
      const to = { x: stands[i]!.x, z: stands[i]!.z };
      const lag = i * MONUMENT_LAG_MS;
      const home = { x: m.spot.x + c.off.x, z: m.spot.z + c.off.z };
      const trip = new Itinerary(start, home, stage.camp).stay(start + lag, 'rest');
      const leaves = trip.t;
      trip.go(gap);
      const atGate = trip.t;
      for (const q of monumentPath(to, prop, at, k, i)) trip.go(q);
      trip.go(to);
      if (trip.t > session.begin) continue;
      trip.stay(session.begin, 'idle', prop);
      trip.legs.push({ start: session.begin, end: session.stop, clip: 'event', route: [to] });
      trip.t = session.stop;
      trip.at = to;
      trip.stay(session.stop + lag, 'idle', prop);
      for (const q of monumentPath(to, prop, at, k, i).reverse()) trip.go(q);
      trip.go(gap);
      const gateBack = trip.t;
      trip.go(home);
      if (trip.t > until) continue;
      n++;
      const key2 = `${c.camp}:${c.lat}:${c.lon}`;
      let ev = made.get(key2);
      if (!ev) {
        ev = {
          id: `${stage.id}:${session.w}:${key2}`,
          kind: dance ? 'celebrate' : 'raise',
          camp: c.camp,
          members: [],
          a0: 0,
          r: 0,
          start,
          begin: session.begin,
          stop: session.stop,
          end: start,
          legs: new Map(),
          stands: [],
          face: { x: prop.x - c.off.x, z: prop.z - c.off.z },
          host: { lat: deg(stage.lat), lon: deg(stage.lon), off: c.off, ramps: new Map() },
        };
        made.set(key2, ev);
      }
      const back = (p: Pt): Pt => ({ x: p.x - c.off.x, z: p.z - c.off.z });
      ev.members.push(m.f.id);
      ev.host!.ramps.set(m.f.id, [leaves, atGate, gateBack, trip.t]);
      ev.stands!.push(back(to));
      ev.legs.set(
        m.f.id,
        trip.legs.map((l) => ({
          ...l,
          route: l.route.map(back),
          ...(l.face ? { face: back(l.face) } : {}),
        })),
      );
      ev.end = Math.max(ev.end, trip.t);
    }
  const out = [...made.values()];
  memo.visits.set(key, out);
  return out;
}

/** The visits to a monument that a figure of another camp makes in a span. */
export function visitsOf(
  cx: Pick<SceneCx, 'chunk' | 'offsetM' | 'sessionsOf' | 'visitorEvents'>,
  st: Stay,
  from: number,
  to: number,
): CampEvent[] {
  const { chunk, offsetM, sessionsOf, visitorEvents } = cx;
  const out: CampEvent[] = [];
  for (const stage of chunk.stages ?? []) {
    if (stage.kind !== 'monument') continue;
    if (st.home.camp === stage.camp && st.home.lat === stage.lat && st.home.lon === stage.lon)
      continue;
    const off = offsetM(stage, st.home);
    if (off.x * off.x + off.z * off.z > VISIT_M * VISIT_M) continue;
    for (const q of sessionsOf(stage)) {
      if (q.start - VISIT_EARLY_MS >= to || q.start + 2 * TURN_MS <= from) continue;
      for (const ev of visitorEvents(stage, q))
        if (ev.members.includes(st.f.id) && ev.start < to && ev.end > from) out.push(ev);
    }
  }
  return out;
}
