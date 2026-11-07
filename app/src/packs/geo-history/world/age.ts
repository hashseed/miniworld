// Time in geo-history (geo-history.md, section 3): the age in years before
// today, linear in watching time, from 1,000 Ma to 0, one hour at regular speed.

export const START_AGE = 1_000_000_000;
/** Watching time of the whole range at regular speed, in milliseconds (decided by Yang on 2026-11-07). */
export const PLAYTHROUGH_MS = 60 * 60 * 1000;
/** Years of age that pass per millisecond at regular speed. */
export const YEARS_PER_MS = START_AGE / PLAYTHROUGH_MS;

export type SpeedMode = 'snail' | 'regular' | 'fast' | 'fastest';
export const SPEED_MODES: readonly SpeedMode[] = ['snail', 'regular', 'fast', 'fastest'];
export const SPEED_FACTOR: Record<SpeedMode, number> = {
  snail: 1 / 10,
  regular: 1,
  fast: 10,
  fastest: 100,
};

export function clampAge(years: number): number {
  return Math.min(START_AGE, Math.max(0, Math.round(years)));
}

/** The age (years) `dtMs` of watching later, going forward in time, never past today. */
export function advance(age: number, dtMs: number, mode: SpeedMode): number {
  return clampAge(age - dtMs * YEARS_PER_MS * SPEED_FACTOR[mode]);
}

export function ageToMa(years: number): number {
  return years / 1_000_000;
}

export function maToAge(ma: number): number {
  return clampAge(ma * 1_000_000);
}

/** Position on the timeline from 0 (1,000 Ma) to 1 (today). */
export function fractionOf(years: number): number {
  return 1 - years / START_AGE;
}
