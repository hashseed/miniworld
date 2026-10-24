// Manifest stage of the data build (spec milestone 1, section 10.1): the part
// files of each layer, then the manifest that names every file.

import { createHash } from 'node:crypto';
import type { Manifest } from '../../../app/src/content/types.ts';
import { LANGUAGES, type Language } from '../../../app/src/i18n/messages.ts';
import { TIMELINE_START } from '../../../app/src/time/calendar.ts';
import type { Climate } from './climate.ts';
import type { WriteContext } from './context.ts';
import type { TreeFiles } from './humankind.ts';
import type { LayerOut } from './terrain.ts';

function finishLayer(
  ctx: WriteContext,
  name: string,
  layer: LayerOut,
  minLevel: number,
  maxLevel: number,
  timed: boolean,
): Manifest['layers'][string] {
  const parts: Record<string, string> = {};
  for (const [path, part] of layer.parts) {
    parts[path] = ctx.output.writeJson(`${name}/parts/${path.replace('/', '-')}`, part);
  }
  return { minLevel, maxLevel, timed, chunks: layer.chunks, parts, deep: layer.deep };
}

export function writeManifest(
  ctx: WriteContext,
  parts: {
    index: Record<Language, string>;
    lens: Manifest['lens'];
    terrain: LayerOut;
    climate: Climate;
    tree: TreeFiles;
    /** The farming onset raster (farming-spread.md section 9); absent on the fixture map. */
    farming?: string;
  },
): Manifest {
  const { index, climate, tree, farming } = parts;
  const manifest: Manifest = {
    version: ctx.release.version,
    buildId: createHash('sha256').update(JSON.stringify(index)).digest('hex').slice(0, 12),
    fixture: ctx.fixture,
    cutoffDay: ctx.cutoffDay,
    timelineStartDay: TIMELINE_START,
    languages: [...LANGUAGES],
    windows: ctx.windows,
    index,
    lens: parts.lens,
    layers: {
      terrain: finishLayer(ctx, 'terrain', parts.terrain, 0, ctx.maxLevel, false),
    },
    climate: { days: climate.iceDays, files: climate.climateFiles },
    foliage: { days: climate.iceDays, files: climate.foliageFiles },
    ...(tree ? { tree } : {}),
    ...(farming ? { farming } : {}),
  };
  ctx.output.writeNamed('manifest.json', new TextEncoder().encode(JSON.stringify(manifest)));
  return manifest;
}
