// Manifest and startup index (spec milestone 1, sections 10.1 to 10.3).

import type { Language } from '../i18n/messages.ts';

export interface LocalisedText {
  en: string;
  de: string;
}

export interface Manifest {
  version: string;
  buildId: string;
  /** True when built from the synthetic test fixture instead of real data. */
  fixture: boolean;
  /** Content cutoff ("today"), as a day number. */
  cutoffDay: number;
  timelineStartDay: number;
  languages: Language[];
  /** Start day of each time window; window i runs to windows[i + 1]. */
  windows: number[];
  /** Startup index file per language. */
  index: Record<Language, string>;
  /** The history lens warp grids (globe/lens.ts), loaded with the startup index. */
  lens: { file: string; version: string; exponent: number };
  layers: Record<string, LayerManifest>;
}

export interface LayerManifest {
  /** Quadtree level(s) the layer is chunked at. */
  minLevel: number;
  maxLevel: number;
  timed: boolean;
  /** Chunk files listed directly, by chunk key (see chunkKey). */
  chunks: Record<string, string>;
  /** Part files listing the chunks below a level-2 tile, by "face/path". */
  parts: Record<string, string>;
  /** Tiles with no file because they are entirely deep ocean (terrain only). */
  deep?: string[];
}

export interface PartFile {
  chunks: Record<string, string>;
  deep?: string[];
}

export interface EraRecord {
  id: string;
  lane: string;
  fromDay: number;
  toDay: number;
  fromApproximate: boolean;
  toApproximate: boolean;
  color: string;
  label: string;
}

export interface SourceInfo {
  id: string;
  title: string;
  licence: string;
  citation: string;
  url: string;
}

export interface StartupIndex {
  language: Language;
  lanes: { id: string; label: string }[];
  eras: EraRecord[];
  watchTable: { startYear: number; stepYears: number; seconds: number[] };
  seaLevel: { startDay: number; stepDays: number; metres: number[] };
  /** Days of the ice reconstruction's time slices, ascending. */
  iceSlices: number[];
  regions: { cols: number; rows: number; lanes: string[]; cells: string };
  sources: SourceInfo[];
  events: unknown[];
  people: unknown[];
}

export function chunkKey(place: string, window: string, language: string): string {
  return `${place}/${window}/${language}`;
}
