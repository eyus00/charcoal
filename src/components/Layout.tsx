import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowUp, Bookmark, ChevronDown, Film, History, Home, Search, Settings, SlidersHorizontal, Tv, User } from 'lucide-react';
import { EMPTY_FILTERS, activeFilterCount, parseFilters, writeFilters, type Filters } from '../lib/filters';
import { continueWatching, useStore } from '../lib/store';
import { cx } from '../lib/util';
import { CompactContinueList } from './ContinueWatching';
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
    <div className="relative min-h-dvh lg:flex">
      <ScrollRestoration />
      <Sidebar />
      <div className="min-w-0 flex-1 px-4 pb-32 md:px-8 lg:pb-10 lg:pl-4">
        <TopBar />
        <main>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileNav />
      <ScrollTop />
    </div>
  );
}

const Logo = () => (
  <Link to="/" className="flex items-center gap-3">
    <img src="/icon.png" alt="" width={36} height={36} className="size-9 rounded-xl" />
    <span className="text-xl font-semibold tracking-tight">Charcoal</span>
  </Link>
);

// ---------- sidebar (lg+) ----------

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/tv', label: 'TV Shows', icon: Tv },
];
const LIBRARY = [
  { to: '/profile#watchlist', label: 'Watchlist', icon: Bookmark },
  { to: '/profile#history', label: 'History', icon: History },
];

function Sidebar() {
  const { pathname, hash } = useLocation();
  const history = useStore((s) => s.history);
  const resume = useMemo(() => continueWatching(history).slice(0, 8), [history]);
  const item = (to: string, label: string, Icon: typeof Home, active: boolean) => (
    <Link
      key={to}
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cx('flex items-center gap-4 rounded-xl px-3 py-2.5 text-[15px] transition', active ? 'text-white' : 'text-muted hover:text-white')}
    >
      <Icon className={cx('size-5', active && 'text-accent')} />
      {label}
    </Link>
  );
  return (
    <aside className="sticky top-0 hidden h-dvh w-[268px] shrink-0 flex-col overflow-y-auto px-6 py-7 lg:flex">
      <Logo />
      <nav className="mt-10 space-y-1">
        {NAV.map((n) => item(n.to, n.label, n.icon, n.end ? pathname === '/' : pathname.startsWith(n.to)))}
      </nav>
      <nav className="mt-8 space-y-1">
        {LIBRARY.map((n) => item(n.to, n.label, n.icon, pathname === '/profile' && hash === n.to.slice(8)))}
        {item('/profile#settings', 'Settings', Settings, pathname === '/profile' && hash === '#settings')}
      </nav>
      {resume.length > 0 && (
        <div className="mt-10">
          <div className="mb-4 flex items-center gap-4 px-3 text-[15px] text-muted">
            <History className="size-5" /> Continue Watching
          </div>
          <CompactContinueList items={resume} />
        </div>
      )}
    </aside>
  );
}

// ---------- search state (desktop bar + mobile panel) ----------

/** Search text + filters. On /search they edit the URL; elsewhere they're a draft applied on search. */
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
  return { query, setQuery, filters, setFilters, clearFilters, submit, count: activeFilterCount(filters) };
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
  const run = () => {
    s.submit();
    setMenuOpen(false);
    inputRef.current?.blur();
    onDone?.();
  };
  return (
    <form
      role="search"
      className="relative min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <div className="flex h-14 items-center gap-3 rounded-2xl bg-surface pr-2 pl-5 transition focus-within:bg-raised">
        <Search className="size-5 shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={s.query}
          onChange={(e) => s.setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && (setMenuOpen(false), onDone?.())}
          type="search"
          enterKeyHint="search"
          placeholder="Movies, series, shows…"
          aria-label="Search movies and TV"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
        />
        <div className="h-7 w-px bg-line" />
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Filters"
          title="Filters"
          aria-expanded={menuOpen}
          className={cx('relative grid size-10 place-items-center rounded-xl transition', menuOpen ? 'bg-raised text-white' : 'text-muted hover:text-white')}
        >
          <SlidersHorizontal className="size-5" />
          {s.count > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent" />}
        </button>
      </div>
      {menuOpen && <QuickFilterMenu filters={s.filters} set={s.setFilters} onClear={s.clearFilters} onApply={run} placement={placement} />}
    </form>
  );
}

// ---------- top bar ----------

function TopBar() {
  const s = useSearchState();
  const input = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useOutside(menu, () => setMenu(false), box);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !/input|textarea|select/i.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="flex items-center gap-3 pt-5 pb-6 md:gap-4 md:pt-7">
      <div className="lg:hidden">
        <Logo />
      </div>
      <div ref={box} className="hidden min-w-0 flex-1 items-center gap-3 md:flex md:gap-4">
        <label className="relative shrink-0">
          <span className="sr-only">Search in</span>
          <select
            value={s.filters.type}
            onChange={(e) => s.setFilters({ type: e.target.value as Filters['type'] })}
            className="h-14 appearance-none rounded-2xl bg-surface pr-11 pl-5 text-[15px] outline-none hover:bg-raised"
          >
            <option value="all">All</option>
            <option value="movie">Movies</option>
            <option value="tv">TV Shows</option>
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted" />
        </label>
        <SearchField s={s} inputRef={input} menuOpen={menu} setMenuOpen={setMenu} placement="below" />
      </div>
      <NavLink
        to="/profile#profile"
        className={({ isActive }) =>
          cx('ml-auto flex h-14 shrink-0 items-center gap-3 rounded-2xl pr-4 pl-2 transition md:ml-0', isActive ? 'bg-raised' : 'bg-surface hover:bg-raised')
        }
      >
        <span className="grid size-10 place-items-center rounded-xl bg-raised text-accent">
          <User className="size-5" />
        </span>
        <span className="hidden text-[15px] font-medium sm:block">Profile</span>
      </NavLink>
    </header>
  );
}

// ---------- mobile bottom bar (< lg) with pop-up search ----------

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
  const item = (to: string, Icon: typeof Home, label: string, active: boolean) => (
    <Link to={to} aria-label={label} title={label} className={cx('grid h-12 flex-1 place-items-center rounded-2xl transition', active ? 'text-accent' : 'text-muted')}>
      <Icon className="size-[22px]" />
    </Link>
  );

  return (
    <div ref={root} className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
      {panel && (
        <div className="mx-auto mb-3 max-w-xl">
          <SearchField s={s} inputRef={input} menuOpen={menu} setMenuOpen={setMenu} placement="above" onDone={close} />
        </div>
      )}
      <nav className="mx-auto flex max-w-xl items-center gap-1 rounded-3xl bg-surface/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-md">
        {item('/', Home, 'Home', pathname === '/')}
        {item('/movies', Film, 'Movies', pathname === '/movies')}
        <button onClick={onSearchButton} aria-label="Search" title="Search" className="mx-1 grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-black transition active:scale-95">
          <Search className="size-[22px]" />
        </button>
        {item('/tv', Tv, 'TV Shows', pathname === '/tv')}
        {item('/profile#profile', User, 'Profile', pathname === '/profile')}
      </nav>
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
          'fixed right-4 bottom-28 z-30 grid size-12 place-items-center rounded-2xl bg-raised text-white shadow-lg transition-all hover:bg-line lg:right-8 lg:bottom-8',
          show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-16 opacity-0',
        )}
      >
        <ArrowUp className="size-5" />
      </button>
    </>
  );
}
