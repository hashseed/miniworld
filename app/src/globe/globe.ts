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
import { windowAt, type PlanetState } from './planet.ts';
import { terrainFragment, terrainVertex } from './shaders.ts';
import { EARTH_RADIUS_KM, TILE_VERTS, buildTileGeometry } from './tileMesh.ts';
import { sampleIce, sampleTile, TerrainStore } from './terrainStore.ts';
import type { TerrainTile } from '../content/formats.ts';

export const EXAGGERATION = 100;
export const MAX_RENDER_LEVEL = 12;
const MAX_CACHED_MESHES = 700;

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
  readonly store: TerrainStore;
  private loader: ContentLoader;
  private tiles = new Map<string, TileEntry>();
  private frame = 0;
  private buildsThisFrame = 0;
  quality: GlobeQuality = { errorTargetPx: 2.5, waterDetail: 1 };
  /** Tiles drawn last frame. */
  drawnTiles = 0;
  private iceWindow = 0;
  private maxHeights = new WeakMap<TerrainTile, number>();

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
        lightDir: { value: new THREE.Vector3(0, 0, 1) },
        glacial: { value: 0 },
        time: { value: 0 },
        cameraWorld: { value: new THREE.Vector3() },
        riverThreshold: { value: 2 },
        waterDetail: { value: 1 },
      },
    });
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
    u.iceT!.value = planet.iceT;
    u.glacial!.value = planet.glacialIndex;
    u.cameraWorld!.value.copy(camera.position);
    u.waterDetail!.value = this.quality.waterDetail;

    const camPos = camera.position;
    const camDist = camPos.length();
    const altitude = camDist - EARTH_RADIUS_KM;
    u.riverThreshold!.value = altitude > 3000 ? 2 : altitude > 600 ? 0.75 : 0.35;

    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const pxPerRad = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const camDir = camPos.clone().normalize();
    const horizon = Math.acos(Math.min(1, EARTH_RADIUS_KM / camDist));
    const iceWindow = windowAt(this.loader.manifest.windows, day);
    this.iceWindow = iceWindow;

    // Ice can stand up to about 4 km on land during glacials.
    const iceRoom = planet.glacialIndex > 0.02 ? 4000 : 0;
    const selected: TileEntry[] = [];
    const visit = (key: TileKey) => {
      const c = tileSampleUv(key, TILE_N / 2, TILE_N / 2);
      const cd = faceUvToDir(key.face, c.u, c.v);
      const ang = tileAngularSize(key.level);
      const angle = Math.acos(
        Math.max(-1, Math.min(1, cd[0] * camDir.x + cd[1] * camDir.y + cd[2] * camDir.z)),
      );
      // Highest point of the tile (exaggerated, with room for ice), from its
      // data tile once loaded; mountains stay visible beyond the horizon.
      const topKm =
        (this.maxHeightM(key, angle * EARTH_RADIUS_KM + key.level) + iceRoom) *
        EXAGGERATION *
        0.001;
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
      const errorKm = (0.5 * EARTH_RADIUS_KM * ang) / TILE_N;
      const errorPx = (errorKm / dist) * pxPerRad;
      const priority = dist + key.level;

      const wantsSplit = key.level < MAX_RENDER_LEVEL && errorPx > this.quality.errorTargetPx;
      if (wantsSplit) {
        const children = childKeys(key);
        // Split only when every child has a mesh; otherwise draw this tile and build them.
        let ready = true;
        for (const ch of children)
          if (!this.tiles.has(tileId(ch)) && !this.entryFor(ch, priority)) ready = false;
        if (ready) {
          for (const ch of children) visit(ch);
          return;
        }
      }
      const entry = this.entryFor(key, priority);
      if (entry) {
        this.updateIce(entry, planet, iceWindow, priority);
        selected.push(entry);
      }
    };
    for (let face = 0; face < FACE_COUNT; face++) visit({ face, level: 0, x: 0, y: 0 });

    for (const e of this.tiles.values()) e.mesh.visible = false;
    for (const e of selected) {
      e.mesh.visible = true;
      e.lastUsed = this.frame;
    }
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
    if (existing) return existing;
    if (!source) return undefined;
    if (this.buildsThisFrame >= 12 && key.level > 1) return undefined;
    this.buildsThisFrame++;
    const samples = sampleTile(key, source);
    const g = buildTileGeometry(key, samples, EXAGGERATION);
    const mesh = new THREE.Mesh(g.geometry, this.material);
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

  /** Fills the tile's ice attribute for the current pair of slices, when the chunks are loaded. */
  private updateIce(entry: TileEntry, planet: PlanetState, window: number, priority: number): void {
    const stamp = `${planet.iceA}:${planet.iceB}`;
    if (entry.iceStamp === stamp) return;
    // Ice tiles touched by this render tile.
    const key = entry.key;
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
    for (const [id, k] of iceKeys) {
      const c = this.store.iceChunk(k, window, priority);
      if (c === undefined) return; // keep the previous ice until everything has arrived
      chunks.set(id, c);
    }
    const attr = entry.mesh.geometry.getAttribute('ice') as THREE.BufferAttribute;
    const arr = attr.array as Uint16Array;
    const n = 1 << ICE_LEVEL;
    for (let v = 0; v < TILE_VERTS; v++) {
      const u = entry.uv[v * 2]!;
      const w = entry.uv[v * 2 + 1]!;
      const ix = Math.min(n - 1, Math.max(0, Math.floor(((u + 1) / 2) * n)));
      const iy = Math.min(n - 1, Math.max(0, Math.floor(((w + 1) / 2) * n)));
      const chunk = chunks.get(`${key.face}-${ICE_LEVEL}-${ix}-${iy}`);
      if (!chunk || chunk === 'none') {
        arr[v * 2] = 0;
        arr[v * 2 + 1] = 0;
        continue;
      }
      const ia = chunk.days.indexOf(planet.iceA);
      const ib = chunk.days.indexOf(planet.iceB);
      arr[v * 2] = ia >= 0 ? sampleIce(chunk, ia, u, w) : 0;
      arr[v * 2 + 1] = ib >= 0 ? sampleIce(chunk, ib, u, w) : arr[v * 2]!;
    }
    attr.needsUpdate = true;
    entry.iceStamp = stamp;
  }

  private evict(): void {
    if (this.tiles.size <= MAX_CACHED_MESHES) return;
    const old = [...this.tiles.values()]
      .filter((e) => !e.mesh.visible)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    for (const e of old.slice(0, this.tiles.size - MAX_CACHED_MESHES)) {
      this.group.remove(e.mesh);
      e.mesh.geometry.dispose();
      this.tiles.delete(tileId(e.key));
    }
  }

  /** Surface height in km above the sphere at a direction, including sea, ice and exaggeration. */
  surfaceKm(dir: Vec3, planet: PlanetState): number {
    const h = this.store.heightAt(dir) + this.iceAt(dir, planet);
    return Math.max(h, planet.seaLevel) * EXAGGERATION * 0.001;
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

function camDirOf(d: Vec3): THREE.Vector3 {
  return new THREE.Vector3(d[0], d[1], d[2]);
}
