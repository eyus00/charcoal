import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Star } from 'lucide-react';
import { RATINGS, YEAR_PRESETS, genresFor, writeFilters, type Filters } from '../lib/filters';
import { cx } from '../lib/util';
import { Pill } from './Row';

/** Filters read from / written to the URL (replace, so Back leaves the page instead of undoing filters). */
export function useUrlFilters(): (patch: Partial<Filters>) => void {
  const [params, setParams] = useSearchParams();
  return (patch) => setParams(writeFilters(params, patch), { replace: true, preventScrollReset: true });
}

const THIS_YEAR = new Date().getFullYear();
/** The handful of genres offered as quick pills (everything else lives in All filters). */
const QUICK_GENRES = ['action', 'adventure', 'comedy', 'drama', 'scifi', 'horror', 'thriller', 'animation', 'crime', 'romance', 'mystery', 'fantasy', 'documentary'];
type Set = (p: Partial<Filters>) => void;

const toggleYear = (f: Filters, from: number, to: number): Partial<Filters> =>
  f.from === from && f.to === to ? { from: undefined, to: undefined } : { from, to };
const toggleGenre = (f: Filters, slug: string): Partial<Filters> => ({
  genres: f.genres.includes(slug) ? f.genres.filter((x) => x !== slug) : [...f.genres, slug],
});

// ---------- page filter bar: Filters button + quick pills ----------

export function FilterBar({ filters: f, set, className }: { filters: Filters; set: Set; className?: string }) {
  return (
    <div className={cx('flex min-w-0 items-center gap-2.5', className)}>
      <div className="no-scrollbar scroll-row -mr-4 flex min-w-0 flex-1 gap-2.5 overflow-x-auto pr-4 md:mr-0 md:pr-0 md:[mask-image:linear-gradient(to_right,black_94%,transparent)]">
        {[7, 8].map((r) => (
          <Pill key={r} on={f.rating === r} onClick={() => set({ rating: f.rating === r ? 0 : r })} className="flex items-center gap-1.5">
            <Star className="size-3.5 fill-current text-star" strokeWidth={0} />
            {r}+
          </Pill>
        ))}
        {[THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2].map((y) => (
          <Pill key={y} on={f.from === y && f.to === y} onClick={() => set(toggleYear(f, y, y))}>
            {y}
          </Pill>
        ))}
        {genresFor(f.type).filter((g) => QUICK_GENRES.includes(g.slug)).map((g) => (
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
      className={cx('h-9 rounded-full px-3.5 text-sm transition', on ? 'bg-white font-medium text-black' : 'bg-raised text-white/80 hover:bg-line hover:text-white')}
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
            <span className="flex items-center gap-1.5">
              <Star className="size-3.5 fill-current text-star" strokeWidth={0} />
              {r}+
            </span>
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

// ---------- quick filter popover on the search bar ----------

export function QuickFilterMenu({ filters: f, set, onClear, onApply, placement }: { filters: Filters; set: Set; onClear: () => void; onApply: () => void; placement: 'below' | 'above' }) {
  return (
    <div
      className={cx('absolute inset-x-0 z-[70] rounded-3xl bg-surface p-5 shadow-2xl shadow-black/50 ring-1 ring-line md:inset-x-auto md:right-0 md:w-[380px]', placement === 'below' ? 'top-full mt-2 md:mt-3' : 'bottom-full mb-3')}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="max-h-[50dvh] space-y-5 overflow-y-auto pr-1">
        <Sections f={f} set={set} withType compact />
      </div>
      <div className="mt-5 flex gap-2.5">
        <button type="button" onClick={onClear} className="h-11 flex-1 rounded-full bg-raised text-sm hover:bg-line">
          Clear
        </button>
        <button type="button" onClick={onApply} className="h-11 flex-[2] rounded-full bg-accent text-sm font-medium text-black hover:bg-accent-hover">
          Search
        </button>
      </div>
    </div>
  );
}
