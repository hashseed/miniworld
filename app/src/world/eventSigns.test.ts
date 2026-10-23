import { describe, expect, it } from 'vitest';
import { msAtDay } from '../time/rate.ts';
import { TIMELINE_START } from '../time/calendar.ts';
import { signsAt, SIGN_LEAD_MS, SIGN_RISE_MS, SIGN_SIZE, SIGN_STAY_MS } from './eventSigns.ts';

const event = { id: 'arrival-x', day: -21_000_000, lat: 10, lon: 20 };
const t = msAtDay(event.day, TIMELINE_START);

describe('signsAt (humankind.md section 8.4)', () => {
  it('puts the sign up 5 seconds before the event and takes it down 20 seconds after', () => {
    expect(signsAt([event], t - SIGN_LEAD_MS - 1, TIMELINE_START)).toEqual([]);
    expect(signsAt([event], t - SIGN_LEAD_MS + 10, TIMELINE_START)).toHaveLength(1);
    expect(signsAt([event], t + SIGN_STAY_MS - 1, TIMELINE_START)).toHaveLength(1);
    expect(signsAt([event], t + SIGN_STAY_MS + SIGN_RISE_MS, TIMELINE_START)).toEqual([]);
  });

  it('stands for exactly 5 and 20 seconds', () => {
    expect(SIGN_LEAD_MS).toBe(5_000);
    expect(SIGN_STAY_MS).toBe(20_000);
  });

  it('rises out of the ground and stands full size at the event', () => {
    const early = signsAt([event], t - SIGN_LEAD_MS + 100, TIMELINE_START)[0]!;
    const up = signsAt([event], t, TIMELINE_START)[0]!;
    expect(early.scale!).toBeLessThan(0.1);
    expect(up.scale).toBe(SIGN_SIZE);
    expect(up.id).toBe('sign:arrival-x');
    expect(up.kind).toBe('prop-sign-wood');
  });
});
