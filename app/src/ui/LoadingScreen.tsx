// The loading screen (spec milestone 1, section 8.6): the "march of progress" from a
// knuckle-walking ape to a child looking at a globe, walking along the progress bar. Each
// figure steps in once the bar passes its place in the line. The figures are filled
// silhouettes built here from body parts (tapered limbs jointed at hip, knee, shoulder and
// elbow, a torso outline and a head profile per species), with no text; the caption comes
// from the message files.

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

type P = [number, number];

/** One walker of the march, facing right; lengths in viewBox units, angles in degrees. */
export interface Walker {
  thigh: number;
  calf: number;
  upper: number;
  fore: number;
  /** Hip joint to shoulder joint. */
  torso: number;
  /** Forward lean of the torso from upright. */
  lean: number;
  /** The torso's outline: how far it reaches in front of its axis (groin, belly, chest) and behind it (buttocks, waist, upper back). */
  front: [number, number, number];
  back: [number, number, number];
  /** Limb thickness: radii at hip, knee, ankle, shoulder, elbow and wrist. */
  limbs: [number, number, number, number, number, number];
  head: number;
  /** 0 an ape's face with its muzzle, 1 a modern human's, with forehead, nose and chin. */
  face: number;
  /** A brow ridge, and a skull drawn out long and low behind. */
  brow: number;
  long: number;
  neck: number;
  /** The head's tilt down from looking straight ahead. */
  pitch: number;
  /** The legs' and arms' resting angles (hip, knee; shoulder, elbow), positive turning back, and their swings. */
  leg: [number, number];
  arm: [number, number];
  stride: number;
  swing: number;
  /** An ape walks on its knuckles: its arms reach the ground. */
  knuckles?: boolean;
  holds?: 'spear' | 'globe';
}

/** Ape, australopithecine, Homo habilis, Homo erectus, Neanderthal, modern child. */
export const MARCH: Walker[] = [
  {
    thigh: 15,
    calf: 14,
    upper: 21,
    fore: 20,
    torso: 36,
    lean: 62,
    front: [5, 10, 8.5],
    back: [6, 8, 10.5],
    limbs: [5.5, 3.6, 2.4, 5, 3.4, 2.6],
    head: 8,
    face: 0,
    brow: 0.6,
    long: 0,
    neck: 3,
    pitch: -8,
    leg: [-14, 34],
    arm: [-6, 0],
    stride: 16,
    swing: 14,
    knuckles: true,
  },
  {
    thigh: 15,
    calf: 14.5,
    upper: 16,
    fore: 15.5,
    torso: 29,
    lean: 22,
    front: [4.5, 8.5, 7],
    back: [6, 5, 7],
    limbs: [4.8, 3, 2, 3.8, 2.8, 2],
    head: 7.6,
    face: 0.3,
    brow: 0.5,
    long: 0,
    neck: 3,
    pitch: 0,
    leg: [-6, 14],
    arm: [-6, -10],
    stride: 18,
    swing: 14,
  },
  {
    thigh: 17,
    calf: 16.5,
    upper: 15,
    fore: 14.5,
    torso: 29,
    lean: 12,
    front: [4.5, 7.5, 7],
    back: [6, 4.5, 6.5],
    limbs: [4.8, 3, 2, 3.6, 2.7, 1.9],
    head: 7.8,
    face: 0.5,
    brow: 0.45,
    long: 0.05,
    neck: 3.5,
    pitch: 0,
    leg: [-4, 9],
    arm: [-4, -10],
    stride: 20,
    swing: 16,
  },
  {
    thigh: 23,
    calf: 22,
    upper: 16,
    fore: 15,
    torso: 33,
    lean: 4,
    front: [4.5, 6, 7],
    back: [6.5, 4, 6.5],
    limbs: [5, 3.1, 2.1, 3.7, 2.7, 1.9],
    head: 8.2,
    face: 0.72,
    brow: 0.7,
    long: 0.25,
    neck: 4.5,
    pitch: 0,
    leg: [-2, 5],
    arm: [-3, -10],
    stride: 22,
    swing: 18,
  },
  {
    thigh: 20,
    calf: 18,
    upper: 15,
    fore: 13,
    torso: 33,
    lean: 4,
    front: [5, 7.5, 8.5],
    back: [7.5, 5.5, 8],
    limbs: [6, 3.8, 2.6, 4.6, 3.4, 2.4],
    head: 9.2,
    face: 0.8,
    brow: 0.8,
    long: 0.3,
    neck: 3.5,
    pitch: 0,
    leg: [-2, 5],
    arm: [-22, -40],
    stride: 20,
    swing: 0,
    holds: 'spear',
  },
  {
    thigh: 16,
    calf: 15.5,
    upper: 11.5,
    fore: 10.5,
    torso: 23,
    lean: 2,
    front: [3.8, 5, 5.2],
    back: [5, 3.4, 4.8],
    limbs: [4, 2.6, 1.7, 2.9, 2.2, 1.6],
    head: 8.6,
    face: 1,
    brow: 0,
    long: 0,
    neck: 3,
    pitch: 18,
    leg: [-2, 5],
    arm: [-12, -78],
    stride: 16,
    swing: 0,
    holds: 'globe',
  },
];

const WIDTH = 610;
const GROUND = 120;
const HEIGHT = 130;
const FOOT_R = 2.2;
/** Where each walker's hips are along the line. */
export const PLACES = [48, 165, 262, 360, 462, 560];
/** A stride, in seconds. */
const STRIDE_S = 1.1;

/** Whether the march walker `k` has stepped in at a share loaded of `loaded`. */
export function stepsIn(k: number, loaded: number): boolean {
  return loaded * WIDTH >= PLACES[k]! - 30;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
/** A limb of length `len` hanging straight down, turned by `deg` (positive swings it back). */
const down = (len: number, deg: number): P => [-len * Math.sin(rad(deg)), len * Math.cos(rad(deg))];
const f1 = (v: number) => v.toFixed(1);

/** A tapered capsule from `a` (radius ra) to `b` (radius rb). */
function capsule(a: P, ra: number, b: P, rb: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const n: P = [-dy / len, dx / len];
  const p = (c: P, r: number, s: number) => `${f1(c[0] + n[0] * r * s)},${f1(c[1] + n[1] * r * s)}`;
  return (
    `M${p(a, ra, 1)}L${p(b, rb, 1)}A${f1(rb)},${f1(rb)} 0 0 0 ${p(b, rb, -1)}` +
    `L${p(a, ra, -1)}A${f1(ra)},${f1(ra)} 0 0 0 ${p(a, ra, 1)}Z`
  );
}

/** A smooth closed outline through the points (Catmull-Rom as cubic Béziers). */
function smooth(pts: P[]): string {
  const n = pts.length;
  let d = `M${f1(pts[0]![0])},${f1(pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d + 'Z';
}

/** Head profiles, x forward and y up in head radii, from the back of the skull round the face. */
const APE_HEAD: P[] = [
  [-0.95, 0],
  [-0.85, 0.45],
  [-0.45, 0.8],
  [0.1, 0.84],
  [0.55, 0.64],
  [0.86, 0.46],
  [0.9, 0.24],
  [1.3, 0.02],
  [1.46, -0.3],
  [1.35, -0.56],
  [1.05, -0.74],
  [0.6, -0.8],
  [0.1, -0.66],
  [-0.6, -0.42],
];
const HUMAN_HEAD: P[] = [
  [-0.95, 0.05],
  [-0.86, 0.56],
  [-0.45, 0.96],
  [0.15, 1.03],
  [0.64, 0.8],
  [0.86, 0.38],
  [0.9, 0.1],
  [1.08, -0.18],
  [0.9, -0.33],
  [0.94, -0.5],
  [0.8, -0.73],
  [0.46, -0.82],
  [0.05, -0.62],
  [-0.6, -0.46],
];
/** The point of the profiles the brow ridge pushes out. */
const BROW = 5;

function headPath(w: Walker, centre: P): string {
  const turn = rad(w.pitch);
  const pts = APE_HEAD.map(([ax, ay], i): P => {
    let x = ax + (HUMAN_HEAD[i]![0] - ax) * w.face;
    let y = ay + (HUMAN_HEAD[i]![1] - ay) * w.face;
    if (i === BROW) {
      x += 0.16 * w.brow;
      y += 0.04 * w.brow;
    }
    if (x < 0) {
      x *= 1 + w.long;
      y *= 1 - 0.25 * w.long;
    }
    // Pitched down by `turn`, then into screen space (y down).
    const px = x * Math.cos(turn) + y * Math.sin(turn);
    const py = -x * Math.sin(turn) + y * Math.cos(turn);
    return [centre[0] + px * w.head, centre[1] - py * w.head];
  });
  return smooth(pts);
}

/** A rotation about a point, animated through `values` (degrees) over the stride. */
function Joint(props: {
  at: P;
  values: number[];
  times: number[];
  phase: number;
  still: boolean;
  children: ComponentChildren;
}) {
  const { at, values, times, still } = props;
  const rot = (deg: number) => `${f1(deg)} ${f1(at[0])} ${f1(at[1])}`;
  return (
    <g transform={`rotate(${rot(values[0]!)})`}>
      {!still && values.some((v) => v !== values[0]) && (
        <animateTransform
          attributeName="transform"
          type="rotate"
          values={values.map(rot).join(';')}
          keyTimes={times.join(';')}
          calcMode="spline"
          keySplines={times
            .slice(1)
            .map(() => '0.45 0 0.55 1')
            .join(';')}
          dur={`${STRIDE_S}s`}
          begin={`${f1(-props.phase * STRIDE_S)}s`}
          repeatCount="indefinite"
        />
      )}
      {props.children}
    </g>
  );
}

function Figure(props: { w: Walker; x: number; shown: boolean; still: boolean }) {
  const { w, x, still } = props;
  const [rh, rk, ra, rs, re, rw] = w.limbs;
  // The hips stand as high as the legs reach in their resting pose.
  const [l1, l2] = w.leg;
  const ankle0 = add(down(w.thigh, l1), down(w.calf, l1 + l2));
  const hip: P = [x, GROUND - ankle0[1] - FOOT_R * 1.6];
  const up: P = [Math.sin(rad(w.lean)), -Math.cos(rad(w.lean))];
  const fwd: P = [-up[1], up[0]];
  const local = (t: number, s: number): P => [
    hip[0] + up[0] * t * w.torso + fwd[0] * s,
    hip[1] + up[1] * t * w.torso + fwd[1] * s,
  ];
  const shoulder = local(0.9, -1);
  // An ape's arms are as long as its shoulders are high.
  let { upper, fore } = w;
  if (w.knuckles) {
    const reach = (GROUND - rw - shoulder[1]) / Math.cos(rad(w.arm[0]));
    upper *= reach / (w.upper + w.fore);
    fore *= reach / (w.upper + w.fore);
  }
  const [g, b, c] = w.front;
  const [bt, wa, ub] = w.back;
  const torso = smooth([
    local(-0.08, 0),
    local(0.08, g),
    local(0.4, b),
    local(0.75, c),
    local(0.98, c * 0.6),
    local(1.06, -1),
    local(0.94, -ub * 0.75),
    local(0.7, -ub),
    local(0.4, -wa),
    local(0.1, -bt),
  ]);
  // The neck rises from the shoulders towards the head, which an ape carries ahead of them.
  const neckBase = local(0.96, 0.5);
  const tilt = rad(w.lean * 0.95);
  const headAt: P = [
    neckBase[0] + Math.sin(tilt) * (w.neck + w.head * 0.75),
    neckBase[1] - Math.cos(tilt) * (w.neck + w.head * 0.75),
  ];

  const leg = (phase: number, far: boolean) => {
    const knee = add(hip, [0, w.thigh]);
    const calf = add(knee, [0, w.calf * 0.35]);
    const ankle = add(knee, [0, w.calf]);
    const heel = add(ankle, [-ra * 0.8, FOOT_R * 0.6]);
    const toe = add(ankle, [w.thigh * 0.38, FOOT_R * 0.9]);
    return (
      <Joint
        at={hip}
        values={[l1 + w.stride, l1 - w.stride, l1 + w.stride]}
        times={[0, 0.4, 1]}
        phase={phase}
        still={still}
      >
        <g class={far ? 'far' : undefined}>
          <path d={capsule(hip, rh, knee, rk)} />
          <Joint
            at={knee}
            values={[l2 + 4, l2 + 42, l2, l2 + 4]}
            times={[0, 0.2, 0.4, 1]}
            phase={phase}
            still={still}
          >
            <path d={capsule(knee, rk, calf, rk * 1.15)} />
            <path d={capsule(calf, rk * 1.15, ankle, ra)} />
            <path d={capsule(heel, FOOT_R, toe, FOOT_R * 0.7)} />
          </Joint>
        </g>
      </Joint>
    );
  };

  const [a1, a2] = w.arm;
  const elbow = add(shoulder, [0, upper]);
  const wrist = add(elbow, [0, fore]);
  const arm = (phase: number, far: boolean) => {
    const hand = w.knuckles
      ? capsule(wrist, rw, add(wrist, [rw * 2.4, 0]), rw * 0.9)
      : capsule(wrist, rw, add(wrist, [0, rw * 2.6]), rw * 0.95);
    return (
      <Joint
        at={shoulder}
        values={[a1 - w.swing, a1 + w.swing, a1 - w.swing]}
        times={[0, 0.4, 1]}
        phase={phase}
        still={still}
      >
        <g class={far ? 'far' : undefined}>
          <path d={capsule(shoulder, rs, elbow, re)} />
          <Joint
            at={elbow}
            values={w.knuckles || !w.swing ? [a2, a2] : [a2, a2 - 12, a2]}
            times={[0, 0.4, 1]}
            phase={phase}
            still={still}
          >
            <path d={capsule(elbow, re, wrist, rw)} />
            <path d={hand} />
          </Joint>
        </g>
      </Joint>
    );
  };
  // Where a still hand is, for the spear and the globe.
  const handAt = add(add(shoulder, down(upper, a1)), down(fore + rw * 1.5, a1 + a2));

  return (
    <g class={`march-walker${props.shown ? ' shown' : ''}`}>
      {arm(0.5, true)}
      {leg(0.5, true)}
      <path d={torso} />
      <path d={capsule(neckBase, w.head * 0.42, headAt, w.head * 0.45)} />
      <path d={headPath(w, headAt)} />
      {leg(0, false)}
      {w.holds === 'globe' && (
        <g class="march-globe">
          <circle cx={handAt[0] + 3} cy={handAt[1] - 4} r={6.5} />
          <path
            class="march-globe-land"
            d={`M${f1(handAt[0] - 1)},${f1(handAt[1] - 8)}q3,-2 6,0q2,3 -1,5q-3,1 -5,-1zM${f1(handAt[0] + 4)},${f1(handAt[1] - 1)}q3,-1 5,1q-1,3 -4,2z`}
          />
        </g>
      )}
      {w.holds === 'spear' && (
        <path
          class="march-spear"
          d={capsule([handAt[0] + 2, GROUND - 1], 1.1, [handAt[0] + 7, handAt[1] - 70], 0.9)}
        />
      )}
      {arm(0, false)}
    </g>
  );
}

export function LoadingScreen(props: { loaded: number; ready: boolean; label: string }) {
  const { loaded, ready, label } = props;
  // Stays up for its fade once the first view is ready.
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setGone(true), 500);
    return () => clearTimeout(timer);
  }, [ready]);
  const [still] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (gone) return null;
  const share = ready ? 1 : loaded;
  const percent = Math.round(share * 100);
  return (
    <div class={`overlay loading${ready ? ' done' : ''}`}>
      <div
        class="loading-inner"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <p class="loading-caption" aria-hidden="true">
          {label} {percent}%
        </p>
        <svg
          class="march"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          aria-hidden="true"
          preserveAspectRatio="xMidYMax meet"
        >
          {MARCH.map((w, k) => (
            <Figure key={k} w={w} x={PLACES[k]!} shown={stepsIn(k, share)} still={still} />
          ))}
          <rect class="march-track" x={0} y={GROUND} width={WIDTH} height={7} rx={3.5} />
          <rect class="march-bar" x={0} y={GROUND} width={WIDTH * share} height={7} rx={3.5} />
        </svg>
      </div>
    </div>
  );
}
