import { beforeEach, describe, expect, it } from 'vitest';
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
  slowWhenZoomed: true,
  showStats: false,
  historyLens: true,
  lensHintSeen: false,
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

  it('restores a playing view as history paused', () => {
    const camera = { lat: 41.9, lon: 12.5, altitudeKm: 50, heading: 0, tilt: 30 };
    saveView({ day: -700000, camera, playState: 'playing', speedLog2: -2.5 });
    expect(loadView()).toEqual({ day: -700000, camera, playState: 'paused', speedLog2: -2.5 });
    storage.setItem('miniworld.view.v1', JSON.stringify({ day: 1.5, camera }));
    expect(loadView()).toBeUndefined();
  });

  it('keeps only valid bookmarks', () => {
    const camera = { lat: 0, lon: 0, altitudeKm: 1000, heading: 0, tilt: 0 };
    saveBookmarks([{ id: 'a', name: 'Rome', day: 1, camera }]);
    storage.setItem(
      'miniworld.bookmarks.v1',
      JSON.stringify([...JSON.parse(storage.getItem('miniworld.bookmarks.v1')!), { id: 'b' }]),
    );
    expect(loadBookmarks()).toEqual([{ id: 'a', name: 'Rome', day: 1, camera }]);
  });
});
