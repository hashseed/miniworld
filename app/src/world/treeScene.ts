// What the tree of humankind shows at a clock time (spec humankind.md,
// section 8.1): the hearths and lodgings of the camps standing, and every
// figure at its spot, coming out of its lodging, building or taking down a
// lodging, off gathering or hunting, or walking to a new home. A pure
// function of the tree chunk and the clock time.

import { hash01, hash32 } from '../core/hash.ts';
import { detCos, detSin, RAD } from '../core/detmath.ts';
import { dayAtMs, msAtDay } from '../time/rate.ts';
import type { Day } from '../time/calendar.ts';
import { JOB_MS, fieldOfSlot, fieldStage, jobAt, type FieldClock } from './fieldWork.ts';
import { pointInPolygon, type Field } from './fieldShapes.ts';
import { huntsOf as preyOf } from './cultures.ts';
import { roleOf } from './roles.ts';
import { NEVER, type TreeFigure, type TreeLodging, type TreeStage } from './tree.ts';
import type { TreeChunk, TreeScene, FigurePose, PreyPose } from './scene/types.ts';
import {
  memoOf,
  isProfile,
  type Village,
  FIELD_TREE_MARGIN_M,
  type Stay,
  buildVillage,
  MILKED,
  type ForcedHunt,
} from './scene/memo.ts';
import {
  BUILD_MS,
  TAKE_DOWN_MS,
  buildSpot,
  FLINT_MS,
  lightSpot,
  PEN_SCALE,
  HERD_LOOK_MS,
  HERD_SCALE,
  lodgingSpot,
  rackOnLand,
  rackSpot,
  towards,
  ringOf,
  LODGING_RING_M,
  REGROW_MS,
  THIN_MS,
  GROUP_SIDE_M,
  gateM,
  figureSpot,
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
  CATCH_PACE_SHARE,
  type Place,
  doorOf,
  INSIDE_MS,
  FARM_WORK_SHARE,
  JOB_OUTING,
  outingRoom,
  FIREWOOD_M,
  outingPoint,
  BREAK_MS,
  MAX_OUTING_M,
  gapDirection,
  FISH_WATCH_MS,
  FISH_STAB_MS,
  FILL_MS,
  RACK_R,
  SCRAPE_BACK_M,
  SCRAPE_SIDE_M,
  SCRAPE_MS,
  rackSides,
  TAKE_HIDE_MS,
  FLAY_MS,
  HANG_HIDE_MS,
  FIELD_WORK_MS,
  THRESH_ROOM_M,
  THRESH_MS,
  MILK_MS,
  SPIN_MS,
  GRIND_MS,
  CRACK_MS,
  KNAP_POINT_MS,
  BIND_POINT_MS,
  BUTCHER_MEAT_MS,
  ROAST_MS,
  CANOE_GAP_M,
  groupOffset,
  edgeOffset,
  activity,
  outingTool,
  tillTool,
  BLEND_MS,
} from './scene/camp.ts';
import { routeLength, route, type Leg, along, Itinerary, detour } from './scene/routes.ts';
import {
  PACE,
  WALK_KM_PER_MS,
  deg,
  LAYOUT_KM_PER_M,
  lookOf,
  smoothstep,
  type LatLon,
  placeOf,
  kmBetween,
  SAME_PLACE_KM,
  eastOf,
  type Pt,
  wrapLon,
} from './scene/units.ts';
import {
  type PreyKind,
  STAGE_CLEARING_M,
  VISIT_M,
  VISIT_EARLY_MS,
  VISIT_SLACK_MS,
  VISIT_CAMPS,
  VISIT_PEOPLE,
  PREY_REACH_M,
  GATHER_M,
  GATHER_MS,
  LOOK_MS,
  PREY_FADE_MS,
  type Hunt,
  MAMMOTH,
  OTHER_CAMP_M,
  MAMMOTH_UNTIL,
  BOW_FROM,
  PREY_GRAZE_M,
  PREY_FALL_M,
  THROW_GAP_M,
  MISS_SHARE,
  LARGE_GAME,
  BOW_STEP_M,
  ROAM_MS,
  PREY_WALK,
  HERD_SIDE_M,
  SCATTER_LINGER_MS,
  SCATTER_MORE_MS,
  GRAZE_FIRST_MS,
  type Flight,
  SHOOT_RELEASE_MS,
  RELEASE_MS,
  SHOOT_MS,
  THROW_MS,
  FLIGHT_MS,
  scatterAt,
  DROP_M,
  MISS_BEYOND_M,
  MISS_SIDE_M,
  BOLT_MS,
  WOUND_MS,
  SETTLE_MS,
  PICK_MS,
  KNEEL_SIDE_M,
  BIND_MS,
  POLE_HALF_M,
  LIFT_MS,
  PUT_MS,
  BUTCHER_MS,
  DROP_LINGER_MS,
  HUNT_CLEARING_KM,
  BOW_AHEAD_M,
  BOW_ASIDE_M,
  BOW_H,
  NOCK_DRAWN_M,
  NOCK_REST_M,
  HAND_H,
  HIT_H,
  SPEAR_ARC,
  POLE_ON_GROUND_M,
  POLE_ON_SHOULDERS_M,
} from './scene/hunt.ts';
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
  CORPSE_LIFT_MS,
  CARRIED_M,
  BONE_LAG_MS,
  BONE_TAKE_MS,
  BONE_SET_MS,
  MONUMENT_DANCE_SESSIONS,
  stageStands,
  monumentPath,
  MONUMENT_HOST,
  MONUMENT_LAG_MS,
  BEARER_HALF_M,
  stageHunts,
} from './scene/stages.ts';
import { type Outing, outingOf } from './scene/outings.ts';
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
  const villaged = new Set<number>();
  const villageScene = (l: TreeLodging, v: Village, now: number) => {
    const [lat, lon] = [deg(l.lat), deg(l.lon)];
    const clock = fieldClockOf(l.camp, v);
    for (const field of v.fields)
      scene.fields.push({
        id: `${l.camp}:${field.id}`,
        lat,
        lon,
        field,
        stage: fieldStage(clock, field.id, now),
      });
    // The trees keep off the fields, as they keep off the camp.
    for (const field of v.fields)
      scene.clearings.push({
        lat,
        lon,
        x: field.centre.x,
        z: field.centre.z,
        // Round the field's farthest corner, with a margin: a long field is no circle.
        km:
          (Math.max(
            ...field.outline.map((p) =>
              Math.sqrt((p.x - field.centre.x) ** 2 + (p.z - field.centre.z) ** 2),
            ),
          ) +
            FIELD_TREE_MARGIN_M) *
          LAYOUT_KM_PER_M,
        amount: 1,
        felling: false,
      });
    if (!v.herd) return;
    const { pen, penDir } = v.herd;
    scene.props.push({
      id: `pen:${l.camp}`,
      kind: 'prop-pen',
      lat,
      lon,
      x: pen.x,
      z: pen.z,
      dirX: penDir.x,
      dirZ: penDir.z,
      scale: PEN_SCALE,
    });
    v.herd.animals.forEach((a, i) => {
      scene.prey.push({
        id: `herd:${l.camp}:${i}`,
        kind: a.kind as PreyKind,
        lat,
        lon,
        x: a.x,
        z: a.z,
        dirX: detCos(a.heading),
        dirZ: detSin(a.heading),
        // Grazing most of the time, head up now and then.
        clip: Math.floor((now + a.phase) / HERD_LOOK_MS + i) % 3 === 0 ? 'idle' : 'graze',
        clipMs: now + a.phase,
        visibility: 1,
        scale: HERD_SCALE,
      });
    });
  };
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
  function visitsOf(st: Stay, from: number, to: number): CampEvent[] {
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
    out.push(...visitsOf(st, from, to));
    return out;
  }

  /** A visitor's pose, drawn towards the host's frame as it nears the monument (see Placed.anchor). */
  function withHost(pose: FigurePose, ev: CampEvent, id: number, ms: number): FigurePose {
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
    return { fields: v.fields.length, seed: hash32(camp, 277) };
  }

  /**
   * Who does the job of a slot: one of the camp's grown-up farmers and reapers who are at home
   * then, by hash; nobody where there is none, and then the slot's field is left as it is.
   */
  function jobWorker(camp: number, slot: number): number | undefined {
    const key = `${camp}:${slot}`;
    if (memo.workers.has(key)) return memo.workers.get(key);
    const t = slot * JOB_MS;
    const ids: number[] = [];
    const others: number[] = [];
    for (const f of mates(camp)) {
      const st = stayAt(f, t);
      if (!st || st.home.camp !== camp || st.look === 'child' || t < st.free || t >= st.busy)
        continue;
      if (!isProfile(st.home.culture)) continue;
      const role = roleOf(st.home.culture, f.id);
      (role === 'farmer' || role === 'reaper' ? ids : others).push(f.id);
    }
    // With no farmer at home, any grown-up of the village takes the job: a field is never left untended.
    const pool = ids.length ? ids : others;
    pool.sort((a, b) => a - b);
    const worker = pool.length ? pool[hash32(camp, slot, 263) % pool.length] : undefined;
    memo.workers.set(key, worker);
    return worker;
  }

  /** The field a figure is given to work in its `k`-th turn, if its turn starts in a slot whose job is its own. */
  function assignedField(st: Stay, k: number): number | undefined {
    const turnStart = turnStartOf(st.f.id, k);
    const slot = Math.ceil(turnStart / JOB_MS);
    if (slot * JOB_MS >= turnStart + TURN_MS) return undefined;
    const v = villageOf(st.home.camp);
    if (!v?.fields.length || jobWorker(st.home.camp, slot) !== st.f.id) return undefined;
    return fieldOfSlot(fieldClockOf(st.home.camp, v), slot);
  }

  /** The field a figure works in its `k`-th turn, and where in it. */
  function fieldSpot(st: Stay, k: number): { field: Field; at: Pt; face: Pt } | undefined {
    const v = villageOf(st.home.camp);
    if (!v?.fields.length) return undefined;
    const field = v.fields[assignedField(st, k) ?? hash32(st.f.id, k, 243) % v.fields.length]!;
    // Somewhere in the field's middle third, in the furrow's line.
    const r = 0.5 * Math.sqrt(field.area / Math.PI) * hash01(st.f.id, k, 245);
    const a = hash01(st.f.id, k, 247) * 2 * Math.PI;
    let at = { x: field.centre.x + r * detCos(a), z: field.centre.z + r * detSin(a) };
    if (!pointInPolygon(field.outline, at.x, at.z)) at = field.centre;
    const face = {
      x: at.x + 2 * detCos(field.furrowAngle),
      z: at.z + 2 * detSin(field.furrowAngle),
    };
    return { field, at, face };
  }

  /**
   * The Neolithic work a grown-up's role gives it in its `k`-th turn, in the season of the
   * field it would work (section 8.5), or undefined for the turn's usual outing.
   */
  function farmOuting(st: Stay, k: number, turnStart: number): Outing | undefined {
    const profile = st.home.culture;
    if (!isProfile(profile) || st.look === 'child') return undefined;
    const role = roleOf(profile, st.f.id);
    const assigned = assignedField(st, k) !== undefined;
    if (!assigned && hash01(st.f.id, k, 241) >= FARM_WORK_SHARE) return undefined;
    switch (assigned ? 'farmer' : role) {
      case 'farmer':
      case 'reaper': {
        const w = fieldSpot(st, k);
        const v = villageOf(st.home.camp);
        if (!w || !v) return undefined;
        const job = jobAt(fieldClockOf(st.home.camp, v), w.field.id, turnStart);
        // Hands that are not the field's worker help with its next job; reapers only reap.
        if (role === 'reaper' && job !== 'reap' && !assigned) return undefined;
        return JOB_OUTING[job];
      }
      case 'herder':
        return villageOf(st.home.camp)?.herd?.animals.some((a) => MILKED.has(a.kind))
          ? 'milk'
          : undefined;
      case 'potter':
        return 'shape';
      case 'weaver':
        return 'spin';
      case 'grinder':
        return 'grind';
      default:
        return undefined;
    }
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
    const planned = forcedHunt(st, k)
      ? 'hunt'
      : huntHeld(st, turnStart)
        ? 'rest'
        : (farmOuting(st, k, turnStart) ?? outingOf(st.f.id, st.look, k));
    const own = !plain && planned !== 'hunt' ? huntOf(st, k - 1) : undefined;
    const roast = !isProfile(st.home.culture) && !!own && own.pole && killAt(st, turnStart) === own;
    const outing = roast ? 'cook' : planned;
    // Outings stay on land: each goes only as far as its gap has land, or not at all.
    const room = outingRoom(st.s, st.home);
    const kind =
      outing === 'hunt' && room < PREY_REACH_M ? (room >= GATHER_M ? 'gather' : 'rest') : outing;
    const sure = kind === 'gather' && room < GATHER_M ? (room >= 16 ? 'stroll' : 'rest') : kind;
    let go: Outing = sure === 'stroll' && room < 13 ? 'rest' : sure;
    // No fire in a village: nobody cracks nuts or roasts at it.
    if (isProfile(st.home.culture) && (go === 'crack' || go === 'cook')) go = 'rest';
    if (go === 'firewood' && room < FIREWOOD_M + 1) go = 'rest';
    // A compact camp has no drying racks.
    if ((go === 'scrape' || go === 'rack' || go === 'flay') && !rackOnLand(st.home)) go = 'rest';
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
    } else if (go === 'till' || go === 'sow' || go === 'reap') {
      // Out to the field, work in it, and for the reaper a sheaf carried in to the threshing floor.
      const w = fieldSpot(st, k);
      if (!w || Math.sqrt(w.at.x ** 2 + w.at.z ** 2) > MAX_OUTING_M - 2) return { go: 'rest' };
      trip.go(w.at).stay(trip.t + FIELD_WORK_MS, go, w.face);
      if (go === 'reap' && room >= THRESH_ROOM_M) {
        const floor = outingPoint(st.s, camp, 8);
        trip
          .go(floor, 'carry')
          .stay(trip.t + THRESH_MS, 'thresh', { x: floor.x * 2, z: floor.z * 2 });
      }
      trip.go(st.spot);
    } else if (go === 'thresh') {
      if (room < THRESH_ROOM_M) return { go: 'rest' };
      // The threshing floor between the lodgings and the fire.
      const floor = outingPoint(st.s, camp, 8);
      trip
        .go(floor, 'carry')
        .stay(trip.t + THRESH_MS, 'thresh', { x: floor.x * 2, z: floor.z * 2 })
        .go(st.spot);
    } else if (go === 'milk') {
      const animals = villageOf(camp)?.herd?.animals.filter((a) => MILKED.has(a.kind));
      if (!animals?.length) return { go: 'rest' };
      const a = animals[hash32(st.f.id, k, 251) % animals.length]!;
      // Beside the animal, on the side towards the camp.
      const d = Math.sqrt(a.x ** 2 + a.z ** 2);
      const by = { x: a.x - (a.x / d) * 1.6, z: a.z - (a.z / d) * 1.6 };
      trip
        .go(by)
        .stay(trip.t + MILK_MS, 'milk', { x: a.x, z: a.z })
        .go(st.spot);
    } else if (go === 'grind' || go === 'shape' || go === 'spin') {
      // Beside its own lodging, to one side of the door.
      const door = doorOf(st.home);
      const r = Math.sqrt(door.x ** 2 + door.z ** 2);
      const side = 2.2;
      const by = { x: door.x - (door.z / r) * side, z: door.z + (door.x / r) * side };
      const lodging = lodgingSpot(st.home);
      const prop = go === 'grind' ? 'prop-quern' : go === 'shape' ? 'prop-pot-large' : undefined;
      const face = prop
        ? { x: by.x + (lodging.x - by.x) * 0.12, z: by.z + (lodging.z - by.z) * 0.12 }
        : lodging;
      trip
        .go(by)
        .stay(trip.t + (go === 'spin' ? SPIN_MS : GRIND_MS), go, face, prop)
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

  /**
   * The mammoth hunt a bone hut's camp holds in its hunt windows (humankind.md section 8.2):
   * led by the first grown-up of the camp who is free for the window, in their turn that
   * starts in it. Undefined for any other turn.
   */
  function forcedHunt(st: Stay, k: number): ForcedHunt | undefined {
    if (!chunk.stages?.length || lookOf(st.f.id) === 'child') return undefined;
    const turnStart = turnStartOf(st.f.id, k);
    for (const stage of chunk.stages) {
      if (
        stage.kind !== 'bone-hut' ||
        stage.camp !== st.home.camp ||
        stage.lat !== st.home.lat ||
        stage.lon !== st.home.lon
      )
        continue;
      const round = stageHunts(stage, startDay).findIndex(
        (x) => turnStart >= x.start && turnStart < x.start + TURN_MS,
      );
      const f = round < 0 ? undefined : forcedRound(stage, round);
      if (f && f.hunter.f.id === st.f.id && f.turn === k) return f;
    }
    return undefined;
  }

  /** Whether a bone hut's mammoth hunt is held at the camp around a turn start, which keeps the others home so they are free to help (issue 173). */
  function huntHeld(st: Stay, turnStart: number): boolean {
    for (const stage of chunk.stages ?? []) {
      if (
        stage.kind !== 'bone-hut' ||
        stage.camp !== st.home.camp ||
        stage.lat !== st.home.lat ||
        stage.lon !== st.home.lon
      )
        continue;
      const hunts = stageHunts(stage, startDay);
      for (let r = 0; r < hunts.length; r++)
        if (
          turnStart >= hunts[r]!.start - TURN_MS &&
          turnStart < hunts[r]!.start + TURN_MS &&
          forcedRound(stage, r)
        )
          return true;
    }
    return false;
  }

  /** The hunt of a bone hut's round: led by the first grown-up of its camp free for the whole turn that starts in the hunt's window. */
  function forcedRound(stage: TreeStage, round: number): ForcedHunt | undefined {
    const key = `${stage.id}:${round}`;
    if (forced.has(key)) return forced.get(key);
    forced.set(key, undefined);
    const window = stageHunts(stage, startDay)[round]!;
    let found: ForcedHunt | undefined;
    for (const g of [...mates(stage.camp)].sort((a, b) => a.id - b.id)) {
      if (lookOf(g.id) === 'child') continue;
      const phase = hash32(g.id, 73) % TURN_MS;
      const turn = Math.ceil((window.start + phase) / TURN_MS);
      const begin = turn * TURN_MS - phase;
      const gs = stayAt(g, begin);
      if (
        !gs ||
        gs.home.camp !== stage.camp ||
        gs.home.lat !== stage.lat ||
        gs.home.lon !== stage.lon ||
        gs.free > begin ||
        gs.busy < begin + TURN_MS ||
        outingRoom(gs.s, gs.home) < MAMMOTH.reach
      )
        continue;
      found = {
        stage,
        round,
        hunter: gs,
        turn,
        stop: stageSessions(stage, startDay)[2 * round]?.stop ?? 0,
      };
      break;
    }
    forced.set(key, found);
    return found;
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
    const kinds = preyOf(st.home.culture) as readonly PreyKind[];
    const kind = forcedHunt(st, k)
      ? 'animal-mammoth'
      : kinds[hash32(st.f.id, k, 79) % kinds.length]!;
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
    const bow = st.home.culture !== 'neanderthal' && start >= at(BOW_FROM);
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
    // With a bow, a miss and then the larger game's first arrow each leave it a step further on.
    const shots: ('miss' | 'wound' | 'kill')[] =
      bow && !big
        ? [
            ...(miss ? ['miss' as const] : []),
            ...(LARGE_GAME.has(kind) ? ['wound' as const] : []),
            'kill',
          ]
        : [];
    const kill = shots.length
      ? lane(grazeM + BOW_STEP_M * (shots.length - 1))
      : miss
        ? lane(fallM)
        : graze;
    // The herd comes out of the trees at the far end of the lane, where its land ends.
    const entry = lane(Math.min(outingRoom(st.s, st.home), MAX_OUTING_M) - 1);
    const appear = start - ROAM_MS;
    const arrive =
      appear +
      PREY_FADE_MS +
      Math.ceil(Math.sqrt((entry.x - graze.x) ** 2 + (entry.z - graze.z) ** 2) / PREY_WALK);
    const herdSide = big ? MAMMOTH.herdSide : HERD_SIDE_M;
    // A bone hut's hunt is after a herd of three: the one that falls and two that stand by.
    const herdSize = big && forcedHunt(st, k) ? 2 : 1 + (hash32(st.f.id, k, 89) % 2);
    const herd = Array.from({ length: herdSize }, (_, n) => {
      const across = (n === 0 ? 1 : n === 1 ? -1 : 2) * herdSide;
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
        release: ready + i * MAMMOTH.throwEvery + (bow ? SHOOT_RELEASE_MS : RELEASE_MS),
        hit: true,
        pulled: Infinity,
      }));
      trips.forEach((trip, i) => {
        const at = ready + i * MAMMOTH.throwEvery;
        if (bow) trip.stay(at, 'idle', graze).stay(at + SHOOT_MS, 'shoot', graze);
        else trip.stay(at, 'idle', graze).stay(at + THROW_MS, 'throw', graze);
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
        bow,
        steps: [],
        killed,
        bind,
        lift: Infinity,
        carry: Infinity,
        put: Infinity,
        laid: Infinity,
        // The carcass of a bone hut's hunt lies until its bones are taken out.
        gone: Math.max(
          herdGone,
          bind + MAMMOTH.butcher + MAMMOTH.remains + PREY_FADE_MS,
          forcedHunt(st, k)?.stop ?? 0,
        ),
        flights,
        legs: new Map(members.map((m, i) => [m.f.id, trips[i]!.legs] as const)),
      };
    }
    const hunter = new Itinerary(start, st.spot, camp).go(lane(grazeM - gapM));
    const aide = helper && new Itinerary(start, helper.spot, camp).go(lane(grazeM - gapM - 3));
    const ready = Math.max(hunter.t, aide?.t ?? 0, arrive + GRAZE_FIRST_MS);
    const flights: Flight[] = [];
    let killed: number;
    let alert = Infinity;
    const steps: Hunt['steps'] = [];
    if (shots.length) {
      // Bow: the hunter stays at his place and shoots again each time the animal has settled.
      const from = lane(grazeM - gapM);
      let go = ready;
      shots.forEach((shot, j) => {
        const aim = lane(grazeM + BOW_STEP_M * j);
        hunter.stay(go, 'idle', aim).stay(go + SHOOT_MS, 'shoot', aim);
        const release = go + SHOOT_RELEASE_MS;
        const fl: Flight = {
          from,
          to: shot === 'miss' ? offset(aim, MISS_BEYOND_M, MISS_SIDE_M) : aim,
          release,
          hit: shot !== 'miss',
          pulled: Infinity,
        };
        flights.push(fl);
        if (shot === 'kill') return;
        const dur = shot === 'miss' ? BOLT_MS : WOUND_MS;
        steps.push({
          at: release + FLIGHT_MS,
          dur,
          from: aim,
          to: lane(grazeM + BOW_STEP_M * (j + 1)),
          run: shot === 'miss',
        });
        if (shot === 'miss') alert = release + FLIGHT_MS;
        go = Math.max(hunter.t, release + FLIGHT_MS + dur + SETTLE_MS - SHOOT_RELEASE_MS);
      });
      killed = flights.at(-1)!.release + FLIGHT_MS;
    } else {
      hunter.stay(ready, 'idle', graze).stay(ready + THROW_MS, 'throw', graze);
      const first = {
        from: lane(grazeM - gapM),
        to: miss ? offset(graze, MISS_BEYOND_M, MISS_SIDE_M) : graze,
        release: ready + RELEASE_MS,
        hit: !miss,
        pulled: Infinity,
      };
      flights.push(first);
      killed = first.release + FLIGHT_MS;
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
    // Arrows that stayed in the ground or in a wounded animal go with the kill (pulled out as it is cut up).
    for (const f of flights) if (f.pulled === Infinity) f.pulled = hit.pulled;
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
      bow,
      steps,
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
    else if (h.steps.length && ms >= h.steps[0]!.at && ms < h.killed) {
      // A bow hunt's animal after an arrow that did not kill it: it runs from a miss, walks on
      // slowly from a hit, and stands looking back.
      const step = h.steps.findLast((x) => x.at <= ms)!;
      prey =
        ms < step.at + step.dur
          ? {
              ...base,
              ...lerp(step.from, step.to, t(step.at, step.at + step.dur)),
              ...towards(step.from.x, step.from.z, step.to.x, step.to.z),
              clip: step.run ? 'run' : 'walk',
              clipMs: ms - step.at,
              visibility,
            }
          : {
              ...base,
              ...step.to,
              ...inward,
              clip: 'idle',
              clipMs: ms - step.at - step.dur,
              visibility,
            };
    } else if (
      h.kind === 'animal-mammoth' &&
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
      const way = towards(fl.from.x, fl.from.z, fl.to.x, fl.to.z);
      if (h.bow) {
        // The archer's bow for the whole gesture, with the arrow on the string until it is loosed.
        const begin = fl.release - SHOOT_RELEASE_MS;
        if (ms >= begin && ms < begin + SHOOT_MS) {
          const aside = { x: -way.dirZ, z: way.dirX };
          const draw = smoothstep(t(begin + 0.35 * SHOOT_RELEASE_MS, fl.release));
          const grip = {
            x: fl.from.x + (way.dirX * BOW_AHEAD_M + aside.x * BOW_ASIDE_M) * 3,
            z: fl.from.z + (way.dirZ * BOW_AHEAD_M + aside.z * BOW_ASIDE_M) * 3,
          };
          scene.spears.push({
            id: `${h.id}:${n}:bow`,
            kind: 'bow',
            lat: h.lat,
            lon: h.lon,
            ...grip,
            ...way,
            height: BOW_H,
            slope: 0,
          });
          if (ms < fl.release) {
            const ahead = NOCK_DRAWN_M + (NOCK_REST_M - NOCK_DRAWN_M) * (1 - draw);
            scene.spears.push({
              id: `${h.id}:${n}:nock`,
              kind: 'arrow',
              lat: h.lat,
              lon: h.lon,
              x: fl.from.x + (way.dirX * ahead + aside.x * BOW_ASIDE_M) * 3,
              z: fl.from.z + (way.dirZ * ahead + aside.z * BOW_ASIDE_M) * 3,
              ...way,
              height: BOW_H,
              slope: 0,
            });
          }
        }
      }
      if (ms < fl.release || ms >= fl.pulled) return;
      const kind = h.bow ? ('arrow' as const) : undefined;
      // An arrow starts from the string, a bit ahead of the archer and at the bow's height.
      const aside = { x: -way.dirZ, z: way.dirX };
      const origin = h.bow
        ? {
            x: fl.from.x + (way.dirX * NOCK_DRAWN_M + aside.x * BOW_ASIDE_M) * 3,
            z: fl.from.z + (way.dirZ * NOCK_DRAWN_M + aside.z * BOW_ASIDE_M) * 3,
          }
        : fl.from;
      const startH = h.bow ? BOW_H : HAND_H;
      const dist = Math.sqrt((fl.to.x - origin.x) ** 2 + (fl.to.z - origin.z) ** 2);
      const id = `${h.id}:${n}`;
      // An arrow in an animal that walked on goes with it.
      const step = h.steps.find((x) => x.from === fl.to);
      const to = fl.hit && step ? lerp(step.from, step.to, t(step.at, step.at + step.dur)) : fl.to;
      if (ms < land) {
        // At the figures' scale: three layout metres to a life-size one.
        const life = dist / 3;
        const f = (ms - fl.release) / FLIGHT_MS;
        const end = fl.hit ? HIT_H : 0;
        const arc = SPEAR_ARC * life;
        const height = startH + (end - startH) * f + 4 * f * (1 - f) * arc;
        const climb = end - startH + 4 * arc * (1 - 2 * f);
        scene.spears.push({
          id,
          ...(kind ? { kind } : {}),
          lat: h.lat,
          lon: h.lon,
          ...lerp(origin, fl.to, f),
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
          ...(kind ? { kind } : {}),
          lat: h.lat,
          lon: h.lon,
          x: to.x - way.dirX * back,
          z: to.z - way.dirZ * back,
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
                (n === 0 ? u : n === c.legs.length - 1 ? 1 - u : 1),
          leg.water,
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
}
