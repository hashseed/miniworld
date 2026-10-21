// State the interface shows, kept by the app controller.

import type { EventEntry, SourceInfo } from '../content/types.ts';
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
  /** A site card (humankind.md section 8.3): the text carries its own dates, so no date line. */
  site?: boolean;
}

/**
 * State that changes while history plays, every frame or every half second,
 * kept apart so only the date readout, play controls and stats re-render.
 */
import type { IntroPhase } from './LoadingScreen.tsx';

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
  /** The loading screen's phase, and how far down the window its caption stands (milestone-1 section 8.6). */
  intro: IntroPhase;
  introCaptionY: number;
  /** The small globe's radius on screen, and whether the globe itself is drawn yet; until then a still picture of it stands in. */
  introRadius: number;
  introGlobe: boolean;
  /** The share of the first view loaded so far, 0 to 1, for the loading screen. */
  loaded: number;
  error: string | undefined;
  panel: Panel;
  settings: Settings;
  bookmarks: Bookmark[];
  /** The events of the events dialog, in chronological order (milestone-1 section 8.3). */
  events: EventEntry[];
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
  /** Flies to an event of the events dialog and sets the clock to its date. */
  goToEvent(id: string): void;
  /** The name of the region (timeline lane) a place lies in, in the current language. */
  regionOf(lat: number, lon: number): string;
  resetCamera(): void;
  /** Jumps back (-1) or forward (1) ten seconds of watching time, played fast (section 3.3). */
  jump(dir: -1 | 1): void;
  followPlayhead(): void;
  toggleLanes(): void;
  toggleMinimized(): void;
  saveReport(): void;
  attachTimeline(canvas: HTMLCanvasElement | null): void;
}
