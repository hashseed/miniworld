// The loading screen (spec milestone 1, section 8.6): while the world loads, the globe itself
// spins small in the distance (app.ts moves the camera) with the share loaded below it. Once
// the first view is ready the caption fades and the camera flies in to the remembered view.
// The caption comes from the message files.

/** The phases of the loading screen. */
export type IntroPhase = 'loading' | 'flying' | 'done';

/** How long the caption takes to fade, in milliseconds. */
export const FADE_MS = 400;

export function LoadingScreen(props: {
  loaded: number;
  phase: IntroPhase;
  /** How far down the window the caption stands, under the small globe, in CSS pixels. */
  captionY: number;
  /** The small globe's radius on screen, and whether it is drawn yet. */
  radius: number;
  globeDrawn: boolean;
  label: string;
}) {
  const { loaded, phase, captionY, radius, globeDrawn, label } = props;
  if (phase === 'done') return null;
  const percent = Math.round((phase === 'loading' ? loaded : 1) * 100);
  return (
    <div class={`overlay loading ${phase}`}>
      {/* A still picture of the small globe, until the globe itself is drawn (section 8.6). */}
      <img
        class={globeDrawn ? 'loading-globe gone' : 'loading-globe'}
        src="loading-globe.jpg"
        alt=""
        style={{
          top: `${captionY - 20 - 2 * radius}px`,
          width: `${2 * radius}px`,
          height: `${2 * radius}px`,
        }}
      />
      <div
        class="loading-caption"
        style={{ top: `${captionY}px` }}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        {label} {percent}%
      </div>
    </div>
  );
}
