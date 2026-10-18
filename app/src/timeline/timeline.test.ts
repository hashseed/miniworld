import { describe, expect, it } from 'vitest';
import type { EraRecord, StartupIndex } from '../content/types.ts';
import { I18n } from '../i18n/i18n.ts';
import { continuousYear, dayFromDate } from '../time/calendar.ts';
import { Clock } from '../time/clock.ts';
import { Timeline } from './timeline.ts';

type Listener = (e: Partial<PointerEvent>) => void;

/** Enough of a canvas for the timeline: it records the text drawn and the listeners. */
function fakeCanvas() {
  const listeners = new Map<string, Listener[]>();
  const texts: string[] = [];
  const ctx = new Proxy(
    {
      fillText: (t: string) => texts.push(t),
      measureText: (t: string) => ({ width: t.length * 6 }),
    } as Record<string, unknown>,
    { get: (target, key: string) => target[key] ?? (() => {}), set: () => true },
  );
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture: () => {},
    addEventListener: (type: string, l: Listener) =>
      listeners.set(type, [...(listeners.get(type) ?? []), l]),
  };
  const fire = (type: string, e: Partial<PointerEvent>) => {
    for (const l of listeners.get(type) ?? []) l({ pointerId: 1, pointerType: 'mouse', ...e });
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, texts, fire };
}

const day = (year: number) => dayFromDate(year, 1, 1);
const era = (id: string, lane: string, from: number, to: number): EraRecord => ({
  id,
  lane,
  fromDay: day(from),
  toDay: day(to),
  fromApproximate: false,
  toApproximate: false,
  color: '#888',
  label: `Era ${id}`,
});

function setup() {
  const clock = new Clock({ startDay: day(0), endDay: day(1000), day: day(50) });
  const { canvas, texts, fire } = fakeCanvas();
  const timeline = new Timeline({ canvas, clock, i18n: new I18n('en') });
  timeline.setIndex({
    lanes: [
      { id: 'world', label: 'World' },
      { id: 'europe', label: 'Europe' },
    ],
    // A and B overlap, so B takes a second row; C fits after A in the first.
    eras: [
      era('A', 'world', 100, 400),
      era('B', 'world', 300, 600),
      era('C', 'world', 500, 900),
      era('D', 'europe', 0, 1000),
    ],
    axisYears: 50,
  } as unknown as StartupIndex);
  // On the true time scale one pixel is about one year.
  timeline.setMode('true', false);
  timeline.zoomToAll();
  timeline.resize(1000, timeline.desiredHeight(1000));
  return { clock, timeline, texts, fire };
}

// Rows are 18 px below the 22 px ruler and a 2 px gap; lanes are 3 px apart.
const rowY = (lane: number, row: number) => 24 + lane * (2 * 18 + 3) + row * 18 + 9;

describe('timeline', () => {
  it('stacks overlapping eras in rows and sizes itself to them', () => {
    const { timeline } = setup();
    // Three rows in two lanes: ruler, rows, lane gaps and a margin.
    expect(timeline.desiredHeight(1000)).toBe(22 + 3 * 18 + 6 + 4);
    // Collapsed to one lane, it keeps room for the lane with the most rows.
    timeline.setVisibleLanes(['europe']);
    expect(timeline.desiredHeight(1000)).toBe(22 + 2 * 18 + 3 + 4);
    // Short of room, rows shrink to their minimum.
    timeline.setVisibleLanes(undefined);
    expect(timeline.desiredHeight(60)).toBe(22 + 3 * 11 + 6 + 4);
  });

  it('finds the era under the pointer by lane, row and date', () => {
    const { timeline, texts, fire } = setup();
    const hover = (year: number, y: number) => {
      fire('pointermove', { clientX: year, clientY: y });
      texts.length = 0;
      timeline.draw();
      // The tooltip is drawn last, with the era's dates.
      const last = texts[texts.length - 1]!;
      return /\d/.test(last) ? last : undefined;
    };
    expect(hover(200, rowY(0, 0))).toContain('Era A');
    expect(hover(450, rowY(0, 1))).toContain('Era B');
    expect(hover(700, rowY(0, 0))).toContain('Era C');
    expect(hover(450, rowY(0, 0))).toBeUndefined();
    expect(hover(950, rowY(1, 0))).toContain('Era D');
  });

  it('scrubs from the ruler and jumps to a tapped date', () => {
    const { clock, fire } = setup();
    fire('pointerdown', { clientX: 300, clientY: 5 });
    expect(clock.isScrubbing).toBe(true);
    fire('pointermove', { clientX: 600, clientY: 5 });
    fire('pointerup', { clientX: 600, clientY: 5 });
    expect(clock.isScrubbing).toBe(false);
    expect(continuousYear(clock.day)).toBeCloseTo(600, -1);
    // A tap on empty lane space moves the date there.
    fire('pointerdown', { clientX: 450, clientY: rowY(0, 0) });
    fire('pointerup', { clientX: 450, clientY: rowY(0, 0) });
    expect(continuousYear(clock.day)).toBeCloseTo(450, -1);
  });

  it('redraws only when something it shows has changed', () => {
    const { clock, timeline, fire } = setup();
    expect(timeline.draw()).toBe(true);
    expect(timeline.draw()).toBe(false);
    clock.setDay(day(70));
    expect(timeline.draw()).toBe(true);
    expect(timeline.draw()).toBe(false);
    timeline.zoomBy(0.5, 500);
    expect(timeline.draw()).toBe(true);
    fire('pointermove', { clientX: 200, clientY: rowY(0, 0) });
    expect(timeline.draw()).toBe(true);
    expect(timeline.draw()).toBe(false);
    timeline.resize(1000, 100);
    expect(timeline.draw()).toBe(true);
    timeline.setVisibleLanes(['world']);
    expect(timeline.draw()).toBe(true);
    timeline.invalidate();
    expect(timeline.draw()).toBe(true);
  });
});
