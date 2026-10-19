// State the interface shows, kept by the app controller.

import type { SourceInfo } from '../content/types.ts';
import type { PlayState } from '../time/clock.ts';
import type { SpeedMode } from '../time/speed.ts';
import type { Bookmark, Settings } from './storage.ts';

export type Panel = 'none' | 'settings' | 'bookmarks' | 'about' | 'vignette';

/** The vignette card (spec milestone 2, section 11); its text arrives when the card opens. */
export interface VignetteCard {
  id: string;
  title: string;
  fromDay: number;
  /** Day after the last day of the span. */
  toDay: number;
  fromApproximate: boolean;
  toApproximate: boolean;
  text?: { title: string; body: string; learnMore: string };
  failed?: boolean;
  /**
   * An animal's card (wildlife.md section 8): which ends of its group's span
   * the date line shows, none for a group shown at every date.
   */
  animal?: { from: boolean; to: boolean };
}

/**
 * State that changes while history plays, every frame or every half second,
 * kept apart so only the date readout, play controls and stats re-render.
 */
export interface HotState {
  day: number;
  playState: PlayState;
  speedMode: SpeedMode;
  yearsPerMinute: number;
  scrubbing: boolean;
  /** -1 or 1 while a jump back or forward is under way, else 0. */
  jumping: -1 | 0 | 1;
  stats: { fps: number; avg: number; p99: number; calls: number; triangles: number; scale: number };
}

/** State that changes only on the viewer's actions or as data arrives. */
export interface UiState {
  ready: boolean;
  /** The share of the first view loaded so far, 0 to 1, for the loading screen (milestone-1 section 8.6). */
  loaded: number;
  error: string | undefined;
  panel: Panel;
  settings: Settings;
  bookmarks: Bookmark[];
  follow: boolean;
  isPhone: boolean;
  stressScene: boolean;
  fixture: boolean;
  version: string;
  cutoffDay: number;
  sources: SourceInfo[];
  vignette: VignetteCard | undefined;
}

export interface Actions {
  play(): void;
  pause(): void;
  setSpeed(mode: SpeedMode): void;
  setPanel(panel: Panel): void;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  addBookmark(): void;
  goToBookmark(id: string): void;
  renameBookmark(id: string, name: string): void;
  deleteBookmark(id: string): void;
  resetCamera(): void;
  /** Jumps back (-1) or forward (1) ten seconds of watching time, played fast (section 3.3). */
  jump(dir: -1 | 1): void;
  followPlayhead(): void;
  toggleLanes(): void;
  saveReport(): void;
  attachTimeline(canvas: HTMLCanvasElement | null): void;
}
