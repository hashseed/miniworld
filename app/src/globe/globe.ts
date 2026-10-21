// The globe: picks quadtree tiles by screen-space error, builds and caches
// their meshes, and feeds the date's sea level and ice to the shader
// (spec milestone 1, sections 4 and 5).

import * as THREE from 'three';
import type { ChunkSource } from '../content/loader.ts';
import {
  FACE_COUNT,
  TILE_N,
  childKeys,
  dirToLatLon,
  faceUvToDir,
  tileAngularSize,
  tileId,
  tileSampleUv,
  type TileKey,
  type Vec3,
} from '../geo/cube.ts';
import { ClimateStore } from './climate.ts';
import { LENS_COLS, LENS_ROWS, Lens } from './lens.ts';
import { PlanetQuery } from '../planet/query.ts';
import type { PlanetState } from '../planet/state.ts';
import { LAND_LIFT_M } from '../planet/surface.ts';
import { MOUNDS, terrainFragment, terrainVertex } from './shaders.ts';
import { startTerrainWorkers, type TerrainWorkers } from './terrainWorkers.ts';
import { indexFor, tileGeometry } from './tileMesh.ts';
import { EARTH_RADIUS_KM } from '../geo/earth.ts';
import { TerrainStore } from './terrainStore.ts';
import type { TerrainTile } from '../content/formats.ts';

import { EXAGGERATION } from './exaggeration.ts';
export { EXAGGERATION };
export const MAX_RENDER_LEVEL = 5;
/** Meshes kept beyond those touched this frame; touched meshes are never evicted. */
const MAX_CACHED_MESHES = 1500;

/** Vertex step of a tile's flat sea grid: 8 × 8 cells (section 4.4). */
const SEA_STEP = TILE_N / 8;
/** Vertex step of polar tiles with a coast, whose relief is smoothed away (section 4.2). */
const POLAR_STEP = 2;

interface TileEntry {
  key: TileKey;
  mesh: THREE.Mesh;
  lastUsed: number;
}

export interface GlobeQuality {
  errorTargetPx: number;
}

/** Ground tint before the foliage slices load: none. */
const NO_GROUND = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
NO_GROUND.needsUpdate = true;

/**
 * A hill of a scene (humankind.md section 8.2) in drawn space: its centre, radius, the
 * direction towards its hearth (where it is cut vertically), its height in drawn km and
 * its shape (1 round, 2 a long ridge, 3 with an alcove, 4 flat-topped), cut and width.
 */
export interface Mound {
  centre: [number, number, number];
  radiusKm: number;
  toward: [number, number, number];
  heightKm: number;
  shape: number;
  cut: number;
  wide: number;
}

export class Globe {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  /** The flat sea surface over every tile, sharing the terrain's uniforms (section 4.4). */
  readonly seaMaterial: THREE.ShaderMaterial;
  /** The sea surface of tiles that are sea at every date, carrying ice over the sea. */
  readonly seaIceMaterial: THREE.ShaderMaterial;
  readonly store: TerrainStore;
  /** Ice and deserts for the whole planet, per time step (section 5.2). */
  readonly climate: ClimateStore;
  /** Builds tiles and climate textures off the main thread (section 11.5). */
  private workers: TerrainWorkers;
  /** Sea, ice and ground height at a place, from the loaded data (section 5). */
  readonly query: PlanetQuery;
  private loader: ChunkSource;
  /** Tile meshes, least recently used first. */
  private tiles = new Map<string, TileEntry>();
  /** The six faces' root tiles of the quadtree. */
  private roots = Array.from({ length: FACE_COUNT }, (_, face) =>
    tileNode({ face, level: 0, x: 0, y: 0 }),
  );
  private selected: TileEntry[] = [];
  private frame = 0;
  private buildsThisFrame = 0;
  quality: GlobeQuality = { errorTargetPx: 2.5 };
  /** Tiles drawn last frame. */
  drawnTiles = 0;

  /** Tile and climate builds waiting or running in the terrain workers. */
  get pendingBuilds(): number {
    return this.workers.pending;
  }
  /** Lowest sea level of the timeline (m); below it a place is sea at every date. */
  lowestSeaLevel = -130;
  /** The date of the last update, for surface queries. */
  private day = 0;
  private maxHeights = new WeakMap<TerrainTile, number>();
  /** The history lens; the identity until the warp has loaded (history-lens.md). */
  lens = Lens.identity();
  private lensTexture: THREE.DataTexture;

  constructor(loader: ChunkSource) {
    this.loader = loader;
    this.store = new TerrainStore(loader);
    this.workers = startTerrainWorkers();
    this.climate = new ClimateStore(loader, this.workers);
    this.query = new PlanetQuery(this.store, this.climate);
    this.material = new THREE.ShaderMaterial({
      vertexShader: terrainVertex,
      fragmentShader: terrainFragment,
      side: THREE.FrontSide,
      uniforms: {
        seaLevel: { value: 0 },
        exaggeration: { value: EXAGGERATION },
        climateA: { value: null },
        climateB: { value: null },
        climateT: { value: 0 },
        // Vegetation tint of the ground, set by the foliage (foliage.md, section 6).
        groundA: { value: NO_GROUND },
        groundB: { value: NO_GROUND },
        groundT: { value: 0 },
        skirtDepth: { value: 200 },
        landLift: { value: LAND_LIFT_M },
        lightDir: { value: new THREE.Vector3(0, 0, 1) },
        screenUp: { value: new THREE.Vector3(0, 1, 0) },
        glacial: { value: 0 },
        time: { value: 0 },
        cameraWorld: { value: new THREE.Vector3() },
        limbInk: { value: 1 },
        riverThreshold: { value: 0.5 },
        fields: { value: null },
        lensGrid: { value: null },
        lensBlend: { value: 0 },
        earthRadius: { value: EARTH_RADIUS_KM },
        // The hills of scenes (humankind.md section 8.2), set each frame by the tree layer.
        moundA: { value: Array.from({ length: MOUNDS }, () => new THREE.Vector4()) },
        moundB: { value: Array.from({ length: MOUNDS }, () => new THREE.Vector4()) },
        moundC: { value: Array.from({ length: MOUNDS }, () => new THREE.Vector4()) },
        moundCount: { value: 0 },
      },
    });
    this.lensTexture = this.makeLensTexture();
    this.seaMaterial = new THREE.ShaderMaterial({
      vertexShader: terrainVertex,
      fragmentShader: terrainFragment,
      side: THREE.FrontSide,
      uniforms: this.material.uniforms,
      defines: { SEA_SURFACE: 1 },
    });
    this.seaIceMaterial = new THREE.ShaderMaterial({
      vertexShader: terrainVertex,
      fragmentShader: terrainFragment,
      side: THREE.FrontSide,
      uniforms: this.material.uniforms,
      defines: { SEA_SURFACE: 1, SEA_ICE: 1 },
    });
  }

  /** The hills of scenes rising from the ground this frame (humankind.md section 8.2). */
  setMounds(mounds: readonly Mound[]): void {
    const u = this.material.uniforms;
    const list = mounds.slice(0, MOUNDS);
    list.forEach((m, i) => {
      (u.moundA!.value as THREE.Vector4[])[i]!.set(...m.centre, m.radiusKm / EARTH_RADIUS_KM);
      (u.moundB!.value as THREE.Vector4[])[i]!.set(...m.toward, m.heightKm);
      (u.moundC!.value as THREE.Vector4[])[i]!.set(m.shape, m.cut, m.wide, 0);
    });
    u.moundCount!.value = list.length;
  }

  /** Uses a loaded warp, keeping the current strength. */
  setLens(lens: Lens): void {
    lens.setStrength(this.lens.strength, false);
    this.lens = lens;
    this.lensTexture.dispose();
    this.lensTexture = this.makeLensTexture();
  }

  private makeLensTexture(): THREE.DataTexture {
    // Read with texelFetch and interpolated in the shader, so it needs no float filtering.
    const tex = new THREE.DataTexture(
      this.lens.textureData(),
      LENS_COLS,
      LENS_ROWS,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.material.uniforms.lensGrid!.value = tex;
    return tex;
  }

  /** Selects and updates the tiles for this frame. */
  update(
    camera: THREE.PerspectiveCamera,
    viewportHeight: number,
    planet: PlanetState,
    day: number,
  ): void {
    this.frame++;
    this.buildsThisFrame = 0;
    const u = this.material.uniforms;
    this.day = day;
    u.seaLevel!.value = planet.seaLevel;
    // The whole planet's ice and deserts change at once, from the slices
    // around the date (section 7.3).
    const climate = this.climate.blend(day);
    u.climateA!.value = climate.a;
    u.climateB!.value = climate.b;
    u.climateT!.value = climate.t;
    u.glacial!.value = planet.glacialIndex;
    u.cameraWorld!.value.copy(camera.position);
    // No ink along the globe's outline in low views, where it would cut
    // across the mountains standing above the horizon (section 4.5).
    const lookDown = camera
      .getWorldDirection(_lookDir)
      .dot(_camDir.copy(camera.position).normalize().negate());
    u.limbInk!.value =
      1 -
      THREE.MathUtils.smoothstep(
        Math.acos(THREE.MathUtils.clamp(lookDown, -1, 1)),
        LIMB_INK_TILT[0],
        LIMB_INK_TILT[1],
      );
    u.lensBlend!.value = this.lens.blend;

    const camPos = camera.position;
    const camDist = camPos.length();
    _frustum.setFromProjectionMatrix(
      _viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const view: View = {
      camPos,
      camDir: _camDir.copy(camPos).normalize(),
      pxPerRad: viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)),
      horizon: Math.acos(Math.min(1, EARTH_RADIUS_KM / camDist)),
      // Ice can stand up to about 4 km on land during glacials.
      iceRoom: planet.glacialIndex > 0.02 ? 4000 : 0,
    };
    const selected = this.selected;
    selected.length = 0;
    for (const root of this.roots) this.visit(root, view);

    for (const e of this.tiles.values()) e.mesh.visible = false;
    for (const e of selected) e.mesh.visible = true;
    this.drawnTiles = selected.length;
    this.store.endFrame();
    this.workers.endFrame();
    this.evict();
  }

  /** Culls a tile, then draws it or walks on into its children (section 4.2). */
  private visit(node: TileNode, view: View): void {
    // Children not walked into for a while are forgotten, so the tree stays small.
    if (node.children && this.frame - node.childFrame > NODE_KEEP_FRAMES) node.children = undefined;
    const { key } = node;
    const lens = this.lens;
    const trueCentre = node.centre;
    // Tiles are chosen and culled where they are drawn (history-lens.md, section 4). Where that
    // is only changes with the lens, so it is kept on the node until the lens moves.
    let d = node.drawn;
    if (!d || d.lens !== lens || d.blend !== lens.blend) {
      const centre = lens.toDrawn(trueCentre, [0, 0, 0]);
      let spread = 1;
      if (lens.blend > 0)
        for (const corner of node.corners) {
          lens.toDrawn(corner, _drawnCorner);
          const t = angleBetween(trueCentre, corner);
          if (t > 0) spread = Math.max(spread, angleBetween(centre, _drawnCorner) / t);
        }
      d = { lens, blend: lens.blend, centre, width: lens.widthAt(trueCentre), spread };
      node.drawn = d;
    }
    const cd = d.centre;
    const width = d.width;
    const spread = d.spread;
    const ang = tileAngularSize(key.level) * spread;
    const { camDir } = view;
    const angle = Math.acos(
      Math.max(-1, Math.min(1, cd[0] * camDir.x + cd[1] * camDir.y + cd[2] * camDir.z)),
    );
    // Highest point of the tile (exaggerated, with room for ice), from its
    // data tile once loaded; mountains stay visible beyond the horizon.
    const topKm =
      (this.maxHeightM(node, angle * EARTH_RADIUS_KM + key.level) + view.iceRoom + LAND_LIFT_M) *
      EXAGGERATION *
      0.001 *
      width;
    const beyond = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + Math.max(0, topKm)));
    if (angle - ang * 0.75 > view.horizon + beyond + 0.002) return;
    const centre = _centre.set(cd[0], cd[1], cd[2]).multiplyScalar(EARTH_RADIUS_KM);
    const extent = EARTH_RADIUS_KM * ang * 0.75;
    // The tile is a thin column from sea level to its top: test spheres along it.
    const top = Math.max(1, topKm);
    const steps = Math.min(8, Math.ceil(top / Math.max(1, extent)));
    const axis = _axis.set(cd[0], cd[1], cd[2]);
    _sphere.radius = extent + top / (2 * steps) + 0.5;
    let inside = false;
    for (let k = 0; k <= steps && !inside; k++) {
      _sphere.center.copy(centre).addScaledVector(axis, (top * k) / steps);
      inside = _frustum.intersectsSphere(_sphere);
    }
    if (!inside) return;
    const dist = Math.max(0.5, centre.distanceTo(view.camPos) - extent);
    // Geometric error of the vertex grid, estimated as half its sample
    // spacing at the lens as built, so moving the lens slider does not
    // re-pick tiles and reload them while it morphs.
    const errorKm =
      (0.5 * EARTH_RADIUS_KM * tileAngularSize(key.level) * lens.builtWidthAt(trueCentre)) / TILE_N;
    const errorPx = (errorKm / dist) * view.pxPerRad;
    const priority = dist + key.level;

    const wantsSplit = key.level < node.maxLevel && errorPx > this.quality.errorTargetPx;
    if (wantsSplit) {
      const children = this.childrenOf(node);
      // Split only when every child has a mesh; otherwise draw this tile and build them.
      let ready = true;
      for (const ch of children) if (!this.entryFor(ch, priority)) ready = false;
      if (ready) {
        // Keep this tile's mesh too, so zooming out never waits for a rebuild.
        const own = this.tiles.get(node.id);
        if (own) this.touch(own);
        for (const ch of children) this.visit(ch, view);
        return;
      }
    }
    const entry = this.entryFor(node, priority);
    if (entry) this.selected.push(entry);
    else if (key.level < MAX_RENDER_LEVEL) {
      // No mesh yet: keep drawing finer children that still exist rather than a hole.
      const children = this.childrenOf(node);
      if (children.every((ch) => this.tiles.has(ch.id)))
        for (const ch of children) this.visit(ch, view);
    }
  }

  private childrenOf(node: TileNode): TileNode[] {
    node.childFrame = this.frame;
    return (node.children ??= childKeys(node.key).map(tileNode));
  }

  /** Marks a mesh as used this frame, moving it to the back of the eviction order. */
  private touch(entry: TileEntry): void {
    entry.lastUsed = this.frame;
    const id = tileId(entry.key);
    this.tiles.delete(id);
    this.tiles.set(id, entry);
  }

  /** The data tile a tile is sampled from, if loaded, requesting it if needed. */
  private sourceOf(node: TileNode, priority: number): TerrainTile | 'deep' | undefined {
    if (!node.data) {
      const key = this.store.dataKeyFor(node.key);
      node.data = { key, id: tileId(key) };
    }
    return this.store.terrainTile(node.data.key, priority, node.data.id);
  }

  /** Highest terrain in metres under a tile, from its data tile; a safe guess until loaded. */
  private maxHeightM(node: TileNode, priority: number): number {
    const src = this.sourceOf(node, priority);
    if (src === 'deep') return 0;
    if (!src) return 9000;
    let m = this.maxHeights.get(src);
    if (m === undefined) {
      m = -Infinity;
      for (const h of src.heights) if (h > m) m = h;
      this.maxHeights.set(src, m);
    }
    return Math.max(0, m);
  }

  private entryFor(node: TileNode, priority: number): TileEntry | undefined {
    const { key, id } = node;
    const existing = this.tiles.get(id);
    const source = this.sourceOf(node, priority);
    if (existing) {
      this.touch(existing);
      return existing;
    }
    if (!source) return undefined;
    // Meshes made per frame are capped, since each is uploaded to the graphics card.
    if (this.buildsThisFrame >= 12 && key.level > 1) return undefined;
    const arrays = this.workers.tile(id, key, source, EXAGGERATION, this.lowestSeaLevel, priority);
    if (!arrays) return undefined;
    this.buildsThisFrame++;
    const g = tileGeometry(arrays);
    // A tile that is sea at every date is its flat sea surface alone, which
    // also carries ice over the sea; polar tiles use a coarser grid; a tile
    // that is never sea needs no sea surface (section 4.2).
    const polar = node.maxLevel === POLAR_MAX_LEVEL;
    if (g.alwaysSea) g.geometry.setIndex(indexFor(g.flip, SEA_STEP));
    else if (polar) g.geometry.setIndex(indexFor(g.flip, g.neverSea ? SEA_STEP : POLAR_STEP));
    const material = g.alwaysSea ? this.seaIceMaterial : this.material;
    const mesh = new THREE.Mesh(g.geometry, material);
    // The materials share their uniforms; each tile binds its own field texture.
    mesh.onBeforeRender = () => {
      this.material.uniforms.fields!.value = g.fields;
      material.uniformsNeedUpdate = true;
    };
    mesh.userData.fields = g.fields;
    if (!g.alwaysSea && !g.neverSea) {
      // The flat sea: the same vertices on a coarse grid, a child so it shares
      // the tile's placement and visibility.
      const seaGeometry = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(g.geometry.attributes))
        seaGeometry.setAttribute(name, attr as THREE.BufferAttribute);
      seaGeometry.setIndex(indexFor(g.flip, SEA_STEP));
      const sea = new THREE.Mesh(seaGeometry, this.seaMaterial);
      sea.onBeforeRender = () => {
        this.material.uniforms.fields!.value = g.fields;
        this.seaMaterial.uniformsNeedUpdate = true;
      };
      sea.frustumCulled = false;
      sea.matrixAutoUpdate = false;
      mesh.add(sea);
    }
    mesh.position.copy(g.centre);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    const entry: TileEntry = {
      key,
      mesh,
      lastUsed: this.frame,
    };
    this.tiles.set(id, entry);
    return entry;
  }

  /**
   * Drops the least recently used meshes beyond the cache size. Meshes are
   * kept in order of last use, so this stops at the first one used this frame.
   */
  private evict(): void {
    for (const [id, e] of this.tiles) {
      if (this.tiles.size <= MAX_CACHED_MESHES || e.lastUsed >= this.frame) break;
      this.group.remove(e.mesh);
      for (const child of e.mesh.children) (child as THREE.Mesh).geometry.dispose();
      e.mesh.geometry.dispose();
      (e.mesh.userData.fields as THREE.DataTexture).dispose();
      this.tiles.delete(id);
    }
  }

  /**
   * Drawn surface height in km above the sphere at a drawn direction,
   * including sea, ice, exaggeration and the lens's relief scale.
   */
  surfaceKm(drawnDir: Vec3, planet: PlanetState): number {
    return this.surfaceAtTrue(this.lens.toTrue(drawnDir), planet);
  }

  /** Drawn surface height in km above the sphere over a true direction. */
  surfaceAtTrue(dir: Vec3, planet: PlanetState): number {
    const top = this.query.surfaceM(dir, this.day, planet.seaLevel);
    return top * EXAGGERATION * 0.001 * this.lens.widthAt(dir);
  }
}

const CORNERS = [
  [0, 0],
  [TILE_N, 0],
  [0, TILE_N],
  [TILE_N, TILE_N],
] as const;

function angleBetween(a: Vec3, b: Vec3): number {
  return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
}

/**
 * Deepest render level for a tile centre: the polar regions are smoothed so
 * much that finer tiles would add triangles without detail (section 4.2).
 */
const POLAR_MAX_LEVEL = 4;
/** View angles from straight down (radians) over which the outline ink fades out. */
const LIMB_INK_TILT = [THREE.MathUtils.degToRad(42), THREE.MathUtils.degToRad(58)] as const;
function maxLevelAt(d: Vec3): number {
  const { lat } = dirToLatLon(d);
  return lat > 74 || lat < -62 ? POLAR_MAX_LEVEL : MAX_RENDER_LEVEL;
}

/** What the tile selection needs to know about the camera in a frame. */
interface View {
  camPos: THREE.Vector3;
  /** Direction from the globe's centre to the camera. */
  camDir: THREE.Vector3;
  pxPerRad: number;
  /** Angle from the camera direction to the horizon. */
  horizon: number;
  /** Room for ice on top of the terrain, in metres. */
  iceRoom: number;
}

/** Frames a tile's children are remembered after the selection last walked into them. */
const NODE_KEEP_FRAMES = 600;

/** A quadtree tile as the selection walks it, with what never changes worked out once. */
interface TileNode {
  key: TileKey;
  id: string;
  /** True direction of the tile centre. */
  centre: Vec3;
  /** True directions of the tile corners, for the lens's spread. */
  corners: Vec3[];
  maxLevel: number;
  /** The data tile it is sampled from, found on first use. */
  data?: { key: TileKey; id: string };
  children: TileNode[] | undefined;
  /** The frame in which the selection last walked into the children. */
  childFrame: number;
  /** Where the lens draws it: its centre, width and spread, for the lens and blend they were worked out at. */
  drawn?: { lens: Lens; blend: number; centre: Vec3; width: number; spread: number };
}

function tileNode(key: TileKey): TileNode {
  const dirAt = (i: number, j: number) => {
    const p = tileSampleUv(key, i, j);
    return faceUvToDir(key.face, p.u, p.v);
  };
  const centre = dirAt(TILE_N / 2, TILE_N / 2);
  return {
    key,
    id: tileId(key),
    centre,
    corners: CORNERS.map(([i, j]) => dirAt(i, j)),
    maxLevel: maxLevelAt(centre),
    children: undefined,
    childFrame: 0,
  };
}

// Scratch objects for the tile selection, which runs every frame.
const _frustum = new THREE.Frustum();
const _viewProjection = new THREE.Matrix4();
const _camDir = new THREE.Vector3();
const _lookDir = new THREE.Vector3();
const _centre = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _sphere = new THREE.Sphere();
const _drawnCorner: Vec3 = [0, 0, 0];
