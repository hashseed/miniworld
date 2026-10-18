// Whole-day dates (spec milestone 1, section 3.1).
// A day number counts days since 1 January 2000 CE in the proleptic Gregorian
// calendar; years use astronomical numbering (1 BCE is year 0).

export type Day = number;

export interface CalendarDate {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

const DAYS_PER_ERA = 146097; // days in 400 Gregorian years
const EPOCH_OFFSET = 730425; // days from 0000-03-01 to 2000-01-01

function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Converts a calendar date to a day number (after H. Hinnant's days_from_civil). */
export function dayFromDate(year: number, month: number, day: number): Day {
  const y = month <= 2 ? year - 1 : year;
  const era = floorDiv(y, 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = floorDiv(153 * mp + 2, 5) + day - 1;
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  return era * DAYS_PER_ERA + doe - EPOCH_OFFSET;
}

/** Converts a day number to a calendar date. */
export function dateFromDay(dayNumber: Day): CalendarDate {
  const z = dayNumber + EPOCH_OFFSET;
  const era = floorDiv(z, DAYS_PER_ERA);
  const doe = z - era * DAYS_PER_ERA;
  const yoe = floorDiv(
    doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096),
    365,
  );
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100));
  const mp = floorDiv(5 * doy + 2, 153);
  const day = doy - floorDiv(153 * mp + 2, 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

/** Converts a display year with era (e.g. 50,000 BCE) to an astronomical year. */
export function astronomicalYear(year: number, era: 'BCE' | 'CE'): number {
  return era === 'BCE' ? 1 - year : year;
}

/** Day number of 1 January of an astronomical year. */
export function dayOfYearStart(year: number): Day {
  return dayFromDate(year, 1, 1);
}

const MEAN_YEAR_DAYS = 365.2425;

/**
 * Continuous astronomical year for a day, used only for rates and axes,
 * never stored in world state.
 */
export function continuousYear(dayNumber: number): number {
  return 2000 + dayNumber / MEAN_YEAR_DAYS;
}

export function dayFromContinuousYear(year: number): number {
  return (year - 2000) * MEAN_YEAR_DAYS;
}

export const DAYS_PER_YEAR = MEAN_YEAR_DAYS;

/** First day of the timeline: 1 January 70,000 BCE. */
export const TIMELINE_START: Day = dayOfYearStart(astronomicalYear(70000, 'BCE'));

/** Day the app opens at on first start: 1 January 50,000 BCE. */
export const OPENING_DAY: Day = dayOfYearStart(astronomicalYear(50000, 'BCE'));
