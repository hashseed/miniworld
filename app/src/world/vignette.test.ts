import { describe, expect, it } from 'vitest';
import { TIMELINE_START, astronomicalYear, dayOfYearStart } from '../time/calendar.ts';
import { msAtDay } from '../time/rate.ts';
import { buildVignettes } from '../../../data/build/lib/vignettes.ts';
import {
  buildMembers,
  buildProps,
  buildSpears,
  instancesAt,
  periodInstances,
  loopErrors,
  phaseOf,
  posesAt,
  propPosesAt,
  spearsAt,
  type Pose,
} from './vignette.ts';

const RECORDS = new URL('../../../data/build/fixtures/vignettes', import.meta.url).pathname;
const CURATED = new URL('../../../data/curated', import.meta.url).pathname;
const hunt = buildVignettes({
  curated: CURATED,
  records: RECORDS,
  lanes: new Set(['europe']),
  animals: new Set(['woolly-mammoth']),
  startDay: TIMELINE_START,
  cutoffDay: 0,
}).vignettes.find((v) => v.structure.id === 'mammoth-hunt')!.structure;
const bce = (y: number) => dayOfYearStart(astronomicalYear(y, 'BCE'));
const T = hunt.template;
/** The hunt of the 1,000-year period that contains a year. */
const huntOf = (y: number) =>
  periodInstances(hunt, Math.floor((bce(y) - hunt.fromDay) / hunt.periodDays), TIMELINE_START)[0]!;
const msOf = (day: number) => msAtDay(day, TIMELINE_START);

describe('vignette player', () => {
  it('has no instance outside the span', () => {
    const at = (ms: number) => instancesAt(hunt, ms, TIMELINE_START);
    expect(at(msOf(bce(43001)))).toEqual([]);
    const first = huntOf(43000);
    expect(first.startMs).toBeGreaterThanOrEqual(msOf(hunt.fromDay));
    expect(at(first.startMs)).toHaveLength(1);
    expect(at(first.startMs - 1)).toEqual([]);
    expect(at(first.endMs)).toEqual([]);
    const last = huntOf(10001);
    expect(last.endMs).toBeLessThanOrEqual(msOf(hunt.toDay));
    // A last period cut short by the span's end may run its script just past it, never longer.
    expect(at(msOf(hunt.toDay) + T.loopMs)).toEqual([]);
  });

  it('plays one hunt per period at a hashed moment, respecting site dates', () => {
    for (let y = 43000; y > 10000; y -= 1000) {
      const i = huntOf(y);
      expect(i.site.fromDay ?? -Infinity).toBeLessThanOrEqual(i.fromDay);
      expect(i.endMs - i.startMs).toBe(T.loopMs);
      expect(i.startMs).toBeGreaterThanOrEqual(msOf(i.fromDay));
      expect(i.endMs).toBeLessThanOrEqual(msOf(i.toDay));
      expect(instancesAt(hunt, i.startMs + 5000, TIMELINE_START).map((x) => x.id)).toEqual([i.id]);
    }
  });

  it('plays the script once over its shown span (section 6.5)', () => {
    const inst = huntOf(25000);
    expect(T.once).toBe(true);
    expect(phaseOf(T, inst, inst.startMs)).toBe(0);
    expect(phaseOf(T, inst, inst.startMs + 37000)).toBe(37000);
    expect(phaseOf(T, inst, inst.endMs - 1)).toBe(T.loopMs - 1);
  });

  it('repeats a loop in whole loops from its first beat', () => {
    const looping = { ...hunt, template: { ...T, once: false } };
    const i = periodInstances(looping, 18, TIMELINE_START)[0]!;
    expect(i.startMs - msOf(i.fromDay)).toBeLessThan(T.loopMs);
    expect((i.endMs - i.startMs) % T.loopMs).toBe(0);
    expect(i.endMs).toBeLessThanOrEqual(msOf(i.toDay));
    expect(phaseOf(looping.template, i, i.startMs + T.loopMs + 5)).toBe(5);
  });

  it('starts and ends with an empty stage', () => {
    expect(loopErrors(T)).toEqual([]);
    const inst = huntOf(25000);
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
    const inst = huntOf(25000);
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
    const inst = huntOf(25000);
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
      for (const inst of [huntOf(y)]) {
        summary.push(
          `${y} BCE ${inst.id} ${inst.site.name} orient ${inst.orient} at ${inst.startMs}`,
        );
        const span = inst.endMs - inst.startMs;
        for (const k of [0, 1, 2, 3])
          for (const p of posesAt(
            inst,
            members,
            phaseOf(T, inst, inst.startMs + Math.floor((span * k) / 4) + 37),
          ))
            summary.push(
              `  ${k}/4 ${p.group}#${p.index} ${p.x},${p.z} ${p.clip} ${p.clipMs} ${p.visibility.toFixed(3)} ${p.dirX.toFixed(4)},${p.dirZ.toFixed(4)}`,
            );
      }
    }
    expect(summary.join('\n')).toMatchSnapshot();
  });
});
