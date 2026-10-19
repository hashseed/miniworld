// History lens stage of the data build (spec history-lens.md, sections 2 and
// 3): the warp comes from the coordinates in the spec's event lists. It takes
// a while to compute. The approved warp is kept in data/curated/lens/ so that
// builds and CI read it instead of computing it; any other warp is kept in
// data/out/lens/ by a hash of its inputs and of the lens code, and rebuilt
// only when they change.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { Manifest } from '../../../app/src/content/types.ts';
import {
  decodeLensGrids,
  encodeLensGrids,
  LENS_STRENGTH,
  MAX_STRENGTH,
  sampleScalar,
  widthFactors,
} from '../../../app/src/globe/lens.ts';
import { latLonToDir } from '../../../app/src/geo/cube.ts';
import { atStrength, buildLens, checkLens, LENS_PARAMS, parseCoordinates } from '../lib/lens.ts';
import { lensPreviewSvg } from '../lib/lensPreview.ts';
import { readFeatures } from '../lib/readers.ts';
import { ROOT, sha256, type WriteContext } from './context.ts';

export function buildLensStage(ctx: WriteContext): {
  lens: Manifest['lens'];
  /** Drawn km per true km at a place, at the lens's fixed strength (sites.md section 2). */
  widthAt(lat: number, lon: number): number;
} {
  const { log } = ctx;
  const SPEC = join(ROOT, 'docs/spec');
  const eventFiles = [
    join(SPEC, 'events.md'),
    join(SPEC, 'wars.md'),
    ...readdirSync(join(SPEC, 'events'))
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => join(SPEC, 'events', f)),
  ];
  const eventPoints = eventFiles.flatMap((f) => parseCoordinates(readFileSync(f, 'utf8')));
  const version = createHash('sha256')
    .update(JSON.stringify({ points: eventPoints, params: LENS_PARAMS }))
    .digest('hex')
    .slice(0, 12);
  const lensCode = sha256(join(ROOT, 'data/build/lib/lens.ts')).slice(0, 12);
  const approvedLens = join(ROOT, 'data/curated/lens', `${version}.bin`);
  const lensCache = join(ROOT, 'data/out/lens', `${version}-${lensCode}.bin`);
  let bytes: Uint8Array;
  let exponent: number;
  const stored = [approvedLens, lensCache].find((f) => existsSync(f));
  if (stored) {
    bytes = new Uint8Array(readFileSync(stored));
    exponent = Number(readFileSync(`${stored}.exponent`, 'utf8'));
    log(`history lens ${version} from ${relative(ROOT, stored)}, exponent ${exponent}`);
  } else {
    const lens = buildLens(eventPoints, LENS_PARAMS, log);
    bytes = encodeLensGrids(lens.forward, lens.inverse);
    exponent = lens.exponent;
    mkdirSync(dirname(lensCache), { recursive: true });
    writeFileSync(lensCache, bytes);
    writeFileSync(`${lensCache}.exponent`, String(exponent));
    log(`history lens ${version} from ${eventPoints.length} event coordinates`);
  }
  // The slider goes up to 200%, where the limits no longer hold but the warp
  // must still not fold (section 3).
  const strongest = checkLens(
    atStrength(decodeLensGrids(bytes).forward, MAX_STRENGTH),
    LENS_PARAMS,
  );
  if (strongest.folds > 0)
    throw new Error(`history lens ${version} folds at ${MAX_STRENGTH * 100}% strength`);
  log(
    `history lens at ${MAX_STRENGTH * 100}%: no folds, smallest area factor ` +
      `${strongest.minArea.toFixed(2)}, stretch up to ${strongest.maxAnisotropy.toFixed(2)}:1`,
  );
  // The before-and-after preview Yang approves before a new warp ships (section 3).
  const { approvedVersion } = ctx.curated<{ approvedVersion: string }>('lens.json');
  if (approvedVersion !== version) {
    const preview = join(ROOT, 'data/out/lens', `preview-${version}.svg`);
    if (!existsSync(preview))
      writeFileSync(
        preview,
        lensPreviewSvg(
          readFeatures(ctx.neFile('ne_10m_land.geojson')),
          decodeLensGrids(bytes).forward,
        ),
      );
    log(
      `history lens ${version} is not approved yet (approved: ${approvedVersion}); ` +
        `preview in ${preview}`,
    );
  }
  const width = widthFactors(decodeLensGrids(bytes).forward);
  return {
    lens: { file: ctx.output.write('lens', 'bin', bytes), version, exponent },
    widthAt: (lat, lon) => 1 + (sampleScalar(width, latLonToDir(lat, lon)) - 1) * LENS_STRENGTH,
  };
}
