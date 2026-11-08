import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Bookmark, Download, Film, Trash2, Upload, UserCircle, X } from 'lucide-react';
import { StatusDot, StatusTag } from '../components/BookmarkMenu';
import ContinueWatching from '../components/ContinueWatching';
import MediaCard from '../components/MediaCard';
import { Pill, ROW_SIZES, SectionHeader } from '../components/Row';
import { EMBEDS } from '../lib/servers';
import { checkProxy, normalizeProxy } from '../lib/proxy';
import { actions, getState, historyByTitle, useStore, type WatchStatus } from '../lib/store';
import { toast } from '../components/Toast';
import { cx, scrollBehavior, useTitle } from '../lib/util';

/** Fixed container card for each profile section (matches the settings cards). */
/** Fixed-width columns: cards stay the same size as everywhere else instead of stretching. */
const CARD_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,190px)] sm:gap-4 lg:grid-cols-[repeat(auto-fill,216px)]';

/** "1 history entry" / "3 history entries". */
const plural = (n: number, one: string, other: string) => `${n} ${new Intl.PluralRules('en').select(n) === 'one' ? one : other}`;

const PANEL = 'rounded-3xl bg-surface/60 p-4 ring-1 ring-white/[0.06] md:p-6';

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
      { k: 'In watchlist', v: watchlist.length },
    ];
  }, [history, titles.length, watchlist.length]);

  // Library (history + watchlist) or Settings; links like /profile#settings pick the tab.
  const [tab, setTab] = useState<'library' | 'settings'>(hash === '#settings' ? 'settings' : 'library');
  useEffect(() => {
    if (hash === '#settings') setTab('settings');
    else if (hash === '#history' || hash === '#watchlist') setTab('library');
  }, [hash]);

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
      <section id="profile" className="scroll-mt-4 space-y-3">
        <div className="flex items-center gap-4 rounded-3xl bg-surface p-5">
          <div className="grid size-14 place-items-center rounded-2xl bg-raised text-accent">
            <UserCircle className="size-7" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Your profile</h1>
            <p className="text-sm text-muted">Watch history, watchlist and settings, saved in this browser</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.k} className="rounded-2xl bg-surface px-4 py-3.5">
              <div className="text-sm text-muted">{s.k}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{s.v.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex rounded-full bg-surface p-1 sm:inline-flex" role="group" aria-label="Profile sections">
        {(['library', 'settings'] as const).map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={cx('h-10 flex-1 rounded-full px-6 text-sm transition sm:flex-none', tab === t ? 'bg-white font-medium text-black' : 'text-white/75 hover:text-white')}
          >
            {t === 'library' ? 'Library' : 'Settings'}
          </button>
        ))}
      </div>

      {tab === 'library' ? (
        <>
          <div id="history" className={cx(PANEL, 'scroll-mt-4')}>
            {titles.length ? (
              <ContinueWatching items={titles} title="Watch history" />
            ) : (
              <>
                <SectionHeader title="Watch history" />
                <EmptyCard icon={Film} title="Nothing watched yet" body="Movies and episodes you play will show up here." />
              </>
            )}
          </div>
          <div id="watchlist" className={cx(PANEL, 'scroll-mt-4')}>
            <Watchlist />
          </div>
        </>
      ) : (
        <div id="settings" className="scroll-mt-4">
          <SettingsSection />
        </div>
      )}
    </div>
  );
}

// ---------- watchlist ----------

const FILTERS: { id: string; label: string; status?: WatchStatus; type?: 'movie' | 'tv' }[] = [
  { id: 'watching', label: 'Watching', status: 'watching' },
  { id: 'planned', label: 'To watch', status: 'planned' },
  { id: 'completed', label: 'Watched', status: 'completed' },
  { id: 'movie', label: 'Movies', type: 'movie' },
  { id: 'tv', label: 'TV shows', type: 'tv' },
];

function Watchlist() {
  const watchlist = useStore((s) => s.watchlist);
  const [active, setActive] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setActive((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const items = useMemo(() => {
    const statuses = FILTERS.filter((f) => f.status && active.has(f.id)).map((f) => f.status);
    const types = FILTERS.filter((f) => f.type && active.has(f.id)).map((f) => f.type);
    return watchlist.filter((w) => (!statuses.length || statuses.includes(w.status)) && (!types.length || types.includes(w.mediaType)));
  }, [watchlist, active]);

  return (
    <section>
      <SectionHeader title="Watchlist" action={<span className="text-sm text-muted">{plural(watchlist.length, 'item', 'items')}</span>} />
      {!watchlist.length ? (
        <EmptyCard icon={Bookmark} title="Your watchlist is empty" body="Use the bookmark button on any movie or show to save it here." />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2.5">
            {FILTERS.map((f) => (
              <Pill key={f.id} on={active.has(f.id)} onClick={() => toggle(f.id)} className="flex items-center gap-2">
                {f.status && <StatusDot status={f.status} />}
                {f.label}
              </Pill>
            ))}
          </div>
          {!items.length ? (
            <EmptyCard title="No items match these filters" />
          ) : (
            <div className={CARD_GRID}>
              {items.map((w) => (
                <MediaCard
                  key={w.mediaType + w.id}
                  sizes={ROW_SIZES}
                  type={w.mediaType}
                  item={{ id: w.id, title: w.title, poster_path: w.posterPath, backdrop_path: null, overview: '', vote_average: w.ratingScore ?? 0, release_date: w.releaseDate }}
                  badge={<StatusTag status={w.status} />}
                  overlay={
                    <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                      <button
                        onClick={() => {
                          const before = getState().watchlist;
                          actions.removeBookmark(w.mediaType, w.id);
                          toast(`Removed “${w.title}” from your watchlist`, { label: 'Undo', run: () => actions.restore({ watchlist: before }) });
                        }}
                        aria-label={`Remove ${w.title} from watchlist`}
                        title="Remove"
                        className="grid size-6 place-items-center rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          )}
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
  const [proxy, setProxy] = useState(settings.proxyUrl);
  const [proxyState, setProxyState] = useState<{ ok: boolean; text: string } | null>(null);

  const saveProxy = async () => {
    const url = normalizeProxy(proxy);
    if (proxy.trim() && !url) return setProxyState({ ok: false, text: 'Enter a full URL starting with https://' });
    setProxy(url);
    if (!url) {
      actions.updateSettings({ proxyUrl: '' });
      return setProxyState({ ok: true, text: 'Removed. Streams go through Jelly again.' });
    }
    setProxyState({ ok: true, text: 'Checking…' });
    const r = await checkProxy(url);
    if (r.ok) actions.updateSettings({ proxyUrl: url });
    setProxyState(r.ok ? { ok: true, text: 'Saved. The proxy responded and will be used for Jelly streams.' } : { ok: false, text: `Not saved: ${r.error}.` });
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
          <Toggle label="Autoplay next episode" hint="Only in the Jelly player" on={settings.autoplayNext} onChange={(v) => actions.updateSettings({ autoplayNext: v })} />
          <Toggle label="Block pop-ups in embeds" hint="Some servers refuse to play when on" on={settings.blockPopups} onChange={(v) => actions.updateSettings({ blockPopups: v })} />
        </div>

        <div className={cx(card, 'space-y-3')}>
          <h3 className="font-medium">Stream proxy</h3>
          <p className="text-sm text-muted">
            Optional. Paste the URL of your Cloudflare Worker proxy and Jelly streams will load through it instead of Jelly’s own server. Saved in this browser only.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveProxy();
            }}
          >
            <input
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
              placeholder="https://proxy.example.workers.dev"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-label="Stream proxy URL"
              className="h-11 min-w-0 flex-1 rounded-xl bg-raised px-3.5 text-base placeholder:text-faint sm:text-sm"
            />
            <button className="h-11 rounded-xl bg-accent px-5 text-sm font-medium text-black hover:bg-accent-hover">Save</button>
          </form>
          {/* Always mounted, so screen readers announce the result. */}
          <p role="status" className={cx('text-sm empty:hidden', proxyState?.ok === false ? 'text-danger' : 'text-success')}>
            {proxyState?.text ?? (settings.proxyUrl ? `Using ${settings.proxyUrl}` : '')}
          </p>
        </div>

        <div className={cx(card, 'space-y-3 md:col-span-2')}>
          <h3 className="font-medium">Your data</h3>
          <p className="text-sm text-muted">History and watchlist are stored only in this browser. Back them up or move them to another device.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={download} className="flex h-11 items-center gap-2 rounded-xl bg-raised px-4 text-sm hover:bg-line">
              <Download className="size-4" /> Export
            </button>
            <button onClick={() => file.current?.click()} className="flex h-11 items-center gap-2 rounded-xl bg-raised px-4 text-sm hover:bg-line">
              <Upload className="size-4" /> Import
            </button>
            {historyCount > 0 && (
              <button
                onClick={() => {
                  const before = getState().history;
                  actions.clearHistory();
                  toast('Watch history cleared', { label: 'Undo', run: () => actions.restore({ history: before }) });
                }}
                className="flex h-11 items-center gap-2 rounded-xl bg-raised px-4 text-sm text-danger hover:bg-danger/15"
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
                  setMsg({ ok: true, text: `Imported ${plural(r.history, 'history entry', 'history entries')} and ${plural(r.watchlist, 'watchlist item', 'watchlist items')}.` });
                } catch {
                  setMsg({ ok: false, text: 'That file isn’t a Charcoal backup. Choose a .json file made with Export.' });
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
        <Link to="/discover" className="mt-3 h-11 rounded-full bg-white px-5 text-sm leading-[2.75rem] font-medium text-black hover:bg-white/90">
          Browse titles
        </Link>
      )}
    </div>
  );
}
