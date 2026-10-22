import { describe, expect, it } from 'vitest';
import { aliveOn, homeOn, lineage, NEVER, type Tree, type TreeFigure } from './tree.ts';
import { stagePoints } from './treeScene.ts';

const figure = (id: number, parent: number, over: Partial<TreeFigure> = {}): TreeFigure => ({
  id,
  parent,
  born: 10,
  branch: 0,
  depth: 0,
  homes: [],
  lost: NEVER,
  ...over,
});

describe('tree figures', () => {
  it('lives from its birth until it is lost', () => {
    const f = figure(0, NEVER, { lost: 50 });
    expect(aliveOn(f, 9)).toBe(false);
    expect(aliveOn(f, 10)).toBe(true);
    expect(aliveOn(f, 49)).toBe(true);
    expect(aliveOn(f, 50)).toBe(false);
    expect(aliveOn(figure(1, NEVER), 1e6)).toBe(true);
  });

  it('lives in the lodging it last moved into', () => {
    const f = figure(0, NEVER, {
      homes: [
        [10, 3, 0],
        [30, 7, 1],
      ],
    });
    expect(homeOn(f, 5)).toBe(NEVER);
    expect(homeOn(f, 10)).toBe(3);
    expect(homeOn(f, 29)).toBe(3);
    expect(homeOn(f, 30)).toBe(7);
  });

  it('lists the line back to the root, nearest first', () => {
    const tree = {
      figures: [figure(0, NEVER), figure(1, 0), figure(2, 1)],
      lodgings: [],
      branches: [],
      moments: [],
    } as Tree;
    expect(lineage(tree, 2)).toEqual([2, 1, 0]);
    expect(lineage(tree, 0)).toEqual([0]);
  });
});

describe('stage points', () => {
  it('rings a monument and ends with its gap, and reaches further than a grave', () => {
    const monument = stagePoints(1, 0, 4, 'monument');
    const grave = stagePoints(1, 0, 4, 'burial');
    expect(monument.length).toBe(1 + 4 * 16 + 1);
    expect(grave.length).toBeGreaterThan(1);
    expect(monument.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))).toBe(true);
  });
});
