// Life in a Neolithic village (spec humankind.md section 8.5): the fields' jobs and who does
// them, and what the village shows at a clock time.

import { dayAtMs } from '../../time/rate.ts';
import { fieldToolOf } from '../farmingOnset.ts';
import type { FigurePose } from './types.ts';
import type { TreeLodging } from '../tree.ts';
import { type Village, FIELD_TREE_MARGIN_M, isProfile, type Stay, MILKED } from './memo.ts';
import { deg, LAYOUT_KM_PER_M, type Pt } from './units.ts';
import { fieldStage, jobAt, jobFrom, jobStart, UNPLOUGHED } from '../fieldWork.ts';
import {
  PEN_SCALE,
  HERD_LOOK_MS,
  HERD_SCALE,
  TURN_MS,
  FARM_WORK_SHARE,
  JOB_OUTING,
} from './camp.ts';
import type { PreyKind } from './hunt.ts';
import { detCos, detSin } from '../../core/detmath.ts';
import { roleOf } from '../roles.ts';
import { hash32, hash01 } from '../../core/hash.ts';
import { type Field, pointInPolygon } from '../fieldShapes.ts';
import type { Outing } from './outings.ts';
import type { SceneCx } from './context.ts';

export function villageScene(
  cx: Pick<SceneCx, 'fieldClockOf' | 'scene'>,
  l: TreeLodging,
  v: Village,
  now: number,
) {
  const { fieldClockOf, scene } = cx;
  const [lat, lon] = [deg(l.lat), deg(l.lon)];
  const clock = fieldClockOf(l.camp, v);
  // A field is there from its first ploughing (fields-and-crops.md section 2).
  for (const field of v.fields) {
    const stage = fieldStage(clock, field.id, now);
    if (stage !== UNPLOUGHED)
      scene.fields.push({ id: `${l.camp}:${field.id}`, lat, lon, field, stage });
  }
  // The trees keep off the fields' ground from the village's founding, as they keep off the camp.
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
  // No tree stands in the pen (neolithic/villages.md section 6).
  scene.clearings.push({
    lat,
    lon,
    x: pen.x,
    z: pen.z,
    km: PEN_TREE_CLEAR_M * LAYOUT_KM_PER_M,
    amount: 1,
    felling: false,
  });
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
}

/**
 * Who does a field's job given at clock time `t`: one of the camp's grown-up farmers and reapers
 * who are at home then, by hash; any grown-up at home where there is none.
 */
export function jobWorker(
  cx: Pick<SceneCx, 'mates' | 'memo' | 'stayAt'>,
  camp: number,
  field: number,
  t: number,
): number | undefined {
  const { mates, memo, stayAt } = cx;
  const key = `${camp}:${field}:${t}`;
  if (memo.workers.has(key)) return memo.workers.get(key);
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
  const worker = pool.length ? pool[hash32(camp, field, t, 263) % pool.length] : undefined;
  memo.workers.set(key, worker);
  return worker;
}

/** The field a figure is given to work in its `k`-th turn, if its turn starts in a slot whose job is its own. */
export function assignedField(
  cx: Pick<SceneCx, 'fieldClockOf' | 'jobWorker' | 'turnStartOf' | 'villageOf'>,
  st: Stay,
  k: number,
): number | undefined {
  const { fieldClockOf, jobWorker, turnStartOf, villageOf } = cx;
  const turnStart = turnStartOf(st.f.id, k);
  const v = villageOf(st.home.camp);
  if (!v?.fields.length) return undefined;
  const clock = fieldClockOf(st.home.camp, v);
  // The first field whose job is given during the turn and falls to this figure.
  for (const field of v.fields) {
    const t = jobStart(clock, field.id, jobFrom(clock, field.id, turnStart));
    if (
      t < turnStart + TURN_MS &&
      t >= clock.from &&
      jobWorker(st.home.camp, field.id, t) === st.f.id
    )
      return field.id;
  }
  return undefined;
}

/** The field a figure works in its `k`-th turn, and where in it. */
export function fieldSpot(
  cx: Pick<SceneCx, 'assignedField' | 'villageOf'>,
  st: Stay,
  k: number,
): { field: Field; at: Pt; face: Pt } | undefined {
  const { assignedField, villageOf } = cx;
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
export function farmOuting(
  cx: Pick<SceneCx, 'assignedField' | 'fieldClockOf' | 'fieldSpot' | 'villageOf'>,
  st: Stay,
  k: number,
  turnStart: number,
): Outing | undefined {
  const { assignedField, fieldClockOf, fieldSpot, villageOf } = cx;
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

/** The trees keep this far from a pen's middle (layout metres): its fence is about 6 out, and a crown is wide. */
const PEN_TREE_CLEAR_M = 11;

/** A ploughing team (neolithic/villages.md section 7), in layout metres in front of the ploughman. */
const ARD_AHEAD_M = 2.4;
const OX_AHEAD_M = 7.5;
const OX_SIDE_M = 1.4;
const YOKE_AHEAD_M = 9;

/**
 * Oxen at the ard (neolithic/villages.md section 7): a villager tilling where the profile's field
 * tool is the ard on the day and the herd has cattle walks behind the ard, empty-handed, two of
 * the village's cattle yoked in front, drawn at the herd's scale.
 */
export function ploughTeam(
  cx: Pick<SceneCx, 'scene' | 'startDay' | 'villageOf'>,
  pose: FigurePose,
  camp: number,
  culture: string,
  ms: number,
): void {
  const { scene, startDay, villageOf } = cx;
  if (!isProfile(culture) || fieldToolOf(culture, dayAtMs(ms, startDay)) !== 'ard') return;
  if (!villageOf(camp)?.herd?.animals.some((a) => a.kind === 'animal-cattle')) return;
  const { dirX: fx, dirZ: fz } = pose;
  const at = (ahead: number, side: number) => ({
    x: pose.x + fx * ahead - fz * side,
    z: pose.z + fz * ahead + fx * side,
  });
  pose.unarmed = true;
  for (const side of [-OX_SIDE_M, OX_SIDE_M])
    scene.prey.push({
      id: `ox:${pose.id}:${side < 0 ? 0 : 1}`,
      kind: 'animal-cattle' as PreyKind,
      lat: pose.lat,
      lon: pose.lon,
      ...at(OX_AHEAD_M, side),
      dirX: fx,
      dirZ: fz,
      clip: 'idle',
      clipMs: ms,
      visibility: 1,
      scale: HERD_SCALE,
    });
  for (const [kind, ahead] of [
    ['prop-ard', ARD_AHEAD_M],
    ['prop-yoke', YOKE_AHEAD_M],
  ] as const)
    scene.props.push({
      id: `${kind}:${pose.id}`,
      kind,
      lat: pose.lat,
      lon: pose.lon,
      ...at(ahead, 0),
      dirX: fx,
      dirZ: fz,
      scale: HERD_SCALE,
    });
}
