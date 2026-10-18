// Content stage of the data build: the eras, landmarks and vignettes are
// validated before anything is built, and written with the startup index per
// language at the end (spec milestone 1, section 10; milestone 2, section 18).

import { join } from 'node:path';
import type { SourceInfo, StartupIndex } from '../../../app/src/content/types.ts';
import { LANGUAGES, type Language } from '../../../app/src/i18n/messages.ts';
import { TIMELINE_START } from '../../../app/src/time/calendar.ts';
import { AXIS_K_YEARS } from '../../../app/src/time/axis.ts';
import { erasForLanguage, validateEras, type CuratedEras } from '../lib/eras.ts';
import { buildLandmarks } from '../lib/landmarks.ts';
import { regionGrid } from '../lib/regions.ts';
import { buildVignettes } from '../lib/vignettes.ts';
import { readVocab, type Vocab } from '../lib/vocab.ts';
import { ROOT, type BuildContext, type WriteContext } from './context.ts';

export interface Content {
  eras: CuratedEras;
  landmarks: ReturnType<typeof buildLandmarks>['landmarks'];
  vignettes: ReturnType<typeof buildVignettes>['vignettes'];
}

/** Reads and validates the curated content; fails the build on any error. */
export function validateContent(ctx: BuildContext): Content {
  const { cutoffDay, fail } = ctx;
  const eras = ctx.curated<CuratedEras>('eras.json');
  const eraErrors = validateEras(eras, TIMELINE_START, cutoffDay);
  if (eraErrors.length) fail(eraErrors.join('\n'));

  const vocab = ((): Vocab => {
    try {
      return readVocab(join(ROOT, 'data/curated/vocab'));
    } catch (err) {
      return fail((err as Error).message);
    }
  })();
  const landmarkBuild = buildLandmarks({
    curated: join(ROOT, 'data/curated'),
    lanes: new Set(eras.lanes.map((l) => l.id)),
    vocab,
    startDay: TIMELINE_START,
    cutoffDay,
  });
  if (landmarkBuild.errors.length) fail(landmarkBuild.errors.join('\n'));
  const vignetteBuild = buildVignettes({
    curated: join(ROOT, 'data/curated'),
    lanes: new Set(eras.lanes.map((l) => l.id)),
    vocab,
    startDay: TIMELINE_START,
    cutoffDay,
    landmarkParts: new Map(landmarkBuild.landmarks.map((l) => [l.structure.id, l.parts])),
  });
  if (vignetteBuild.errors.length) fail(vignetteBuild.errors.join('\n'));
  for (const l of landmarkBuild.landmarks)
    for (const p of l.structure.parts)
      if (p.build && !vignetteBuild.vignettes.some((v) => v.structure.id === p.build!.vignette))
        fail(
          `landmarks/${l.structure.id}.md: build of ${p.name} names unknown vignette "${p.build.vignette}"`,
        );
  return { eras, landmarks: landmarkBuild.landmarks, vignettes: vignetteBuild.vignettes };
}

/** Writes the vignettes, landmarks and the startup index per language; returns the index files. */
export function buildContent(
  ctx: WriteContext,
  content: Content,
  climate: { seaLevel: StartupIndex['seaLevel']; iceDays: number[] },
): Record<Language, string> {
  const { output, log, cutoffDay } = ctx;
  const sources: SourceInfo[] = ctx.registry
    .filter((s) => !(ctx.fixture && s.id === 'etopo-2022'))
    .map((s) => ({
      id: s.id,
      title: s.title,
      licence: s.licence,
      citation: s.citation,
      url: s.url,
    }));

  const vignetteFiles = content.vignettes.map((v) => ({
    v,
    structure: output.writeJson(`vignettes/${v.structure.id}`, v.structure),
    text: Object.fromEntries(
      LANGUAGES.map((l) => [l, output.writeJson(`vignettes/${v.structure.id}-${l}`, v.text[l])]),
    ) as Record<Language, string>,
  }));
  log(`${vignetteFiles.length} vignettes`);
  const landmarkFiles = content.landmarks.map((l) => ({
    l,
    structure: output.writeJson(`landmarks/${l.structure.id}`, l.structure),
    text: Object.fromEntries(
      LANGUAGES.map((lang) => [
        lang,
        output.writeJson(`landmarks/${l.structure.id}-${lang}`, l.text[lang]),
      ]),
    ) as Record<Language, string>,
  }));
  log(`${landmarkFiles.length} landmarks`);

  const index = {} as Record<Language, string>;
  for (const language of LANGUAGES) {
    const idx: StartupIndex = {
      language,
      ...erasForLanguage(content.eras, language, TIMELINE_START, cutoffDay),
      axisYears: AXIS_K_YEARS,
      seaLevel: climate.seaLevel,
      iceSlices: climate.iceDays,
      regions: regionGrid(),
      sources,
      events: [],
      people: [],
      vignettes: vignetteFiles.map(({ v, structure, text }) => ({
        id: v.structure.id,
        fromDay: v.structure.fromDay,
        toDay: v.structure.toDay,
        fromApproximate: v.fromApproximate,
        toApproximate: v.toApproximate,
        icon: v.structure.icon,
        title: v.text[language].title,
        structure,
        text: text[language],
      })),
      landmarks: landmarkFiles.map(({ l, structure, text }) => ({
        id: l.structure.id,
        fromDay: l.structure.fromDay,
        toDay: l.structure.toDay,
        fromApproximate: l.fromApproximate,
        toApproximate: false,
        icon: l.structure.icon,
        title: l.text[language].title,
        structure,
        text: text[language],
      })),
    };
    index[language] = output.writeJson(`index-${language}`, idx);
  }
  return index;
}
