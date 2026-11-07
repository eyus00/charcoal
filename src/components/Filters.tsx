import { useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Calendar, Film, Filter, SlidersHorizontal, Star, Trash2, Tv, X } from 'lucide-react';
import { RATINGS, YEAR_PRESETS, activeFilterCount, genresFor, writeFilters, type Filters } from '../lib/filters';
import { cx } from '../lib/util';

/** Filters read from / written to the URL (replace, so Back leaves the page instead of undoing filters). */
export function useUrlFilters(): (patch: Partial<Filters>) => void {
  const [params, setParams] = useSearchParams();
  return (patch) => setParams(writeFilters(params, patch), { replace: true, preventScrollReset: true });
}

const THIS_YEAR = new Date().getFullYear();
const chip = (on: boolean, tone: 'accent' | 'gold' = 'accent') =>
  cx(
    'shrink-0 rounded-full border font-black whitespace-nowrap transition',
    on
      ? tone === 'gold'
        ? 'border-yellow-500 bg-yellow-500 text-white shadow-lg shadow-yellow-500/20'
        : 'border-accent bg-accent text-white shadow-lg shadow-accent/20'
      : 'border-white/5 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70',
  );

const toggleYear = (f: Filters, from: number, to: number): Partial<Filters> =>
  f.from === from && f.to === to ? { from: undefined, to: undefined } : { from, to };

// ---------- top bar: filter button + scrollable quick chips ----------

export function FilterBar({ filters: f, set, onOpen, withType }: { filters: Filters; set: (p: Partial<Filters>) => void; onOpen: () => void; withType?: boolean }) {
  const count = activeFilterCount(f, withType);
  const small = 'px-3 py-2 text-[9px] tracking-widest uppercase md:px-5 md:py-2.5 md:text-[10px]';
  return (
    <div className="mb-6 flex items-center gap-2 rounded-2xl border border-white/5 bg-zinc-900/60 p-2 shadow-2xl md:mb-10 md:gap-4 md:rounded-full md:p-3">
      <button
        onClick={onOpen}
        title="Advanced filters"
        aria-label="Advanced filters"
        className={cx(
          'relative flex shrink-0 items-center rounded-xl px-3 py-2.5 transition active:scale-95 md:rounded-full md:px-4 md:py-3',
          count ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'border border-white/5 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white',
        )}
      >
        <Filter className="size-4 md:size-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-white text-[9px] font-black text-accent shadow-lg">{count}</span>
        )}
      </button>
      <div className="h-8 w-px shrink-0 bg-white/5" />
      <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto md:gap-2">
        {[7, 8].map((r) => (
          <button key={r} onClick={() => set({ rating: f.rating === r ? 0 : r })} className={cx(chip(f.rating === r, 'gold'), small)}>
            {r}.0+
          </button>
        ))}
        <div className="mx-0.5 h-5 w-px shrink-0 bg-white/5" />
        {[THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2].map((y) => (
          <button key={y} onClick={() => set(toggleYear(f, y, y))} className={cx(chip(f.from === y && f.to === y), small)}>
            {y}
          </button>
        ))}
        <div className="mx-0.5 h-5 w-px shrink-0 bg-white/5" />
        {genresFor(f.type).slice(0, 15).map((g) => (
          <button
            key={g.slug}
            onClick={() => set({ genres: f.genres.includes(g.slug) ? f.genres.filter((x) => x !== g.slug) : [...f.genres, g.slug] })}
            className={cx(chip(f.genres.includes(g.slug)), small)}
          >
            {g.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- shared sections (modal + quick menu) ----------

function Sections({ f, set, withType, size }: { f: Filters; set: (p: Partial<Filters>) => void; withType?: boolean; size: 'lg' | 'sm' }) {
  const btn = size === 'lg' ? 'px-5 py-2 text-[10px] md:px-6 md:py-2.5 md:text-xs' : 'px-3 py-1.5 text-[10px]';
  const genres = genresFor(f.type);
  return (
    <>
      {withType && (
        <Section icon={Film} title="Media Type" size={size}>
          {(['all', 'movie', 'tv'] as const).map((t) => (
            <button key={t} onClick={() => set({ type: t })} className={cx(chip(f.type === t), btn, 'flex items-center gap-2')}>
              {t === 'movie' && size === 'lg' && <Film className="size-3.5" />}
              {t === 'tv' && size === 'lg' && <Tv className="size-3.5" />}
              {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'TV Shows'}
            </button>
          ))}
        </Section>
      )}
      {size === 'sm' && <RatingSection f={f} set={set} btn={btn} size={size} />}
      <Section icon={Calendar} title={size === 'lg' ? 'Release Year' : 'Years'} size={size}>
        {YEAR_PRESETS.map((p) => (
          <button key={p.label} onClick={() => set(toggleYear(f, p.from, p.to))} className={cx(chip(f.from === p.from && f.to === p.to), btn)}>
            {p.label}
          </button>
        ))}
      </Section>
      <Section icon={Film} title="Genres" size={size}>
        {(size === 'lg' ? genres : genres.slice(0, 12)).map((g) => (
          <button
            key={g.slug}
            onClick={() => set({ genres: f.genres.includes(g.slug) ? f.genres.filter((x) => x !== g.slug) : [...f.genres, g.slug] })}
            className={cx(chip(f.genres.includes(g.slug)), btn)}
          >
            {g.name}
          </button>
        ))}
      </Section>
      {size === 'lg' && <RatingSection f={f} set={set} btn={btn} size={size} />}
    </>
  );
}

function RatingSection({ f, set, btn, size }: { f: Filters; set: (p: Partial<Filters>) => void; btn: string; size: 'lg' | 'sm' }) {
  return (
    <Section icon={Star} title={size === 'lg' ? 'Minimum Rating' : 'Rating'} size={size}>
      {RATINGS.map((r) => (
        <button key={r} onClick={() => set({ rating: f.rating === r ? 0 : r })} className={cx(chip(f.rating === r, 'gold'), btn)}>
          {r}+
        </button>
      ))}
    </Section>
  );
}

function Section({ icon: Icon, title, size, children }: { icon: typeof Film; title: string; size: 'lg' | 'sm'; children: ReactNode }) {
  return (
    <section>
      <div className={cx('flex items-center gap-2 font-black tracking-widest text-white/50 uppercase', size === 'lg' ? 'mb-4 text-[10px] md:mb-5 md:text-[11px]' : 'mb-3 text-[10px]')}>
        <Icon className={cx('text-accent', size === 'lg' ? 'size-4 md:size-5' : 'size-3')} />
        {title}
      </div>
      <div className={cx('flex flex-wrap', size === 'lg' ? 'gap-2 md:gap-2.5' : 'gap-1.5')}>{children}</div>
    </section>
  );
}

// ---------- advanced filters modal (bottom sheet on mobile) ----------

export function AdvancedFilters({
  open,
  onClose,
  filters: f,
  set,
  withType,
  total,
}: {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  set: (p: Partial<Filters>) => void;
  withType?: boolean;
  total?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Advanced filters"
        className="flex h-[90dvh] w-full flex-col overflow-hidden rounded-t-[2rem] border-t border-white/10 bg-[#121212]/95 shadow-[0_0_100px_rgba(0,0,0,0.5)] md:h-auto md:max-h-full md:max-w-2xl md:rounded-[2.5rem] md:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 p-4 md:p-8">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-accent/20 bg-accent/10 p-2 text-accent md:rounded-xl md:p-2.5">
              <SlidersHorizontal className="size-5 md:size-6" />
            </div>
            <h2 className="text-base font-bold tracking-tight md:text-2xl">Advanced Filters</h2>
          </div>
          <div className="flex items-center rounded-lg border border-white/5 bg-white/5 p-1 md:rounded-xl">
            <button
              onClick={() => set({ genres: [], from: undefined, to: undefined, rating: 0, ...(withType ? { type: 'all' as const } : {}) })}
              title="Clear all"
              aria-label="Clear all filters"
              className="rounded-lg p-2 text-white/40 transition hover:bg-red-500/10 hover:text-red-500 md:p-3"
            >
              <Trash2 className="size-4 md:size-5" />
            </button>
            <button onClick={onClose} title="Close" aria-label="Close" className="rounded-lg p-2 transition hover:bg-white/10 md:p-3">
              <X className="size-4 md:size-6" />
            </button>
          </div>
        </div>
        <div className="flex-1 space-y-8 overflow-y-auto p-5 md:space-y-10 md:p-8">
          <Sections f={f} set={set} withType={withType} size="lg" />
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-white/5 p-5 md:gap-4 md:p-8">
          <button onClick={onClose} className="flex-1 rounded-lg border border-white/5 bg-white/5 px-6 py-3 text-xs font-bold transition hover:bg-white/10 md:flex-none md:rounded-xl md:text-base">
            Cancel
          </button>
          <button onClick={onClose} className="flex-[2] rounded-lg border border-white/10 bg-accent px-8 py-3 text-xs font-bold shadow-lg shadow-accent/20 transition hover:bg-accent-hover md:flex-none md:rounded-xl md:px-12 md:text-base">
            Show Results{total !== undefined ? ` (${total})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- quick filter menu attached to the search bar ----------

export function QuickFilterMenu({
  filters: f,
  set,
  onClear,
  onApply,
  placement,
}: {
  filters: Filters;
  set: (p: Partial<Filters>) => void;
  onClear: () => void;
  onApply: () => void;
  placement: 'below' | 'above';
}) {
  return (
    <div
      className={cx(
        'absolute left-0 z-[70] w-[300px] rounded-[1.5rem] border border-white/10 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-2xl md:w-80 md:rounded-[2rem] md:p-5',
        placement === 'below' ? 'top-full mt-3' : 'bottom-full mb-3',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-accent/20 bg-accent/10 p-1.5 text-accent">
            <SlidersHorizontal className="size-3.5" />
          </div>
          <h3 className="text-sm font-bold tracking-tight">Quick Filters</h3>
        </div>
        <button onClick={onClear} title="Clear all" aria-label="Clear all filters" className="rounded-lg border border-white/5 bg-white/5 p-2 text-white/40 transition hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-500">
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="max-h-[300px] space-y-5 overflow-y-auto pr-1 md:max-h-[400px]">
        <Sections f={f} set={set} withType size="sm" />
      </div>
      <button onClick={onApply} className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-bold shadow-lg shadow-accent/20 transition hover:bg-accent-hover active:scale-95">
        Apply Filters
      </button>
    </div>
  );
}
