// The four speed modes (spec section 2.2 and milestone 1, section 3.3).

import { yearsPerMinuteAt } from './rate.ts';

export type SpeedMode = 'snail' | 'regular' | 'fast' | 'fastest';

/** Slowest first, the order of the buttons and of the [ and ] keys. */
export const SPEED_MODES: readonly SpeedMode[] = ['snail', 'regular', 'fast', 'fastest'];

export const SPEED_FACTOR: Record<SpeedMode, number> = {
  snail: 1 / 10,
  regular: 1,
  fast: 10,
  fastest: 100,
};

export function isSpeedMode(v: unknown): v is SpeedMode {
  return SPEED_MODES.includes(v as SpeedMode);
}

/** The next slower (−1) or faster (+1) mode, staying at the ends. */
export function stepSpeed(mode: SpeedMode, dir: -1 | 1): SpeedMode {
  const i = SPEED_MODES.indexOf(mode) + dir;
  return SPEED_MODES[Math.max(0, Math.min(SPEED_MODES.length - 1, i))]!;
}

/** History's rate in years per minute in a mode. */
export function yearsPerMinute(mode: SpeedMode, day: number): number {
  return yearsPerMinuteAt(day) * SPEED_FACTOR[mode];
}
