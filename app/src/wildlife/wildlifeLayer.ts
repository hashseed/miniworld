// Draws the wildlife (spec wildlife.md, section 5): every species is one
// instanced mesh, its model's moving parts merged, with its ink outline: two
// draw calls a species. Each frame one copy of the model is posed per animal
// with the animal clips and its part matrices are written into a pose texture
// the shaders read. It only draws; where the animals are and what they do
// comes from world/wildlife.ts.

import * as THREE from 'three';
import { drawable } from '../content/assets.ts';
import { ANIMALS, buildAnimal, type AnimalId } from '../../../assets/src/animals.ts';
import { animalLoop, animateAnimal, walkPeriod } from '../../../assets/src/clips.ts';
import type { Model } from '../../../assets/src/kit.ts';
import { ClipBatches } from '../tree/clipBatches.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import { latLonToDir, type Vec3 } from '../geo/cube.ts';
import { msAtDay } from '../time/rate.ts';
import { CAMP_KEEP_OUT_KM } from '../world/treeScene.ts';
import { NEVER } from '../world/tree.ts';
import {
  decodeWildMask,
  groupGrowth,
  keepOutsOf,
  CLEAR_STEP_S,
  wildClearings,
  wildlifeAt,
  WILD_GROUPS,
  type KeepOut,
  type WildAnimal,
  type WildMask,
} from '../world/wildlife.ts';
import type { SurfaceSource } from '../tree/surface.ts';

/** Drawn kilometres per life-size metre: half as large again as the figures (section 1). */
export const KM_PER_M = 63.75;
/** An animal's size (the larger of its height and half its length) is drawn between these, in metres (section 1). */
const MIN_SIZE_M = 1.8;
const MAX_SIZE_M = 4;
/** Drawn sizes that differ from the rule above (section 5). */
export const DRAWN_SIZE_M: Record<string, number> = {
  'animal-kea': 1.2,
  'animal-haast-eagle': 2.2,
  'animal-capybara': 1.2,
};
/** Species drawn smaller than the rule above gives, as a share of it (section 5). */
const SHRINK: Record<string, number> = { 'animal-wolf': 0.75, 'animal-cave-lion': 0.85 };
/** An animal's drawn size in metres, by its model and its life-size size (the larger of height and half length). */
export function drawnSizeM(model: string, sizeM: number): number {
  return (
    DRAWN_SIZE_M[model] ?? Math.min(MAX_SIZE_M, Math.max(MIN_SIZE_M, sizeM)) * (SHRINK[model] ?? 1)
  );
}
/** Something on the drawn globe animals keep clear of (section 4): its direction and half size in km. */
export interface Obstacle {
  dir: THREE.Vector3;
  km: number;
}
/** The clock's stretches for the trees' clearings, and how long they take to fade in and out, in seconds (section 4). */
const CLEAR_STRETCH_S = CLEAR_STEP_S;
const CLEAR_FADE_S = 1.5;
/** Most animals of one species drawn at once. */
const CAPACITY = 12;

interface Species {
  template: Model;
  /** Drawn km per model metre. */
  scale: number;
  /** Body length in model metres, for spacing the group. */
  length: number;
  /** Height in model metres, for sea animals at the surface. */
  height: number;
  count: number;
}

/** How far the ground around an animal may lift it, in body heights (section 5). */
const MAX_LIFT = 0.1;
/** The most the ground may lift an animal to keep its feet out of a slope steeper than it leans. */
const MAX_SLOPE_LIFT = 0.3;
/** Smallest radius around an animal that a tap hits, in CSS pixels (section 8). */
const HIT_MIN_PX = 24;
/** Rounds of pushing overlapping animals apart each frame (section 5). */
const SEPARATE_PASSES = 3;
/** The steepest an animal leans with the ground, as a slope (about 15 degrees). */
const MAX_TILT = 0.27;

/**
 * Where an animal stands given the ground under its middle and a distance halfKm in front, behind,
 * right and left of it (spec wildlife.md, section 5): raised by at most a tenth of its height where
 * the points around it lie higher (a valley), leaning with the slope by at most MAX_TILT. Where the
 * ground is steeper than the lean (clamped), it is raised until none of the four points lies above its feet,
 * by at most MAX_SLOPE_LIFT body heights, so no animal sinks into a hillside (issue 129).
 */
export function standOnGround(
  middle: number,
  front: number,
  back: number,
  right: number,
  left: number,
  halfKm: number,
  heightKm: number,
): { ground: number; along: number; across: number } {
  const mean = (front + back + right + left) / 4;
  let ground = middle + Math.min(Math.max(mean - middle, 0), heightKm * MAX_LIFT);
  let along = (front - back) / (2 * halfKm);
  let across = (right - left) / (2 * halfKm);
  const steep = Math.sqrt(along * along + across * across);
  if (steep > MAX_TILT) {
    along *= MAX_TILT / steep;
    across *= MAX_TILT / steep;
    const buried = Math.max(
      front - (ground + along * halfKm),
      back - (ground - along * halfKm),
      right - (ground + across * halfKm),
      left - (ground - across * halfKm),
    );
    if (buried > 0) ground += Math.min(buried, heightKm * MAX_SLOPE_LIFT);
  }
  return { ground, along, across };
}

export class WildlifeLayer {
  readonly group = new THREE.Group();
  private surface: SurfaceSource;
  private species = new Map<string, Species | null>();
  /** Animals drawn last frame. */
  count = 0;
  /** Each group's ground mask from the startup index; nothing is drawn before it arrives. */
  private masks: WildMask[] | undefined;
  private camps: readonly [number, number, number, number][] = [];
  private keepOutKey = '';
  private keepOutList: KeepOut[][] = [];
  /** The clearings of the last few stretches of the clock, by stretch and what they hang on. */
  private clearCache = new Map<string, { dir: Vec3; km: number }[]>();
  /**
   * One body length of a model on the true globe at a group's home: its drawn
   * length over the history lens's width there, so the group keeps its drawn
   * spacing and the world can check each animal's place against the mask.
   */
  private reach = (model: string, g: { lat: number; lon: number }) => {
    const s = this.speciesOf(model);
    return s ? (s.length * s.scale) / (this.surface.widthAt?.(latLonToDir(g.lat, g.lon)) ?? 1) : 0;
  };
  private root = new THREE.Matrix4();
  /** Every species, its animals playing baked clips: two draw calls a species (clipBatches.ts). */
  private clips = new ClipBatches(animateAnimal, animalLoop);
  private basis = new THREE.Matrix4();
  private up = new THREE.Vector3();
  private north = new THREE.Vector3();
  private east = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private v2 = new THREE.Vector3();
  private scaleV = new THREE.Vector3();
  /** The animals drawn last frame, for taps: middle, drawn half size in km and group index. */
  private drawn: { at: THREE.Vector3; radiusKm: number; group: number }[] = [];
  private drawnCount = 0;
  private camera: THREE.Camera | undefined;
  private ups: THREE.Vector3[] = [];
  private halfKm: number[] = [];

  constructor(surface: SurfaceSource) {
    this.surface = surface;
    this.group.add(this.clips.group);
  }

  /** The ground masks of the startup index, one hex string per group (section 4). */
  setMasks(hex: readonly string[]): void {
    // Masks built for another list of groups would put animals on the wrong
    // ground (in the sea), so data older than the app draws no wildlife.
    if (hex.length !== WILD_GROUPS.length) {
      console.warn(
        `wildlife: ${hex.length} ground masks for ${WILD_GROUPS.length} groups; run build-data`,
      );
      return;
    }
    this.masks = WILD_GROUPS.map((_, i) => (hex[i] ? decodeWildMask(hex[i]) : undefined));
  }

  /** The camp places of the startup index, which the groups keep clear of (section 4). */
  setCamps(camps: readonly [number, number, number, number][]): void {
    this.camps = camps;
    this.keepOutKey = '';
  }

  /**
   * Each group's keep-outs at a timeline start: the camps in clock seconds, their circle on
   * the true globe the drawn keep-out over the lens's width at the home, like places in the
   * group. Rebuilt only when the start or the lens changes.
   */
  private keepOuts(startDay: number): KeepOut[][] {
    const widths = WILD_GROUPS.map((g) => this.surface.widthAt?.(latLonToDir(g.lat, g.lon)) ?? 1);
    const key = `${startDay}:${widths.map((w) => w.toFixed(4)).join(',')}`;
    if (key === this.keepOutKey) return this.keepOutList;
    const camps = this.camps.map(([lat, lon, from, to]) => ({
      lat,
      lon,
      from: msAtDay(from, startDay) / 1000,
      to: to === NEVER ? Infinity : msAtDay(to, startDay) / 1000,
    }));
    this.keepOutList = WILD_GROUPS.map((g, i) =>
      keepOutsOf(g, camps, CAMP_KEEP_OUT_KM / widths[i]!),
    );
    this.keepOutKey = key;
    return this.keepOutList;
  }

  /** Drawn ground height in km at a point km along forward and right of an animal's middle. */
  private groundAt(
    up: THREE.Vector3,
    f: THREE.Vector3,
    r: THREE.Vector3,
    fKm: number,
    rKm: number,
  ) {
    const p = this.v2
      .copy(up)
      .multiplyScalar(EARTH_RADIUS_KM)
      .addScaledVector(f, fKm)
      .addScaledVector(r, rKm)
      .normalize();
    return this.surface.surfaceKm([p.x, p.y, p.z]);
  }

  /**
   * The ground under an animal and its slope (section 5): the drawn ground
   * under its middle and at four points about a third of a body length to
   * the front, back, left and right. It stands on the middle, raised by at
   * most a tenth of its height where the points around it lie higher (a
   * valley), and tilts with the slope between them, by at most MAX_TILT, so
   * its feet follow the ground instead of hovering above a hillside.
   */
  private slopeUnder(
    up: THREE.Vector3,
    f: THREE.Vector3,
    r: THREE.Vector3,
    halfKm: number,
    heightKm: number,
  ): { ground: number; along: number; across: number } {
    const middle = this.surface.surfaceKm([up.x, up.y, up.z]);
    const front = this.groundAt(up, f, r, halfKm, 0);
    const back = this.groundAt(up, f, r, -halfKm, 0);
    const right = this.groundAt(up, f, r, 0, halfKm);
    const left = this.groundAt(up, f, r, 0, -halfKm);
    return standOnGround(middle, front, back, right, left, halfKm, heightKm);
  }

  /**
   * slopeUnder, kept per animal while it stands where it stood and faces the way it faced:
   * grazing animals, most of them most of the time, cost nothing more. (The history lens is
   * fixed, so the drawn ground under a place does not change.)
   */
  private slopes = new Map<
    string,
    {
      at: THREE.Vector3;
      f: THREE.Vector3;
      half: number;
      s: ReturnType<WildlifeLayer['slopeUnder']>;
    }
  >();
  private slopeCached(
    key: string,
    up: THREE.Vector3,
    f: THREE.Vector3,
    half: number,
    height: number,
  ) {
    const c = this.slopes.get(key);
    if (
      c &&
      c.half === half &&
      c.at.distanceToSquared(up) < 1e-14 &&
      c.f.distanceToSquared(f) < 1e-8
    )
      return c.s;
    const s = this.slopeUnder(up, f, this.right, half, height);
    if (this.slopes.size > 4096) this.slopes.clear();
    this.slopes.set(key, { at: up.clone(), f: f.clone(), half, s });
    return s;
  }

  /** Clearings in the trees where the groups shown on a day graze around a clock time, in true directions. */
  clearings(
    day: number,
    ms: number,
    startDay: number,
  ): { dir: Vec3; km: number; amount: number }[] {
    if (!this.masks) return [];
    // A stretch's clearings fade in over its first CLEAR_FADE_S, and the last stretch's
    // fade out over the next CLEAR_FADE_S, so trees make way and grow back smoothly instead
    // of vanishing at once (Yang, 2026-10-20: "sometimes trees disappear without being
    // felled"); a tree in both stays cleared throughout.
    const stretch = Math.floor(ms / 1000 / CLEAR_STRETCH_S);
    const into = ms / 1000 - stretch * CLEAR_STRETCH_S;
    const cur = this.stretchClearings(stretch, day, startDay);
    const prev = this.stretchClearings(stretch - 1, day, startDay);
    const fadeIn = Math.min(1, into / CLEAR_FADE_S);
    const fadeOut = 1 - Math.min(1, Math.max(0, into - CLEAR_FADE_S) / CLEAR_FADE_S);
    return [
      ...cur.map((c) => ({ ...c, amount: fadeIn })),
      ...(fadeOut > 0 ? prev.map((c) => ({ ...c, amount: fadeOut })) : []),
    ];
  }

  /** The clearings of one stretch of CLEAR_STRETCH_S, kept for the stretch and the next. */
  private stretchClearings(
    stretch: number,
    day: number,
    startDay: number,
  ): { dir: Vec3; km: number }[] {
    const keepOuts = this.keepOuts(startDay);
    const drawnLength = (model: string) => {
      const s = this.speciesOf(model);
      return s ? s.length * s.scale : 0;
    };
    const width = (g: { lat: number; lon: number }) =>
      this.surface.widthAt?.(latLonToDir(g.lat, g.lon)) ?? 1;
    // The clearings change once a stretch, or when a group grows in or the lens moves.
    const key = [
      stretch,
      this.keepOutKey,
      WILD_GROUPS.map((g) => (groupGrowth(g, day) > 0 ? 1 : 0)).join(''),
    ].join('|');
    const hit = this.clearCache.get(key);
    if (hit) return hit;
    const list = wildClearings(
      day,
      stretch * CLEAR_STRETCH_S,
      WILD_GROUPS,
      this.masks!,
      this.reach,
      drawnLength,
      width,
      keepOuts,
    ).map((c) => ({ dir: this.offsetDir(c.lat, c.lon, c.eastKm, c.northKm), km: c.km }));
    this.clearCache.set(key, list);
    // Only this stretch's and the last one's are needed.
    while (this.clearCache.size > 3) this.clearCache.delete(this.clearCache.keys().next().value!);
    return list;
  }

  /** The true direction km east and north of a point. */
  private offsetDir(lat: number, lon: number, eastKm: number, northKm: number): Vec3 {
    const up = this.up.set(...latLonToDir(lat, lon));
    northEast(up, this.north, this.east);
    up.multiplyScalar(EARTH_RADIUS_KM)
      .addScaledVector(this.east, eastKm)
      .addScaledVector(this.north, northKm)
      .normalize();
    return [up.x, up.y, up.z];
  }

  /** The true direction of an animal's spot: km east and north of its group's home. */
  private trueDir(a: WildAnimal, reachKm: number): Vec3 {
    return this.offsetDir(
      a.lat,
      a.lon,
      a.eastKm + a.offset[0] * reachKm,
      a.northKm + a.offset[1] * reachKm,
    );
  }

  /**
   * The group of the animal under a tap in CSS pixels, if any (section 8):
   * the nearest whose middle lies within its drawn size on screen, at
   * least 24 pixels.
   */
  hit(clientX: number, clientY: number): number | undefined {
    const camera = this.camera;
    if (!camera) return undefined;
    const pxAtKm = (camera.projectionMatrix.elements[5]! * innerHeight) / 2;
    const p = this.v2;
    let best: number | undefined;
    let bestD = Infinity;
    for (let i = 0; i < this.drawnCount; i++) {
      const d = this.drawn[i]!;
      const distance = d.at.distanceTo(camera.position);
      p.copy(d.at).project(camera);
      if (p.z >= 1) continue;
      const x = ((p.x + 1) / 2) * innerWidth;
      const y = ((1 - p.y) / 2) * innerHeight;
      const radius = Math.max(HIT_MIN_PX, (d.radiusKm * pxAtKm) / distance);
      const dist = Math.hypot(clientX - x, clientY - y);
      if (dist < radius && dist < bestD) [best, bestD] = [d.group, dist];
    }
    return best;
  }

  /**
   * Each animal's spot on the drawn globe, pushed apart from any other animal
   * closer than their two half lengths, so no two overlap (section 5; Yang,
   * 2026-10-18: "make sure animals don't overlap with each other"). Its place
   * in the group is added on the true globe, where the world checked it
   * against the mask. Birds fly above the others and are left alone. A pure
   * function of the animals, so the same time gives the same spots.
   */
  private separate(
    animals: readonly WildAnimal[],
    obstacles: readonly Obstacle[],
  ): THREE.Vector3[] {
    const ups = animals.map((a, i) => {
      const v = (this.ups[i] ??= new THREE.Vector3());
      const s = this.speciesOf(a.model);
      v.set(...this.surface.toDrawn(this.trueDir(a, s ? this.reach(a.model, a) : 0))).normalize();
      this.halfKm[i] = s && a.liftKm === 0 ? (s.length * s.scale * a.grow) / 2 : 0;
      return v;
    });
    const push = this.v2;
    for (let pass = 0; pass < SEPARATE_PASSES; pass++)
      for (let i = 0; i < ups.length; i++)
        for (let j = i + 1; j < ups.length; j++) {
          const need = (this.halfKm[i]! + this.halfKm[j]!) / EARTH_RADIUS_KM;
          if (need === 0) continue;
          const a = ups[i]!;
          const b = ups[j]!;
          const gap = a.distanceTo(b);
          if (gap >= need) continue;
          // Apart along the line between them, half each; a seeded way if they coincide.
          if (gap < 1e-9) push.set(1, 0, 0).cross(a).normalize();
          else push.subVectors(a, b).normalize();
          const step = (need - gap) / 2;
          a.addScaledVector(push, step).normalize();
          b.addScaledVector(push, -step).normalize();
        }
    // Then clear of people, hunted animals, lodgings and hearths, which never move (section 4).
    for (let i = 0; i < ups.length; i++) {
      if (this.halfKm[i] === 0) continue;
      const a = ups[i]!;
      for (const o of obstacles) {
        const need = (this.halfKm[i]! + o.km) / EARTH_RADIUS_KM;
        const gap = a.distanceTo(o.dir);
        if (gap >= need) continue;
        if (gap < 1e-9) push.set(1, 0, 0).cross(a).normalize();
        else push.subVectors(a, o.dir).normalize();
        a.addScaledVector(push, need - gap).normalize();
      }
    }
    return ups;
  }

  /** Poses the animals of a day at a clock time in milliseconds. */
  update(
    camera: THREE.Camera,
    day: number,
    ms: number,
    startDay: number,
    obstacles: readonly Obstacle[] = [],
  ): void {
    for (const s of this.species.values()) if (s) s.count = 0;
    this.clips.begin();
    this.camera = camera;
    this.drawnCount = 0;
    const camPos = camera.position;
    this.count = 0;
    const animals = this.masks
      ? wildlifeAt(day, ms / 1000, WILD_GROUPS, this.masks, this.reach, this.keepOuts(startDay))
      : [];
    const ups = this.separate(animals, obstacles);
    animals.forEach((a, ai) => {
      const s = this.speciesOf(a.model);
      if (!s || s.count >= CAPACITY) return;
      const up = this.up.copy(ups[ai]!);
      northEast(up, this.north, this.east);
      const reach = s.length * s.scale;
      const f = this.forward
        .copy(this.east)
        .multiplyScalar(a.heading[0])
        .addScaledVector(this.north, a.heading[1])
        .normalize();
      if (f.lengthSq() < 0.5) f.copy(this.north);
      this.right.crossVectors(up, f);
      // Animals on the far side of the globe are skipped, before any ground is looked up.
      if (this.v2.copy(camPos).sub(this.pos.copy(up).multiplyScalar(EARTH_RADIUS_KM)).dot(up) <= 0)
        return;
      // Land animals stand on the ground and lean with its slope; birds and swimmers stay level.
      const level = a.liftKm > 0 || a.clip === 'swim';
      const { ground, along, across } = level
        ? { ground: this.surface.surfaceKm([up.x, up.y, up.z]), along: 0, across: 0 }
        : this.slopeCached(a.key, up, f, reach * a.grow * 0.35, s.height * s.scale * a.grow);
      // Sea animals ride at the surface: their middle sits rise body heights above it.
      const swim = a.clip === 'swim' ? (a.rise - 0.5) * s.height * s.scale * a.grow : 0;
      this.pos.copy(up).multiplyScalar(EARTH_RADIUS_KM + ground + a.liftKm + swim);
      // Animals on the far side of the globe are skipped.
      if (this.v2.copy(camPos).sub(this.pos).dot(up) <= 0) return;

      // Upright on the ground, whatever the camera does (Yang, 2026-10-18),
      // leaning with the slope under it; sea animals tip nose up or down as
      // they leap and dive.
      const u = this.v2
        .copy(up)
        .addScaledVector(f, -along)
        .addScaledVector(this.right, -across)
        .normalize();
      f.addScaledVector(up, along).normalize();
      if (a.pitch !== 0) {
        const c = Math.cos(a.pitch);
        const sn = Math.sin(a.pitch);
        u.multiplyScalar(c).addScaledVector(f, -sn);
        f.multiplyScalar(c).addScaledVector(up, sn);
      }
      const r = this.right.crossVectors(u, f).normalize();
      f.crossVectors(r, u);
      this.q.setFromRotationMatrix(this.basis.makeBasis(r, u, f));
      const size = s.scale * a.grow;
      this.root.compose(this.pos, this.q, this.scaleV.set(size, size, size));
      const hit = (this.drawn[this.drawnCount++] ??= {
        at: new THREE.Vector3(),
        radiusKm: 0,
        group: 0,
      });
      hit.at.copy(this.pos).addScaledVector(u, (s.height * size) / 2);
      hit.radiusKm = (Math.max(s.height, s.length) * size) / 2;
      hit.group = Number(a.key.split(':')[0]);

      // A walk lasts a whole number of strides, so the legs come to rest as it ends.
      let seconds = a.seconds;
      if (a.walkS > 0) {
        const stride = walkPeriod(s.template);
        seconds *= Math.max(1, Math.round(a.walkS / stride)) * (stride / a.walkS);
      }
      this.clips.add(a.model, () => s.template, this.root, { clip: a.clip, seconds });
      s.count++;
      this.count++;
    });
    this.clips.end();
  }

  /** The instanced meshes of a species, built the first time it is seen; null without an approved model. */
  private speciesOf(model: string): Species | null {
    let s = this.species.get(model);
    if (s !== undefined) return s;
    s = null;
    if ((ANIMALS as readonly string[]).includes(model) && drawable.has(model)) {
      const template = buildAnimal(model as AnimalId);
      template.object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(template.object);
      const sizeM = Math.max(box.max.y - box.min.y, (box.max.z - box.min.z) / 2);
      const drawnM = drawnSizeM(model, sizeM);
      s = {
        template,
        scale: (KM_PER_M * drawnM) / sizeM,
        length: box.max.z - box.min.z,
        height: box.max.y - box.min.y,
        count: 0,
      };
    }
    this.species.set(model, s);
    return s;
  }
}
