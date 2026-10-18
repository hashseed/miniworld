// Readers for the real source datasets. Each returns plain grids so the rest
// of the build does not depend on file formats.

import { readFileSync } from 'node:fs';
import { readExtract } from './extract.ts';
import { Grid } from './grid.ts';

/** ETOPO 2022 60 arc-second bedrock elevation GeoTIFF → whole metres. */
export async function readEtopo(path: string): Promise<Grid> {
  const { fromArrayBuffer } = await import('geotiff');
  const buf = readFileSync(path);
  const tiff = await fromArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const [west, south, east, north] = image.getBoundingBox();
  if (
    Math.round(west!) !== -180 ||
    Math.round(east!) !== 180 ||
    Math.round(north!) !== 90 ||
    Math.round(south!) !== -90
  )
    throw new Error(`Unexpected ETOPO extent ${image.getBoundingBox().join(', ')}`);
  const rasters = await image.readRasters({ interleave: true });
  const out = new Int16Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(Number(rasters[i]));
  return new Grid(width, height, out);
}

/** The simplified ETOPO elevation extract (simplify-data.ts) → whole metres. */
export function readElevation(basePath: string): Grid {
  const { header, data } = readExtract(basePath);
  if (
    header.type !== 'int16' ||
    header.registration !== 'cell' ||
    header.west !== -180 ||
    header.north !== 90
  )
    throw new Error(`${basePath}: unexpected elevation extract`);
  return new Grid(header.width, header.height, data as Int16Array);
}
