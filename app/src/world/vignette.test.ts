import { describe, expect, it } from 'vitest';
import { TIMELINE_START, astronomicalYear, dayOfYearStart } from '../time/calendar.ts';
import { buildLandmarks } from '../../../data/build/lib/landmarks.ts';
import { buildVignettes } from '../../../data/build/lib/vignettes.ts';
import { buildMembers, instancesAt, loopErrors, posesAt } from './vignette.ts';

const CURATED = new URL('../../../data/curated', import.meta.url).pathname;
const lanes = new Set(['europe', 'mena']);
const giza = buildLandmarks({ curated: CURATED, lanes, startDay: TIMELINE_START, cutoffDay: 0 });
const built = buildVignettes({
  curated: CURATED,
  lanes,
  animals: new Set(['woolly-mammoth']),
  startDay: TIMELINE_START,
  cutoffDay: 0,
  landmarkParts: new Map(giza.landmarks.map((l) => [l.structure.id, l.parts])),
}).vignettes;
const hunt = built.find((v) => v.structure.id === 'mammoth-hunt')!.structure;
const khufu = built.find((v) => v.structure.id === 'khufu-pyramid-building')!.structure;
const menkaure = built.find((v) => v.structure.id === 'menkaure-pyramid-building')!.structure;
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

  it('stands a singular vignette once over its whole span, facing east', () => {
    expect(instancesAt(khufu, khufu.fromDay - 1)).toEqual([]);
    expect(instancesAt(khufu, khufu.toDay)).toEqual([]);
    const first = instancesAt(khufu, khufu.fromDay);
    const last = instancesAt(khufu, khufu.toDay - 1);
    expect(first).toHaveLength(1);
    expect(last).toEqual(first);
    expect(first[0]!.fromDay).toBe(khufu.fromDay);
    expect(first[0]!.toDay).toBe(khufu.toDay);
    expect(first[0]!.orient).toEqual([1, 0]);
  });

  it('scales the building stage to each pyramid and closes the loop at every size', () => {
    const k = menkaure.template.marks['ramp-foot']![1] / khufu.template.marks['ramp-foot']![1];
    expect(k).toBeCloseTo(103.4 / 230.3, 2);
    for (const v of [khufu, menkaure]) {
      expect(loopErrors(v.template)).toEqual([]);
      const inst = instancesAt(v, v.fromDay)[0]!;
      const members = buildMembers(v.template);
      expect(posesAt(v.template, members, inst, 5000)).toEqual(
        posesAt(v.template, members, inst, 5000 + v.template.loopMs),
      );
    }
  });

  it('hauls the sledge up to the top, where the block sinks into place', () => {
    const inst = instancesAt(khufu, khufu.fromDay)[0]!;
    const members = buildMembers(khufu.template);
    const at = (s: number) => {
      const lifeMs = s * 1000 - inst.offsetMs + khufu.template.loopMs;
      return posesAt(khufu.template, members, inst, lifeMs).find((p) => p.group === 'sledge')!;
    };
    expect(at(200).z).toBeGreaterThan(at(100).z);
    expect(at(335).x).toBe(0);
    expect(at(335).z).toBe(0);
    expect(at(345).visibility).toBe(0);
    expect(at(599).visibility).toBe(1);
    const hauler = posesAt(khufu.template, members, inst, 100_000 - inst.offsetMs).find(
      (p) => p.group === 'haulers',
    )!;
    expect(hauler.clip).toBe('haul');
  });
});
