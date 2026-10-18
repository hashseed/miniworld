import { describe, expect, it } from 'vitest';
import { TIMELINE_START, astronomicalYear, dayOfYearStart } from '../time/calendar.ts';
import { buildLandmarks } from '../../../data/build/lib/landmarks.ts';
import { buildVignettes } from '../../../data/build/lib/vignettes.ts';
import {
  buildMembers,
  buildProps,
  buildSpears,
  instancesAt,
  loopErrors,
  phaseOf,
  posesAt,
  propPosesAt,
  spearsAt,
  type Pose,
} from './vignette.ts';

const RECORDS = new URL('../../../data/build/fixtures/vignettes', import.meta.url).pathname;
const CURATED = new URL('../../../data/curated', import.meta.url).pathname;
const lanes = new Set(['europe', 'mena']);
const hunt = buildVignettes({
  curated: CURATED,
  records: RECORDS,
  lanes,
  animals: new Set(['woolly-mammoth']),
  startDay: TIMELINE_START,
  cutoffDay: 0,
}).vignettes.find((v) => v.structure.id === 'mammoth-hunt')!.structure;
// The Giza records are shelved as a fixture (spec giza.md, section 12).
const GIZA = new URL('../../../data/build/fixtures/giza', import.meta.url).pathname;
const giza = buildLandmarks({ curated: GIZA, lanes, startDay: TIMELINE_START, cutoffDay: 0 });
const pyramids = buildVignettes({
  curated: GIZA,
  lanes,
  animals: new Set(),
  startDay: TIMELINE_START,
  cutoffDay: 0,
  landmarkParts: new Map(giza.landmarks.map((l) => [l.structure.id, l.parts])),
}).vignettes;
const khufu = pyramids.find((v) => v.structure.id === 'khufu-pyramid-building')!.structure;
const menkaure = pyramids.find((v) => v.structure.id === 'menkaure-pyramid-building')!.structure;
const bce = (y: number) => dayOfYearStart(astronomicalYear(y, 'BCE'));
const T = hunt.template;

describe('vignette player', () => {
  it('has no instance outside the span', () => {
    expect(instancesAt(hunt, bce(43001))).toEqual([]);
    expect(instancesAt(hunt, hunt.toDay)).toEqual([]);
    expect(instancesAt(hunt, bce(43000))).toHaveLength(1);
    expect(instancesAt(hunt, hunt.toDay - 1)).toHaveLength(1);
  });

  it('picks one site per period and respects site dates', () => {
    for (let y = 43000; y > 10000; y -= 250) {
      const list = instancesAt(hunt, bce(y));
      expect(list).toHaveLength(1);
      for (const i of list) expect(i.site.fromDay ?? -Infinity).toBeLessThanOrEqual(i.fromDay);
    }
  });

  it('plays the script once over the shown span (section 6.5)', () => {
    const inst = instancesAt(hunt, bce(25000))[0]!;
    expect(T.once).toBe(true);
    expect(phaseOf(T, inst, inst.fromDay, 999)).toBe(0);
    expect(phaseOf(T, inst, inst.toDay - 1, 0)).toBe(T.loopMs - 1);
    const mid = inst.fromDay + Math.floor((inst.toDay - inst.fromDay) / 2);
    const p = phaseOf(T, inst, mid, 0);
    expect(Math.abs(p - T.loopMs / 2)).toBeLessThan(10);
    // The vignette clock has no say in a script played once.
    expect(phaseOf(T, inst, mid, 123456)).toBe(p);
  });

  it('starts and ends with an empty stage', () => {
    expect(loopErrors(T)).toEqual([]);
    const inst = instancesAt(hunt, bce(25000))[0]!;
    const members = buildMembers(T);
    const props = buildProps(T);
    for (const phase of [0, T.loopMs - 1]) {
      expect(posesAt(inst, members, phase).every((p) => p.visibility === 0)).toBe(true);
      expect(propPosesAt(inst, props, phase).every((p) => p.visibility === 0)).toBe(true);
    }
    // Entering fades in (Yang: "maybe have them fade in"); falling sinks.
    const prey = (t: number) => posesAt(inst, members, t).find((p) => p.group === 'prey')!;
    expect(prey(1000)).toMatchObject({ fade: true });
    expect(prey(1000).visibility).toBeCloseTo(0.5, 2);
    expect(prey(60000)).toMatchObject({ clip: 'fall', fade: false });
    // In the middle the whole band, its tents and its fire are there.
    const camp = propPosesAt(inst, props, 30000);
    expect(camp.map((p) => [p.name, p.visibility])).toEqual([
      ['tent-a', 1],
      ['tent-b', 1],
      ['fire', 1],
    ]);
  });

  it('never lets two members, or a member and a prop, overlap (section 18.7)', () => {
    // Minimum distances on the stage in centimetres, for figures drawn three times their stage.
    // A fallen animal lies low, so the butchers crouch right beside it.
    const gap = (a: Pose, b: Pose) =>
      a.kind === 'human' && b.kind === 'human'
        ? 200
        : a.kind === 'animal' && b.kind === 'animal'
          ? 1200
          : a.clip === 'fall' || b.clip === 'fall'
            ? 450
            : 900;
    // Props are obstacles of their drawn radius: a tent 6 m, the fire 2.5 m, plus a body.
    const propGap = (look: string, kind: string) =>
      (look === 'prop-hearth' ? 250 : 600) + (kind === 'human' ? 100 : 500);
    const inst = instancesAt(hunt, bce(25000))[0]!;
    const members = buildMembers(T);
    const props = buildProps(T);
    const clashes: string[] = [];
    for (let t = 0; t < T.loopMs; t += 100) {
      const poses = posesAt(inst, members, t).filter((p) => p.visibility > 0.5);
      for (let i = 0; i < poses.length; i++)
        for (let j = i + 1; j < poses.length; j++) {
          const a = poses[i]!;
          const b = poses[j]!;
          const d = Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
          if (d < gap(a, b))
            clashes.push(`t=${t} ${a.group}#${a.index} ${b.group}#${b.index} ${Math.round(d)}`);
        }
      for (const p of propPosesAt(inst, props, t).filter((q) => q.visibility > 0.5))
        for (const a of poses) {
          const d = Math.sqrt((a.x - p.x) ** 2 + (a.z - p.z) ** 2);
          if (d < propGap(p.look, a.kind))
            clashes.push(`t=${t} ${a.group}#${a.index} ${p.name} ${Math.round(d)}`);
        }
    }
    expect(clashes.slice(0, 20)).toEqual([]);
  });

  it('throws spears that fly to the mammoth and stick until it is cut up', () => {
    const inst = instancesAt(hunt, bce(25000))[0]!;
    const members = buildMembers(T);
    const spears = buildSpears(T, members);
    expect(spears).toHaveLength(12);
    const prey = members.findIndex((m) => m.group === 'prey');
    for (const s of spears) expect(s.target).toBe(prey);
    const first = spears[0]!;
    const flying = spearsAt(inst, spears, first.releaseMs + 100)[0]!;
    expect(flying.flying?.f).toBeGreaterThan(0);
    expect(flying.stuck).toBeUndefined();
    expect(spearsAt(inst, spears, first.releaseMs - 1)[0]).toEqual({});
    expect(spearsAt(inst, spears, first.landMs)[0]!.stuck?.target).toBe(prey);
    // Gone with the cut-up mammoth.
    expect(spearsAt(inst, spears, T.loopMs - 1).every((s) => !s.flying && !s.stuck)).toBe(true);
  });

  it('matches the golden poses', () => {
    const summary: string[] = [];
    const members = buildMembers(T);
    for (const y of [42500, 30000, 25000, 12000]) {
      for (const inst of instancesAt(hunt, bce(y))) {
        summary.push(`${y} BCE ${inst.id} ${inst.site.name} orient ${inst.orient}`);
        const span = inst.toDay - inst.fromDay;
        for (const k of [0, 1, 2, 3])
          for (const p of posesAt(
            inst,
            members,
            phaseOf(T, inst, inst.fromDay + Math.floor((span * k) / 4) + 37, 0),
          ))
            summary.push(
              `  ${k}/4 ${p.group}#${p.index} ${p.x},${p.z} ${p.clip} ${p.clipMs} ${p.visibility.toFixed(3)} ${p.dirX.toFixed(4)},${p.dirZ.toFixed(4)}`,
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
    const k = menkaure.template.marks['foot-west']![1] / khufu.template.marks['foot-west']![1];
    expect(k).toBeCloseTo(103.4 / 230.3, 2);
    for (const v of [khufu, menkaure]) {
      expect(loopErrors(v.template)).toEqual([]);
      const inst = instancesAt(v, v.fromDay)[0]!;
      const members = buildMembers(v.template);
      const at = (ms: number) => posesAt(inst, members, phaseOf(v.template, inst, v.fromDay, ms));
      expect(at(5000)).toEqual(at(5000 + v.template.loopMs));
    }
  });

  it('carries blocks to the foot of the pyramid and sets them there, never climbing it', () => {
    const inst = instancesAt(khufu, khufu.fromDay)[0]!;
    const members = buildMembers(khufu.template);
    const at = (s: number) =>
      posesAt(inst, members, s * 1000).find((p) => p.group === 'carrier-west')!;
    expect(at(10).clip).toBe('carry');
    expect(at(10).z).toBeGreaterThan(at(1).z);
    expect(at(55).clip).toBe('work');
    // The foot of the pyramid lies outside its base: half of 230.3 m south of the centre.
    for (let t = 0; t < 120; t += 5) expect(at(t).z).toBeLessThan(-11515);
  });
});
