import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ContentLoader } from '../content/loader.ts';
import { msAtDay } from '../time/rate.ts';
import { TIMELINE_START } from '../time/calendar.ts';
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
});
