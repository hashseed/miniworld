// Where a figure is and what it does at a clock time (spec humankind.md section 8.1).

import type { TreeFigure } from '../tree.ts';
import type { FigurePose } from './types.ts';
import { lookOf, deg, LAYOUT_KM_PER_M, wrapLon, eastOf } from './units.ts';
import { along, Itinerary } from './routes.ts';
import {
  CANOE_GAP_M,
  groupOffset,
  edgeOffset,
  GROUP_SIDE_M,
  type CampEvent,
  TURN_MS,
  towards,
  activity,
  outingTool,
  tillTool,
  BLEND_MS,
} from './camp.ts';
import { isProfile } from './memo.ts';
import type { SceneCx } from './context.ts';

export function poseAt(
  cx: Pick<
    SceneCx,
    | 'crossing'
    | 'eventPose'
    | 'eventsOf'
    | 'fallsIllIn'
    | 'huntsOf'
    | 'lodgings'
    | 'scene'
    | 'soloTurn'
    | 'stayOf'
    | 'turnOf'
    | 'turnStartOf'
    | 'withHost'
  >,
  f: TreeFigure,
  i: number,
  ms: number,
): FigurePose | undefined {
  const {
    crossing,
    eventPose,
    eventsOf,
    fallsIllIn,
    huntsOf,
    lodgings,
    scene,
    soloTurn,
    stayOf,
    turnOf,
    turnStartOf,
    withHost,
  } = cx;
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
    // Canoes spread out along the way, never past either shore.
    const strung = leg.water
      ? Math.max(
          0,
          Math.min(
            1,
            u +
              (((f.homes[i]![2] % 3) - 1) * CANOE_GAP_M * LAYOUT_KM_PER_M * (4 * u * (1 - u))) /
                Math.max(leg.km, 1),
          ),
        )
      : u;
    const pose: FigurePose = {
      ...base,
      lat: leg.from.lat + (leg.to.lat - leg.from.lat) * strung,
      lon: wrapLon(leg.from.lon + eastOf(leg.from.lon, leg.to.lon) * strung),
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
              (n === 0 ? u : n === c.legs.length - 1 ? 1 - u : 1) *
              // Walkers close up where they land or put in, so none steps off a narrow shore.
              (n > 0 && c.legs[n - 1]!.water ? Math.min(1, 4 * u) : 1) *
              (n < c.legs.length - 1 && c.legs[n + 1]!.water ? Math.min(1, 4 * (1 - u)) : 1),
        leg.water,
        // Just landed: the rows behind are not still out on the water.
        n > 0 && !leg.water && c.legs[n - 1]!.water ? (u * leg.km) / LAYOUT_KM_PER_M : Infinity,
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
  let hunt0 = false;
  let event: CampEvent | undefined;
  if (ms >= st.busy && st.takes) {
    plan.stay(Math.max(st.free, st.busy), 'rest').go(st.takeSpot).stay(st.leave, 'work', st.hut);
  } else if (ms >= st.free && !fallsIllIn(f.id, ms)) {
    // Turns of the day: the hunts it takes part in, else its own outing, or a rest.
    const k = turnOf(f.id, ms);
    const turnStart = turnStartOf(f.id, k);
    const joined = huntsOf(st, turnStart, turnStart + TURN_MS).sort((a, b) => a.start - b.start);
    const hunt = joined.find((h) => ms < h.end) ?? joined.at(-1);
    // An event after the hunt is done follows it; one that would overlap it is not joined.
    const games = eventsOf(st, turnStart, turnStart + TURN_MS).filter(
      (e) => !hunt || e.start >= hunt.end,
    );
    const game = games.find((e) => ms < e.end) ?? games.at(-1);
    if (hunt) {
      plan.stay(hunt.start, 'rest');
      plan.legs.push(...hunt.legs.get(f.id)!);
      plan.t = hunt.end;
      hunt0 = true;
      if (hunt.hunter === f.id)
        unarmed = !hunt.bow && hunt.flights.some((fl) => ms >= fl.release && ms < fl.pulled);
    }
    if (game) {
      plan.stay(game.start, 'rest');
      plan.legs.push(...game.legs.get(f.id)!);
      plan.t = game.end;
      event = game;
    } else if (!hunt) {
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
  if (
    leg.prop &&
    leg.prop !== 'prop-spit' &&
    leg.face &&
    !scene.props.some((q) => q.id === `${leg.prop}:${f.id}`)
  )
    scene.props.push({
      id: `${leg.prop}:${f.id}`,
      kind: leg.prop,
      lat: base.lat,
      lon: base.lon,
      x: leg.face.x,
      z: leg.face.z,
      ...towards(leg.face.x, leg.face.z, p.x, p.z),
    });
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
  if (leg.clip === 'event' && event)
    return withHost(eventPose(event, f.id, ms, base), event, f.id, ms);
  const motion =
    leg.clip === 'rest'
      ? activity(f.id, ms, look !== 'child', isProfile(home.culture))
      : leg.clip === 'inside' || leg.clip === 'event'
        ? { clip: 'idle' as const, clipMs: 0 }
        : { clip: leg.clip, clipMs: ms - (leg.start === -Infinity ? 0 : leg.start) };
  const pose: FigurePose = { ...base, x: p.x, z: p.z, ...face, ...motion };
  if (leg.clip === 'inside') pose.hidden = true;
  if (unarmed) pose.unarmed = true;
  // A farm outing's tool is in the hand from the walk out to the walk back (section 8.5).
  if (!event && !hunt0) {
    const held = outingTool(plan.legs, n, tillTool(home.culture));
    if (held === 'milk') pose.unarmed = true;
    else if (held) pose.tool = held;
  }
  if (event) withHost(pose, event, f.id, ms);
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
    const was = activity(f.id, leg.start, look !== 'child', isProfile(home.culture)).clip;
    if (was !== leg.clip)
      pose.from = { clip: was, clipMs: ms - leg.start, weight: (ms - leg.start) / BLEND_MS };
  }
  return pose;
}
