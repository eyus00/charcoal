import { useSearchParams } from 'react-router';
import { X } from 'lucide-react';
import {
  RATINGS,
  SORTS,
  YEAR_PRESETS,
  genresFor,
  hasActiveFilters,
  writeFilters,
  type Filters,
  type SortKey,
} from '../lib/filters';
import { cx } from '../lib/util';

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR + 1 - 1950 }, (_, i) => THIS_YEAR + 1 - i);

interface Props {
  filters: Filters;
  showType?: boolean;
  showSort?: boolean;
}

export default function FilterBar({ filters: f, showType, showSort = true }: Props) {
  const [params, setParams] = useSearchParams();
  const update = (patch: Partial<Filters>) => setParams(writeFilters(params, patch), { replace: true });

  const yearValue = f.from || f.to ? `${f.from ?? ''}-${f.to ?? ''}` : '';
  const known = YEAR_PRESETS.some((p) => `${p.from}-${p.to}` === yearValue) || YEARS.some((y) => `${y}-${y}` === yearValue);
  const toggleGenre = (slug: string) =>
    update({ genres: f.genres.includes(slug) ? f.genres.filter((g) => g !== slug) : [...f.genres, slug] });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {showType && (
          <div className="flex rounded-lg border border-line bg-surface p-0.5" role="radiogroup" aria-label="Type">
            {(['all', 'movie', 'tv'] as const).map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={f.type === t}
                onClick={() => update({ type: t, genres: f.genres })}
                className={cx(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  f.type === t ? 'bg-white/15 text-white' : 'text-muted hover:text-white',
                )}
              >
                {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'TV'}
              </button>
            ))}
          </div>
        )}

        <Select
          label="Year"
          value={yearValue}
          onChange={(v) => {
            const [from, to] = v.split('-').map((n) => (n ? Number(n) : undefined));
            update({ from, to });
          }}
        >
          <option value="">Any year</option>
          {YEAR_PRESETS.map((p) => (
            <option key={p.label} value={`${p.from}-${p.to}`}>
              {p.label}
            </option>
          ))}
          <optgroup label="Year">
            {YEARS.map((y) => (
              <option key={y} value={`${y}-${y}`}>
                {y}
              </option>
            ))}
          </optgroup>
          {yearValue && !known && (
            <option value={yearValue}>
              {f.from ?? '…'}–{f.to ?? '…'}
            </option>
          )}
        </Select>

        <Select label="Rating" value={String(f.rating || '')} onChange={(v) => update({ rating: Number(v) || 0 })}>
          <option value="">Any rating</option>
          {RATINGS.map((r) => (
            <option key={r} value={r}>
              {r}+ stars
            </option>
          ))}
        </Select>

        {showSort && (
          <Select label="Sort" value={f.sort} onChange={(v) => update({ sort: v as SortKey })}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        )}

        {hasActiveFilters(f) && (
          <button
            onClick={() => update({ genres: [], from: undefined, to: undefined, rating: 0 })}
            className="flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-muted hover:text-white"
          >
            <X className="size-4" /> Clear filters
          </button>
        )}
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" aria-label="Genres">
        {genresFor(f.type).map((g) => {
          const on = f.genres.includes(g.slug);
          return (
            <button
              key={g.slug}
              aria-pressed={on}
              onClick={() => toggleGenre(g.slug)}
              className={cx(
                'h-8 shrink-0 rounded-full border px-3 text-sm transition-colors',
                on ? 'border-accent bg-accent/15 text-white' : 'border-line text-muted hover:border-white/30 hover:text-white',
              )}
            >
              {g.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          'h-9 appearance-none rounded-lg border bg-surface pr-8 pl-3 text-sm outline-none transition-colors hover:border-white/30',
          value && value !== 'popular' ? 'border-accent/60 text-white' : 'border-line text-muted',
        )}
      >
        {children}
      </select>
      <svg className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  );
}
