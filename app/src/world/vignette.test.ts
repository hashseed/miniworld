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
