import { describe, expect, it } from 'vitest';
import { astronomicalYear, dayFromDate } from '../time/calendar.ts';
import { formatDateReadout, formatRateNumber, formatYear } from './dates.ts';
import { detectLanguage, formatMessage } from './messages.ts';

describe('messages', () => {
  it('fills placeholders', () => {
    expect(formatMessage('Version {v}', { v: '0.1' }, 'en')).toBe('Version 0.1');
    expect(formatMessage('{n} items', { n: 1000 }, 'de')).toBe('1.000 items');
  });

  it('selects plural forms', () => {
    const t = '{n, plural, one {# year} other {# years}}';
    expect(formatMessage(t, { n: 1 }, 'en')).toBe('1 year');
    expect(formatMessage(t, { n: 2000 }, 'en')).toBe('2,000 years');
    expect(formatMessage(t, { n: 2000 }, 'de')).toBe('2.000 years');
  });

  it('detects the language', () => {
    expect(detectLanguage(['de-AT', 'en'])).toBe('de');
    expect(detectLanguage(['fr-FR', 'en-US'])).toBe('en');
    expect(detectLanguage(['fr'])).toBe('en');
  });
});

describe('dates', () => {
  const moving = { yearsPerMinute: 2000, stationary: false };
  const still = { yearsPerMinute: 2000, stationary: true };

  it('formats years with eras in both languages', () => {
    expect(formatYear(astronomicalYear(753, 'BCE'), 'en')).toBe('753 BCE');
    expect(formatYear(astronomicalYear(753, 'BCE'), 'de')).toBe('753 v. Chr.');
    expect(formatYear(79, 'en')).toBe('79 CE');
    expect(formatYear(79, 'de')).toBe('79 n. Chr.');
    expect(formatYear(1492, 'de')).toBe('1492');
    expect(formatYear(astronomicalYear(3250, 'BCE'), 'en')).toBe('3250 BCE');
    expect(formatYear(astronomicalYear(50000, 'BCE'), 'en')).toBe('50,000 BCE');
    expect(formatYear(astronomicalYear(50000, 'BCE'), 'de')).toBe('50.000 v. Chr.');
    expect(formatYear(astronomicalYear(2560, 'BCE'), 'de', true)).toBe('ca. 2560 v. Chr.');
  });

  it('rounds the deep past while moving', () => {
    const d = dayFromDate(astronomicalYear(50042, 'BCE'), 6, 1);
    expect(formatDateReadout(d, 'en', moving)).toBe('50,042 BCE');
    expect(formatDateReadout(d, 'de', moving)).toBe('50.042 v. Chr.');
    expect(formatDateReadout(d, 'en', still)).toBe('50,042 BCE');
  });

  it('shows the exact BCE year while moving', () => {
    const d = dayFromDate(astronomicalYear(3250, 'BCE'), 1, 1);
    expect(formatDateReadout(d, 'en', moving)).toBe('3250 BCE');
    expect(formatDateReadout(d, 'en', { yearsPerMinute: 40, stationary: false })).toBe('3250 BCE');
  });

  it('shows full dates when paused from 1500', () => {
    const d = dayFromDate(1789, 7, 14);
    expect(formatDateReadout(d, 'en', still)).toBe('14 July 1789');
    expect(formatDateReadout(d, 'de', still)).toBe('14. Juli 1789');
    expect(formatDateReadout(d, 'en', moving)).toBe('1789');
  });

  it('rounds the rate to two significant figures', () => {
    expect(formatRateNumber(2047, 'en')).toBe('2,000');
    expect(formatRateNumber(19.6, 'en')).toBe('20');
    expect(formatRateNumber(0.2375, 'de')).toBe('0,24');
  });
});
