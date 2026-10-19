import { beforeEach, describe, expect, it } from 'vitest';
import { TIMELINE_START } from '../time/calendar.ts';
import {
  loadBookmarks,
  loadSettings,
  loadView,
  saveBookmarks,
  saveView,
  type Settings,
} from './storage.ts';

class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}

const defaults: Settings = {
  language: 'en',
  timelineExpanded: false,
  trueTimeScale: false,
  showStats: false,
  lensStrength: 100,
};

describe('saved state', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as { localStorage?: unknown }).localStorage = storage;
  });

  it('falls back to defaults for missing or broken values', () => {
    expect(loadSettings(defaults)).toEqual(defaults);
    storage.setItem('miniworld.settings.v1', '{not json');
    expect(loadSettings(defaults)).toEqual(defaults);
    storage.setItem(
      'miniworld.settings.v1',
      JSON.stringify({ language: 'fr', timelineExpanded: true }),
    );
    expect(loadSettings(defaults)).toEqual({ ...defaults, timelineExpanded: true });
  });

  it('reads the lens strength, and the earlier on/off setting as 100 or 0', () => {
    const at = (v: object) => {
      storage.setItem('miniworld.settings.v1', JSON.stringify(v));
      return loadSettings(defaults).lensStrength;
    };
    expect(at({ lensStrength: 150 })).toBe(150);
    expect(at({ lensStrength: 250 })).toBe(100);
    expect(at({ lensStrength: 12.5 })).toBe(100);
    expect(at({ historyLens: false })).toBe(0);
    expect(at({ historyLens: true })).toBe(100);
    expect(at({ lensStrength: 30, historyLens: false })).toBe(30);
  });

  it('restores a playing view as history paused, at its day', () => {
    const camera = { lat: 41.9, lon: 12.5, altitudeKm: 50, heading: 0, tilt: 30 };
    saveView({ day: -730, camera, playState: 'playing', speedMode: 'snail' });
    expect(loadView()).toEqual({ day: -730, camera, playState: 'paused', speedMode: 'snail' });
    storage.setItem('miniworld.view.v3', JSON.stringify({ day: 'x', camera }));
    expect(loadView()).toBeUndefined();
  });

  it('converts a version 2 view and bookmarks from their clock time at 25 years a minute', () => {
    const camera = { lat: 0, lon: 0, altitudeKm: 1000, heading: 0, tilt: 0 };
    // 16 minutes at the old rate is 400 years, exactly 146,097 days.
    storage.setItem('miniworld.view.v2', JSON.stringify({ ms: 16 * 60000, camera }));
    storage.setItem(
      'miniworld.bookmarks.v2',
      JSON.stringify([{ id: 'a', name: 'Rome', ms: 16 * 60000, camera }]),
    );
    const day = TIMELINE_START + 146097;
    expect(loadView()).toEqual({ day, camera, playState: 'paused', speedMode: 'regular' });
    expect(loadBookmarks()).toEqual([{ id: 'a', name: 'Rome', day, camera }]);
  });

  it('converts a version 1 view and bookmarks from their day', () => {
    const camera = { lat: 0, lon: 0, altitudeKm: 1000, heading: 0, tilt: 0 };
    storage.setItem('miniworld.view.v1', JSON.stringify({ day: 1, camera, speedLog2: 3 }));
    storage.setItem(
      'miniworld.bookmarks.v1',
      JSON.stringify([{ id: 'a', name: 'Rome', day: 1, camera }]),
    );
    expect(loadView()).toEqual({ day: 1, camera, playState: 'paused', speedMode: 'regular' });
    expect(loadBookmarks()).toEqual([{ id: 'a', name: 'Rome', day: 1, camera }]);
  });

  it('keeps only valid bookmarks', () => {
    const camera = { lat: 0, lon: 0, altitudeKm: 1000, heading: 0, tilt: 0 };
    saveBookmarks([{ id: 'a', name: 'Rome', day: 1000, camera }]);
    storage.setItem(
      'miniworld.bookmarks.v3',
      JSON.stringify([...JSON.parse(storage.getItem('miniworld.bookmarks.v3')!), { id: 'b' }]),
    );
    expect(loadBookmarks()).toEqual([{ id: 'a', name: 'Rome', day: 1000, camera }]);
  });
});
