// Cube-sphere quadtree geometry shared by the data build and the renderer
// (spec milestone 1, section 4.2). Directions use a Y-up frame: latitude
// +90° is +Y, longitude 0° is +Z and longitude +90° (east) is +X.

export const FACE_COUNT = 6;
/** Intervals per tile edge; a tile has (TILE_N + 1)² samples. */
export const TILE_N = 32;
/** Deepest level stored in data; deeper tiles interpolate it. */
export const DATA_MAX_LEVEL = 5;

export type Vec3 = [number, number, number];

export interface TileKey {
  face: number;
  level: number;
  x: number;
  y: number;
}

// Normal, u axis and v axis of each face.
const FACES: readonly [Vec3, Vec3, Vec3][] = [
  [
    [1, 0, 0],
    [0, 0, -1],
    [0, 1, 0],
  ], // +X
  [
    [-1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ], // -X
  [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, -1],
  ], // +Y (north)
  [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ], // -Y (south)
  [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
  ], // +Z
  [
    [0, 0, -1],
    [-1, 0, 0],
    [0, 1, 0],
  ], // -Z
];

const QUARTER_PI = Math.PI / 4;

/** Unit direction for face coordinates u, v in [-1, 1] (equal-angle warp). */
export function faceUvToDir(face: number, u: number, v: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const [n, a, b] = FACES[face]!;
  const s = Math.tan(u * QUARTER_PI);
  const t = Math.tan(v * QUARTER_PI);
  const x = n[0] + s * a[0] + t * b[0];
  const y = n[1] + s * a[1] + t * b[1];
  const z = n[2] + s * a[2] + t * b[2];
  const len = Math.hypot(x, y, z);
  out[0] = x / len;
  out[1] = y / len;
  out[2] = z / len;
  return out;
}

/** Face and face coordinates for a direction. */
export function dirToFaceUv(d: Vec3): { face: number; u: number; v: number } {
  const ax = Math.abs(d[0]);
  const ay = Math.abs(d[1]);
  const az = Math.abs(d[2]);
  let face: number;
  if (ax >= ay && ax >= az) face = d[0] > 0 ? 0 : 1;
  else if (ay >= az) face = d[1] > 0 ? 2 : 3;
  else face = d[2] > 0 ? 4 : 5;
  const [n, a, b] = FACES[face]!;
  const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
  const s = (d[0] * a[0] + d[1] * a[1] + d[2] * a[2]) / dn;
  const t = (d[0] * b[0] + d[1] * b[1] + d[2] * b[2]) / dn;
  return { face, u: Math.atan(s) / QUARTER_PI, v: Math.atan(t) / QUARTER_PI };
}

export function latLonToDir(latDeg: number, lonDeg: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  out[0] = Math.cos(lat) * Math.sin(lon);
  out[1] = Math.sin(lat);
  out[2] = Math.cos(lat) * Math.cos(lon);
  return out;
}

export function dirToLatLon(d: Vec3): { lat: number; lon: number } {
  const lat = (Math.asin(Math.max(-1, Math.min(1, d[1]))) * 180) / Math.PI;
  const lon = (Math.atan2(d[0], d[2]) * 180) / Math.PI;
  return { lat, lon };
}

/** Face coordinates of a tile's sample i, j (0..TILE_N, may extend beyond for borders). */
export function tileSampleUv(key: TileKey, i: number, j: number): { u: number; v: number } {
  const size = 2 / (1 << key.level);
  return {
    u: -1 + (key.x + i / TILE_N) * size,
    v: -1 + (key.y + j / TILE_N) * size,
  };
}

/** Tile containing face coordinates at a level. */
export function tileAt(face: number, u: number, v: number, level: number): TileKey {
  const n = 1 << level;
  const x = Math.min(n - 1, Math.max(0, Math.floor(((u + 1) / 2) * n)));
  const y = Math.min(n - 1, Math.max(0, Math.floor(((v + 1) / 2) * n)));
  return { face, level, x, y };
}

export function parentKey(key: TileKey): TileKey {
  return { face: key.face, level: key.level - 1, x: key.x >> 1, y: key.y >> 1 };
}

export function childKeys(key: TileKey): TileKey[] {
  const l = key.level + 1;
  const x = key.x * 2;
  const y = key.y * 2;
  return [
    { face: key.face, level: l, x, y },
    { face: key.face, level: l, x: x + 1, y },
    { face: key.face, level: l, x, y: y + 1 },
    { face: key.face, level: l, x: x + 1, y: y + 1 },
  ];
}

export function ancestorAt(key: TileKey, level: number): TileKey {
  const shift = key.level - level;
  return { face: key.face, level, x: key.x >> shift, y: key.y >> shift };
}

/** Quadtree path string, e.g. face 2 level 3 → "2/031". */
export function tilePath(key: TileKey): string {
  let path = '';
  for (let l = key.level - 1; l >= 0; l--) {
    const bx = (key.x >> l) & 1;
    const by = (key.y >> l) & 1;
    path += String(bx + 2 * by);
  }
  return `${key.face}/${path}`;
}

export function tileId(key: TileKey): string {
  return `${key.face}-${key.level}-${key.x}-${key.y}`;
}

/** Approximate tile edge length on the unit sphere (radians). */
export function tileAngularSize(level: number): number {
  return Math.PI / 2 / (1 << level);
}
