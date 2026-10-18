// Rasterising GeoJSON polygons and lines onto latitude-longitude grids.

export type Ring = number[][]; // [lon, lat] pairs
export type Polygon = Ring[];

export interface RasterTarget {
  width: number;
  height: number;
}

/** Calls fill(c, r) for every cell whose centre lies inside the polygon (even-odd rule). */
export function rasterizePolygon(
  target: RasterTarget,
  polygon: Polygon,
  fill: (c: number, r: number) => void,
): void {
  const { width, height } = target;
  let minLat = 90;
  let maxLat = -90;
  for (const ring of polygon)
    for (const p of ring) {
      minLat = Math.min(minLat, p[1]!);
      maxLat = Math.max(maxLat, p[1]!);
    }
  const r0 = Math.max(0, Math.floor(((90 - maxLat) / 180) * height));
  const r1 = Math.min(height - 1, Math.ceil(((90 - minLat) / 180) * height));
  const xs: number[] = [];
  for (let r = r0; r <= r1; r++) {
    const lat = 90 - ((r + 0.5) / height) * 180;
    xs.length = 0;
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!;
        const b = ring[j]!;
        if (a[1]! > lat !== b[1]! > lat) {
          xs.push(a[0]! + ((lat - a[1]!) / (b[1]! - a[1]!)) * (b[0]! - a[0]!));
        }
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.ceil(((xs[k]! + 180) / 360) * width - 0.5);
      const c1 = Math.floor(((xs[k + 1]! + 180) / 360) * width - 0.5);
      for (let c = c0; c <= c1; c++) fill(((c % width) + width) % width, r);
    }
  }
}

export interface GeoJsonFeature {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown } | null;
}

export function featurePolygons(f: GeoJsonFeature): Polygon[] {
  if (!f.geometry) return [];
  if (f.geometry.type === 'Polygon') return [f.geometry.coordinates as Polygon];
  if (f.geometry.type === 'MultiPolygon') return f.geometry.coordinates as Polygon[];
  return [];
}

export function featureLines(f: GeoJsonFeature): number[][][] {
  if (!f.geometry) return [];
  if (f.geometry.type === 'LineString') return [f.geometry.coordinates as number[][]];
  if (f.geometry.type === 'MultiLineString') return f.geometry.coordinates as number[][][];
  return [];
}
