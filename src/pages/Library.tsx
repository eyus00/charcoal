import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Download, Play, Trash2, Upload, X } from 'lucide-react';
import { STATUS_DOT, STATUS_LABEL } from '../components/BookmarkMenu';
import { GRID_SIZES } from '../components/Skeletons';
import Img from '../components/Img';
import MediaCard from '../components/MediaCard';
import { epLabel } from '../lib/episodes';
import { EMBEDS } from '../lib/servers';
import { actions, percent, useStore, watchUrl, type WatchStatus } from '../lib/store';
import type { MediaType } from '../lib/tmdb';
import { cx, timeAgo, useTitle } from '../lib/util';

const TABS = [
  { key: 'bookmarks', label: 'Bookmarks' },
  { key: 'history', label: 'History' },
  { key: 'settings', label: 'Settings' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export default function Library() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'bookmarks') as Tab;
  useTitle('Library');

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-6 md:px-8 md:pt-8">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight md:text-3xl">Library</h1>
      <div className="mb-6 flex gap-1 border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={cx(
              '-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors',
              tab === t.key ? 'border-accent text-white' : 'border-transparent text-muted hover:text-white',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'bookmarks' && <Bookmarks />}
      {tab === 'history' && <History />}
      {tab === 'settings' && <SettingsPanel />}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors',
        on ? 'border-accent bg-accent/15 text-white' : 'border-line text-muted hover:border-white/30 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

function Bookmarks() {
  const watchlist = useStore((s) => s.watchlist);
  const [status, setStatus] = useState<WatchStatus | null>(null);
  const [type, setType] = useState<MediaType | null>(null);
  const items = useMemo(
    () => watchlist.filter((w) => (!status || w.status === status) && (!type || w.mediaType === type)),
    [watchlist, status, type],
  );

  if (!watchlist.length) {
    return <Empty title="No bookmarks yet" body="Use the Bookmark button on any movie or show to save it here." />;
  }
  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(STATUS_LABEL) as WatchStatus[]).map((s) => (
          <Chip key={s} on={status === s} onClick={() => setStatus(status === s ? null : s)}>
            <span className={cx('size-2 rounded-full', STATUS_DOT[s])} />
            {STATUS_LABEL[s]} <span className="text-faint">{watchlist.filter((w) => w.status === s).length}</span>
          </Chip>
        ))}
        <span className="mx-1 w-px bg-line" />
        <Chip on={type === 'movie'} onClick={() => setType(type === 'movie' ? null : 'movie')}>
          Movies
        </Chip>
        <Chip on={type === 'tv'} onClick={() => setType(type === 'tv' ? null : 'tv')}>
          TV
        </Chip>
      </div>
      {items.length === 0 ? (
        <p className="py-16 text-center text-muted">No bookmarks match these filters.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
          {items.map((w) => (
            <div key={w.mediaType + w.id} className="group relative">
              <MediaCard
                type={w.mediaType}
                sizes={GRID_SIZES}
                item={{ id: w.id, title: w.title, poster_path: w.posterPath, backdrop_path: null, overview: '', vote_average: w.ratingScore ?? 0, release_date: w.releaseDate }}
              />
              <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/75 px-2 py-0.5 text-[11px]">
                <span className={cx('size-1.5 rounded-full', STATUS_DOT[w.status])} />
                {STATUS_LABEL[w.status]}
              </div>
              <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                <select
                  aria-label={`Status for ${w.title}`}
                  value={w.status}
                  onChange={(e) => actions.setBookmark({ ...w, status: e.target.value as WatchStatus })}
                  className="h-7 w-7 cursor-pointer appearance-none rounded-full bg-black/75 text-transparent"
                  title="Change status"
                >
                  {(Object.keys(STATUS_LABEL) as WatchStatus[]).map((s) => (
                    <option key={s} value={s} className="text-black">
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => actions.removeBookmark(w.mediaType, w.id)}
                  aria-label={`Remove ${w.title} from bookmarks`}
                  title="Remove"
                  className="grid size-7 place-items-center rounded-full bg-black/75 hover:bg-red-500/80"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function History() {
  const history = useStore((s) => s.history);
  const [confirm, setConfirm] = useState(false);
  const [limit, setLimit] = useState(60);

  if (!history.length) return <Empty title="Nothing watched yet" body="Movies and episodes you play will show up here." />;
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{history.length} entries</p>
        {confirm ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Clear all history?</span>
            <button onClick={() => (actions.clearHistory(), setConfirm(false))} className="h-8 rounded-lg bg-red-500/80 px-3 hover:bg-red-500">
              Clear
            </button>
            <button onClick={() => setConfirm(false)} className="h-8 rounded-lg bg-white/10 px-3 hover:bg-white/15">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} className="flex h-8 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:text-white">
            <Trash2 className="size-4" /> Clear history
          </button>
        )}
      </div>
      <ul className="divide-y divide-line/60">
        {history.slice(0, limit).map((h) => (
          <li key={`${h.mediaType}-${h.id}-${h.season}-${h.episode}`} className="group flex items-center gap-3 py-3">
            <Link to={watchUrl({ ...h, isCompleted: false })} className="relative shrink-0">
              <Img path={h.backdropPath ?? h.posterPath} kind={h.backdropPath ? 'backdrop' : 'poster'} sizes="160px" alt="" className="aspect-video w-28 rounded-md sm:w-40" />
              <Play className="absolute inset-0 m-auto size-7 fill-white text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
              {percent(h) > 0 && (
                <div className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-white/25">
                  <div className={cx('h-full', h.isCompleted ? 'bg-emerald-400' : 'bg-accent')} style={{ width: `${percent(h)}%` }} />
                </div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link to={`/${h.mediaType}/${h.id}`} className="block truncate text-sm font-medium hover:underline">
                {h.title}
              </Link>
              <div className="truncate text-xs text-muted">
                {h.mediaType === 'tv' ? epLabel(h.season, h.episode) : 'Movie'}
                {h.episodeTitle ? ` · ${h.episodeTitle}` : ''}
              </div>
              <div className="text-xs text-faint">
                {h.isCompleted ? 'Watched' : h.progress ? `${Math.round(percent(h))}%` : 'Started'} · {timeAgo(h.lastWatched)}
              </div>
            </div>
            <button
              onClick={() => actions.removeHistoryEntry(h)}
              aria-label={`Remove ${h.title} from history`}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-faint hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {history.length > limit && (
        <div className="mt-6 flex justify-center">
          <button onClick={() => setLimit((l) => l + 60)} className="h-10 rounded-lg border border-line px-5 text-sm text-muted hover:text-white">
            Show more
          </button>
        </div>
      )}
    </>
  );
}

function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const download = () => {
    const blob = new Blob([actions.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `charcoal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="max-w-xl space-y-8">
      <section className="space-y-4">
        <h2 className="font-medium">Playback</h2>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm">
            Default server
            <span className="block text-xs text-muted">Jelly falls back to an embedded player automatically if it finds nothing.</span>
          </span>
          <select
            value={settings.server}
            onChange={(e) => actions.updateSettings({ server: e.target.value })}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm"
          >
            <option value="jelly">Jelly (direct)</option>
            {EMBEDS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <Toggle label="Autoplay next episode" hint="Jelly player only" on={settings.autoplayNext} onChange={(v) => actions.updateSettings({ autoplayNext: v })} />
        <Toggle label="Block pop-ups in embedded players" hint="Some servers refuse to play when this is on" on={settings.blockPopups} onChange={(v) => actions.updateSettings({ blockPopups: v })} />
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Your data</h2>
        <p className="text-sm text-muted">History and bookmarks are stored only in this browser. Back them up or move them to another device.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={download} className="flex h-10 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm hover:bg-white/15">
            <Download className="size-4" /> Export
          </button>
          <button onClick={() => file.current?.click()} className="flex h-10 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm hover:bg-white/15">
            <Upload className="size-4" /> Import
          </button>
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
                setMsg(`Imported ${r.history} history entries and ${r.watchlist} bookmarks.`);
              } catch {
                setMsg('That file isn’t a Charcoal backup.');
              }
            }}
          />
        </div>
        {msg && <p className="text-sm text-emerald-300">{msg}</p>}
      </section>
    </div>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="text-sm">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <button
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-white/15')}
      >
        <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform', on && 'translate-x-5')} />
      </button>
    </label>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-20 text-center">
      <h2 className="font-medium">{title}</h2>
      <p className="max-w-sm text-sm text-muted">{body}</p>
      <Link to="/" className="mt-3 h-10 rounded-lg bg-white/10 px-5 text-sm leading-10 hover:bg-white/15">
        Browse titles
      </Link>
    </div>
  );
}
