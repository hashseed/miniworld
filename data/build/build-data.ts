// Offline data build (spec milestone 1, section 10): reads only from
// data/sources and data/curated, validates everything, and writes the
// manifest, the startup index per language and content-hashed chunks to
// app/public/data. Each stage lives in data/build/stages/.
//
// Usage: node data/build/build-data.ts [--fixture] [--max-level N]

import { join } from 'node:path';
import { LANGUAGES } from '../../app/src/i18n/messages.ts';
import { Output } from './lib/output.ts';
import { buildClimate } from './stages/climate.ts';
import { buildContent, validateContent } from './stages/content.ts';
import { createContext, ROOT, type WriteContext } from './stages/context.ts';
import { buildHumankind } from './stages/humankind.ts';
import { buildLensStage } from './stages/lens.ts';
import { writeManifest } from './stages/manifest.ts';
import { buildMap, buildTerrain, buildWildlifeMasks, placeLandmarks } from './stages/terrain.ts';

const OUT = join(ROOT, 'app/public/data');

async function main(args: string[]): Promise<void> {
  const base = createContext(args);
  // Everything curated is checked before the old output is replaced.
  const content = validateContent(base);
  const ctx: WriteContext = { ...base, output: new Output(OUT) };
  const { output, log } = ctx;

  const map = buildMap(ctx);
  placeLandmarks(ctx, map, content.landmarks);
  const wildlife = buildWildlifeMasks(ctx, map);
  const terrain = buildTerrain(ctx, map);
  const climate = buildClimate(ctx, map);
  const tree = buildHumankind(ctx, map, climate);
  const lens = buildLensStage(ctx);
  const index = buildContent(ctx, content, climate, wildlife);
  writeManifest(ctx, { index, lens, terrain, climate, tree });

  await output.finish();
  const brotliKb = (files: string[]) =>
    (files.reduce((n, f) => n + (output.sizes.get(f) ?? 0), 0) / 1000).toFixed(0);
  log(
    `climate slices ${brotliKb(climate.climateFiles)} KB Brotli, ` +
      `foliage slices ${brotliKb(climate.foliageFiles)} KB`,
  );
  const mb = (n: number) => (n / 1e6).toFixed(1);
  log(
    `${output.files} files, ${mb(output.rawBytes)} MB raw, ${mb(output.compressedBytes)} MB Brotli → ${OUT}`,
  );
  for (const language of LANGUAGES)
    log(`index ${language}: ${(output.sizes.get(index[language])! / 1000).toFixed(0)} KB Brotli`);
}

await main(process.argv.slice(2));
