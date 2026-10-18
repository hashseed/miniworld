// Coarse lookup from a place to its timeline lane, used to pick the regional
// lane on phones (spec milestone 1, section 7.1). Deliberately approximate.

export const REGION_LANES = [
  'europe',
  'mena',
  'africa',
  'southAsia',
  'eastAsia',
  'americas',
  'oceania',
];
export const REGION_CELL_DEGREES = 5;

export function regionAt(lat: number, lon: number): string {
  if (lon < -25 || lon > 170) {
    // The Americas, except the central and south Pacific.
    if (lat < 25 && (lon > 170 || lon < -120)) return 'oceania';
    return 'americas';
  }
  if (lat < -10 && lon > 110) return 'oceania';
  if (lat < 0 && lon > 125) return 'oceania';
  if (lon >= 60 && lon < 92 && lat >= 5 && lat < 37) return 'southAsia';
  if (lon >= 92) return lat < -10 ? 'oceania' : 'eastAsia';
  if (lon >= 60) return lat >= 37 ? (lon < 75 ? 'mena' : 'eastAsia') : 'southAsia';
  // Africa, Europe and the Middle East.
  if (lat >= 36 && lon < 45) return lat > 42 || lon < 26 ? 'europe' : 'mena';
  if (lat >= 30 && lon < 36 && lon > -10 && lat > 35) return 'europe';
  if (lat >= 15) return 'mena';
  if (lon > 40 && lat > 12) return 'mena';
  return 'africa';
}

/** Region grid as a string, one character (lane index) per 5° cell, rows from north. */
export function regionGrid(): { cols: number; rows: number; lanes: string[]; cells: string } {
  const cols = 360 / REGION_CELL_DEGREES;
  const rows = 180 / REGION_CELL_DEGREES;
  let cells = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lat = 90 - (r + 0.5) * REGION_CELL_DEGREES;
      const lon = -180 + (c + 0.5) * REGION_CELL_DEGREES;
      cells += String(REGION_LANES.indexOf(regionAt(lat, lon)));
    }
  }
  return { cols, rows, lanes: REGION_LANES, cells };
}
