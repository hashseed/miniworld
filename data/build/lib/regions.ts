// Coarse lookup from a place to its world region, which is its timeline lane,
// used to pick the regional lane of the collapsed timeline (spec milestone 1,
// section 7.1; region ids from data/curated/vocab/regions.yaml). Deliberately
// approximate.

export const REGION_CELL_DEGREES = 5;

export function regionAt(lat: number, lon: number): string {
  if (lon < -25 || lon > 170) {
    // The Americas, except the central and south Pacific.
    if (lat < 25 && (lon > 170 || lon < -120)) return 'oceania';
    return 'americas';
  }
  if (lat < -10 && lon > 110) return 'oceania';
  if (lat < 0 && lon > 125) return 'oceania';
  if (lon >= 92) {
    // Siberia and Mongolia, then the mainland and islands of Southeast Asia.
    if (lat >= 50 || (lat >= 42 && lon < 122)) return 'central-asia';
    if (lat < 22 || (lon < 100 && lat < 28)) return 'southeast-asia';
    return 'east-asia';
  }
  // The steppe and oases east of the Caspian, and Xinjiang.
  if (lon >= 52 && lat >= 37) return 'central-asia';
  if (lon >= 60) return 'south-asia';
  // Africa, Europe and the Middle East.
  if (lat >= 36 && lon < 45) return lat > 42 || lon < 26 ? 'europe' : 'mena';
  if (lat >= 36) return lat > 46 ? 'europe' : 'mena';
  if (lat > 35 && lon > -10 && lon < 36) return 'europe';
  if (lat >= 15) return 'mena';
  if (lon > 40 && lat > 12) return 'mena';
  return 'africa';
}

/**
 * Region grid as a string, one character (index into `regions`) per 5° cell,
 * rows from north. Throws if the lookup names a region missing from `regions`.
 */
export function regionGrid(regions: string[]): {
  cols: number;
  rows: number;
  lanes: string[];
  cells: string;
} {
  if (regions.length > 10) throw new Error('the region grid holds at most 10 regions');
  const cols = 360 / REGION_CELL_DEGREES;
  const rows = 180 / REGION_CELL_DEGREES;
  let cells = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lat = 90 - (r + 0.5) * REGION_CELL_DEGREES;
      const lon = -180 + (c + 0.5) * REGION_CELL_DEGREES;
      const region = regionAt(lat, lon);
      const i = regions.indexOf(region);
      if (i < 0) throw new Error(`region ${region} is not in vocab/regions.yaml`);
      cells += String(i);
    }
  }
  return { cols, rows, lanes: regions, cells };
}
