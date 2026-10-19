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
  /** Global climate slices (ice and deserts): their days, ascending, and files. */
  climate: { days: number[]; files: string[] };
  /** Global foliage slices (spec foliage.md): the same days as the climate slices, and files. */
  foliage: { days: number[]; files: string[] };
  /** Tree of humankind chunks (spec humankind.md, section 8): one file per time window, null where empty; absent on the fixture map. */
  tree?: { files: (string | null)[] };
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
  seaLevel: { startDay: number; stepDays: number; metres: number[] };
  /** Days of the climate slices (ice and deserts), ascending, as in the manifest. */
  iceSlices: number[];
  regions: { cols: number; rows: number; lanes: string[]; cells: string };
  sources: SourceInfo[];
  events: unknown[];
  people: unknown[];
  /** Vignette records (spec milestone 2, section 18.4). */
  vignettes: VignetteEntry[];
  /** Landmark records (giza.md section 11), in the same form. */
  landmarks: VignetteEntry[];
  /** Ground mask of each wildlife group, in the order of data/curated/wildlife.json (wildlife.md section 4). */
  wildlife: string[];
  /**
   * Every place a camp of the tree of humankind stands near a walking wildlife group, as
   * [lat, lon] in whole microdegrees and the days it stands from and to (to NEVER, -1, for
   * one that still stands), so the animals keep clear of it (wildlife.md section 4).
   */
  wildlifeCamps?: [number, number, number, number][];
  /** Card of each wildlife species: title in the index's language and its text file (wildlife.md section 8). */
  animals: AnimalEntry[];
}

export interface AnimalEntry {
  /** The species, as in data/curated/wildlife.json. */
  id: string;
  title: string;
  /** Text file in the index's language. */
  text: string;
}

export interface VignetteEntry {
  id: string;
  fromDay: number;
  /** Day after the last day of the span. */
  toDay: number;
  fromApproximate: boolean;
  toApproximate: boolean;
  icon: string;
  /** Title in the index's language, for the marker's label. */
  title: string;
  /** Structure file, the same for every language. */
  structure: string;
  /** Text file in the index's language. */
  text: string;
}

export function chunkKey(place: string, window: string, language: string): string {
  return `${place}/${window}/${language}`;
}
