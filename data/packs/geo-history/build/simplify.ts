// Turns the original plate model in data/out/merdith-2021/ into the small
// simplified extract kept under data/sources/merdith-2021/ (spec section 13,
// geo-history.md section 4): the rotation model as numbers, the continents'
// polygons and the plate-boundary lines, simplified to the drawing resolution.
//
// Usage: node data/packs/geo-history/build/simplify.ts
// The zip must first be downloaded (npm run fetch-data merdith-2021) and
// extracted by hand into data/out/merdith-2021/ (its folders Rotations,
// Continents, Topologies and so on).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGpml, type GpmlFeature } from './gpml.ts';
import { parseRot } from './rot.ts';
import { simplifyLine } from './line.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const ID = 'merdith-2021';
const IN = join(ROOT, 'data/out', ID);
const OUT = join(ROOT, 'data/sources', ID);

/** Drawing resolution in degrees: 0.05° is about 5 km. */
const LAND_TOLERANCE = 0.05;
const LINE_TOLERANCE = 0.08;

export type BoundaryKind = 'ridge' | 'subduction' | 'transform';

const KINDS: Record<string, BoundaryKind> = {
  MidOceanRidge: 'ridge',
  ContinentalRift: 'ridge',
  SubductionZone: 'subduction',
  Transform: 'transform',
  Fault: 'transform',
  FractureZone: 'transform',
};

function read(path: string): string {
  const full = join(IN, path);
  if (!existsSync(full))
    throw new Error(`${full} is missing; see the notes at the top of this file`);
  return readFileSync(full, 'utf8');
}

function round(v: number, places: number): number {
  const k = 10 ** places;
  return Math.round(v * k) / k;
}

function ringOut(ring: number[], tolerance: number, closed: boolean): number[] {
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < ring.length; i += 2) pts.push([ring[i]!, ring[i + 1]!]);
  // A closed ring repeats its first point; the output leaves the repeat out.
  if (closed && pts.length > 1) {
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    if (a[0] === b[0] && a[1] === b[1]) pts.pop();
  }
  const kept = simplifyLine(pts, tolerance, closed);
  const out: number[] = [];
  for (const [lat, lon] of kept) out.push(round(lat, 2), round(lon, 2));
  return out;
}

function ageOut(a: number): number {
  return Number.isFinite(a) ? round(a, 1) : 1100;
}

function main(): void {
  mkdirSync(OUT, { recursive: true });

  const rows = parseRot(read('Rotations/1000_0_rotfile_Merdith_etal.rot'));
  // Numbers only, one array per row: [plate, age, lat, lon, angle, fixed].
  const rotations = rows.map((r) => [r.plate, r.age, r.lat, r.lon, r.angle, r.fixed]);
  writeFileSync(join(OUT, 'rotations.json'), JSON.stringify(rotations));

  const land = parseGpml(read('Continents/shapes_continents.gpml'))
    .filter((f) => f.polygon)
    .map((f) => ({
      plate: f.plateId,
      begin: ageOut(f.begin),
      end: ageOut(f.end),
      rings: f.rings.map((r) => ringOut(r, LAND_TOLERANCE, true)).filter((r) => r.length >= 6),
    }))
    .filter((f) => f.rings.length > 0 && f.begin > f.end);
  writeFileSync(join(OUT, 'land.json'), JSON.stringify(land));

  const boundaries: unknown[] = [];
  const seen = new Set<string>();
  for (const file of [
    'Topologies/1000-410-Convergence_Merdith_etal.gpml',
    'Topologies/1000-410-Divergence_Merdith_etal.gpml',
    'Topologies/1000-410-Transforms_Merdith_etal.gpml',
    'Topologies/410-250_plate_bounds_Merdith_etal.gpml',
    'Topologies/250-0_plate_bounds_Merdith_etal.gpml',
    'Topologies/TopologyBuildingBlocks_Merdith_etal.gpml',
  ]) {
    for (const f of parseGpml(read(file)) as GpmlFeature[]) {
      const kind = KINDS[f.type];
      if (!kind || f.polygon) continue;
      const lines = f.rings
        .map((r) => ringOut(r, LINE_TOLERANCE, false))
        .filter((r) => r.length >= 4);
      if (lines.length === 0) continue;
      const begin = ageOut(f.begin);
      const end = ageOut(f.end);
      if (begin <= end) continue;
      const half = f.method.startsWith('HalfStage');
      const record = {
        kind,
        plate: f.plateId,
        begin,
        end,
        // Half-stage ridges and rifts move with the mean of the two plates beside them.
        ...(half ? { left: f.leftPlate, right: f.rightPlate, at: round(f.importTime, 1) } : {}),
        ...(kind === 'subduction'
          ? { side: f.polarity === 'Left' ? 'L' : f.polarity === 'Right' ? 'R' : 'U' }
          : {}),
        lines,
      };
      const key = JSON.stringify(record);
      if (seen.has(key)) continue;
      seen.add(key);
      boundaries.push(record);
    }
  }
  writeFileSync(join(OUT, 'boundaries.json'), JSON.stringify(boundaries));

  for (const name of ['rotations.json', 'land.json', 'boundaries.json']) {
    const bytes = statSync(join(OUT, name)).size;
    const sha = createHash('sha256')
      .update(readFileSync(join(OUT, name)))
      .digest('hex');
    console.log(`simplify-geo: ${name} ${bytes} bytes sha256 ${sha}`);
  }
  console.log(`simplify-geo: ${land.length} land polygons, ${boundaries.length} boundary features`);
}

main();
