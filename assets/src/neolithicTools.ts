// Neolithic hand tools and village props (docs/spec/neolithic/tools-and-village-props.md).
// Life size in metres, facing +Z, standing on y = 0. Where a prop has a hold point for a hand
// or a draught animal, or a moving part, the spec names it: `object.userData.holds` has the
// points and moving parts are bones.

import * as THREE from 'three';
import {
  type Model,
  type Pattern,
  type Vec3,
  ModelBuilder,
  STONE,
  blob,
  cone,
  horn,
  lathe,
  limb,
  rod,
  shade,
} from './kit.ts';

export const TOOL_PROPS = [
  'prop-sickle',
  'prop-digging-stick',
  'prop-hoe',
  'prop-ard',
  'prop-yoke',
  'prop-quern',
  'prop-basket',
  'prop-pot-small',
  'prop-pot-large',
  'prop-pot-jar',
  'prop-kiln',
  'prop-granary',
  'prop-silo-pit',
  'prop-pen',
  'prop-well',
] as const;
export type ToolPropId = (typeof TOOL_PROPS)[number];

export function isToolProp(id: string): id is ToolPropId {
  return (TOOL_PROPS as readonly string[]).includes(id);
}

// Real materials: oak is a light warm brown, never dark.
const OAK = '#c9a064';
const OAK_D = shade(OAK, -0.16);
const LEATHER = '#b98550';
const FLINT = '#80868d';
const STRAW = '#dcbf6a';
const THATCH = '#cdb26a';
const TERRA = '#c4683f';
const BUFF = '#e2c28f';
const RED = '#a8412a';
const EARTH = '#bd9a6e';
const HOLLOW = '#4a3626';

const TAU = Math.PI * 2;

const angleOf = (p: THREE.Vector3): number => (Math.atan2(p.x, p.z) + TAU) % TAU;

/** A flat disc or ring-free lathe, a stone or lid: radius, thickness. */
const disc = (at: Vec3, r: number, t: number, seg = 8): THREE.BufferGeometry =>
  lathe(
    [
      [0, 0],
      [r, 0],
      [r, t],
      [0, t],
    ],
    at,
    seg,
  );

// --- Pottery: one builder, three styles. ---

type PotKind = 'small' | 'large' | 'jar';

function buildPot(mb: ModelBuilder, kind: PotKind): Record<string, Vec3> {
  if (kind === 'small') {
    // Yangshao: buff bowl-jar, red band under a black line, hanging red triangles.
    const prof: [number, number][] = [
      [0, 0],
      [0.09, 0],
      [0.14, 0.04],
      [0.18, 0.1],
      [0.2, 0.16],
      [0.18, 0.22],
      [0.15, 0.27],
      [0.16, 0.29],
      [0.14, 0.29],
      [0.13, 0.26],
      [0, 0.22],
    ];
    const paint: Pattern = (p) => {
      if (p.y > 0.29) return undefined;
      const a = angleOf(p) / TAU;
      const tri = Math.abs(((a * 8) % 1) * 2 - 1);
      if (p.y > 0.26 && p.y < 0.285) return '#3a2a20';
      if (p.y > 0.1 && p.y <= 0.26 && p.y > 0.26 - 0.1 * (0.35 + 0.65 * tri) && p.y > 0.14)
        return RED;
      return undefined;
    };
    mb.add(lathe(prof, [0, 0, 0], 16), BUFF, 'root', paint);
    return { grip: [0.15, 0.27, 0], grip2: [-0.15, 0.27, 0] };
  }
  if (kind === 'large') {
    // Linearbandkeramik: round belly, three incised dark bands, knob lugs. The profile has a
    // ring at the edge of each band, so the lines are drawn as whole rows of faces.
    const prof: [number, number][] = [
      [0, 0],
      [0.13, 0],
      [0.22, 0.06],
      [0.27, 0.14],
      [0.295, 0.2],
      [0.3, 0.225],
      [0.3, 0.26],
      [0.29, 0.285],
      [0.285, 0.31],
      [0.27, 0.35],
      [0.25, 0.375],
      [0.22, 0.42],
      [0.17, 0.48],
      [0.19, 0.52],
      [0.16, 0.52],
      [0.14, 0.48],
      [0, 0.44],
    ];
    const bands: [number, number][] = [
      [0.2, 0.225],
      [0.285, 0.31],
      [0.375, 0.42],
    ];
    const paint: Pattern = (p) =>
      p.y < 0.52 && bands.some(([lo, hi]) => p.y > lo && p.y < hi) ? '#5e4330' : undefined;
    mb.add(lathe(prof, [0, 0, 0], 14), '#bf9468', 'root', paint);
    for (const s of [-1, 1]) mb.add(blob([s * 0.31, 0.25, 0], [0.05, 0.05, 0.05], 5), '#bf9468');
    mb.add(blob([0, 0.25, 0.31], [0.05, 0.05, 0.05], 5), '#bf9468');
    return { grip: [0.3, 0.25, 0], grip2: [-0.3, 0.25, 0] };
  }
  // Cardial: tall-necked jar in terracotta, shell-impressed rows, two loop handles.
  const prof: [number, number][] = [
    [0, 0],
    [0.1, 0],
    [0.16, 0.04],
    [0.2, 0.12],
    [0.2, 0.2],
    [0.15, 0.27],
    [0.11, 0.31],
    [0.1, 0.36],
    [0.13, 0.4],
    [0.11, 0.4],
    [0.09, 0.36],
    [0, 0.33],
  ];
  const paint: Pattern = (p) => {
    if (p.y < 0.17 || p.y > 0.34) return undefined;
    const cell = Math.floor((angleOf(p) / TAU) * 16);
    const row = Math.floor((p.y - 0.17) / 0.045);
    return (cell + row) % 2 === 0 ? '#f0e2c4' : undefined;
  };
  mb.add(lathe(prof, [0, 0, 0], 16), TERRA, 'root', paint);
  for (const s of [-1, 1])
    mb.add(
      horn([s * 0.1, 0.34, 0], [s * 0.3, 0.36, 0], [s * 0.2, 0.2, 0], 0.025, 0.025, 4, 4),
      TERRA,
    );
  return { grip: [0.25, 0.28, 0], grip2: [0, 0, 0] };
}

// --- The models. ---

export function buildToolProp(id: ToolPropId): Model {
  const mb = new ModelBuilder();
  let holds: Record<string, Vec3> = {};
  switch (id) {
    case 'prop-sickle': {
      // Handle upright with the blade curving forward from its top, flint set along the inner edge.
      mb.add(limb([0, 0.02, 0], [0, 0.3, 0], 0.035, 0.032, 6), OAK_D);
      const a: Vec3 = [0, 0.3, 0];
      mb.add(horn(a, [0, 0.44, 0.2], [0, 0.34, 0.46], 0.032, 0.02, 5, 5), OAK);
      for (let i = 0; i < 5; i++) {
        const t = 0.2 + i * 0.17;
        // Points along the curve's inner edge.
        const x = 0;
        const y = (1 - t) * (1 - t) * 0.3 + 2 * (1 - t) * t * 0.44 + t * t * 0.34 - 0.04;
        const z = 2 * (1 - t) * t * 0.2 + t * t * 0.46;
        mb.add(blob([x, y, z], [0.022, 0.03, 0.04], 5), FLINT);
      }
      mb.add(blob([0, 0.02, 0], [0.04, 0.025, 0.04], 5), LEATHER);
      holds = { grip: [0, 0.15, 0] };
      break;
    }
    case 'prop-digging-stick': {
      mb.add(rod([0, 0, 0], [0, 1.2, 0], 0.03, 5), OAK);
      mb.add(cone([0, 0.14, 0], [0, 0, 0], 0.03, 5), OAK_D);
      // The bored stone weight that bears the stick down.
      mb.add(
        lathe(
          [
            [0.025, -0.05],
            [0.09, -0.04],
            [0.11, 0],
            [0.09, 0.05],
            [0.025, 0.06],
          ],
          [0, 0.5, 0],
          8,
        ),
        STONE,
      );
      mb.add(blob([0, 1.2, 0], [0.04, 0.04, 0.04], 5), OAK_D);
      holds = { grip: [0, 1.08, 0], grip2: [0, 0.82, 0] };
      break;
    }
    case 'prop-hoe': {
      // Haft rises from the head and leans back; the stone adze lies across its foot.
      mb.add(limb([0, 0.16, 0.02], [0, 1.0, -0.2], 0.042, 0.036, 6), OAK);
      mb.add(limb([0, 0.16, 0.02], [0, 0.1, 0.3], 0.036, 0.034, 6), OAK);
      const celt = blob([0, 0.06, 0.34], [0.075, 0.03, 0.14], 6);
      celt.rotateX(0.0);
      mb.add(celt, STONE);
      mb.add(blob([0, 0.12, 0.2], [0.05, 0.04, 0.05], 5), LEATHER);
      mb.add(blob([0, 0.14, 0.1], [0.045, 0.045, 0.045], 5), LEATHER);
      holds = { grip: [0, 0.95, -0.18], grip2: [0, 0.65, -0.1] };
      break;
    }
    case 'prop-ard': {
      // The share beam runs from the pointed share at the ground up and back; the draught beam
      // passes through it to the hitch; the stilt rises behind to the ploughman's hand.
      mb.bone({ name: 'rest', pivot: [0, 0, 2.3] });
      mb.add(limb([0, 0.03, 0.75], [0, 0.45, -0.3], 0.075, 0.08, 6), OAK_D);
      mb.add(cone([0, 0.2, 0.62], [0, 0, 1.2], 0.09, 5), '#8a8f96');
      mb.add(limb([0, 0.5, 0.05], [0, 0.95, 2.45], 0.07, 0.06, 6), OAK);
      mb.add(limb([0, 0.42, -0.25], [0, 1.1, -0.75], 0.055, 0.05, 6), OAK_D);
      mb.add(rod([-0.2, 1.12, -0.75], [0.2, 1.12, -0.75], 0.03, 5), OAK);
      // Wedges and lashings where the pieces cross.
      mb.add(blob([0, 0.5, 0.05], [0.07, 0.06, 0.09], 5), LEATHER);
      mb.add(blob([0, 0.95, 2.4], [0.07, 0.06, 0.08], 5), LEATHER);
      // A forked prop under the beam end while the ard stands alone.
      mb.add(rod([0.0, 0, 2.3], [0.0, 0.9, 2.3], 0.04, 5), shade(OAK, -0.05), 'rest');
      for (const s of [-1, 1])
        mb.add(rod([0, 0.82, 2.3], [s * 0.1, 0.98, 2.3], 0.028, 4), shade(OAK, -0.05), 'rest');
      holds = { grip: [0, 1.12, -0.75], hitch: [0, 0.95, 2.45] };
      break;
    }
    case 'prop-yoke': {
      // A beam on four pegs: it rests on them here, and across the cattle's withers in use.
      mb.add(limb([-0.82, 0.58, 0], [0.82, 0.58, 0], 0.065, 0.065, 6), OAK);
      for (const x of [-0.58, -0.26, 0.26, 0.58]) {
        mb.add(rod([x, 0.02, 0], [x, 0.56, 0], 0.035, 5), OAK_D);
      }
      mb.add(blob([0, 0.7, 0], [0.09, 0.09, 0.09], 6), OAK_D);
      mb.add(blob([0, 0.66, 0], [0.12, 0.05, 0.12], 6), LEATHER);
      for (const x of [-0.42, 0.42]) mb.add(blob([x, 0.6, 0], [0.04, 0.08, 0.08], 5), LEATHER);
      holds = { neckL: [-0.42, 0.3, 0], neckR: [0.42, 0.3, 0], hitch: [0, 0.7, 0] };
      break;
    }
    case 'prop-quern': {
      mb.bone({ name: 'muller', pivot: [0, 0.2, 0] });
      mb.add(blob([0, 0.1, 0], [0.26, 0.1, 0.44], 8), STONE);
      mb.add(blob([0, 0.17, 0.02], [0.16, 0.04, 0.34], 7), shade(STONE, 0.15));
      // Grain at the far end, flour at the near end.
      mb.add(blob([0, 0.2, 0.3], [0.1, 0.04, 0.08], 6), STRAW);
      mb.add(blob([0, 0.2, -0.36], [0.12, 0.03, 0.07], 6), '#efe6cf');
      mb.add(blob([0, 0.23, 0], [0.22, 0.05, 0.075], 7), shade(STONE, -0.1), 'muller');
      holds = { grip: [0.2, 0.25, 0], grip2: [-0.2, 0.25, 0] };
      break;
    }
    case 'prop-basket': {
      const prof: [number, number][] = [
        [0, 0],
        [0.15, 0],
        [0.2, 0.08],
        [0.25, 0.22],
        [0.28, 0.4],
        [0.29, 0.5],
        [0.27, 0.5],
        [0.25, 0.45],
        [0, 0.4],
      ];
      const weave: Pattern = (p) => {
        if (p.y > 0.46) return '#9c7440';
        const cell = Math.floor((angleOf(p) / TAU) * 14);
        const row = Math.floor(p.y / 0.07);
        return (cell + row) % 2 === 0 ? shade(STRAW, -0.3) : shade(STRAW, 0.12);
      };
      mb.add(lathe(prof, [0, 0, 0], 14), STRAW, 'root', weave);
      // The strap: a loop of tan leather over the top, for the brow or the shoulders.
      mb.add(horn([-0.27, 0.46, 0], [0, 1.0, 0.1], [0.27, 0.46, 0], 0.025, 0.025, 6, 4), LEATHER);
      holds = { carry: [0, 0.2, -0.2], strap: [0, 0.8, 0.07] };
      break;
    }
    case 'prop-pot-small':
      holds = buildPot(mb, 'small');
      break;
    case 'prop-pot-large':
      holds = buildPot(mb, 'large');
      break;
    case 'prop-pot-jar':
      holds = buildPot(mb, 'jar');
      break;
    case 'prop-kiln': {
      // Firing chamber below, perforated floor, pot chamber and dome above; the fire mouth faces +Z.
      const clay = '#c29a6c';
      const sooty = '#6b5040';
      mb.add(
        lathe(
          [
            [0, 0],
            [0.8, 0],
            [0.85, 0.15],
            [0.83, 0.5],
            [0.8, 0.8],
            [0.7, 1.05],
            [0.45, 1.25],
            [0.22, 1.32],
            [0.2, 1.4],
            [0.12, 1.4],
            [0.0, 1.3],
          ],
          [0, 0, 0],
          12,
        ),
        clay,
        'root',
        (p) =>
          p.y < 0.08
            ? shade(clay, -0.15)
            : p.y > 1.2 && p.z > -9 && Math.hypot(p.x, p.z) < 0.25
              ? sooty
              : undefined,
      );
      // Rim of thick coil where a lid of sherds and clay lies on the dome.
      mb.add(blob([0, 0.62, 0], [0.9, 0.04, 0.9], 12, 3), shade(clay, -0.06));
      // The fire mouth: a dark arch under a stone lintel, sooted.
      mb.add(blob([0, 0.3, 0.8], [0.3, 0.3, 0.12], 7), HOLLOW);
      mb.add(blob([0, 0.62, 0.84], [0.38, 0.08, 0.1], 6), STONE);
      for (const s of [-1, 1]) mb.add(blob([s * 0.34, 0.3, 0.82], [0.07, 0.3, 0.1], 5), STONE);
      // Billets of wood stacked beside it.
      for (let i = 0; i < 4; i++) {
        const row = i < 3 ? 0 : 1;
        const x = 1.15 + (i < 3 ? i * 0.17 : 0.17);
        mb.add(rod([x, 0.08 + row * 0.15, 0.3], [x, 0.08 + row * 0.15, 1.3], 0.075, 5), OAK);
      }
      holds = { stoke: [0, 0, 1.2], vent: [0, 1.4, 0] };
      break;
    }
    case 'prop-granary': {
      // Six posts, each capped with a flat mouse stone, carry a wattle drum under a thatch cone.
      const R = 0.95;
      const wattle = '#c2a06a';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.5;
        const x = Math.sin(a) * R * 0.85;
        const z = Math.cos(a) * R * 0.85;
        mb.add(rod([x, 0, z], [x, 0.95, z], 0.075, 5), OAK_D);
        mb.add(disc([x, 0.82, z], 0.17, 0.07, 6), STONE);
      }
      mb.add(disc([0, 0.95, 0], R + 0.08, 0.1, 10), OAK_D);
      mb.add(
        lathe(
          [
            [0, 1.05],
            [R, 1.05],
            [R + 0.05, 1.5],
            [R, 2.0],
            [R - 0.02, 2.05],
          ],
          [0, 0, 0],
          10,
        ),
        wattle,
        'root',
        (p) => (Math.floor(p.y / 0.12) % 2 === 0 ? shade(wattle, -0.12) : undefined),
      );
      mb.add(cone([0, 1.95, 0], [0, 3.2, 0], R + 0.4, 10), THATCH);
      mb.add(blob([0, 3.2, 0], [0.1, 0.12, 0.1], 5), shade(THATCH, -0.2));
      // Door high in the wall, towards +Z, and a notched-log ladder.
      mb.add(blob([0, 1.5, R + 0.03], [0.22, 0.28, 0.06], 6), HOLLOW);
      mb.add(rod([0, 0, 1.6], [0, 1.2, R + 0.05], 0.09, 5), OAK);
      holds = { door: [0, 1.3, R + 0.15], ladder: [0, 0, 1.6] };
      break;
    }
    case 'prop-silo-pit': {
      mb.bone({ name: 'lid', pivot: [0, 0.14, -0.8] });
      // Raised clay lip round a dark pit with grain showing in it.
      mb.add(
        lathe(
          [
            [0.62, 0],
            [0.9, 0],
            [0.92, 0.1],
            [0.8, 0.16],
            [0.68, 0.14],
            [0.62, 0.08],
          ],
          [0, 0, 0],
          12,
        ),
        EARTH,
      );
      mb.add(disc([0, 0.01, 0], 0.66, 0.05, 12), HOLLOW);
      mb.add(blob([0, 0.06, 0.05], [0.5, 0.06, 0.5], 9, 3), STRAW);
      // The woven lid, propped open on its hinge side.
      const lid = disc([0, 0, 0.78], 0.78, 0.07, 10);
      lid.rotateX(-1.25);
      lid.translate(0, 0.14, -0.8);
      mb.add(lid, shade(STRAW, -0.12), 'lid', (p) =>
        Math.floor(angleOf(new THREE.Vector3(p.x, 0, p.z - 0.2)) * 3) % 2 === 0
          ? shade(STRAW, -0.28)
          : undefined,
      );
      mb.add(blob([0.9, 0.08, 0.5], [0.16, 0.1, 0.14], 5), STONE);
      holds = { fill: [0, 0.2, 0.6] };
      break;
    }
    case 'prop-pen': {
      // A ring of woven wattle about 10 m across with a gap at +Z, closed by a hurdle gate.
      const R = 5;
      const H = 1.05;
      const gapHalf = 0.17;
      const a0 = gapHalf;
      const a1 = TAU - gapHalf;
      const n = 28;
      const wall: Vec3[][] = [];
      for (const y of [0.0, 0.35, 0.7, H]) {
        const row: Vec3[] = [];
        for (let i = 0; i <= n; i++) {
          const a = a0 + ((a1 - a0) * i) / n;
          row.push([Math.sin(a) * R, y, Math.cos(a) * R]);
        }
        wall.push(row);
      }
      mb.add(ringWall(wall), '#c2a06a', 'root', (p) => {
        const b = Math.floor((p.y + 0.01) / 0.175);
        return b % 2 === 0 ? shade('#c2a06a', -0.18) : undefined;
      });
      for (let i = 0; i <= n; i += 2) {
        const a = a0 + ((a1 - a0) * i) / n;
        mb.add(
          rod(
            [Math.sin(a) * R, 0, Math.cos(a) * R],
            [Math.sin(a) * R, H + 0.15, Math.cos(a) * R],
            0.05,
            4,
          ),
          OAK_D,
        );
      }
      // Gate: a hurdle hinged on the right post.
      const hx = Math.sin(a0) * R;
      const hz = Math.cos(a0) * R;
      mb.bone({ name: 'gate', pivot: [hx, 0, hz] });
      const w = 2 * Math.sin(a0) * R;
      const gx: Vec3[] = [
        [hx, 0.08, hz],
        [hx - w, 0.08, hz],
      ];
      mb.add(rod(gx[0]!, gx[1]!, 0.04, 4), OAK, 'gate');
      for (const y of [0.4, 0.75, 1.05]) {
        mb.add(rod([hx, y, hz], [hx - w, y, hz], 0.035, 4), OAK, 'gate');
      }
      for (const k of [0, 0.5, 1])
        mb.add(rod([hx - w * k, 0.08, hz], [hx - w * k, 1.05, hz], 0.04, 4), OAK_D, 'gate');
      mb.add(rod([hx - w, 0.08, hz], [hx - w, 1.2, hz], 0.06, 4), OAK_D);
      holds = { gate: [hx - w * 0.5, 0.9, hz + 0.3] };
      break;
    }
    case 'prop-well': {
      // Log-cabin curb of oak, a post and crossbar over it, a leather bucket on a cord.
      const x0 = 0.55;
      for (let layer = 0; layer < 4; layer++) {
        const y = 0.1 + layer * 0.17;
        const off = layer % 2 === 0 ? 0 : 0.0;
        for (const s of [-1, 1]) {
          mb.add(rod([-x0 - 0.2, y, s * x0 + off], [x0 + 0.2, y, s * x0 + off], 0.085, 5), OAK);
          mb.add(
            rod(
              [s * x0 + off, y + 0.085, -x0 - 0.2],
              [s * x0 + off, y + 0.085, x0 + 0.2],
              0.085,
              5,
            ),
            OAK_D,
          );
        }
      }
      mb.add(disc([0, 0.12, 0], 0.5, 0.02, 8), HOLLOW);
      for (const s of [-1, 1]) {
        mb.add(rod([s * 0.7, 0.55, 0], [s * 0.55, 1.95, 0], 0.06, 5), OAK_D);
      }
      mb.add(rod([-0.8, 1.9, 0], [0.8, 1.9, 0], 0.055, 5), OAK);
      mb.bone({ name: 'bucket', pivot: [0, 1.9, 0] });
      mb.add(rod([0, 1.88, 0], [0, 1.3, 0], 0.012, 3), LEATHER, 'bucket');
      mb.add(
        lathe(
          [
            [0, 1.0],
            [0.12, 1.0],
            [0.16, 1.28],
            [0.14, 1.28],
            [0.1, 1.05],
            [0, 1.05],
          ],
          [0, 0, 0],
          8,
        ),
        LEATHER,
        'bucket',
      );
      holds = { grip: [0, 1.15, 0.25], bucket: [0, 1.15, 0] };
      break;
    }
  }
  const model = mb.build(id);
  model.object.userData.holds = holds;
  return model;
}

/** Wall of woven wattle through rows of points, kept one-sided outwards so ink and shade are clean. */
function ringWall(rows: Vec3[][]): THREE.BufferGeometry {
  const h = rows.length;
  const w = rows[0]!.length;
  const pos: number[] = [];
  for (const r of rows) for (const p of r) pos.push(...p);
  const index: number[] = [];
  for (let i = 0; i < h - 1; i++) {
    for (let j = 0; j < w - 1; j++) {
      const a = i * w + j;
      const b = a + 1;
      const c = a + w;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
