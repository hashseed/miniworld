// The farming onset raster (spec neolithic/farming-spread.md): a wave of advance from the
// eight centres and the dated waypoints over a coarse latitude-longitude grid, one Dijkstra
// per question. Pure and deterministic: the land, the limits and the data come in as
// arguments, and the same inputs always give the same raster.

import { detCos, RAD } from '../../../app/src/core/detmath.ts';
import {
  FARMING_CELL_DEG,
  FARMING_COLS,
  FARMING_ROWS,
  FARMING_YEAR_BIAS,
  farmingCellOf,
  type FarmingSeedInfo,
} from '../../../app/src/world/farmingOnset.ts';

const KM_PER_DEG = 111.195;

export interface Box {
  lat: [number, number];
  lon: [number, number];
}

export interface FarmingSeed {
  id: string;
  /** Years BCE; a negative number is a year CE (-1000 is 1000 CE). */
  bce: number;
  lat: number;
  lon: number;
  /** Herding without crops: its wave sets the herding onset, not the farming onset. */
  herdingOnly?: boolean;
  /**
   * Centres only: the year BCE the package starts to spread outward, later than the first
   * farming at the centre itself (farming-spread.md section 9.2). The centre's own cell keeps `bce`.
   */
  spreadBce?: number;
  /** The data record of a waypoint; centres have none. */
  kind: 'centre' | 'waypoint';
}

export interface FarmingZone {
  id: string;
  kmPerYear: number;
  box?: Box;
  /** The 50 km coastal strip and the sea hops of the Mediterranean and Black Sea. */
  coastal?: boolean;
  /** Open-water voyaging outside the Mediterranean. */
  sea?: boolean;
}

export interface FarmingInput {
  seeds: FarmingSeed[];
  zones: FarmingZone[];
  defaultKmPerYear: number;
  seaMaxHopKm: number;
  holds: { id: string; box: Box; notBeforeBce: number }[];
  noFarming: { id: string; box: Box }[];
  /** Boxes where open water stops the wave (no Old World crops crossed into the Americas). */
  barriers: { id: string; box: Box }[];
  /** Whether land lies in a cell (centre or any nearby sample), at the grid's sea level. */
  land(lat: number, lon: number): boolean;
  /** Whether people may live at a place in a year BCE (cold, desert, high ground). */
  habitable(lat: number, lon: number, bce: number): boolean;
}

export interface FarmingRaster {
  /** Onset year BCE (negative CE) per cell, NaN where there is none. */
  onset: Float64Array;
  /** Onset of crop farming, NaN where there is none; never earlier than `onset`. */
  farming: Float64Array;
  /** Index into the seeds of the seed that set the onset, -1 where none. */
  seed: Int16Array;
  /** Cells that are land (before the limits), for the report. */
  land: Uint8Array;
}

export const inBox = (b: Box, lat: number, lon: number) =>
  lat >= b.lat[0] && lat <= b.lat[1] && lon >= b.lon[0] && lon <= b.lon[1];

export const cellLat = (r: number) => 90 - (r + 0.5) * FARMING_CELL_DEG;
export const cellLon = (c: number) => -180 + (c + 0.5) * FARMING_CELL_DEG;

/** A binary min-heap of [key, node] pairs. */
class Heap {
  private keys: number[] = [];
  private nodes: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, node: number): void {
    const k = this.keys;
    const n = this.nodes;
    let i = k.length;
    k.push(key);
    n.push(node);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= key) break;
      k[i] = k[p]!;
      n[i] = n[p]!;
      i = p;
    }
    k[i] = key;
    n[i] = node;
  }
  /** Removes the smallest; returns [key, node]. */
  pop(): [number, number] {
    const k = this.keys;
    const n = this.nodes;
    const top: [number, number] = [k[0]!, n[0]!];
    const lastK = k.pop()!;
    const lastN = n.pop()!;
    const len = k.length;
    if (len > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= len) break;
        if (c + 1 < len && k[c + 1]! < k[c]!) c++;
        if (k[c]! >= lastK) break;
        k[i] = k[c]!;
        n[i] = n[c]!;
        i = c;
      }
      k[i] = lastK;
      n[i] = lastN;
    }
    return top;
  }
}

/** The eight neighbours of a cell as [cell, kilometres]; longitude wraps, the poles do not. */
function neighbours(cell: number, out: [number, number][]): number {
  const r = Math.floor(cell / FARMING_COLS);
  const c = cell % FARMING_COLS;
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) {
    const rr = r + dr;
    if (rr < 0 || rr >= FARMING_ROWS) continue;
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const cc = (c + dc + FARMING_COLS) % FARMING_COLS;
      const dy = dr * FARMING_CELL_DEG * KM_PER_DEG;
      const dx = dc * FARMING_CELL_DEG * KM_PER_DEG * detCos(cellLat(Math.max(r, rr)) * RAD);
      out[n++] = [rr * FARMING_COLS + cc, Math.sqrt(dx * dx + dy * dy)];
    }
  }
  return n;
}

/** The seed a latitude-longitude point belongs to is its cell. */
export const seedCell = (s: { lat: number; lon: number }): number => farmingCellOf(s.lat, s.lon);

/** The country within this distance of a centre farms from the centre's own date. */
export const CENTRE_CORE_KM = 100;

export function computeFarming(input: FarmingInput): FarmingRaster {
  const N = FARMING_COLS * FARMING_ROWS;
  const lat = new Float64Array(N);
  const lon = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    lat[i] = cellLat(Math.floor(i / FARMING_COLS));
    lon[i] = cellLon(i % FARMING_COLS);
  }
  const blocked = new Uint8Array(N);
  const land = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (input.noFarming.some((b) => inBox(b.box, lat[i]!, lon[i]!))) blocked[i] = 1;
    else land[i] = input.land(lat[i]!, lon[i]!) ? 1 : 0;
  }
  const seedCells = input.seeds.map(seedCell);
  // A seed's own cell is always land, so a small island is not lost to the coarse grid.
  for (const c of seedCells) {
    blocked[c] = 0;
    land[c] = 1;
  }
  const nb: [number, number][] = Array.from({ length: 8 }, () => [0, 0]);

  // Water within half the longest hop of land is passable: any crossing between two
  // coasts is then a chain of hops no longer than seaMaxHopKm.
  const near = new Float64Array(N).fill(Infinity);
  {
    const heap = new Heap();
    for (let i = 0; i < N; i++)
      if (land[i]) {
        near[i] = 0;
        heap.push(0, i);
      }
    const reach = input.seaMaxHopKm / 2;
    while (heap.size) {
      const [d, cell] = heap.pop();
      if (d > near[cell]!) continue;
      const m = neighbours(cell, nb);
      for (let k = 0; k < m; k++) {
        const [to, km] = nb[k]!;
        const nd = d + km;
        if (nd <= reach && nd < near[to]!) {
          near[to] = nd;
          heap.push(nd, to);
        }
      }
    }
  }
  const barrier = (i: number) => input.barriers.some((b) => inBox(b.box, lat[i]!, lon[i]!));
  const passable = new Uint8Array(N);
  for (let i = 0; i < N; i++)
    passable[i] = blocked[i]
      ? 0
      : land[i]
        ? 1
        : near[i]! <= input.seaMaxHopKm / 2 && !barrier(i)
          ? 1
          : 0;

  // Speeds: the Mediterranean and Black Sea water, their 50 km land strip, the ocean, then
  // the zone boxes in order, then the default.
  const coastalZone = input.zones.find((z) => z.coastal);
  const seaZone = input.zones.find((z) => z.sea);
  const landZones = input.zones.filter((z) => z.box && !z.coastal && !z.sea);
  const inMed = (la: number, lo: number) =>
    (la >= 30.5 && la <= 46 && lo >= -5.7 && lo <= 36) ||
    (la >= 41 && la <= 47.5 && lo >= 27.5 && lo <= 42);
  const medWater = new Uint8Array(N);
  for (let i = 0; i < N; i++) medWater[i] = !land[i] && inMed(lat[i]!, lon[i]!) ? 1 : 0;
  const speed = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (!land[i]) {
      // Open water runs at the voyaging speed inside the voyaging zone's box (all water when
      // it has none), elsewhere at the speed of the land zone around it.
      const voyage = seaZone && (!seaZone.box || inBox(seaZone.box, lat[i]!, lon[i]!));
      speed[i] = medWater[i]
        ? (coastalZone?.kmPerYear ?? input.defaultKmPerYear)
        : voyage
          ? seaZone.kmPerYear
          : (landZones.find((x) => inBox(x.box!, lat[i]!, lon[i]!))?.kmPerYear ??
            input.defaultKmPerYear);
      continue;
    }
    let s: number | undefined;
    const m = neighbours(i, nb);
    for (let k = 0; k < m; k++) if (medWater[nb[k]![0]]) s = coastalZone?.kmPerYear;
    if (s === undefined) {
      const z = landZones.find((x) => inBox(x.box!, lat[i]!, lon[i]!));
      s = z?.kmPerYear ?? input.defaultKmPerYear;
    }
    speed[i] = s;
  }
  // Holds as a floor per cell: the earliest year BCE (largest value) the cell may have.
  const floor = new Float64Array(N).fill(Infinity);
  for (let i = 0; i < N; i++)
    for (const h of input.holds)
      if (inBox(h.box, lat[i]!, lon[i]!)) floor[i] = Math.min(floor[i]!, h.notBeforeBce);

  /** One Dijkstra from the chosen seeds; `t` is the year BCE, so earlier is larger. */
  const wave = (use: (s: FarmingSeed) => boolean) => {
    const t = new Float64Array(N).fill(-Infinity);
    const by = new Int16Array(N).fill(-1);
    const heap = new Heap();
    input.seeds.forEach((s, k) => {
      if (!use(s)) return;
      const c = seedCells[k]!;
      const start = s.spreadBce ?? s.bce;
      if (start > t[c]!) {
        t[c] = start;
        by[c] = k;
        heap.push(-start, c);
      }
    });
    while (heap.size) {
      const [key, cell] = heap.pop();
      const cur = -key;
      if (cur < t[cell]!) continue;
      const m = neighbours(cell, nb);
      for (let k = 0; k < m; k++) {
        const [to, km] = nb[k]!;
        if (!passable[to]) continue;
        // Cost of the step at the speed of the slower of the two cells.
        const years = km / Math.min(speed[cell]!, speed[to]!);
        const arrive = Math.min(cur - years, floor[to]!);
        if (arrive > t[to]!) {
          t[to] = arrive;
          by[to] = by[cell]!;
          heap.push(-arrive, to);
        }
      }
    }
    return { t, by };
  };
  const all = wave(() => true);
  const crops = wave((s) => !s.herdingOnly);

  const onset = new Float64Array(N).fill(NaN);
  const farming = new Float64Array(N).fill(NaN);
  const seed = new Int16Array(N).fill(-1);
  const forced = new Set(seedCells);
  for (let i = 0; i < N; i++) {
    if (!land[i] || all.t[i] === -Infinity) continue;
    // Cold, desert and high ground get no onset (peopling.md section 5.2), judged in the
    // year farming would come; the seeds' own places are known to have been settled.
    if (!forced.has(i) && !input.habitable(lat[i]!, lon[i]!, all.t[i]!)) continue;
    onset[i] = all.t[i]!;
    seed[i] = all.by[i]!;
    farming[i] = crops.t[i]! === -Infinity ? NaN : crops.t[i]!;
  }
  // A centre's own cell is as old as the centre, whenever its package starts to spread.
  input.seeds.forEach((s, k) => {
    const c = seedCells[k]!;
    if (s.spreadBce === undefined || !(s.bce > onset[c]!)) return;
    onset[c] = s.bce;
    if (!Number.isNaN(farming[c]!)) farming[c] = s.bce;
  });
  // So is the country round a centre (section 9.2): its own people, the camps within
  // CENTRE_CORE_KM, farm from the centre's date, where the land is habitable then.
  input.seeds.forEach((s, k) => {
    if (s.kind !== 'centre') return;
    const c = seedCells[k]!;
    const cos = detCos(s.lat * RAD);
    for (let i = 0; i < N; i++) {
      if (!land[i] || !(s.bce > onset[i]! || Number.isNaN(onset[i]!))) continue;
      const dy = (lat[i]! - s.lat) * 111.2;
      const dx = (lon[i]! - s.lon) * 111.2 * cos;
      if (dx * dx + dy * dy > CENTRE_CORE_KM * CENTRE_CORE_KM) continue;
      if (i !== c && (blocked[i] || !input.habitable(lat[i]!, lon[i]!, s.bce))) continue;
      onset[i] = s.bce;
      seed[i] = k;
      if (!s.herdingOnly) farming[i] = s.bce;
    }
  });
  return { onset, farming, seed, land };
}

export interface FarmingCheck {
  errors: string[];
  report: string[];
}

/** The build check of farming-spread.md section 6. */
export function checkFarming(
  input: FarmingInput,
  r: FarmingRaster,
  tolerance: Map<string, number>,
): FarmingCheck {
  const errors: string[] = [];
  const report: string[] = [];
  const at = (s: { lat: number; lon: number }) => r.onset[seedCell(s)]!;
  for (const s of input.seeds) {
    const t = at(s);
    if (Number.isNaN(t)) {
      errors.push(`${s.id}: no onset at its own place`);
      continue;
    }
    if (s.kind === 'centre' && t < s.bce) errors.push(`${s.id}: onset ${t} is later than its date`);
    const tol = tolerance.get(s.id);
    if (tol !== undefined && Math.abs(t - s.bce) > tol)
      errors.push(`${s.id}: onset ${Math.round(t)} BCE differs from ${s.bce} by more than ${tol}`);
  }
  // Waves much earlier than the nearest dated seed within 300 km (a missing waypoint).
  for (let i = 0; i < r.onset.length; i++) {
    const t = r.onset[i]!;
    if (Number.isNaN(t)) continue;
    const la = cellLat(Math.floor(i / FARMING_COLS));
    const lo = cellLon(i % FARMING_COLS);
    let best: FarmingSeed | undefined;
    let bestKm = 300;
    for (const s of input.seeds) {
      const dy = (s.lat - la) * KM_PER_DEG;
      const dx = (s.lon - lo) * KM_PER_DEG * detCos(la * RAD);
      const km = Math.sqrt(dx * dx + dy * dy);
      if (km <= bestKm) {
        bestKm = km;
        best = s;
      }
    }
    if (best && t - best.bce > 500)
      report.push(
        `${la.toFixed(2)}, ${lo.toFixed(2)}: ${Math.round(t)} BCE, ${Math.round(t - best.bce)} years before ${best.id}`,
      );
  }
  return { errors, report };
}

/**
 * The bytes of the raster for the app: a JSON header of the seeds, then three planes of the
 * whole grid (farmingOnset.ts documents the layout).
 */
export function encodeFarming(r: FarmingRaster, seeds: FarmingSeedInfo[]): Uint8Array {
  const head = new TextEncoder().encode(JSON.stringify({ seeds }));
  const N = FARMING_COLS * FARMING_ROWS;
  const out = new Uint8Array(4 + head.length + N * 5);
  const view = new DataView(out.buffer);
  view.setUint32(0, head.length, true);
  out.set(head, 4);
  const base = 4 + head.length;
  for (let i = 0; i < N; i++) {
    const t = r.onset[i]!;
    // An arrival after the last year the raster holds (2000 CE) is none, not a wrapped-round year.
    const year = Math.round(t) + FARMING_YEAR_BIAS;
    const v = Number.isNaN(t) || year <= 0 ? 0 : year;
    const f = r.farming[i]!;
    const d =
      v === 0
        ? 0
        : Number.isNaN(f)
          ? 0xffff
          : Math.min(0xfffe, Math.max(0, Math.round(t) - Math.round(f)));
    // High bytes, then low bytes, so the smooth part compresses on its own.
    out[base + i] = v >> 8;
    out[base + N + i] = v & 255;
    out[base + 2 * N + i] = d >> 8;
    out[base + 3 * N + i] = d & 255;
    out[base + 4 * N + i] = r.seed[i]! + 1;
  }
  return out;
}

export type { FarmingSeedInfo };
