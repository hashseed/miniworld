import { describe, expect, it } from 'vitest';
import {
  CHANGE_MS,
  CYCLE,
  EASE_MS,
  JOB_MS,
  STATE_STAGE,
  fieldOfSlot,
  fieldStage,
  jobAt,
  stateAt,
  type FieldClock,
} from './fieldWork.ts';

const clock: FieldClock = { fields: 4, seed: 12345 };

describe('field work cycle', () => {
  it('gives each slot to one field, the fields in turn', () => {
    const seen = [0, 1, 2, 3].map((s) => fieldOfSlot(clock, s));
    expect(new Set(seen).size).toBe(4);
    expect(fieldOfSlot(clock, 9)).toBe(fieldOfSlot(clock, 5));
  });

  it('changes a field only after a job of its own, and by one state', () => {
    for (let f = 0; f < 4; f++) {
      let last = stateAt(clock, f, 0);
      let changes = 0;
      for (let t = 0; t < 40 * JOB_MS; t += 1000) {
        const s = stateAt(clock, f, t);
        if (s !== last) {
          expect(s).toBe((last + 1) % CYCLE.length);
          changes++;
          last = s;
        }
      }
      // one job in every four slots
      expect(changes).toBeGreaterThanOrEqual(9);
      expect(changes).toBeLessThanOrEqual(10);
    }
  });

  it('shows the result of a job only after the worker has finished it', () => {
    const slot = 8;
    const f = fieldOfSlot(clock, slot);
    const before = stateAt(clock, f, slot * JOB_MS + CHANGE_MS - 1);
    expect(stateAt(clock, f, slot * JOB_MS + CHANGE_MS)).toBe((before + 1) % CYCLE.length);
  });

  it('names the job that follows the state, and a reaping ends in stubble', () => {
    for (let f = 0; f < 4; f++)
      for (let t = 0; t < 30 * JOB_MS; t += 3000) {
        const s = stateAt(clock, f, t);
        expect(jobAt(clock, f, t)).toBe(CYCLE[s]);
        if (CYCLE[s] === 'reap') expect(STATE_STAGE[s]).toBe(0.75);
      }
  });

  it('eases the stage over a few seconds and holds it still otherwise', () => {
    const slot = 8;
    const f = fieldOfSlot(clock, slot);
    const t0 = slot * JOB_MS + CHANGE_MS;
    const calm = fieldStage(clock, f, t0 + EASE_MS + 1);
    expect(fieldStage(clock, f, t0 + EASE_MS + JOB_MS)).toBe(calm);
    for (let t = t0 + EASE_MS + 1; t < t0 + 3 * JOB_MS; t += 500)
      expect(fieldStage(clock, f, t)).toBe(calm);
  });
});
