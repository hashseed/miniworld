// The three speed modes (spec section 2.2 and milestone 1, section 3.3).

import { YEARS_PER_MINUTE } from './rate.ts';

export type SpeedMode = 'snail' | 'regular' | 'fast';

/** Slowest first, the order of the buttons and of the [ and ] keys. */
export const SPEED_MODES: readonly SpeedMode[] = ['snail', 'regular', 'fast'];

export const SPEED_FACTOR: Record<SpeedMode, number> = { snail: 1 / 8, regular: 1, fast: 16 };

export function isSpeedMode(v: unknown): v is SpeedMode {
  return v === 'snail' || v === 'regular' || v === 'fast';
}

/** The next slower (−1) or faster (+1) mode, staying at the ends. */
export function stepSpeed(mode: SpeedMode, dir: -1 | 1): SpeedMode {
  const i = SPEED_MODES.indexOf(mode) + dir;
  return SPEED_MODES[Math.max(0, Math.min(SPEED_MODES.length - 1, i))]!;
}

/** History's rate in years per minute in a mode. */
export function yearsPerMinute(mode: SpeedMode): number {
  return YEARS_PER_MINUTE * SPEED_FACTOR[mode];
}
