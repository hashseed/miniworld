import { describe, expect, it } from 'vitest';
import { PLAYTHROUGH_MS, START_AGE, advance, clampAge, fractionOf, maToAge } from './age.ts';
import { formatAge, formatMa } from './format.ts';

describe('the age clock', () => {
  it('runs 1,000 Ma in one hour at regular speed', () => {
    expect(advance(START_AGE, PLAYTHROUGH_MS, 'regular')).toBe(0);
    expect(advance(START_AGE, PLAYTHROUGH_MS / 2, 'regular')).toBe(START_AGE / 2);
  });

  it('speeds up and slows down by the factor of the mode', () => {
    const regular = START_AGE - advance(START_AGE, 1000, 'regular');
    expect(START_AGE - advance(START_AGE, 1000, 'fast')).toBeCloseTo(10 * regular, -1);
    expect(START_AGE - advance(START_AGE, 10_000, 'snail')).toBeCloseTo(regular, -1);
  });

  it('never goes past today or before the start', () => {
    expect(advance(10, 1e9, 'fastest')).toBe(0);
    expect(clampAge(2e9)).toBe(START_AGE);
    expect(clampAge(-5)).toBe(0);
  });

  it('maps ages to the timeline and back', () => {
    expect(fractionOf(START_AGE)).toBe(0);
    expect(fractionOf(0)).toBe(1);
    expect(maToAge(538.8)).toBe(538_800_000);
  });
});

describe('writing ages', () => {
  it('writes Ma in English and Mio. Jahren in German', () => {
    expect(formatAge(620_000_000, 'en', 'Today')).toBe('620 Ma');
    expect(formatAge(620_000_000, 'de', 'Heute')).toBe('vor 620 Mio. Jahren');
    expect(formatAge(2_500_000, 'en', 'Today')).toBe('2.5 Ma');
    expect(formatAge(2_500_000, 'de', 'Heute')).toBe('vor 2,5 Mio. Jahren');
  });

  it('writes today and thousands of years', () => {
    expect(formatAge(0, 'en', 'Today')).toBe('Today');
    expect(formatAge(0, 'de', 'Heute')).toBe('Heute');
    expect(formatAge(12_000, 'en', 'Today')).toBe('12 ka');
    expect(formatAge(12_000, 'de', 'Heute')).toBe('vor 12.000 Jahren');
  });

  it('writes the ruler', () => {
    expect(formatMa(0, 'en')).toBe('0');
    expect(formatMa(1000, 'en')).toBe('1,000');
    expect(formatMa(1000, 'de')).toBe('1.000');
  });
});
