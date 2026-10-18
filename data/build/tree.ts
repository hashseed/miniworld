// Questions about the built tree of humankind (spec humankind.md, section 6):
//   npm run tree -- report             writes data/build/tree/report.md and map.svg
//   npm run tree -- at <year> [--region <id>]
//   npm run tree -- lineage <figure id>
// The tree comes from data/build/tree/tree.json, written by `npm run build-data`.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dayOfYearStart } from '../../app/src/time/calendar.ts';
import type { Tree } from '../../app/src/world/tree.ts';
import { parseYear, treeAt, treeLineage, treeMapSvg, treeReport } from './lib/treeReport.ts';

const DIR = new URL('tree/', import.meta.url).pathname;
const ROOT = new URL('../..', import.meta.url).pathname;
const file = join(DIR, 'tree.json');
if (!existsSync(file)) {
  console.error('tree: no data/build/tree/tree.json yet; run npm run build-data first');
  process.exit(1);
}
const { startDay, endDay, tree } = JSON.parse(readFileSync(file, 'utf8')) as {
  startDay: number;
  endDay: number;
  tree: Tree;
};

const [command, ...rest] = process.argv.slice(2);
const option = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};

type Box = { west: number; east: number; south: number; north: number };

function landRings(box: Box): [number, number][][] {
  const geo = JSON.parse(
    readFileSync(join(ROOT, 'data/sources/natural-earth/ne_10m_land.geojson'), 'utf8'),
  ) as { features: { geometry: { type: string; coordinates: unknown } }[] };
  const rings: [number, number][][] = [];
  for (const f of geo.features) {
    const polys =
      f.geometry.type === 'Polygon'
        ? [f.geometry.coordinates as [number, number][][]]
        : (f.geometry.coordinates as [number, number][][][]);
    for (const poly of polys) {
      const ring = poly[0]!;
      const inBox = ring.some(
        ([lon, lat]) => lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north,
      );
      if (ring.length >= 30 && inBox) rings.push(ring.filter((_, i) => i % 8 === 0));
    }
  }
  return rings;
}

if (command === 'report') {
  writeFileSync(join(DIR, 'report.md'), treeReport(tree, startDay, endDay));
  const box: Box = { west: -20, east: 55, south: -37, north: 38 };
  writeFileSync(join(DIR, 'map.svg'), treeMapSvg(tree, landRings(box), box, startDay, endDay));
  console.log('tree: wrote data/build/tree/report.md and data/build/tree/map.svg');
} else if (command === 'at') {
  const day = parseYear(rest[0] ?? '', dayOfYearStart);
  if (day === undefined) {
    console.error('tree at: give a year such as "62000 BCE"');
    process.exit(1);
  }
  console.log(treeAt(tree, day, option('--region')));
} else if (command === 'lineage') {
  const id = Number(rest[0]);
  if (!Number.isInteger(id) || !tree.figures[id]) {
    console.error(`tree lineage: no figure ${rest[0]}`);
    process.exit(1);
  }
  console.log(treeLineage(tree, id));
} else {
  console.error('usage: npm run tree -- report | at <year> [--region <id>] | lineage <figure id>');
  process.exit(1);
}
