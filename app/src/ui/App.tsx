// The interface shell (spec milestone 1, section 8): play controls, date and
// rate readout, timeline, top-right buttons and their panels. Every visible
// string comes from the message files.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Store } from '../core/store.ts';
import { dateFromDay } from '../time/calendar.ts';
import { SPEEDS } from '../time/rateCurve.ts';
import { formatDateReadout, formatFullDate, formatYear, roundRate } from '../i18n/dates.ts';
import { LANGUAGES, type Language } from '../i18n/messages.ts';
import { LANGUAGE_NAMES, type I18n } from '../i18n/i18n.ts';
import { useStore } from './hooks.ts';
import type { Actions, UiState, VignetteCard } from './state.ts';
import type { QualitySetting, Settings } from './storage.ts';
import {
  BookmarkIcon,
  CloseIcon,
  CompassIcon,
  TiltFlatterIcon,
  TiltSteeperIcon,
  FollowIcon,
  FreezeIcon,
  GearIcon,
  InfoIcon,
  LanesIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
} from './icons.tsx';

interface Props {
  store: Store<UiState>;
  i18n: I18n;
  actions: Actions;
}

const SPEED_LABELS: Record<number, string> = { 0.25: '¼', 0.5: '½' };

export function App({ store, i18n, actions }: Props) {
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

  const stationary = s.playState !== 'playing' && !s.scrubbing;
  const dateText = formatDateReadout(s.day, lang, { yearsPerMinute: s.yearsPerMinute, stationary });
  const stateText =
    s.playState === 'playing'
      ? t('controls.playing')
      : s.playState === 'frozen'
        ? t('controls.frozen')
        : t('controls.historyPaused');

  return (
    <>
      {(!s.ready || s.preparing) && (
        <div class="overlay" aria-live="polite">
          {s.preparing ? t('app.preparing') : t('app.loading')}
        </div>
      )}

      {(s.settings.showStats || s.stressScene) && <Stats s={s} t={t} actions={actions} />}

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

      {s.panel === 'settings' && <SettingsPanel s={s} t={t} actions={actions} />}
      {s.panel === 'bookmarks' && <BookmarksPanel s={s} t={t} lang={lang} actions={actions} />}
      {s.panel === 'about' && <AboutPanel s={s} t={t} lang={lang} actions={actions} />}
      {s.panel === 'vignette' && s.vignette && (
        <VignettePanel card={s.vignette} t={t} lang={lang} actions={actions} />
      )}

      <div class="bottom">
        {s.fixture && <div class="notice">{t('app.fixtureNotice')}</div>}
        <div class="bar">
          <button
            class="btn"
            aria-label={t('controls.play')}
            title={t('controls.play')}
            aria-pressed={s.playState === 'playing'}
            onClick={() => actions.play()}
          >
            <PlayIcon />
          </button>
          <button
            class="btn"
            aria-label={t('controls.pauseHistory')}
            title={t('controls.pauseHistory')}
            aria-pressed={s.playState === 'historyPaused'}
            onClick={() => actions.pauseHistory()}
          >
            <PauseIcon />
          </button>
          <button
            class="btn"
            aria-label={t('controls.freeze')}
            title={t('controls.freeze')}
            aria-pressed={s.playState === 'frozen'}
            onClick={() => actions.freeze()}
          >
            <FreezeIcon />
          </button>
          <div class="speed" role="group" aria-label={t('controls.speed')}>
            {SPEEDS.map((sp, i) => (
              <button
                key={sp}
                aria-pressed={s.speedIndex === i}
                onClick={() => actions.setSpeed(i)}
              >
                {t('controls.speedValue', { speed: SPEED_LABELS[sp] ?? i18n.number(sp) })}
              </button>
            ))}
          </div>
          <span class="date" aria-live="off" data-testid="date">
            {dateText}
          </span>
          <span class="rate" title={stateText}>
            {s.playState === 'playing'
              ? t('controls.rate', { rate: roundRate(s.yearsPerMinute) })
              : stateText}
          </span>
        </div>
        <div class="timeline-tools">
          <button
            class="btn"
            aria-label={t('timeline.zoomIn')}
            title={t('timeline.zoomIn')}
            onClick={() => actions.zoomTimeline(0.5)}
          >
            <PlusIcon />
          </button>
          <button
            class="btn"
            aria-label={t('timeline.zoomOut')}
            title={t('timeline.zoomOut')}
            onClick={() => actions.zoomTimeline(2)}
          >
            <MinusIcon />
          </button>
          {!s.follow && (
            <button
              class="btn"
              aria-label={t('timeline.follow')}
              title={t('timeline.follow')}
              onClick={() => actions.followPlayhead()}
            >
              <FollowIcon />
            </button>
          )}
          <button
            class="btn"
            aria-label={s.settings.timelineExpanded ? t('timeline.collapse') : t('timeline.expand')}
            title={s.settings.timelineExpanded ? t('timeline.collapse') : t('timeline.expand')}
            aria-pressed={s.settings.timelineExpanded}
            onClick={() => actions.toggleLanes()}
          >
            <LanesIcon />
          </button>
        </div>
        <TimelineCanvas t={t} actions={actions} />
      </div>
    </>
  );
}

type T = I18n['t'];

function TimelineCanvas({ t, actions }: { t: T; actions: Actions }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    actions.attachTimeline(ref.current);
    return () => actions.attachTimeline(null);
  }, [actions]);
  return (
    <div class="timeline-wrap">
      <canvas
        ref={ref}
        tabIndex={0}
        role="slider"
        aria-label={t('timeline.label')}
        data-testid="timeline"
      />
    </div>
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
  const tierName = (tier: 'high' | 'medium' | 'low') => t(`settings.quality.${tier}`);
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
      <label class="row">
        <span>{t('settings.quality')}</span>
        <select
          value={s.settings.quality}
          onChange={(e) => set('quality', (e.target as HTMLSelectElement).value as QualitySetting)}
        >
          <option value="auto">{t('settings.quality.auto', { tier: tierName(s.autoTier) })}</option>
          <option value="high">{tierName('high')}</option>
          <option value="medium">{tierName('medium')}</option>
          <option value="low">{tierName('low')}</option>
        </select>
      </label>
      <Toggle
        label={t('settings.trueTimeScale')}
        value={s.settings.trueTimeScale}
        onChange={(v) => set('trueTimeScale', v)}
      />
      <Toggle
        label={t('settings.slowWhenZoomed')}
        value={s.settings.slowWhenZoomed}
        onChange={(v) => set('slowWhenZoomed', v)}
      />
      <Toggle
        label={t('settings.showStats')}
        value={s.settings.showStats}
        onChange={(v) => set('showStats', v)}
      />
      <p>
        <button class="btn" onClick={() => actions.remeasure()}>
          {t('settings.remeasure')}
        </button>
      </p>
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
              title={formatDateReadout(b.day, lang, { yearsPerMinute: 0, stationary: true })}
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

function Stats({ s, t, actions }: { s: UiState; t: T; actions: Actions }) {
  const st = s.stats;
  return (
    <div class="stats" data-testid="stats">
      <strong>{s.stressScene ? t('stress.title') : t('stats.title')}</strong>
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
        <dt>{t('stats.tier')}</dt>
        <dd>{t(`settings.quality.${s.tier}`)}</dd>
      </dl>
      <button class="btn" onClick={() => actions.saveReport()}>
        {t('stats.report')}
      </button>
    </div>
  );
}
