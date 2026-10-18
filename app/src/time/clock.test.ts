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
    expect(years).toBeGreaterThan(460);
    expect(years).toBeLessThan(540);
    expect(c.lifeMs).toBe(60000);
  });

  it('applies speed and zoom factor', () => {
    const a = make();
    const b = make();
    b.setSpeedLog2(4); // ×16
    b.zoomFactor = 1 / 8;
    a.tick(1000);
    b.tick(1000);
    expect((b.day - OPENING_DAY) / (a.day - OPENING_DAY)).toBeCloseTo(2, 1);
    expect(b.yearsPerMinute / a.yearsPerMinute).toBeCloseTo(2, 2);
  });

  it('stops both clocks when paused', () => {
    const c = make();
    c.togglePlay();
    expect(c.playState).toBe('paused');
    c.tick(5000);
    expect(c.day).toBe(OPENING_DAY);
    expect(c.lifeMs).toBe(0);
    expect(c.vignetteMs).toBe(0);
    c.togglePlay();
    expect(c.playState).toBe('playing');
  });

  it('runs the life clock in real time whatever the speed', () => {
    const c = make();
    c.setSpeedLog2(-6);
    c.tick(5000);
    expect(c.lifeMs).toBe(5000);
    c.setSpeedLog2(6);
    c.tick(5000);
    expect(c.lifeMs).toBe(10000);
  });

  it('runs the vignette clock at real time × speed', () => {
    const c = make();
    c.setSpeedLog2(-2);
    c.tick(4000);
    expect(c.vignetteMs).toBe(1000);
    c.setSpeedLog2(3);
    c.tick(1000);
    expect(c.vignetteMs).toBe(9000);
    c.zoomFactor = 1 / 8;
    c.tick(1000);
    expect(c.vignetteMs).toBe(17000);
  });

  it('keeps the speed between ×1/64 and ×64', () => {
    const c = make();
    c.setSpeedLog2(-9);
    expect(c.speed).toBe(1 / 64);
    c.setSpeedLog2(9);
    expect(c.speed).toBe(64);
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

  it('stops at the end of the timeline and pauses', () => {
    const c = make(END - 10);
    c.tick(60000);
    expect(c.day).toBe(END);
    expect(c.playState).toBe('paused');
    c.setPlayState('playing');
    expect(c.playState).toBe('paused');
  });

  it('keeps dates whole and within range', () => {
    const c = make();
    c.setDay(TIMELINE_START - 1000.7);
    expect(c.day).toBe(TIMELINE_START);
    c.tick(123.4);
    expect(Number.isInteger(c.day)).toBe(true);
  });
});
