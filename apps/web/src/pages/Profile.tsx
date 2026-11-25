import AvatarImg from '../components/AvatarImg';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { ActivityTab, ProfileHeader } from '../components/ProfileSocial';
import { Download, Film, Trash2, Upload, X, Heart } from 'lucide-react';
import { StatusDot } from '../components/LibraryStatus';
import { LIBRARY_LABEL } from '../lib/library';
import ContinueWatching from '../components/ContinueWatching';
import MediaCard from '../components/MediaCard';
import { ROW_ITEM, ROW_SIZES, Scroller, SectionHeader } from '../components/Row';
import { checkServer, EMBEDS, fetchProviderHealth, HOSTED_SERVER, languageName, normalizeServer } from '../lib/servers';
import { useQuery } from '@tanstack/react-query';
import { detectExtension, extensionFetcher } from '../lib/extension';
import { checkFebboxToken } from '@charcoal/providers';
import { SubtitleStyleControls } from '../player/captions';
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
          </div>
          <div id="library" className={cx(PANEL, 'scroll-mt-4')}>
            <Watchlist />
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
                        <div className="grid h-28 place-items-center rounded-2xl border border-dashed border-white/10 text-sm text-faint">Nothing here yet</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : !of(view).length ? (
              <EmptyCard title={`Nothing in ${LIBRARY_LABEL[view]} yet`} />
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

// ---------- settings ----------

function SettingsSection() {
  const settings = useStore((s) => s.settings);
  const historyCount = useStore((s) => s.history.length);
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [server, setServer] = useState(settings.serverUrl);
  const [serverState, setServerState] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const saveServer = async () => {
    const url = normalizeServer(server);
    if (server.trim() && !url)
      return setServerState({
        ok: false,
        text: 'Enter an address like http://localhost:8080 or https://stream.example.com',
      });
    setServer(url);
    if (!url) {
      actions.updateSettings({ serverUrl: '' });
      return setServerState({
        ok: true,
        text: 'Removed. Charcoal’s own server is used again.',
      });
    }
    setServerState({ ok: true, text: 'Checking…' });
    const r = await checkServer(url);
    if (r.ok) actions.updateSettings({ serverUrl: url });
    setServerState(
      r.ok
        ? {
            ok: true,
            text: `Saved. Your server answered (${r.providers}) and will be used from now on.`,
          }
        : { ok: false, text: `Not saved: ${r.error}.` },
    );
  };

  const download = () => {
    const blob = new Blob([actions.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `charcoal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const card = 'rounded-3xl bg-surface p-5 md:p-6';
  return (
    <section>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className={cx(card, 'space-y-5')}>
          <h3 className="font-medium">Playback</h3>
          <Row label="Default server" hint="Jelly switches to an embedded player automatically if it finds nothing.">
            <select
              value={settings.server}
              onChange={(e) => actions.updateSettings({ server: e.target.value })}
              aria-label="Default server"
              className="h-11 min-w-0 rounded-xl bg-raised px-3 text-base sm:text-sm"
            >
              <option value="jelly">Jelly (direct)</option>
              {EMBEDS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Row>
          <Toggle label="Block pop-ups in embeds" hint="Some servers refuse to play when on" on={settings.blockPopups} onChange={(v) => actions.updateSettings({ blockPopups: v })} />
          <Toggle
            label="Peek at titles on hover"
            hint="Hovering a card shows a small preview beside it. Right-click a card for the preview any time."
            on={settings.hoverPeek}
            onChange={(v) => actions.updateSettings({ hoverPeek: v })}
          />
        </div>

        <div className={cx(card, 'space-y-3')}>
          <h3 className="font-medium">Your own server</h3>
          <p className="text-sm text-muted">
            Optional. Run Charcoal’s server on your computer or a VPS and paste its address. One on your own computer uses your home connection, so more sources play.{' '}
            <a
              href="https://github.com/eyus00/charcoal#run-the-server-yourself-vps-or-your-own-computer"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-white/85 transition-colors hover:text-white"
            >
              How to set one up
            </a>
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveServer();
            }}
          >
            <input
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="http://localhost:8080"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-label="Your server’s address"
              className="h-11 min-w-0 flex-1 rounded-xl bg-raised px-3.5 text-base placeholder:text-faint sm:text-sm"
            />
            <button className={btn({ variant: 'primary' })}>Save</button>
          </form>
          {/* Always mounted, so screen readers announce the result. */}
          <p role="status" className={cx('text-sm empty:hidden', serverState?.ok === false ? 'text-danger' : 'text-success')}>
            {serverState?.text ?? (settings.serverUrl ? `Using ${settings.serverUrl}. If it doesn’t answer, Charcoal’s server takes over.` : '')}
          </p>
          {!settings.serverUrl && !serverState && <p className="text-xs text-faint">Now using Charcoal’s server ({new URL(HOSTED_SERVER).host}).</p>}
        </div>

        <TraktCard className={cx(card, 'space-y-4')} />

        <LetterboxdCard className={cx(card, 'space-y-3')} />

        <HelperCard className={cx(card, 'space-y-3')} />

        <FebboxCard className={cx(card, 'space-y-3')} />

        <div className={cx(card, 'space-y-5')}>
          <h3 className="font-medium">
            Player <span className="text-sm font-normal text-muted">· Jelly player only</span>
          </h3>
          <Row label="Audio language" hint="Sources in it are tried first; streams with several languages switch to it">
            <select
              value={settings.audioLang}
              onChange={(e) => actions.updateSettings({ audioLang: e.target.value })}
              aria-label="Audio language"
              className="h-11 min-w-0 rounded-xl bg-raised px-3 text-base sm:text-sm"
            >
              {[...new Set([settings.audioLang, ...AUDIO_LANGS])].map((c) => (
                <option key={c} value={c}>
                  {languageName(c)}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Anime audio" hint="Sub: the original Japanese audio. Dub: dubbed into your audio language when a source has it">
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
          <Toggle label="Autoplay next episode" on={settings.autoplayNext} onChange={(v) => actions.updateSettings({ autoplayNext: v })} />
          <Toggle label="Skip intros and recaps automatically" hint="Otherwise a Skip button appears" on={settings.autoSkip} onChange={(v) => actions.updateSettings({ autoSkip: v })} />
          <Toggle label="Next episode when the credits start" hint="Starts the autoplay countdown early" on={settings.creditsNext} onChange={(v) => actions.updateSettings({ creditsNext: v })} />
          <Toggle
            label="Continue watching shows where you left off"
            hint="Saves a still from the video in this browser"
            on={settings.frameThumbs}
            onChange={(v) => actions.updateSettings({ frameThumbs: v })}
          />
          <Toggle label="Press and hold for 2× speed" on={settings.holdToSpeed} onChange={(v) => actions.updateSettings({ holdToSpeed: v })} />
          <Toggle
            label="Show source diagnostics"
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
          <Toggle
            label="Warn before switching to an embed"
            hint="Embedded players are other sites, with their own ads"
            on={!settings.embedNoticeOff}
            onChange={(v) => actions.updateSettings({ embedNoticeOff: !v })}
          />
          <p className="text-xs text-muted">
            Intro, recap and credits times come from{' '}
            <a href="https://theintrodb.org" target="_blank" rel="noreferrer" className="font-medium text-white/85 transition-colors hover:text-white">
              TheIntroDB
            </a>
            , a community database; for anime it has nothing on, from{' '}
            <a href="https://aniskip.com" target="_blank" rel="noreferrer" className="font-medium text-white/85 transition-colors hover:text-white">
              AniSkip
            </a>
            .
          </p>
        </div>

        <div className={cx(card, 'space-y-2')}>
          <h3 className="font-medium">Subtitles</h3>
          <p className="text-sm text-muted">In the player you can also load your own .srt / .vtt file, fix the timing (Z / X) and read the transcript.</p>
          <div className="-mx-3">
            <SubtitleStyleControls />
          </div>
        </div>

        <SourceStatus className={cx(card, 'md:col-span-2')} />

        <div className={cx(card, 'space-y-3 md:col-span-2')}>
          <h3 className="font-medium">Your data</h3>
          <p className="text-sm text-muted">History and library are stored only in this browser. Back them up or move them to another device.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={download} className={btn()}>
              <Download className="size-4" strokeWidth={1.5} /> Export
            </button>
            <button onClick={() => file.current?.click()} className={btn()}>
              <Upload className="size-4" strokeWidth={1.5} /> Import
            </button>
            {historyCount > 0 && (
              <button
                onClick={() => {
                  const before = getState().history;
                  actions.clearHistory();
                  toast('Watch history cleared', {
                    label: 'Undo',
                    run: () => actions.restore({ history: before }),
                  });
                }}
                className={cx(btn(), 'bg-danger/10! text-danger! hover:bg-danger/20!')}
              >
                <Trash2 className="size-4" strokeWidth={1.5} /> Clear history
              </button>
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
                  setMsg({
                    ok: true,
                    text: `Imported ${plural(r.history, 'history entry', 'history entries')} and ${plural(r.watchlist, 'library item', 'library items')}.`,
                  });
                } catch {
                  setMsg({
                    ok: false,
                    text: 'That file isn’t a Charcoal backup. Choose a .json file made with Export.',
                  });
                }
              }}
            />
          </div>
          <p role="status" className={cx('text-sm empty:hidden', msg?.ok === false ? 'text-danger' : 'text-success')}>
            {msg?.text ?? ''}
          </p>
        </div>
      </div>
    </section>
  );
}

/** The viewer's own Febbox token: up to 4K originals, found and played through Charcoal Helper. */
function FebboxCard({ className }: { className: string }) {
  const saved = useStore((s) => s.settings.febboxToken);
  const maxHeight = useStore((s) => s.settings.febboxMaxHeight);
  const [value, setValue] = useState(saved);
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const { data: helper } = useQuery({
    queryKey: ['helper'],
    queryFn: () => detectExtension(true),
    staleTime: 0,
    retry: false,
  });
  const save = async () => {
    const token = value.trim().replace(/^ui=/, '').replace(/;.*$/, '');
    setValue(token);
    if (!token) {
      actions.updateSettings({ febboxToken: '' });
      return setState({ ok: true, text: 'Removed.' });
    }
    if (!helper?.hasPermission) {
      actions.updateSettings({ febboxToken: token });
      return setState({
        ok: true,
        text: 'Saved. It’s used once Charcoal Helper is installed and allowed.',
      });
    }
    setState({ ok: true, text: 'Checking with Febbox…' });
    const r = await checkFebboxToken(extensionFetcher, token);
    if (r === 'invalid')
      return setState({
        ok: false,
        text: 'Not saved: Febbox didn’t accept it. Log in to febbox.com again and copy a fresh “ui” cookie.',
      });
    actions.updateSettings({ febboxToken: token });
    setState({
      ok: true,
      text: r === 'ok' ? 'Saved. Febbox accepted it.' : 'Saved (Febbox couldn’t be checked right now).',
    });
  };
  return (
    <div className={className}>
      <h3 className="font-medium">
        Febbox <span className="text-sm font-normal text-muted">· up to 4K</span>
      </h3>
      <p className="text-sm text-muted">
        Original Blu-ray files, often 4K, from your own free Febbox account (100 GB of fast traffic a month). Needs Charcoal Helper. The token stays in this browser and is only sent to febbox.com.
      </p>
      <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted">
        <li>
          Log in at{' '}
          <a href="https://www.febbox.com" target="_blank" rel="noreferrer" className="font-medium text-white/85 transition-colors hover:text-white">
            febbox.com
          </a>{' '}
          (a separate Google account is safest).
        </li>
        <li>Open DevTools → Application (Storage in Firefox) → Cookies → www.febbox.com.</li>
        <li>Copy the value of the “ui” cookie and paste it here. Don’t log out of Febbox afterwards.</li>
      </ol>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="password"
          placeholder={saved ? 'Token saved' : 'Paste the “ui” cookie value'}
          autoComplete="off"
          spellCheck={false}
          aria-label="Febbox token"
          className="h-11 min-w-0 flex-1 rounded-xl bg-raised px-3.5 text-base placeholder:text-faint sm:text-sm"
        />
        <button className={btn({ variant: 'primary' })}>Save</button>
      </form>
      <p role="status" className={cx('text-sm empty:hidden', state?.ok === false ? 'text-danger' : 'text-success')}>
        {state?.text ?? (saved ? 'A token is saved.' : '')}
      </p>
      <Row label="Highest quality" hint={FEBBOX_HOURS[maxHeight]}>
        <select
          value={maxHeight}
          onChange={(e) => actions.updateSettings({ febboxMaxHeight: Number(e.target.value) })}
          aria-label="Highest Febbox quality"
          className="h-11 min-w-0 rounded-xl bg-raised px-3 text-base sm:text-sm"
        >
          <option value={0}>Best possible (up to 4K)</option>
          <option value={1080}>1080p</option>
          <option value={720}>720p (data saver)</option>
        </select>
      </Row>
      <p className="text-xs text-muted">
        The player picks the best quality your connection and screen can take, up to this. Febbox gives each account 100 GB of fast traffic a month; after that it keeps playing, but may buffer more.
      </p>
    </div>
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

function HelperCard({ className }: { className: string }) {
  const useExtension = useStore((s) => s.settings.useExtension);
  const {
    data: info,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['helper'],
    queryFn: () => detectExtension(true),
    staleTime: 0,
    retry: false,
  });
  const state = isLoading ? 'checking' : !info ? 'missing' : !info.hasPermission ? 'permission' : 'ready';
  const TEXT = {
    checking: 'Checking…',
    missing: 'Not installed in this browser.',
    permission: `Installed (v${info?.version}), but it needs access to streaming sites: click its icon in the toolbar and allow it.`,
    ready: `Installed (v${info?.version}) and ready.`,
  } as const;
  return (
    <div className={className}>
      <h3 className="font-medium">Charcoal Helper</h3>
      <p className="text-sm text-muted">
        A browser extension that finds and plays sources from your own connection, with no server in between, so more of them work. For Chrome, Edge, Brave and Firefox on a computer.{' '}
        <a href="https://github.com/eyus00/charcoal/tree/main/apps/extension#install" target="_blank" rel="noreferrer" className="font-medium text-white/85 transition-colors hover:text-white">
          How to install
        </a>
      </p>
      <p role="status" className={cx('flex items-center gap-2 text-sm', state === 'ready' ? 'text-success' : state === 'permission' ? 'text-warning' : 'text-muted')}>
        <span aria-hidden className={cx('size-2 rounded-full', state === 'ready' ? 'bg-success' : state === 'permission' ? 'bg-warning' : 'bg-white/25')} />
        {TEXT[state]}
        {state !== 'checking' && state !== 'ready' && (
          <button onClick={() => refetch()} className="ml-auto text-xs text-white/70 transition-colors hover:text-white">
            Check again
          </button>
        )}
      </p>
      {info && (
        <Toggle label="Use Charcoal Helper" hint="Your own server or Charcoal’s takes over if it finds nothing" on={useExtension} onChange={(v) => actions.updateSettings({ useExtension: v })} />
      )}
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
        <h3 className="font-medium">Sources {serverUrl ? <span className="text-sm font-normal text-muted">· your server</span> : null}</h3>
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
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium">
        {label}
        {hint && <span className="block text-xs font-normal text-muted">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label} hint={hint}>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-raised')}
      >
        <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full transition-transform', on ? 'translate-x-5 bg-black' : 'bg-white')} />
      </button>
    </Row>
  );
}

function EmptyCard({ icon: Icon, title, body }: { icon?: typeof Film; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-raised/50 px-6 py-12 text-center">
      {Icon && <Icon className="mb-1 size-7 text-faint" />}
      <p className="font-medium">{title}</p>
      {body && <p className="max-w-sm text-sm text-pretty text-muted">{body}</p>}
      {Icon && (
        <Link to="/discover" className={cx(btn({ variant: 'primary' }), 'mt-3')}>
          Browse titles
        </Link>
      )}
    </div>
  );
}
