import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import '../../../assets/src/allCultureModels.ts';
import { setModels } from '../content/assets.ts';
import type { ContentLoader } from '../content/loader.ts';
import { TIMELINE_START } from '../time/calendar.ts';
import { msAtDay } from '../time/rate.ts';
import type { SurfaceSource } from '../tree/surface.ts';
import { TreeLayer } from '../tree/treeLayer.ts';
import { encodeMask, MASK_RINGS, MASK_SECTORS } from '../world/fieldMask.ts';
import { NEVER } from '../world/tree.ts';
import { buildTuningDiff, classifyGrounding } from './debugInspector.ts';

describe('debugInspector helpers', () => {
  it('classifies house grounding status across ok, warn, and violation thresholds', () => {
    expect(classifyGrounding(0, 0, 50, 108)).toBe('ok');
    expect(classifyGrounding(0, 0, 90, 108)).toBe('warn');
    expect(classifyGrounding(0.5, 0, 50, 108)).toBe('violation');
    expect(classifyGrounding(0, 0.2, 50, 108)).toBe('violation');
  });

  it('builds minimal JSON diff omitting unchanged defaults', () => {
    const base = {
      cultures: { 'lbk-farmer': 7.6, 'anatolian-farmer': 3.5 },
      wildlife: { 'animal-mammoth': 4, 'animal-wolf': 1.5 },
    };
    expect(
      buildTuningDiff(base, {
        cultures: { 'lbk-farmer': 7.6, 'anatolian-farmer': 3.5 },
        wildlife: { 'animal-mammoth': 4 },
      }),
    ).toEqual({});

    expect(
      buildTuningDiff(base, {
        cultures: { 'lbk-farmer': 8.1, 'anatolian-farmer': 3.5 },
        wildlife: { 'animal-mammoth': 3.4, 'animal-wolf': 1.5 },
      }),
    ).toEqual({
      cultures: { 'lbk-farmer': { houseM: 8.1 } },
      wildlife: { 'animal-mammoth': { drawnM: 3.4 } },
    });
  });

  it('populates TreeLayer.debugSnapshot with zero hover gap and 4 oriented corners on sloped terrain', async () => {
    setModels([{ id: 'shelter-lbk-longhouse', status: 'approved', file: '' }]);
    const land = encodeMask(new Array<boolean>(MASK_RINGS * MASK_SECTORS).fill(true));
    const chunk = {
      fromDay: TIMELINE_START,
      toDay: TIMELINE_START + 1000,
      figures: [],
      lodgings: [
        {
          id: 7,
          camp: 42,
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
    const surface: SurfaceSource = {
      toDrawn: (d) => d,
      surfaceKm: (d) => d[0] * 120,
      version: () => 0,
    };
    const loader = { json: () => Promise.resolve(chunk) } as unknown as ContentLoader;
    const layer = new TreeLayer(loader, surface);
    layer.debugEnabled = true;
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

      const snap = layer.debugSnapshot();
      expect(snap.lodgings.length).toBe(1);
      expect(snap.villages.length).toBe(1);
      const l = snap.lodgings[0]!;
      expect(l.hoverGapKm).toBe(0);
      expect(l.corners.length).toBe(4);
      expect(l.maxH).toBeGreaterThan(l.minH);
    } finally {
      if (hadHeight) g.innerHeight = prevHeight;
      else delete g.innerHeight;
    }
  });
});
