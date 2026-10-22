// Clips for the models (spec milestone 2, sections 5.3 and 13.3) as pure
// functions of the clip and the seconds since it started, so the same call
// always gives the same pose. The asset build can bake them into animation
// textures; the tree calls them directly every frame.

import * as THREE from 'three';
import type { Model } from './kit.ts';

export type Clip =
  | 'idle'
  | 'walk'
  | 'run'
  | 'carry'
  | 'haul'
  | 'work'
  | 'knap'
  | 'point'
  | 'throw'
  | 'shoot'
  | 'cheer'
  | 'struggle'
  | 'fall'
  | 'fly'
  | 'swim'
  | 'pole'
  | 'bound'
  | 'hung'
  // Camp life (humankind.md section 8.1).
  | 'strike'
  | 'crouch'
  | 'dance'
  | 'scrape'
  | 'crack'
  // Painting a cave wall; falling ill and dying before a burial (humankind.md section 8.2).
  | 'paint'
  | 'ill'
  | 'lie'
  // Carrying the dead to its grave by the limbs, at the waist: the one behind holds its head, the one ahead its feet (humankind.md section 8.2).
  | 'bearBehind'
  | 'bearAhead'
  // Sitting by the fire (humankind.md section 8.1).
  | 'sit'
  // Crossing the sea in a canoe (peopling.md section 6).
  | 'paddle';

/**
 * Height in metres of a carrying pole on the shoulders of two walking people
 * (humankind.md section 8.1); a `hung` animal hangs from it.
 */
export const POLE_HEIGHT = 1.42;
/** Seconds over which a fallen animal's legs are bound together. */
export const BIND_SECONDS = 2.4;

/** Seconds into the throw gesture when the spear leaves the hand. */
export const THROW_RELEASE = 0.55;
/** Seconds into the shoot gesture when the arrow leaves the string, and how long the gesture lasts. */
export const SHOOT_RELEASE = 1.1;
export const SHOOT_SECONDS = 2.4;

const TAU = Math.PI * 2;

/** A stepping clip: seconds per stride, hip swing to each side (radians), share of the stride a foot is down, swing-knee bend. */
interface Gait {
  period: number;
  swing: number;
  stance: number;
  knee: number;
}

/** The stepping clips (spec milestone 2, section 5.3). */
export const GAITS = {
  walk: { period: 1.0, swing: 0.42, stance: 0.6, knee: 0.9 },
  run: { period: 0.6, swing: 0.6, stance: 0.4, knee: 1.7 },
  carry: { period: 1.15, swing: 0.36, stance: 0.62, knee: 0.7 },
  pole: { period: 1.15, swing: 0.36, stance: 0.62, knee: 0.7 },
  bearBehind: { period: 1.15, swing: 0.3, stance: 0.62, knee: 0.7 },
  bearAhead: { period: 1.15, swing: 0.3, stance: 0.62, knee: 0.7 },
  crouch: { period: 1.2, swing: 0.3, stance: 0.62, knee: 1.1 },
  haul: { period: 1.6, swing: 0.27, stance: 0.65, knee: 0.5 },
} satisfies Record<string, Gait>;

/**
 * Metres per second (at life size) a figure must move while playing a
 * stepping clip so that its standing foot stays where it was put down; zero
 * for clips that stand still.
 */
export function gaitSpeed(m: Model, clip: Clip): number {
  const g = (GAITS as Record<string, Gait | undefined>)[clip];
  if (!g) return 0;
  const leg = (m.bones.get('hips')!.userData.rest as THREE.Vector3).y;
  return (2 * leg * Math.sin(g.swing)) / (g.stance * g.period);
}

function reset(m: Model): void {
  for (const b of m.bones.values()) {
    b.rotation.set(0, 0, 0);
    const rest = b.userData.rest as THREE.Vector3 | undefined;
    if (rest) b.position.copy(rest);
  }
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Seconds of one wing beat of the fly clip. */
const FLAP_SECONDS = 0.6;
/** One beat of a swimming tail, in seconds. */
const SWIM_SECONDS = 1.6;

/**
 * Seconds of one stride of an animal's walk clip: a four-legged walk, a
 * penguin's waddle or a kangaroo's hop. A walk that lasts a whole number of
 * strides ends with the legs back at rest.
 */
export function walkPeriod(m: Model): number {
  const rest = m.bones.get('body')!.userData.rest as THREE.Vector3;
  const stride = Math.sqrt(rest.y);
  if (!m.bones.has('legL')) return 1.1 * stride;
  if (m.bones.has('wingL')) return 0.7;
  return m.bones.has('tail') ? 0.75 * stride : 0.9 * stride;
}

/**
 * How a person's clip repeats, for baking it into an animation texture (milestone 2,
 * section 5.3): `loop` seconds after which every pose comes round again, or `once`, the
 * seconds after which a one-off gesture holds still. Clips only animals play are absent.
 */
export const PERSON_LOOPS: Partial<Record<Clip, { loop: number } | { once: number }>> = {
  idle: { loop: 16 },
  walk: { loop: GAITS.walk.period },
  run: { loop: GAITS.run.period },
  carry: { loop: GAITS.carry.period },
  pole: { loop: GAITS.pole.period },
  bearBehind: { loop: GAITS.bearBehind.period },
  bearAhead: { loop: GAITS.bearAhead.period },
  crouch: { loop: GAITS.crouch.period },
  haul: { loop: GAITS.haul.period },
  strike: { loop: 0.45 },
  dance: { loop: 0.8 },
  scrape: { loop: 1.1 },
  crack: { loop: 0.8 },
  paddle: { loop: 2.8 },
  work: { loop: 0.9 },
  knap: { loop: 5.6 },
  paint: { loop: 2.4 },
  ill: { loop: 3.2 },
  sit: { loop: 6.4 },
  lie: { loop: 4 },
  point: { loop: 1.6 },
  cheer: { loop: 0.7 },
  throw: { once: 3 },
  shoot: { once: SHOOT_SECONDS },
  fall: { once: 0 },
};

/** Poses a person built by buildPerson for a clip at a time in seconds. */
export function animatePerson(m: Model, clip: Clip, seconds: number): void {
  reset(m);
  const bone = (name: string) => m.bones.get(name)!;
  const rot = (name: string, x = 0, y = 0, z = 0) => bone(name).rotation.set(x, y, z);
  const lift = (dy: number) => (bone('hips').position.y += dy);
  const t = seconds;
  bone('tool').visible =
    clip !== 'carry' &&
    clip !== 'pole' &&
    clip !== 'bearBehind' &&
    clip !== 'bearAhead' &&
    clip !== 'strike' &&
    clip !== 'crouch' &&
    clip !== 'dance' &&
    clip !== 'scrape' &&
    clip !== 'crack' &&
    clip !== 'paddle' &&
    clip !== 'haul' &&
    clip !== 'work' &&
    clip !== 'knap' &&
    clip !== 'paint' &&
    clip !== 'ill' &&
    clip !== 'sit' &&
    clip !== 'lie' &&
    clip !== 'shoot' &&
    !(clip === 'throw' && t >= THROW_RELEASE);
  bone('load').visible = clip === 'carry';
  // Knapping stones, on the models of cultures that knap.
  for (const name of ['knap', 'hammer']) {
    const stone = m.bones.get(name);
    if (stone) stone.visible = clip === 'knap' || clip === 'crack';
  }

  const hipRest = (bone('hips').userData.rest as THREE.Vector3).y;
  // A planted gait (Yang, 2026-10-18: fluid movements). While a foot is on the
  // ground its leg turns at an even pace, so moving the figure at gaitSpeed()
  // keeps that foot still; the swing forward is a smooth curve that leaves and
  // meets the stance at the same speed, so no joint ever snaps.
  const legs = (phase: number, g: Gait) => {
    const leg = (u: number) => {
      const slope = (2 * g.swing) / g.stance;
      if (u < g.stance) return { angle: -g.swing + slope * u, knee: 0.05 };
      const w = 1 - g.stance;
      const x = (u - g.stance) / w;
      const m = slope * w;
      const angle =
        (2 * x ** 3 - 3 * x ** 2 + 1) * g.swing +
        (x ** 3 - 2 * x ** 2 + x) * m +
        (-2 * x ** 3 + 3 * x ** 2) * -g.swing +
        (x ** 3 - x ** 2) * m;
      return { angle, knee: 0.05 + g.knee * Math.sin(Math.PI * x) ** 2 };
    };
    const u = phase - Math.floor(phase);
    const l = leg(u);
    const r = leg((u + 0.5) % 1);
    rot('legUpperL', l.angle);
    rot('legUpperR', r.angle);
    rot('legLowerL', l.knee);
    rot('legLowerR', r.knee);
    // The hips ride over the standing leg like an upturned pendulum, lowest as a
    // heel comes down, and turn and roll a little with each stride.
    const low = 1 - Math.cos(g.swing);
    lift(-hipRest * low * 0.5 * (0.5 - 0.5 * Math.cos(4 * Math.PI * (u - 0.35))));
    const s = Math.sin(TAU * (u - 0.3));
    rot('hips', 0, -0.2 * g.swing * s, 0.05 * Math.cos(TAU * (u - 0.3)));
    return s;
  };
  /** Arms swing against the legs, lower arms trailing a little behind. */
  const arms = (s: number, lag: number, swing: number, bendL: number, bendR: number, holdR = 0) => {
    rot('armUpperL', -swing * s, 0, 0.1);
    rot('armUpperR', swing * s * (1 - holdR) - 0.15 * holdR, 0, -0.1);
    rot('armLowerL', bendL - 0.12 * (1 - lag));
    rot('armLowerR', bendR - 0.12 * (1 + lag) * (1 - holdR));
  };
  const lagOf = (phase: number) => Math.sin(TAU * (phase - 0.38));

  switch (clip) {
    case 'idle': {
      const b = Math.sin((t / 3.2) * TAU);
      // Breathing, and a slow shift of weight from one leg to the other; the cycles fit
      // PERSON_LOOPS.idle a whole number of times, so the clip can be baked as a loop.
      const w = Math.sin((t / (16 / 3)) * TAU);
      rot('hips', 0, 0.03 * w, 0.025 * w);
      rot('legLowerL', 0.05 + 0.04 * Math.max(0, w) ** 2);
      rot('legLowerR', 0.05 + 0.04 * Math.max(0, -w) ** 2);
      rot('torso', 0.02 * b, 0, -0.02 * w);
      rot('head', 0.04 * b, 0.25 * Math.sin((t / 8) * TAU));
      rot('armUpperL', 0.04 * b, 0, 0.1);
      rot('armUpperR', -0.06 - 0.04 * b, 0, -0.1);
      rot('armLowerR', -0.3);
      break;
    }
    case 'walk': {
      const p = t / GAITS.walk.period;
      const s = legs(p, GAITS.walk);
      // The hand holding a tool swings less.
      arms(s, lagOf(p), 0.4, -0.25, -0.35, 0.35);
      // The torso turns against the hips and the head keeps looking ahead.
      rot('torso', 0.06, 0.12 * s);
      rot('head', 0.02 * Math.cos(2 * p * TAU), -0.06 * s);
      break;
    }
    case 'run': {
      const p = t / GAITS.run.period;
      const s = legs(p, GAITS.run);
      rot('torso', 0.25, 0.15 * s);
      rot('head', -0.18 + 0.03 * Math.cos(2 * p * TAU), -0.08 * s);
      arms(s, lagOf(p), 0.8, -1.1, -0.95);
      rot('armUpperR', 0.56 * s - 0.4, 0, -0.12);
      break;
    }
    case 'carry': {
      // Walking with a bundle across the shoulders, held by both hands.
      const p = t / GAITS.carry.period;
      const s = legs(p, GAITS.carry);
      rot('torso', 0.12, 0.06 * s);
      // Upper arms raised and bent back so the hands hold the bundle behind the neck.
      rot('armUpperL', -3.3, 0, 0.45);
      rot('armUpperR', -3.3, 0, -0.45);
      rot('armLowerL', -1.6);
      rot('armLowerR', -1.6);
      break;
    }
    case 'pole': {
      // Walking in step with a carrying pole on the right shoulder, the right hand
      // up on the pole and the left arm swinging (humankind.md section 8.1).
      const p = t / GAITS.pole.period;
      const s = legs(p, GAITS.pole);
      rot('torso', 0.1, 0.05 * s, 0.06);
      rot('head', -0.05, -0.04 * s);
      rot('armUpperR', -2.7, 0, -0.35);
      rot('armLowerR', -1.7);
      rot('armUpperL', -0.35 * s, 0, 0.12);
      rot('armLowerL', -0.3 - 0.1 * lagOf(p));
      break;
    }
    case 'bearBehind': {
      // Walking behind the dead, holding its head and shoulders at the waist with both hands, the arms
      // reaching down and forward, the back straight (humankind.md section 8.2).
      const p = t / GAITS.bearBehind.period;
      const s = legs(p, GAITS.bearBehind);
      rot('torso', 0.06, 0.02 * s);
      rot('head', 0.1);
      rot('armUpperL', -0.85, 0, 0.08);
      rot('armUpperR', -0.85, 0, -0.08);
      rot('armLowerL', -0.55);
      rot('armLowerR', -0.55);
      break;
    }
    case 'bearAhead': {
      // Walking ahead of the dead with it behind, holding its feet at the waist with
      // both hands, the arms reaching down and back and the head turned to see the way.
      const p = t / GAITS.bearAhead.period;
      const s = legs(p, GAITS.bearAhead);
      rot('torso', 0.0, 0.02 * s);
      rot('armUpperL', 0.55, 0, 0.1);
      rot('armUpperR', 0.55, 0, -0.1);
      rot('armLowerL', -0.35);
      rot('armLowerR', -0.35);
      break;
    }
    case 'strike': {
      // Kneeling at the hearth, striking a flint down onto a stone held low, quick and
      // sharp, to throw sparks onto the tinder (humankind.md section 8.1).
      const u = t / 0.45 - Math.floor(t / 0.45);
      const blow = u < 0.25 ? smooth(u / 0.25) : 1 - smooth((u - 0.25) / 0.75);
      lift(-0.38 * hipRest);
      rot('legUpperL', -1.45);
      rot('legLowerL', 1.5);
      rot('legUpperR', -0.35);
      rot('legLowerR', 2.2);
      rot('torso', 0.65);
      rot('head', -0.4);
      rot('armUpperL', -0.9, 0, -0.25);
      rot('armLowerL', -0.5);
      rot('armUpperR', -1.5 + 0.7 * blow, 0, 0.3);
      rot('armLowerR', -1.1 + 0.6 * blow);
      break;
    }
    case 'crouch': {
      // Bent low through a hut's door, short steps, hands forward.
      const p = t / GAITS.crouch.period;
      const s = legs(p, GAITS.crouch);
      lift(-0.28 * hipRest);
      rot('legUpperL', (bone('legUpperL').rotation.x as number) - 0.55);
      rot('legUpperR', (bone('legUpperR').rotation.x as number) - 0.55);
      rot('legLowerL', (bone('legLowerL').rotation.x as number) + 0.7);
      rot('legLowerR', (bone('legLowerR').rotation.x as number) + 0.7);
      rot('torso', 0.95, 0.05 * s);
      rot('head', -0.6);
      rot('armUpperL', -0.9 - 0.15 * s, 0, 0.15);
      rot('armUpperR', -0.9 + 0.15 * s, 0, -0.15);
      rot('armLowerL', -0.4);
      rot('armLowerR', -0.4);
      break;
    }
    case 'dance': {
      // Stamping in turn, knees high, the body bobbing and the arms up and swaying.
      const p = t / 0.8;
      const u = p - Math.floor(p);
      const left = Math.max(0, Math.sin(u * TAU));
      const right = Math.max(0, -Math.sin(u * TAU));
      rot('legUpperL', -0.9 * left);
      rot('legLowerL', 1.3 * left);
      rot('legUpperR', -0.9 * right);
      rot('legLowerR', 1.3 * right);
      lift(0.05 * hipRest * Math.abs(Math.sin(u * TAU)));
      const sway = Math.sin(u * TAU);
      rot('torso', 0.1, 0.25 * sway, 0.08 * sway);
      rot('head', -0.15, -0.2 * sway);
      rot('armUpperL', -2.4 + 0.35 * sway, 0, 0.5);
      rot('armUpperR', -2.4 - 0.35 * sway, 0, -0.5);
      rot('armLowerL', -0.5);
      rot('armLowerR', -0.5);
      break;
    }
    case 'scrape': {
      // Standing at the drying rack, leaning in and scraping the hide with long strokes.
      const u = t / 1.1 - Math.floor(t / 1.1);
      const push = u < 0.6 ? smooth(u / 0.6) : 1 - smooth((u - 0.6) / 0.4);
      rot('legUpperL', -0.15);
      rot('legUpperR', 0.15);
      rot('torso', 0.35 + 0.1 * push);
      rot('head', -0.2);
      rot('armUpperL', -1.1 - 0.5 * push, 0, 0.15);
      rot('armUpperR', -1.1 - 0.5 * push, 0, -0.15);
      rot('armLowerL', -0.9 + 0.5 * push);
      rot('armLowerR', -0.9 + 0.5 * push);
      break;
    }
    case 'crack': {
      // Sitting cross-legged by the fire, a nut on a flat stone, struck with another.
      const u = t / 0.8 - Math.floor(t / 0.8);
      const raise = (0.5 - 0.5 * Math.cos(TAU * u)) ** 2;
      lift(-0.62 * hipRest);
      rot('legUpperL', -1.4, 0.5);
      rot('legUpperR', -1.4, -0.5);
      rot('legLowerL', 2.3);
      rot('legLowerR', 2.3);
      rot('torso', 0.4);
      rot('head', -0.35);
      rot('armUpperL', -0.7, 0, -0.35);
      rot('armLowerL', -0.8);
      rot('armUpperR', -0.6 - 0.7 * raise, 0, 0.35);
      rot('armLowerR', -0.9 - 0.4 * raise);
      break;
    }
    case 'paddle': {
      // Sitting in a canoe, legs out in front, paddling a stroke on one side, then the other:
      // reach forward, pull back past the hip, lift out.
      const u = t / 1.4 - Math.floor(t / 1.4);
      const side = Math.floor(t / 1.4) % 2 === 0 ? 1 : -1;
      const pull = u < 0.6 ? smooth(u / 0.6) : 1 - smooth((u - 0.6) / 0.4);
      lift(-0.55 * hipRest);
      rot('legUpperL', -1.45, 0.12);
      rot('legUpperR', -1.45, -0.12);
      rot('legLowerL', 0.25);
      rot('legLowerR', 0.25);
      rot('torso', 0.25 - 0.2 * pull, 0.35 * side * (1 - 2 * pull));
      rot('head', -0.1);
      rot('armUpperL', -1.3 + 1.0 * pull, 0, 0.2 + (side > 0 ? 0.25 : 0));
      rot('armUpperR', -1.3 + 1.0 * pull, 0, -0.2 - (side < 0 ? 0.25 : 0));
      rot('armLowerL', -0.5);
      rot('armLowerR', -0.5);
      break;
    }
    case 'haul': {
      // Pulling a rope over the shoulder: leaning into it with short, heavy steps.
      const p = t / GAITS.haul.period;
      const s = legs(p, GAITS.haul);
      rot('torso', 0.45 + 0.04 * s);
      rot('head', -0.3);
      rot('armUpperL', -1.0 + 0.08 * s, 0, 0.15);
      rot('armUpperR', -1.0 - 0.08 * s, 0, -0.15);
      rot('armLowerL', -0.6);
      rot('armLowerR', -0.6);
      break;
    }
    case 'work': {
      // Crouched on one knee, cutting with steady strokes.
      const s = Math.sin((t / 0.9) * TAU);
      lift(-0.38 * (bone('hips').userData.rest as THREE.Vector3).y);
      rot('legUpperL', -1.45);
      rot('legLowerL', 1.5);
      rot('legUpperR', -0.35);
      rot('legLowerR', 2.2);
      rot('torso', 0.5);
      rot('head', -0.25);
      rot('armUpperR', -0.9 - 0.25 * s, 0, -0.1);
      rot('armLowerR', -0.5 + 0.2 * s);
      rot('armUpperL', -0.8, 0, 0.2);
      rot('armLowerL', -0.4);
      break;
    }
    case 'knap': {
      // Kneeling, a hand axe held on the knee, struck with quick blows of a
      // hammerstone; now and then a look at the edge.
      const u = t / 0.7 - Math.floor(t / 0.7);
      const raise = (0.5 - 0.5 * Math.cos(TAU * u)) ** 2;
      const look = Math.max(0, Math.sin((t / 5.6) * TAU)) ** 4;
      lift(-0.38 * (bone('hips').userData.rest as THREE.Vector3).y);
      rot('legUpperL', -1.45);
      rot('legLowerL', 1.5);
      rot('legUpperR', -0.35);
      rot('legLowerR', 2.2);
      rot('torso', 0.45 - 0.15 * look);
      rot('head', -0.35 + 0.1 * look);
      rot('armUpperL', -0.75 - 0.35 * look, 0, -0.4);
      rot('armLowerL', -0.9 - 0.3 * look);
      rot('armUpperR', -0.75 - 0.5 * raise * (1 - look), 0, 0.4);
      rot('armLowerR', -0.9 - 0.5 * raise * (1 - look));
      break;
    }
    case 'paint': {
      // Standing close to the rock, one arm raised to it, dabbing paint on with the
      // fingers in short strokes; the other hand holds the colour low at the side, and
      // now and then the painter leans back to look.
      const u = t / 0.6 - Math.floor(t / 0.6);
      const dab = Math.sin(TAU * u);
      const look = Math.max(0, Math.sin((t / 2.4) * TAU)) ** 6;
      rot('torso', 0.08 - 0.12 * look);
      rot('head', -0.3 + 0.15 * look);
      rot('armUpperR', -2.05 + 0.12 * dab + 0.25 * look, 0, -0.15);
      rot('armLowerR', -0.35 - 0.2 * Math.max(0, dab));
      rot('armUpperL', -0.55, 0, 0.25);
      rot('armLowerL', -1.1);
      rot('legUpperL', -0.12);
      rot('legUpperR', 0.08);
      break;
    }
    case 'ill': {
      // Sitting on the ground, knees up, hunched over with the arms round them, rocking slowly.
      const s = Math.sin((t / 3.2) * TAU);
      lift(-0.62 * hipRest);
      rot('legUpperL', -1.45, 0, 0.12);
      rot('legUpperR', -1.45, 0, -0.12);
      rot('legLowerL', 1.55);
      rot('legLowerR', 1.55);
      rot('torso', 0.5 + 0.08 * s, 0, 0.04 * s);
      rot('head', 0.35);
      rot('armUpperL', -0.75, 0, 0.35);
      rot('armUpperR', -0.75, 0, -0.35);
      rot('armLowerL', -1.2);
      rot('armLowerR', -1.2);
      break;
    }
    case 'sit': {
      // Sitting on the ground by the fire, legs crossed in front, leaning back a little on
      // one hand, now and then turning the head to look about.
      const look = Math.sin((t / 6.4) * TAU);
      lift(-0.62 * hipRest);
      rot('legUpperL', -1.4, 0, 0.45);
      rot('legUpperR', -1.4, 0, -0.45);
      rot('legLowerL', 1.9, 0, 0);
      rot('legLowerR', 1.9, 0, 0);
      rot('torso', -0.08);
      rot('head', 0.05, 0.35 * look);
      rot('armUpperL', 0.5, 0, 0.35);
      rot('armLowerL', -0.15);
      rot('armUpperR', -0.6, 0, -0.2);
      rot('armLowerR', -0.9);
      break;
    }
    case 'lie': {
      // Lying still on the back on the ground, the head turned a little aside.
      rot('hips', -Math.PI / 2);
      lift(-0.86 * hipRest);
      rot('head', 0, 0.3);
      rot('armUpperL', 0, 0, 0.12);
      rot('armUpperR', 0, 0, -0.12);
      break;
    }
    case 'point': {
      const b = Math.sin((t / 1.6) * TAU);
      rot('armUpperL', -1.5 + 0.06 * b, 0, 0.1);
      rot('armLowerL', -0.05);
      rot('armUpperR', -0.1, 0, -0.1);
      rot('armLowerR', -0.4);
      rot('head', 0, 0.15);
      rot('torso', 0, 0.2);
      break;
    }
    case 'throw': {
      // Wind back, snap forward, the spear leaves at THROW_RELEASE, follow
      // through, then stand watching it fly until the gesture ends at 3 s.
      const wind = smooth(t / 0.4);
      const snap = smooth((t - 0.42) / 0.18);
      const settle = smooth((t - 1.0) / 0.7);
      const arm = mix(mix(-0.3, -3.4, wind), -1.0, snap);
      const upper = mix(arm, -0.1, settle);
      const lower = mix(mix(-0.2, -1.2, wind), -0.1, snap);
      rot('armUpperR', upper, 0, -0.2);
      rot('armLowerR', lower);
      // Turn the spear in the hand so it points forward and a little up, ready to fly.
      rot('tool', mix(0, 1.27 - upper - lower, wind));
      rot('armUpperL', mix(mix(-0.2, -1.3, wind), -0.4, snap), 0, 0.25);
      const twist = mix(mix(0, 0.5, wind), -0.35, snap);
      rot('torso', mix(mix(0, -0.15, wind), 0.3, snap) * (1 - settle), twist * (1 - settle));
      const step = mix(wind, 1, snap) * (1 - settle);
      rot('legUpperL', -0.45 * step);
      rot('legUpperR', 0.35 * step);
      rot('legLowerR', 0.3 * step);
      rot('head', -0.1 * settle);
      break;
    }
    case 'shoot': {
      // Side on: the bow arm comes up and straight, the other hand draws the string to the
      // cheek, the arrow leaves at SHOOT_RELEASE, the bow arm stays up while it flies.
      const raise = smooth(t / 0.4);
      const draw = smooth((t - 0.35) / (SHOOT_RELEASE - 0.35));
      const loose = smooth((t - SHOOT_RELEASE) / 0.15);
      const settle = smooth((t - 1.9) / 0.5);
      const hold = raise * (1 - settle);
      rot('armUpperL', -1.5 * hold, 0, 0.1 * hold);
      rot('armLowerL', -0.05 * hold);
      rot('armUpperR', -1.45 * hold, 0, -0.3 * hold);
      rot('armLowerR', -(0.15 + 2.1 * draw * (1 - loose) + 0.5 * loose * (1 - settle)) * hold);
      rot('torso', 0, mix(0, 0.45, raise) * (1 - settle));
      rot('head', 0, mix(0, -0.45, raise) * (1 - settle));
      rot('legUpperL', -0.2 * hold);
      rot('legUpperR', 0.2 * hold);
      break;
    }
    case 'cheer': {
      const s = Math.sin((t / 0.7) * TAU);
      rot('armUpperL', -2.8 + 0.25 * s, 0, 0.35);
      rot('armUpperR', -2.8 - 0.25 * s, 0, -0.35);
      rot('armLowerL', -0.3);
      rot('armLowerR', -0.3);
      rot('head', -0.2);
      lift(Math.max(0, s) * 0.12);
      break;
    }
    case 'fall':
      break;
  }
}

/** Seconds over which a figure eases from one clip into the next. */
export const BLEND_SECONDS = 0.35;

/**
 * Poses a person part way from one clip into the next, so a change of clip
 * never snaps: every joint angle eases from the one clip to the other.
 * `weight` is 0 at the start of the change and 1 at its end.
 */
export function blendPerson(
  m: Model,
  from: Clip,
  fromSeconds: number,
  to: Clip,
  toSeconds: number,
  weight: number,
): void {
  const w = smooth(weight);
  animatePerson(m, from, fromSeconds);
  const start = new Map<string, [THREE.Vector3, THREE.Vector3, boolean]>();
  for (const [name, b] of m.bones)
    start.set(name, [
      new THREE.Vector3(b.rotation.x, b.rotation.y, b.rotation.z),
      b.position.clone(),
      b.visible,
    ]);
  animatePerson(m, to, toSeconds);
  for (const [name, b] of m.bones) {
    const [r0, p0, visible] = start.get(name)!;
    // The clips set joint angles, so the angles are blended (not the
    // orientations): a raised arm comes down the way it went up and never
    // flips round the other side.
    b.rotation.set(
      mix(r0.x, b.rotation.x, w),
      mix(r0.y, b.rotation.y, w),
      mix(r0.z, b.rotation.z, w),
    );
    b.position.lerpVectors(p0, b.position, w);
    // Held and carried things switch over half way.
    if (w < 0.5) b.visible = visible;
  }
}

/** The highest vertex of a model in its own space, as posed. */
function highestPoint(m: Model): number {
  return extremePoint(m, -1);
}

/** The lowest vertex of a model in its own space, as posed. */
function lowestPoint(m: Model): number {
  return extremePoint(m, 1);
}

/** The lowest (sign 1) or highest (sign -1) vertex height of a model in its own space, as posed. */
function extremePoint(m: Model, sign: 1 | -1): number {
  m.object.updateMatrixWorld(true);
  const toModel = m.object.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let best = Infinity;
  m.object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    // Ink hulls share their parent's geometry, so only the coloured meshes are read.
    if (!mesh.isMesh || (mesh.parent as THREE.Mesh).isMesh) return;
    matrix.multiplyMatrices(toModel, mesh.matrixWorld);
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++)
      best = Math.min(best, sign * v.fromBufferAttribute(pos, i).applyMatrix4(matrix).y);
  });
  return sign * best;
}

/** How an animal's clip repeats, for baking it (as PERSON_LOOPS for people). */
export function animalLoop(m: Model, clip: Clip): { loop: number } | { once: number } {
  const stride = Math.sqrt((m.bones.get('body')!.userData.rest as THREE.Vector3).y);
  const biped = m.bones.has('legL');
  switch (clip) {
    case 'swim':
      return { loop: SWIM_SECONDS };
    case 'fly':
      return { loop: FLAP_SECONDS };
    case 'walk':
      return { loop: walkPeriod(m) };
    case 'run':
      return { loop: biped ? walkPeriod(m) * 0.6 : 0.55 * stride };
    case 'struggle':
      return { loop: 1.4 * stride };
    case 'bound':
      return { once: BIND_SECONDS };
    case 'hung':
      return { loop: GAITS.pole.period };
    case 'fall':
      return { once: 3 };
    default:
      return { loop: 6 * stride };
  }
}

/** Poses an animal built by buildAnimal. Times scale with its size, so a mammoth strides slower than a wolf. */
export function animateAnimal(m: Model, clip: Clip, seconds: number): void {
  reset(m);
  const body = m.bones.get('body')!;
  const rest = body.userData.rest as THREE.Vector3;
  const stride = Math.sqrt(rest.y);
  const rot = (name: string, x = 0, y = 0, z = 0) => m.bones.get(name)?.rotation.set(x, y, z);
  const gait = (period: number, swing: number, trot: boolean) => {
    const p = (seconds / period) * TAU;
    // A walk sets the feet down one after another, hind left, fore left, hind
    // right, fore right; a trot moves diagonal pairs together. Each foot pushes
    // back slowly on the ground, then swings forward lifted, its knee or hock
    // bent (Yang, 2026-10-18: legs need a joint).
    const stance = trot ? 0.5 : 0.7;
    for (const [leg, offset] of [
      ['BL', 0],
      ['FL', trot ? 0.5 : 0.25],
      ['BR', 0.5],
      ['FR', trot ? 0 : 0.75],
    ] as const) {
      const ph = seconds / period + offset - Math.floor(seconds / period + offset);
      const lifted = ph >= stance;
      const s = lifted ? (ph - stance) / (1 - stance) : ph / stance;
      rot(`leg${leg}`, swing * (lifted ? 1 - 2 * smooth(s) : -1 + 2 * s));
      const low = m.bones.get(`low${leg}`);
      if (low)
        low.rotation.x = lifted ? ((low.userData.flex as number) ?? 0) * Math.sin(Math.PI * s) : 0;
    }
    rot('head', 0.05 * Math.sin(p * 2));
    rot('tail', 0, 0.25 * Math.sin(p));
    body.position.y = rest.y + Math.abs(Math.cos(p)) * swing * 0.05 * rest.y;
  };
  // Two-legged walkers (wildlife.md section 6): penguins and dodos waddle,
  // kangaroos hop, wingless birds such as moas stride.
  const biped = m.bones.has('legL');
  const winged = m.bones.has('wingL');
  if (clip === 'swim') {
    // Sea animals: the tail beats up and down, the body rocks against it, fins steer.
    const p = (seconds / SWIM_SECONDS) * TAU;
    rot('tail', 0.35 * Math.sin(p));
    body.rotation.x = -0.06 * Math.sin(p - 0.8);
    if (m.bones.has('finL')) {
      rot('finL', 0, 0, 0.15 * Math.sin(p + 0.5));
      rot('finR', 0, 0, -0.15 * Math.sin(p + 0.5));
    }
    return;
  }
  if (clip === 'fly') {
    // Wings flap well up and down, the body rises on each down-stroke and the tail steers.
    const p = (seconds / FLAP_SECONDS) * TAU;
    rot('wingL', 0, 0, 0.25 + 0.85 * Math.sin(p));
    rot('wingR', 0, 0, -0.25 - 0.85 * Math.sin(p));
    rot('tail', 0.1 * Math.sin(p + 1));
    rot('head', -0.05 * Math.sin(p));
    body.position.y = rest.y - 0.08 * rest.y * Math.sin(p);
    return;
  }
  if (biped && (clip === 'walk' || clip === 'run')) {
    const fast = clip === 'run' ? 0.6 : 1;
    if (winged) {
      // Waddle: short steps, the body rocking from foot to foot, flippers out.
      const p = (seconds / (walkPeriod(m) * fast)) * TAU;
      body.rotation.z = 0.14 * Math.sin(p);
      rot('legL', 0.35 * Math.sin(p));
      rot('legR', -0.35 * Math.sin(p));
      rot('wingL', 0, 0, 0.35 + 0.1 * Math.sin(p * 2));
      rot('wingR', 0, 0, -0.35 - 0.1 * Math.sin(p * 2));
      body.position.y = rest.y + 0.04 * rest.y * Math.abs(Math.sin(p));
    } else if (!m.bones.has('tail')) {
      // Stride: long steps from leg to leg, the body bobbing and the neck nodding.
      const p = (seconds / (walkPeriod(m) * fast)) * TAU;
      rot('legL', 0.45 * Math.sin(p));
      rot('legR', -0.45 * Math.sin(p));
      rot('head', 0.08 * Math.sin(p * 2));
      body.position.y = rest.y + 0.03 * rest.y * Math.abs(Math.sin(p));
    } else {
      // Hop: both legs push off together, the tail swings up as the body flies.
      const p = (seconds / (walkPeriod(m) * fast)) * TAU;
      const air = Math.max(0, Math.sin(p));
      body.position.y = rest.y * (1 + 0.45 * air);
      body.rotation.x = 0.2 * air;
      rot('legL', 0.6 * air);
      rot('legR', 0.6 * air);
      rot('tail', -0.4 * air);
      rot('head', -0.15 * air);
    }
    return;
  }
  switch (clip) {
    case 'walk':
      gait(walkPeriod(m), 0.3, false);
      break;
    case 'run':
      gait(0.55 * stride, 0.55, true);
      rot('head', -0.1);
      break;
    case 'struggle': {
      // Hit and struggling: rears up, tosses its head and stamps, again and again.
      const p = seconds / (1.4 * stride);
      const rear = Math.max(0, Math.sin(p * TAU));
      const stamp = Math.sin(p * TAU * 3) * (1 - rear);
      body.rotation.x = -0.38 * rear;
      body.position.y = rest.y * (1 + 0.18 * rear);
      rot('legFL', -0.9 * rear + 0.25 * stamp);
      rot('legFR', -0.7 * rear - 0.25 * stamp);
      rot('legBL', 0.35 * rear);
      rot('legBR', 0.35 * rear);
      rot('head', -0.45 * rear + 0.15 * Math.sin(p * TAU * 2), 0.3 * Math.sin(p * TAU));
      rot('tail', 0, 0.6 * Math.sin(p * TAU * 4));
      break;
    }
    case 'bound': {
      // Lying on its side as it fell, its legs drawn together over BIND_SECONDS
      // and lashed, fore legs back and hind legs forward (humankind.md section 8.1).
      const f = smooth(seconds / BIND_SECONDS);
      body.rotation.z = (Math.PI / 2) * 0.92;
      for (const [leg, way] of [
        ['FL', 1],
        ['FR', 1],
        ['BL', -1],
        ['BR', -1],
      ] as const) {
        rot(`leg${leg}`, way * 0.75 * f, 0, 0.3 * (1 - f));
        const low = m.bones.get(`low${leg}`);
        if (low) low.rotation.x = ((low.userData.flex as number) ?? 0) * 0.8 * f;
      }
      rot('head', 0.2 * f);
      body.position.y = rest.y;
      body.position.y += -lowestPoint(m) - 0.12 * rest.y;
      break;
    }
    case 'hung': {
      // Upside down under the carrying pole, the bound legs up to it and the head
      // hanging, swaying a little with the carriers' steps.
      const sway = Math.sin((seconds / GAITS.pole.period) * TAU);
      body.rotation.set(0.04 * sway, 0, Math.PI + 0.06 * sway);
      for (const [leg, way] of [
        ['FL', 1],
        ['FR', 1],
        ['BL', -1],
        ['BR', -1],
      ] as const) {
        rot(`leg${leg}`, way * 0.75);
        const low = m.bones.get(`low${leg}`);
        if (low) low.rotation.x = ((low.userData.flex as number) ?? 0) * 0.8;
      }
      rot('head', -0.7);
      rot('tail', 0.4);
      // The bound feet at the pole.
      body.position.y = rest.y;
      body.position.y += POLE_HEIGHT - highestPoint(m);
      break;
    }
    case 'fall': {
      // Rolls onto its side while sinking over 3 s; nothing more is shown.
      const f = smooth(seconds / 3);
      const angle = f * (Math.PI / 2) * 0.92;
      body.rotation.z = angle;
      for (const name of ['legFL', 'legFR', 'legBL', 'legBR']) rot(name, 0, 0, 0.3 * f);
      // Keep its lowest point on the ground as it rolls, then sink a little.
      body.position.y = rest.y;
      body.position.y += -lowestPoint(m) - f * 0.12 * rest.y;
      break;
    }
    default: {
      // The cycles fit animalLoop's 6 strides a whole number of times, for baking.
      const b = Math.sin((seconds / (3 * stride)) * TAU);
      rot('head', 0.06 * b, 0.12 * Math.sin((seconds / (6 * stride)) * TAU));
      rot('tail', 0, 0.2 * Math.sin((seconds / (1.5 * stride)) * TAU));
      body.position.y = rest.y + 0.005 * rest.y * b;
    }
  }
}
