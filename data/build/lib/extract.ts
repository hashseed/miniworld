// Simplified source extracts (spec milestone 1, section 2.2). Each extract is
// a stack of global grids in a Brotli-compressed little-endian binary file,
// `<name>.bin.br`, described by a JSON header, `<name>.json`. Layers are
// stored one after another, rows from north to south, columns from west to
// east.

import { readFileSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';

export type ExtractType = 'int16' | 'uint8';

export interface ExtractHeader {
  source: string;
  variable: string;
  description: string;
  units: string;
  type: ExtractType;
  /** Stored value × scale = value in units. */
  scale: number;
  /** Stored value meaning "no data" (for example sea in a land-only grid). */
  nodata?: number;
  width: number;
  height: number;
  /**
   * "cell": values are cell averages, cell (c, r) spans west + c·Δ .. west +
   * (c+1)·Δ and north - r·Δ .. north - (r+1)·Δ. "node": values are point
   * samples at west + c·Δ, north - r·Δ.
   */
  registration: 'cell' | 'node';
  west: number;
  north: number;
  cellDegrees: number;
  /** Years before present (1950) of each layer, oldest first; absent for a single layer. */
  yearsBP?: number[];
}

export type ExtractData = Int16Array | Uint8Array;

export function writeExtract(basePath: string, header: ExtractHeader, data: ExtractData): void {
  const layers = header.yearsBP?.length ?? 1;
  if (data.length !== header.width * header.height * layers)
    throw new Error(`${header.variable}: extract size mismatch`);
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const packed = brotliCompressSync(bytes, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_LGWIN]: 24,
      [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
    },
  });
  writeFileSync(`${basePath}.bin.br`, packed);
  writeFileSync(`${basePath}.json`, `${JSON.stringify(header, null, 2)}\n`);
}

export function readExtract(basePath: string): { header: ExtractHeader; data: ExtractData } {
  const header = JSON.parse(readFileSync(`${basePath}.json`, 'utf8')) as ExtractHeader;
  const raw = brotliDecompressSync(readFileSync(`${basePath}.bin.br`));
  const bytes = new Uint8Array(raw.byteLength);
  bytes.set(raw);
  const data = header.type === 'int16' ? new Int16Array(bytes.buffer) : bytes;
  const layers = header.yearsBP?.length ?? 1;
  if (data.length !== header.width * header.height * layers)
    throw new Error(`${basePath}: extract size mismatch`);
  return { header, data };
}
