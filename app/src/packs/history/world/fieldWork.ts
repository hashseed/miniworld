// The work cycle of a village's fields (spec neolithic/fields-and-crops.md section 2): a field changes
// only when someone works it. From the day the village is founded each field is given a job every
// JOB_MS of the life clock, the fields staggered, so every field's stage is arithmetic on the clock:
// no calendar, no counting of turns. A field does not exist until its first ploughing.

/** What a worker does to a field in a job. */
export type FieldJob = 'till' | 'sow' | 'weed' | 'reap';

/** The jobs of one crop cycle, in order; the state after job i is state i + 1 (state 0 is the stubble after the reaping). */
export const CYCLE: readonly FieldJob[] = ['till', 'sow', 'weed', 'weed', 'weed', 'reap'];
/** The crop's stage in each state: stubble, tilled earth, seed, sprouts, green, ripe. */
export const STATE_STAGE: readonly number[] = [1, 0, 0.1, 0.35, 0.55, 0.75];

/**
 * Every field is given a job every JOB_MS of the village's clock, the fields staggered evenly over
 * it, and shows the job's result CHANGE_MS after it is given, when its worker is done.
 */
export const JOB_MS = 20_000;
export const CHANGE_MS = 17_000;
/** The stage eases to its new value over this long (never from the stubble to the tilled earth, which is a cut). */
export const EASE_MS = 3_000;

export interface FieldClock {
  /** How many fields the village has. */
  fields: number;
  /** The village's hash, which sets which field is worked first. */
  seed: number;
  /** When the village was founded, on the clock: its fields are ploughed in turn from then on. */
  from: number;
}

/** A field before its first ploughing: not there yet. */
export const UNPLOUGHED = -1;

/** How far into each JOB_MS a field's jobs are given: the fields evenly staggered. */
export function fieldOffset(c: FieldClock, field: number): number {
  const turn = (((field + c.seed) % c.fields) + c.fields) % c.fields;
  return Math.floor((turn * JOB_MS) / c.fields);
}

/** The clock time a field's `k`-th job is given. */
export const jobStart = (c: FieldClock, field: number, k: number): number =>
  k * JOB_MS + fieldOffset(c, field);

/** The first job a field is given that starts after its time: `k` with jobStart(k) >= ms. */
export const jobFrom = (c: FieldClock, field: number, ms: number): number =>
  Math.ceil((ms - fieldOffset(c, field)) / JOB_MS);

/** The job a field is given in a slot: whatever follows the state it is in then (ploughing first). */
export function jobAt(c: FieldClock, field: number, ms: number): FieldJob {
  return CYCLE[Math.max(0, stateAt(c, field, ms))]!;
}

/** How many jobs a field has been given since the village's founding and shows by a clock time. */
function jobsDone(c: FieldClock, field: number, ms: number): number {
  const first = jobFrom(c, field, c.from);
  const last = Math.floor((ms - CHANGE_MS - fieldOffset(c, field)) / JOB_MS);
  return Math.max(0, last - first + 1);
}

/**
 * The state of a field, 0 to 5, from the jobs done since the village was founded: every field
 * starts unploughed (UNPLOUGHED, not there), its first job ploughs it, and then the cycle runs.
 */
export function stateAt(c: FieldClock, field: number, ms: number): number {
  const jobs = jobsDone(c, field, ms);
  return jobs === 0 ? UNPLOUGHED : jobs % CYCLE.length;
}

/** The drawn stage of a field at a clock time, 0 to 1; UNPLOUGHED before its first ploughing. */
export function fieldStage(c: FieldClock, field: number, ms: number): number {
  const state = stateAt(c, field, ms);
  if (state === UNPLOUGHED) return UNPLOUGHED;
  const now = STATE_STAGE[state]!;
  if (state === 1) return now;
  const jobs = jobsDone(c, field, ms);
  const shown = jobStart(c, field, jobFrom(c, field, c.from) + jobs - 1) + CHANGE_MS;
  const since = ms - shown;
  if (since >= EASE_MS || since < 0) return now;
  const before = STATE_STAGE[(state + CYCLE.length - 1) % CYCLE.length]!;
  return before + ((now - before) * since) / EASE_MS;
}
