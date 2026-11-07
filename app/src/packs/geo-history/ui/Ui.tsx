// The geo-history interface (geo-history.md, sections 1 and 3): the age, the
// controls, the timeline with its lanes and moments, the card of a moment and
// the About panel. A plain function of its state; the app re-renders it.

import type { JSX } from 'preact';
import type { Language } from '../../../engine/i18n/messages.ts';
import type { GeoData, Moment } from '../data.ts';
import { START_AGE, SPEED_MODES, type SpeedMode } from '../world/age.ts';
import { formatAge, formatMa } from '../world/format.ts';
import { BOUNDARY_COLOURS } from '../render/scene.ts';
import { STRINGS } from '../strings.ts';

export interface View {
  /** Oldest and youngest age shown on the timeline, in Ma. */
  from: number;
  to: number;
}

export interface UiState {
  data: GeoData;
  language: Language;
  /** Age in years before today. */
  age: number;
  playing: boolean;
  speed: SpeedMode;
  view: View;
  overlays: { boundaries: boolean; coasts: boolean };
  moment: Moment | undefined;
  about: boolean;
  width: number;
}

export interface Actions {
  togglePlay(): void;
  setSpeed(mode: SpeedMode): void;
  /** Jumps to an age in Ma. */
  seekMa(ma: number): void;
  toStart(): void;
  toEnd(): void;
  setLanguage(l: Language): void;
  toggleOverlay(name: 'boundaries' | 'coasts'): void;
  zoom(factor: number, centreMa?: number): void;
  showAll(): void;
  selectMoment(m: Moment | undefined): void;
  setAbout(open: boolean): void;
}

const LANE_H = 22;
const TL_PAD = 14;

function xOf(ma: number, view: View, width: number): number {
  return TL_PAD + ((view.from - ma) / (view.from - view.to)) * (width - 2 * TL_PAD);
}

function maOf(x: number, view: View, width: number): number {
  const t = (x - TL_PAD) / (width - 2 * TL_PAD);
  return view.from - t * (view.from - view.to);
}

/** A "nice" ruler step in Ma that gives about `n` ticks over the range. */
function rulerStep(range: number, n: number): number {
  const raw = range / n;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

function Icon({ d }: { d: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const PLAY = 'M8 5v14l11-7z';
const PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';
const SKIP_BACK = 'M6 6h2v12H6zM9.5 12 18 18V6z';
const SKIP_FORWARD = 'M16 6h2v12h-2zM6 18l8.5-6L6 6z';
const PLUS = 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z';
const MINUS = 'M5 11h14v2H5z';
const CLOSE =
  'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z';

function pointerMa(e: PointerEvent, el: Element, view: View, width: number): number {
  const r = el.getBoundingClientRect();
  return Math.min(view.from, Math.max(view.to, maOf(e.clientX - r.left, view, width)));
}

function Timeline({ s, a }: { s: UiState; a: Actions }): JSX.Element {
  const t = STRINGS[s.language];
  const width = Math.max(280, s.width - 24);
  const { view } = s;
  const ageMa = s.age / 1_000_000;
  const lanes = 4;
  const height = LANE_H * lanes + 26;
  const x = (ma: number): number => xOf(ma, view, width);
  const clip = (from: number, to: number): [number, number] | undefined => {
    const lo = Math.max(to, view.to);
    const hi = Math.min(from, view.from);
    return hi > lo ? [x(hi), x(lo)] : undefined;
  };
  const step = rulerStep(view.from - view.to, Math.max(3, Math.floor(width / 90)));
  const ticks: number[] = [];
  for (let m = Math.ceil(view.to / step) * step; m <= view.from + 1e-9; m += step) ticks.push(m);

  const bands: JSX.Element[] = [];
  s.data.periods.forEach((p) => {
    const c = clip(p.from, p.to);
    if (!c) return;
    const w = c[1] - c[0];
    bands.push(
      <g key={p.id}>
        <rect
          x={c[0]}
          y={0}
          width={Math.max(0, w - 1)}
          height={LANE_H - 2}
          rx={4}
          fill={p.colour}
        />
        {w > 44 ? (
          <text x={c[0] + w / 2} y={LANE_H / 2 + 3} class="tl-label" text-anchor="middle">
            {p.name[s.language]}
          </text>
        ) : null}
      </g>,
    );
  });
  const supers: JSX.Element[] = [];
  s.data.supercontinents.forEach((p) => {
    const c = clip(p.from, p.to);
    if (!c) return;
    const w = c[1] - c[0];
    supers.push(
      <g key={p.id}>
        <rect
          x={c[0]}
          y={LANE_H}
          width={Math.max(0, w - 1)}
          height={LANE_H - 2}
          rx={4}
          fill={p.colour}
          opacity={0.9}
        />
        {w > 50 ? (
          <text
            x={c[0] + w / 2}
            y={LANE_H + LANE_H / 2 + 3}
            class="tl-label light"
            text-anchor="middle"
          >
            {p.name[s.language]}
          </text>
        ) : null}
      </g>,
    );
  });
  const zones: [number, number, number][] = [
    [1000, 540, 2],
    [540, 250, 1],
    [250, 0, 0],
  ];
  const certainty = zones.map(([from, to, k]) => {
    const c = clip(from, to);
    if (!c) return null;
    const w = c[1] - c[0];
    return (
      <g key={k}>
        <rect
          x={c[0]}
          y={LANE_H * 2}
          width={Math.max(0, w - 1)}
          height={8}
          rx={3}
          class={`cert cert${k}`}
        />
        {w > 90 ? (
          <text x={c[0] + w / 2} y={LANE_H * 2 + 19} class="tl-small" text-anchor="middle">
            {t.certainty[k]!}
          </text>
        ) : null}
      </g>
    );
  });
  const moments = s.data.moments.map((m) => {
    if (m.age > view.from || m.age < view.to) return null;
    const mx = x(m.age);
    const on = s.moment?.id === m.id;
    return (
      <g
        key={m.id}
        class={`tl-moment${on ? ' on' : ''}`}
        tabIndex={0}
        role="button"
        aria-label={m.title[s.language]}
        onClick={(e) => {
          e.stopPropagation();
          a.selectMoment(m);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            a.selectMoment(m);
          }
        }}
      >
        <title>{m.title[s.language]}</title>
        <circle cx={mx} cy={LANE_H * 3 + 12} r={on ? 8 : 6} />
      </g>
    );
  });
  const px = x(Math.min(view.from, Math.max(view.to, ageMa)));

  const seek = (e: PointerEvent): void => {
    a.seekMa(pointerMa(e, e.currentTarget as Element, view, width));
  };
  return (
    <svg
      class="timeline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="slider"
      aria-label={t.title}
      aria-valuemin={0}
      aria-valuemax={START_AGE / 1_000_000}
      aria-valuenow={Math.round(ageMa)}
      onPointerDown={(e) => {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        seek(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) seek(e);
      }}
      onWheel={(e) => {
        e.preventDefault();
        const r = (e.currentTarget as Element).getBoundingClientRect();
        a.zoom(e.deltaY < 0 ? 0.8 : 1.25, maOf(e.clientX - r.left, view, width));
      }}
    >
      <g transform={`translate(0 18)`}>
        {bands}
        {supers}
        {certainty}
        {moments}
      </g>
      <g class="tl-ruler">
        {ticks.map((m) => (
          <g key={m}>
            <line x1={x(m)} x2={x(m)} y1={14} y2={18} />
            <text x={x(m)} y={11} text-anchor="middle">
              {formatMa(m, s.language)}
            </text>
          </g>
        ))}
      </g>
      <g class="tl-playhead">
        <line x1={px} x2={px} y1={14} y2={height} />
        <path d={`M${px - 6} 12 h12 l-6 8 z`} />
      </g>
    </svg>
  );
}

function Card({ s, a }: { s: UiState; a: Actions }): JSX.Element | null {
  const m = s.moment;
  if (!m) return null;
  const t = STRINGS[s.language];
  const cites = m.sources
    .map((id) => s.data.credits.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
  const when =
    m.from === m.to
      ? formatAge(Math.round(m.age * 1_000_000), s.language, t.today)
      : `${formatMa(m.from, s.language)}–${formatAge(Math.round(m.to * 1_000_000), s.language, t.today)}`;
  return (
    <section class="geo-box geo-card" aria-live="polite">
      <button class="btn geo-close" aria-label={t.close} onClick={() => a.selectMoment(undefined)}>
        <Icon d={CLOSE} />
      </button>
      <h2>{m.title[s.language]}</h2>
      <p class="geo-when">
        {m.approx ? `${t.approximately} ` : ''}
        {when}
      </p>
      <p>{m.text[s.language]}</p>
      <details>
        <summary>{t.sources}</summary>
        <ul>
          {cites.map((c) => (
            <li key={c.id}>{c.citation}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function About({ s, a }: { s: UiState; a: Actions }): JSX.Element | null {
  if (!s.about) return null;
  const t = STRINGS[s.language];
  return (
    <div
      class="geo-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t.about}
      onClick={() => a.setAbout(false)}
    >
      <section class="geo-box geo-about" onClick={(e) => e.stopPropagation()}>
        <button class="btn geo-close" aria-label={t.close} onClick={() => a.setAbout(false)}>
          <Icon d={CLOSE} />
        </button>
        <h2>{t.aboutTitle}</h2>
        {t.aboutBody.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <h3>{t.aboutLimitsTitle}</h3>
        <ul>
          {t.aboutLimits.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <h3>{t.aboutCreditsTitle}</h3>
        <ul class="geo-credits">
          {s.data.credits.map((c) => (
            <li key={c.id}>
              {c.citation}
              {c.licence ? ` (${c.licence})` : ''}
            </li>
          ))}
        </ul>
        <p>{t.aboutLicence}</p>
      </section>
    </div>
  );
}

export function Ui({ s, a }: { s: UiState; a: Actions }): JSX.Element {
  const t = STRINGS[s.language];
  const ma = s.age / 1_000_000;
  const period =
    s.data.periods.find((p) => ma <= p.from && ma >= p.to) ??
    s.data.periods[s.data.periods.length - 1]!;
  const zone = ma > 540 ? 2 : ma > 250 ? 1 : 0;
  return (
    <div class="geo-ui">
      <header class="geo-top">
        <div class="geo-box geo-title">
          <strong>Miniworld</strong> · {t.title}
        </div>
        <div class="geo-top-right">
          <button class="btn" onClick={() => a.setAbout(true)}>
            {t.about}
          </button>
          <button
            class="btn"
            aria-label={t.language}
            onClick={() => a.setLanguage(s.language === 'en' ? 'de' : 'en')}
          >
            {s.language === 'en' ? 'DE' : 'EN'}
          </button>
        </div>
      </header>
      <div class="geo-age geo-box" aria-live="off">
        <div class="geo-age-main">{formatAge(s.age, s.language, t.today)}</div>
        <div class="geo-age-sub">
          {period.name[s.language]} ·{' '}
          <span class={`cert-text cert-text${zone}`}>{t.certainty[zone]!}</span>
        </div>
      </div>
      <div class="geo-legend geo-box">
        {(['ridge', 'subduction', 'transform'] as const).map((k) => (
          <div key={k} class="geo-legend-row">
            <span class="swatch" style={{ background: BOUNDARY_COLOURS[k] }} />
            {k === 'ridge'
              ? t.legendRidge
              : k === 'subduction'
                ? t.legendSubduction
                : t.legendTransform}
          </div>
        ))}
      </div>
      <Card s={s} a={a} />
      <footer class="geo-bottom geo-box">
        <div class="geo-controls">
          <button class="btn" aria-label={t.toStart} title={t.toStart} onClick={a.toStart}>
            <Icon d={SKIP_BACK} />
          </button>
          <button class="btn" aria-label={s.playing ? t.pause : t.play} onClick={a.togglePlay}>
            <Icon d={s.playing ? PAUSE : PLAY} />
          </button>
          <button class="btn" aria-label={t.toEnd} title={t.toEnd} onClick={a.toEnd}>
            <Icon d={SKIP_FORWARD} />
          </button>
          <div class="geo-speeds" role="group" aria-label={t.speed}>
            {SPEED_MODES.map((m, i) => (
              <button
                key={m}
                class="btn"
                aria-pressed={s.speed === m}
                onClick={() => a.setSpeed(m)}
              >
                {t.speedNames[i]!}
              </button>
            ))}
          </div>
          <div class="geo-spacer" />
          <button
            class="btn"
            aria-pressed={s.overlays.boundaries}
            onClick={() => a.toggleOverlay('boundaries')}
          >
            {t.boundaries}
          </button>
          <button
            class="btn"
            aria-pressed={s.overlays.coasts}
            onClick={() => a.toggleOverlay('coasts')}
          >
            {t.coasts}
          </button>
          <button class="btn" aria-label={t.zoomOut} title={t.zoomOut} onClick={() => a.zoom(1.5)}>
            <Icon d={MINUS} />
          </button>
          <button
            class="btn"
            aria-label={t.zoomIn}
            title={t.zoomIn}
            onClick={() => a.zoom(1 / 1.5)}
          >
            <Icon d={PLUS} />
          </button>
          <button class="btn" onClick={a.showAll}>
            {t.showAll}
          </button>
        </div>
        <Timeline s={s} a={a} />
      </footer>
      <About s={s} a={a} />
    </div>
  );
}
