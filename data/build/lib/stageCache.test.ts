import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StageCache, importClosure, type Written } from './stageCache.ts';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'stage-cache-'));
  mkdirSync(join(root, 'curated'));
  writeFileSync(join(root, 'lib.ts'), 'export const a = 1;\n');
  writeFileSync(join(root, 'stage.ts'), "import { a } from './lib.ts';\nexport const b = a;\n");
  writeFileSync(join(root, 'curated', 'x.json'), '{"x":1}');
  const cache = (on = true) => new StageCache(join(root, 'cache'), root, join(root, 'curated'), on);
  /** Runs a stage that reads x.json and writes a file, counting runs. */
  const stage = (c: StageCache, key: unknown = 1) => {
    let recording: Written[] = [];
    const replayed: Written[] = [];
    let ran = 0;
    const r = c.through(
      'demo',
      key,
      join(root, 'stage.ts'),
      {
        reads: () => ['x.json'],
        startRecording: () => (recording = []),
        stopRecording: () => recording,
        replay: (w) => replayed.push(...w),
      },
      () => {
        ran++;
        recording.push({ name: 'f.json', bytes: new Uint8Array([1, 2, 3]) });
        return { camps: new Map([[1, new Float64Array([1.5, -Infinity])]]) };
      },
    );
    return { ...r, ran, replayed };
  };
  return { root, cache, stage };
}

describe('stage cache', () => {
  it('replays a stage whose inputs are unchanged, exactly', () => {
    const { cache, stage } = setup();
    const first = stage(cache());
    const second = stage(cache());
    expect([first.hit, first.ran, second.hit, second.ran]).toEqual([false, 1, true, 0]);
    expect(second.value).toEqual(first.value);
    expect(second.replayed).toEqual([{ name: 'f.json', bytes: new Uint8Array([1, 2, 3]) }]);
  });

  it('reruns when a curated file it read, its code or its key changes', () => {
    const { root, cache, stage } = setup();
    stage(cache());
    expect(stage(cache(), 2).hit).toBe(false);
    expect(stage(cache(), 2).hit).toBe(true);
    writeFileSync(join(root, 'curated', 'x.json'), '{"x":2}');
    expect(stage(cache(), 2).hit).toBe(false);
  });

  it('keeps nothing with the cache off', () => {
    const { cache, stage } = setup();
    stage(cache(false));
    expect(stage(cache(false)).hit).toBe(false);
  });

  it('follows imports for the code key', () => {
    const { root } = setup();
    expect(importClosure(join(root, 'stage.ts')).map((f) => f.slice(root.length))).toEqual([
      '/lib.ts',
      '/stage.ts',
    ]);
  });
});
