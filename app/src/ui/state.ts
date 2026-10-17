// State the interface shows, kept by the app controller.

import type { SourceInfo } from '../content/types.ts';
import type { PlayState } from '../time/clock.ts';
import type { Bookmark, Settings, Tier } from './storage.ts';

export type Panel = 'none' | 'settings' | 'bookmarks' | 'about';

export interface UiState {
  ready: boolean;
  preparing: boolean;
  error: string | undefined;
  day: number;
  playState: PlayState;
  speedIndex: number;
  yearsPerMinute: number;
  scrubbing: boolean;
  panel: Panel;
  settings: Settings;
  tier: Tier;
  autoTier: Tier;
  bookmarks: Bookmark[];
  follow: boolean;
  isPhone: boolean;
  stressScene: boolean;
  stats: { fps: number; avg: number; p99: number; calls: number; triangles: number; scale: number };
  fixture: boolean;
  version: string;
  cutoffDay: number;
  sources: SourceInfo[];
}

export interface Actions {
  play(): void;
  pauseHistory(): void;
  freeze(): void;
  setSpeed(index: number): void;
  setPanel(panel: Panel): void;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  addBookmark(): void;
  goToBookmark(id: string): void;
  renameBookmark(id: string, name: string): void;
  deleteBookmark(id: string): void;
  resetCamera(): void;
  /** Positive degrees tilt towards the horizon. */
  tiltCamera(degrees: number): void;
  zoomTimeline(factor: number): void;
  followPlayhead(): void;
  toggleLanes(): void;
  remeasure(): void;
  saveReport(): void;
  attachTimeline(canvas: HTMLCanvasElement | null): void;
}
