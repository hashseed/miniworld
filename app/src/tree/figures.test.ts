import { describe, expect, it } from 'vitest';
import { buildActor } from './figures.ts';

/** The hunter role's cast rules from vocab/roles.yaml. */
const HUNTER = { man: true as const, tool: 'spear' };

describe('tree figures', () => {
  it('uses the approved models for the mammoth hunt cast', () => {
    const hunter = buildActor('human', 'ice-age-hunter', 'a:hunters-left:0', 0, HUNTER);
    const child = buildActor('human', 'ice-age-hunter', 'a:family:1', 1, {});
    const mammoth = buildActor('animal', 'mammoth', 'a:herd:0', 0);
    // Models hang their skeleton under one group; stand-ins do not.
    for (const actor of [hunter, child, mammoth]) expect(actor.root.children).toHaveLength(1);
    expect(hunter.height).toBeGreaterThan(1.5);
    expect(hunter.height).toBeLessThan(2.1);
    expect(child.height).toBeLessThan(hunter.height);
    expect(mammoth.height).toBeGreaterThan(2.8);
    expect(mammoth.height).toBeLessThan(4.5);
  });

  it('poses the same way for the same clip and time', () => {
    const a = buildActor('human', 'ice-age-hunter', 'k', 0, HUNTER);
    const b = buildActor('human', 'ice-age-hunter', 'k', 0, HUNTER);
    a.pose('throw', 0.4);
    b.pose('throw', 0.4);
    a.root.updateMatrixWorld(true);
    b.root.updateMatrixWorld(true);
    const ea: number[] = [];
    const eb: number[] = [];
    a.root.traverse((o) => ea.push(...o.matrixWorld.elements));
    b.root.traverse((o) => eb.push(...o.matrixWorld.elements));
    expect(ea).toEqual(eb);
  });

  it('falls back to a stand-in for a culture without a model', () => {
    const actor = buildActor('human', 'no-such-culture', 'k', 0, HUNTER);
    expect(actor.root.children.length).toBeGreaterThan(0);
    expect(actor.height).toBeCloseTo(1.75);
  });
});
