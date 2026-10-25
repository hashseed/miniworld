// A figure's turns (spec humankind.md section 8.1): what it goes off to do in each turn of
// its day, alone or with others.

import { type Stay, isProfile, MILKED } from './memo.ts';
import { type Outing, outingOf } from './outings.ts';
import { Itinerary } from './routes.ts';
import {
  outingRoom,
  FIREWOOD_M,
  rackOnLand,
  outingPoint,
  BREAK_MS,
  MAX_OUTING_M,
  gapDirection,
  isCompact,
  FISH_WATCH_MS,
  FISH_STAB_MS,
  FILL_MS,
  rackSpot,
  RACK_R,
  SCRAPE_BACK_M,
  SCRAPE_SIDE_M,
  SCRAPE_MS,
  rackSides,
  doorOf,
  TAKE_HIDE_MS,
  lodgingSpot,
  INSIDE_MS,
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
  lightSpot,
  BUTCHER_MEAT_MS,
  ROAST_MS,
  TURN_MS,
} from './camp.ts';
import { PREY_REACH_M, GATHER_M, GATHER_MS, LOOK_MS, PREY_FADE_MS } from './hunt.ts';
import type { Pt } from './units.ts';
import { hash32 } from '../../core/hash.ts';
import type { SceneCx } from './context.ts';

/** A reaper carrying a sheaf goes back along its way out to this far from the hearth (layout metres), inside the ring. */
const SHEAF_BACK_M = 10;

/**
 * What a figure goes out to do in its `k`-th turn on its own, as far as its gap has land
 * (section 8.1): a gathering or a stroll with its legs, a hunt (planned as a camp event
 * by huntOf), or nothing.
 */
export function soloTurn(
  cx: Pick<
    SceneCx,
    | 'farmOuting'
    | 'fieldSpot'
    | 'forcedHunt'
    | 'huntHeld'
    | 'huntOf'
    | 'killAt'
    | 'turnStartOf'
    | 'villageOf'
  >,
  st: Stay,
  k: number,
  plain = false,
): { go: Outing; trip?: Itinerary } {
  const { farmOuting, fieldSpot, forcedHunt, huntHeld, huntOf, killAt, turnStartOf, villageOf } =
    cx;
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
      // Back the way it came, the land its field was laid out by (fieldMask maskReach), to
      // inside the ring, and only then across to the floor: never straight over a bay.
      const r = Math.sqrt(w.at.x ** 2 + w.at.z ** 2);
      const back = { x: (w.at.x * SHEAF_BACK_M) / r, z: (w.at.z * SHEAF_BACK_M) / r };
      trip
        .go(back, 'carry')
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
