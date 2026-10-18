// Global latitude-longitude grids used by the offline data build. Cells are
// centred: cell (c, r) covers longitude -180 + c·Δ .. -180 + (c+1)·Δ and
// latitude 90 - r·Δ .. 90 - (r+1)·Δ.

export type GridData = Int16Array | Float32Array | Uint8Array | Uint16Array;

export class Grid<T extends GridData = Int16Array> {
  readonly width: number;
  readonly height: number;
  readonly data: T;

  constructor(width: number, height: number, data: T) {
    if (data.length !== width * height) throw new Error('Grid size mismatch');
    this.width = width;
    this.height = height;
    this.data = data;
  }

  get cellDegrees(): number {
    return 360 / this.width;
  }

  /** Fractional column and row of a point. */
  position(lat: number, lon: number): { c: number; r: number } {
    const c = ((lon + 180) / 360) * this.width - 0.5;
    const r = ((90 - lat) / 180) * this.height - 0.5;
    return { c, r };
  }

  at(c: number, r: number): number {
    const w = this.width;
    const cc = ((c % w) + w) % w;
    const rr = r < 0 ? 0 : r >= this.height ? this.height - 1 : r;
    return this.data[rr * w + cc]!;
  }

  index(c: number, r: number): number {
    const w = this.width;
    return r * w + (((c % w) + w) % w);
  }

  nearest(lat: number, lon: number): number {
    const { c, r } = this.position(lat, lon);
    return this.at(Math.round(c), Math.round(r));
  }

  bilinear(lat: number, lon: number): number {
    const { c, r } = this.position(lat, lon);
    const c0 = Math.floor(c);
    const r0 = Math.floor(r);
    const fc = c - c0;
    const fr = r - r0;
    const a = this.at(c0, r0);
    const b = this.at(c0 + 1, r0);
    const d = this.at(c0, r0 + 1);
    const e = this.at(c0 + 1, r0 + 1);
    return (a * (1 - fc) + b * fc) * (1 - fr) + (d * (1 - fc) + e * fc) * fr;
  }

  /** Halves the resolution by averaging 2×2 cells. */
  downsampleMean(): Grid<Float32Array> {
    const w = this.width >> 1;
    const h = this.height >> 1;
    const out = new Float32Array(w * h);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const i = 2 * r * this.width + 2 * c;
        out[r * w + c] =
          (this.data[i]! +
            this.data[i + 1]! +
            this.data[i + this.width]! +
            this.data[i + this.width + 1]!) /
          4;
      }
    }
    return new Grid(w, h, out);
  }
}

/** A chain of grids, each half the resolution of the previous. */
export class GridPyramid {
  readonly levels: Grid<GridData>[];

  constructor(base: Grid<GridData>, minWidth = 256) {
    this.levels = [base];
    let g: Grid<GridData> = base;
    while (g.width / 2 >= minWidth && g.width % 2 === 0 && g.height % 2 === 0) {
      g = g.downsampleMean();
      this.levels.push(g);
    }
  }

  /** Coarsest grid whose cells are no larger than the spacing (degrees); the base grid if none is. */
  forSpacing(spacingDeg: number): Grid<GridData> {
    let best = this.levels[0]!;
    for (const g of this.levels) {
      if (g.cellDegrees <= spacingDeg) best = g;
    }
    return best;
  }
}
