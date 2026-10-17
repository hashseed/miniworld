// The planet at a date: sea level, glacial index and ice slices (spec
// milestone 1, section 5). Pure functions of the date and the data, with no
// DOM or rendering code, so the world query can use them in a worker later.

import type { StartupIndex } from '../content/types.ts';

export interface PlanetState {
  seaLevel: number; // metres relative to today
  glacialIndex: number; // 0 today .. 1 at the lowest sea level
  iceA: number; // day of the ice slice at or before the date
  iceB: number; // day of the ice slice after the date
  iceT: number; // blend from slice A to slice B
}

export function seaLevelAt(curve: StartupIndex['seaLevel'], day: number): number {
  const f = (day - curve.startDay) / curve.stepDays;
  const m = curve.metres;
  if (f <= 0) return m[0]!;
  if (f >= m.length - 1) return m[m.length - 1]!;
  const i = Math.floor(f);
  return m[i]! + (m[i + 1]! - m[i]!) * (f - i);
}

export function lowestSeaLevel(curve: StartupIndex['seaLevel']): number {
  return Math.min(...curve.metres);
}

export function iceSlicePair(slices: number[], day: number): { a: number; b: number; t: number } {
  if (slices.length === 0) return { a: day, b: day, t: 0 };
  if (day <= slices[0]!) return { a: slices[0]!, b: slices[0]!, t: 0 };
  const last = slices[slices.length - 1]!;
  if (day >= last) return { a: last, b: last, t: 0 };
  let k = 0;
  while (slices[k + 1]! <= day) k++;
  const a = slices[k]!;
  const b = slices[k + 1]!;
  return { a, b, t: (day - a) / (b - a) };
}

export function planetAt(
  index: StartupIndex,
  day: number,
  minSeaLevel = lowestSeaLevel(index.seaLevel),
): PlanetState {
  const seaLevel = seaLevelAt(index.seaLevel, day);
  const glacialIndex = minSeaLevel < 0 ? Math.max(0, Math.min(1, seaLevel / minSeaLevel)) : 0;
  const { a, b, t } = iceSlicePair(index.iceSlices, day);
  return { seaLevel, glacialIndex, iceA: a, iceB: b, iceT: t };
}

/** Index of the content time window containing a day. */
export function windowAt(windows: number[], day: number): number {
  let lo = 0;
  let hi = windows.length - 1;
  if (day < windows[0]!) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (windows[mid]! <= day) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
