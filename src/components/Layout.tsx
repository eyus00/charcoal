import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowUp, Bookmark, Film, History, Home, Search, Settings, SlidersHorizontal, Tv, User, X } from 'lucide-react';
import { EMPTY_FILTERS, activeFilterCount, parseFilters, writeFilters, type Filters } from '../lib/filters';
import { cx } from '../lib/util';
import { QuickFilterMenu } from './Filters';
import { PageSkeleton } from './Skeletons';

/** The one search input on the page; the mobile bar's search button focuses it directly (opens the keyboard). */
const searchInput: { current: HTMLInputElement | null } = { current: null };

export default function Layout({ bare = false }: { bare?: boolean }) {
  if (bare) {
    return (
      <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
        <Outlet />
      </Suspense>
    );
  }
  return (
    <div className="relative min-h-dvh lg:pl-[88px]">
      <ScrollRestoration />
      <Rail />
      <div className="min-w-0 px-4 pb-24 md:px-8 lg:px-10 lg:pb-12">
        <TopBar />
        <main>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <BottomBar />
      <ScrollTop />
    </div>
  );
}

const Wordmark = () => (
  <Link to="/" className="shrink-0 text-xl font-semibold tracking-tight" aria-label="Charcoal home">
    Charcoal
  </Link>
);

// ---------- icon rail (lg+) ----------

const RAIL = [
  { to: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { to: '/movies', label: 'Movies', icon: Film, match: (p: string) => p.startsWith('/movie') },
  { to: '/tv', label: 'TV Shows', icon: Tv, match: (p: string) => p === '/tv' || p.startsWith('/tv/') },
  { to: '/search', label: 'Search', icon: Search, match: (p: string) => p === '/search' },
];
const RAIL_LIBRARY = [
  { to: '/profile#watchlist', label: 'Watchlist', icon: Bookmark, hash: '#watchlist' },
  { to: '/profile#history', label: 'History', icon: History, hash: '#history' },
  { to: '/profile#settings', label: 'Settings', icon: Settings, hash: '#settings' },
];

function RailLink({ to, label, icon: Icon, active }: { to: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <Link
      to={to}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cx('group relative grid size-12 place-items-center rounded-2xl transition', active ? 'bg-white text-black' : 'text-muted hover:bg-surface hover:text-white')}
    >
      <Icon className="size-5" />
      <span className="pointer-events-none absolute left-full ml-3 rounded-lg bg-raised px-2.5 py-1 text-sm whitespace-nowrap text-white opacity-0 shadow-lg transition group-hover:opacity-100">
        {label}
      </span>
    </Link>
  );
}

function Rail() {
  const { pathname, hash } = useLocation();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[88px] flex-col items-center border-r border-white/5 bg-bg pt-[104px] pb-6 lg:flex">
      <nav className="flex flex-col gap-2">
        {RAIL.map((n) => (
          <RailLink key={n.to} to={n.to} label={n.label} icon={n.icon} active={n.match(pathname)} />
        ))}
      </nav>
      <nav className="mt-auto flex flex-col gap-2">
        {RAIL_LIBRARY.map((n) => (
          <RailLink key={n.to} to={n.to} label={n.label} icon={n.icon} active={pathname === '/profile' && hash === n.hash} />
        ))}
      </nav>
    </aside>
  );
}

// ---------- top bar: wordmark, search (+ quick filters), profile ----------

/** Search text + filters. On /search they edit the URL; elsewhere they're a draft applied on submit. */
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

function TopBar() {
  const s = useSearchState();
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menu]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !/input|textarea|select/i.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const run = () => {
    s.submit();
    setMenu(false);
    searchInput.current?.blur();
  };

  return (
    <header className="relative z-30 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-3 pt-4 pb-4 md:flex md:gap-4 md:pt-6 md:pb-5">
      <Wordmark />
      <form
        ref={box}
        role="search"
        className="relative col-span-2 row-start-2 md:ml-auto md:w-full md:max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="flex h-12 items-center gap-3 rounded-full bg-black/30 pr-1.5 pl-4 ring-1 ring-white/10 backdrop-blur-md transition focus-within:bg-black/50 focus-within:ring-white/25">
          <Search className="size-[18px] shrink-0 text-muted" />
          <input
            ref={(el) => {
              searchInput.current = el;
            }}
            value={s.query}
            onChange={(e) => s.setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setMenu(false), e.currentTarget.blur())}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Search movies & shows"
            aria-label="Search movies and TV"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {s.query && (
            <button type="button" aria-label="Clear search" onClick={() => (s.setQuery(''), searchInput.current?.focus())} className="grid size-8 place-items-center rounded-full text-muted hover:text-white">
              <X className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-label="Filters"
            title="Filters"
            aria-expanded={menu}
            className={cx('relative grid size-9 place-items-center rounded-full transition', menu ? 'bg-white text-black' : 'text-muted hover:bg-white/10 hover:text-white')}
          >
            <SlidersHorizontal className="size-4" />
            {s.count > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-star" />}
          </button>
        </div>
        {menu && <QuickFilterMenu filters={s.filters} set={s.setFilters} onClear={s.clearFilters} onApply={run} placement="below" />}
      </form>
      <NavLink
        to="/profile#profile"
        aria-label="Profile"
        title="Profile"
        className={({ isActive }) =>
          cx('grid size-11 shrink-0 place-items-center rounded-full ring-1 ring-white/10 backdrop-blur-md transition md:size-12', isActive ? 'bg-white text-black' : 'bg-black/30 text-white hover:bg-black/50')
        }
      >
        <User className="size-5" />
      </NavLink>
    </header>
  );
}

// ---------- bottom bar (< lg), fixed to the screen edge ----------

function BottomBar() {
  const { pathname } = useLocation();
  const item = (to: string, Icon: typeof Home, label: string, active: boolean) => (
    <Link to={to} className={cx('flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition', active ? 'text-white' : 'text-faint')}>
      <Icon className="size-[22px]" />
      {label}
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-white/5 bg-bg/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Main">
      {item('/', Home, 'Home', pathname === '/')}
      {item('/movies', Film, 'Movies', pathname === '/movies')}
      <button
        onClick={() => {
          // Focus synchronously inside the tap so mobile browsers open the keyboard.
          searchInput.current?.focus();
          window.scrollTo({ top: 0 });
        }}
        className={cx('flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition', pathname === '/search' ? 'text-white' : 'text-faint')}
      >
        <Search className="size-[22px]" />
        Search
      </button>
      {item('/tv', Tv, 'TV', pathname === '/tv')}
      {item('/profile#profile', User, 'Profile', pathname === '/profile')}
    </nav>
  );
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
          'fixed right-4 bottom-24 z-30 grid size-11 place-items-center rounded-full bg-raised text-white shadow-lg transition-all hover:bg-line lg:right-8 lg:bottom-8',
          show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-16 opacity-0',
        )}
      >
        <ArrowUp className="size-5" />
      </button>
    </>
  );
}
