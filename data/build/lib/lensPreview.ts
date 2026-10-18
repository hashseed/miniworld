// Before-and-after preview of the history lens (spec history-lens.md,
// section 3): today's land in true and in drawn positions on two
// equirectangular maps, with a 30-degree graticule, for Yang to approve.

import { readFileSync } from 'node:fs';
import { sampleGrid } from '../../../app/src/globe/lens.ts';
import type { Vec3 } from '../../../app/src/globe/cube.ts';

const W = 1440;
const H = 720;
const DEG = Math.PI / 180;

type Ring = [number, number][];

function landRings(path: string): Ring[] {
  const geo = JSON.parse(readFileSync(path, 'utf8')) as {
    features: { geometry: { type: string; coordinates: unknown } }[];
  };
  const rings: Ring[] = [];
  for (const f of geo.features) {
    const polys =
      f.geometry.type === 'Polygon'
        ? [f.geometry.coordinates as Ring[]]
        : (f.geometry.coordinates as Ring[][]);
    for (const poly of polys) {
      const outer = poly[0]!;
      if (outer.length < 30) continue; // small islands only clutter the preview
      rings.push(outer.filter((_, i) => i % 4 === 0));
    }
  }
  return rings;
}

function warp(forward: Float64Array, lon: number, lat: number): [number, number] {
  const d: Vec3 = [
    Math.cos(lat * DEG) * Math.sin(lon * DEG),
    Math.sin(lat * DEG),
    Math.cos(lat * DEG) * Math.cos(lon * DEG),
  ];
  const o = sampleGrid(forward, d);
  return [Math.atan2(o[0], o[2]) / DEG, Math.asin(Math.max(-1, Math.min(1, o[1]))) / DEG];
}

function pathOf(points: [number, number][], dy: number): string {
  let s = '';
  let prev: number | undefined;
  for (const [lon, lat] of points) {
    const x = ((lon + 180) / 360) * W;
    const y = dy + ((90 - lat) / 180) * H;
    // Break the line where it crosses the date line.
    const move = prev === undefined || Math.abs(lon - prev) > 180;
    s += `${move ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    prev = lon;
  }
  return s;
}

export function lensPreviewSvg(landPath: string, forward: Float64Array): string {
  const rings = landRings(landPath);
  const parts: string[] = [];
  const panel = (
    dy: number,
    title: string,
    map: (lon: number, lat: number) => [number, number],
  ) => {
    parts.push(`<rect x="0" y="${dy}" width="${W}" height="${H}" fill="#cfe6f7"/>`);
    const grid: string[] = [];
    for (let lon = -180; lon <= 180; lon += 30) {
      const line: [number, number][] = [];
      for (let lat = -90; lat <= 90; lat += 2) line.push(map(lon, lat));
      grid.push(pathOf(line, dy));
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const line: [number, number][] = [];
      for (let lon = -180; lon <= 180; lon += 2) line.push(map(lon, lat));
      grid.push(pathOf(line, dy));
    }
    parts.push(`<path d="${grid.join('')}" fill="none" stroke="#7aa6c8" stroke-width="0.8"/>`);
    const land = rings
      .map((r) =>
        pathOf(
          r.map(([lon, lat]) => map(lon, lat)),
          dy,
        ),
      )
      .join('');
    parts.push(`<path d="${land}" fill="none" stroke="#5a3d2b" stroke-width="1"/>`);
    parts.push(
      `<text x="12" y="${dy + 28}" font-family="sans-serif" font-size="22" fill="#333">${title}</text>`,
    );
  };
  panel(0, 'True sizes', (lon, lat) => [lon, lat]);
  panel(H + 10, 'History lens', (lon, lat) => warp(forward, lon, lat));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${2 * H + 10}" ` +
    `viewBox="0 0 ${W} ${2 * H + 10}">${parts.join('')}</svg>\n`
  );
}
