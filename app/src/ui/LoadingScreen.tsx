// The loading screen (spec milestone 1, section 8.6): the "march of progress" from a
// knuckle-walking ape to a child looking at a globe, walking along the progress bar. Each
// figure steps in once the bar passes its place in the line. The figures are rounded
// strokes drawn here, with no text; the caption comes from the message files.

import { useEffect, useState } from 'preact/hooks';

/** One walker of the march, facing right; lengths in viewBox units. */
export interface Walker {
  /** Hip height over the ground with the legs straight. */
  leg: number;
  /** Hip to shoulder. */
  torso: number;
  /** Forward lean of the torso from upright, in radians. */
  lean: number;
  /** Shoulder to hand. */
  arm: number;
  head: number;
  /** Stroke width of the limbs; the torso is drawn nearly twice as thick. */
  limb: number;
  /** How far the knees bend forward, as a share of the leg. */
  knee: number;
  /** Holds a spear, or a small globe in both hands. */
  holds?: 'spear' | 'globe';
}

/** Ape, australopithecine, Homo habilis, Homo erectus, Neanderthal, modern child. */
export const MARCH: Walker[] = [
  { leg: 26, torso: 34, lean: 1.1, arm: 42, head: 8, limb: 7, knee: 0.22 },
  { leg: 34, torso: 30, lean: 0.5, arm: 34, head: 7.5, limb: 6, knee: 0.14 },
  { leg: 40, torso: 30, lean: 0.32, arm: 32, head: 7.5, limb: 6, knee: 0.1 },
  { leg: 50, torso: 34, lean: 0.12, arm: 34, head: 8, limb: 6, knee: 0.05 },
  { leg: 46, torso: 34, lean: 0.08, arm: 32, head: 8.5, limb: 7.5, knee: 0.05, holds: 'spear' },
  { leg: 36, torso: 26, lean: 0.04, arm: 24, head: 9, limb: 5.5, knee: 0.03, holds: 'globe' },
];

const WIDTH = 600;
const GROUND = 112;
const HEIGHT = 124;
/** Where each walker's hips are along the line. */
export const PLACES = MARCH.map((_, k) => 50 + k * 100);
/** A stride, in seconds, and the swing of the legs and arms, in degrees. */
const STRIDE_S = 0.9;
const LEG_SWING = 18;
const ARM_SWING = 16;

/** Whether the march walker `k` has stepped in at a share loaded of `loaded`. */
export function stepsIn(k: number, loaded: number): boolean {
  return loaded * WIDTH >= PLACES[k]! - 30;
}

function Swing(props: { cx: number; cy: number; deg: number; phase: number; still: boolean }) {
  if (props.still) return null;
  const { cx, cy, deg } = props;
  return (
    <animateTransform
      attributeName="transform"
      type="rotate"
      values={`${deg} ${cx} ${cy};${-deg} ${cx} ${cy};${deg} ${cx} ${cy}`}
      dur={`${STRIDE_S}s`}
      begin={`${-props.phase * STRIDE_S}s`}
      repeatCount="indefinite"
    />
  );
}

function Figure(props: { w: Walker; x: number; shown: boolean; still: boolean }) {
  const { w, x, still } = props;
  const hipY = GROUND - w.leg * 0.97;
  const sx = x + w.torso * Math.sin(w.lean);
  const sy = hipY - w.torso * Math.cos(w.lean);
  // The head sits ahead of the shoulders as much as the body leans.
  const tilt = Math.min(1.3, w.lean + 0.15);
  const hx = sx + (w.head + 2) * Math.sin(tilt);
  const hy = sy - (w.head + 2) * Math.cos(tilt) - (w.holds === 'globe' ? 0 : 1);
  const leg = (phase: number, back: boolean) => (
    <g opacity={back ? 0.75 : 1}>
      <polyline
        points={`${x},${hipY} ${x + w.leg * w.knee},${hipY + w.leg * 0.5} ${x},${GROUND - 2} ${x + w.limb},${GROUND - 2}`}
      />
      <Swing cx={x} cy={hipY} deg={LEG_SWING} phase={phase} still={still} />
    </g>
  );
  // An arm hangs down and a little forward, the hand on the ground for the ape.
  const arm = (phase: number, back: boolean) => (
    <g opacity={back ? 0.75 : 1}>
      <polyline
        points={`${sx},${sy} ${sx + w.arm * 0.12},${sy + w.arm * 0.5} ${sx + w.arm * 0.2},${sy + w.arm}`}
      />
      <Swing cx={sx} cy={sy} deg={ARM_SWING} phase={phase} still={still} />
    </g>
  );
  const holding = w.holds === 'globe';
  return (
    <g
      class={`march-walker${props.shown ? ' shown' : ''}`}
      stroke="currentColor"
      stroke-width={w.limb}
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    >
      {leg(0.5, true)}
      {!holding && arm(0, true)}
      {leg(0, false)}
      <line x1={x} y1={hipY} x2={sx} y2={sy} stroke-width={w.limb * 1.9} />
      <circle cx={hx} cy={hy} r={w.head} fill="currentColor" stroke="none" />
      {w.holds === 'spear' && (
        <g stroke-width={2.5}>
          <line x1={sx + 10} y1={GROUND - 6} x2={sx + 16} y2={sy - 30} />
        </g>
      )}
      {holding ? (
        <>
          {/* Both forearms forward, holding the globe the child looks at. */}
          <polyline
            points={`${sx},${sy} ${sx + 3},${sy + w.arm * 0.55} ${sx + 12},${sy + w.arm * 0.5}`}
          />
          <g class="march-globe" stroke-width={1.2}>
            <circle cx={sx + 17} cy={sy + w.arm * 0.32} r={7} />
            <ellipse cx={sx + 17} cy={sy + w.arm * 0.32} rx={3} ry={7} />
            <line x1={sx + 10} y1={sy + w.arm * 0.32} x2={sx + 24} y2={sy + w.arm * 0.32} />
          </g>
        </>
      ) : (
        arm(0.5, false)
      )}
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
          <rect class="march-track" x={0} y={GROUND} width={WIDTH} height={8} rx={4} />
          <rect class="march-bar" x={0} y={GROUND} width={WIDTH * share} height={8} rx={4} />
        </svg>
      </div>
    </div>
  );
}
