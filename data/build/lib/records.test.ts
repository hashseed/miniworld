import { describe, expect, it } from 'vitest';
import { astronomicalYear, dayFromDate, dayOfYearStart } from '../../../app/src/time/calendar.ts';
import { parseDate } from './records.ts';

const START = dayOfYearStart(astronomicalYear(70000, 'BCE'));
const CUTOFF = dayFromDate(1991, 12, 26);
const parse = (s: string) => parseDate(s, START, CUTOFF);

describe('written dates (content-format section 3)', () => {
  it('reads years, BCE years and approximate years', () => {
    expect(parse('1492')).toEqual({
      first: dayFromDate(1492, 1, 1),
      end: dayFromDate(1493, 1, 1),
      approximate: false,
      precision: 'year',
    });
    expect(parse('c. 2560 BCE')).toMatchObject({
      first: dayOfYearStart(astronomicalYear(2560, 'BCE')),
      approximate: true,
      precision: 'year',
    });
    expect(parse('12,000 BCE')?.first).toBe(dayOfYearStart(astronomicalYear(12000, 'BCE')));
  });

  it('reads a month as the whole month and a day as that day', () => {
    expect(parse('1342-07')).toEqual({
      first: dayFromDate(1342, 7, 1),
      end: dayFromDate(1342, 8, 1),
      approximate: false,
      precision: 'month',
    });
    expect(parse('1342-12')?.end).toBe(dayFromDate(1343, 1, 1));
    expect(parse('1789-07-14')).toEqual({
      first: dayFromDate(1789, 7, 14),
      end: dayFromDate(1789, 7, 15),
      approximate: false,
      precision: 'day',
    });
    expect(parse('79-10-24')?.first).toBe(dayFromDate(79, 10, 24));
    expect(parse('c. 1600-02')?.approximate).toBe(true);
  });

  it('rejects months and days that do not exist', () => {
    for (const s of ['1342-13', '1342-00', '1789-02-30', '1900-02-29', '0-01', '1789-7-14'])
      expect(parse(s)).toBeUndefined();
    expect(parse('2000-02-29')?.precision).toBe('day');
  });

  it('reads the timeline start and the cutoff', () => {
    expect(parse('start')).toEqual({
      first: START,
      end: START,
      approximate: false,
      precision: 'boundary',
    });
    expect(parse('today')).toEqual({
      first: CUTOFF,
      end: CUTOFF + 1,
      approximate: false,
      precision: 'boundary',
    });
    expect(parse('yesterday')).toBeUndefined();
  });
});
