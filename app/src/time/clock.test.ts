import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, OPENING_DAY, TIMELINE_START, dayFromDate } from './calendar.ts';
import { Clock } from './clock.ts';

const END = dayFromDate(2026, 1, 1);

function make(day = OPENING_DAY) {
  return new Clock({ startDay: TIMELINE_START, endDay: END, day, playState: 'playing' });
}

describe('clock', () => {
  it('advances at the base rate when playing', () => {
    const c = make();
    c.tick(60000);
    const years = (c.day - OPENING_DAY) / DAYS_PER_YEAR;
    expect(years).toBeGreaterThan(1950);
    expect(years).toBeLessThan(2150);
    expect(c.lifeMs).toBe(60000);
  });

  it('applies speed and zoom factor', () => {
    const a = make();
    const b = make();
    b.setSpeedIndex(5); // ×16
    b.zoomFactor = 1 / 8;
    a.tick(1000);
    b.tick(1000);
    expect((b.day - OPENING_DAY) / (a.day - OPENING_DAY)).toBeCloseTo(2, 1);
    expect(b.yearsPerMinute / a.yearsPerMinute).toBeCloseTo(2, 2);
  });

  it('keeps the life clock running when history is paused', () => {
    const c = make();
    c.setPlayState('historyPaused');
    c.tick(5000);
    expect(c.day).toBe(OPENING_DAY);
    expect(c.lifeMs).toBe(5000);
  });

  it('stops both clocks when frozen', () => {
    const c = make();
    c.toggleFreeze();
    c.tick(5000);
    expect(c.day).toBe(OPENING_DAY);
    expect(c.lifeMs).toBe(0);
    c.toggleFreeze();
    expect(c.playState).toBe('playing');
  });

  it('toggles pause history with space', () => {
    const c = make();
    c.togglePauseHistory();
    expect(c.playState).toBe('historyPaused');
    c.togglePauseHistory();
    expect(c.playState).toBe('playing');
    c.toggleFreeze();
    c.togglePauseHistory();
    expect(c.playState).toBe('historyPaused');
  });

  it('does not advance while scrubbing', () => {
    const c = make();
    c.beginScrub();
    c.setDay(dayFromDate(79, 8, 24));
    c.tick(10000);
    expect(c.day).toBe(dayFromDate(79, 8, 24));
    c.endScrub();
    expect(c.playState).toBe('playing');
  });

  it('stops at the end of the timeline and pauses history', () => {
    const c = make(END - 10);
    c.tick(60000);
    expect(c.day).toBe(END);
    expect(c.playState).toBe('historyPaused');
    c.setPlayState('playing');
    expect(c.playState).toBe('historyPaused');
  });

  it('keeps dates whole and within range', () => {
    const c = make();
    c.setDay(TIMELINE_START - 1000.7);
    expect(c.day).toBe(TIMELINE_START);
    c.tick(123.4);
    expect(Number.isInteger(c.day)).toBe(true);
  });
});
