// Saved state in local storage (spec milestone 1, section 9). Every value is
// versioned and validated; anything unreadable is replaced by defaults.

import type { CameraState } from '../core/camera.ts';
import type { Language } from '../i18n/messages.ts';
import { TIMELINE_START } from '../time/calendar.ts';
import type { PlayState } from '../time/clock.ts';
import { isSpeedMode, type SpeedMode } from '../time/speed.ts';

export interface Settings {
  language: Language;
  /** Timeline shows every lane instead of only the region under the globe centre. */
  timelineExpanded: boolean;
  trueTimeScale: boolean;
  showStats: boolean;
  /**
   * Strength of the history lens in whole percent, 0 (true sizes) to 200;
   * 100 is the warp as built (history-lens.md, section 1).
   */
  lensStrength: number;
  /** The first-start hint about the lens was closed. */
  lensHintSeen: boolean;
  /** The steps of the back and forward buttons, in years (section 8.1). */
  backStep: JumpStep;
  forwardStep: JumpStep;
}

/** The steps the back and forward buttons offer, in years. */
export const JUMP_STEPS = [1, 10, 100, 1000] as const;
export type JumpStep = (typeof JUMP_STEPS)[number];
const stepOf = (v: unknown, fallback: JumpStep): JumpStep =>
  JUMP_STEPS.includes(v as JumpStep) ? (v as JumpStep) : fallback;

export interface ViewState {
  /** History time: the day shown (spec section 7.6). */
  day: number;
  camera: CameraState;
  playState: PlayState;
  speedMode: SpeedMode;
}

export interface Bookmark {
  id: string;
  name: string;
  /** History time: the day bookmarked (spec section 7.6). */
  day: number;
  camera: CameraState;
}

const KEYS = {
  settings: 'miniworld.settings.v1',
  view: 'miniworld.view.v3',
  bookmarks: 'miniworld.bookmarks.v3',
} as const;

/**
 * Earlier versions: version 2 saved the clock time at the old even rate of 25 years
 * a minute, version 1 a day; both are read as the day they showed.
 */
const LEGACY = {
  view: ['miniworld.view.v2', 'miniworld.view.v1'],
  bookmarks: ['miniworld.bookmarks.v2', 'miniworld.bookmarks.v1'],
} as const;
const readLatest = (key: string, legacy: readonly string[]) =>
  [key, ...legacy].map(read).find((v) => v !== undefined);

export const MAX_BOOKMARKS = 200;

function read(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be full or blocked; saved state is a convenience only.
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

export function validCamera(v: unknown): CameraState | undefined {
  if (!isObj(v)) return undefined;
  const { lat, lon, altitudeKm, heading, tilt } = v;
  if (!isNum(lat) || !isNum(lon) || !isNum(altitudeKm) || !isNum(heading) || !isNum(tilt))
    return undefined;
  if (Math.abs(lat) > 90 || altitudeKm <= 0) return undefined;
  return { lat, lon, altitudeKm, heading, tilt };
}

export function loadSettings(defaults: Settings): Settings {
  const v = read(KEYS.settings);
  if (!isObj(v)) return defaults;
  return {
    language: v.language === 'en' || v.language === 'de' ? v.language : defaults.language,
    timelineExpanded: isBool(v.timelineExpanded) ? v.timelineExpanded : defaults.timelineExpanded,
    trueTimeScale: isBool(v.trueTimeScale) ? v.trueTimeScale : defaults.trueTimeScale,
    showStats: isBool(v.showStats) ? v.showStats : defaults.showStats,
    lensStrength: lensStrengthOf(v, defaults.lensStrength),
    lensHintSeen: isBool(v.lensHintSeen) ? v.lensHintSeen : defaults.lensHintSeen,
    backStep: stepOf(v.backStep, defaults.backStep),
    forwardStep: stepOf(v.forwardStep, defaults.forwardStep),
  };
}

/** The saved lens strength, or the earlier on/off setting read as 100 or 0. */
function lensStrengthOf(v: Record<string, unknown>, fallback: number): number {
  const p = v.lensStrength;
  if (typeof p === 'number' && Number.isInteger(p) && p >= 0 && p <= 200) return p;
  if (isBool(v.historyLens)) return v.historyLens ? 100 : 0;
  return fallback;
}

export function saveSettings(s: Settings): void {
  write(KEYS.settings, s);
}

export function loadView(): ViewState | undefined {
  const v = readLatest(KEYS.view, LEGACY.view);
  if (!isObj(v)) return undefined;
  const camera = validCamera(v.camera);
  const day = dayOf(v);
  if (!camera || day === undefined) return undefined;
  const speedMode = isSpeedMode(v.speedMode) ? v.speedMode : 'regular';
  const playState: PlayState = 'paused'; // never resume running unattended
  return { day, camera, playState, speedMode };
}

/** A record's day, or for version 2 the day of its clock time at the old even rate. */
function dayOf(v: Record<string, unknown>): number | undefined {
  if (isNum(v.day)) return Math.floor(v.day);
  if (isNum(v.ms) && v.ms >= 0) return TIMELINE_START + Math.floor((v.ms * 146097) / 960000);
  return undefined;
}

export function saveView(view: ViewState): void {
  write(KEYS.view, view);
}

export function loadBookmarks(): Bookmark[] {
  const v = readLatest(KEYS.bookmarks, LEGACY.bookmarks);
  if (!Array.isArray(v)) return [];
  const out: Bookmark[] = [];
  for (const b of v) {
    if (!isObj(b)) continue;
    const camera = validCamera(b.camera);
    const day = dayOf(b);
    if (!camera || typeof b.id !== 'string' || typeof b.name !== 'string' || day === undefined)
      continue;
    out.push({ id: b.id, name: b.name.slice(0, 120), day, camera });
  }
  return out.slice(0, MAX_BOOKMARKS);
}

export function saveBookmarks(list: Bookmark[]): void {
  write(KEYS.bookmarks, list.slice(0, MAX_BOOKMARKS));
}
