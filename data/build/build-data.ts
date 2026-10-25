// Offline data build (spec milestone 1, section 10): reads only from
// data/sources and data/curated, validates everything, and writes the
// manifest, the startup index per language and content-hashed chunks to
// app/public/data. Each stage lives in data/build/stages/.
//
// Usage: node data/build/build-data.ts [--fixture] [--max-level N] [--no-cache | --clean]
//   --no-cache (or --fresh) reads and writes no cache; --clean forgets the caches first.

// The world's tables from data/curated/, before anything asks the world (app/src/world/tables.ts).
import './lib/worldTables.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGES } from '../../app/src/i18n/messages.ts';
import { chunkSizeProblems, largestFiles } from './lib/chunkSize.ts';
import { DrawnTiles } from './lib/drawnGround.ts';
import { Output } from './lib/output.ts';
import { StageCache } from './lib/stageCache.ts';
import { buildClimate } from './stages/climate.ts';
import { buildContent, validateContent } from './stages/content.ts';
import { buildFarming, farmingEvents } from './stages/farming.ts';
import { createContext, ROOT, type WriteContext } from './stages/context.ts';
import { buildHumankind } from './stages/humankind.ts';
import { buildLensStage } from './stages/lens.ts';
import { writeManifest } from './stages/manifest.ts';
import { buildMap, buildTerrain, buildWildlifeMasks } from './stages/terrain.ts';

const OUT = join(ROOT, 'app/public/data');

/** Seconds each stage took, in order, for the timing table at the end (section 10.7.2). */
const timings: [string, number, string][] = [];
function timed<T>(name: string, fn: () => T, note = ''): T {
  const t = performance.now();
  const value = fn();
  timings.push([name, (performance.now() - t) / 1000, note]);
  return value;
}

async function main(args: string[]): Promise<void> {
  const base = createContext(args);
  // Everything curated is checked before the old output is replaced.
  const content = timed('validate', () => validateContent(base));
  const ctx: WriteContext = {
    ...base,
    output: new Output(OUT, base.landCache.on ? join(ROOT, 'data/out/brotli') : undefined),
  };
  const { output, log } = ctx;

  const stages = new StageCache(
    join(ROOT, 'data/out/stages'),
    ROOT,
    join(ROOT, 'data/curated'),
    !ctx.noCache && !ctx.fixture,
  );
  const map = timed('map', () => buildMap(ctx));
  // The finest tiles as the globe draws them, for the masks and the tree to judge water by.
  const drawnTiles = new DrawnTiles(ctx.maxLevel);
  const terrain = timed('terrain', () => buildTerrain(ctx, map, drawnTiles));
  const drawn = drawnTiles.ground();
  const wildlife = timed('wildlife', () => buildWildlifeMasks(ctx, map, drawn));
  const climate = timed('climate', () => buildClimate(ctx, map));
  const { lens, widthAt } = timed('lens', () => buildLensStage(ctx));
  // The farming spread first: the tree gives camps their Neolithic culture from it (humankind.md section 8.5).
  const farming = timed('farming', () => buildFarming(ctx, map, climate));
  // The tree is the slowest stage, so its result is cached: under the land, the lens, its own
  // code and the curated files it read (section 10.7.2).
  const tree = performance.now();
  const { value: humankind, hit } = stages.through(
    'humankind',
    { land: ctx.landCache.key, lens, fixture: ctx.fixture, maxLevel: ctx.maxLevel },
    join(ROOT, 'data/build/stages/humankind.ts'),
    {
      reads: () => [...ctx.curatedReads],
      startRecording: () => {
        ctx.curatedReads.clear();
        output.startRecording();
      },
      stopRecording: () => output.stopRecording(),
      replay: (writes) => output.replay(writes),
    },
    () => buildHumankind(ctx, map, climate, drawn, widthAt),
  );
  timings.push(['humankind', (performance.now() - tree) / 1000, hit ? 'cached' : '']);
  if (hit) log('tree of humankind: from the stage cache');
  const events = [
    ...humankind.events,
    ...farmingEvents(readFileSync(join(ROOT, 'data/curated/neolithic.json'), 'utf8')),
  ];
  const index = timed('content', () =>
    buildContent(ctx, content, climate, wildlife, humankind.camps, events),
  );
  timed('manifest', () =>
    writeManifest(ctx, { index, lens, terrain, climate, tree: humankind.files, farming }),
  );

  const brotli = performance.now();
  await output.finish();
  timings.push(['brotli', (performance.now() - brotli) / 1000, '']);
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
  log(
    `stage seconds: ${timings.map(([n, t, note]) => `${n} ${t.toFixed(1)}${note ? ` (${note})` : ''}`).join(', ')}`,
  );
  for (const language of LANGUAGES)
    log(`index ${language}: ${(output.sizes.get(index[language])! / 1000).toFixed(0)} KB Brotli`);
  // No chunk over 1 MB as it is sent (milestone 1, section 10.8).
  log(
    `largest files: ${largestFiles(output.sizes, 5)
      .map(([f, n]) => `${f} ${(n / 1000).toFixed(0)} KB`)
      .join(', ')}`,
  );
  const tooLarge = chunkSizeProblems(output.sizes);
  if (tooLarge.length) throw new Error(`chunks over the size limit:\n${tooLarge.join('\n')}`);
}

await main(process.argv.slice(2));
