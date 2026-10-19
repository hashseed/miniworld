// The clock (spec section 2 and milestone 1, sections 3.3 to 3.5): one count of
// milliseconds of watching time since the start of the timeline drives
// everything on screen. It advances by real time × the speed mode's factor
// while playing; the date follows from it at 25 years per minute.

import { DAYS_PER_YEAR, type Day } from './calendar.ts';
import { dayAtMs, msAtDay } from './rate.ts';
import { SPEED_FACTOR, stepSpeed, yearsPerMinute, type SpeedMode } from './speed.ts';

export type PlayState = 'playing' | 'paused';

/** A jump runs this long in real time, however far it goes (section 3.3). */
export const JUMP_MS = 1000;

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
  /** The jump under way: from and to in clock time, and the real time it has run. */
  private jump: { from: number; to: number; ran: number } | undefined;
  /** Jumps queued behind it, in whole days. */
  private queued: number[] = [];
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

  /** -1 while a jump runs backwards, 1 forwards, 0 when none is under way. */
  get jumping(): -1 | 0 | 1 {
    return !this.jump ? 0 : this.jump.to < this.jump.from ? -1 : 1;
  }

  /**
   * Jumps the date by whole years, back if negative, by playing very fast for
   * JUMP_MS; queued behind a jump under way (section 3.3).
   */
  jumpYears(years: number): void {
    this.queued.push(Math.round(years * DAYS_PER_YEAR));
    if (!this.jump) this.nextJump();
    this.emit();
  }

  /** Starts the next queued jump that moves the date, from where the clock stands. */
  private nextJump(): void {
    this.jump = undefined;
    while (this.queued.length > 0) {
      const days = this.queued.shift()!;
      const from = this.accumulator;
      const day = Math.min(this.endDay, Math.max(this.startDay, this.day + days));
      const to = msAtDay(day, this.startDay);
      if (to !== this.ms) {
        this.jump = { from, to, ran: 0 };
        return;
      }
    }
  }

  private cancelJumps(): void {
    this.jump = undefined;
    this.queued = [];
  }

  /** Advances the clock by a real-time interval. */
  tick(realMs: number): void {
    if (realMs <= 0) return;
    if (this.jump && !this.scrubbing) {
      // A jump runs whether playing or paused; the play state resumes after the last.
      const j = this.jump;
      j.ran += realMs;
      if (j.ran >= JUMP_MS) {
        this.accumulator = j.to;
        this.nextJump();
      } else this.accumulator = j.from + ((j.to - j.from) * j.ran) / JUMP_MS;
      this.emit();
      return;
    }
    if (this.playState !== 'playing' || this.scrubbing) return;
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
    this.cancelJumps();
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
    this.cancelJumps();
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
