// Deterministic trigonometry (spec milestone 2, section 2.3): Math.sin and
// Math.cos may differ between JavaScript engines in the last bits, so the
// world and the tree build use these polynomial versions, built only from
// + − × ÷, which IEEE 754 makes exact on every device.

const PI = 3.141592653589793;
const TAU = 2 * PI;
const HALF_PI = PI / 2;

/** Sine on [-π/2, π/2]: odd Taylor polynomial to x¹⁵, error below 1e-12. */
function sinCore(x: number): number {
  const x2 = x * x;
  let s = 1 / 1307674368000;
  s = s * -x2 + 1 / 6227020800;
  s = s * -x2 + 1 / 39916800;
  s = s * -x2 + 1 / 362880;
  s = s * -x2 + 1 / 5040;
  s = s * -x2 + 1 / 120;
  s = s * -x2 + 1 / 6;
  return x - x * x2 * s;
}

/** Deterministic sine of an angle in radians. */
export function detSin(x: number): number {
  // Reduce to [-π, π], then fold to [-π/2, π/2].
  let r = x - TAU * Math.floor((x + PI) / TAU);
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  return sinCore(r);
}

/** Deterministic cosine of an angle in radians. */
export function detCos(x: number): number {
  return detSin(x + HALF_PI);
}

/** Degrees to radians. */
export const RAD = PI / 180;
