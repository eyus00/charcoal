import AvatarImg from '../components/AvatarImg';
import { Empty } from '../components/PageHeader';
import SetupGuide from '../components/SetupGuide';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { ActivityTab, ProfileHeader } from '../components/ProfileSocial';
import { CalendarDays, Captions, CheckCircle2, Compass, Database, Download, Film, Heart, Link2, Pencil, Play, Server, Trash2, Upload, X } from 'lucide-react';
import { StatusDot } from '../components/LibraryStatus';
import { LIBRARY_LABEL } from '../lib/library';
import ContinueWatching from '../components/ContinueWatching';
import MediaCard from '../components/MediaCard';
import { ROW_ITEM, ROW_SIZES, RowArrows, Scroller, SectionHeader, useRowScroll } from '../components/Row';
import AiringTile, { AiringTileSkeleton } from '../components/AiringTile';
import { TILE } from '../components/EpisodeTile';
import { startOfDay, useSchedule } from '../lib/schedule';
import { checkServer, EMBEDS, fetchProviderHealth, HOSTED_SERVER, languageName, normalizeServer } from '../lib/servers';
import { useQuery } from '@tanstack/react-query';
import { detectExtension, extensionFetcher, febboxTokenFromHelper } from '../lib/extension';
import { checkFebboxToken } from '@charcoal/providers';
import { SubtitleStyleControls } from '../player/captions';
import AnimeShelfRow from '../components/AnimeShelfRow';
import { actions, getState, historyByTitle, useStore, type WatchStatus, type WatchlistItem } from '../lib/store';
import { toast } from '../components/Toast';
import { startTraktLogin, syncWatchlistNow, traktSignOut, useTraktUser } from '../lib/trakt';
import { importLetterboxd } from '../lib/letterboxd';
import { importTraktHistory } from '../lib/traktData';
import { btn } from '../components/Button';
import { cx, scrollBehavior, useTitle } from '../lib/util';
import { Tip } from '../components/Tip';
import Segmented from '../components/Segmented';

/** Fixed container card for each profile section (matches the settings cards). */
/** Fixed-width columns: cards stay the same size as everywhere else instead of stretching. */
const CARD_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,190px)] sm:gap-4 lg:grid-cols-[repeat(auto-fill,216px)]';

/** "1 history entry" / "3 history entries". */
const plural = (n: number, one: string, other: string) => `${n} ${new Intl.PluralRules('en').select(n) === 'one' ? one : other}`;

/** Common audio languages for the preference (the browser's own is added if missing). */
const AUDIO_LANGS = ['en', 'es', 'fr', 'de', 'it', 'pt', 'hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu', 'ur', 'ja', 'ko', 'zh', 'ar', 'ru', 'tr', 'nl', 'pl', 'sv'];

const PANEL = 'rounded-3xl bg-surface/60 p-4 ring-1 ring-white/[0.06] md:p-6';

const TABS = ['library', 'activity', 'settings'] as const;
type Tab = (typeof TABS)[number];

export default function Profile() {
  useTitle('Profile');
  const { hash } = useLocation();
  const history = useStore((s) => s.history);
  const watchlist = useStore((s) => s.watchlist);
  const titles = useMemo(() => historyByTitle(history).slice(0, 40), [history]);
  const stats = useMemo(() => {
    const secs = history.reduce((n, h) => n + (h.progress?.watched ?? 0), 0);
    return [
      { k: 'Titles watched', v: titles.length },
      { k: 'Episodes & movies', v: history.length },
      { k: 'Hours watched', v: Math.round(secs / 360) / 10 },
      { k: 'In your library', v: watchlist.length },
    ];
  }, [history, titles.length, watchlist.length]);

  // Library / Activity / Friends / Settings: ?tab=friends or links like /profile#settings pick one.
  const [params, setParams] = useSearchParams();
  const fromUrl = (): Tab => {
    const t = params.get('tab');
    if (t && (TABS as readonly string[]).includes(t)) return t as Tab;
    return hash === '#settings' ? 'settings' : 'library';
  };
  const [tab, setTabState] = useState<Tab>(fromUrl);
  useEffect(() => {
    if (hash === '#settings') setTabState('settings');
    else if (hash === '#history' || hash === '#watchlist' || hash === '#library') setTabState('library');
  }, [hash]);
  useEffect(() => {
    const t = params.get('tab');
    if (t && (TABS as readonly string[]).includes(t)) setTabState(t as Tab);
  }, [params]);
  const setTab = (t: Tab) => {
    setTabState(t);
    setParams(t === 'library' ? {} : { tab: t }, { replace: true });
  };

  // Links like /profile#watchlist scroll to and briefly highlight the section.
  useEffect(() => {
    if (!hash || hash === '#profile') return;
    const el = document.querySelector(hash);
    if (!el) return;
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    el.classList.add('highlight');
    const t = setTimeout(() => el.classList.remove('highlight'), 1000);
    return () => clearTimeout(t);
  }, [hash, tab]);

  return (
    <div className="space-y-8 pb-10 md:space-y-10">
      <ProfileHeader local={stats} />

      <div className="no-scrollbar flex overflow-x-auto rounded-full bg-surface p-1 sm:inline-flex" role="group" aria-label="Profile sections">
        {TABS.map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={cx(
              'h-10 flex-1 shrink-0 rounded-full px-5 text-sm capitalize transition sm:flex-none sm:px-6',
              tab === t ? 'bg-white font-medium text-black' : 'text-white/75 hover:text-white',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'library' ? (
        <>
          <div id="history" className={cx(PANEL, 'scroll-mt-4')}>
            {titles.length ? (
              <ContinueWatching items={titles} title="Watch history" bleed={false} />
            ) : (
              <>
                <SectionHeader title="Watch history" />
                <EmptyCard icon={Film} title="Nothing watched yet" body="Movies and episodes you play will show up here." />
              </>
            )}
            <div className="mt-8 empty:hidden">
              <AnimeShelfRow title="Anime outside TMDB" show="history" bleed={false} />
            </div>
          </div>
          <div id="your-shows" className={cx(PANEL, 'scroll-mt-4')}>
            <YourShows />
          </div>
          <div id="library" className={cx(PANEL, 'scroll-mt-4')}>
            <Watchlist />
            <div className="mt-10 empty:hidden">
              <AnimeShelfRow title="Anime outside TMDB" show="library" bleed={false} />
            </div>
          </div>
        </>
      ) : tab === 'activity' ? (
        <ActivityTab />
      ) : (
        <div id="settings" className="scroll-mt-4">
          <SettingsSection />
        </div>
      )}
    </div>
  );
}

// ---------- library (♥) ----------

type View = 'all' | WatchStatus;
const VIEWS: { id: View; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'watching', label: 'Watching' },
  { id: 'planned', label: 'To watch' },
  { id: 'completed', label: 'Watched' },
];
const SECTIONS: WatchStatus[] = ['watching', 'planned', 'completed'];
/** What an empty status says, the same in All and in its own view. */
const NONE: Record<WatchStatus, { icon: typeof Film; title: string; body: string }> = {
  watching: { icon: Play, title: 'Nothing in progress', body: 'Start a movie or show and it shows up here.' },
  planned: { icon: Heart, title: 'Nothing saved for later', body: 'Tap ♥ on a title you haven’t started to keep it here.' },
  completed: { icon: CheckCircle2, title: 'Nothing watched to the end yet', body: 'Movies and shows you finish move here.' },
};

/** A library card: the poster, with a remove button on hover. The section says its status. */
function LibraryCard({ w, className }: { w: WatchlistItem; className?: string }) {
  return (
    <MediaCard
      sizes={ROW_SIZES}
      className={className}
      type={w.mediaType}
      item={{ id: w.id, title: w.title, poster_path: w.posterPath, backdrop_path: null, overview: '', vote_average: w.ratingScore ?? 0, release_date: w.releaseDate }}
      overlay={
        <div className="absolute top-2 right-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <button
            onClick={() => {
              const before = getState().watchlist;
              actions.removeBookmark(w.mediaType, w.id);
              toast(`Removed “${w.title}” from your library`, { label: 'Undo', run: () => actions.restore({ watchlist: before }) });
            }}
            aria-label={`Remove ${w.title} from your library`}
            className="group/tip relative grid size-7 place-items-center rounded-full bg-black/75 hover:bg-black"
          >
            <X className="size-3.5" />
            <Tip label="Remove from your library" side="bottom" align="end" />
          </button>
        </div>
      }
    />
  );
}

/**
 * The library (♥). All: a row per status (Watching, To watch, Watched), full-size posters, each
 * with "See all". Picking a status shows just that, as a grid. Statuses are set as you watch.
 * The area keeps a steady minimum height, so switching never makes the page jump.
 */
function Watchlist() {
  const watchlist = useStore((s) => s.watchlist);
  const [view, setView] = useState<View>('all');
  const of = (st: WatchStatus) => watchlist.filter((w) => w.status === st).sort((a, b) => b.addedAt - a.addedAt);
  const count = (v: View) => (v === 'all' ? watchlist.length : of(v).length);
  // Hold the tallest height seen, so switching views never makes the page jump up and down.
  const area = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const h = el.firstElementChild?.getBoundingClientRect().height ?? 0;
    if (h > parseFloat(el.style.minHeight || '0')) el.style.minHeight = `${Math.ceil(h)}px`;
  });
  return (
    <section>
      <SectionHeader title="Library" />
      {!watchlist.length ? (
        <EmptyCard
          icon={Heart}
          title="Your library is empty"
          body="Tap ♥ on any movie or show to keep it here. Everything you watch is added on its own, and titles here notify you about new episodes."
        />
      ) : (
        <>
          <div className="no-scrollbar mb-6 flex overflow-x-auto">
            <div className="inline-flex shrink-0 rounded-full bg-surface p-1" role="tablist" aria-label="Library">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={view === v.id}
                  onClick={() => setView(v.id)}
                  className={cx(
                    'flex h-10 items-center gap-2 rounded-full px-4 text-sm whitespace-nowrap transition sm:px-5',
                    view === v.id ? 'bg-white font-medium text-black' : 'text-white/75 hover:text-white',
                  )}
                >
                  {v.id !== 'all' && <StatusDot status={v.id} />}
                  {v.label}
                  <span className={cx('text-xs tabular-nums', view === v.id ? 'text-black/50' : 'text-faint')}>{count(v.id)}</span>
                </button>
              ))}
            </div>
          </div>
          <div ref={area}>
            {view === 'all' ? (
              <div className="space-y-10">
                {SECTIONS.map((st) => {
                  const list = of(st);
                  return (
                    <div key={st}>
                      <div className="mb-3 flex items-center gap-3">
                        <h3 className="flex min-w-0 flex-1 items-center gap-2 text-lg font-semibold">
                          <StatusDot status={st} />
                          {LIBRARY_LABEL[st]}
                        </h3>
                        {list.length > 0 && (
                          <button type="button" onClick={() => setView(st)} className="shrink-0 text-sm text-muted transition-colors hover:text-white">
                            See all
                          </button>
                        )}
                      </div>
                      {list.length ? (
                        <Scroller label={LIBRARY_LABEL[st]} bleed={false}>
                          {list.slice(0, 20).map((w) => (
                            <LibraryCard key={w.mediaType + w.id} w={w} className={ROW_ITEM} />
                          ))}
                        </Scroller>
                      ) : (
                        <EmptyCard compact {...NONE[st]} />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : !of(view).length ? (
              <EmptyCard {...NONE[view]} />
            ) : (
              <div className={CARD_GRID}>
                {of(view).map((w) => (
                  <LibraryCard key={w.mediaType + w.id} w={w} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** This week's episodes and streaming days from your library (the Calendar's "Your shows"). */
function YourShows() {
  const start = useMemo(() => startOfDay(new Date()), []);
  const { items, isPending } = useSchedule(start, 7, 8);
  const yours = items.filter((a) => a.yours);
  const { ref, scroll } = useRowScroll();
  return (
    <section>
      <SectionHeader title="Your shows this week" action={yours.length ? <RowArrows onScroll={scroll} /> : undefined} />
      {isPending ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <AiringTileSkeleton key={i} className={TILE} />
          ))}
        </div>
      ) : yours.length ? (
        <Scroller label="Your shows this week" scrollRef={ref} bleed={false}>
          {yours.map((a) => (
            <AiringTile key={a.key} a={a} className={TILE} />
          ))}
        </Scroller>
      ) : (
        <EmptyCard compact icon={CalendarDays} title="Nothing from your shows this week" body="New episodes and streaming days of what’s in your library show up here." />
      )}
    </section>
  );
}

// ---------- settings ----------

/** The settings, by what they're about; a list of sections beside them (a row of them on phones). */
const SETTINGS_NAV = [
  { id: 'set-browsing', label: 'Browsing', icon: Compass },
  { id: 'set-playback', label: 'Playback', icon: Play },
  { id: 'set-subtitles', label: 'Subtitles', icon: Captions },
  { id: 'set-sources', label: 'Sources', icon: Server },
  { id: 'set-accounts', label: 'Accounts', icon: Link2 },
  { id: 'set-data', label: 'Your data', icon: Database },
] as const;

function SettingsSection() {
  const [setupOpen, setSetupOpen] = useState(false);
  const settings = useStore((s) => s.settings);
  const historyCount = useStore((s) => s.history.length);
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [active, setActive] = useState<string>(SETTINGS_NAV[0].id);

  // The section in view is the one marked in the list.
  useEffect(() => {
    const els = SETTINGS_NAV.map((n) => document.getElementById(n.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '-20% 0px -65% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  const go = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  };

  const download = () => {
    const blob = new Blob([actions.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `charcoal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const select = 'h-10 min-w-0 rounded-xl bg-raised px-3 text-base sm:text-sm';
  return (
    <section className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
      {setupOpen && <SetupGuide onClose={() => setSetupOpen(false)} />}
      <nav
        aria-label="Settings sections"
        className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:mb-0 lg:flex-col lg:gap-1 lg:self-start lg:overflow-visible lg:px-0"
      >
        {SETTINGS_NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            aria-current={active === id ? 'true' : undefined}
            className={cx(
              'flex h-10 shrink-0 items-center gap-2.5 rounded-full px-4 text-sm whitespace-nowrap transition-colors lg:rounded-xl lg:px-3',
              active === id ? 'bg-white font-medium text-black' : 'bg-surface text-white/75 hover:text-white lg:bg-transparent lg:hover:bg-white/[0.05]',
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 space-y-12">
        <SettingsGroup id="set-browsing" title="Browsing" body="How titles are shown around the app.">
          <Toggle
            label="Peek at titles on hover"
            hint="Hovering a card shows a small preview beside it. Right-click a card for it any time."
            on={settings.hoverPeek}
            onChange={(v) => actions.updateSettings({ hoverPeek: v })}
          />
          <Row label="New shows start at" hint="Where the episode list of a show you haven’t started opens, and what Play starts. After that it opens where you left off.">
            <select value={settings.episodeStart} onChange={(e) => actions.updateSettings({ episodeStart: e.target.value as 'latest' | 'first' })} aria-label="New shows start at" className={select}>
              <option value="latest">The latest episode</option>
              <option value="first">Season 1, episode 1</option>
            </select>
          </Row>
          <Toggle
            label="Show where you stopped"
            hint="Continue watching cards show the frame you stopped at (saved in this browser)"
            on={settings.frameThumbs}
            onChange={(v) => actions.updateSettings({ frameThumbs: v })}
          />
        </SettingsGroup>

        <SettingsGroup id="set-playback" title="Playback" body="What plays, in which language, and what happens around it.">
          <Row label="Default player" hint="Jelly is Charcoal’s own. It switches to an embedded player by itself if it finds nothing.">
            <select value={settings.server} onChange={(e) => actions.updateSettings({ server: e.target.value })} aria-label="Default player" className={select}>
              <option value="jelly">Jelly (recommended)</option>
              {EMBEDS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Audio language" hint="Sources in it are tried first; streams with several languages switch to it">
            <select value={settings.audioLang} onChange={(e) => actions.updateSettings({ audioLang: e.target.value })} aria-label="Audio language" className={select}>
              {[...new Set([settings.audioLang, ...AUDIO_LANGS])].map((c) => (
                <option key={c} value={c}>
                  {languageName(c)}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Anime audio" hint="Sub: the original Japanese audio. Dub: dubbed into your audio language when there is one">
            <Segmented
              value={settings.animeAudio}
              options={[
                { key: 'sub', label: 'Sub' },
                { key: 'dub', label: 'Dub' },
              ]}
              onChange={(v) => actions.updateSettings({ animeAudio: v })}
              label="Anime audio"
              compact
            />
          </Row>
          <Toggle label="Autoplay the next episode" on={settings.autoplayNext} onChange={(v) => actions.updateSettings({ autoplayNext: v })} />
          <Toggle
            label="Next episode when the credits start"
            hint="Starts the autoplay countdown at the credits"
            on={settings.creditsNext}
            onChange={(v) => actions.updateSettings({ creditsNext: v })}
          />
          <Toggle label="Skip intros and recaps by themselves" hint="Otherwise a Skip button appears" on={settings.autoSkip} onChange={(v) => actions.updateSettings({ autoSkip: v })} />
          <Toggle label="Press and hold for 2× speed" on={settings.holdToSpeed} onChange={(v) => actions.updateSettings({ holdToSpeed: v })} />
          <SettingsNote>
            Intro, recap and credits times come from{' '}
            <a href="https://theintrodb.org" target="_blank" rel="noreferrer" className="text-white/80 hover:text-white">
              TheIntroDB
            </a>{' '}
            and, for anime,{' '}
            <a href="https://aniskip.com" target="_blank" rel="noreferrer" className="text-white/80 hover:text-white">
              AniSkip
            </a>
            . These apply to the Jelly player.
          </SettingsNote>
        </SettingsGroup>

        <SettingsGroup id="set-subtitles" title="Subtitles" body="How subtitles look. In the player you can also load your own .srt / .vtt file, shift the timing (Z / X) and read the transcript.">
          <Toggle
            label="Find subtitles for every title"
            hint="From OpenSubtitles, beside the ones a source comes with (tagged Source)"
            on={settings.findSubtitles}
            onChange={(v) => actions.updateSettings({ findSubtitles: v })}
          />
          <div className="px-1 py-2">
            <SubtitleStyleControls />
          </div>
        </SettingsGroup>

        <SettingsGroup
          id="set-sources"
          title="Sources"
          body="Where streams are found. Charcoal Helper and Febbox bring more of them, faster and up to 4K."
          action={
            <button type="button" onClick={() => setSetupOpen(true)} className={cx(btn(), 'h-9 px-4 text-sm')}>
              Run setup
            </button>
          }
        >
          <HelperRow />
          <FebboxRows />
          <ServerRow />
          <Toggle label="Block pop-ups in embedded players" hint="Some of them refuse to play while it’s on" on={settings.blockPopups} onChange={(v) => actions.updateSettings({ blockPopups: v })} />
          <Toggle
            label="Warn before switching to an embedded player"
            hint="They are other sites, with their own ads"
            on={!settings.embedNoticeOff}
            onChange={(v) => actions.updateSettings({ embedNoticeOff: !v })}
          />
          <Toggle
            label="Show source details in the player"
            hint="Where sources came from, and why others had none"
            on={settings.showDiagnostics}
            onChange={(v) => actions.updateSettings({ showDiagnostics: v })}
          />
          <Toggle
            label="Help keep sources working"
            hint="Tells Charcoal’s server how each source did here (its name, result and timing; never what you watched)"
            on={settings.shareHealth}
            onChange={(v) => actions.updateSettings({ shareHealth: v })}
          />
        </SettingsGroup>
        <SourceStatus className="rounded-3xl bg-surface p-5 md:p-6" />

        <SettingsGroup id="set-accounts" title="Accounts" body="Other services Charcoal can work with.">
          <TraktCard className="space-y-4 px-4 py-4" />
          <LetterboxdCard className="space-y-3 px-4 py-4" />
        </SettingsGroup>

        <SettingsGroup id="set-data" title="Your data" body="History, library and settings are kept only in this browser. Back them up or move them to another device.">
          <Row label="Back up" hint="A file with your history, library and settings">
            <button onClick={download} className={cx(btn(), 'h-9 px-4 text-sm')}>
              <Download className="size-4" strokeWidth={1.5} /> Export
            </button>
          </Row>
          <Row label="Restore" hint="Adds what’s in a Charcoal backup file">
            <button onClick={() => file.current?.click()} className={cx(btn(), 'h-9 px-4 text-sm')}>
              <Upload className="size-4" strokeWidth={1.5} /> Import
            </button>
          </Row>
          {historyCount > 0 && (
            <Row label="Clear watch history" hint={`${plural(historyCount, 'entry', 'entries')}; you can undo it right after`}>
              <button
                onClick={() => {
                  const before = getState().history;
                  actions.clearHistory();
                  toast('Watch history cleared', { label: 'Undo', run: () => actions.restore({ history: before }) });
                }}
                className={cx(btn(), 'h-9 bg-danger/10! px-4 text-sm text-danger! hover:bg-danger/20!')}
              >
                <Trash2 className="size-4" strokeWidth={1.5} /> Clear
              </button>
            </Row>
          )}
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const r = actions.importData(await f.text());
                setMsg({ ok: true, text: `Imported ${plural(r.history, 'history entry', 'history entries')} and ${plural(r.watchlist, 'library item', 'library items')}.` });
              } catch {
                setMsg({ ok: false, text: 'That file isn’t a Charcoal backup. Choose a .json file made with Export.' });
              }
            }}
          />
          {msg && (
            <p role="status" className={cx('px-4 py-3 text-sm', msg.ok ? 'text-success' : 'text-danger')}>
              {msg.text}
            </p>
          )}
        </SettingsGroup>
      </div>
    </section>
  );
}

/** One settings section: a heading, a line on what's in it, and its rows in one card. */
function SettingsGroup({ id, title, body, action, children }: { id: string; title: string; body?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24">
      <div className="mb-3 flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <h3 id={`${id}-h`} className="text-lg font-semibold tracking-tight">
            {title}
          </h3>
          {body && <p className="mt-0.5 text-sm text-pretty text-muted">{body}</p>}
        </div>
        {action}
      </div>
      <div className="divide-y divide-white/[0.06] rounded-3xl bg-surface px-1 ring-1 ring-white/[0.04]">{children}</div>
    </section>
  );
}

const SettingsNote = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-3 text-xs text-pretty text-muted">{children}</p>;

/**
 * A saved value shown read-only, with a pencil to change it: the field (and Save / Cancel) appear
 * only while editing, so a stray tap can't change it.
 */
function LockedField({
  label,
  hint,
  shown,
  initial,
  placeholder,
  secret,
  inputMode,
  onSave,
  extra,
  status,
}: {
  label: string;
  hint?: string;
  /** What's shown while not editing. */
  shown: React.ReactNode;
  /** The value the field starts with when editing. */
  initial: string;
  placeholder: string;
  secret?: boolean;
  inputMode?: 'url' | 'text';
  /** Returns false (with a message shown by the caller) to stay in editing. */
  onSave: (value: string) => Promise<boolean>;
  /** Shown beside the pencil (e.g. Remove), only while not editing. */
  extra?: React.ReactNode;
  status?: { ok: boolean; text: string } | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  const save = async () => {
    setBusy(true);
    const ok = await onSave(value).finally(() => setBusy(false));
    if (ok) setEditing(false);
  };
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          {!editing && <div className="mt-0.5 truncate text-sm text-muted">{shown}</div>}
          {!editing && hint && <p className="text-xs text-faint">{hint}</p>}
        </div>
        {!editing && (
          <div className="flex shrink-0 items-center gap-1.5">
            {extra}
            <button
              type="button"
              onClick={() => {
                setValue(initial);
                setEditing(true);
              }}
              aria-label={`Edit ${label.toLowerCase()}`}
              className={cx(btn({ icon: true }), 'group/tip relative size-9')}
            >
              <Pencil className="size-4" strokeWidth={1.75} />
              <Tip label="Edit" side="bottom" align="end" />
            </button>
          </div>
        )}
      </div>
      {editing && (
        <form
          className="mt-2.5 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(false))}
        >
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type={secret ? 'password' : 'text'}
            inputMode={inputMode}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            aria-label={label}
            className="h-10 min-w-0 flex-1 basis-56 rounded-xl bg-raised px-3.5 text-base placeholder:text-faint sm:text-sm"
          />
          <button type="button" onClick={() => setEditing(false)} className={cx(btn(), 'h-10 px-4 text-sm')}>
            Cancel
          </button>
          <button disabled={busy} className={cx(btn({ variant: 'primary' }), 'h-10 px-5 text-sm disabled:opacity-50')}>
            {busy ? 'Checking…' : 'Save'}
          </button>
        </form>
      )}
      {status && (
        <p role="status" className={cx('mt-2 text-sm', status.ok ? 'text-success' : 'text-danger')}>
          {status.text}
        </p>
      )}
    </div>
  );
}

/** Your own resolver server: read-only until edited. */
function ServerRow() {
  const serverUrl = useStore((s) => s.settings.serverUrl);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <LockedField
      label="Server"
      hint={serverUrl ? 'If it doesn’t answer, Charcoal’s server takes over.' : 'Optional: run Charcoal’s server on your computer or a VPS (more sources play from a home connection).'}
      shown={serverUrl ? <span className="text-white/85">{serverUrl}</span> : <>Charcoal’s server ({new URL(HOSTED_SERVER).host})</>}
      initial={serverUrl}
      placeholder="http://localhost:8080"
      inputMode="url"
      status={status}
      extra={
        serverUrl ? (
          <button
            type="button"
            onClick={() => {
              actions.updateSettings({ serverUrl: '' });
              setStatus({ ok: true, text: 'Charcoal’s own server is used again.' });
            }}
            className={cx(btn({ variant: 'ghost' }), 'h-9 px-3 text-sm')}
          >
            Use Charcoal’s
          </button>
        ) : (
          <a href="https://github.com/eyus00/charcoal#run-the-server-yourself-vps-or-your-own-computer" target="_blank" rel="noreferrer" className={cx(btn({ variant: 'ghost' }), 'h-9 px-3 text-sm')}>
            How
          </a>
        )
      }
      onSave={async (raw) => {
        const url = normalizeServer(raw);
        if (raw.trim() && !url) {
          setStatus({ ok: false, text: 'Enter an address like http://localhost:8080 or https://stream.example.com' });
          return false;
        }
        if (!url) {
          actions.updateSettings({ serverUrl: '' });
          setStatus({ ok: true, text: 'Charcoal’s own server is used again.' });
          return true;
        }
        const r = await checkServer(url);
        if (!r.ok) {
          setStatus({ ok: false, text: `Not saved: ${r.error}.` });
          return false;
        }
        actions.updateSettings({ serverUrl: url });
        setStatus({ ok: true, text: `Saved. Your server answered (${r.providers}).` });
        return true;
      }}
    />
  );
}

/** Charcoal Helper: is it installed and allowed, and should Charcoal use it. */
function HelperRow() {
  const useExtension = useStore((s) => s.settings.useExtension);
  const { data: info, isLoading, refetch } = useQuery({ queryKey: ['helper'], queryFn: () => detectExtension(true), staleTime: 0, retry: false });
  const state = isLoading ? 'checking' : !info ? 'missing' : !info.hasPermission ? 'permission' : 'ready';
  const TEXT = {
    checking: 'Checking…',
    missing: 'Not installed in this browser',
    permission: `Installed (${info?.version}), but its site access is off: click its icon in the toolbar and allow it`,
    ready: `Installed (${info?.version}) and ready`,
  } as const;
  return (
    <Row label="Charcoal Helper" hint="A browser extension: sources are found and played from your own connection, so more of them work.">
      <span className="flex shrink-0 items-center gap-3">
        <span className={cx('flex items-center gap-1.5 text-xs', state === 'ready' ? 'text-success' : state === 'permission' ? 'text-warning' : 'text-muted')} title={TEXT[state]}>
          <span aria-hidden className={cx('size-2 rounded-full', state === 'ready' ? 'bg-success' : state === 'permission' ? 'bg-warning' : 'bg-white/25')} />
          <span className="hidden sm:inline">{state === 'ready' ? `On · ${info?.version}` : state === 'permission' ? 'Needs access' : state === 'missing' ? 'Not installed' : 'Checking'}</span>
        </span>
        {info ? (
          <SwitchButton label="Use Charcoal Helper" on={useExtension} onChange={(v) => actions.updateSettings({ useExtension: v })} />
        ) : (
          state !== 'checking' && (
            <button onClick={() => refetch()} className={cx(btn({ variant: 'ghost' }), 'h-9 px-3 text-sm')}>
              Check again
            </button>
          )
        )}
      </span>
    </Row>
  );
}

/** The viewer's own Febbox token (read-only until edited) and its quality cap. */
function FebboxRows() {
  const saved = useStore((s) => s.settings.febboxToken);
  const maxHeight = useStore((s) => s.settings.febboxMaxHeight);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const keep = async (raw: string): Promise<boolean> => {
    const token = raw.trim().replace(/^ui=/, '').replace(/;.*$/, '');
    if (!token) {
      actions.updateSettings({ febboxToken: '' });
      setStatus({ ok: true, text: 'Removed.' });
      return true;
    }
    const r = await checkFebboxToken(extensionFetcher, token).catch(() => 'unknown' as const);
    if (r === 'invalid') {
      setStatus({ ok: false, text: 'Febbox didn’t accept it. Sign in to febbox.com again and use a fresh token.' });
      return false;
    }
    actions.updateSettings({ febboxToken: token });
    setStatus({ ok: true, text: r === 'ok' ? 'Saved. Febbox accepted it.' : 'Saved (Febbox couldn’t be checked right now).' });
    return true;
  };
  const grab = async () => {
    setGrabbing(true);
    try {
      const token = await febboxTokenFromHelper();
      if (!token) setStatus({ ok: false, text: 'Not signed in to febbox.com in this browser. Sign in there, then try again.' });
      else await keep(token);
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setGrabbing(false);
    }
  };
  return (
    <>
      <LockedField
        label="Febbox"
        hint="Original files, often 4K, from your own free Febbox account. Stays in this browser; only sent to febbox.com."
        shown={saved ? <span className="text-white/85">Connected · token ••••{saved.slice(-4)}</span> : 'Not connected'}
        initial=""
        placeholder={saved ? 'Paste a new “ui” cookie value' : 'Paste the “ui” cookie value from febbox.com'}
        secret
        status={status}
        extra={
          <>
            {!saved && (
              <button type="button" onClick={grab} disabled={grabbing} className={cx(btn({ variant: 'ghost' }), 'h-9 px-3 text-sm disabled:opacity-50')}>
                {grabbing ? 'Getting it…' : 'Get from Febbox'}
              </button>
            )}
            {saved && (
              <button
                type="button"
                onClick={() => {
                  actions.updateSettings({ febboxToken: '' });
                  setStatus({ ok: true, text: 'Removed.' });
                }}
                className={cx(btn({ variant: 'ghost' }), 'h-9 px-3 text-sm')}
              >
                Remove
              </button>
            )}
          </>
        }
        onSave={keep}
      />
      {saved && (
        <Row label="Febbox quality" hint={FEBBOX_HOURS[maxHeight]}>
          <select
            value={maxHeight}
            onChange={(e) => actions.updateSettings({ febboxMaxHeight: Number(e.target.value) })}
            aria-label="Highest Febbox quality"
            className="h-10 min-w-0 rounded-xl bg-raised px-3 text-base sm:text-sm"
          >
            <option value={0}>Best (up to 4K)</option>
            <option value={1080}>1080p</option>
            <option value={720}>720p (data saver)</option>
          </select>
        </Row>
      )}
    </>
  );
}

/** Roughly how far 100 GB goes at each cap (typical Febbox bitrates; each file differs). */
const FEBBOX_HOURS: Record<number, string> = {
  0: '100 GB ≈ 14 h at 4K, or 40 h at 1080p',
  1080: '100 GB ≈ 40 hours (about 20 movies)',
  720: '100 GB ≈ 80 hours',
};

/** Charcoal Helper: is it installed and allowed, and should Charcoal use it. */
function TraktCard({ className }: { className: string }) {
  const user = useTraktUser();
  const settings = useStore((s) => s.settings);
  const [syncing, setSyncing] = useState(false);
  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await syncWatchlistNow();
      toast(r.added || r.sent ? `Watchlist synced: ${r.added} added here, ${r.sent} sent to Trakt` : 'Watchlist already in sync');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };
  const [importing, setImporting] = useState(false);
  const importHistory = async () => {
    setImporting(true);
    try {
      const r = await importTraktHistory();
      toast(
        r.added ? `Added ${plural(r.added, 'title', 'titles')} from Trakt to your history` : 'Your history already has everything from Trakt',
        r.added ? { label: 'Undo', run: () => actions.restore({ history: r.before }) } : undefined,
      );
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setImporting(false);
    }
  };
  return (
    <div className={className}>
      <h3 className="font-medium">
        Trakt <span className="text-sm font-normal text-muted">· ratings, comments, history</span>
      </h3>
      {user ? (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-raised/60 p-3">
            {user.avatar ? (
              <AvatarImg src={user.avatar} name={user.username} className="size-10" />
            ) : (
              <span className="grid size-10 place-items-center rounded-full bg-white/10 font-medium uppercase">{user.username.slice(0, 1)}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name || user.username}</p>
              <a href={`https://trakt.tv/users/${user.username}`} target="_blank" rel="noreferrer" className="group/tip relative text-xs text-muted transition-colors hover:text-white">
                @{user.username} on Trakt
                <Tip label="Open your profile on trakt.tv" side="bottom" align="start" />
              </a>
            </div>
            <button
              type="button"
              onClick={() => {
                traktSignOut();
                toast('Disconnected from Trakt');
              }}
              className={cx(btn(), 'h-9 px-4 text-sm')}
            >
              Disconnect
            </button>
          </div>
          <Toggle
            label="Mark what you watch on Trakt"
            hint="The Jelly player tells Trakt what's playing; finished titles count as watched"
            on={settings.traktScrobble}
            onChange={(v) => actions.updateSettings({ traktScrobble: v })}
          />
          <Toggle
            label="Sync with your Trakt watchlist"
            hint="Unwatched titles in your library and your Trakt watchlist stay in step"
            on={settings.traktSyncWatchlist}
            onChange={(v) => actions.updateSettings({ traktSyncWatchlist: v })}
          />
          <div className="flex flex-wrap gap-2">
            {settings.traktSyncWatchlist && (
              <button type="button" onClick={syncNow} disabled={syncing} className={cx(btn(), 'h-9 px-4 text-sm disabled:opacity-50')}>
                {syncing ? 'Syncing…' : 'Sync watchlist'}
              </button>
            )}
            <button type="button" onClick={importHistory} disabled={importing} className={cx(btn(), 'group/tip relative h-9 px-4 text-sm disabled:opacity-50')}>
              {importing ? 'Importing…' : 'Import watch history'}
              <Tip label="Adds what you watched on Trakt to your history here" side="bottom" />
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Connect your Trakt account to rate titles and post comments that everyone on Trakt sees, mark what you watch automatically, and keep your watchlist in step. Signing in happens on trakt.tv;
            Charcoal never sees your password, and the sign-in stays in this browser.
          </p>
          <button type="button" onClick={() => startTraktLogin('/profile#settings')} className={btn({ variant: 'primary' })}>
            Connect Trakt
          </button>
        </>
      )}
    </div>
  );
}

function LetterboxdCard({ className }: { className: string }) {
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const run = async (files: File[]) => {
    if (!files.length) return;
    const before = getState().watchlist;
    try {
      const r = await importLetterboxd(files, (done, total) => setProgress({ done, total }));
      const missed = r.notFound.length ? `, ${r.notFound.length} not found` : '';
      toast(
        `Imported ${r.added} films from Letterboxd${r.skipped ? ` (${r.skipped} already here)` : ''}${missed}`,
        r.added ? { label: 'Undo', run: () => actions.restore({ watchlist: before }) } : undefined,
      );
    } catch {
      toast('Couldn’t read those files. Pick watchlist.csv or watched.csv from your Letterboxd export.');
    } finally {
      setProgress(null);
    }
  };
  return (
    <div className={className}>
      <h3 className="font-medium">
        Letterboxd <span className="text-sm font-normal text-muted">· import</span>
      </h3>
      <p className="text-sm text-muted">
        Bring your Letterboxd films in: your watchlist becomes “To watch” and what you’ve watched becomes “Watched”. On letterboxd.com go to Settings → Data → Export your data, unzip it, then pick{' '}
        <span className="text-white/85">watchlist.csv</span> and <span className="text-white/85">watched.csv</span>.
      </p>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          run(files);
        }}
      />
      <button type="button" onClick={() => input.current?.click()} disabled={!!progress} className={cx(btn(), 'disabled:opacity-60')}>
        <Upload className="size-4" />
        {progress ? `Importing ${progress.done} of ${progress.total}…` : 'Choose files'}
      </button>
    </div>
  );
}

/** Which of Jelly's sources are working right now (from its provider health table). */
function SourceStatus({ className }: { className: string }) {
  const serverUrl = useStore((s) => s.settings.serverUrl);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['provider-health', serverUrl],
    queryFn: ({ signal }) => fetchProviderHealth(signal),
    staleTime: 30_000,
    retry: false,
  });
  const DOT = {
    ok: 'bg-success',
    failing: 'bg-warning',
    benched: 'bg-danger',
    unknown: 'bg-white/25',
  } as const;
  const LABEL = {
    ok: 'Working',
    failing: 'Failing',
    benched: 'Resting',
    unknown: '',
  } as const;
  const list = (data ?? []).slice().sort((a, b) => ['ok', 'failing', 'unknown', 'benched'].indexOf(a.status) - ['ok', 'failing', 'unknown', 'benched'].indexOf(b.status));
  return (
    <div className={cx(className, 'space-y-3')}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">How sources are doing {serverUrl ? <span className="text-sm font-normal text-muted">· your server</span> : null}</h3>
        <button onClick={() => refetch()} disabled={isFetching} className={btn({ variant: 'ghost' })}>
          {isFetching ? 'Checking…' : 'Refresh'}
        </button>
      </div>
      <p className="text-sm text-muted">How each source did since the server last restarted. One that keeps failing rests for a while so it doesn’t slow down playback.</p>
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !list.length ? (
        <p className="text-sm text-muted">{data === null || data === undefined ? 'The server didn’t answer. It may be starting up.' : 'No requests yet. Play something first.'}</p>
      ) : (
        <ul className="grid gap-x-10 md:grid-cols-2 [&>li]:border-b [&>li]:border-white/[0.06]">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2 text-sm" title={p.lastError}>
              <span aria-hidden className={cx('size-2 shrink-0 rounded-full', DOT[p.status])} />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-xs text-muted tabular-nums">
                {LABEL[p.status] || (p.empty ? 'Had nothing so far' : 'Not tried yet')}
                {p.status === 'benched' && p.benchedForSeconds ? ` · ${Math.ceil(p.benchedForSeconds / 60)} min` : ''}
                {p.success ? ` · ${p.success} found` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    // Narrow screens: a control that doesn't fit beside the label moves under it, to the right.
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2.5 px-4 py-3.5">
      <span className="min-w-0 flex-1 basis-56 text-sm font-medium">
        {label}
        {hint && <span className="mt-0.5 block text-xs font-normal text-pretty text-muted">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function SwitchButton({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-raised')}
    >
      <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full transition-transform', on ? 'translate-x-5 bg-black' : 'bg-white')} />
    </button>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label} hint={hint}>
      <SwitchButton label={label} on={on} onChange={onChange} />
    </Row>
  );
}

/** The app's one empty state; with an icon, it offers a way to find something to watch. */
function EmptyCard({ icon, title, body, compact }: { icon?: typeof Film; title: string; body?: string; compact?: boolean }) {
  return (
    <Empty
      icon={icon}
      title={title}
      body={body}
      compact={compact}
      action={
        icon && !compact ? (
          <Link to="/discover" className={btn({ variant: 'primary' })}>
            Browse titles
          </Link>
        ) : undefined
      }
    />
  );
}
