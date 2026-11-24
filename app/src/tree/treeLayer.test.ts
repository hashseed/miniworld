import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import '../../../assets/src/allCultureModels.ts';
import { setModels } from '../content/assets.ts';
import type { ContentLoader } from '../content/loader.ts';
import { msAtDay } from '../time/rate.ts';
import { TIMELINE_START } from '../time/calendar.ts';
import { encodeMask, MASK_RINGS, MASK_SECTORS } from '../world/fieldMask.ts';
import { NEVER } from '../world/tree.ts';
import { FIGURE_KM_PER_M } from '../world/treeScene.ts';
import type { SurfaceSource } from './surface.ts';
import { TreeLayer } from './treeLayer.ts';

describe('the tree layer', () => {
  it('fetches a tree file again when the clock comes back to it after scrubbing away', async () => {
    const asked: string[] = [];
    const loader = {
      json: (file: string) => {
        asked.push(file);
        return Promise.resolve({ fromDay: 0, toDay: 0, figures: [], lodgings: [] });
      },
    } as unknown as ContentLoader;
    const surface = { surfaceKm: () => 0 } as unknown as SurfaceSource;
    const layer = new TreeLayer(loader, surface);
    const windows = Array.from({ length: 40 }, (_, w) => TIMELINE_START + w * 1000);
    layer.setChunks(
      windows.map((_, w) => `m${w}`),
      windows,
    );
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 20_000);
    const at = (w: number) => {
      layer.update(camera, msAtDay(windows[w]! + 1, TIMELINE_START), TIMELINE_START);
      return new Promise((r) => setTimeout(r, 0));
    };
    await at(2);
    await at(2);
    await at(30);
    await at(30);
    const before = asked.filter((f) => f === 'm2').length;
    await at(2);
    expect(asked.filter((f) => f === 'm2').length).toBe(before + 1);
  });

  it('grounds lodgings upright on sloped terrain, invalidates on version bump, and scales wildlife collider to actual half-extent', async () => {
    setModels([{ id: 'shelter-lbk-longhouse', status: 'approved', file: '' }]);
    const land = encodeMask(new Array<boolean>(MASK_RINGS * MASK_SECTORS).fill(true));
    const chunk = {
      fromDay: TIMELINE_START,
      toDay: TIMELINE_START + 1000,
      figures: [],
      lodgings: [
        {
          id: 1,
          camp: 0,
          lat: 0,
          lon: 0,
          built: TIMELINE_START,
          gone: NEVER,
          builder: 0,
          slot: 0,
          reach: [80, 80, 80, 80, 80],
          kind: 'shelter-lbk-longhouse',
          culture: 'lbk-farmer',
          fieldLand: land,
        },
      ],
    };
    let elevationOffset = 0;
    let version = 0;
    // Steep east slope over a 7.6 m longhouse (~323 km drawn) plus versioned datum shift.
    const surface: SurfaceSource = {
      toDrawn: (d) => d,
      surfaceKm: (d) => elevationOffset + d[0] * 400,
      version: () => version,
    };
    const loader = {
      json: () => Promise.resolve(chunk),
    } as unknown as ContentLoader;
    const layer = new TreeLayer(loader, surface);
    layer.setChunks(['m0'], [TIMELINE_START]);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 7200);
    const ms = msAtDay(TIMELINE_START + 1, TIMELINE_START);
    const g = globalThis as { innerHeight?: number };
    const hadHeight = Object.hasOwn(g, 'innerHeight');
    const prevHeight = g.innerHeight;
    g.innerHeight = 900;
    try {
      layer.update(camera, ms, TIMELINE_START);
      await new Promise((r) => setTimeout(r, 0));
      layer.update(camera, ms, TIMELINE_START);

      // Obstacle radius reflects actual 7.6 m longhouse half-extent (~3.8 m), not fixed 1.4 m.
      const obs = layer.obstacles();
      expect(obs.length).toBe(1);
      expect(obs[0]!.km).toBeGreaterThanOrEqual(3.7 * FIGURE_KM_PER_M);

      const readBaseRadius = () => {
        const mesh = layer.group.children
          .flatMap((c) => c.children)
          .find((m) => (m as THREE.InstancedMesh).isInstancedMesh) as
          THREE.InstancedMesh | undefined;
        expect(mesh).toBeDefined();
        const batch = (
          layer as unknown as {
            batches: { batches: Map<string, { poses: Float32Array }> };
          }
        ).batches.batches
          .values()
          .next().value!;
        return batch.poses;
      };
      const poses0 = readBaseRadius();
      const pos0 = new THREE.Vector3(poses0[12]!, poses0[13]!, poses0[14]!);

      // Updating surface version invalidates cached lodging ground elevations.
      elevationOffset = 10;
      version++;
      layer.update(camera, ms, TIMELINE_START);
      const poses1 = readBaseRadius();
      const pos1 = new THREE.Vector3(poses1[12]!, poses1[13]!, poses1[14]!);
      expect(pos1.length() - pos0.length()).toBeCloseTo(10, 1);
    } finally {
      if (hadHeight) g.innerHeight = prevHeight;
      else delete g.innerHeight;
    }
  });
});
