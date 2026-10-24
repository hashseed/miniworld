// The work cycle of a village's fields (spec neolithic/fields-and-crops.md section 2): a field changes
// only when someone works it. The village gives out one job per slot of the life clock, field after
// field in turn, so every field's stage is arithmetic on the clock: no calendar, no counting of turns.

import { hash32 } from '../core/hash.ts';

/** What a worker does to a field in a job. */
export type FieldJob = 'till' | 'sow' | 'weed' | 'reap';

/** The jobs of one crop cycle, in order; the state after job i is state i + 1 (state 0 is the stubble after the reaping). */
export const CYCLE: readonly FieldJob[] = ['till', 'sow', 'weed', 'weed', 'weed', 'reap'];
/** The crop's stage in each state: stubble, tilled earth, seed, sprouts, green, ripe. */
export const STATE_STAGE: readonly number[] = [1, 0, 0.1, 0.35, 0.55, 0.75];

/** A job is given out every JOB_MS of the village's clock, and the field shows its result CHANGE_MS later. */
export const JOB_MS = 30_000;
export const CHANGE_MS = 26_000;
/** The stage eases to its new value over this long (never from the stubble to the tilled earth, which is a cut). */
export const EASE_MS = 4_000;

/** The slot of a clock time, and the clock time a slot starts at. */
export const slotOf = (ms: number): number => Math.floor(ms / JOB_MS);

export interface FieldClock {
  /** How many fields the village has. */
  fields: number;
  /** The village's hash, which sets where in the cycle each field starts and which field is first. */
  seed: number;
}

/** The field a slot's job goes to: the fields in turn. */
export function fieldOfSlot(c: FieldClock, slot: number): number {
  return (((slot + (c.seed % c.fields)) % c.fields) + c.fields) % c.fields;
}

/** The job a field is given in a slot: whatever follows the state it is in then. */
export function jobAt(c: FieldClock, field: number, ms: number): FieldJob {
  return CYCLE[stateAt(c, field, ms)]!;
}

/** The state of a field, 0 to 5: its own start in the cycle plus the jobs it has been given and shows. */
export function stateAt(c: FieldClock, field: number, ms: number): number {
  const done = slotOf(ms - CHANGE_MS); // the last slot whose result shows
  if (done < 0) return startState(c, field);
  const first = (((field - (c.seed % c.fields)) % c.fields) + c.fields) % c.fields;
  const jobs = done >= first ? Math.floor((done - first) / c.fields) + 1 : 0;
  return (startState(c, field) + jobs) % CYCLE.length;
}

const startState = (c: FieldClock, field: number): number =>
  hash32(c.seed, field, 271) % CYCLE.length;

/** The drawn stage of a field at a clock time, 0 to 1. */
export function fieldStage(c: FieldClock, field: number, ms: number): number {
  const state = stateAt(c, field, ms);
  const now = STATE_STAGE[state]!;
  if (state === 1) return now;
  const since = ms - (slotOfLastJob(c, field, ms) * JOB_MS + CHANGE_MS);
  if (since >= EASE_MS || since < 0) return now;
  const before = STATE_STAGE[(state + CYCLE.length - 1) % CYCLE.length]!;
  return before + ((now - before) * since) / EASE_MS;
}

/** The slot of the last job a field has shown by a clock time, or -Infinity before its first. */
function slotOfLastJob(c: FieldClock, field: number, ms: number): number {
  const done = slotOf(ms - CHANGE_MS);
  const first = (((field - (c.seed % c.fields)) % c.fields) + c.fields) % c.fields;
  if (done < first) return -Infinity;
  return done - ((done - first) % c.fields);
}
