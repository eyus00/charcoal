import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowUp, Bookmark, Film, History, Home, Search, Settings, SlidersHorizontal, Tv, User } from 'lucide-react';
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
    <div className="relative min-h-dvh lg:pl-[88px]">
      <ScrollRestoration />
      <Rail />
      <div className="min-w-0 px-4 pb-32 md:px-8 lg:px-10 lg:pb-12">
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
  <Link to="/" className="flex items-center gap-2.5" aria-label="Charcoal home">
    <img src="/icon.png" alt="" width={34} height={34} className="size-[34px] rounded-xl" />
    <span className="text-lg font-semibold tracking-tight lg:hidden">Charcoal</span>
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
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[88px] flex-col items-center border-r border-white/5 bg-bg py-6 lg:flex">
      <Logo />
      <nav className="mt-10 flex flex-col gap-2">
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
      <div className="flex h-12 items-center gap-3 rounded-full bg-black/30 pr-1.5 pl-4 ring-1 ring-white/10 backdrop-blur-md transition focus-within:bg-black/50 focus-within:ring-white/25">
        <Search className="size-[18px] shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={s.query}
          onChange={(e) => s.setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && (setMenuOpen(false), onDone?.())}
          type="search"
          enterKeyHint="search"
          placeholder="Search movies & shows"
          aria-label="Search movies and TV"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
        />
                <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Filters"
          title="Filters"
          aria-expanded={menuOpen}
          className={cx('relative grid size-9 place-items-center rounded-full transition', menuOpen ? 'bg-white text-black' : 'text-muted hover:bg-white/10 hover:text-white')}
        >
          <SlidersHorizontal className="size-4" />
          {s.count > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-star" />}
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
    <header className="relative z-30 flex items-center gap-3 pt-5 pb-5 md:pt-6">
      <div className="lg:hidden">
        <Logo />
      </div>
      <div ref={box} className="ml-auto hidden w-full max-w-md md:block">
        <SearchField s={s} inputRef={input} menuOpen={menu} setMenuOpen={setMenu} placement="below" />
      </div>
      <NavLink
        to="/profile#profile"
        aria-label="Profile"
        title="Profile"
        className={({ isActive }) =>
          cx('ml-auto grid size-12 shrink-0 place-items-center rounded-full ring-1 ring-white/10 backdrop-blur-md transition md:ml-0', isActive ? 'bg-white text-black' : 'bg-black/30 text-white hover:bg-black/50')
        }
      >
        <User className="size-5" />
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
    <Link to={to} aria-label={label} title={label} className={cx('grid h-12 flex-1 place-items-center rounded-2xl transition', active ? 'text-white' : 'text-faint')}>
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
      <nav className="mx-auto flex max-w-xl items-center gap-1 rounded-full bg-surface/90 p-1.5 shadow-2xl shadow-black/40 ring-1 ring-white/5 backdrop-blur-md">
        {item('/', Home, 'Home', pathname === '/')}
        {item('/movies', Film, 'Movies', pathname === '/movies')}
        <button onClick={onSearchButton} aria-label="Search" title="Search" className="mx-1 grid size-12 shrink-0 place-items-center rounded-full bg-white text-black transition active:scale-95">
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
          'fixed right-4 bottom-28 z-30 grid size-12 place-items-center rounded-full bg-raised text-white shadow-lg transition-all hover:bg-line lg:right-8 lg:bottom-8',
          show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-16 opacity-0',
        )}
      >
        <ArrowUp className="size-5" />
      </button>
    </>
  );
}
