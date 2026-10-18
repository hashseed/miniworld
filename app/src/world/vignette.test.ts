import { describe, expect, it } from 'vitest';
import { TIMELINE_START, astronomicalYear, dayOfYearStart } from '../time/calendar.ts';
import { buildVignettes } from '../../../data/build/lib/vignettes.ts';
import { buildMembers, instancesAt, loopErrors, posesAt } from './vignette.ts';

const CURATED = new URL('../../../data/curated', import.meta.url).pathname;
const hunt = buildVignettes({
  curated: CURATED,
  lanes: new Set(['europe']),
  animals: new Set(['woolly-mammoth']),
  startDay: TIMELINE_START,
  cutoffDay: 0,
}).vignettes.find((v) => v.structure.id === 'mammoth-hunt')!.structure;
const bce = (y: number) => dayOfYearStart(astronomicalYear(y, 'BCE'));

describe('vignette player', () => {
  it('has no instance outside the span', () => {
    expect(instancesAt(hunt, bce(43001))).toEqual([]);
    expect(instancesAt(hunt, hunt.toDay)).toEqual([]);
    expect(instancesAt(hunt, bce(43000))).toHaveLength(2);
    expect(instancesAt(hunt, hunt.toDay - 1)).toHaveLength(2);
  });

  it('picks two different sites per period and respects site dates', () => {
    for (let y = 43000; y > 10000; y -= 250) {
      const list = instancesAt(hunt, bce(y));
      expect(list).toHaveLength(2);
      expect(list[0]!.site.name).not.toBe(list[1]!.site.name);
      for (const i of list) expect(i.site.fromDay ?? -Infinity).toBeLessThanOrEqual(i.fromDay);
    }
  });

  it('never lets two members overlap (section 18.7)', () => {
    // Minimum distances on the stage in centimetres, for figures drawn three times their stage.
    const gap = (a: string, b: string) =>
      a === 'human' && b === 'human' ? 200 : a === 'animal' && b === 'animal' ? 1200 : 900;
    const inst = instancesAt(hunt, bce(25000))[0]!;
    const members = buildMembers(hunt.template);
    const clashes: string[] = [];
    for (let t = 0; t < hunt.template.loopMs; t += 100) {
      const poses = posesAt(hunt.template, members, inst, t - inst.offsetMs).filter(
        (p) => p.visibility > 0.5,
      );
      for (let i = 0; i < poses.length; i++)
        for (let j = i + 1; j < poses.length; j++) {
          const a = poses[i]!;
          const b = poses[j]!;
          const d = Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
          if (d < gap(a.kind, b.kind))
            clashes.push(`t=${t} ${a.group}#${a.index} ${b.group}#${b.index} ${Math.round(d)}`);
        }
    }
    expect(clashes.slice(0, 20)).toEqual([]);
  });

  it('closes its loop', () => {
    expect(loopErrors(hunt.template)).toEqual([]);
    const inst = instancesAt(hunt, bce(25000))[0]!;
    const members = buildMembers(hunt.template);
    for (const t of [0, 12345, 77777]) {
      expect(posesAt(hunt.template, members, inst, t)).toEqual(
        posesAt(hunt.template, members, inst, t + hunt.template.loopMs),
      );
    }
  });

  it('matches the golden poses', () => {
    const summary: string[] = [];
    for (const y of [42500, 30000, 25000, 12000]) {
      for (const inst of instancesAt(hunt, bce(y))) {
        summary.push(
          `${y} BCE ${inst.id} ${inst.site.name} offset ${inst.offsetMs} orient ${inst.orient}`,
        );
        const members = buildMembers(hunt.template);
        for (const t of [0, 37000, 3600000])
          for (const p of posesAt(hunt.template, members, inst, t))
            summary.push(
              `  t=${t} ${p.group}#${p.index} ${p.x},${p.z} ${p.clip} ${p.clipMs} ${p.visibility.toFixed(3)} ${p.dirX.toFixed(4)},${p.dirZ.toFixed(4)}`,
            );
      }
    }
    expect(summary.join('\n')).toMatchSnapshot();
  });
});
