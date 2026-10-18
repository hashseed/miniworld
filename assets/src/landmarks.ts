// Landmark models of Giza (spec giza.md, sections 3, 8 and 11): the three
// pyramids at any point of their construction and in their later states, the
// Great Sphinx with and without its sand and nose, and the stone sledge the
// building crews haul. Life size in metres, +X east, +Y up, +Z south, centred
// on the base. The shapes come from a few numbers, which the app also uses to
// stand figures on what is drawn (pyramidSurface).

import * as THREE from 'three';
import { type Model, type Vec3, ModelBuilder, blob, box, shade } from './kit.ts';

export interface PyramidSize {
  /** Side of the square base in metres. */
  base: number;
  height: number;
  /** Share of the height cased in red granite from the ground up. */
  granite: number;
  /** Whether the granite casing was left rough (Menkaure). */
  rough?: boolean;
  /** Share of the height of the casing cap that survives today near the top (Khafre). */
  cap?: number;
}

/** Sizes after Lehner and Hawass, Giza and the Pyramids (2017). */
export const PYRAMIDS = {
  khufu: { base: 230.3, height: 146.6, granite: 0 },
  khafre: { base: 215.3, height: 143.5, granite: 0.03, cap: 0.22 },
  menkaure: { base: 103.4, height: 65.5, granite: 0.25, rough: true },
} as const satisfies Record<string, PyramidSize>;
export type PyramidId = keyof typeof PYRAMIDS;

/** The finished and later states of a pyramid; construction is drawn by `rise`. */
export type PyramidState = 'complete' | 'stripping' | 'stepped' | 'gash';

export type SphinxState = 'new' | 'sand' | 'cleared' | 'sand-noseless' | 'today';

/** Every landmark asset, with what it draws. */
export const LANDMARK_ASSETS = {
  'giza-khufu': { pyramid: 'khufu', state: 'complete' },
  'giza-khufu-stripping': { pyramid: 'khufu', state: 'stripping' },
  'giza-khufu-stepped': { pyramid: 'khufu', state: 'stepped' },
  'giza-khafre': { pyramid: 'khafre', state: 'complete' },
  'giza-khafre-stepped': { pyramid: 'khafre', state: 'stepped' },
  'giza-menkaure': { pyramid: 'menkaure', state: 'complete' },
  'giza-menkaure-gash': { pyramid: 'menkaure', state: 'gash' },
  'giza-sphinx-new': { sphinx: 'new' },
  'giza-sphinx-sand': { sphinx: 'sand' },
  'giza-sphinx-cleared': { sphinx: 'cleared' },
  'giza-sphinx-sand-noseless': { sphinx: 'sand-noseless' },
  'giza-sphinx-today': { sphinx: 'today' },
} as const satisfies Record<
  string,
  { pyramid: PyramidId; state: PyramidState } | { sphinx: SphinxState }
>;
export type LandmarkAssetId = keyof typeof LANDMARK_ASSETS;

/** Props the building crews move about. */
export const PROPS = ['stone-sledge'] as const;
export type PropId = (typeof PROPS)[number];

/**
 * Length of the model Sphinx from paws to tail, in metres: chunky toy
 * proportions, shorter than the real 73 m for its 20 m height, so it reads
 * as a lion when drawn large (giza.md section 11.2).
 */
export const SPHINX_LENGTH = 46;

/** Visible tiers of the stepped core: chunky clay steps, not the 200 real courses. */
const TIERS = 24;
/** Share of the build in which the core rises; after it the casing is laid from the top down. */
export const CORE_SHARE = 0.85;

const CORE = '#d6bc8a';
const CASING = '#f2ebd9';
const GRANITE = '#b0645a';
const SAND = '#e3c690';
const SPHINX = '#d9bd8c';
const GASH = '#8a7356';

/** What of a pyramid is drawn at a moment: the core's height and the casing. */
export interface PyramidShape {
  /** Height of the stepped core in metres, in whole tiers. */
  core: number;
  /** The casing covers the faces from this height in metres to the apex; Infinity for none. */
  casingFrom: number;
  /** Height at which the stepped top is cut flat (Khufu has lost its top stones). */
  top: number;
  gash: boolean;
}

/** The shape of a pyramid at a fraction `rise` of its build, or in a finished state. */
export function pyramidShape(id: PyramidId, rise: number | PyramidState): PyramidShape {
  const p: PyramidSize = PYRAMIDS[id];
  const H = p.height;
  const tier = H / TIERS;
  if (typeof rise === 'number') {
    const f = Math.min(1, Math.max(0, rise));
    const coreF = Math.min(1, f / CORE_SHARE);
    const core = Math.floor(coreF * TIERS + 1e-9) * tier;
    // The casing goes on from the apex down.
    const lay = f <= CORE_SHARE ? 0 : (f - CORE_SHARE) / (1 - CORE_SHARE);
    const casingFrom = f <= CORE_SHARE ? Infinity : Math.floor((1 - lay) * TIERS + 1e-9) * tier;
    return { core, casingFrom, top: H, gash: false };
  }
  switch (rise) {
    case 'complete':
      return { core: H, casingFrom: 0, top: H, gash: false };
    case 'gash':
      return { core: H, casingFrom: 0, top: H, gash: true };
    case 'stripping':
      return { core: H, casingFrom: H * 0.5, top: H, gash: false };
    case 'stepped': {
      const top = id === 'khufu' ? H * 0.94 : H;
      return {
        core: top,
        casingFrom: p.cap ? H * (1 - p.cap) : Infinity,
        top,
        gash: false,
      };
    }
  }
}

/**
 * Height in metres of the drawn pyramid over a point (x east, z north of the
 * centre, in metres).
 */
export function pyramidSurface(id: PyramidId, shape: PyramidShape, x: number, z: number): number {
  const p: PyramidSize = PYRAMIDS[id];
  const b = p.base / 2;
  const H = p.height;
  const m = Math.max(Math.abs(x), Math.abs(z));
  let h = 0;
  if (m < b) {
    const slope = (b - m) * (H / b);
    const cased = slope >= shape.casingFrom;
    const tier = H / TIERS;
    const stepped = Math.floor(slope / tier) * tier;
    h = Math.min(cased ? slope : stepped, shape.core, shape.top);
  }
  return h;
}

/** A square slab from y0 to y1 with half-widths at the bottom and top. */
function frustum(y0: number, y1: number, h0: number, h1: number): THREE.BufferGeometry {
  const v: number[] = [];
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
  const c0: Vec3[] = [
    [-h0, y0, -h0],
    [h0, y0, -h0],
    [h0, y0, h0],
    [-h0, y0, h0],
  ];
  const c1: Vec3[] = [
    [-h1, y1, -h1],
    [h1, y1, -h1],
    [h1, y1, h1],
    [-h1, y1, h1],
  ];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(c0[j]!, c0[i]!, c1[i]!, c1[j]!);
  }
  if (h1 > 0) quad(c1[0]!, c1[3]!, c1[2]!, c1[1]!);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** Builds a pyramid of a given shape (see pyramidShape). */
export function buildPyramid(id: PyramidId, shape: PyramidShape): Model {
  const p: PyramidSize = PYRAMIDS[id];
  const H = p.height;
  const b = p.base / 2;
  const tier = H / TIERS;
  // Clay lumps scale with each part, so these huge parts get only a light press.
  const mb = new ModelBuilder([], 0.15);
  const half = (y: number) => b * (1 - y / H);
  const coreTop = Math.min(shape.core, shape.top);
  // The stepped core: one slab per tier, stopping where the casing takes over.
  const coreEnd = Math.min(coreTop, shape.casingFrom);
  for (let y = 0; y < coreEnd - 1e-6; y += tier) {
    const y1 = Math.min(y + tier, coreEnd);
    mb.add(
      box([-half(y1), y, -half(y1)], [half(y1), y1, half(y1)]),
      shade(CORE, ((y / tier) % 2) * 0.05),
    );
  }
  // The smooth casing from casingFrom to the top of the core.
  if (shape.casingFrom < coreTop) {
    const top = coreTop >= H - 1e-6 ? 0 : half(coreTop);
    const graniteTop = p.granite * H;
    if (shape.casingFrom < graniteTop) {
      mb.add(
        frustum(shape.casingFrom, graniteTop, half(shape.casingFrom), half(graniteTop)),
        p.rough ? shade(GRANITE, -0.1) : GRANITE,
      );
    }
    const from = Math.max(shape.casingFrom, graniteTop);
    mb.add(frustum(from, coreTop, half(from), top), CASING);
  } else if (coreTop > 0 && coreTop < H - 1e-6) {
    // A flat working platform on the unfinished core.
    mb.add(
      box([-half(coreTop), coreTop - 0.5, -half(coreTop)], [half(coreTop), coreTop, half(coreTop)]),
      shade(CORE, 0.08),
    );
  }
  if (shape.gash) {
    // The cut left in the north face in 1196 (giza.md section 5).
    const y = H * 0.12;
    mb.add(box([-b * 0.12, y, -half(y) - 1], [b * 0.12, H * 0.45, -half(H * 0.45) + 4]), GASH);
  }
  return mb.build(`pyramid-${id}`);
}

/** Builds the Great Sphinx, facing east (+X), its paws at x = SPHINX_LENGTH / 2. */
export function buildSphinx(state: SphinxState): Model {
  const L = SPHINX_LENGTH;
  const mb = new ModelBuilder([], 0.3);
  const painted = state === 'new';
  const body = painted ? '#c98f5c' : SPHINX;
  const nose = state === 'new' || state === 'sand' || state === 'cleared';
  const sand = state === 'sand' || state === 'sand-noseless';
  // Lying lion: body, haunches, front legs and paws.
  mb.add(blob([-L * 0.08, 6.5, 0], [L * 0.36, 6.5, 6.8], 8), body);
  mb.add(blob([-L * 0.34, 5, 0], [L * 0.14, 5, 7.5], 7), shade(body, -0.04));
  for (const s of [1, -1]) {
    mb.add(blob([L * 0.32, 1.6, s * 4], [L * 0.17, 1.6, 2.2], 6), shade(body, -0.02));
  }
  mb.add(blob([-L * 0.47, 1.2, 4], [4, 1.1, 1.3], 5), body);
  // Head with the royal headcloth, its lappets falling to the chest.
  const headX = L * 0.24;
  const headY = 15.5;
  const cloth = painted ? '#d9b84a' : shade(SPHINX, 0.06);
  mb.add(blob([headX - 1, headY + 0.5, 0], [4.4, 4.8, 5.6], 7), cloth);
  for (const s of [1, -1]) mb.add(blob([headX + 1, headY - 4, s * 4.2], [1.6, 4, 1.2], 5), cloth);
  if (painted)
    for (const y of [headY + 3, headY + 1, headY - 1])
      mb.add(blob([headX - 1.2, y, 0], [4.5, 0.4, 5.7], 6), '#3d6fa8');
  mb.add(blob([headX + 2, headY - 0.5, 0], [2.6, 3.8, 3.4], 6), body);
  mb.add(blob([headX + 1.5, headY - 3.8, 0], [2.2, 1.4, 2.6], 5), shade(body, -0.05));
  if (nose) mb.add(blob([headX + 4.6, headY - 0.6, 0], [1.1, 1.2, 0.8], 4), body);
  if (sand) {
    // Sand drifted up to the chest, leaving the head and back above it.
    mb.add(blob([-L * 0.05, 0, 0], [L * 0.62, 10, 15], 8), SAND);
  }
  if (state === 'cleared' || state === 'today') {
    // The Dream Stela of Thutmose IV between the paws.
    mb.add(box([L * 0.36, 0, -1.6], [L * 0.36 + 0.8, 3.6, 1.6]), '#cfc2a6');
  }
  if (state === 'cleared') {
    // Thutmose IV's mudbrick walls against the sand.
    for (const s of [1, -1])
      mb.add(box([-L * 0.55, 0, s * 18 - 1], [L * 0.55, 2.2, s * 18 + 1]), '#9c7a54');
  }
  return mb.build(`sphinx-${state}`);
}

/** Builds a wooden sledge with a limestone block, facing +Z, for the hauling crews. */
export function buildProp(id: PropId): Model {
  const mb = new ModelBuilder([], 0.6);
  switch (id) {
    case 'stone-sledge':
      for (const s of [1, -1])
        mb.add(box([s * 0.55 - 0.12, 0, -1.3], [s * 0.55 + 0.12, 0.22, 1.3]), '#7a5030');
      for (const z of [-0.9, 0, 0.9])
        mb.add(box([-0.75, 0.22, z - 0.1], [0.75, 0.34, z + 0.1]), '#8a5f38');
      mb.add(box([-0.7, 0.34, -0.8], [0.7, 1.3, 0.8]), CORE);
      break;
  }
  return mb.build(id);
}

/** Builds any landmark asset. */
export function buildLandmarkAsset(id: LandmarkAssetId, rise?: number): Model {
  const a = LANDMARK_ASSETS[id] as {
    pyramid?: PyramidId;
    state?: PyramidState;
    sphinx?: SphinxState;
  };
  if (a.sphinx) return buildSphinx(a.sphinx);
  return buildPyramid(a.pyramid!, pyramidShape(a.pyramid!, rise ?? a.state!));
}
