import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Bookmark, Download, Film, Settings, Trash2, Tv, Upload, UserCircle, X } from 'lucide-react';
import { STATUS_DOT, STATUS_LABEL } from '../components/BookmarkMenu';
import ContinueWatching from '../components/ContinueWatching';
import MediaCard from '../components/MediaCard';
import { ROW_ITEM, ROW_SIZES, Scroller, SectionHeader } from '../components/Row';
import { EMBEDS } from '../lib/servers';
import { checkProxy, normalizeProxy } from '../lib/proxy';
import { actions, historyByTitle, useStore, type WatchStatus } from '../lib/store';
import { cx, useTitle } from '../lib/util';

export default function Profile() {
  useTitle('Profile');
  const { hash } = useLocation();
  const history = useStore((s) => s.history);
  const titles = useMemo(() => historyByTitle(history).slice(0, 40), [history]);

  // Old behaviour: links like /profile#watchlist scroll to and flash the section.
  useEffect(() => {
    if (!hash) return;
    const el = document.querySelector(hash);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('highlight');
    const t = setTimeout(() => el.classList.remove('highlight'), 1000);
    return () => clearTimeout(t);
  }, [hash]);

  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-10 md:space-y-16">
      <div id="profile" className="flex scroll-mt-24 items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] p-4 md:p-8">
        <div className="flex items-center gap-4 md:gap-8">
          <div className="grid size-16 place-items-center rounded-xl border border-accent/20 bg-accent/10 md:size-28 md:rounded-3xl">
            <UserCircle className="size-10 text-accent md:size-16" />
          </div>
          <div>
            <h1 className="mb-1 text-xl font-black tracking-tight md:mb-2 md:text-4xl">Your Profile</h1>
            <p className="max-w-[220px] text-[11px] leading-relaxed font-medium text-white/40 md:max-w-md md:text-sm">
              Track your watching history and manage your preferences
            </p>
          </div>
        </div>
      </div>

      <div id="history" className="scroll-mt-24">
        {titles.length ? (
          <ContinueWatching items={titles} title="Watch History" subtitle={`${titles.length} title${titles.length === 1 ? '' : 's'}`} />
        ) : (
          <>
            <SectionHeader icon={Film} title="Watch History" />
            <EmptyCard icon={Film} title="Nothing watched yet" body="Movies and episodes you play will show up here." />
          </>
        )}
      </div>

      <div id="watchlist" className="scroll-mt-24">
        <Watchlist />
      </div>

      <div id="settings" className="scroll-mt-24">
        <SettingsSection />
      </div>
    </div>
  );
}

// ---------- watchlist ----------

const FILTERS: { id: string; label: string; status?: WatchStatus; type?: 'movie' | 'tv' }[] = [
  { id: 'watching', label: 'Watching', status: 'watching' },
  { id: 'planned', label: 'To Watch', status: 'planned' },
  { id: 'completed', label: 'Watched', status: 'completed' },
  { id: 'movie', label: 'Movies', type: 'movie' },
  { id: 'tv', label: 'TV Shows', type: 'tv' },
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
      <SectionHeader icon={Bookmark} title="Watchlist" subtitle={`${watchlist.length} item${watchlist.length === 1 ? '' : 's'}`} />
      {!watchlist.length ? (
        <EmptyCard icon={Bookmark} title="Your watchlist is empty" body="Add movies and TV shows to keep track of what you want to watch" />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2 px-1 md:mb-8 md:gap-3">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                aria-pressed={active.has(f.id)}
                onClick={() => toggle(f.id)}
                className={cx(
                  'flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-bold tracking-wider whitespace-nowrap uppercase transition md:px-4 md:py-2.5 md:text-sm',
                  active.has(f.id) ? 'border-accent/60 bg-accent text-white shadow-lg shadow-accent/20' : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10',
                )}
              >
                {f.type === 'movie' ? <Film className="size-3.5 md:size-4" /> : f.type === 'tv' ? <Tv className="size-3.5 md:size-4" /> : <span className={cx('size-2 rounded-full', STATUS_DOT[f.status!])} />}
                {f.label}
              </button>
            ))}
          </div>
          {!items.length ? (
            <EmptyCard title="No items match your filters" />
          ) : (
            <Scroller label="Watchlist">
              {items.map((w) => (
                <MediaCard
                  key={w.mediaType + w.id}
                  className={ROW_ITEM}
                  sizes={ROW_SIZES}
                  type={w.mediaType}
                  item={{ id: w.id, title: w.title, poster_path: w.posterPath, backdrop_path: null, overview: '', vote_average: w.ratingScore ?? 0, release_date: w.releaseDate }}
                  badge={
                    <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/70 px-2 py-1 text-[10px] font-bold tracking-wider uppercase shadow-lg">
                      <span className={cx('size-2 rounded-full', STATUS_DOT[w.status])} />
                      {STATUS_LABEL[w.status]}
                    </span>
                  }
                  overlay={
                    <div className="absolute right-3.5 bottom-14 flex flex-col gap-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                      <label className="relative grid size-8 cursor-pointer place-items-center rounded-full border border-white/10 bg-black/75 hover:bg-white/20" title="Change status">
                        <span className={cx('size-2.5 rounded-full', STATUS_DOT[w.status])} />
                        <select
                          aria-label={`Status for ${w.title}`}
                          value={w.status}
                          onChange={(e) => actions.setBookmark({ ...w, status: e.target.value as WatchStatus })}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        >
                          {(Object.keys(STATUS_LABEL) as WatchStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={() => actions.removeBookmark(w.mediaType, w.id)}
                        aria-label={`Remove ${w.title} from watchlist`}
                        title="Remove"
                        className="grid size-8 place-items-center rounded-full border border-white/10 bg-black/75 hover:bg-accent"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  }
                />
              ))}
            </Scroller>
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
  const [confirmClear, setConfirmClear] = useState(false);

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
    setProxyState(r.ok ? { ok: true, text: 'Saved. The proxy responded and will be used for Jelly streams.' } : { ok: false, text: `Not saved: ${r.error}` });
  };

  const download = () => {
    const blob = new Blob([actions.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `charcoal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const card = 'rounded-2xl border border-white/5 bg-white/[0.03] p-4 md:rounded-3xl md:p-6';
  return (
    <section>
      <SectionHeader icon={Settings} title="Settings" subtitle="Playback and data" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className={cx(card, 'space-y-5')}>
          <h3 className="text-sm font-black tracking-widest text-white/50 uppercase">Playback</h3>
          <Row label="Default server" hint="Jelly switches to an embedded player automatically if it finds nothing.">
            <select
              value={settings.server}
              onChange={(e) => actions.updateSettings({ server: e.target.value })}
              className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
            >
              <option value="jelly">Jelly (direct)</option>
              {EMBEDS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Row>
          <Toggle label="Autoplay next episode" hint="Jelly player" on={settings.autoplayNext} onChange={(v) => actions.updateSettings({ autoplayNext: v })} />
          <Toggle label="Block pop-ups in embeds" hint="Some servers refuse to play when on" on={settings.blockPopups} onChange={(v) => actions.updateSettings({ blockPopups: v })} />
        </div>

        <div className={cx(card, 'space-y-3')}>
          <h3 className="text-sm font-black tracking-widest text-white/50 uppercase">Stream proxy</h3>
          <p className="text-sm text-white/50">
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
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none placeholder:text-white/30 focus:border-white/30"
            />
            <button className="h-10 rounded-xl bg-accent px-4 text-sm font-bold hover:bg-accent-hover">Save</button>
          </form>
          {proxyState && <p className={cx('text-sm', proxyState.ok ? 'text-green-400' : 'text-red-400')}>{proxyState.text}</p>}
          {settings.proxyUrl && !proxyState && <p className="text-sm text-green-400">Using {settings.proxyUrl}</p>}
        </div>

        <div className={cx(card, 'space-y-3 md:col-span-2')}>
          <h3 className="text-sm font-black tracking-widest text-white/50 uppercase">Your data</h3>
          <p className="text-sm text-white/50">History and watchlist are stored only in this browser. Back them up or move them to another device.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={download} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold hover:bg-white/10">
              <Download className="size-4" /> Export
            </button>
            <button onClick={() => file.current?.click()} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold hover:bg-white/10">
              <Upload className="size-4" /> Import
            </button>
            {historyCount > 0 &&
              (confirmClear ? (
                <span className="flex items-center gap-2 text-sm">
                  Clear all history?
                  <button onClick={() => (actions.clearHistory(), setConfirmClear(false))} className="h-10 rounded-xl bg-accent px-4 font-bold">
                    Clear
                  </button>
                  <button onClick={() => setConfirmClear(false)} className="h-10 rounded-xl bg-white/10 px-4">
                    Cancel
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmClear(true)} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-red-400 hover:bg-red-500/10">
                  <Trash2 className="size-4" /> Clear history
                </button>
              ))}
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
                  setMsg({ ok: true, text: `Imported ${r.history} history entries and ${r.watchlist} watchlist items.` });
                } catch {
                  setMsg({ ok: false, text: 'That file isn’t a Charcoal backup.' });
                }
              }}
            />
          </div>
          {msg && <p className={cx('text-sm', msg.ok ? 'text-green-400' : 'text-red-400')}>{msg.text}</p>}
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
        {hint && <span className="block text-xs font-normal text-white/40">{hint}</span>}
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
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-white/15')}
      >
        <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform', on && 'translate-x-5')} />
      </button>
    </Row>
  );
}

function EmptyCard({ icon: Icon, title, body }: { icon?: typeof Film; title: string; body?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-10 text-center md:rounded-3xl md:py-16">
      {Icon && <Icon className="mx-auto mb-3 size-12 text-white/20 md:size-16" />}
      <p className="text-base font-semibold text-white/60 md:text-lg">{title}</p>
      {body && <p className="mt-1.5 text-xs text-white/40 md:text-sm">{body}</p>}
      {Icon && (
        <Link to="/" className="mt-5 inline-block rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold hover:bg-white/10">
          Browse titles
        </Link>
      )}
    </div>
  );
}
