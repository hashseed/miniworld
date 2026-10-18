import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  TERRAIN_BORDERED,
  TERRAIN_SAMPLES,
  encodeTerrainTile,
  type TerrainTile,
} from '../content/formats.ts';
import type { ChunkSource } from '../content/loader.ts';
import type { Manifest } from '../content/types.ts';
import { hash32 } from '../core/hash.ts';
import { latLonToDir, type TileKey } from '../geo/cube.ts';
import { EARTH_RADIUS_KM } from '../geo/earth.ts';
import { Globe } from './globe.ts';

const B = TERRAIN_BORDERED;
const S = TERRAIN_SAMPLES;

/** A data tile with hills from a hash of its key, so tiles differ in height. */
function hillTile(key: TileKey): TerrainTile {
  const top = hash32(key.face, key.level, key.x, key.y) % 6000;
  const heights = new Int16Array(B * B);
  for (let j = 0; j < B; j++)
    for (let i = 0; i < B; i++) heights[j * B + i] = Math.round((top * (i + j)) / (2 * B)) - 200;
  return {
    key,
    heights,
    ocean: new Uint16Array(S * S),
    lakes: new Uint8Array(S * S),
    rivers: new Uint8Array(S * S),
    flow: new Uint8Array(S * S * 2).fill(128),
    bed: new Int16Array(S * S),
    coast: new Uint8Array(S * S),
  };
}

/** Serves every terrain tile at once; a quarter of the deepest tiles are deep ocean. */
class InstantSource implements ChunkSource {
  manifest = {
    layers: { terrain: { maxLevel: 4 } },
    climate: { days: [], files: [] },
  } as unknown as Manifest;
  lookup(_layer: string, key: TileKey): string {
    if (key.level === 4 && hash32(key.face, key.x, key.y) % 4 === 0) return 'deep';
    return `${key.face}/${key.level}/${key.x}/${key.y}`;
  }
  fetchChunk(file: string): Promise<ArrayBuffer> {
    const [face, level, x, y] = file.split('/').map(Number) as [number, number, number, number];
    return Promise.resolve(encodeTerrainTile(hillTile({ face, level, x, y })).slice().buffer);
  }
  setPriority(): void {}
}

const settle = () => new Promise((r) => setTimeout(r, 0));

/** A camera over a place, looking at it from an altitude with some tilt. */
function cameraAt(camera: THREE.PerspectiveCamera, lat: number, lon: number, altKm: number): void {
  const up = new THREE.Vector3(...latLonToDir(lat, lon));
  const target = up.clone().multiplyScalar(EARTH_RADIUS_KM);
  camera.position.copy(up.clone().multiplyScalar(EARTH_RADIUS_KM + altKm));
  camera.position.x += altKm * 0.3;
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.near = Math.max(0.01, altKm * 0.02);
  camera.far = EARTH_RADIUS_KM * 4 + altKm * 2;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

interface Inner {
  tiles: Map<string, { mesh: THREE.Mesh; lastUsed: number }>;
}

describe('Globe tile selection', () => {
  it('picks the same tiles along a flight as before', async () => {
    const globe = new Globe(new InstantSource());
    const camera = new THREE.PerspectiveCamera(45, 1.6);
    const planet = { seaLevel: 0, glacialIndex: 0 };
    const frames: string[] = [];
    for (let f = 0; f < 120; f++) {
      const t = f / 120;
      const alt = 20000 * Math.pow(0.002, Math.sin(t * Math.PI));
      cameraAt(camera, 30 + 20 * Math.sin(t * 5), 31 + 60 * t, alt);
      globe.update(camera, 800, planet, 0);
      await settle();
      const inner = globe as unknown as Inner;
      const drawn = [...inner.tiles.entries()]
        .filter(([, e]) => e.mesh.visible)
        .map(([id]) => id)
        .sort();
      frames.push(`${drawn.length}:${hash32(...hashString(drawn.join(',')))}`);
    }
    expect(frames).toMatchSnapshot();
  }, 60_000);
});

/** Four 32-bit words summarising a string. */
function hashString(s: string): [number, number, number, number] {
  const w: [number, number, number, number] = [0, 0, 0, 0];
  for (let k = 0; k < s.length; k++) w[k % 4] = hash32(w[k % 4]!, s.charCodeAt(k));
  return w;
}
