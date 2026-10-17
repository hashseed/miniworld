// Binary chunk formats shared by the data build and the app
// (spec milestone 1, section 10.5). All numbers are little-endian.

import { TILE_N, type TileKey } from '../globe/cube.ts';

/** Samples per terrain tile edge, including a one-sample border for normals. */
export const TERRAIN_BORDERED = TILE_N + 3;
export const TERRAIN_SAMPLES = TILE_N + 1;

/**
 * Ocean channel: values 0..OCEAN_TOP give the sea level (−130 m + v) at which
 * a sample is sea. The build smooths this level across coasts (section 5.1),
 * so values above the highest sea level still vary smoothly inland.
 */
export const OCEAN_MIN_LEVEL = -130;
/** Highest sea level in metres above OCEAN_MIN_LEVEL that the flood fill considers. */
export const OCEAN_RANGE = 140;
/** Highest stored ocean value; land that never joins the ocean is stored at OCEAN_MIN_LEVEL + 170 = +40 m. */
export const OCEAN_TOP = 170;
/** Raw flood fill result for cells that never join the ocean (build only). */
export const OCEAN_NEVER = 250;

export interface TerrainTile {
  key: TileKey;
  /** Heights in metres, TERRAIN_BORDERED², row-major (j, then i), starting one sample outside. */
  heights: Int16Array;
  /** Smoothed ocean level per sample, 0..OCEAN_TOP, TERRAIN_SAMPLES². */
  ocean: Uint8Array;
  /** Smooth lake field 0..255 per sample; a lake where it passes 128. */
  lakes: Uint8Array;
  /** Smooth river field 0..255 per sample; a river where it passes 128. */
  rivers: Uint8Array;
  /** River flow phase as cosine and sine, 128 ± 127, interleaved per sample. */
  flow: Uint8Array;
}

const TERRAIN_MAGIC = 0x3254574d; // "MWT2"

export function encodeTerrainTile(t: TerrainTile): Uint8Array {
  const hb = TERRAIN_BORDERED * TERRAIN_BORDERED * 2;
  const sb = TERRAIN_SAMPLES * TERRAIN_SAMPLES;
  const buf = new ArrayBuffer(16 + hb + sb * 5);
  const dv = new DataView(buf);
  dv.setUint32(0, TERRAIN_MAGIC, true);
  dv.setUint8(4, t.key.level);
  dv.setUint8(5, t.key.face);
  dv.setUint32(8, t.key.x, true);
  dv.setUint32(12, t.key.y, true);
  const out = new Uint8Array(buf);
  const h = new Int16Array(buf, 16, TERRAIN_BORDERED * TERRAIN_BORDERED);
  h.set(t.heights);
  out.set(t.ocean, 16 + hb);
  out.set(t.lakes, 16 + hb + sb);
  out.set(t.rivers, 16 + hb + sb * 2);
  out.set(t.flow, 16 + hb + sb * 3);
  return out;
}

export function decodeTerrainTile(bytes: ArrayBuffer): TerrainTile {
  const dv = new DataView(bytes);
  if (dv.getUint32(0, true) !== TERRAIN_MAGIC) throw new Error('Not a terrain tile');
  const key = {
    level: dv.getUint8(4),
    face: dv.getUint8(5),
    x: dv.getUint32(8, true),
    y: dv.getUint32(12, true),
  };
  const hb = TERRAIN_BORDERED * TERRAIN_BORDERED * 2;
  const sb = TERRAIN_SAMPLES * TERRAIN_SAMPLES;
  return {
    key,
    heights: new Int16Array(bytes.slice(16, 16 + hb)),
    ocean: new Uint8Array(bytes, 16 + hb, sb),
    lakes: new Uint8Array(bytes, 16 + hb + sb, sb),
    rivers: new Uint8Array(bytes, 16 + hb + sb * 2, sb),
    flow: new Uint8Array(bytes, 16 + hb + sb * 3, sb * 2),
  };
}

/** Ice tiles use a coarser grid (spec milestone 1, section 5.2). */
export const ICE_LEVEL = 3;
export const ICE_N = 32;
export const ICE_SAMPLES = ICE_N + 1;

export interface IceChunk {
  key: TileKey;
  /** Day of each slice, ascending. */
  days: number[];
  /** Ice thickness in metres per slice, ICE_SAMPLES² each. */
  thickness: Uint16Array[];
  /** Aridity per slice from 0 (green) to 1000 (full desert), ICE_SAMPLES² each (section 4.3). */
  aridity: Uint16Array[];
}

const ICE_MAGIC = 0x3245434d; // "MCE2", thickness then aridity

export function encodeIceChunk(c: IceChunk): Uint8Array {
  const per = ICE_SAMPLES * ICE_SAMPLES;
  const header = 16 + c.days.length * 4;
  const buf = new ArrayBuffer(header + c.days.length * per * 4);
  const dv = new DataView(buf);
  dv.setUint32(0, ICE_MAGIC, true);
  dv.setUint8(4, c.key.level);
  dv.setUint8(5, c.key.face);
  dv.setUint16(6, c.days.length, true);
  dv.setUint32(8, c.key.x, true);
  dv.setUint32(12, c.key.y, true);
  c.days.forEach((d, i) => dv.setInt32(16 + i * 4, d, true));
  c.thickness.forEach((t, i) => new Uint16Array(buf, header + i * per * 2, per).set(t));
  const aridityStart = header + c.days.length * per * 2;
  c.aridity.forEach((a, i) => new Uint16Array(buf, aridityStart + i * per * 2, per).set(a));
  return new Uint8Array(buf);
}

export function decodeIceChunk(bytes: ArrayBuffer): IceChunk {
  const dv = new DataView(bytes);
  if (dv.getUint32(0, true) !== ICE_MAGIC) throw new Error('Not an ice chunk');
  const count = dv.getUint16(6, true);
  const key = {
    level: dv.getUint8(4),
    face: dv.getUint8(5),
    x: dv.getUint32(8, true),
    y: dv.getUint32(12, true),
  };
  const per = ICE_SAMPLES * ICE_SAMPLES;
  const header = 16 + count * 4;
  const days: number[] = [];
  const thickness: Uint16Array[] = [];
  const aridity: Uint16Array[] = [];
  const aridityStart = header + count * per * 2;
  for (let i = 0; i < count; i++) {
    days.push(dv.getInt32(16 + i * 4, true));
    thickness.push(new Uint16Array(bytes.slice(header + i * per * 2, header + (i + 1) * per * 2)));
    aridity.push(
      new Uint16Array(bytes.slice(aridityStart + i * per * 2, aridityStart + (i + 1) * per * 2)),
    );
  }
  return { key, days, thickness, aridity };
}
