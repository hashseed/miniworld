// A figure's stays at camps and its walks between them (spec humankind.md sections 3 and 8.1).

import { type TreeFigure, NEVER, type TreeLodging } from '../tree.ts';
import { type Stay, isProfile } from './memo.ts';
import {
  figureSpot,
  buildSpot,
  lodgingSpot,
  doorOf,
  lightSpot,
  BUILD_MS,
  INSIDE_MS,
  FLINT_MS,
  towards,
  GROUP_SIDE_M,
  gateM,
} from './camp.ts';
import { Itinerary, routeLength, route } from './routes.ts';
import {
  PACE,
  lookOf,
  deg,
  type LatLon,
  placeOf,
  kmBetween,
  SAME_PLACE_KM,
  WALK_KM_PER_MS,
  eastOf,
} from './units.ts';
import { detCos, RAD } from '../../core/detmath.ts';
import type { SceneCx } from './context.ts';

/** A figure's stay in its `i`-th home: the camp, its spot, its plan up to when it is free, and when it must be busy again. */

export function stayOf(
  cx: Pick<
    SceneCx,
    | 'appears'
    | 'at'
    | 'builders'
    | 'crossing'
    | 'endOfStay'
    | 'lodgings'
    | 'placeKey'
    | 'places'
    | 'stays'
    | 'takeDown'
    | 'takers'
  >,
  f: TreeFigure,
  i: number,
): Stay | undefined {
  const {
    appears,
    at,
    builders,
    crossing,
    endOfStay,
    lodgings,
    placeKey,
    places,
    stays,
    takeDown,
    takers,
  } = cx;
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
    if (
      builds &&
      home === place.first &&
      f.id === home.builder &&
      place.from > 0 &&
      place.litEnd > place.litStart
    )
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

export function setPlaces(
  cx: Pick<SceneCx, 'appears' | 'at' | 'builders' | 'chunk' | 'memo' | 'placeKey' | 'places'>,
) {
  const { appears, at, builders, chunk, memo, placeKey, places } = cx;
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
        fireTo: isProfile(l.culture) ? -Infinity : gone,
      });
    else {
      if (arrived < p.from) [p.from, p.first] = [arrived, l];
      if (!isProfile(l.culture)) p.fireTo = Math.max(p.fireTo, gone);
      p.to = Math.max(p.to, gone);
      p.wood = Math.max(p.wood, l.wood ?? 0);
    }
  }
  for (const p of places.values()) {
    if (p.from <= 0) continue;
    p.fellEnd = p.from;
    p.litStart = p.fellEnd;
    p.litEnd = isProfile(p.first.culture) ? p.litStart : p.litStart + FLINT_MS;
  }
  // No lodging goes up before the felling is done, nor the lighter's before the fire is lit.
  for (const l of chunk.lodgings) {
    const p = places.get(placeKey(l))!;
    if (p.from <= 0) continue;
    let shown = Math.max(appears.get(l.id)!, p.fellEnd);
    if (l === p.first && !isProfile(l.culture)) {
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

export function crossingOf(
  cx: Pick<SceneCx, 'at' | 'endOfStay' | 'lodgings'>,
  f: TreeFigure,
  i: number,
) {
  const { at, endOfStay, lodgings } = cx;
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
