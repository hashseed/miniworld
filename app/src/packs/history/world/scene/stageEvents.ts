// The sessions of the scenes at anchors (spec humankind.md section 8.2): painters, mourners,
// builders and dancers, the dead carried to the grave, the bones fetched for the hut.

import type { TreeStage } from '../tree.ts';
import type { Stay } from './memo.ts';
import { lookOf, type Pt, PACE, smoothstep } from './units.ts';
import {
  stageSessions,
  MONUMENT_BUILD_SESSIONS,
  MONUMENT_DANCE_SESSIONS,
  stageStands,
  stageSpots,
  stageScale,
  monumentPath,
  burialTimes,
  MONUMENT_HOST,
  MONUMENT_LAG_MS,
  BEARER_HALF_M,
  CORPSE_LIFT_MS,
  LAY_MS,
  BONE_LAG_MS,
  BONE_TAKE_MS,
  BONE_SET_MS,
  CARRIED_M,
} from './stages.ts';
import { Itinerary, type Leg, detour, routeLength, along } from './routes.ts';
import { type CampEvent, towards } from './camp.ts';
import type { FigurePose } from './types.ts';
import type { SceneCx } from './context.ts';

export function stageEvent(
  cx: Pick<SceneCx, 'boneTrip' | 'huntsOf' | 'mates' | 'startDay' | 'stayAt'>,
  stage: TreeStage,
  w: number,
  start: number,
  until: number,
) {
  const { boneTrip, huntsOf, mates, startDay, stayAt } = cx;
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
  const paint = stage.kind === 'cave-painting';
  const monument = stage.kind === 'monument';
  const bone = stage.kind === 'bone-hut';
  let cast = [...grown, ...others];
  if (monument) {
    // One person from each lodging in turn, so the parties of the neighbouring bands take
    // part beside the host's people, whoever's lodging has the most.
    const byLodging = new Map<number, Stay[]>();
    for (const m of cast) byLodging.set(m.home.id, [...(byLodging.get(m.home.id) ?? []), m]);
    const turns = [...byLodging.values()];
    cast = [];
    for (let r = 0; cast.length < members.length; r++)
      for (const q of turns) if (r < q.length) cast.push(q[r]!);
  }
  const sessions = stageSessions(stage, startDay);
  const session = sessions.find((q) => q.w === w)!;
  // A monument is raised in its first sessions, danced round in the next and filled in at the end.
  const nth = sessions.indexOf(session);
  const dance =
    monument &&
    nth >= MONUMENT_BUILD_SESSIONS &&
    nth < MONUMENT_BUILD_SESSIONS + MONUMENT_DANCE_SESSIONS;
  // A grown-up paints or digs where there is one, else a child: children made hand stencils too.
  if (cast.length < (paint ? 1 : monument ? 1 : 2)) return undefined;
  const stands = stageStands(stage.camp, stage.slot, stage.beyond, stage.kind, nth);
  const { prop, gap, door, at, pile, pick } = stageSpots(stage.camp, stage.slot, stage.beyond);
  const k = stageScale(stage.camp);
  // Into a cave by its mouth, never through the rock; to a monument round its wall and,
  // for the inner ring, in by the gate on the camp's side.
  const mono = (to: Pt, who: number) => monumentPath(to, prop, at, k, who);
  const way = (trip: Itinerary, to: Pt, who: number) => {
    trip.go(gap);
    if (monument) for (const q of mono(to, who)) trip.go(q);
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
    if (i === (monument ? MONUMENT_HOST : stands.length)) break;
    if (bone) {
      const trip = boneTrip(stage, nth, session, m, i, start, stands[i]!, {
        prop,
        gap,
        pile,
        pick,
      });
      if (trip.t > until || trip.t > m.busy) continue;
      chosen.push(m);
      legs.set(m.f.id, trip.legs);
      end = Math.max(end, trip.t);
      continue;
    }
    // At a monument each sets out a moment after the one before, so they do not bunch.
    const lag = monument ? i * MONUMENT_LAG_MS : 0;
    const trip = way(
      new Itinerary(start, m.spot, m.home.camp).stay(start + lag, 'rest'),
      stands[i]!,
      i,
    ).go(stands[i]!);
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
    if (monument) {
      trip.stay(session.stop, 'idle', prop);
      for (const q of mono(stands[i]!, i).reverse()) trip.go(q);
    }
    trip.go(gap).go(m.spot);
    if (trip.t > until || trip.t > m.busy) continue;
    chosen.push(m);
    legs.set(m.f.id, trip.legs);
    end = Math.max(end, trip.t);
  }
  if (chosen.length < (paint ? 1 : monument ? 1 : 2)) return undefined;
  return {
    id: `${stage.id}:${w}`,
    kind: paint ? 'paint' : monument ? (dance ? 'celebrate' : 'raise') : bone ? 'haul' : 'burial',
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

/**
 * A scene's session (section 8.2): the camp's people free for the whole window walk out
 * beside a lodging to the wall or the grave; one grown-up paints and two watch, or two dig
 * and the others mourn; then they walk back. Undefined when nobody can come.
 */
/**
 * One person's part in a bone hut's session (humankind.md section 8.2): in the first of a
 * round's two, out to the mammoth's carcass to take its bones out, a bundle at a time, to
 * the pile; in the second, from the pile to the hut, to set them in place. All on foot.
 */
export function boneTrip(
  cx: Pick<SceneCx, 'forcedRound' | 'huntOf'>,
  stage: TreeStage,
  nth: number,
  session: { begin: number; stop: number },
  m: Stay,
  i: number,
  start: number,
  stand: Pt,
  where: { prop: Pt; gap: Pt; pile: Pt; pick: Pt },
): Itinerary {
  const { forcedRound, huntOf } = cx;
  const { prop, gap, pile, pick } = where;
  const k = stageScale(stage.camp);
  const wall = { x: prop.x, z: prop.z, r: 8.5 * k };
  const trip = new Itinerary(start, m.spot, m.home.camp).stay(start + i * BONE_LAG_MS, 'rest');
  // Round the hut's wall, never through it.
  const walk = (to: Pt, clip: 'walk' | 'carry' = 'walk') => {
    for (const q of detour(trip.at, to, [wall], 4).slice(1)) trip.go(q, clip);
  };
  const long = (a: Pt, b: Pt) => routeLength(detour(a, b, [wall], 4));
  trip.go(gap);
  const round = Math.floor(nth / 2);
  const fh = nth % 2 === 0 ? forcedRound(stage, round) : undefined;
  const hunt = fh && huntOf(fh.hunter, fh.turn);
  if (hunt) {
    // Each takes a place round the carcass, as the hunters did to butcher it.
    const side = { x: -hunt.out.dirZ, z: hunt.out.dirX };
    const [along, across] = (
      [
        [-7, 0],
        [7, 0],
        [0, 4.9],
        [0, -4.9],
      ] as const
    )[i % 4]!;
    const site = {
      x: hunt.graze.x + hunt.out.dirX * along + side.x * across,
      z: hunt.graze.z + hunt.out.dirZ * along + side.z * across,
    };
    const there = long(site, pick);
    walk(site);
    trip.stay(session.begin, 'idle', hunt.graze);
    for (;;) {
      trip.stay(trip.t + BONE_TAKE_MS, 'work', hunt.graze);
      walk(pick, 'carry');
      trip.stay(trip.t + BONE_SET_MS, 'work', pile);
      if (
        trip.t + there / PACE.walk + BONE_TAKE_MS + there / PACE.carry + BONE_SET_MS >
        session.stop
      )
        break;
      walk(site);
    }
  } else {
    const there = long(pick, stand);
    walk(pick);
    trip.stay(session.begin, 'idle', pile);
    for (;;) {
      trip.stay(trip.t + BONE_SET_MS, 'work', pile);
      walk(stand, 'carry');
      trip.stay(trip.t + BONE_TAKE_MS, 'work', prop);
      if (
        trip.t + there / PACE.walk + BONE_SET_MS + there / PACE.carry + BONE_TAKE_MS >
        session.stop
      )
        break;
      walk(pick);
    }
  }
  walk(gap);
  return trip.go(m.spot);
}

/**
 * The dead between its death and the grave (section 8.2): lifted by the two who dug the
 * grave once it is dug, carried between them, and lowered into it just before it is laid there.
 */
export function corpseAt(
  cx: Pick<SceneCx, 'legPoint'>,
  ev: CampEvent,
  g: NonNullable<ReturnType<typeof burialTimes>>,
  ms: number,
): Partial<FigurePose> {
  const { legPoint } = cx;
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

/** Where a leg plan has a figure at a time, in layout metres. */
export function legPoint(legs: Leg[], ms: number): Pt {
  const leg = legs.find((l) => ms < l.end) ?? legs.at(-1)!;
  const u =
    leg.end === leg.start ? 1 : Math.min(1, Math.max(0, (ms - leg.start) / (leg.end - leg.start)));
  return along(leg.route, u);
}
