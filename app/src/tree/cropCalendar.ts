// The stage of a crop on a day (spec neolithic/fields-and-crops.md section 2): a pure function of the
// whole-day day of the year, the crop and the latitude. Integer and + - * / only: no trigonometry,
// no randomness, no clock.

export type Season = 'autumn' | 'spring' | 'rains';

export interface CropCalendar {
  season: Season;
  /** Sowing day of the year in the northern hemisphere, 0 = 1 January. */
  sow: number;
  /** Days after sowing at which the stage reaches 0.25, 0.5, 0.75; the harvest (stage 1) and the ploughing (stage 0). */
  emerge: number;
  green: number;
  ripe: number;
  harvest: number;
  plough: number;
}

const DAYS = 365;
const RAINS_NORTH = 152;
const RAINS_SOUTH = 319;
const SOUTH_SHIFT = 182;

const winter = (sow: number, e: number, g: number, r: number, h: number, p: number) => ({
  season: 'autumn' as const,
  sow,
  emerge: e,
  green: g,
  ripe: r,
  harvest: h,
  plough: p,
});
const spring = (sow: number, e: number, g: number, r: number, h: number, p: number) => ({
  season: 'spring' as const,
  sow,
  emerge: e,
  green: g,
  ripe: r,
  harvest: h,
  plough: p,
});
const rains = (e: number, g: number, r: number, h: number, p: number) => ({
  season: 'rains' as const,
  sow: RAINS_NORTH,
  emerge: e,
  green: g,
  ripe: r,
  harvest: h,
  plough: p,
});

export const CALENDARS: Record<string, CropCalendar> = {
  emmer: winter(305, 30, 120, 200, 215, 260),
  einkorn: winter(305, 30, 120, 200, 215, 260),
  barley: winter(305, 30, 120, 200, 215, 260),
  lentil: winter(320, 25, 100, 170, 185, 220),
  flax: spring(90, 14, 55, 95, 105, 150),
  millet: spring(120, 10, 45, 110, 125, 170),
  maize: spring(120, 12, 55, 120, 135, 190),
  squash: spring(130, 12, 50, 100, 115, 170),
  potato: spring(100, 20, 60, 120, 135, 190),
  quinoa: spring(100, 20, 60, 120, 135, 190),
  rice: rains(12, 55, 105, 120, 160),
  taro: rains(25, 90, 250, 280, 300),
  banana: rains(40, 120, 260, 290, 320),
};

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** The day of the year on which a crop is sown at a latitude (whole degrees, south negative). */
export function sowDay(crop: string, latitude: number): number {
  const cal = CALENDARS[crop];
  if (!cal) throw new Error(`Unknown crop ${crop}`);
  const lat = Math.round(latitude);
  const away = Math.max(0, Math.abs(lat) - 35);
  if (cal.season === 'rains') {
    if (Math.abs(lat) < 15) return lat < 0 ? RAINS_SOUTH : RAINS_NORTH;
    return lat < 0 ? mod(RAINS_NORTH + SOUTH_SHIFT, DAYS) : RAINS_NORTH;
  }
  // Spring comes later towards the poles; autumn sowing has to be earlier.
  const shift = cal.season === 'spring' ? Math.min(40, 2 * away) : -Math.min(20, away);
  return mod(cal.sow + shift + (lat < 0 ? SOUTH_SHIFT : 0), DAYS);
}

/**
 * Stage 0 (bare), 0.25 (sprout), 0.5 (green), 0.75 (ripe), 1 (stubble) and in between, of a crop on a
 * day of the year at a latitude. `fieldOffsetDays` (0 to 14) is the field's own delay of sowing.
 */
export function cropStage(
  crop: string,
  dayOfYear: number,
  latitude: number,
  fieldOffsetDays = 0,
): number {
  const cal = CALENDARS[crop];
  if (!cal) throw new Error(`Unknown crop ${crop}`);
  const d = mod(Math.floor(dayOfYear) - sowDay(crop, latitude) - Math.floor(fieldOffsetDays), DAYS);
  if (d >= cal.plough) return 0;
  if (d >= cal.harvest) return 1;
  if (d >= cal.ripe) return 0.75;
  if (d >= cal.green) return 0.5 + (0.25 * (d - cal.green)) / (cal.ripe - cal.green);
  if (d >= cal.emerge) return 0.25 + (0.25 * (d - cal.emerge)) / (cal.green - cal.emerge);
  return (0.25 * d) / cal.emerge;
}
