// Saved state in local storage (spec milestone 1, section 9). Every value is
// versioned and validated; anything unreadable is replaced by defaults.

import type { Language } from '../i18n/messages.ts';
import type { PlayState } from '../time/clock.ts';

export type QualitySetting = 'auto' | 'high' | 'medium' | 'low';
export type Tier = 'high' | 'medium' | 'low';

export interface Settings {
  language: Language;
  quality: QualitySetting;
  /** Timeline shows every lane instead of only the region under the globe centre. */
  timelineExpanded: boolean;
  trueTimeScale: boolean;
  slowWhenZoomed: boolean;
  showStats: boolean;
}

export interface CameraState {
  lat: number;
  lon: number;
  altitudeKm: number;
  heading: number;
  tilt: number;
}

export interface ViewState {
  day: number;
  camera: CameraState;
  playState: PlayState;
  speedIndex: number;
}

export interface Bookmark {
  id: string;
  name: string;
  day: number;
  camera: CameraState;
}

export interface PerfResult {
  tier: Tier;
  device: string;
}

const KEYS = {
  settings: 'miniworld.settings.v1',
  view: 'miniworld.view.v1',
  bookmarks: 'miniworld.bookmarks.v1',
  perf: 'miniworld.perf.v1',
} as const;

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
    quality: ['auto', 'high', 'medium', 'low'].includes(v.quality as string)
      ? (v.quality as QualitySetting)
      : defaults.quality,
    timelineExpanded: isBool(v.timelineExpanded) ? v.timelineExpanded : defaults.timelineExpanded,
    trueTimeScale: isBool(v.trueTimeScale) ? v.trueTimeScale : defaults.trueTimeScale,
    slowWhenZoomed: isBool(v.slowWhenZoomed) ? v.slowWhenZoomed : defaults.slowWhenZoomed,
    showStats: isBool(v.showStats) ? v.showStats : defaults.showStats,
  };
}

export function saveSettings(s: Settings): void {
  write(KEYS.settings, s);
}

export function loadView(): ViewState | undefined {
  const v = read(KEYS.view);
  if (!isObj(v)) return undefined;
  const camera = validCamera(v.camera);
  if (!camera || !isNum(v.day) || !Number.isInteger(v.day) || !isNum(v.speedIndex))
    return undefined;
  const playState: PlayState = v.playState === 'frozen' ? 'frozen' : 'historyPaused'; // never resume running unattended
  return { day: v.day, camera, playState, speedIndex: v.speedIndex };
}

export function saveView(view: ViewState): void {
  write(KEYS.view, view);
}

export function loadBookmarks(): Bookmark[] {
  const v = read(KEYS.bookmarks);
  if (!Array.isArray(v)) return [];
  const out: Bookmark[] = [];
  for (const b of v) {
    if (!isObj(b)) continue;
    const camera = validCamera(b.camera);
    if (!camera || typeof b.id !== 'string' || typeof b.name !== 'string' || !isNum(b.day))
      continue;
    out.push({ id: b.id, name: b.name.slice(0, 120), day: Math.floor(b.day), camera });
  }
  return out.slice(0, MAX_BOOKMARKS);
}

export function saveBookmarks(list: Bookmark[]): void {
  write(KEYS.bookmarks, list.slice(0, MAX_BOOKMARKS));
}

export function loadPerf(): PerfResult | undefined {
  const v = read(KEYS.perf);
  if (!isObj(v)) return undefined;
  if (!['high', 'medium', 'low'].includes(v.tier as string) || typeof v.device !== 'string')
    return undefined;
  return { tier: v.tier as Tier, device: v.device };
}

export function savePerf(p: PerfResult): void {
  write(KEYS.perf, p);
}
