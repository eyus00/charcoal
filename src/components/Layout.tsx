import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowUp, Bookmark, Film, History, Home, Search, SlidersHorizontal, Tv, User } from 'lucide-react';
import { EMPTY_FILTERS, activeFilterCount, parseFilters, writeFilters, type Filters } from '../lib/filters';
import { cx } from '../lib/util';
import { QuickFilterMenu } from './Filters';
import { PageSkeleton } from './Skeletons';

export default function Layout({ bare = false }: { bare?: boolean }) {
  if (bare) {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
        <Outlet />
      </Suspense>
    );
  }
  return (
    <div className="relative min-h-dvh bg-black text-white">
      <ScrollRestoration />
      <TopBar />
      <main className="min-h-dvh pt-6 pb-32 md:pt-24 md:pb-10">
        <div className="px-4 md:px-10">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <MobileNav />
      <ScrollTop />
    </div>
  );
}

// ---------- search state shared by desktop bar and mobile panel ----------

/**
 * Search text + quick filters. On /search they edit the URL directly;
 * elsewhere they're a draft that is applied when you search.
 */
function useSearchState() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const onSearch = pathname === '/search';
  const [query, setQuery] = useState(onSearch ? (params.get('q') ?? '') : '');
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const filters = onSearch ? parseFilters(params) : draft;

  const urlQ = onSearch ? (params.get('q') ?? '') : null;
  useEffect(() => {
    if (urlQ !== null) setQuery(urlQ);
  }, [urlQ]);

  const setFilters = (patch: Partial<Filters>) =>
    onSearch ? setParams(writeFilters(params, patch), { replace: true }) : setDraft((d) => ({ ...d, ...patch }));
  const clearFilters = () => setFilters({ type: 'all', genres: [], from: undefined, to: undefined, rating: 0 });

  const submit = () => {
    const base = writeFilters(new URLSearchParams(), filters);
    if (query.trim()) base.set('q', query.trim());
    navigate(`/search?${base}`, { replace: onSearch });
    setDraft(EMPTY_FILTERS);
  };
  return { query, setQuery, filters, setFilters, clearFilters, submit, count: activeFilterCount(filters, true) };
}

function useFocusShortcut(ref: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !/input|textarea|select/i.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
}

function SearchField({
  s,
  inputRef,
  menuOpen,
  setMenuOpen,
  placement,
  onDone,
}: {
  s: ReturnType<typeof useSearchState>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  menuOpen: boolean;
  setMenuOpen: (o: boolean) => void;
  placement: 'below' | 'above';
  onDone?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const run = () => {
    s.submit();
    setMenuOpen(false);
    inputRef.current?.blur();
    onDone?.();
  };
  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <div
        className={cx(
          'flex h-11 items-center gap-2.5 rounded-full border py-3 pr-2 pl-4 backdrop-blur-xl transition',
          placement === 'above' ? 'bg-zinc-900/85' : 'bg-white/[0.06]',
          focused || menuOpen ? 'border-white/25 shadow-xl shadow-black/20 md:bg-white/[0.12]' : 'border-white/10 hover:border-white/20 md:hover:bg-white/[0.09]',
        )}
      >
        <Search className="size-4 shrink-0 text-white/60" />
        <input
          ref={inputRef}
          value={s.query}
          onChange={(e) => s.setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => e.key === 'Escape' && (setMenuOpen(false), onDone?.())}
          type="search"
          enterKeyHint="search"
          placeholder="Search..."
          aria-label="Search movies and TV"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-white/45 [&::-webkit-search-cancel-button]:hidden"
        />
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          title="Filters"
          aria-label="Quick filters"
          aria-expanded={menuOpen}
          className={cx(
            'relative shrink-0 rounded-full p-1.5 transition active:scale-95',
            s.count || menuOpen ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-white/40 hover:bg-white/10 hover:text-white',
          )}
        >
          <SlidersHorizontal className="size-3.5" />
        </button>
      </div>
      {menuOpen && <QuickFilterMenu filters={s.filters} set={s.setFilters} onClear={s.clearFilters} onApply={run} placement={placement} />}
    </form>
  );
}

// ---------- desktop ----------

const NAV = [
  { label: 'HOME', path: '/' },
  { label: 'MOVIES', path: '/movies' },
  { label: 'TV SHOWS', path: '/tv' },
];

function TopBar() {
  const { pathname } = useLocation();
  const s = useSearchState();
  const input = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useFocusShortcut(input);
  useOutside(menu, () => setMenu(false), box);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 hidden px-8 pt-5 pb-4 md:block lg:px-12">
      <div className="pointer-events-auto flex w-full items-center justify-between gap-4">
        <div className="flex flex-1 justify-start">
          <div ref={box} className="w-64 lg:w-72">
            <SearchField s={s} inputRef={input} menuOpen={menu} setMenuOpen={setMenu} placement="below" />
          </div>
        </div>
        <nav className="flex items-center gap-4 lg:gap-6">
          {NAV.map((n) => {
            const active = pathname === n.path;
            return (
              <Link
                key={n.path}
                to={n.path}
                className={cx('relative flex h-11 min-w-[110px] items-center justify-center px-4 text-sm font-semibold tracking-wider transition', active ? 'text-white' : 'text-white/60 hover:text-white')}
              >
                {n.label}
                <span className={cx('absolute bottom-0 left-1/2 h-0.5 -translate-x-1/2 transition-all', active ? 'w-8 bg-accent' : 'w-0')} />
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-1 justify-end">
          <div className="flex h-11 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 backdrop-blur-xl transition hover:border-white/20">
            <IconLink to="/profile#history" title="Continue Watching" icon={History} />
            <IconLink to="/profile#watchlist" title="Watchlist" icon={Bookmark} />
            <div className="mx-1 h-6 w-px bg-white/15" />
            <IconLink to="/profile#profile" title="Profile" icon={User} />
          </div>
        </div>
      </div>
    </header>
  );
}

const IconLink = ({ to, title, icon: Icon }: { to: string; title: string; icon: typeof User }) => (
  <Link to={to} title={title} aria-label={title} className="rounded-full p-2 text-white/70 transition hover:bg-white/[0.12] hover:text-white">
    <Icon className="size-[18px]" />
  </Link>
);

// ---------- mobile ----------

function MobileNav() {
  const { pathname } = useLocation();
  const s = useSearchState();
  const [panel, setPanel] = useState(false);
  const [menu, setMenu] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setPanel(false);
    setMenu(false);
  }, []);
  useOutside(panel, close, root);
  useEffect(close, [pathname, close]);

  const onSearchButton = () => {
    if (!panel) {
      setPanel(true);
      setTimeout(() => input.current?.focus(), 50);
    } else if (s.query.trim() || s.count) {
      s.submit();
      close();
    } else close();
  };

  const item = (to: string, Icon: typeof Home, label: string, match = to) => (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className={cx('flex items-center justify-center rounded-full px-4 py-2 transition-colors active:scale-95', pathname === match ? 'text-accent' : 'text-white/50')}
    >
      <Icon className="size-5" />
    </Link>
  );

  return (
    <div ref={root} className="fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)] md:hidden">
      {panel && (
        <div className="mx-5 mb-3">
          <SearchField s={s} inputRef={input} menuOpen={menu} setMenuOpen={setMenu} placement="above" onDone={close} />
        </div>
      )}
      <div className="mx-5 mb-5 rounded-full border border-white/10 bg-zinc-900/85 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex items-center justify-around gap-1">
          {item('/', Home, 'Home')}
          {item('/movies', Film, 'Movies')}
          <button
            onClick={onSearchButton}
            aria-label="Search"
            title="Search"
            className="mx-2 flex items-center justify-center rounded-full bg-accent p-3 text-white shadow-lg shadow-accent/30 transition active:scale-95"
          >
            <Search className="size-5" />
          </button>
          {item('/tv', Tv, 'TV Shows')}
          {item('/profile#profile', User, 'Profile', '/profile')}
        </div>
      </div>
    </div>
  );
}

function useOutside(active: boolean, onOut: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && onOut();
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [active, onOut, ref]);
}

/** Shows once a sentinel 1.5 screens down scrolls out of view — no scroll listener. */
function ScrollTop() {
  const [show, setShow] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <div ref={sentinel} aria-hidden className="pointer-events-none absolute top-[150vh] h-px w-px" />
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Scroll to top"
        className={cx(
          'fixed right-4 bottom-28 z-30 grid size-11 place-items-center rounded-full border border-white/10 bg-accent text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-hover md:bottom-8',
          show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-16 opacity-0',
        )}
      >
        <ArrowUp className="size-5" />
      </button>
    </>
  );
}
