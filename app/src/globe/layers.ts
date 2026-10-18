// Height layers (spec milestone 1, section 4.2): land is drawn as stacked
// flat layers, like a cut contour model, with short steep steps between them.

/** Heights (m) of the layer tops, lowest first; above the last, every LAYER_TOP_STEP_M. */
export const LAYER_HEIGHTS = [0, 150, 300, 500, 800, 1200, 1600, 2000, 2500, 3000];
export const LAYER_TOP_STEP_M = 500;
/** Smallest half-width (m of height) of the step between two layers. */
export const MIN_STEP_HALF_M = 12;

/** Height (m) of the top of layer k. */
export function layerTop(k: number): number {
  const n = LAYER_HEIGHTS.length;
  return k < n ? LAYER_HEIGHTS[k]! : LAYER_HEIGHTS[n - 1]! + (k - n + 1) * LAYER_TOP_STEP_M;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Moves a land height onto its layer. Each step rises across ±stepHalfM of
 * height around the midpoint between two layers (at most half the gap), so
 * the step is as sharp as the vertex spacing allows without ever becoming a
 * jagged wall. Heights at or below 0 (the sea floor) are unchanged.
 */
export function layerHeight(h: number, stepHalfM: number): number {
  if (h <= 0) return h;
  let out = 0;
  for (let k = 0; ; k++) {
    const a = layerTop(k);
    const b = layerTop(k + 1);
    const half = Math.min(Math.max(stepHalfM, MIN_STEP_HALF_M), (b - a) / 2);
    const mid = (a + b) / 2;
    if (h <= mid - half) return out;
    out += (b - a) * smoothstep(mid - half, mid + half, h);
  }
}
