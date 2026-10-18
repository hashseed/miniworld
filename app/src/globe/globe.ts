// The globe: picks quadtree tiles by screen-space error, builds and caches
// their meshes, and feeds the date's sea level and ice to the shader
// (spec milestone 1, sections 4 and 5).

import * as THREE from 'three';
import type { ContentLoader } from '../content/loader.ts';
import {
  DATA_MAX_LEVEL,
  FACE_COUNT,
  TILE_N,
  childKeys,
  dirToFaceUv,
  dirToLatLon,
  faceUvToDir,
  tileAngularSize,
  tileAt,
  tileId,
  tileSampleUv,
  type TileKey,
  type Vec3,
} from './cube.ts';
import { ClimateStore } from './climate.ts';
import { LENS_COLS, LENS_ROWS, Lens } from './lens.ts';
import type { PlanetState } from './planet.ts';
import { terrainFragment, terrainVertex } from './shaders.ts';
import { EARTH_RADIUS_KM, buildTileGeometry, indexFor } from './tileMesh.ts';
import { sampleTile, TerrainStore } from './terrainStore.ts';
import type { TerrainTile } from '../content/formats.ts';

export const EXAGGERATION = 100;
/** Every land vertex stands this many metres above its height (section 4.2). */
export const LAND_LIFT_M = 250;
/** Ice dome height and scale; match the shader (section 5.2). */
const ICE_DOME_M = 1200;
const ICE_DOME_KM = 250;
export const MAX_RENDER_LEVEL = 9;
/** Meshes kept beyond those touched this frame; touched meshes are never evicted. */
const MAX_CACHED_MESHES = 1500;

/** Vertex step of a tile's flat sea grid: 8 × 8 cells (section 4.4). */
const SEA_STEP = TILE_N / 8;
/** Vertex step of polar tiles with a coast, whose relief is smoothed away (section 4.2). */
const POLAR_STEP = 2;

interface TileEntry {
  key: TileKey;
  mesh: THREE.Mesh;
  centre: THREE.Vector3;
  radius: number;
  dataVersion: number;
  lastUsed: number;
}

export interface GlobeQuality {
  errorTargetPx: number;
  waterDetail: number;
}

/** Ground tint before the foliage slices load: none. */
const NO_GROUND = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
NO_GROUND.needsUpdate = true;

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
  private loader: ContentLoader;
  private tiles = new Map<string, TileEntry>();
  private frame = 0;
  private buildsThisFrame = 0;
  quality: GlobeQuality = { errorTargetPx: 2.5, waterDetail: 1 };
  /** Tiles drawn last frame. */
  drawnTiles = 0;
  /** Lowest sea level of the timeline (m); below it a place is sea at every date. */
  lowestSeaLevel = -130;
  /** The date of the last update, for surface queries. */
  private day = 0;
  private maxHeights = new WeakMap<TerrainTile, number>();
  /** The history lens; the identity until the warp has loaded (history-lens.md). */
  lens = Lens.identity();
  private lensTexture: THREE.DataTexture;

  constructor(loader: ContentLoader) {
    this.loader = loader;
    this.store = new TerrainStore(loader);
    this.climate = new ClimateStore(loader);
    this.material = new THREE.ShaderMaterial({
      vertexShader: terrainVertex,
      fragmentShader: terrainFragment,
      side: THREE.DoubleSide,
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
    this.seaIceMaterial = new THREE.ShaderMaterial({
      vertexShader: terrainVertex,
      fragmentShader: terrainFragment,
      side: THREE.DoubleSide,
      uniforms: this.material.uniforms,
      defines: { SEA_SURFACE: 1, SEA_ICE: 1 },
    });
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

      const wantsSplit = key.level < maxLevelAt(trueCentre) && errorPx > this.quality.errorTargetPx;
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
    const g = buildTileGeometry(key, samples, EXAGGERATION, this.lowestSeaLevel);
    // A tile that is sea at every date is its flat sea surface alone, which
    // also carries ice over the sea; polar tiles use a coarser grid; a tile
    // that is never sea needs no sea surface (section 4.2).
    const c = tileSampleUv(key, TILE_N / 2, TILE_N / 2);
    const polar = maxLevelAt(faceUvToDir(key.face, c.u, c.v)) === POLAR_MAX_LEVEL;
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
        seaGeometry.setAttribute(name, attr);
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
      centre: g.centre,
      radius: g.radius,
      dataVersion: 0,
      lastUsed: this.frame,
    };
    this.tiles.set(id, entry);
    return entry;
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
    const h = this.store.heightAt(dir);
    // Approximates the ocean mask by height: land stands on its lift above the sea.
    let top = h > planet.seaLevel ? h + LAND_LIFT_M : planet.seaLevel;
    const iceKm = this.climate.iceKmAt(dir, this.day);
    if (iceKm > 0) {
      const dome = ICE_DOME_M * (1 - Math.exp(-iceKm / ICE_DOME_KM));
      top = Math.max(top, Math.max(h, planet.seaLevel) + LAND_LIFT_M + dome);
    }
    return top * EXAGGERATION * 0.001 * this.lens.widthAt(dir);
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

/**
 * Deepest render level for a tile centre: the polar regions are smoothed so
 * much that finer tiles would add triangles without detail (section 4.2).
 */
const POLAR_MAX_LEVEL = 4;
function maxLevelAt(d: Vec3): number {
  const { lat } = dirToLatLon(d);
  return lat > 74 || lat < -62 ? POLAR_MAX_LEVEL : MAX_RENDER_LEVEL;
}

function camDirOf(d: Vec3): THREE.Vector3 {
  return new THREE.Vector3(d[0], d[1], d[2]);
}
