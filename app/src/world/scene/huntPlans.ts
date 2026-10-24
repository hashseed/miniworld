// How a hunt goes (spec humankind.md section 8.1): its plan of who throws or shoots where and
// when, and the animal, spears, arrows and pole it shows at a clock time.

import type { Stay, ForcedHunt } from './memo.ts';
import {
  type Hunt,
  BOW_FROM,
  MAMMOTH,
  PREY_GRAZE_M,
  PREY_FALL_M,
  THROW_GAP_M,
  MISS_SHARE,
  LARGE_GAME,
  BOW_STEP_M,
  ROAM_MS,
  PREY_FADE_MS,
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
  type PreyKind,
  MAMMOTH_UNTIL,
  OTHER_CAMP_M,
} from './hunt.ts';
import { outingPoint, towards, outingRoom, MAX_OUTING_M, TURN_MS } from './camp.ts';
import { type Pt, deg, smoothstep, lookOf, LAYOUT_KM_PER_M } from './units.ts';
import { hash01, hash32 } from '../../core/hash.ts';
import { Itinerary } from './routes.ts';
import type { PreyPose } from './types.ts';
import { stageHunts, stageSessions } from './stages.ts';
import { type TreeStage, NEVER } from '../tree.ts';
import { huntsOf as preyOf } from '../cultures.ts';
import { detCos, RAD } from '../../core/detmath.ts';
import { msAtDay } from '../../time/rate.ts';
import type { SceneCx } from './context.ts';

export function huntPlan(
  cx: Pick<SceneCx, 'at' | 'forcedHunt' | 'preyKindOf' | 'turnStartOf'>,
  st: Stay,
  k: number,
  party: Stay[],
  small = false,
): Hunt {
  const { at, forcedHunt, preyKindOf, turnStartOf } = cx;
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
  const herdGone = Math.max(0, ...herd.map((c) => scatterAt(c, landed) + c.linger + PREY_FADE_MS));
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
    legs: new Map([[st.f.id, hunter.legs], ...(aide ? [[helper!.f.id, aide.legs] as const] : [])]),
  };
}

/** The hunted animal, the spears away from the hand and the pole of a hunt at a clock time. */
export function huntProps(cx: Pick<SceneCx, 'scene'>, h: Hunt, ms: number): void {
  const { scene } = cx;
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
 * The hunt a figure leads in its `k`-th turn, if it hunts then and it fits (section 8.1):
 * with a helper from its camp when one is free, else alone. The same for every clock time.
 */
export function huntOf(
  cx: Pick<
    SceneCx,
    | 'helpedBefore'
    | 'huntPlan'
    | 'hunts'
    | 'huntsDuring'
    | 'mates'
    | 'nearOtherCamp'
    | 'preyKindOf'
    | 'sameCamp'
    | 'soloTurn'
    | 'stayAt'
    | 'turnStartOf'
  >,
  st: Stay,
  k: number,
): Hunt | undefined {
  const {
    helpedBefore,
    huntPlan,
    hunts,
    huntsDuring,
    mates,
    nearOtherCamp,
    preyKindOf,
    sameCamp,
    soloTurn,
    stayAt,
    turnStartOf,
  } = cx;
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

/** The hunts in which a figure takes part, as hunter or helper, that overlap a span. */
export function huntsOf(
  cx: Pick<SceneCx, 'huntOf' | 'mates' | 'sameCamp' | 'stayAt' | 'turnOf' | 'turnStartOf'>,
  st: Stay,
  from: number,
  to: number,
): Hunt[] {
  const { huntOf, mates, sameCamp, stayAt, turnOf, turnStartOf } = cx;
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

/** The kill of a hunt lying at a figure's camp at a clock time, if any (section 8.1). */
export function killAt(
  cx: Pick<SceneCx, 'huntOf' | 'mates' | 'sameCamp' | 'stayAt' | 'turnOf' | 'turnStartOf'>,
  st: Stay,
  t: number,
): Hunt | undefined {
  const { huntOf, mates, sameCamp, stayAt, turnOf, turnStartOf } = cx;
  // The one laid down first, whose meat goes on the spit first.
  let first: Hunt | undefined;
  for (const g of mates(st.home.camp)) {
    if (lookOf(g.id) === 'child') continue;
    for (let k = turnOf(g.id, t) - 3; k <= turnOf(g.id, t); k++) {
      const gs = stayAt(g, turnStartOf(g.id, k));
      if (!gs || !sameCamp(gs, st)) continue;
      const h = huntOf(gs, k);
      if (h && h.pole && h.laid <= t && t < h.gone - PREY_FADE_MS)
        if (!first || h.laid < first.laid || (h.laid === first.laid && h.id < first.id)) first = h;
    }
  }
  return first;
}

/**
 * The mammoth hunt a bone hut's camp holds in its hunt windows (humankind.md section 8.2):
 * led by the first grown-up of the camp who is free for the window, in their turn that
 * starts in it. Undefined for any other turn.
 */
export function forcedHunt(
  cx: Pick<SceneCx, 'chunk' | 'forcedRound' | 'startDay' | 'turnStartOf'>,
  st: Stay,
  k: number,
): ForcedHunt | undefined {
  const { chunk, forcedRound, startDay, turnStartOf } = cx;
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
export function huntHeld(
  cx: Pick<SceneCx, 'chunk' | 'forcedRound' | 'startDay'>,
  st: Stay,
  turnStart: number,
): boolean {
  const { chunk, forcedRound, startDay } = cx;
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
export function forcedRound(
  cx: Pick<SceneCx, 'forced' | 'mates' | 'startDay' | 'stayAt'>,
  stage: TreeStage,
  round: number,
): ForcedHunt | undefined {
  const { forced, mates, startDay, stayAt } = cx;
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

/**
 * A hunt from start to end (section 8.1): both walk out, the hunter throws, perhaps
 * misses, picks the spear up and throws again; then they bind the kill to the pole and
 * carry it back, or a hunter alone butchers it and carries the meat.
 */
/** What a hunt goes after, by hash; a mammoth only where and when it can be (MAMMOTH). */
export function preyKindOf(
  cx: Pick<SceneCx, 'at' | 'forcedHunt' | 'turnStartOf'>,
  st: Stay,
  k: number,
  small = false,
): PreyKind {
  const { at, forcedHunt, turnStartOf } = cx;
  const kinds = preyOf(st.home.culture) as readonly PreyKind[];
  const kind = forcedHunt(st, k) ? 'animal-mammoth' : kinds[hash32(st.f.id, k, 79) % kinds.length]!;
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

/** Whether a point of a figure's camp lies near another camp standing at a clock time. */
export function nearOtherCamp(
  cx: Pick<SceneCx, 'lodgings' | 'startDay'>,
  st: Stay,
  p: Pt,
  t: number,
): boolean {
  const { lodgings, startDay } = cx;
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
export function huntsDuring(
  cx: Pick<SceneCx, 'soloTurn' | 'turnOf' | 'turnStartOf'>,
  st: Stay,
  from: number,
  to: number,
): boolean {
  const { soloTurn, turnOf, turnStartOf } = cx;
  for (let k = turnOf(st.f.id, from) - 1; k <= turnOf(st.f.id, to); k++) {
    if (soloTurn(st, k, true).go !== 'hunt') continue;
    const start = turnStartOf(st.f.id, k);
    if (start < to && start + TURN_MS > from) return true;
  }
  return false;
}

/** Whether a hunter of the camp with a lower id than `hunter` already has `helper` in a span. */
export function helpedBefore(
  cx: Pick<SceneCx, 'huntOf' | 'mates' | 'sameCamp' | 'stayAt' | 'turnOf' | 'turnStartOf'>,
  hunter: Stay,
  helper: Stay,
  from: number,
  to: number,
): boolean {
  const { huntOf, mates, sameCamp, stayAt, turnOf, turnStartOf } = cx;
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
