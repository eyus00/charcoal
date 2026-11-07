import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowUp, Bookmark, Film, History, Home, Search, Settings, SlidersHorizontal, Tv, User, X } from 'lucide-react';
import { EMPTY_FILTERS, activeFilterCount, parseFilters, writeFilters, type Filters } from '../lib/filters';
import { cx } from '../lib/util';
import { QuickFilterMenu } from './Filters';
import { PageSkeleton } from './Skeletons';

/** The one search input on the page; the search buttons focus it directly inside the tap (opens the keyboard). */
const searchInput: { current: HTMLInputElement | null } = { current: null };
const searchCtl = { open: () => {} };

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
  const { pathname } = useLocation();
  const s = useSearchState();
  const [open, setOpen] = useState(pathname === '/search');
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLFormElement>(null);

  // Focus first (same tick as the tap, so mobile keyboards open), then reveal.
  const openSearch = () => {
    searchInput.current?.focus({ preventScroll: true });
    setOpen(true);
  };
  const close = () => {
    setMenu(false);
    setOpen(false);
    searchInput.current?.blur();
  };
  searchCtl.open = openSearch;

  useEffect(() => {
    if (pathname === '/search') setOpen(true);
    else if (!searchInput.current?.value) setOpen(false);
    setMenu(false);
  }, [pathname]);

  useEffect(() => {
    if (!menu && !open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current?.contains(e.target as Node)) return;
      setMenu(false);
      if (!searchInput.current?.value && pathname !== '/search') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menu, open, pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !/input|textarea|select/i.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        searchCtl.open();
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
    <header className="relative z-30 flex h-[76px] items-center gap-3 md:h-[92px] md:gap-4">
      <Wordmark />
      <form
        ref={box}
        role="search"
        className={cx(
          open
            ? 'fixed inset-x-0 top-0 z-50 bg-bg/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-md md:relative md:inset-auto md:ml-auto md:w-full md:max-w-md md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none'
            : 'sr-only',
        )}
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="flex h-12 items-center gap-2 rounded-full bg-surface pr-1.5 pl-4 ring-1 ring-white/10 transition focus-within:ring-white/25 md:bg-black/30 md:backdrop-blur-md">
          <Search className="size-[18px] shrink-0 text-muted" />
          <input
            ref={(el) => {
              searchInput.current = el;
            }}
            value={s.query}
            onChange={(e) => s.setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            tabIndex={open ? 0 : -1}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Search movies & shows"
            aria-label="Search movies and TV"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
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
          <button type="button" aria-label="Close search" onClick={() => (s.setQuery(''), close())} className="grid size-9 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        </div>
        {menu && <QuickFilterMenu filters={s.filters} set={s.setFilters} onClear={s.clearFilters} onApply={run} placement="below" />}
      </form>
      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {!open && (
          <button
            type="button"
            onClick={openSearch}
            aria-label="Search"
            title="Search (/)"
            className="hidden size-12 place-items-center rounded-full bg-black/30 ring-1 ring-white/10 backdrop-blur-md transition hover:bg-black/50 md:grid"
          >
            <Search className="size-5" />
          </button>
        )}
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
      </div>
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
        onClick={() => searchCtl.open()}
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
