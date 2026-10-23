import { describe, expect, it } from 'vitest';
import { CALENDARS, cropStage, sowDay } from './cropCalendar.ts';

describe('cropStage', () => {
  it.each(Object.keys(CALENDARS))('%s goes through the stages in order, in 0..1', (crop) => {
    const cal = CALENDARS[crop]!;
    const sow = sowDay(crop, 40);
    const at = (d: number) => cropStage(crop, sow + d, 40);
    expect(at(0)).toBe(0);
    expect(at(cal.emerge)).toBeCloseTo(0.25);
    expect(at(cal.green)).toBeCloseTo(0.5);
    expect(at(cal.ripe)).toBeCloseTo(0.75);
    expect(at(cal.harvest - 1)).toBeCloseTo(0.75);
    expect(at(cal.harvest)).toBe(1);
    expect(at(cal.plough)).toBe(0);
    let last = 0;
    for (let d = 0; d < cal.harvest; d++) {
      const s = at(d);
      expect(s).toBeGreaterThanOrEqual(last);
      expect(s).toBeLessThanOrEqual(1);
      last = s;
    }
  });

  it('is periodic and the same on every call', () => {
    for (let d = 0; d < 365; d += 7) {
      expect(cropStage('barley', d, 35)).toBe(cropStage('barley', d + 365, 35));
      expect(cropStage('barley', d, 35)).toBe(cropStage('barley', d, 35));
    }
  });

  it('runs half a year later in the southern hemisphere', () => {
    for (const crop of ['barley', 'maize', 'potato'])
      for (let d = 0; d < 365; d += 13)
        expect(cropStage(crop, d + 182, -20)).toBe(cropStage(crop, d, 20));
  });

  it('harvests winter cereals in the Near East in early summer', () => {
    expect(cropStage('barley', 100, 33)).toBeGreaterThan(0.4); // 10 April: green
    expect(cropStage('barley', 130, 33)).toBeGreaterThan(0.7); // 10 May: nearly ripe
    expect(cropStage('barley', 145, 33)).toBe(0.75); // 25 May: ripe
    expect(cropStage('barley', 170, 33)).toBe(1); // 19 June: stubble
    expect(cropStage('barley', 280, 33)).toBe(0); // October: bare
  });

  it('sows rice with the rains, and spring crops later towards the poles', () => {
    expect(sowDay('rice', 10)).toBe(152);
    expect(sowDay('rice', -10)).toBe(319);
    expect(sowDay('maize', 55)).toBeGreaterThan(sowDay('maize', 30));
    expect(sowDay('barley', 55)).toBeLessThan(sowDay('barley', 30));
  });

  it('delays a field by its offset', () => {
    expect(cropStage('flax', sowDay('flax', 40) + 20, 40, 5)).toBeCloseTo(
      cropStage('flax', sowDay('flax', 40) + 15, 40),
    );
  });
});
