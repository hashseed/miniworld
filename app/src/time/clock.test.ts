import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, OPENING_DAY, TIMELINE_START, dayFromDate } from './calendar.ts';
import { Clock, JUMP_MS } from './clock.ts';
import { msAtDay, yearsPerMinuteAt } from './rate.ts';

const END = dayFromDate(1991, 12, 26);
const MID = dayFromDate(-3000, 1, 1);

function make(day = OPENING_DAY) {
  return new Clock({ startDay: TIMELINE_START, endDay: END, day, playState: 'playing' });
}

describe('clock', () => {
  it('advances watching time at real time, and history time by the curve', () => {
    const c = make(dayFromDate(1914, 1, 1));
    const ms = c.ms;
    c.tick(60000);
    expect(c.ms).toBe(ms + 60000);
    // A year a minute in the 20th century.
    expect((c.day - dayFromDate(1914, 1, 1)) / DAYS_PER_YEAR).toBeCloseTo(1, 1);
    expect(c.yearsPerMinute).toBeCloseTo(yearsPerMinuteAt(c.day), 9);
  });

  it('runs history faster in the deep past than in written history', () => {
    const a = make();
    const b = make(dayFromDate(1914, 1, 1));
    a.tick(6000);
    b.tick(6000);
    expect(a.day - OPENING_DAY).toBeGreaterThan(100 * (b.day - dayFromDate(1914, 1, 1)));
  });

  it('applies the speed modes', () => {
    const c = make();
    const rate = () => yearsPerMinuteAt(c.day);
    c.setSpeedMode('snail');
    const m0 = c.ms;
    c.tick(10000);
    expect(c.ms - m0).toBe(1000);
    expect(c.yearsPerMinute).toBeCloseTo(rate() / 10, 9);
    c.setSpeedMode('fast');
    c.tick(1000);
    expect(c.ms - m0).toBe(11000);
    expect(c.yearsPerMinute).toBeCloseTo(rate() * 10, 9);
    c.setSpeedMode('fastest');
    c.tick(1000);
    expect(c.ms - m0).toBe(111000);
    expect(c.yearsPerMinute).toBeCloseTo(rate() * 100, 9);
  });

  it('steps through the modes with [ and ], staying at the ends', () => {
    const c = make();
    c.stepSpeed(-1);
    expect(c.speedMode).toBe('snail');
    c.stepSpeed(-1);
    expect(c.speedMode).toBe('snail');
    c.stepSpeed(1);
    c.stepSpeed(1);
    c.stepSpeed(1);
    c.stepSpeed(1);
    expect(c.speedMode).toBe('fastest');
  });

  it('jumps by playing linearly for a second, then resumes its state', () => {
    const c = make(OPENING_DAY);
    c.togglePlay();
    c.jumpYears(10);
    expect(c.jumping).toBe(1);
    const to = msAtDay(OPENING_DAY + Math.round(10 * DAYS_PER_YEAR), TIMELINE_START);
    const from = c.ms;
    c.tick(JUMP_MS / 2);
    expect(c.ms).toBe(Math.floor((from + to) / 2));
    c.tick(JUMP_MS / 2);
    expect(c.ms).toBe(to);
    expect(c.jumping).toBe(0);
    expect(c.playState).toBe('paused');
    c.tick(5000);
    expect(c.ms).toBe(to);
  });

  it('plays a jump back in reverse, and keeps playing after it', () => {
    const c = make(MID);
    c.jumpYears(-1);
    expect(c.jumping).toBe(-1);
    c.tick(JUMP_MS);
    expect(c.day).toBe(MID - 365);
    expect(c.playState).toBe('playing');
    c.tick(1000);
    expect(c.ms).toBe(msAtDay(MID - 365, TIMELINE_START) + 1000);
  });

  it('queues presses during a jump, each from where the last ended', () => {
    const c = make(MID);
    c.togglePlay();
    c.jumpYears(1);
    c.tick(300);
    c.jumpYears(1);
    c.jumpYears(-10);
    c.tick(700);
    expect(c.day).toBe(MID + 365);
    expect(c.jumping).toBe(1);
    c.tick(1000);
    expect(c.day).toBe(MID + 730);
    c.tick(1000);
    expect(c.day).toBe(MID + 730 - 3652);
    expect(c.jumping).toBe(0);
  });

  it('stops a jump at either end of the timeline', () => {
    const c = make(TIMELINE_START + 100);
    c.togglePlay();
    c.jumpYears(-1000);
    c.tick(JUMP_MS);
    expect(c.day).toBe(TIMELINE_START);
    c.jumpYears(-1);
    expect(c.jumping).toBe(0);
    const d = make(END - 100);
    d.togglePlay();
    d.jumpYears(1000);
    d.tick(JUMP_MS);
    expect(d.day).toBe(END);
  });

  it('cancels jumps when the date is set or the playhead dragged', () => {
    const c = make(OPENING_DAY);
    c.jumpYears(100);
    c.jumpYears(100);
    c.tick(200);
    c.setDay(OPENING_DAY);
    expect(c.jumping).toBe(0);
    c.tick(2000);
    expect(c.ms).toBe(msAtDay(OPENING_DAY, TIMELINE_START) + 2000);
    c.jumpYears(100);
    c.beginScrub();
    expect(c.jumping).toBe(0);
  });

  it('stops when paused', () => {
    const c = make();
    c.togglePlay();
    expect(c.playState).toBe('paused');
    const ms = c.ms;
    c.tick(5000);
    expect(c.ms).toBe(ms);
    c.togglePlay();
    expect(c.playState).toBe('playing');
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

  it('keeps the clock whole and within range', () => {
    const c = make();
    c.setDay(TIMELINE_START - 1000.7);
    expect(c.ms).toBe(0);
    expect(c.day).toBe(TIMELINE_START);
    c.tick(123.4);
    expect(Number.isInteger(c.ms)).toBe(true);
    c.setMs(1e12);
    expect(c.day).toBe(END);
  });

  it('restores a saved clock time over a day', () => {
    const c = new Clock({ startDay: TIMELINE_START, endDay: END, ms: 81_234_567 });
    expect(c.ms).toBe(81_234_567);
  });
});
