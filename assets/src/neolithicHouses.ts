// Houses of the western Old World Neolithic (spec docs/spec/neolithic/houses-old-world-west.md):
// life size in metres, door facing +Z, built from rounded prisms with smoothed normals so the
// ink outline stays closed, in the colours of the real materials.

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  type Model,
  type Pattern,
  type Vec3,
  ModelBuilder,
  STONE,
  blob,
  box,
  horn,
  lathe,
  limb,
  rod,
  shade,
} from './kit.ts';

export const NEOLITHIC_HOUSES = [
  'shelter-pre-pottery-levant-house',
  'shelter-anatolian-house',
  'shelter-anatolian-house-joined',
  'shelter-lbk-longhouse',
  'shelter-mehrgarh-house',
  'shelter-egyptian-neolithic-hut',
] as const;
export type NeolithicHouseId = (typeof NEOLITHIC_HOUSES)[number];

// Real materials (spec section 1): sandy mudbrick, cream plaster, oak, golden thatch.
const MUD = '#cdb184';
const BRICK = '#c9a577';
const PLASTER = '#e2d3ac';
const EARTH = '#c3ab7c';
const OAK = '#b88a54';
const THATCH = '#d2b865';
const DAUB = '#d6bf92';
const REED = '#d6c27c';
const OCHRE = '#b5502f';
const DOOR = '#3a2a20';

/** Bones named like the other shelters' building steps (shelters.ts BUILD_BONE). */
const STEP = 'build-';

/** A rounded rectangle centred on the origin, as a path in the xy plane. */
function roundRect(path: THREE.Path, w: number, d: number, r: number): void {
  const x = w / 2;
  const y = d / 2;
  path.moveTo(-x + r, -y);
  path.lineTo(x - r, -y);
  path.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x, y - r);
  path.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  path.lineTo(-x + r, y);
  path.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(-x, -y + r);
  path.absarc(-x + r, -y + r, r, Math.PI, 1.5 * Math.PI, false);
}

/** Gives an extrusion smooth normals, shared across its edges, so the ink outline stays closed. */
function smooth(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  return m;
}

interface PrismOptions {
  w: number;
  d: number;
  r: number;
  y0: number;
  y1: number;
  /** Rounding of the edges. */
  b?: number;
  /** Wall thickness of a ring (a parapet) with an open middle; solid when left out. */
  wall?: number;
  at?: [number, number];
}

/** A rounded rectangular block, or a ring of one, standing from y0 to y1. */
function prism(o: PrismOptions): THREE.BufferGeometry {
  const b = o.b ?? 0.1;
  const shape = new THREE.Shape();
  roundRect(shape, o.w, o.d, o.r);
  if (o.wall) {
    const hole = new THREE.Path();
    roundRect(hole, o.w - 2 * o.wall, o.d - 2 * o.wall, Math.max(0.05, o.r - o.wall));
    shape.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: o.y1 - o.y0 - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 1,
    curveSegments: 1,
  });
  // The shape lies in xy and rises along z; stand it up so its y becomes depth (z).
  g.rotateX(-Math.PI / 2);
  g.translate(o.at?.[0] ?? 0, o.y0 + b, o.at?.[1] ?? 0);
  return smooth(dropBottom(g, o.y0));
}

/** Removes the faces lying flat on the bottom plane y, which nobody sees. */
function dropBottom(g: THREE.BufferGeometry, y: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const keep: number[] = [];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const flat = [0, 1, 2].every((k) => Math.abs(pos.getY(i + k) - y) < 1e-4);
    if (!flat) keep.push(i, i + 1, i + 2);
  }
  const out = g.clone();
  out.setIndex(keep);
  return out;
}

/** Removes faces that look down, which the ink hull would show as dark corners. */
function dropUnderside(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const pos = ng.getAttribute('position');
  const keep: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1).sub(a);
    c.fromBufferAttribute(pos, i + 2).sub(a);
    if (b.cross(c).normalize().y > -0.7) keep.push(i, i + 1, i + 2);
  }
  ng.setIndex(keep);
  return ng;
}

/** A ridge roof: a profile of (half width, height) pairs along its length, hipped at the ends. */
function ridgeRoof(half: [number, number][], length: number, hip: number): THREE.BufferGeometry {
  const pts = [...half.map(([z, y]): [number, number] => [-z, y])];
  for (let i = half.length - 1; i >= 0; i--) pts.push([half[i]![0], half[i]![1]]);
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: length - 2 * hip,
    steps: 4,
    bevelEnabled: true,
    bevelThickness: hip,
    bevelSize: hip,
    bevelOffset: -hip,
    bevelSegments: 3,
  });
  // Extruded along z; lay it along x, centred.
  g.translate(0, 0, -(length - 2 * hip) / 2);
  g.rotateY(Math.PI / 2);
  return smooth(dropUnderside(g));
}

/** A box whose corners share one normal pointing out from its middle, for a closed ink outline. */
function slab(min: Vec3, max: Vec3): THREE.BufferGeometry {
  const g = box(min, max);
  const pos = g.getAttribute('position');
  const normal = g.getAttribute('normal');
  const mid = new THREE.Vector3(
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  );
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(mid).normalize();
    normal.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** A door: a dark opening with an oak lintel and jambs, on the +Z face at z, centred on x. */
function addDoor(mb: ModelBuilder, bone: string, x: number, z: number, w: number, h: number): void {
  const hw = w / 2;
  mb.add(slab([x - hw, 0, z - 0.06], [x + hw, h, z + 0.1]), DOOR, bone, undefined, 0);
  mb.add(
    slab([x - hw - 0.14, h, z - 0.04], [x + hw + 0.14, h + 0.17, z + 0.16]),
    OAK,
    bone,
    undefined,
    0,
  );
  for (const s of [-1, 1])
    mb.add(
      slab([x + s * hw - 0.07, 0, z - 0.04], [x + s * hw + 0.07, h, z + 0.14]),
      OAK,
      bone,
      undefined,
      0,
    );
}

export function buildNeolithicHouse(id: NeolithicHouseId): Model {
  const mb = new ModelBuilder([], 0.6);
  const step = (k: number, y = 0): string => {
    const name = `${STEP}${k}`;
    mb.bone({ name, pivot: [0, y, 0] });
    return name;
  };
  switch (id) {
    case 'shelter-pre-pottery-levant-house': {
      // Jericho, Ain Ghazal: a plastered mudbrick house, rounded corners, flat beam roof.
      const walls = step(0);
      const roof = step(1, 2.2);
      mb.add(prism({ w: 4.8, d: 5.6, r: 1.3, y0: 0, y1: 0.5, b: 0.12 }), MUD, walls);
      mb.add(prism({ w: 4.6, d: 5.4, r: 1.2, y0: 0.3, y1: 2.25, b: 0.14 }), PLASTER, walls);
      addDoor(mb, walls, 0, 2.7, 0.8, 1.5);
      mb.add(blob([0, 0.08, 3.05], [0.7, 0.14, 0.38], 6), STONE, walls);
      mb.add(prism({ w: 5.1, d: 5.9, r: 1.45, y0: 2.2, y1: 2.6, b: 0.14 }), EARTH, roof);
      // The roof beams, their ends showing at both sides.
      for (let i = -2; i <= 2; i++)
        for (const s of [-1, 1])
          mb.add(rod([s * 2.3, 2.38, i * 1.0], [s * 2.78, 2.38, i * 1.0], 0.085, 4), OAK, roof);
      break;
    }
    case 'shelter-anatolian-house':
    case 'shelter-anatolian-house-joined': {
      // Çatalhöyük: a packed, plastered mudbrick room entered by a ladder through the roof.
      const walls = step(0);
      const roof = step(1, 2.6);
      const ladder = step(2);
      mb.add(prism({ w: 5.6, d: 6.2, r: 0.35, y0: 0, y1: 2.65, b: 0.12 }), PLASTER, walls);
      // Painted plaster: a band of red ochre at the top.
      mb.add(
        prism({ w: 5.66, d: 6.26, r: 0.37, y0: 2.1, y1: 2.35, b: 0.05, wall: 0.1 }),
        OCHRE,
        walls,
      );
      if (id.endsWith('joined')) {
        // A lower neighbour built against the left wall, sharing it.
        mb.add(
          prism({ w: 3.5, d: 4.8, r: 0.3, y0: 0, y1: 2.2, b: 0.12, at: [-4.45, -0.6] }),
          PLASTER,
          walls,
        );
        mb.add(
          prism({
            w: 3.5,
            d: 4.8,
            r: 0.3,
            y0: 2.15,
            y1: 2.5,
            b: 0.1,
            wall: 0.2,
            at: [-4.45, -0.6],
          }),
          PLASTER,
          roof,
        );
      }
      // The roof: a parapet round a floor of clay over beams, the hatch in it.
      mb.add(
        prism({ w: 5.6, d: 6.2, r: 0.35, y0: 2.6, y1: 3.0, b: 0.08, wall: 0.28 }),
        PLASTER,
        roof,
      );
      mb.add(prism({ w: 5.3, d: 5.9, r: 0.3, y0: 2.5, y1: 2.8, b: 0.08 }), EARTH, roof);
      mb.add(slab([-1.45, 2.74, 1.45], [-0.25, 2.88, 2.65]), OAK, roof, undefined, 0);
      mb.add(slab([-1.25, 2.86, 1.65], [-0.45, 2.93, 2.45]), DOOR, roof, undefined, 0);
      // The ladder leans on the front wall, its rails standing above the roof edge.
      for (const x of [-1.1, -0.6])
        mb.add(rod([x, 0, 3.6], [x, 3.55, 2.72], 0.055, 5), OAK, ladder);
      for (let i = 1; i <= 7; i++) {
        const t = i / 8;
        mb.add(
          rod([-1.1, 3.55 * t, 3.6 - 0.88 * t], [-0.6, 3.55 * t, 3.6 - 0.88 * t], 0.035, 4),
          OAK,
          ladder,
        );
      }
      break;
    }
    case 'shelter-lbk-longhouse': {
      // A post-built longhouse of the Linearbandkeramik: daub between posts, one great thatch roof.
      const walls = step(0);
      const roof = step(1, 1.6);
      mb.add(prism({ w: 14.6, d: 5.2, r: 0.45, y0: 0, y1: 1.75, b: 0.14 }), DAUB, walls);
      for (let i = 0; i < 7; i++)
        for (const s of [-1, 1])
          mb.add(
            rod([-6.6 + i * 2.2, 0, s * 2.66], [-6.6 + i * 2.2, 1.95, s * 2.66], 0.1, 4),
            OAK,
            walls,
          );
      addDoor(mb, walls, 0.6, 2.58, 0.9, 1.4);
      const half: [number, number][] = [
        [3.35, 1.6],
        [3.1, 2.2],
        [2.55, 3.0],
        [1.75, 3.8],
        [0.85, 4.5],
        [0, 4.85],
      ];
      // Courses of thatch, lighter and darker.
      const courses: Pattern = (p) => {
        const k = Math.floor((p.y - 1.6) / 0.72);
        return shade(THATCH, k % 2 ? -0.1 : 0.06);
      };
      mb.add(ridgeRoof(half, 15.8, 0.95), THATCH, roof, courses);
      mb.add(rod([-6.4, 4.92, 0], [6.4, 4.92, 0], 0.2, 5), shade(THATCH, -0.2), roof);
      break;
    }
    case 'shelter-mehrgarh-house': {
      // Mehrgarh I: a block of hand-moulded mudbrick, cut into small compartments.
      const walls = step(0);
      const roof = step(1, 2.1);
      mb.add(
        prism({ w: 6.6, d: 4.8, r: 0.25, y0: 0, y1: 0.4, b: 0.1 }),
        shade(BRICK, -0.06),
        walls,
      );
      mb.add(prism({ w: 6.4, d: 4.6, r: 0.22, y0: 0.25, y1: 2.15, b: 0.12 }), BRICK, walls);
      addDoor(mb, walls, -1.2, 2.3, 0.75, 1.45);
      mb.add(blob([-1.2, 0.07, 2.62], [0.55, 0.13, 0.3], 6), STONE, walls);
      mb.add(prism({ w: 6.6, d: 4.8, r: 0.25, y0: 2.1, y1: 2.38, b: 0.1 }), EARTH, roof);
      // The cross walls of the compartments rise above the roof; bricks line its front edge.
      for (const x of [-1.1, 1.1])
        mb.add(slab([x - 0.17, 2.3, -2.0], [x + 0.17, 2.55, 2.0]), BRICK, roof, undefined, 0);
      mb.add(slab([-3.0, 2.3, -0.17], [3.0, 2.55, 0.17]), BRICK, roof, undefined, 0);
      for (let i = 0; i < 7; i++)
        mb.add(
          limb([-2.85 + i * 0.95, 2.52, 2.22], [-2.45 + i * 0.95, 2.52, 2.22], 0.1, 0.1, 4),
          shade(BRICK, 0.06),
          roof,
        );
      break;
    }
    case 'shelter-egyptian-neolithic-hut': {
      // Fayum and Merimde: an oval hut of bent reed bundles under overlapping woven mats.
      const frame = step(0);
      const lower = step(1);
      const upper = step(2, 0.9);
      const oval: Vec3 = [1.25, 1, 1];
      mb.add(
        lathe(
          [
            [1.9, 0],
            [1.97, 0.16],
            [1.75, 0.32],
          ],
          [0, 0, 0],
          12,
          oval,
        ),
        '#b59a6a',
        frame,
      );
      // Arched bundles, tied and poking out over the mats.
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI + 0.4;
        const at = (s: number): Vec3 => [Math.sin(a) * 2.2 * s, 0.1, Math.cos(a) * 1.75 * s];
        mb.add(horn(at(1), [0, 3.45, 0], at(-1), 0.08, 0.08, 6, 4), shade(REED, -0.3), frame);
      }
      const mats: [string, [number, number][], number][] = [
        [
          lower,
          [
            [1.78, 0.05],
            [1.85, 0.25],
            [1.6, 0.58],
          ],
          0,
        ],
        [
          lower,
          [
            [1.7, 0.45],
            [1.7, 0.7],
            [1.4, 1.0],
          ],
          0.08,
        ],
        [
          upper,
          [
            [1.45, 0.9],
            [1.42, 1.15],
            [0.95, 1.4],
          ],
          -0.06,
        ],
        [
          upper,
          [
            [1.0, 1.3],
            [0.8, 1.5],
            [0.1, 1.66],
          ],
          0.04,
        ],
      ];
      for (const [bone, profile, tone] of mats)
        mb.add(lathe(profile, [0, 0, 0], 10, oval), shade(REED, tone), bone);
      // The doorway and the mat rolled up over it.
      mb.add(blob([0, 0.55, 1.62], [0.42, 0.5, 0.2], 6), DOOR, lower);
      mb.add(limb([-0.6, 1.2, 1.55], [0.6, 1.2, 1.55], 0.12, 0.12, 5), shade(REED, -0.15), lower);
      // A woven windbreak on two poles beside the door.
      for (const p of [
        [1.5, 2.55],
        [3.0, 2.0],
      ] as [number, number][])
        mb.add(rod([p[0], 0, p[1]], [p[0], 1.6, p[1]], 0.05, 4), OAK, upper);
      const wind = slab([-0.75, 0.05, -0.04], [0.75, 1.5, 0.04]);
      wind.rotateY(-0.45);
      wind.translate(2.25, 0, 2.3);
      mb.add(wind, shade(REED, 0.04), upper, undefined, 0);
      break;
    }
  }
  return mb.build(id);
}
