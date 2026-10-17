// The globe: picks quadtree tiles by screen-space error, builds and caches
// their meshes, and feeds the date's sea level and ice to the shader
// (spec milestone 1, sections 4 and 5).

import * as THREE from 'three';
import type { ContentLoader } from '../content/loader.ts';
import { ICE_LEVEL } from '../content/formats.ts';
import {
  DATA_MAX_LEVEL,
  FACE_COUNT,
  TILE_N,
  childKeys,
  dirToFaceUv,
  faceUvToDir,
  tileAngularSize,
  tileAt,
  tileId,
  tileSampleUv,
  type TileKey,
  type Vec3,
} from './cube.ts';
import { LENS_COLS, LENS_ROWS, Lens } from './lens.ts';
import { windowAt, type PlanetState } from './planet.ts';
import { terrainFragment, terrainVertex } from './shaders.ts';
import { EARTH_RADIUS_KM, TILE_VERTS, buildTileGeometry } from './tileMesh.ts';
import { sampleIce, sampleTile, TerrainStore } from './terrainStore.ts';
import type { TerrainTile } from '../content/formats.ts';

export const EXAGGERATION = 100;
/** Every land vertex stands this many metres above its height (section 4.2). */
export const LAND_LIFT_M = 250;
export const MAX_RENDER_LEVEL = 9;
/** Meshes kept beyond those touched this frame; touched meshes are never evicted. */
const MAX_CACHED_MESHES = 1500;

/** Cells per side of a tile's flat sea grid (section 4.4). */
const SEA_CELLS = 8;
let seaIndexCache: THREE.BufferAttribute | undefined;
/** Triangles of the sea grid over a tile's vertex grid, every TILE_N / SEA_CELLS vertices. */
function seaIndex(): THREE.BufferAttribute {
  if (seaIndexCache) return seaIndexCache;
  const S = TILE_N + 1;
  const step = TILE_N / SEA_CELLS;
  const idx: number[] = [];
  for (let j = 0; j < SEA_CELLS; j++)
    for (let i = 0; i < SEA_CELLS; i++) {
      const a = j * step * S + i * step;
      const b = a + step;
      const c = a + step * S;
      const d = c + step;
      idx.push(a, c, b, b, c, d);
    }
  seaIndexCache = new THREE.BufferAttribute(new Uint16Array(idx), 1);
  return seaIndexCache;
}

interface TileEntry {
  key: TileKey;
  mesh: THREE.Mesh;
  centre: THREE.Vector3;
  radius: number;
  dataVersion: number;
  iceStamp: string;
  /** Face coordinates per vertex, for ice sampling. */
  uv: Float32Array;
  lastUsed: number;
}

export interface GlobeQuality {
  errorTargetPx: number;
  waterDetail: number;
}

export class Globe {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  /** The flat sea surface over every tile, sharing the terrain's uniforms (section 4.4). */
  readonly seaMaterial: THREE.ShaderMaterial;
  readonly store: TerrainStore;
  private loader: ContentLoader;
  private tiles = new Map<string, TileEntry>();
  private frame = 0;
  private buildsThisFrame = 0;
  quality: GlobeQuality = { errorTargetPx: 2.5, waterDetail: 1 };
  /** Tiles drawn last frame. */
  drawnTiles = 0;
  private iceWindow = 0;
  /**
   * The ice the globe shows: the slices, blend and time window. A new pair
   * of slices is shown only once every drawn tile has its chunks, so the
   * whole globe changes at once instead of tile by tile (section 10.7).
   */
  private shownIce = { iceA: NaN, iceB: NaN, iceT: 0, window: 0 };
  private maxHeights = new WeakMap<TerrainTile, number>();
  /** The history lens; the identity until the warp has loaded (history-lens.md). */
  lens = Lens.identity();
  private lensTexture: THREE.DataTexture;

  constructor(loader: ContentLoader) {
    this.loader = loader;
    this.store = new TerrainStore(loader);
    this.material = new THREE.ShaderMaterial({
      vertexShader: terrainVertex,
      fragmentShader: terrainFragment,
      side: THREE.DoubleSide,
      uniforms: {
        seaLevel: { value: 0 },
        exaggeration: { value: EXAGGERATION },
        iceT: { value: 0 },
        skirtDepth: { value: 200 },
        landLift: { value: LAND_LIFT_M },
        lightDir: { value: new THREE.Vector3(0, 0, 1) },
        screenUp: { value: new THREE.Vector3(0, 1, 0) },
        glacial: { value: 0 },
        time: { value: 0 },
        cameraWorld: { value: new THREE.Vector3() },
        riverThreshold: { value: 0.5 },
        waterDetail: { value: 1 },
        fields: { value: null },
        lensGrid: { value: null },
        lensBlend: { value: 0 },
        earthRadius: { value: EARTH_RADIUS_KM },
      },
    });
    this.lensTexture = this.makeLensTexture();
    this.seaMaterial = new THREE.ShaderMaterial({
      vertexShader: terrainVertex,
      fragmentShader: terrainFragment,
      side: THREE.DoubleSide,
      uniforms: this.material.uniforms,
      defines: { SEA_SURFACE: 1 },
    });
  }

  /** Uses a loaded warp, keeping the current state of the switch. */
  setLens(lens: Lens): void {
    lens.setOn(this.lens.isOn, false);
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
    u.seaLevel!.value = planet.seaLevel;
    u.glacial!.value = planet.glacialIndex;
    u.cameraWorld!.value.copy(camera.position);
    u.waterDetail!.value = this.quality.waterDetail;
    const lens = this.lens;
    u.lensBlend!.value = lens.blend;
    const corner: Vec3 = [0, 0, 0];
    const drawnCorner: Vec3 = [0, 0, 0];

    const camPos = camera.position;
    const camDist = camPos.length();

    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const pxPerRad = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const camDir = camPos.clone().normalize();
    const horizon = Math.acos(Math.min(1, EARTH_RADIUS_KM / camDist));
    const iceWindow = windowAt(this.loader.manifest.windows, day);

    // Ice can stand up to about 4 km on land during glacials.
    const iceRoom = planet.glacialIndex > 0.02 ? 4000 : 0;
    const selected: TileEntry[] = [];
    const priorities: number[] = [];
    const visit = (key: TileKey) => {
      const c = tileSampleUv(key, TILE_N / 2, TILE_N / 2);
      const trueCentre = faceUvToDir(key.face, c.u, c.v);
      // Tiles are chosen and culled where they are drawn (history-lens.md, section 4).
      const cd = lens.toDrawn(trueCentre);
      const width = lens.widthAt(trueCentre);
      let spread = 1;
      if (lens.blend > 0)
        for (const [i, j] of CORNERS) {
          const p = tileSampleUv(key, i, j);
          faceUvToDir(key.face, p.u, p.v, corner);
          lens.toDrawn(corner, drawnCorner);
          const t = angleBetween(trueCentre, corner);
          if (t > 0) spread = Math.max(spread, angleBetween(cd, drawnCorner) / t);
        }
      const ang = tileAngularSize(key.level) * spread;
      const angle = Math.acos(
        Math.max(-1, Math.min(1, cd[0] * camDir.x + cd[1] * camDir.y + cd[2] * camDir.z)),
      );
      // Highest point of the tile (exaggerated, with room for ice), from its
      // data tile once loaded; mountains stay visible beyond the horizon.
      const topKm =
        (this.maxHeightM(key, angle * EARTH_RADIUS_KM + key.level) + iceRoom + LAND_LIFT_M) *
        EXAGGERATION *
        0.001 *
        width;
      const beyond = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + Math.max(0, topKm)));
      if (angle - ang * 0.75 > horizon + beyond + 0.002) return;
      const centre = new THREE.Vector3(cd[0], cd[1], cd[2]).multiplyScalar(EARTH_RADIUS_KM);
      const extent = EARTH_RADIUS_KM * ang * 0.75;
      // The tile is a thin column from sea level to its top: test spheres along it.
      const top = Math.max(1, topKm);
      const steps = Math.min(8, Math.ceil(top / Math.max(1, extent)));
      let inside = false;
      for (let k = 0; k <= steps && !inside; k++) {
        const c = centre.clone().addScaledVector(camDirOf(cd), (top * k) / steps);
        inside = frustum.intersectsSphere(new THREE.Sphere(c, extent + top / (2 * steps) + 0.5));
      }
      if (!inside) return;
      const dist = Math.max(0.5, centre.distanceTo(camPos) - extent);
      // Geometric error of the vertex grid, estimated as half its sample spacing.
      const errorKm = (0.5 * EARTH_RADIUS_KM * tileAngularSize(key.level) * width) / TILE_N;
      const errorPx = (errorKm / dist) * pxPerRad;
      const priority = dist + key.level;

      const wantsSplit = key.level < MAX_RENDER_LEVEL && errorPx > this.quality.errorTargetPx;
      if (wantsSplit) {
        const children = childKeys(key);
        // Split only when every child has a mesh; otherwise draw this tile and build them.
        let ready = true;
        for (const ch of children) if (!this.entryFor(ch, priority)) ready = false;
        if (ready) {
          // Keep this tile's mesh too, so zooming out never waits for a rebuild.
          const own = this.tiles.get(tileId(key));
          if (own) own.lastUsed = this.frame;
          for (const ch of children) visit(ch);
          return;
        }
      }
      const entry = this.entryFor(key, priority);
      if (entry) {
        selected.push(entry);
        priorities.push(priority);
      } else if (key.level < MAX_RENDER_LEVEL) {
        // No mesh yet: keep drawing finer children that still exist rather than a hole.
        const children = childKeys(key);
        if (children.every((ch) => this.tiles.has(tileId(ch))))
          for (const ch of children) visit(ch);
      }
    };
    for (let face = 0; face < FACE_COUNT; face++) visit({ face, level: 0, x: 0, y: 0 });

    for (const e of this.tiles.values()) e.mesh.visible = false;
    const shown = this.shownIce;
    if (planet.iceA !== shown.iceA || planet.iceB !== shown.iceB || iceWindow !== shown.window) {
      let ready = true;
      for (let k = 0; k < selected.length; k++)
        if (!this.iceChunks(selected[k]!.key, iceWindow, priorities[k]!)) ready = false;
      if (ready)
        this.shownIce = {
          iceA: planet.iceA,
          iceB: planet.iceB,
          iceT: planet.iceT,
          window: iceWindow,
        };
    } else {
      shown.iceT = planet.iceT;
    }
    this.iceWindow = this.shownIce.window;
    u.iceT!.value = this.shownIce.iceT;
    for (let k = 0; k < selected.length; k++) this.updateIce(selected[k]!, priorities[k]!);
    for (const e of selected) e.mesh.visible = true;
    this.drawnTiles = selected.length;
    this.store.endFrame();
    this.evict();
  }

  /** Highest terrain in metres under a tile, from its data tile; a safe guess until loaded. */
  private maxHeightM(key: TileKey, priority: number): number {
    const src = this.store.sourceFor(key, priority);
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

  private entryFor(key: TileKey, priority: number): TileEntry | undefined {
    const id = tileId(key);
    const existing = this.tiles.get(id);
    const source = this.store.sourceFor(key, priority);
    if (existing) {
      existing.lastUsed = this.frame;
      return existing;
    }
    if (!source) return undefined;
    if (this.buildsThisFrame >= 12 && key.level > 1) return undefined;
    this.buildsThisFrame++;
    const samples = sampleTile(key, source);
    const g = buildTileGeometry(key, samples, EXAGGERATION);
    const mesh = new THREE.Mesh(g.geometry, this.material);
    // The material is shared; each tile binds its own field texture.
    mesh.onBeforeRender = () => {
      this.material.uniforms.fields!.value = g.fields;
      this.material.uniformsNeedUpdate = true;
    };
    mesh.userData.fields = g.fields;
    // The flat sea: the same vertices on a coarse grid, a child so it shares
    // the tile's placement and visibility.
    const seaGeometry = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.geometry.attributes))
      seaGeometry.setAttribute(name, attr);
    seaGeometry.setIndex(seaIndex());
    const sea = new THREE.Mesh(seaGeometry, this.seaMaterial);
    sea.onBeforeRender = () => {
      this.material.uniforms.fields!.value = g.fields;
      this.seaMaterial.uniformsNeedUpdate = true;
    };
    sea.frustumCulled = false;
    sea.matrixAutoUpdate = false;
    mesh.add(sea);
    mesh.position.copy(g.centre);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    // Face coordinates of each vertex (skirts copy their edge vertex).
    const uv = new Float32Array(TILE_VERTS * 2);
    const S = TILE_N + 1;
    for (let j = 0; j <= TILE_N; j++)
      for (let i = 0; i <= TILE_N; i++) {
        const p = tileSampleUv(key, i, j);
        uv[(j * S + i) * 2] = p.u;
        uv[(j * S + i) * 2 + 1] = p.v;
      }
    const edges = [
      (t: number) => t,
      (t: number) => TILE_N * S + t,
      (t: number) => t * S,
      (t: number) => t * S + TILE_N,
    ];
    for (let e = 0; e < 4; e++)
      for (let t = 0; t <= TILE_N; t++)
        uv.copyWithin((S * S + e * S + t) * 2, edges[e]!(t) * 2, edges[e]!(t) * 2 + 2);
    const entry: TileEntry = {
      key,
      mesh,
      centre: g.centre,
      radius: g.radius,
      dataVersion: 0,
      iceStamp: '',
      uv,
      lastUsed: this.frame,
    };
    this.tiles.set(id, entry);
    return entry;
  }

  /** The ice chunks a render tile needs for a window, or undefined while any is loading. */
  private iceChunks(
    key: TileKey,
    window: number,
    priority: number,
  ): Map<string, ReturnType<TerrainStore['iceChunk']>> | undefined {
    const iceKeys = new Map<string, TileKey>();
    if (key.level >= ICE_LEVEL) {
      const shift = key.level - ICE_LEVEL;
      const k = { face: key.face, level: ICE_LEVEL, x: key.x >> shift, y: key.y >> shift };
      iceKeys.set(tileId(k), k);
    } else {
      const span = 1 << (ICE_LEVEL - key.level);
      for (let y = 0; y < span; y++)
        for (let x = 0; x < span; x++) {
          const k = { face: key.face, level: ICE_LEVEL, x: key.x * span + x, y: key.y * span + y };
          iceKeys.set(tileId(k), k);
        }
    }
    const chunks = new Map<string, ReturnType<TerrainStore['iceChunk']>>();
    let ready = true;
    for (const [id, k] of iceKeys) {
      const c = this.store.iceChunk(k, window, priority);
      if (c === undefined) ready = false;
      else chunks.set(id, c);
    }
    return ready ? chunks : undefined;
  }

  /** Fills the tile's ice attribute for the shown pair of slices, when the chunks are loaded. */
  private updateIce(entry: TileEntry, priority: number): void {
    const planet = this.shownIce;
    const stamp = `${planet.iceA}:${planet.iceB}`;
    if (entry.iceStamp === stamp) return;
    const key = entry.key;
    const chunks = this.iceChunks(key, planet.window, priority);
    if (!chunks) return; // keep the previous ice until everything has arrived
    const attr = entry.mesh.geometry.getAttribute('ice') as THREE.BufferAttribute;
    const arr = attr.array as Uint16Array;
    const n = 1 << ICE_LEVEL;
    // Ice tiles this render tile covers; vertices on its edge stay in them, so
    // no edge reads a neighbouring ice tile that was never loaded.
    const shift = key.level - ICE_LEVEL;
    const x0 = shift >= 0 ? key.x >> shift : key.x << -shift;
    const y0 = shift >= 0 ? key.y >> shift : key.y << -shift;
    const span = shift >= 0 ? 1 : 1 << -shift;
    for (let v = 0; v < TILE_VERTS; v++) {
      const u = entry.uv[v * 2]!;
      const w = entry.uv[v * 2 + 1]!;
      const ix = Math.min(x0 + span - 1, Math.max(x0, Math.floor(((u + 1) / 2) * n)));
      const iy = Math.min(y0 + span - 1, Math.max(y0, Math.floor(((w + 1) / 2) * n)));
      const chunk = chunks.get(`${key.face}-${ICE_LEVEL}-${ix}-${iy}`);
      const o = v * 4;
      if (!chunk || chunk === 'none') {
        arr.fill(0, o, o + 4);
        continue;
      }
      const ia = chunk.days.indexOf(planet.iceA);
      const ib = chunk.days.indexOf(planet.iceB);
      arr[o] = ia >= 0 ? sampleIce(chunk, ia, u, w) : 0;
      arr[o + 1] = ib >= 0 ? sampleIce(chunk, ib, u, w) : arr[o]!;
      arr[o + 2] = ia >= 0 ? sampleIce(chunk, ia, u, w, chunk.aridity) : 0;
      arr[o + 3] = ib >= 0 ? sampleIce(chunk, ib, u, w, chunk.aridity) : arr[o + 2]!;
    }
    attr.needsUpdate = true;
    entry.iceStamp = stamp;
  }

  private evict(): void {
    if (this.tiles.size <= MAX_CACHED_MESHES) return;
    const old = [...this.tiles.values()]
      .filter((e) => e.lastUsed < this.frame)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    for (const e of old.slice(0, this.tiles.size - MAX_CACHED_MESHES)) {
      this.group.remove(e.mesh);
      for (const child of e.mesh.children) (child as THREE.Mesh).geometry.dispose();
      e.mesh.geometry.dispose();
      (e.mesh.userData.fields as THREE.DataTexture).dispose();
      this.tiles.delete(tileId(e.key));
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
    const h = this.store.heightAt(dir) + this.iceAt(dir, planet);
    // Approximates the ocean mask by height: land stands on its lift above the sea.
    const top = h > planet.seaLevel ? h + LAND_LIFT_M : planet.seaLevel;
    return top * EXAGGERATION * 0.001 * this.lens.widthAt(dir);
  }

  /** Ice thickness in metres at a direction, blended like the shader; 0 until the chunk is loaded. */
  private iceAt(dir: Vec3, planet: PlanetState): number {
    const { face, u, v } = dirToFaceUv(dir);
    const chunk = this.store.iceChunk(tileAt(face, u, v, ICE_LEVEL), this.iceWindow, 0);
    if (!chunk || chunk === 'none') return 0;
    const ia = chunk.days.indexOf(planet.iceA);
    const ib = chunk.days.indexOf(planet.iceB);
    const a = ia >= 0 ? sampleIce(chunk, ia, u, v) : 0;
    const b = ib >= 0 ? sampleIce(chunk, ib, u, v) : a;
    return a + (b - a) * planet.iceT;
  }

  /** The tile at the deepest data level under a direction, for tests and tools. */
  static dataTileAt(dir: Vec3): TileKey {
    const { face, u, v } = dirToFaceUv(dir);
    return tileAt(face, u, v, DATA_MAX_LEVEL);
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

function camDirOf(d: Vec3): THREE.Vector3 {
  return new THREE.Vector3(d[0], d[1], d[2]);
}
