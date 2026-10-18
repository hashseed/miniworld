// State the interface shows, kept by the app controller.

import type { SourceInfo } from '../content/types.ts';
import type { PlayState } from '../time/clock.ts';
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
}

/**
 * State that changes while history plays, every frame or every half second,
 * kept apart so only the date readout, play controls and stats re-render.
 */
export interface HotState {
  day: number;
  playState: PlayState;
  /** Base-2 logarithm of the speed multiplier, −6 to 6. */
  speedLog2: number;
  yearsPerMinute: number;
  scrubbing: boolean;
  stats: { fps: number; avg: number; p99: number; calls: number; triangles: number; scale: number };
}

/** State that changes only on the viewer's actions or as data arrives. */
export interface UiState {
  ready: boolean;
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
  /** Sets the speed slider; `release` snaps it to ×1 when close. */
  setSpeed(log2: number, release?: boolean): void;
  setPanel(panel: Panel): void;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  addBookmark(): void;
  goToBookmark(id: string): void;
  renameBookmark(id: string, name: string): void;
  deleteBookmark(id: string): void;
  resetCamera(): void;
  /** Positive degrees tilt towards the horizon. */
  tiltCamera(degrees: number): void;
  followPlayhead(): void;
  toggleLanes(): void;
  closeLensHint(): void;
  saveReport(): void;
  attachTimeline(canvas: HTMLCanvasElement | null): void;
}
