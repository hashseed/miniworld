// Readers for the real source datasets. Each returns plain grids so the rest
// of the build does not depend on file formats.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Grid } from './grid.ts';
import type { IceSlice } from './ice.ts';

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

/**
 * PaleoMIST 1.0 ice thickness grids. The dataset keeps one NetCDF file per
 * 2,500-year time step; the time step is read from the file name (in
 * thousands or plain years before present) and the thickness variable is
 * found by name.
 */
export async function readPaleoMist(dir: string): Promise<IceSlice[]> {
  const { NetCDFReader } = await import('netcdfjs');
  const files = readdirSync(dir).filter((f) => f.endsWith('.nc'));
  const slices: IceSlice[] = [];
  for (const f of files) {
    const yearsBP = yearsFromName(f);
    if (yearsBP === undefined) continue;
    const reader = new NetCDFReader(readFileSync(join(dir, f)));
    const names = reader.variables.map((v) => v.name);
    const iceName = names.find((n) => /ice|thick|stgit/i.test(n) && !/frac|mask/i.test(n));
    const latName = names.find((n) => /^lat/i.test(n));
    const lonName = names.find((n) => /^lon/i.test(n));
    if (!iceName || !latName || !lonName)
      throw new Error(`${f}: no ice thickness variable among ${names.join(', ')}`);
    const lat = reader.getDataVariable(latName) as number[];
    const lon = reader.getDataVariable(lonName) as number[];
    const values = (reader.getDataVariable(iceName) as number[]).flat(3) as number[];
    slices.push({ yearsBP, thickness: toGrid(values, lat, lon) });
  }
  if (slices.length === 0) throw new Error(`No PaleoMIST slices found in ${dir}`);
  return slices.sort((a, b) => b.yearsBP - a.yearsBP);
}

function yearsFromName(name: string): number | undefined {
  const m = name.match(/(\d+(?:\.\d+)?)\s*(ka|k)?\b/i);
  if (!m) return undefined;
  const v = Number(m[1]);
  return m[2] ? v * 1000 : v;
}

/** Reorders a lat/lon array into a north-up grid starting at longitude −180. */
function toGrid(values: number[], lat: number[], lon: number[]): Grid<Float32Array> {
  const w = lon.length;
  const h = lat.length;
  const northUp = lat[0]! > lat[h - 1]!;
  const lonStart = lon.findIndex(
    (l) =>
      ((l + 540) % 360) - 180 >= -180 + 1e-6 - 360 / w / 2 &&
      ((l + 540) % 360) - 180 < -180 + 360 / w,
  );
  const shift = lonStart < 0 ? 0 : lonStart;
  const out = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    const sr = northUp ? r : h - 1 - r;
    for (let c = 0; c < w; c++) {
      const v = values[sr * w + ((c + shift) % w)]!;
      out[r * w + c] = Number.isFinite(v) && v > 0 && v < 1e5 ? v : 0;
    }
  }
  return new Grid(w, h, out);
}
