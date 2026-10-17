// Ice, sea level and deserts from the reconstructions (spec milestone 1,
// sections 4.3, 5.1 and 5.2): PaleoMIST 1.0 for ice thickness and sea level,
// Beyer, Krapp and Manica 2020 for precipitation. Both are stacks of global
// grids over time, read from the extracts under data/sources/.

import type { ExtractData, ExtractHeader } from './extract.ts';

/** A stack of global grids over time, sampled bilinearly in space and linearly in time. */
export class TimeStack {
  readonly header: ExtractHeader;
  private readonly data: ExtractData;
  private readonly years: number[];

  constructor(header: ExtractHeader, data: ExtractData) {
    this.header = header;
    this.data = data;
    this.years = header.yearsBP ?? [0];
  }

  /** Value in units at a point and date, or undefined where every neighbour has no data. */
  sample(lat: number, lon: number, yearsBP: number): number | undefined {
    const ys = this.years;
    if (yearsBP >= ys[0]!) return this.sampleLayer(0, lat, lon);
    if (yearsBP <= ys[ys.length - 1]!) return this.sampleLayer(ys.length - 1, lat, lon);
    let k = 1;
    while (ys[k]! > yearsBP) k++;
    const t = (ys[k - 1]! - yearsBP) / (ys[k - 1]! - ys[k]!);
    const a = this.sampleLayer(k - 1, lat, lon);
    const b = this.sampleLayer(k, lat, lon);
    if (a === undefined) return t >= 0.5 ? b : undefined;
    if (b === undefined) return t < 0.5 ? a : undefined;
    return a + (b - a) * t;
  }

  /** Bilinear sample of one layer, skipping cells without data. */
  sampleLayer(layer: number, lat: number, lon: number): number | undefined {
    const h = this.header;
    const half = h.registration === 'cell' ? 0.5 : 0;
    let x = (lon - h.west) / h.cellDegrees - half;
    const y = (h.north - lat) / h.cellDegrees - half;
    // Longitude wraps; a node grid spanning 360° repeats its first column.
    const period = Math.round(360 / h.cellDegrees);
    x = ((x % period) + period) % period;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const base = layer * h.width * h.height;
    let sum = 0;
    let weight = 0;
    for (const [dx, dy, wgt] of [
      [0, 0, (1 - fx) * (1 - fy)],
      [1, 0, fx * (1 - fy)],
      [0, 1, (1 - fx) * fy],
      [1, 1, fx * fy],
    ] as const) {
      const r = y0 + dy;
      if (r < 0 || r >= h.height || wgt === 0) continue;
      const c = (x0 + dx) % period;
      if (c >= h.width) continue;
      const v = this.data[base + r * h.width + c]!;
      if (h.nodata !== undefined && v === h.nodata) continue;
      sum += v * wgt;
      weight += wgt;
    }
    return weight > 0 ? (sum / weight) * h.scale : undefined;
  }

  /** Raw value in units at a flat index into the stack. */
  sampleIndex(index: number): number {
    return this.data[index]! * this.header.scale;
  }

  /** Layer dates in years before present, oldest first. */
  get yearsBP(): number[] {
    return this.years;
  }
}

/** Radius (km) over which the polar ice surface is averaged (section 5.2). */
export const POLAR_ICE_RADIUS_KM = 120;
/** Radius (km) of the ice smoothing south of ANTARCTIC_LAT. */
export const ANTARCTIC_ICE_RADIUS_KM = 250;
/** South of this latitude, land with ice nearby is always ice-covered. */
export const ANTARCTIC_LAT = -60;

/** Smoothing of the polar ice sheets: the bed under them and how strongly each latitude is smoothed. */
export interface IceSmoothing {
  bed: (lat: number, lon: number) => number;
  weight: (lat: number) => number;
}

/** Offsets (km east, km north) of the taps of a disc: the centre and two rings. */
function discTaps(radiusKm: number): [number, number][] {
  const taps: [number, number][] = [[0, 0]];
  for (const [ring, count] of [
    [0.5, 6],
    [1, 12],
  ] as const) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * 2 * Math.PI;
      taps.push([Math.cos(a) * ring * radiusKm, Math.sin(a) * ring * radiusKm]);
    }
  }
  return taps;
}

/**
 * Grounded ice thickness in metres at each point and date (section 5.2).
 * With smoothing, the polar ice sheets get a smooth surface: the bed plus ice
 * is averaged over a disc and the bed subtracted again, so the relief under
 * the ice and small ice-free patches do not show through.
 */
export function iceThickness(
  ice: TimeStack,
  lats: Float64Array,
  lons: Float64Array,
  yearsBP: number,
  smoothing?: IceSmoothing,
): Uint16Array {
  const out = new Uint16Array(lats.length);
  const northTaps = smoothing ? discTaps(POLAR_ICE_RADIUS_KM) : [];
  const southTaps = smoothing ? discTaps(ANTARCTIC_ICE_RADIUS_KM) : [];
  for (let k = 0; k < lats.length; k++) {
    const lat = lats[k]!;
    const lon = lons[k]!;
    let m = ice.sample(lat, lon, yearsBP) ?? 0;
    const w = smoothing ? smoothing.weight(lat) : 0;
    if (smoothing && w > 0) {
      const taps = lat < ANTARCTIC_LAT ? southTaps : northTaps;
      const kmPerLon = Math.max(1, 111.32 * Math.cos((lat * Math.PI) / 180));
      let iceSum = 0;
      let surfaceSum = 0;
      let iceTaps = 0;
      for (const [east, north] of taps) {
        const la = Math.max(-90, Math.min(90, lat + north / 111.32));
        const lo = lon + east / kmPerLon;
        const t = ice.sample(la, lo, yearsBP) ?? 0;
        iceSum += t;
        if (t > 0) {
          surfaceSum += smoothing.bed(la, lo) + t;
          iceTaps++;
        }
      }
      const mean = iceSum / taps.length;
      // Where the disc is mostly ice, the ice keeps a smooth surface; at the
      // edges the thickness itself is averaged so the border is smooth.
      const smooth =
        mean > 300 ? Math.max(mean * 0.25, surfaceSum / iceTaps - smoothing.bed(lat, lon)) : mean;
      m = m * (1 - w) + smooth * w;
      // Antarctica's coast is almost all ice: ice reaches the shore wherever
      // the disc holds any, so no strip of bare land is left around it.
      if (lat < ANTARCTIC_LAT && iceTaps > 0 && smoothing.bed(lat, lon) > 0) m = Math.max(m, 150);
    }
    out[k] = Math.round(Math.max(0, Math.min(65535, m)));
  }
  return out;
}

/** Precipitation (mm a year) for no desert, and for full desert (section 4.3). */
export const GREEN_MM = 600;
export const DESERT_MM = 100;

/** Aridity 0..1000 at each point and date from the annual precipitation (section 4.3). */
export function aridity(
  precipitation: TimeStack,
  lats: Float64Array,
  lons: Float64Array,
  yearsBP: number,
): Uint16Array {
  const out = new Uint16Array(lats.length);
  for (let k = 0; k < lats.length; k++) {
    const mm = precipitation.sample(lats[k]!, lons[k]!, yearsBP);
    if (mm === undefined) continue;
    const a = (GREEN_MM - mm) / (GREEN_MM - DESERT_MM);
    out[k] = Math.round(Math.max(0, Math.min(1, a)) * 1000);
  }
  return out;
}

/**
 * Global mean sea level (m) at each layer of the relative sea level stack:
 * the area-weighted mean over today's ocean, where `isOcean` says a point is
 * sea today (section 5.1). Returns [yearsBP, metres] pairs, oldest first.
 */
export function meanSeaLevel(
  seaLevel: TimeStack,
  isOcean: (lat: number, lon: number) => boolean,
): [number, number][] {
  const h = seaLevel.header;
  const points: [number, number][] = [];
  const mask: number[] = [];
  const weights: number[] = [];
  for (let r = 0; r < h.height; r++) {
    const lat = h.north - r * h.cellDegrees;
    const w = Math.cos((lat * Math.PI) / 180);
    if (w <= 0) continue;
    for (let c = 0; c < h.width; c++) {
      const lon = h.west + c * h.cellDegrees;
      if (lon >= 180) continue;
      if (!isOcean(lat, lon)) continue;
      mask.push(r * h.width + c);
      weights.push(w);
    }
  }
  seaLevel.yearsBP.forEach((bp, layer) => {
    let sum = 0;
    let total = 0;
    const base = layer * h.width * h.height;
    for (let k = 0; k < mask.length; k++) {
      sum += seaLevel.sampleIndex(base + mask[k]!) * weights[k]!;
      total += weights[k]!;
    }
    points.push([bp, Math.round((sum / total) * 10) / 10]);
  });
  return points;
}
