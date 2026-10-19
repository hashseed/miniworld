// The interface shell (spec milestone 1, section 8): play controls, date and
// rate readout, timeline, top-right buttons and their panels. Every visible
// string comes from the message files.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Store } from '../core/store.ts';
import { TIMELINE_START, dateFromDay } from '../time/calendar.ts';
import { dayAtMs } from '../time/rate.ts';
import { SPEED_MODES, type SpeedMode } from '../time/speed.ts';
import {
  formatDateReadout,
  formatFullDate,
  formatRateNumber,
  formatYear,
  roundRate,
} from '../i18n/dates.ts';
import { LANGUAGES, type Language } from '../i18n/messages.ts';
import { LANGUAGE_NAMES, type I18n } from '../i18n/i18n.ts';
import { useStore } from './hooks.ts';
import type { Actions, HotState, UiState, VignetteCard } from './state.ts';
import { JUMP_STEPS, type JumpStep, type Settings } from './storage.ts';
import {
  BookmarkIcon,
  CloseIcon,
  CheetahIcon,
  CircleArrowIcon,
  FastForwardIcon,
  FastReverseIcon,
  CompassIcon,
  FollowIcon,
  GearIcon,
  LanesIcon,
  LensIcon,
  PauseIcon,
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
  // The bottom bar's height, so a card in the top left ends above the play
  // controls and the timeline (wildlife.md section 8).
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bottom.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      document.documentElement.style.setProperty('--bottom-h', `${el.offsetHeight}px`),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [s.error]);

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
      </div>

      <button
        class="btn compass"
        aria-label={t('camera.reset')}
        title={t('camera.reset')}
        onClick={() => actions.resetCamera()}
      >
        <CompassIcon />
      </button>
      {s.ready && !s.stressScene && !s.settings.lensHintSeen && (
        <LensHint t={t} actions={actions} />
      )}

      {s.panel === 'settings' && <SettingsPanel s={s} t={t} actions={actions} />}
      {s.panel === 'bookmarks' && <BookmarksPanel s={s} t={t} lang={lang} actions={actions} />}
      {s.panel === 'about' && <AboutPanel s={s} t={t} lang={lang} actions={actions} />}
      {s.panel === 'vignette' && s.vignette && (
        <VignettePanel card={s.vignette} t={t} lang={lang} actions={actions} />
      )}

      <div class="bottom" ref={bottom}>
        {s.fixture && <div class="notice">{t('app.fixtureNotice')}</div>}
        <div class="bar">
          <PlayControls hot={hot} i18n={i18n} settings={s.settings} actions={actions} />
          <LensFold s={s} t={t} i18n={i18n} actions={actions} />
        </div>
        <TimelineCanvas s={s} t={t} actions={actions} />
      </div>
    </>
  );
}

type T = I18n['t'];

/**
 * Back button, play button with the speed modes, forward button, date and state
 * readout: the parts that change while history plays (section 8.1).
 */
function PlayControls({
  hot,
  i18n,
  settings,
  actions,
}: {
  hot: Store<HotState>;
  i18n: I18n;
  settings: Settings;
  actions: Actions;
}) {
  const s = useStore(hot);
  const t = i18n.t.bind(i18n);
  const lang = i18n.language;
  const playing = s.playState === 'playing';
  const stationary = !playing && !s.scrubbing && s.jumping === 0;
  const dateText = formatDateReadout(s.day, lang, { yearsPerMinute: s.yearsPerMinute, stationary });
  const rateText = t('controls.rate', { rate: roundRate(s.yearsPerMinute) });
  // The readout: fast arrows during a jump, a pause sign when paused, else the bare rate.
  const [readout, readoutText] =
    s.jumping < 0
      ? [<FastReverseIcon />, t('controls.jumpingBack')]
      : s.jumping > 0
        ? [<FastForwardIcon />, t('controls.jumpingForward')]
        : playing
          ? [formatRateNumber(s.yearsPerMinute, lang), rateText]
          : [<PauseIcon />, t('controls.paused')];
  return (
    <>
      <JumpFold dir={-1} step={settings.backStep} i18n={i18n} actions={actions} />
      <Fold
        class="play-fold"
        holdToOpen
        button={() => (
          <button
            class={playing ? 'btn play' : 'btn play paused'}
            aria-label={playing ? t('controls.pause') : t('controls.play')}
            title={playing ? t('controls.pauseHint') : t('controls.playHint')}
            data-testid="play"
            onClick={() => {
              if (playing) actions.pause();
              else actions.play();
            }}
          >
            <SpeedIcon mode={s.speedMode} />
          </button>
        )}
      >
        <div class="pop-options" role="radiogroup" aria-label={t('controls.speed')}>
          {SPEED_MODES.map((mode) => (
            <button
              key={mode}
              class="btn pop-option"
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
      <JumpFold dir={1} step={settings.forwardStep} i18n={i18n} actions={actions} />
      <span class="date" aria-live="off" data-testid="date">
        {dateText}
      </span>
      <span class="rate" title={readoutText} aria-label={readoutText} data-testid="readout">
        {readout}
      </span>
    </>
  );
}

/** How a step is written on its button: the number, or 1k for a thousand. */
function stepLabel(step: JumpStep, i18n: I18n): string {
  return step === 1000 ? i18n.t('controls.stepThousand') : i18n.number(step);
}

/** The back (-1) or forward (1) button, with its four steps folded behind it (section 8.1). */
function JumpFold({
  dir,
  step,
  i18n,
  actions,
}: {
  dir: -1 | 1;
  step: JumpStep;
  i18n: I18n;
  actions: Actions;
}) {
  const t = i18n.t.bind(i18n);
  const name = dir < 0 ? 'back' : 'forward';
  return (
    <Fold
      class="play-fold"
      holdToOpen
      button={() => (
        <button
          class="btn"
          aria-label={t(`controls.${name}`, { n: step })}
          title={t(`controls.${name}`, { n: step })}
          data-testid={name}
          onClick={() => {
            actions.jump(dir);
          }}
        >
          <CircleArrowIcon clockwise={dir > 0} label={stepLabel(step, i18n)} />
        </button>
      )}
    >
      <div class="pop-options" role="radiogroup" aria-label={t('controls.step')}>
        {JUMP_STEPS.map((n) => (
          <button
            key={n}
            class="btn pop-option"
            role="radio"
            aria-checked={step === n}
            aria-label={t('controls.stepOption', { n })}
            title={t('controls.stepOption', { n })}
            data-testid={`${name}-${n}`}
            onClick={() => actions.setSetting(dir < 0 ? 'backStep' : 'forwardStep', n)}
          >
            <CircleArrowIcon clockwise={dir > 0} label={stepLabel(n, i18n)} />
          </button>
        ))}
      </div>
    </Fold>
  );
}

const SPEED_ICONS = {
  snail: TurtleIcon,
  regular: WalkerIcon,
  fast: HorseIcon,
  fastest: CheetahIcon,
};

function SpeedIcon({ mode }: { mode: SpeedMode }) {
  const Icon = SPEED_ICONS[mode];
  return <Icon />;
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

/** How long a press on a touch screen is held to open a fold (section 8.1). */
const HOLD_MS = 450;

/**
 * A slider folded away behind an icon button (milestone-1.md, section 8.1): it
 * opens while pointed at or focused from the keyboard, and on touch screens
 * when the button is tapped, until a tap lands elsewhere.
 */
function Fold({
  class: cls,
  button,
  holdToOpen = false,
  children,
}: {
  class: string;
  button: (open: () => void) => ComponentChildren;
  /**
   * On touch screens the button keeps its tap for its own action, and a press
   * held for HOLD_MS opens the fold instead, as pointing does (section 8.1).
   */
  holdToOpen?: boolean;
  children: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  const release = () => clearTimeout(timer.current);
  const hold = holdToOpen
    ? {
        onPointerDown: (e: PointerEvent) => {
          release();
          held.current = false;
          if (e.pointerType === 'mouse' || (e.target as Element).closest('.fold-panel')) return;
          timer.current = setTimeout(() => {
            held.current = true;
            setOpen(true);
          }, HOLD_MS);
        },
        onPointerUp: release,
        onPointerCancel: release,
        // The click that ends a hold only opened the fold; it does not also act.
        onClickCapture: (e: MouseEvent) => {
          if (!held.current) return;
          held.current = false;
          e.preventDefault();
          e.stopPropagation();
        },
        onContextMenu: (e: MouseEvent) => e.preventDefault(),
      }
    : {};
  useEffect(() => release, []);
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
      onPointerLeave={(e) => {
        release();
        if (e.pointerType === 'mouse') setOpen(false);
      }}
      {...hold}
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
  left,
  children,
}: {
  title: string;
  t: T;
  actions: Actions;
  /** Opens in the top-left corner instead of the top right. */
  left?: boolean;
  children: preact.ComponentChildren;
}) {
  return (
    <section class={left ? 'panel left' : 'panel'} role="dialog" aria-label={title}>
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
      {/* The About panel, with the attribution the data licences require (section 8.5). */}
      <button class="link" data-testid="about-link" onClick={() => actions.setPanel('about')}>
        {t('menu.aboutLink')}
      </button>
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
  // An animal's card shows only the ends of its group's span (wildlife.md section 8).
  const a = card.animal;
  const dateLine = !a
    ? t('vignette.span', { from, to })
    : a.from && a.to
      ? t('animal.span', { from, to })
      : a.from
        ? t('animal.from', { from })
        : a.to
          ? t('animal.until', { to })
          : undefined;
  return (
    <PanelFrame title={text?.title ?? card.title} t={t} actions={actions} left={!!a}>
      {dateLine && <p class="card-date">{dateLine}</p>}
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
