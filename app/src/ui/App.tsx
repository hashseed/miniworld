// The interface shell (spec milestone 1, section 8): play controls, date and
// rate readout, timeline, top-right buttons and their panels. Every visible
// string comes from the message files.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Store } from '../core/store.ts';
import { dateFromDay } from '../time/calendar.ts';
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
import { LoadingScreen } from './LoadingScreen.tsx';
import type { Actions, HotState, UiState, VignetteCard } from './state.ts';
import type { Settings } from './storage.ts';
import { JUMP_SECONDS } from '../time/clock.ts';
import {
  BookmarkIcon,
  CloseIcon,
  TravelIcon,
  CheetahIcon,
  CircleArrowIcon,
  FastForwardIcon,
  FastReverseIcon,
  CompassIcon,
  FollowIcon,
  GearIcon,
  ChevronIcon,
  LanesIcon,
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
      <LoadingScreen
        loaded={s.loaded}
        phase={s.intro}
        captionY={s.introCaptionY}
        radius={s.introRadius}
        globeDrawn={s.introGlobe}
        label={t('app.loading')}
      />

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

      {s.panel === 'settings' && <SettingsPanel s={s} t={t} actions={actions} />}
      {s.panel === 'bookmarks' && <EventsDialog s={s} t={t} lang={lang} actions={actions} />}
      {s.panel === 'about' && <AboutPanel s={s} t={t} lang={lang} actions={actions} />}
      {s.panel === 'vignette' && s.vignette && (
        <VignettePanel card={s.vignette} t={t} lang={lang} actions={actions} />
      )}

      <div class="bottom" ref={bottom}>
        {s.fixture && <div class="notice">{t('app.fixtureNotice')}</div>}
        <div class="bar">
          <PlayControls hot={hot} i18n={i18n} actions={actions} />
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
  actions,
}: {
  hot: Store<HotState>;
  i18n: I18n;
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
      <JumpButton dir={-1} i18n={i18n} actions={actions} />
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
            {/* The usual icons: play while paused, pause while playing (section 8.1). */}
            {playing ? <PauseIcon /> : <PlayIcon />}
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
      <JumpButton dir={1} i18n={i18n} actions={actions} />
      <span class="date" aria-live="off" data-testid="date" aria-label={dateText}>
        {/* Every digit in a cell of its own width, so the readout keeps still as the years count. */}
        {[...dateText].map((c, i) =>
          c >= '0' && c <= '9' ? (
            <span key={i} class="digit" aria-hidden="true">
              {c}
            </span>
          ) : (
            <span key={i} aria-hidden="true">
              {c}
            </span>
          ),
        )}
      </span>
      <span class="rate" title={readoutText} aria-label={readoutText} data-testid="readout">
        {readout}
      </span>
    </>
  );
}

/** The back (-1) or forward (1) button: ten seconds of watching time, played fast (section 8.1). */
function JumpButton({ dir, i18n, actions }: { dir: -1 | 1; i18n: I18n; actions: Actions }) {
  const t = i18n.t.bind(i18n);
  const name = dir < 0 ? 'back' : 'forward';
  const label = t(`controls.${name}`, { n: JUMP_SECONDS });
  return (
    <button
      class="btn"
      aria-label={label}
      title={label}
      data-testid={name}
      onClick={() => actions.jump(dir)}
    >
      <CircleArrowIcon clockwise={dir > 0} label={i18n.number(JUMP_SECONDS)} />
    </button>
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
      <div class="timeline-side">
        <button
          class="timeline-expand"
          aria-label={s.settings.timelineMinimized ? t('timeline.restore') : t('timeline.minimize')}
          title={s.settings.timelineMinimized ? t('timeline.restore') : t('timeline.minimize')}
          aria-pressed={s.settings.timelineMinimized}
          onClick={() => actions.toggleMinimized()}
        >
          <ChevronIcon up={s.settings.timelineMinimized} />
        </button>
        {!s.settings.timelineMinimized && (
          <button
            class="timeline-expand"
            aria-label={s.settings.timelineExpanded ? t('timeline.collapse') : t('timeline.expand')}
            title={s.settings.timelineExpanded ? t('timeline.collapse') : t('timeline.expand')}
            aria-pressed={s.settings.timelineExpanded}
            onClick={() => actions.toggleLanes()}
          >
            <LanesIcon />
          </button>
        )}
      </div>
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

/** Lower case without accents, so a search finds "Göbekli" as "gobekli" (milestone-1 section 8.3). */
const folded = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The events and bookmarks dialog (milestone-1 section 8.3): two tabs, each a searchable list. */
function EventsDialog({
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
  const [tab, setTab] = useState<'events' | 'bookmarks'>('events');
  const [query, setQuery] = useState({ events: '', bookmarks: '' });
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const date = (day: number) =>
    formatDateReadout(day, lang, { yearsPerMinute: 0, stationary: true });
  const matches = (q: string, ...texts: string[]) =>
    !q.trim() || texts.some((x) => folded(x).includes(folded(q.trim())));
  const events = s.events
    .map((e) => ({ ...e, region: actions.regionOf(e.lat, e.lon) }))
    .filter((e) => matches(query.events, e.title, e.region));
  const bookmarks = [...s.bookmarks]
    .sort((a, b) => a.day - b.day)
    .map((b) => ({ ...b, region: actions.regionOf(b.camera.lat, b.camera.lon) }))
    .filter((b) => matches(query.bookmarks, b.name, b.region));
  const title = t('events.dialog');
  const tabs = [
    ['events', t('events.tab')],
    ['bookmarks', t('bookmarks.tab')],
  ] as const;
  return (
    <div
      class="dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) actions.setPanel('none');
      }}
    >
      <section class="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div class="tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`tabpanel-${id}`}
              class={tab === id ? 'tab selected' : 'tab'}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
          <button
            class="btn close"
            aria-label={t('dialog.close')}
            title={t('dialog.close')}
            onClick={() => actions.setPanel('none')}
          >
            <CloseIcon />
          </button>
        </div>
        <div class="tabpanel" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
          <div class="tools">
            <input
              key={tab}
              type="search"
              class="search"
              placeholder={t(tab === 'events' ? 'events.search' : 'bookmarks.search')}
              aria-label={t(tab === 'events' ? 'events.search' : 'bookmarks.search')}
              value={query[tab]}
              onInput={(e) => setQuery({ ...query, [tab]: (e.target as HTMLInputElement).value })}
              ref={(el) => el?.focus({ preventScroll: true })}
            />
            {tab === 'bookmarks' && (
              <button class="btn" onClick={() => actions.addBookmark()}>
                <BookmarkIcon />
                {t('bookmarks.add')}
              </button>
            )}
          </div>
          <div class="rows-scroll">
            <table class="rows">
              <thead>
                <tr>
                  <th scope="col" class="go">
                    <span class="visually-hidden">{t('list.go')}</span>
                  </th>
                  <th scope="col">{t('list.date')}</th>
                  <th scope="col">{t('list.name')}</th>
                  <th scope="col" class="region">
                    {t('list.region')}
                  </th>
                  {tab === 'bookmarks' && <th scope="col" class="actions" />}
                </tr>
              </thead>
              <tbody>
                {tab === 'events' &&
                  events.map((e) => (
                    <tr key={e.id} class="row" onClick={() => actions.goToEvent(e.id)}>
                      <td class="go">
                        <button
                          class="btn"
                          aria-label={t('events.go', { name: e.title })}
                          title={t('events.go', { name: e.title })}
                        >
                          <TravelIcon />
                        </button>
                      </td>
                      <td class="when">{date(e.day)}</td>
                      <td class="name">
                        {e.title}
                        <span class="sub">{e.region}</span>
                      </td>
                      <td class="region">{e.region}</td>
                    </tr>
                  ))}
                {tab === 'bookmarks' &&
                  bookmarks.map((b) => (
                    <tr
                      key={b.id}
                      class="row"
                      onClick={() => editing !== b.id && actions.goToBookmark(b.id)}
                    >
                      <td class="go">
                        <button
                          class="btn"
                          aria-label={t('bookmarks.go', { name: b.name })}
                          title={t('bookmarks.go', { name: b.name })}
                        >
                          <TravelIcon />
                        </button>
                      </td>
                      <td class="when">{date(b.day)}</td>
                      <td class="name">
                        {editing === b.id ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              actions.renameBookmark(b.id, draft);
                              setEditing(undefined);
                            }}
                          >
                            <input
                              type="text"
                              aria-label={t('bookmarks.name')}
                              value={draft}
                              maxLength={80}
                              onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
                              onClick={(e) => e.stopPropagation()}
                              ref={(el) => el?.focus()}
                            />
                          </form>
                        ) : (
                          b.name
                        )}
                        <span class="sub">{b.region}</span>
                      </td>
                      <td class="region">{b.region}</td>
                      <td class="actions" onClick={(e) => e.stopPropagation()}>
                        {editing === b.id ? (
                          <button
                            class="btn"
                            onClick={() => {
                              actions.renameBookmark(b.id, draft);
                              setEditing(undefined);
                            }}
                          >
                            {t('bookmarks.save')}
                          </button>
                        ) : (
                          <button
                            class="btn"
                            onClick={() => {
                              setDraft(b.name);
                              setEditing(b.id);
                            }}
                          >
                            {t('bookmarks.rename')}
                          </button>
                        )}
                        <button
                          class="btn"
                          aria-label={t('bookmarks.delete')}
                          title={t('bookmarks.delete')}
                          onClick={() => actions.deleteBookmark(b.id)}
                        >
                          <CloseIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {tab === 'events' && events.length === 0 && (
              <p class="empty">{t(s.events.length ? 'events.none' : 'events.empty')}</p>
            )}
            {tab === 'bookmarks' && bookmarks.length === 0 && (
              <p class="empty">{t(s.bookmarks.length ? 'bookmarks.none' : 'bookmarks.empty')}</p>
            )}
          </div>
        </div>
      </section>
    </div>
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
