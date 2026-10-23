// Content stage of the data build: the eras and cards are
// validated before anything is built, and written with the startup index per
// language at the end (spec milestone 1, section 10; milestone 2, section 18).

import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { EventEntry, SourceInfo, StartupIndex } from '../../../app/src/content/types.ts';
import { LANGUAGES, type Language } from '../../../app/src/i18n/messages.ts';
import { TIMELINE_START } from '../../../app/src/time/calendar.ts';
import {
  checkEraList,
  erasForLanguage,
  parseEra,
  readLanes,
  validateEras,
  type CuratedEra,
  type CuratedEras,
} from '../lib/eras.ts';
import { buildAnimals } from '../lib/animals.ts';
import { buildSiteCards } from '../lib/siteCards.ts';
import { farmingEventIds } from './farming.ts';
import { WILD_GROUPS } from '../../../app/src/world/wildlife.ts';
import { regionGrid } from '../lib/regions.ts';
import { ROOT, type BuildContext, type WriteContext } from './context.ts';

export interface Content {
  eras: CuratedEras;
  /** Region ids of vocab/regions.yaml, in order. */
  regions: string[];
  animals: ReturnType<typeof buildAnimals>['animals'];
  siteCards: ReturnType<typeof buildSiteCards>['cards'];
}

/** Reads and validates the curated content; fails the build on any error. */
export function validateContent(ctx: BuildContext): Content {
  const { cutoffDay, fail } = ctx;
  const curated = join(ROOT, 'data/curated');
  const read = (path: string) => readFileSync(join(curated, path), 'utf8');
  const laneVocab = readLanes(read('vocab/regions.yaml'), read('vocab/lanes.yaml'));
  if (laneVocab.errors.length) fail(laneVocab.errors.join('\n'));
  const sources = parseYaml(read('sources.yaml'), { schema: 'failsafe' }) as Parameters<
    typeof parseEra
  >[2]['sources'];
  const eraErrors: string[] = [];
  const eraList: CuratedEra[] = [];
  const eraDir = join(curated, 'eras');
  for (const f of (existsSync(eraDir) ? readdirSync(eraDir) : [])
    .filter((n) => n.endsWith('.md'))
    .sort()) {
    const r = parseEra(f, read(`eras/${f}`), {
      lanes: new Set(laneVocab.lanes.map((l) => l.id)),
      sources,
      startDay: TIMELINE_START,
      cutoffDay,
    });
    eraErrors.push(...r.errors);
    if (r.era) eraList.push(r.era);
  }
  eraErrors.push(...validateEras(eraList));
  const lanePosition = new Map(laneVocab.lanes.map((l, i) => [l.id, i]));
  // Chronological within each lane, lanes from top to bottom.
  eraList.sort(
    (a, b) =>
      lanePosition.get(a.lane)! - lanePosition.get(b.lane)! ||
      a.fromDay - b.fromDay ||
      a.toDay - b.toDay ||
      (a.id < b.id ? -1 : 1),
  );
  if (!eraErrors.length)
    eraErrors.push(
      ...checkEraList(
        readFileSync(join(ROOT, 'docs/spec/eras.md'), 'utf8'),
        laneVocab.lanes,
        eraList,
      ),
    );
  if (eraErrors.length) fail(eraErrors.join('\n'));
  const eras: CuratedEras = { lanes: laneVocab.lanes, eras: eraList };
  const regions = laneVocab.regions.map((r) => r.id);

  const animalBuild = buildAnimals({
    curated: join(ROOT, 'data/curated'),
    species: new Set(WILD_GROUPS.map((g) => g.species)),
  });
  if (animalBuild.errors.length) fail(animalBuild.errors.join('\n'));
  const anchorList = JSON.parse(read('anchors.json')) as { anchors: { id: string }[] };
  const siteBuild = buildSiteCards({
    curated: join(ROOT, 'data/curated'),
    anchors: new Set(anchorList.anchors.map((a) => a.id)),
    arrivals: new Set(
      (JSON.parse(read('arrivals.json')) as { points: { id: string; continent?: string }[] }).points
        .filter((p) => p.continent)
        .map((p) => p.id),
    ),
    farming: new Set(farmingEventIds(read('neolithic.json'))),
  });
  if (siteBuild.errors.length) fail(siteBuild.errors.join('\n'));
  return {
    eras,
    regions,
    animals: animalBuild.animals,
    siteCards: siteBuild.cards,
  };
}

/** Writes the cards and the startup index per language; returns the index files. */
export function buildContent(
  ctx: WriteContext,
  content: Content,
  climate: { seaLevel: StartupIndex['seaLevel']; iceDays: number[] },
  wildlife: string[],
  wildlifeCamps: [number, number, number, number][],
  /** The events of the events dialog, named in every language (milestone-1 section 8.3). */
  events: {
    id: string;
    kind: EventEntry['kind'];
    title: Record<Language, string>;
    day: number;
    lat: number;
    lon: number;
    card: string;
  }[] = [],
): Record<Language, string> {
  const { output, log } = ctx;
  const sources: SourceInfo[] = ctx.registry
    .filter((s) => !(ctx.fixture && s.id === 'etopo-2022'))
    .map((s) => ({
      id: s.id,
      title: s.title,
      licence: s.licence,
      citation: s.citation,
      url: s.url,
    }));

  log(`${content.eras.eras.length} eras in ${content.eras.lanes.length} lanes`);
  const animalFiles = content.animals.map((a) => ({
    a,
    text: Object.fromEntries(
      LANGUAGES.map((lang) => [lang, output.writeJson(`animals/${a.id}-${lang}`, a.text[lang])]),
    ) as Record<Language, string>,
  }));
  log(`${animalFiles.length} animal cards`);
  const siteFiles = content.siteCards.map((c) => ({
    c,
    text: Object.fromEntries(
      LANGUAGES.map((lang) => [lang, output.writeJson(`sites/${c.id}-${lang}`, c.text[lang])]),
    ) as Record<Language, string>,
  }));
  log(`${siteFiles.length} site cards`);

  const grid = regionGrid(content.regions);
  const index = {} as Record<Language, string>;
  for (const language of LANGUAGES) {
    const idx: StartupIndex = {
      language,
      ...erasForLanguage(content.eras, language),
      seaLevel: climate.seaLevel,
      iceSlices: climate.iceDays,
      regions: grid,
      sources,
      events: [...events]
        .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id))
        .map((e) => ({ ...e, title: e.title[language] })),
      people: [],
      wildlife,
      wildlifeCamps,
      animals: animalFiles.map(({ a, text }) => ({
        id: a.id,
        title: a.text[language].title,
        text: text[language],
      })),
      siteCards: siteFiles.map(({ c, text }) => ({
        id: c.id,
        title: c.text[language].title,
        text: text[language],
      })),
    };
    index[language] = output.writeJson(`index-${language}`, idx);
  }
  return index;
}
