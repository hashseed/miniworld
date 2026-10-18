// The two clocks (spec section 2 and milestone 1, sections 3.3 to 3.5).
// The historical clock advances the date by the base rate × speed × zoom
// factor; the life clock runs in real time while playing, and the vignette
// clock at real time × speed. Paused stops all three.

import { DAYS_PER_YEAR, continuousYear, type Day } from './calendar.ts';
import { baseRate, clampSpeedLog2 } from './rateCurve.ts';

export type PlayState = 'playing' | 'paused';

export interface ClockOptions {
  startDay: Day;
  endDay: Day;
  day: Day;
  lifeMs?: number;
  playState?: PlayState;
  /** Base-2 logarithm of the speed multiplier, −6 to 6. */
  speedLog2?: number;
}

export class Clock {
  startDay: Day;
  endDay: Day;
  playState: PlayState;
  /** Base-2 logarithm of the speed multiplier, −6 to 6. */
  speedLog2: number;
  /** Multiplier from the camera altitude; 1 when the setting is off. */
  zoomFactor = 1;

  private dayAccumulator: number;
  private lifeAccumulator: number;
  private vignetteAccumulator = 0;
  private scrubbing = false;
  private listeners = new Set<() => void>();

  constructor(options: ClockOptions) {
    this.startDay = options.startDay;
    this.endDay = options.endDay;
    this.dayAccumulator = clamp(options.day, this.startDay, this.endDay);
    this.lifeAccumulator = options.lifeMs ?? 0;
    this.playState = options.playState ?? 'paused';
    this.speedLog2 = clampSpeedLog2(options.speedLog2 ?? 0);
  }

  /** Sets the range and the restored state once the manifest is known. */
  configure(options: ClockOptions): void {
    this.startDay = options.startDay;
    this.endDay = options.endDay;
    this.dayAccumulator = clamp(options.day, this.startDay, this.endDay);
    if (options.lifeMs !== undefined) this.lifeAccumulator = options.lifeMs;
    if (options.playState !== undefined) this.playState = options.playState;
    if (options.speedLog2 !== undefined) this.speedLog2 = clampSpeedLog2(options.speedLog2);
    this.emit();
  }

  /** The current date as a whole day; the only value that reaches world state. */
  get day(): Day {
    return Math.floor(this.dayAccumulator);
  }

  /** Life-clock time in whole milliseconds. */
  get lifeMs(): number {
    return Math.floor(this.lifeAccumulator);
  }

  /** Vignette-clock time in whole milliseconds: real time × speed (milestone 1, section 3.5). */
  get vignetteMs(): number {
    return Math.floor(this.vignetteAccumulator);
  }

  get speed(): number {
    return 2 ** this.speedLog2;
  }

  get isScrubbing(): boolean {
    return this.scrubbing;
  }

  /** Effective rate in years per minute, including speed and zoom factor. */
  get yearsPerMinute(): number {
    return baseRate(continuousYear(this.dayAccumulator)) * this.speed * this.zoomFactor;
  }

  /** Advances both clocks by a real-time interval. */
  tick(realMs: number): void {
    if (realMs <= 0) return;
    if (this.playState !== 'playing') return;
    this.lifeAccumulator += realMs;
    this.vignetteAccumulator += realMs * this.speed;
    if (this.scrubbing) return;
    const before = this.day;
    // Small steps keep the integration accurate where the rate changes fast.
    let remaining = realMs;
    while (remaining > 0) {
      const step = Math.min(remaining, 250);
      const daysPerMs = (this.yearsPerMinute * DAYS_PER_YEAR) / 60000;
      this.dayAccumulator += daysPerMs * step;
      remaining -= step;
    }
    if (this.dayAccumulator >= this.endDay) {
      this.dayAccumulator = this.endDay;
      this.playState = 'paused';
    }
    if (this.day !== before || this.playState !== 'playing') this.emit();
  }

  setDay(day: number): void {
    this.dayAccumulator = clamp(Math.floor(day), this.startDay, this.endDay);
    this.emit();
  }

  setPlayState(state: PlayState): void {
    if (state === 'playing' && this.day >= this.endDay) state = 'paused';
    if (this.playState === state) return;
    this.playState = state;
    this.emit();
  }

  /** Space: toggles between playing and paused. */
  togglePlay(): void {
    this.setPlayState(this.playState === 'playing' ? 'paused' : 'playing');
  }

  setSpeedLog2(log2: number): void {
    const v = clampSpeedLog2(log2);
    if (v === this.speedLog2) return;
    this.speedLog2 = v;
    this.emit();
  }

  beginScrub(): void {
    this.scrubbing = true;
    this.emit();
  }

  endScrub(): void {
    this.scrubbing = false;
    this.emit();
  }

  /** Sets the life clock, used once at start so the first view is lit. */
  setLifeMs(ms: number): void {
    this.lifeAccumulator = ms;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
