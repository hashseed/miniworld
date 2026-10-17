// The timeline (spec milestone 1, section 7): a canvas with a ruler, a World
// lane and regional lanes of era ranges, a playhead, zoom and scrubbing, on a
// watching-time axis or the true time scale.

import type { EraRecord, StartupIndex } from '../content/types.ts';
import { formatYear } from '../i18n/dates.ts';
import type { I18n } from '../i18n/i18n.ts';
import { continuousYear, dateFromDay, dayFromContinuousYear, type Day } from '../time/calendar.ts';
import type { Clock } from '../time/clock.ts';
import { secondsAtYear, yearAtSeconds, type WatchTable } from '../time/watchTable.ts';

type Mode = 'watch' | 'true';

interface Placed {
  era: EraRecord;
  row: number;
}

interface LaneLayout {
  id: string;
  label: string;
  rows: number;
  eras: Placed[];
}

const NICE_STEPS = [
  1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000,
];
const RULER_H = 22;
const MIN_ROW_H = 11;

export interface TimelineOptions {
  canvas: HTMLCanvasElement;
  clock: Clock;
  i18n: I18n;
}

export class Timeline {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private clock: Clock;
  private i18n: I18n;
  private index!: StartupIndex;
  private table!: WatchTable;
  private lanes: LaneLayout[] = [];
  private mode: Mode = 'watch';
  /** Visible range in axis units of the current mode. */
  private view = { a0: 0, a1: 1 };
  private transition: { from: { mode: Mode; a0: number; a1: number }; start: number } | undefined;
  private width = 0;
  private height = 0;
  private dpr = 1;
  follow = true;
  /** Lanes shown; undefined shows all. */
  visibleLanes: string[] | undefined;
  private rowH = 16;
  private drag:
    | { kind: 'scrub' | 'pan' | 'tap'; x: number; a0: number; a1: number; moved: boolean }
    | undefined;
  private pinch = new Map<number, number>();
  private pinchStart: { dist: number; a0: number; a1: number; centre: number } | undefined;
  private tooltip: { text: string; x: number; y: number; until: number } | undefined;
  onFollowChange: (follow: boolean) => void = () => {};
  onLayout: (height: number) => void = () => {};

  constructor(opts: TimelineOptions) {
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d')!;
    this.clock = opts.clock;
    this.i18n = opts.i18n;
    this.attach();
  }

  setIndex(index: StartupIndex): void {
    const first = !this.index;
    this.index = index;
    this.table = index.watchTable;
    this.layoutLanes();
    if (first) this.zoomToAll();
  }

  setMode(mode: Mode, animate = true): void {
    if (mode === this.mode) return;
    const from = { mode: this.mode, ...this.view };
    const p = this.clock.day;
    const frac = (this.axis(p, this.mode) - this.view.a0) / (this.view.a1 - this.view.a0);
    const spanFrac = (this.view.a1 - this.view.a0) / this.fullSpan(this.mode);
    this.mode = mode;
    const span = spanFrac * this.fullSpan(mode);
    const a0 = this.axis(p, mode) - frac * span;
    this.view = this.clampView(a0, a0 + span);
    this.transition = animate ? { from, start: performance.now() } : undefined;
  }

  get trueScale(): boolean {
    return this.mode === 'true';
  }

  // --- Axis ------------------------------------------------------------------

  private axis(day: number, mode: Mode): number {
    const y = continuousYear(day);
    return mode === 'watch' ? secondsAtYear(this.table, y) : y;
  }

  private dayAtAxis(a: number, mode: Mode): number {
    const y = mode === 'watch' ? yearAtSeconds(this.table, a) : a;
    return dayFromContinuousYear(y);
  }

  private fullRange(mode: Mode): [number, number] {
    return [this.axis(this.clock.startDay, mode), this.axis(this.clock.endDay, mode)];
  }

  private fullSpan(mode: Mode): number {
    const [a, b] = this.fullRange(mode);
    return b - a;
  }

  /** Screen x of a day, including the animated switch between scales. */
  private x(day: number): number {
    const xNow =
      ((this.axis(day, this.mode) - this.view.a0) / (this.view.a1 - this.view.a0)) * this.width;
    const tr = this.transition;
    if (!tr) return xNow;
    const t = Math.min(1, (performance.now() - tr.start) / 500);
    if (t >= 1) {
      this.transition = undefined;
      return xNow;
    }
    const e = t * t * (3 - 2 * t);
    const xOld =
      ((this.axis(day, tr.from.mode) - tr.from.a0) / (tr.from.a1 - tr.from.a0)) * this.width;
    return xOld + (xNow - xOld) * e;
  }

  private dayAtX(x: number): Day {
    const a = this.view.a0 + (x / this.width) * (this.view.a1 - this.view.a0);
    return Math.round(this.dayAtAxis(a, this.mode));
  }

  private clampView(a0: number, a1: number): { a0: number; a1: number } {
    const [lo, hi] = this.fullRange(this.mode);
    let span = Math.min(a1 - a0, hi - lo);
    // Down to about one year across the width.
    const p = this.clock.day;
    const oneYear = this.axis(p + 183, this.mode) - this.axis(p - 183, this.mode);
    span = Math.max(span, oneYear);
    let s = a0;
    if (s < lo) s = lo;
    if (s + span > hi) s = hi - span;
    return { a0: s, a1: s + span };
  }

  zoomToAll(): void {
    const [lo, hi] = this.fullRange(this.mode);
    this.view = { a0: lo, a1: hi };
  }

  zoomBy(factor: number, centreX = this.x(this.clock.day)): void {
    const a = this.view.a0 + (centreX / this.width) * (this.view.a1 - this.view.a0);
    const a0 = a - (a - this.view.a0) * factor;
    const a1 = a + (this.view.a1 - a) * factor;
    this.view = this.clampView(a0, a1);
  }

  // --- Layout ------------------------------------------------------------------

  private layoutLanes(): void {
    this.lanes = this.buildLanes(this.visibleLanes);
  }

  /** Height all lanes need at the smallest readable row height. */
  fullHeight(): number {
    const lanes = this.buildLanes(undefined);
    return RULER_H + lanes.reduce((n, l) => n + l.rows, 0) * MIN_ROW_H + lanes.length * 3 + 4;
  }

  private buildLanes(show: string[] | undefined): LaneLayout[] {
    return this.index.lanes
      .filter((l) => !show || show.includes(l.id))
      .map((l) => {
        const eras = this.index.eras
          .filter((e) => e.lane === l.id)
          .sort((a, b) => a.fromDay - b.fromDay);
        const rowEnds: number[] = [];
        const placed: Placed[] = eras.map((era) => {
          let row = rowEnds.findIndex((end) => end <= era.fromDay);
          if (row < 0) {
            row = rowEnds.length;
            rowEnds.push(era.toDay);
          } else rowEnds[row] = era.toDay;
          return { era, row };
        });
        return { id: l.id, label: l.label, rows: Math.max(1, rowEnds.length), eras: placed };
      });
  }

  setVisibleLanes(lanes: string[] | undefined): void {
    this.visibleLanes = lanes;
    if (this.index) this.layoutLanes();
  }

  /** Height the timeline needs at the current row height. */
  desiredHeight(maxHeight: number): number {
    const rows = this.lanes.reduce((n, l) => n + l.rows, 0);
    const gaps = this.lanes.length * 3;
    this.rowH = Math.max(
      MIN_ROW_H,
      Math.min(18, Math.floor((maxHeight - RULER_H - gaps - 4) / Math.max(1, rows))),
    );
    return RULER_H + rows * this.rowH + gaps + 4;
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  // --- Drawing ---------------------------------------------------------------------

  draw(): void {
    if (!this.index || this.width === 0) return;
    const day = this.clock.day;
    if (this.follow && !this.drag && this.clock.playState === 'playing') {
      const x = this.x(day);
      if (x > this.width * 0.85 || x < 0) {
        const span = this.view.a1 - this.view.a0;
        const a = this.axis(day, this.mode);
        this.view = this.clampView(a - span * 0.3, a + span * 0.7);
      }
    }
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = 'rgba(16, 22, 34, 0.82)';
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawRuler();
    let y = RULER_H + 2;
    ctx.font = `${Math.max(10, this.rowH - 5)}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    for (const lane of this.lanes) {
      const h = lane.rows * this.rowH;
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, y, this.width, h);
      for (const { era, row } of lane.eras) {
        const x0 = Math.max(-2, this.x(era.fromDay));
        const x1 = Math.min(this.width + 2, this.x(era.toDay));
        if (x1 < 0 || x0 > this.width || x1 - x0 < 0.5) continue;
        const ry = y + row * this.rowH + 1;
        ctx.fillStyle = era.color;
        ctx.globalAlpha = 0.85;
        roundRect(ctx, x0, ry, x1 - x0, this.rowH - 2, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        const label = era.label;
        const room = x1 - x0 - 8;
        if (room > 14) {
          ctx.fillStyle = '#fff';
          ctx.fillText(
            ellipsize(ctx, label, room),
            Math.max(x0, 0) + 4,
            ry + (this.rowH - 2) / 2 + 0.5,
          );
        }
      }
      // Lane name at the left edge.
      ctx.font = `600 ${Math.max(9, this.rowH - 7)}px system-ui, sans-serif`;
      const name = lane.label;
      const tw = ctx.measureText(name).width;
      ctx.fillStyle = 'rgba(10, 14, 22, 0.7)';
      ctx.fillRect(0, y, tw + 8, Math.min(h, this.rowH));
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(name, 4, y + this.rowH / 2);
      ctx.font = `${Math.max(10, this.rowH - 5)}px system-ui, sans-serif`;
      y += h + 3;
    }
    // Playhead.
    const px = this.x(day);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(px - 1, 0, 2, this.height);
    ctx.beginPath();
    ctx.moveTo(px - 6, 0);
    ctx.lineTo(px + 6, 0);
    ctx.lineTo(px, 8);
    ctx.fill();
    this.drawTooltip();
  }

  private drawRuler(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, this.width, RULER_H);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const lang = this.i18n.language;
    let lastLabelEnd = -Infinity;
    for (const hy of this.ticks()) {
      const astro = hy < 0 ? hy + 1 : hy;
      const day = dayFromContinuousYear(astro);
      const x = this.x(day);
      if (x < 0 || x > this.width) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(Math.round(x), RULER_H - 6, 1, 6);
      const label = formatYear(astro, lang);
      const w = ctx.measureText(label).width;
      if (x - w / 2 > lastLabelEnd + 8 && x + w / 2 < this.width) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(label, x - w / 2, RULER_H / 2 - 2);
        lastLabelEnd = x + w / 2;
      }
    }
  }

  /** Tick years (historical numbering: −50000 is 50,000 BCE), spaced at least ~90 px apart. */
  private ticks(): number[] {
    const out: number[] = [];
    const toHy = (day: number) => {
      const y = continuousYear(day);
      return y <= 0 ? y - 1 : y;
    };
    let hy = toHy(this.dayAtX(0));
    const end = toHy(this.dayAtX(this.width));
    for (let guard = 0; guard < 400 && hy < end; guard++) {
      const xA = this.x(dayFromContinuousYear(hy < 0 ? hy + 1 : hy));
      const xB = this.x(dayFromContinuousYear((hy < 0 ? hy + 1 : hy) + 1));
      const yearsPerPx = 1 / Math.max(1e-9, xB - xA);
      const step =
        NICE_STEPS.find((s) => s / yearsPerPx >= 90) ?? NICE_STEPS[NICE_STEPS.length - 1]!;
      let next = Math.ceil((hy + 1e-6) / step) * step;
      if (next === 0) next = step > 1 ? 1 : 1;
      out.push(next);
      hy = next;
    }
    return out;
  }

  private drawTooltip(): void {
    const t = this.tooltip;
    if (!t || performance.now() > t.until) return;
    const ctx = this.ctx;
    ctx.font = '13px system-ui, sans-serif';
    const w = ctx.measureText(t.text).width + 16;
    const x = Math.min(Math.max(4, t.x - w / 2), this.width - w - 4);
    const y = Math.max(2, t.y - 30);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    roundRect(ctx, x, y, w, 24, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(t.text, x + 8, y + 12);
  }

  private eraAt(x: number, y: number): EraRecord | undefined {
    let top = RULER_H + 2;
    for (const lane of this.lanes) {
      const h = lane.rows * this.rowH;
      if (y >= top && y < top + h) {
        const row = Math.floor((y - top) / this.rowH);
        const day = this.dayAtX(x);
        return lane.eras.find((p) => p.row === row && p.era.fromDay <= day && day < p.era.toDay)
          ?.era;
      }
      top += h + 3;
    }
    return undefined;
  }

  private eraText(era: EraRecord): string {
    const lang = this.i18n.language;
    const from = formatYear(dateFromDay(era.fromDay).year, lang, era.fromApproximate);
    const to =
      era.toDay >= this.clock.endDay
        ? this.i18n.t('timeline.today')
        : formatYear(dateFromDay(era.toDay).year, lang, era.toApproximate);
    return this.i18n.t('timeline.eraTooltip', { name: era.label, from, to });
  }

  // --- Input ------------------------------------------------------------------------

  private attach(): void {
    const c = this.canvas;
    c.tabIndex = 0;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pinch.set(e.pointerId, e.clientX);
      if (this.pinch.size === 2) {
        this.endDrag(false);
        const xs = [...this.pinch.values()];
        this.pinchStart = {
          dist: Math.abs(xs[1]! - xs[0]!),
          ...this.view,
          centre: (xs[0]! + xs[1]!) / 2 - c.getBoundingClientRect().left,
        };
        return;
      }
      const { x, y } = this.local(e);
      const nearPlayhead = Math.abs(x - this.x(this.clock.day)) < 10;
      const kind = nearPlayhead || y < RULER_H ? 'scrub' : 'tap';
      this.drag = { kind, x, ...this.view, moved: false };
      if (kind === 'scrub') {
        this.clock.beginScrub();
        this.clock.setDay(this.dayAtX(x));
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (this.pinch.has(e.pointerId)) this.pinch.set(e.pointerId, e.clientX);
      if (this.pinchStart && this.pinch.size === 2) {
        const xs = [...this.pinch.values()];
        const dist = Math.max(10, Math.abs(xs[1]! - xs[0]!));
        const f = this.pinchStart.dist / dist;
        const a =
          this.pinchStart.a0 +
          (this.pinchStart.centre / this.width) * (this.pinchStart.a1 - this.pinchStart.a0);
        this.view = this.clampView(
          a - (a - this.pinchStart.a0) * f,
          a + (this.pinchStart.a1 - a) * f,
        );
        return;
      }
      const d = this.drag;
      if (!d) return;
      const { x } = this.local(e);
      if (Math.abs(x - d.x) > 4) d.moved = true;
      if (d.kind === 'scrub') this.clock.setDay(this.dayAtX(x));
      else if (d.moved) {
        d.kind = 'pan';
        const da = ((x - d.x) / this.width) * (d.a1 - d.a0);
        this.view = this.clampView(d.a0 - da, d.a1 - da);
        this.setFollow(false);
      }
    });
    const up = (e: PointerEvent) => {
      this.pinch.delete(e.pointerId);
      if (this.pinch.size < 2) this.pinchStart = undefined;
      const d = this.drag;
      if (d && d.kind === 'tap' && !d.moved) {
        const { x, y } = this.local(e);
        const era = this.eraAt(x, y);
        if (era) this.tooltip = { text: this.eraText(era), x, y, until: performance.now() + 4000 };
        else this.clock.setDay(this.dayAtX(x));
      }
      this.endDrag(true);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.drag) return;
      const { x, y } = this.local(e);
      const era = this.eraAt(x, y);
      this.tooltip = era
        ? { text: this.eraText(era), x, y, until: performance.now() + 2500 }
        : undefined;
    });
    c.addEventListener('pointerleave', () => {
      if (!this.drag) this.tooltip = undefined;
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const { x } = this.local(e);
        this.zoomBy(Math.exp(e.deltaY * 0.002), x);
        this.setFollow(false);
      },
      { passive: false },
    );
    c.addEventListener('keydown', (e) => {
      if (e.key === 'Home') this.clock.setDay(this.clock.startDay);
      else if (e.key === 'End') this.clock.setDay(this.clock.endDay);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const ticks = this.ticks();
        const day = this.clock.day;
        const days = ticks.map((hy) => Math.round(dayFromContinuousYear(hy < 0 ? hy + 1 : hy)));
        const target =
          e.key === 'ArrowRight'
            ? days.find((d) => d > day + 1)
            : [...days].reverse().find((d) => d < day - 1);
        if (target !== undefined) this.clock.setDay(target);
      } else return;
      e.preventDefault();
      e.stopPropagation();
    });
  }

  private endDrag(release: boolean): void {
    if (this.drag?.kind === 'scrub' && release) this.clock.endScrub();
    else if (this.drag?.kind === 'scrub') this.clock.endScrub();
    this.drag = undefined;
  }

  setFollow(follow: boolean): void {
    if (this.follow === follow) return;
    this.follow = follow;
    this.onFollowChange(follow);
  }

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + '…').width <= width) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? '' : text.slice(0, lo) + '…';
}
