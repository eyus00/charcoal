import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { ArrowUp, Bookmark, Compass, Film, History, Home, Search, Settings, Tv, User } from 'lucide-react';
import { cx } from '../lib/util';
import { PageSkeleton } from './Skeletons';

/**
 * Mobile browsers only open the keyboard if an input is focused inside the tap.
 * The search buttons focus this hidden "primer" input synchronously, navigate to
 * Discover, and Discover moves focus to its own search box (the keyboard stays up).
 */
const primer: { current: HTMLInputElement | null } = { current: null };
function useOpenSearch() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return () => {
    primer.current?.focus({ preventScroll: true });
    navigate(pathname === '/discover' ? `/discover${search}` : '/discover', { state: { focus: true }, replace: pathname === '/discover' });
  };
}

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
      <input
        ref={(el) => {
          primer.current = el;
        }}
        aria-hidden
        tabIndex={-1}
        type="search"
        className="pointer-events-none fixed top-0 left-0 size-px opacity-0"
      />
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
  { to: '/discover', label: 'Discover', icon: Compass, match: (p: string) => p === '/discover' },
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

// ---------- top bar: wordmark, search shortcut (desktop), profile ----------

function TopBar() {
  const openSearch = useOpenSearch();
  const openRef = useRef(openSearch);
  openRef.current = openSearch;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !/input|textarea|select/i.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        openRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const round = 'grid size-11 shrink-0 place-items-center rounded-full ring-1 ring-white/10 backdrop-blur-md transition md:size-12';
  return (
    <header className="relative z-30 flex h-[76px] items-center gap-3 md:h-[92px]">
      <Wordmark />
      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <button type="button" onClick={openSearch} aria-label="Search" title="Search (/)" className={cx(round, 'hidden bg-black/30 hover:bg-black/50 lg:grid')}>
          <Search className="size-5" />
        </button>
        <NavLink to="/profile#profile" aria-label="Profile" title="Profile" className={({ isActive }) => cx(round, isActive ? 'bg-white text-black' : 'bg-black/30 text-white hover:bg-black/50')}>
          <User className="size-5" />
        </NavLink>
      </div>
    </header>
  );
}

// ---------- bottom bar (< lg), fixed to the screen edge ----------

function BottomBar() {
  const { pathname } = useLocation();
  const openSearch = useOpenSearch();
  const item = (to: string, Icon: typeof Home, label: string, active: boolean) => (
    <Link to={to} className={cx('flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] transition', active ? 'text-white' : 'text-faint')}>
      <Icon className="size-[22px]" />
      {label}
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex items-end border-t border-white/5 bg-bg/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Main">
      {item('/', Home, 'Home', pathname === '/')}
      {item('/movies', Film, 'Movies', pathname === '/movies')}
      <div className="flex flex-1 justify-center">
        <button
          onClick={openSearch}
          aria-label="Search and discover"
          className={cx(
            '-mt-6 mb-2 grid size-14 place-items-center rounded-full shadow-lg shadow-black/50 ring-4 ring-bg transition active:scale-95',
            pathname === '/discover' ? 'bg-white text-black' : 'bg-raised text-white',
          )}
        >
          <Search className="size-6" />
        </button>
      </div>
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
