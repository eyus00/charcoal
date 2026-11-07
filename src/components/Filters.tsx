import { useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { SlidersHorizontal, Star, X } from 'lucide-react';
import { RATINGS, YEAR_PRESETS, activeFilterCount, genresFor, writeFilters, type Filters } from '../lib/filters';
import { cx } from '../lib/util';
import { Pill } from './Row';

/** Filters read from / written to the URL (replace, so Back leaves the page instead of undoing filters). */
export function useUrlFilters(): (patch: Partial<Filters>) => void {
  const [params, setParams] = useSearchParams();
  return (patch) => setParams(writeFilters(params, patch), { replace: true, preventScrollReset: true });
}

const THIS_YEAR = new Date().getFullYear();
type Set = (p: Partial<Filters>) => void;

const toggleYear = (f: Filters, from: number, to: number): Partial<Filters> =>
  f.from === from && f.to === to ? { from: undefined, to: undefined } : { from, to };
const toggleGenre = (f: Filters, slug: string): Partial<Filters> => ({
  genres: f.genres.includes(slug) ? f.genres.filter((x) => x !== slug) : [...f.genres, slug],
});

// ---------- page filter bar: Filters button + quick pills ----------

export function FilterBar({ filters: f, set, onOpen, withType }: { filters: Filters; set: Set; onOpen: () => void; withType?: boolean }) {
  const count = activeFilterCount(f, withType);
  return (
    <div className="mb-7 flex items-center gap-2.5">
      <button
        onClick={onOpen}
        aria-label="All filters"
        className={cx('flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm transition', count ? 'bg-accent font-medium text-black' : 'bg-surface text-white/85 hover:bg-raised')}
      >
        <SlidersHorizontal className="size-4" />
        <span className="hidden sm:inline">Filters</span>
        {count > 0 && <span className="grid size-5 place-items-center rounded-full bg-black/15 text-xs">{count}</span>}
      </button>
      <div className="no-scrollbar scroll-row -mr-4 flex min-w-0 flex-1 gap-2.5 overflow-x-auto pr-4 md:mr-0 md:pr-0">
        {[7, 8].map((r) => (
          <Pill key={r} on={f.rating === r} onClick={() => set({ rating: f.rating === r ? 0 : r })} className="flex items-center gap-1.5">
            <Star className={cx('size-3.5 fill-current', f.rating === r ? 'text-black' : 'text-star')} strokeWidth={0} />
            {r}+
          </Pill>
        ))}
        {[THIS_YEAR, THIS_YEAR - 1].map((y) => (
          <Pill key={y} on={f.from === y && f.to === y} onClick={() => set(toggleYear(f, y, y))}>
            {y}
          </Pill>
        ))}
        {genresFor(f.type).slice(0, 14).map((g) => (
          <Pill key={g.slug} on={f.genres.includes(g.slug)} onClick={() => set(toggleGenre(f, g.slug))}>
            {g.name}
          </Pill>
        ))}
      </div>
    </div>
  );
}

// ---------- shared sections ----------

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx('h-9 rounded-xl px-3.5 text-sm transition', on ? 'bg-white font-medium text-black' : 'bg-raised text-white/80 hover:bg-line hover:text-white')}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm text-muted">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function Sections({ f, set, withType, compact }: { f: Filters; set: Set; withType?: boolean; compact?: boolean }) {
  const genres = genresFor(f.type);
  return (
    <>
      {withType && (
        <Section title="Type">
          {(['all', 'movie', 'tv'] as const).map((t) => (
            <Chip key={t} on={f.type === t} onClick={() => set({ type: t })}>
              {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'TV Shows'}
            </Chip>
          ))}
        </Section>
      )}
      <Section title="Rating">
        {RATINGS.map((r) => (
          <Chip key={r} on={f.rating === r} onClick={() => set({ rating: f.rating === r ? 0 : r })}>
            ★ {r}+
          </Chip>
        ))}
      </Section>
      <Section title="Release year">
        {YEAR_PRESETS.map((p) => (
          <Chip key={p.label} on={f.from === p.from && f.to === p.to} onClick={() => set(toggleYear(f, p.from, p.to))}>
            {p.label}
          </Chip>
        ))}
      </Section>
      <Section title="Genres">
        {(compact ? genres.slice(0, 12) : genres).map((g) => (
          <Chip key={g.slug} on={f.genres.includes(g.slug)} onClick={() => set(toggleGenre(f, g.slug))}>
            {g.name}
          </Chip>
        ))}
      </Section>
    </>
  );
}

const clearAll = (withType?: boolean): Partial<Filters> => ({ genres: [], from: undefined, to: undefined, rating: 0, ...(withType ? { type: 'all' as const } : {}) });

// ---------- full filter panel (sheet on mobile, dialog on desktop) ----------

export function AdvancedFilters({ open, onClose, filters: f, set, withType, total }: { open: boolean; onClose: () => void; filters: Filters; set: Set; withType?: boolean; total?: number }) {
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
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 md:items-center md:p-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl md:max-w-xl md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-xl font-semibold">Filters</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-xl bg-raised hover:bg-line">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-6">
          <Sections f={f} set={set} withType={withType} />
        </div>
        <div className="flex gap-3 border-t border-line p-4 md:px-6">
          <button onClick={() => set(clearAll(withType))} className="h-12 flex-1 rounded-2xl bg-raised text-[15px] hover:bg-line">
            Clear
          </button>
          <button onClick={onClose} className="h-12 flex-[2] rounded-2xl bg-accent text-[15px] font-medium text-black hover:bg-accent-hover">
            Show results{total !== undefined ? ` (${total.toLocaleString()})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- quick filter popover on the search bar ----------

export function QuickFilterMenu({ filters: f, set, onClear, onApply, placement }: { filters: Filters; set: Set; onClear: () => void; onApply: () => void; placement: 'below' | 'above' }) {
  return (
    <div
      className={cx('absolute inset-x-4 z-[70] rounded-3xl bg-surface p-5 shadow-2xl shadow-black/50 ring-1 ring-line md:inset-x-auto md:right-0 md:w-[380px]', placement === 'below' ? 'top-full mt-2 md:mt-3' : 'bottom-full mb-3')}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="max-h-[50dvh] space-y-5 overflow-y-auto pr-1">
        <Sections f={f} set={set} withType compact />
      </div>
      <div className="mt-5 flex gap-2.5">
        <button type="button" onClick={onClear} className="h-11 flex-1 rounded-2xl bg-raised text-sm hover:bg-line">
          Clear
        </button>
        <button type="button" onClick={onApply} className="h-11 flex-[2] rounded-2xl bg-accent text-sm font-medium text-black hover:bg-accent-hover">
          Search
        </button>
      </div>
    </div>
  );
}
