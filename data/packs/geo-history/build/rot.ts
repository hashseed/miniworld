// Reader for a PLATES rotation file (.rot), the rotation model of the plate
// model (geo-history.md, section 4). Each line is
//   moving-plate age pole-lat pole-lon angle fixed-plate ! comment
// a finite rotation of the moving plate relative to the fixed plate at that age.

export interface RotationRow {
  plate: number;
  /** Age in Ma. */
  age: number;
  /** Pole latitude and longitude in degrees. */
  lat: number;
  lon: number;
  /** Rotation angle in degrees. */
  angle: number;
  fixed: number;
}

export function parseRot(text: string): RotationRow[] {
  const rows: RotationRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const body = line.split('!')[0]!.trim();
    if (!body) continue;
    const f = body.split(/\s+/);
    if (f.length < 6) continue;
    const row: RotationRow = {
      plate: Number(f[0]),
      age: Number(f[1]),
      lat: Number(f[2]),
      lon: Number(f[3]),
      angle: Number(f[4]),
      fixed: Number(f[5]),
    };
    if ([row.plate, row.age, row.lat, row.lon, row.angle, row.fixed].some(Number.isNaN)) continue;
    rows.push(row);
  }
  return rows;
}
