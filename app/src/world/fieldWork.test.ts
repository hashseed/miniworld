import { describe, expect, it } from 'vitest';
import {
  CHANGE_MS,
  CYCLE,
  EASE_MS,
  JOB_MS,
  STATE_STAGE,
  fieldOffset,
  fieldStage,
  jobAt,
  jobStart,
  stateAt,
  UNPLOUGHED,
  type FieldClock,
} from './fieldWork.ts';

const clock: FieldClock = { fields: 4, seed: 12345, from: 7 * JOB_MS + 1234 };
/** The state after the next job: ploughing first, then round the cycle. */
const next = (s: number) => (s === UNPLOUGHED ? 1 : (s + 1) % CYCLE.length);

describe('field work cycle', () => {
  it('staggers the fields evenly over each job period', () => {
    const offsets = [0, 1, 2, 3].map((f) => fieldOffset(clock, f)).sort((a, b) => a - b);
    expect(offsets).toEqual([0, JOB_MS / 4, JOB_MS / 2, (3 * JOB_MS) / 4]);
  });

  it('has every field unploughed, not there, until its first job ploughs it', () => {
    for (let f = 0; f < 4; f++) {
      expect(stateAt(clock, f, clock.from)).toBe(UNPLOUGHED);
      expect(fieldStage(clock, f, clock.from)).toBe(UNPLOUGHED);
      expect(jobAt(clock, f, clock.from)).toBe('till');
      let first = Infinity;
      for (let t = clock.from - 3 * JOB_MS; t < clock.from + 3 * JOB_MS; t += 250)
        if (stateAt(clock, f, t) !== UNPLOUGHED) {
          first = t;
          break;
        }
      // Ploughed by its first job after the founding, within one job period and the work.
      expect(first).toBeGreaterThanOrEqual(clock.from + CHANGE_MS);
      expect(first).toBeLessThan(clock.from + JOB_MS + CHANGE_MS);
      expect(stateAt(clock, f, first)).toBe(1);
    }
  });

  it('changes a field once per job, by one state, a full cycle in six jobs', () => {
    for (let f = 0; f < 4; f++) {
      let last = stateAt(clock, f, clock.from);
      let changes = 0;
      const end = clock.from + 12 * JOB_MS;
      for (let t = clock.from; t < end; t += 250) {
        const s = stateAt(clock, f, t);
        if (s !== last) {
          expect(s).toBe(next(last));
          changes++;
          last = s;
        }
      }
      expect(changes).toBeGreaterThanOrEqual(11);
      expect(changes).toBeLessThanOrEqual(12);
    }
  });

  it('shows the result of a job only after the worker has finished it', () => {
    const f = 2;
    const t = jobStart(clock, f, 20);
    const before = stateAt(clock, f, t + CHANGE_MS - 1);
    expect(stateAt(clock, f, t + CHANGE_MS)).toBe(next(before));
  });

  it('names the job that follows the state, and a reaping ends in stubble', () => {
    for (let f = 0; f < 4; f++)
      for (let t = clock.from; t < clock.from + 15 * JOB_MS; t += 3000) {
        const s = stateAt(clock, f, t);
        expect(jobAt(clock, f, t)).toBe(CYCLE[Math.max(0, s)]);
        if (CYCLE[s] === 'reap') expect(STATE_STAGE[s]).toBe(0.75);
      }
  });

  it('eases the stage over a few seconds and holds it still otherwise', () => {
    const f = 1;
    const t0 = jobStart(clock, f, 22) + CHANGE_MS;
    const calm = fieldStage(clock, f, t0 + EASE_MS + 1);
    for (let t = t0 + EASE_MS + 1; t < t0 + JOB_MS; t += 500)
      expect(fieldStage(clock, f, t)).toBe(calm);
  });
});
