// The clock (spec section 2 and milestone 1, sections 3.3 to 3.5): one count of
// milliseconds of watching time since the start of the timeline drives
// everything on screen. It advances by real time × the speed mode's factor
// while playing; the date follows from it at 25 years per minute.

import type { Day } from './calendar.ts';
import { dayAtMs, msAtDay } from './rate.ts';
import { SPEED_FACTOR, stepSpeed, yearsPerMinute, type SpeedMode } from './speed.ts';

export type PlayState = 'playing' | 'paused';

export interface ClockOptions {
  startDay: Day;
  endDay: Day;
  /** Clock time in whole milliseconds; wins over `day`. */
  ms?: number;
  day?: Day;
  playState?: PlayState;
  speedMode?: SpeedMode;
}

export class Clock {
  startDay: Day;
  endDay: Day;
  playState: PlayState;
  speedMode: SpeedMode;

  private accumulator = 0;
  private scrubbing = false;
  private listeners = new Set<() => void>();

  constructor(options: ClockOptions) {
    this.startDay = options.startDay;
    this.endDay = options.endDay;
    this.playState = options.playState ?? 'paused';
    this.speedMode = options.speedMode ?? 'regular';
    this.accumulator = this.clampMs(this.initialMs(options));
  }

  /** Sets the range and the restored state once the manifest is known. */
  configure(options: ClockOptions): void {
    this.startDay = options.startDay;
    this.endDay = options.endDay;
    this.accumulator = this.clampMs(this.initialMs(options));
    if (options.playState !== undefined) this.playState = options.playState;
    if (options.speedMode !== undefined) this.speedMode = options.speedMode;
    this.emit();
  }

  /** Clock time in whole milliseconds; the only time that reaches the world. */
  get ms(): number {
    return Math.floor(this.accumulator);
  }

  /** The current date as a whole day. */
  get day(): Day {
    return dayAtMs(this.ms, this.startDay);
  }

  /** Clock time at the end of the timeline. */
  get endMs(): number {
    return msAtDay(this.endDay, this.startDay);
  }

  get isScrubbing(): boolean {
    return this.scrubbing;
  }

  /** History's rate in years per minute at the current speed mode. */
  get yearsPerMinute(): number {
    return yearsPerMinute(this.speedMode);
  }

  /** Advances the clock by a real-time interval. */
  tick(realMs: number): void {
    if (realMs <= 0 || this.playState !== 'playing' || this.scrubbing) return;
    const before = this.day;
    this.accumulator += realMs * SPEED_FACTOR[this.speedMode];
    if (this.accumulator >= this.endMs) {
      this.accumulator = this.endMs;
      this.playState = 'paused';
    }
    if (this.day !== before || this.playState !== 'playing') this.emit();
  }

  /** Jumps to the start of a day. */
  setDay(day: number): void {
    this.setMs(msAtDay(Math.floor(day), this.startDay));
  }

  setMs(ms: number): void {
    this.accumulator = this.clampMs(Math.floor(ms));
    this.emit();
  }

  setPlayState(state: PlayState): void {
    if (state === 'playing' && this.ms >= this.endMs) state = 'paused';
    if (this.playState === state) return;
    this.playState = state;
    this.emit();
  }

  /** Space: toggles between playing and paused. */
  togglePlay(): void {
    this.setPlayState(this.playState === 'playing' ? 'paused' : 'playing');
  }

  setSpeedMode(mode: SpeedMode): void {
    if (mode === this.speedMode) return;
    this.speedMode = mode;
    this.emit();
  }

  /** [ and ]: the next slower or faster mode. */
  stepSpeed(dir: -1 | 1): void {
    this.setSpeedMode(stepSpeed(this.speedMode, dir));
  }

  beginScrub(): void {
    this.scrubbing = true;
    this.emit();
  }

  endScrub(): void {
    this.scrubbing = false;
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private initialMs(o: ClockOptions): number {
    if (o.ms !== undefined) return Math.floor(o.ms);
    return msAtDay(o.day ?? o.startDay, o.startDay);
  }

  private clampMs(ms: number): number {
    const end = msAtDay(this.endDay, this.startDay);
    return ms < 0 ? 0 : ms > end ? end : ms;
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
