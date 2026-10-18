// The interface shell (spec milestone 1, section 8): play controls, date and
// rate readout, timeline, top-right buttons and their panels. Every visible
// string comes from the message files.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Store } from '../core/store.ts';
import { TIMELINE_START, dateFromDay } from '../time/calendar.ts';
import { dayAtMs } from '../time/rate.ts';
import { SPEED_MODES, type SpeedMode } from '../time/speed.ts';
import { formatDateReadout, formatFullDate, formatYear, roundRate } from '../i18n/dates.ts';
import { LANGUAGES, type Language } from '../i18n/messages.ts';
import { LANGUAGE_NAMES, type I18n } from '../i18n/i18n.ts';
import { useStore } from './hooks.ts';
import type { Actions, HotState, UiState, VignetteCard } from './state.ts';
import type { Settings } from './storage.ts';
import {
  BookmarkIcon,
  CloseIcon,
  CompassIcon,
  TiltFlatterIcon,
  TiltSteeperIcon,
  FollowIcon,
  GearIcon,
  InfoIcon,
  LanesIcon,
  LensIcon,
  PauseIcon,
  PlayIcon,
  TurtleIcon,
  WalkerIcon,
  HorseIcon,
} from './icons.tsx';

interface Props {
  store: Store<UiState>;
  hot: Store<HotState>;
  i18n: I18n;
  actions: Actions;
}

export function App({ store, hot, i18n, actions }: Props) {
  const s = useStore(store);
  useStore(i18n);
  const t = i18n.t.bind(i18n);
  const lang = i18n.language;

  if (s.error !== undefined) {
    return (
      <div class="overlay" role="alert">
        <div>
          <p>{t('app.error')}</p>
          <p class="detail">{s.error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!s.ready && (
        <div class="overlay" aria-live="polite">
          {t('app.loading')}
        </div>
      )}

      {(s.settings.showStats || s.stressScene) && (
        <Stats hot={hot} stress={s.stressScene} t={t} actions={actions} />
      )}

      <div class="top-right">
        <button
          class="btn"
          aria-label={t('menu.bookmarks')}
          title={t('menu.bookmarks')}
          onClick={() => actions.setPanel(s.panel === 'bookmarks' ? 'none' : 'bookmarks')}
        >
          <BookmarkIcon />
        </button>
        <button
          class="btn"
          aria-label={t('menu.settings')}
          title={t('menu.settings')}
          onClick={() => actions.setPanel(s.panel === 'settings' ? 'none' : 'settings')}
        >
          <GearIcon />
        </button>
        <button
          class="btn"
          aria-label={t('menu.about')}
          title={t('menu.about')}
          onClick={() => actions.setPanel(s.panel === 'about' ? 'none' : 'about')}
        >
          <InfoIcon />
        </button>
      </div>

      <button
        class="btn compass"
        aria-label={t('camera.reset')}
        title={t('camera.reset')}
        onClick={() => actions.resetCamera()}
      >
        <CompassIcon />
      </button>
      <div class="tilt">
        <button
          class="btn"
          aria-label={t('camera.tiltFlatter')}
          title={t('camera.tiltFlatter')}
          onClick={() => actions.tiltCamera(15)}
        >
          <TiltFlatterIcon />
        </button>
        <button
          class="btn"
          aria-label={t('camera.tiltSteeper')}
          title={t('camera.tiltSteeper')}
          onClick={() => actions.tiltCamera(-15)}
        >
          <TiltSteeperIcon />
        </button>
      </div>
      {s.ready && !s.stressScene && !s.settings.lensHintSeen && (
        <LensHint t={t} actions={actions} />
      )}

      {s.panel === 'settings' && <SettingsPanel s={s} t={t} actions={actions} />}
      {s.panel === 'bookmarks' && <BookmarksPanel s={s} t={t} lang={lang} actions={actions} />}
      {s.panel === 'about' && <AboutPanel s={s} t={t} lang={lang} actions={actions} />}
      {s.panel === 'vignette' && s.vignette && (
        <VignettePanel card={s.vignette} t={t} lang={lang} actions={actions} />
      )}

      <div class="bottom">
        {s.fixture && <div class="notice">{t('app.fixtureNotice')}</div>}
        <div class="bar">
          <PlayControls hot={hot} i18n={i18n} actions={actions} />
          <LensFold s={s} t={t} i18n={i18n} actions={actions} />
        </div>
        <TimelineCanvas s={s} t={t} actions={actions} />
      </div>
    </>
  );
}

type T = I18n['t'];

/** Play button, speed modes, date and rate: the parts that change while history plays. */
function PlayControls({
  hot,
  i18n,
  actions,
}: {
  hot: Store<HotState>;
  i18n: I18n;
  actions: Actions;
}) {
  const s = useStore(hot);
  const t = i18n.t.bind(i18n);
  const lang = i18n.language;
  const stationary = s.playState !== 'playing' && !s.scrubbing;
  const dateText = formatDateReadout(s.day, lang, { yearsPerMinute: s.yearsPerMinute, stationary });
  const stateText = s.playState === 'playing' ? t('controls.playing') : t('controls.paused');
  return (
    <>
      <Fold
        class="play-fold"
        button={(open) =>
          s.playState === 'playing' ? (
            <button
              class="btn"
              aria-label={t('controls.pause')}
              title={t('controls.pauseHint')}
              onClick={() => {
                actions.pause();
                open();
              }}
            >
              <PauseIcon />
              <SpeedBadge mode={s.speedMode} />
            </button>
          ) : (
            <button
              class="btn"
              aria-label={t('controls.play')}
              title={t('controls.playHint')}
              onClick={() => {
                actions.play();
                open();
              }}
            >
              <PlayIcon />
              <SpeedBadge mode={s.speedMode} />
            </button>
          )
        }
      >
        <div class="speed-modes" role="radiogroup" aria-label={t('controls.speed')}>
          {SPEED_MODES.map((mode) => (
            <button
              key={mode}
              class="btn speed-mode"
              role="radio"
              aria-checked={s.speedMode === mode}
              aria-label={t(`controls.speed.${mode}`)}
              title={t(`controls.speed.${mode}`)}
              data-testid={`speed-${mode}`}
              onClick={() => actions.setSpeed(mode)}
            >
              <SpeedIcon mode={mode} />
            </button>
          ))}
        </div>
      </Fold>
      <span class="date" aria-live="off" data-testid="date">
        {dateText}
      </span>
      <span class="rate" title={stateText}>
        {s.playState === 'playing'
          ? t('controls.rate', { rate: roundRate(s.yearsPerMinute) })
          : stateText}
      </span>
    </>
  );
}

const SPEED_ICONS = { snail: TurtleIcon, regular: WalkerIcon, fast: HorseIcon };

function SpeedIcon({ mode }: { mode: SpeedMode }) {
  const Icon = SPEED_ICONS[mode];
  return <Icon />;
}

/** While folded, the play button shows a small snail or double arrow when not regular. */
function SpeedBadge({ mode }: { mode: SpeedMode }) {
  if (mode === 'regular') return null;
  return (
    <span class="speed-badge" data-testid="speed-badge">
      <SpeedIcon mode={mode} />
    </span>
  );
}

function TimelineCanvas({ s, t, actions }: { s: UiState; t: T; actions: Actions }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    actions.attachTimeline(ref.current);
    return () => actions.attachTimeline(null);
  }, [actions]);
  return (
    <div class="timeline-wrap">
      <button
        class="timeline-expand"
        aria-label={s.settings.timelineExpanded ? t('timeline.collapse') : t('timeline.expand')}
        title={s.settings.timelineExpanded ? t('timeline.collapse') : t('timeline.expand')}
        aria-pressed={s.settings.timelineExpanded}
        onClick={() => actions.toggleLanes()}
      >
        <LanesIcon />
      </button>
      <div class="timeline-canvas">
        <canvas
          ref={ref}
          tabIndex={0}
          role="slider"
          aria-label={t('timeline.label')}
          data-testid="timeline"
        />
        {!s.follow && (
          <button
            class="btn timeline-follow"
            aria-label={t('timeline.follow')}
            title={t('timeline.follow')}
            onClick={() => actions.followPlayhead()}
          >
            <FollowIcon />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A slider folded away behind an icon button (milestone-1.md, section 8.1): it
 * opens while pointed at or focused from the keyboard, and on touch screens
 * when the button is tapped, until a tap lands elsewhere.
 */
function Fold({
  class: cls,
  button,
  children,
}: {
  class: string;
  button: (open: () => void) => ComponentChildren;
  children: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  return (
    <div
      ref={ref}
      class={`fold ${cls}${open ? ' open' : ''}`}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
    >
      {button(() => setOpen(true))}
      <div class="fold-panel">
        <div class="fold-box">{children}</div>
      </div>
    </div>
  );
}

/** The history lens strength, 0 to 200%, behind a magnifier (history-lens.md, section 1). */
function LensFold({ s, t, i18n, actions }: { s: UiState; t: T; i18n: I18n; actions: Actions }) {
  const value = s.settings.lensStrength;
  const text = t('lens.value', { percent: i18n.number(value) });
  return (
    <Fold
      class="lens-fold"
      button={(open) => (
        <button
          class="btn"
          aria-label={t('lens.slider')}
          title={t('lens.sliderHint')}
          data-testid="lens-button"
          onClick={open}
        >
          <LensIcon />
        </button>
      )}
    >
      <input
        type="range"
        min={0}
        max={200}
        step={10}
        value={value}
        aria-label={t('lens.slider')}
        aria-valuetext={text}
        data-testid="lens-strength"
        onInput={(e) =>
          actions.setSetting('lensStrength', Number((e.target as HTMLInputElement).value))
        }
      />
      <output>{text}</output>
    </Fold>
  );
}

/** The first-start hint about the history lens (history-lens.md, section 1). */
function LensHint({ t, actions }: { t: T; actions: Actions }) {
  const [more, setMore] = useState(false);
  return (
    <aside class="lens-hint" role="note" data-testid="lens-hint">
      <p>{t('lens.hint')}</p>
      {more ? (
        <p class="more">{t('lens.learnMoreText')}</p>
      ) : (
        <button class="link" onClick={() => setMore(true)}>
          {t('lens.learnMore')}
        </button>
      )}
      <button
        class="btn close"
        aria-label={t('lens.closeHint')}
        title={t('lens.closeHint')}
        onClick={() => actions.closeLensHint()}
      >
        <CloseIcon />
      </button>
    </aside>
  );
}

function PanelFrame({
  title,
  t,
  actions,
  children,
}: {
  title: string;
  t: T;
  actions: Actions;
  children: preact.ComponentChildren;
}) {
  return (
    <section class="panel" role="dialog" aria-label={title}>
      <h2>{title}</h2>
      <button
        class="btn close"
        aria-label={t('dialog.close')}
        title={t('dialog.close')}
        onClick={() => actions.setPanel('none')}
      >
        <CloseIcon />
      </button>
      {children}
    </section>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label class="row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
      />
    </label>
  );
}

function SettingsPanel({ s, t, actions }: { s: UiState; t: T; actions: Actions }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => actions.setSetting(k, v);
  return (
    <PanelFrame title={t('settings.title')} t={t} actions={actions}>
      <label class="row">
        <span>{t('settings.language')}</span>
        <select
          value={s.settings.language}
          onChange={(e) => set('language', (e.target as HTMLSelectElement).value as Language)}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l} lang={l}>
              {LANGUAGE_NAMES[l]}
            </option>
          ))}
        </select>
      </label>
      <Toggle
        label={t('settings.trueTimeScale')}
        value={s.settings.trueTimeScale}
        onChange={(v) => set('trueTimeScale', v)}
      />
      <Toggle
        label={t('settings.showStats')}
        value={s.settings.showStats}
        onChange={(v) => set('showStats', v)}
      />
    </PanelFrame>
  );
}

function BookmarksPanel({
  s,
  t,
  lang,
  actions,
}: {
  s: UiState;
  t: T;
  lang: Language;
  actions: Actions;
}) {
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState('');
  return (
    <PanelFrame title={t('bookmarks.title')} t={t} actions={actions}>
      <p>
        <button class="btn" onClick={() => actions.addBookmark()}>
          <BookmarkIcon />
          {t('bookmarks.add')}
        </button>
      </p>
      {s.bookmarks.length === 0 && <p>{t('bookmarks.empty')}</p>}
      {s.bookmarks.map((b) =>
        editing === b.id ? (
          <form
            key={b.id}
            class="bookmark"
            onSubmit={(e) => {
              e.preventDefault();
              actions.renameBookmark(b.id, draft);
              setEditing(undefined);
            }}
          >
            <input
              type="text"
              class="name"
              aria-label={t('bookmarks.name')}
              value={draft}
              maxLength={80}
              onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
              ref={(el) => el?.focus()}
            />
            <button class="btn" type="submit">
              {t('bookmarks.save')}
            </button>
          </form>
        ) : (
          <div key={b.id} class="bookmark">
            <button
              class="btn name"
              aria-label={t('bookmarks.go', { name: b.name })}
              title={formatDateReadout(dayAtMs(b.ms, TIMELINE_START), lang, {
                yearsPerMinute: 0,
                stationary: true,
              })}
              onClick={() => actions.goToBookmark(b.id)}
            >
              {b.name}
            </button>
            <button
              class="btn"
              onClick={() => {
                setDraft(b.name);
                setEditing(b.id);
              }}
            >
              {t('bookmarks.rename')}
            </button>
            <button
              class="btn"
              aria-label={t('bookmarks.delete')}
              title={t('bookmarks.delete')}
              onClick={() => actions.deleteBookmark(b.id)}
            >
              <CloseIcon />
            </button>
          </div>
        ),
      )}
    </PanelFrame>
  );
}

function AboutPanel({
  s,
  t,
  lang,
  actions,
}: {
  s: UiState;
  t: T;
  lang: Language;
  actions: Actions;
}) {
  const c = dateFromDay(s.cutoffDay);
  return (
    <PanelFrame title={t('about.title')} t={t} actions={actions}>
      <p>{t('about.intro')}</p>
      <p>
        {t('about.version', {
          version: s.version,
          date: formatFullDate(c.year, c.month, c.day, lang),
        })}
      </p>
      <h3>{t('about.sources')}</h3>
      <ul>
        {s.sources.map((src) => (
          <li key={src.id}>
            <a href={src.url} target="_blank" rel="noreferrer">
              {src.title}
            </a>
            <br />
            <small>{src.citation}</small>
            <br />
            <small>{t('about.licence', { licence: src.licence })}</small>
          </li>
        ))}
      </ul>
      <h3>{t('about.simplifications')}</h3>
      <ul>
        <li>{t('about.simplification.climate')}</li>
        <li>{t('about.simplification.land')}</li>
        <li>{t('about.simplification.lakes')}</li>
        <li>{t('about.simplification.ice')}</li>
      </ul>
    </PanelFrame>
  );
}

function VignettePanel({
  card,
  t,
  lang,
  actions,
}: {
  card: VignetteCard;
  t: T;
  lang: Language;
  actions: Actions;
}) {
  const from = formatYear(dateFromDay(card.fromDay).year, lang, card.fromApproximate);
  const to = formatYear(dateFromDay(card.toDay - 1).year, lang, card.toApproximate);
  const text = card.text;
  return (
    <PanelFrame title={text?.title ?? card.title} t={t} actions={actions}>
      <p class="card-date">{t('vignette.span', { from, to })}</p>
      {text ? (
        <>
          {paragraphs(text.body)}
          {text.learnMore && (
            <>
              <h3>{t('vignette.learnMore')}</h3>
              {paragraphs(text.learnMore)}
            </>
          )}
        </>
      ) : (
        <p class="card-loading">{card.failed ? t('vignette.failed') : t('vignette.loading')}</p>
      )}
    </PanelFrame>
  );
}

function paragraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p, i) => <p key={i}>{p.trim()}</p>);
}

function Stats({
  hot,
  stress,
  t,
  actions,
}: {
  hot: Store<HotState>;
  stress: boolean;
  t: T;
  actions: Actions;
}) {
  const st = useStore(hot).stats;
  return (
    <div class="stats" data-testid="stats">
      <strong>{stress ? t('stress.title') : t('stats.title')}</strong>
      <dl>
        <dt>{t('stats.fps')}</dt>
        <dd>{st.fps.toFixed(0)}</dd>
        <dt>{t('stats.frameTime')}</dt>
        <dd>
          {st.avg.toFixed(1)} / {st.p99.toFixed(1)}
        </dd>
        <dt>{t('stats.drawCalls')}</dt>
        <dd>{st.calls}</dd>
        <dt>{t('stats.triangles')}</dt>
        <dd>{st.triangles.toLocaleString()}</dd>
        <dt>{t('stats.renderScale')}</dt>
        <dd>{st.scale.toFixed(2)}</dd>
      </dl>
      <button class="btn" onClick={() => actions.saveReport()}>
        {t('stats.report')}
      </button>
    </div>
  );
}
