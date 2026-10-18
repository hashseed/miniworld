// Snow caps on the mountains (spec milestone 1, section 5.2), shared by the
// terrain shader, which draws them as ice, and the foliage, which keeps
// plants off them.

/** Least height in metres a cap stands above the smoothed bed. */
export const CAP_PROMINENCE_M = 300;
/**
 * Km of ice distance per metre of snow cap, so caps and ice sheets share one
 * field and one ink outline where they meet.
 */
export const CAP_KM_PER_M = 0.1;
/** Degrees the snow line moves towards the equator at the glacial maximum. */
export const SNOW_GLACIAL_SHIFT_DEG = 12;
/** The snow line: [absolute latitude, metres], flat outside the table. */
export const SNOW_LINE: [number, number][] = [
  [20, 3600],
  [28, 3000],
  [36, 1600],
  [46, 1500],
  [65, 800],
  [75, 400],
];

/** Snow line in metres at an absolute latitude, shifted by the glacial index. */
export function snowLine(absLat: number, glacialIndex: number): number {
  const x = absLat + glacialIndex * SNOW_GLACIAL_SHIFT_DEG;
  if (x <= SNOW_LINE[0]![0]) return SNOW_LINE[0]![1];
  for (let i = 1; i < SNOW_LINE.length; i++) {
    const [x1, y1] = SNOW_LINE[i]!;
    if (x < x1) {
      const [x0, y0] = SNOW_LINE[i - 1]!;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return SNOW_LINE[SNOW_LINE.length - 1]![1];
}

/**
 * Metres a place stands above the snow line, or above the smoothed bed by
 * more than CAP_PROMINENCE_M, whichever is lower: positive under a cap. So
 * caps sit on peaks and ranges but not on flat high plateaus such as Tibet
 * or the Altiplano.
 */
export function snowCap(h: number, bed: number, absLat: number, glacialIndex: number): number {
  return Math.min(h - snowLine(absLat, glacialIndex), h - Math.max(bed, 0) - CAP_PROMINENCE_M);
}

const f = (v: number) => v.toFixed(1);

/** The same functions in GLSL. */
export const snowGlsl = /* glsl */ `
float snowLine(float alat, float glacialIndex) {
  float x = alat + glacialIndex * ${f(SNOW_GLACIAL_SHIFT_DEG)};
  float y = ${f(SNOW_LINE[0]![1])};
${SNOW_LINE.slice(1)
  .map(
    ([x1, y1], i) =>
      `  if (x > ${f(SNOW_LINE[i]![0])}) y = mix(${f(SNOW_LINE[i]![1])}, ${f(y1)}, clamp((x - ${f(SNOW_LINE[i]![0])}) / ${f(x1 - SNOW_LINE[i]![0])}, 0.0, 1.0));`,
  )
  .join('\n')}
  return y;
}
float snowCap(float h, float bed, float alat, float glacialIndex) {
  return min(h - snowLine(alat, glacialIndex), h - max(bed, 0.0) - ${f(CAP_PROMINENCE_M)});
}
`;
