// What the tree of humankind shows at a clock time (spec humankind.md,
// section 8.1): the hearths and lodgings of the camps standing, and every
// figure at its spot, coming out of its lodging, building or taking down a
// lodging, off gathering or hunting, or walking to a new home. A pure
// function of the tree chunk and the clock time.

import { hash32 } from '../core/hash.ts';
import { detCos, RAD } from '../core/detmath.ts';
import { dayAtMs, msAtDay } from '../time/rate.ts';
import type { Day } from '../time/calendar.ts';
import { type FieldClock } from './fieldWork.ts';
import { type Field } from './fieldShapes.ts';
import { NEVER, type TreeFigure, type TreeLodging, type TreeStage } from './tree.ts';
import type { TreeChunk, TreeScene, FigurePose } from './scene/types.ts';
import {
  memoOf,
  isProfile,
  type Village,
  type Stay,
  buildVillage,
  type ForcedHunt,
} from './scene/memo.ts';
import {
  BUILD_MS,
  TAKE_DOWN_MS,
  buildSpot,
  FLINT_MS,
  lodgingSpot,
  rackOnLand,
  rackSpot,
  towards,
  ringOf,
  LODGING_RING_M,
  REGROW_MS,
  THIN_MS,
  figureSpot,
  type CampEvent,
  TURN_MS,
  type Place,
} from './scene/camp.ts';
import { routeLength, route, type Leg, Itinerary } from './scene/routes.ts';
import {
  PACE,
  WALK_KM_PER_MS,
  deg,
  LAYOUT_KM_PER_M,
  lookOf,
  smoothstep,
  type Pt,
} from './scene/units.ts';
import { type PreyKind, STAGE_CLEARING_M, type Hunt } from './scene/hunt.ts';
import {
  stageSessions,
  CAVE_LEAD_MS,
  CAVE_LINGER_MS,
  PAINT_FADE_MS,
  CAVE_FADE_MS,
  PAINT_SESSIONS,
  MONUMENT_BUILD_SESSIONS,
  MONUMENT_SINK_DAYS,
  BONE_ROUNDS,
  BONE_RISE_MS,
  stageSpots,
  stageScale,
  burialTimes,
  GRAVE_FADE_DAYS,
  GRAVE_SINK_MS,
  HEAP_MS,
  LAY_MS,
  GRASS_AFTER_MS,
  GRASS_MS,
  MONUMENT_SCALE,
  SOUL_MS,
} from './scene/stages.ts';
import { type Outing } from './scene/outings.ts';
import {
  eventOf as eventOfOf,
  planEvent as planEventOf,
  eventsOf as eventsOfOf,
  withHost as withHostOf,
  eventPose as eventPoseOf,
  sparksAt as sparksAtOf,
  visitorEvents as visitorEventsOf,
  visitsOf as visitsOfOf,
} from './scene/campEvents.ts';
import {
  stageEvent as stageEventOf,
  boneTrip as boneTripOf,
  corpseAt as corpseAtOf,
  legPoint as legPointOf,
} from './scene/stageEvents.ts';
import {
  villageScene as villageSceneOf,
  jobWorker as jobWorkerOf,
  assignedField as assignedFieldOf,
  fieldSpot as fieldSpotOf,
  farmOuting as farmOutingOf,
} from './scene/villageLife.ts';
import {
  huntPlan as huntPlanOf,
  huntProps as huntPropsOf,
  huntOf as huntOfOf,
  huntsOf as huntsOfOf,
  killAt as killAtOf,
  forcedHunt as forcedHuntOf,
  huntHeld as huntHeldOf,
  forcedRound as forcedRoundOf,
  preyKindOf as preyKindOfOf,
  nearOtherCamp as nearOtherCampOf,
  huntsDuring as huntsDuringOf,
  helpedBefore as helpedBeforeOf,
} from './scene/huntPlans.ts';
import type { SceneCx } from './scene/context.ts';
import { soloTurn as soloTurnOf } from './scene/turns.ts';
import { poseAt as poseAtOf } from './scene/poses.ts';
import {
  stayOf as stayOfOf,
  setPlaces as setPlacesOf,
  crossingOf as crossingOfOf,
} from './scene/stays.ts';
export {
  type TreeChunk,
  type FigureLook,
  type TreeClip,
  type Placed,
  type FigurePose,
  type PreyClip,
  type PreyPose,
  type LodgingPose,
  type FieldPose,
  type HearthPose,
  type SparkPose,
  type CampPropPose,
  type ClearingPose,
  type SpearPose,
  type PolePose,
  type TreeScene,
} from './scene/types.ts';
export { FIGURE_KM_PER_M, TEMPO, WALK_M_PER_S, LAYOUT_KM_PER_M, lookOf } from './scene/units.ts';
export {
  LODGING_RING_M,
  LODGING_SLOTS,
  INNER_SPOTS,
  HEARTH_SPOTS,
  MAX_OUTING_M,
  CAMP_ROOM_M,
  HERD_SCALE,
  HUT_DOOR_M,
  RACK_R,
  SCRAPE_BACK_M,
  SCRAPE_SIDE_M,
  BLEND_MS,
  BUILD_MS,
  TAKE_DOWN_MS,
  BUILD_RING_M,
  THIN_MS,
  REGROW_MS,
  CAMP_CLEARING_KM,
  CAMP_KEEP_OUT_KM,
  VILLAGE_KEEP_OUT_KM,
  COMPACT_SITE,
  MINIMAL_SITE,
  isCompact,
  type Layout,
  MINIMAL_LODGING,
  layoutOf,
  ringOf,
  slotPoint,
  lodgingSpot,
  gapDirection,
  inOutingLane,
  figureSpot,
  hasRack,
} from './scene/camp.ts';
export { POLE_HALF_M, POLE_ON_SHOULDERS_M, POLE_ON_GROUND_M, VISIT_M } from './scene/hunt.ts';
export {
  STAGE_BEYOND_M,
  CAVE_BEYOND_M,
  MONUMENT_BEYOND_M,
  MONUMENT_BUILD_SESSIONS,
  MONUMENT_DANCE_SESSIONS,
  MONUMENT_LEAD_WINDOWS,
  MONUMENT_SINK_DAYS,
  MONUMENT_SCALE,
  CAVE_WATER_CLEAR_M,
  BONE_HUT_BEYOND_M,
  BONE_ROUNDS,
  stageBeyond,
  stageScale,
  stageSpots,
  MONUMENT_MIN,
  MONUMENT_MAX,
  stagePoints,
  CAVE_LEAD_MS,
  CAVE_LINGER_MS,
  CAVE_FADE_MS,
  PAINT_FADE_MS,
  GRAVE_FADE_DAYS,
  GRAVE_SINK_MS,
  burialTimes,
  PAINT_SESSIONS,
  stageSessions,
  stageHunts,
} from './scene/stages.ts';
export { shownAtMs, departureOf } from './scene/memo.ts';

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
  let widths: Map<string, number> | undefined;
  const at = (day: Day) => msAtDay(day, startDay);

  // When each lodging's people start taking it down, so it is gone by the day they leave.
  const takeDown = (l: TreeLodging) =>
    l.gone === NEVER
      ? Infinity
      : Math.max(appears.get(l.id)! + BUILD_MS, at(l.gone) - TAKE_DOWN_MS);

  // The builders of each lodging (moving in on the day it is built) and the figures that
  // take it down (leaving on the day it is gone), by id.
  const { builders, takers, appears, departs, stays, hunts, forced, events, campmates, places } =
    memo;
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
        const water = c.legs.findIndex((l) => l.water);
        const before = c.legs.slice(0, Math.max(0, water)).reduce((a, l) => a + l.km, 0);
        const from = c.legs[Math.max(0, water)]!.from;
        departs.set(id, {
          ms: c.across + Math.ceil(before / WALK_KM_PER_MS),
          lat: from.lat,
          lon: from.lon,
        });
      }

  const scene: TreeScene = {
    figures: [],
    prey: [],
    spears: [],
    poles: [],
    sparks: [],
    props: [],
    fields: [],
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
  // The lookups the scene's parts share (scene/context.ts), made once per call; the functions
  // among them are hoisted, so every part may call any other.
  const cx: SceneCx = {
    appears,
    assignedField,
    at,
    boneTrip,
    builders,
    chunk,
    crossing,
    endOfStay,
    eventOf,
    eventPose,
    events,
    eventsOf,
    fallsIllIn,
    farmOuting,
    fieldClockOf,
    fieldSpot,
    forced,
    forcedHunt,
    forcedRound,
    helpedBefore,
    huntHeld,
    huntOf,
    huntPlan,
    hunts,
    huntsDuring,
    huntsOf,
    jobWorker,
    killAt,
    legPoint,
    lodgings,
    mates,
    memo,
    nearOtherCamp,
    offsetM,
    placeKey,
    places,
    planEvent,
    preyKindOf,
    sameCamp,
    scene,
    sessionsOf,
    soloTurn,
    stageEvent,
    startDay,
    stayAt,
    stayOf,
    stays,
    takeDown,
    takers,
    turnOf,
    turnStartOf,
    villageOf,
    visitorEvents,
    visitsOf,
    withHost,
  };
  if (!memo.ready) setPlaces();
  memo.ready = true;
  function setPlaces() {
    return setPlacesOf(cx);
  }
  const villaged = new Set<number>();
  const villageScene = (l: TreeLodging, v: Village, now: number) => villageSceneOf(cx, l, v, now);
  for (const l of chunk.lodgings) {
    const shown = appears.get(l.id)!;
    const gone = l.gone === NEVER ? Infinity : at(l.gone);
    if (ms < shown || ms >= gone) continue;
    const spot = lodgingSpot(l);
    const down = takeDown(l);
    // A drying rack stands behind some lodgings while they are up (section 8.1).
    if (ms >= shown + BUILD_MS && ms < down && rackOnLand(l)) {
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
      room: ringOf(l.camp) / LODGING_RING_M,
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
    // A Neolithic camp's fields, herd and pen stand as long as one of its houses does (section 8.5).
    if (((isProfile(l.culture) && l.fieldLand) || l.herding) && !villaged.has(l.camp)) {
      villaged.add(l.camp);
      const v = villageOf(l.camp);
      if (v) villageScene(l, v, ms);
    }
  }
  for (const p of places.values()) {
    if (ms >= p.from && ms < p.fireTo && !scene.hearths.some((h) => h.camp === p.camp)) {
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
      // Raised session by session, it stands for a thousand years; in the last five hundred
      // it sinks into the ground by itself, linearly with the date (section 8.2).
      const part = (q: { begin: number; stop: number }) =>
        Math.min(1, Math.max(0, (ms - q.begin) / (q.stop - q.begin)));
      built =
        sessions.slice(0, MONUMENT_BUILD_SESSIONS).reduce((n, q) => n + part(q), 0) /
        MONUMENT_BUILD_SESSIONS;
      const sinks = stage.until - MONUMENT_SINK_DAYS;
      rise = Math.min(1, Math.max(0, (stage.until - dayAtMs(ms, startDay)) / MONUMENT_SINK_DAYS));
      if (dayAtMs(ms, startDay) <= sinks) rise = 1;
      if (built <= 0) continue;
    } else if (stage.kind === 'bone-hut') {
      if (!sessions.length) continue;
      // The pile is filled in each round's first session and emptied in its second; the
      // hut rises a third in each of those (humankind.md section 8.2).
      const part = (q: { begin: number; stop: number }) =>
        Math.min(1, Math.max(0, (ms - q.begin) / (q.stop - q.begin)));
      built = 0;
      let pile = 0;
      for (const [n, q] of sessions.entries()) {
        if (n % 2) {
          built += part(q) / BONE_ROUNDS;
          pile -= part(q);
        } else pile += part(q);
      }
      rise = Math.min(1, Math.max(0, (ms - sessions[1]!.begin) / BONE_RISE_MS));
      if (pile > 0) {
        const { pile: at, u } = stageSpots(stage.camp, stage.slot, stage.beyond);
        scene.props.push({
          id: `stage:${stage.id}:pile`,
          kind: 'prop-bone-pile',
          lat: deg(stage.lat),
          lon: deg(stage.lon),
          x: at.x,
          z: at.z,
          dirX: -u.x,
          dirZ: -u.z,
          built: Math.min(1, pile),
          scale: stageScale(stage.camp),
          rise: 1,
        });
      }
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
    // The trees make way for the scene, so none stands in a wall, hut or grave (issues 171, 173).
    scene.clearings.push({
      lat: deg(stage.lat),
      lon: deg(stage.lon),
      x: prop.x,
      z: prop.z,
      km: STAGE_CLEARING_M[stage.kind] * stageScale(stage.camp) * LAYOUT_KM_PER_M,
      amount: Math.min(1, rise * 2),
      felling: false,
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
    // Asked for while the lookups are still being worked out, before cx exists.
    return crossingOfOf({ at, endOfStay, lodgings }, f, i);
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
    return eventOfOf(cx, ref, w);
  }

  /** Where a leg plan has a figure at a time, in layout metres. */
  function legPoint(legs: Leg[], ms: number): Pt {
    return legPointOf(legs, ms);
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
    return corpseAtOf(cx, ev, g, ms);
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
  function boneTrip(
    stage: TreeStage,
    nth: number,
    session: { begin: number; stop: number },
    m: Stay,
    i: number,
    start: number,
    stand: Pt,
    where: { prop: Pt; gap: Pt; pile: Pt; pick: Pt },
  ): Itinerary {
    return boneTripOf(cx, stage, nth, session, m, i, start, stand, where);
  }

  function stageEvent(stage: TreeStage, w: number, start: number, until: number) {
    return stageEventOf(cx, stage, w, start, until);
  }

  /** The history lens's drawn km per true km at a camp's place, from its lodgings. */
  function widthOf(p: { camp: number; lat: number; lon: number }): number {
    if (!widths) {
      widths = new Map();
      for (const l of lodgings.values()) widths.set(`${l.camp}:${l.lat}:${l.lon}`, l.width ?? 1);
    }
    return widths.get(`${p.camp}:${p.lat}:${p.lon}`) ?? 1;
  }

  /**
   * A place's offset from another's in layout metres, east and north. Layout metres are
   * drawn, so a true distance counts for as much more as the history lens draws the land
   * bigger there, on average between the two places (humankind.md section 8.2).
   */
  function offsetM(
    from: { camp: number; lat: number; lon: number },
    to: { camp: number; lat: number; lon: number },
  ): Pt {
    const mid = (deg(from.lat) + deg(to.lat)) / 2;
    const w = (widthOf(from) + widthOf(to)) / 2;
    return {
      x: (w * (deg(to.lon) - deg(from.lon)) * 111.2 * detCos(mid * RAD)) / LAYOUT_KM_PER_M,
      z: (w * (deg(to.lat) - deg(from.lat)) * 111.2) / LAYOUT_KM_PER_M,
    };
  }

  /** A monument's sessions, kept: they are asked for again and again. */
  function sessionsOf(stage: TreeStage) {
    let list = memo.sessions.get(stage);
    if (!list) memo.sessions.set(stage, (list = stageSessions(stage, startDay)));
    return list;
  }

  /**
   * The people of the camps round a monument who come to a session (humankind.md section
   * 8.2): from the nearest camps standing then, a few each, they set out from their own
   * hearths, walk there by the gate side of the ring and, when it is over, home again. They
   * take the places the host's people leave. Worked out in each visiting camp's own frame.
   */
  function visitorEvents(
    stage: TreeStage,
    session: { w: number; start: number; begin: number; stop: number },
  ): CampEvent[] {
    return visitorEventsOf(cx, stage, session);
  }

  /** The visits to a monument that a figure of another camp makes in a span. */
  function visitsOf(st: Stay, from: number, to: number): CampEvent[] {
    return visitsOfOf(cx, st, from, to);
  }

  /** Everyone walks to their place on the ring, plays or dances, and walks back. */
  function planEvent(
    kind: 'catch' | 'dance',
    members: Stay[],
    w: number,
    start: number,
    until: number,
  ): CampEvent | undefined {
    return planEventOf(kind, members, w, start, until);
  }

  /** The camp events a figure takes part in that overlap a span. */
  function eventsOf(st: Stay, from: number, to: number): CampEvent[] {
    return eventsOfOf(cx, st, from, to);
  }

  /** A visitor's pose, drawn towards the host's frame as it nears the monument (see Placed.anchor). */
  function withHost(pose: FigurePose, ev: CampEvent, id: number, ms: number): FigurePose {
    return withHostOf(pose, ev, id, ms);
  }

  /** A member's pose in a camp event while it plays or dances. */
  function eventPose(
    ev: CampEvent,
    id: number,
    ms: number,
    base: Pick<FigurePose, 'id' | 'look' | 'lat' | 'lon'>,
  ): FigurePose {
    return eventPoseOf(ev, id, ms, base);
  }

  /** A few sparks jumping from the flint stones, a pure function of the clock (section 8.1). */
  function sparksAt(p: Place, ms: number): void {
    return sparksAtOf(cx, p, ms);
  }

  /** A figure's stay in its `i`-th home: the camp, its spot, its plan up to when it is free, and when it must be busy again. */

  function stayOf(f: TreeFigure, i: number): Stay | undefined {
    return stayOfOf(cx, f, i);
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

  /** The village of a camp (section 8.5), worked out once. */
  function villageOf(camp: number): Village | undefined {
    let v = memo.villages.get(camp);
    if (v === undefined) {
      v = buildVillage(chunk, camp);
      memo.villages.set(camp, v);
    }
    return v ?? undefined;
  }

  /** The clock of a village's field jobs (fieldWork.ts). */
  function fieldClockOf(camp: number, v: Village): FieldClock {
    return { fields: v.fields.length, seed: hash32(camp, 277), from: at(v.founded) };
  }

  /**
   * Who does the job of a slot: one of the camp's grown-up farmers and reapers who are at home
   * then, by hash; nobody where there is none, and then the slot's field is left as it is.
   */
  function jobWorker(camp: number, field: number, t: number): number | undefined {
    return jobWorkerOf(cx, camp, field, t);
  }

  /** The field a figure is given to work in its `k`-th turn, if its turn starts in a slot whose job is its own. */
  function assignedField(st: Stay, k: number): number | undefined {
    return assignedFieldOf(cx, st, k);
  }

  /** The field a figure works in its `k`-th turn, and where in it. */
  function fieldSpot(st: Stay, k: number): { field: Field; at: Pt; face: Pt } | undefined {
    return fieldSpotOf(cx, st, k);
  }

  /**
   * The Neolithic work a grown-up's role gives it in its `k`-th turn, in the season of the
   * field it would work (section 8.5), or undefined for the turn's usual outing.
   */
  function farmOuting(st: Stay, k: number, turnStart: number): Outing | undefined {
    return farmOutingOf(cx, st, k, turnStart);
  }

  /**
   * What a figure goes out to do in its `k`-th turn on its own, as far as its gap has land
   * (section 8.1): a gathering or a stroll with its legs, a hunt (planned as a camp event
   * by huntOf), or nothing.
   */
  function soloTurn(st: Stay, k: number, plain = false): { go: Outing; trip?: Itinerary } {
    return soloTurnOf(cx, st, k, plain);
  }

  /** The kill of a hunt lying at a figure's camp at a clock time, if any (section 8.1). */
  function killAt(st: Stay, t: number): Hunt | undefined {
    return killAtOf(cx, st, t);
  }

  /**
   * The mammoth hunt a bone hut's camp holds in its hunt windows (humankind.md section 8.2):
   * led by the first grown-up of the camp who is free for the window, in their turn that
   * starts in it. Undefined for any other turn.
   */
  function forcedHunt(st: Stay, k: number): ForcedHunt | undefined {
    return forcedHuntOf(cx, st, k);
  }

  /** Whether a bone hut's mammoth hunt is held at the camp around a turn start, which keeps the others home so they are free to help (issue 173). */
  function huntHeld(st: Stay, turnStart: number): boolean {
    return huntHeldOf(cx, st, turnStart);
  }

  /** The hunt of a bone hut's round: led by the first grown-up of its camp free for the whole turn that starts in the hunt's window. */
  function forcedRound(stage: TreeStage, round: number): ForcedHunt | undefined {
    return forcedRoundOf(cx, stage, round);
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
    return huntOfOf(cx, st, k);
  }

  /** Whether a point of a figure's camp lies near another camp standing at a clock time. */
  function nearOtherCamp(st: Stay, p: Pt, t: number): boolean {
    return nearOtherCampOf(cx, st, p, t);
  }

  /** Whether a figure leads a hunt of its own that overlaps a span. */
  function huntsDuring(st: Stay, from: number, to: number): boolean {
    return huntsDuringOf(cx, st, from, to);
  }

  /** Whether a hunter of the camp with a lower id than `hunter` already has `helper` in a span. */
  function helpedBefore(hunter: Stay, helper: Stay, from: number, to: number): boolean {
    return helpedBeforeOf(cx, hunter, helper, from, to);
  }

  /** The hunts in which a figure takes part, as hunter or helper, that overlap a span. */
  function huntsOf(st: Stay, from: number, to: number): Hunt[] {
    return huntsOfOf(cx, st, from, to);
  }

  /**
   * A hunt from start to end (section 8.1): both walk out, the hunter throws, perhaps
   * misses, picks the spear up and throws again; then they bind the kill to the pole and
   * carry it back, or a hunter alone butchers it and carries the meat.
   */
  /** What a hunt goes after, by hash; a mammoth only where and when it can be (MAMMOTH). */
  function preyKindOf(st: Stay, k: number, small = false): PreyKind {
    return preyKindOfOf(cx, st, k, small);
  }

  function huntPlan(st: Stay, k: number, party: Stay[], small = false): Hunt {
    return huntPlanOf(cx, st, k, party, small);
  }

  /** The hunted animal, the spears away from the hand and the pole of a hunt at a clock time. */
  function huntProps(h: Hunt, ms: number): void {
    return huntPropsOf(cx, h, ms);
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
    return poseAtOf(cx, f, i, ms);
  }
}
