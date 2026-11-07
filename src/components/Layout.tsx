import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowUp, Bookmark, Compass, Film, History, Home, Search, Settings, Tv, User, X } from 'lucide-react';
import { cx } from '../lib/util';
import { PageSkeleton } from './Skeletons';

/** The one search input; search buttons focus it inside the tap so mobile keyboards open. */
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

/** Which section of the app is current (Movies/TV are Discover with a type). */
function useSection() {
  const { pathname, hash } = useLocation();
  const [params] = useSearchParams();
  if (pathname === '/') return 'home';
  if (pathname === '/discover') return params.get('type') === 'movie' ? 'movies' : params.get('type') === 'tv' ? 'tv' : 'discover';
  if (pathname.startsWith('/movie/')) return 'movies';
  if (pathname.startsWith('/tv/')) return 'tv';
  if (pathname === '/profile') return hash ? `profile${hash}` : 'profile';
  return '';
}

// ---------- icon rail (lg+) ----------

const RAIL = [
  { to: '/', label: 'Home', icon: Home, id: 'home' },
  { to: '/discover?type=movie', label: 'Movies', icon: Film, id: 'movies' },
  { to: '/discover?type=tv', label: 'TV Shows', icon: Tv, id: 'tv' },
  { to: '/discover', label: 'Discover', icon: Compass, id: 'discover' },
];
const RAIL_LIBRARY = [
  { to: '/profile#watchlist', label: 'Watchlist', icon: Bookmark, id: 'profile#watchlist' },
  { to: '/profile#history', label: 'History', icon: History, id: 'profile#history' },
  { to: '/profile#settings', label: 'Settings', icon: Settings, id: 'profile#settings' },
  { to: '/profile#profile', label: 'Profile', icon: User, id: 'profile#profile' },
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
  const section = useSection();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[88px] flex-col items-center border-r border-white/5 bg-bg pt-[104px] pb-6 lg:flex">
      <nav className="flex flex-col gap-2">
        {RAIL.map((n) => (
          <RailLink key={n.to} to={n.to} label={n.label} icon={n.icon} active={section === n.id} />
        ))}
      </nav>
      <nav className="mt-auto flex flex-col gap-2">
        {RAIL_LIBRARY.map((n) => (
          <RailLink key={n.to} to={n.to} label={n.label} icon={n.icon} active={section === n.id || (n.id === 'profile#profile' && section === 'profile')} />
        ))}
      </nav>
    </aside>
  );
}

// ---------- top bar: wordmark + universal search ----------

const PLACEHOLDER: Record<string, string> = { movie: 'Search movies', tv: 'Search TV shows' };

function TopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const onDiscover = pathname === '/discover';
  const urlQ = onDiscover ? (params.get('q') ?? '') : '';
  const [text, setText] = useState(urlQ);
  const [open, setOpen] = useState(onDiscover);
  const typing = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  // The results page always shows the bar; elsewhere it's opened on demand.
  useEffect(() => {
    if (onDiscover) setOpen(true);
    else if (!searchInput.current?.value) setOpen(false);
  }, [onDiscover, pathname]);
  useEffect(() => {
    if (!typing.current) setText(urlQ);
  }, [urlQ]);

  // On the results page, typing updates the results live (debounced).
  useEffect(() => {
    if (!onDiscover || !typing.current) return;
    const t = setTimeout(() => {
      typing.current = false;
      const v = text.trim();
      if (v === urlQ) return;
      const next = new URLSearchParams(params);
      if (v) next.set('q', v);
      else next.delete('q');
      setParams(next, { replace: true, preventScrollReset: true });
    }, 350);
    return () => clearTimeout(t);
  }, [text, onDiscover, urlQ, params, setParams]);

  // Close when tapping elsewhere with an empty field (not on the results page).
  useEffect(() => {
    if (!open || onDiscover) return;
    const onDown = (e: PointerEvent) => {
      if (form.current?.contains(e.target as Node) || (e.target as Element).closest?.('[data-search-trigger]')) return;
      if (!searchInput.current?.value) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, onDiscover]);

  // Focus first, inside the tap (opens the keyboard), then reveal.
  searchCtl.open = () => {
    searchInput.current?.focus({ preventScroll: true });
    setOpen(true);
  };

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

  const submit = () => {
    typing.current = false;
    const v = text.trim();
    // On the results page keep the current type/filters; elsewhere search everything.
    const next = new URLSearchParams(onDiscover ? params : undefined);
    if (v) next.set('q', v);
    else next.delete('q');
    navigate(`/discover?${next}`, { replace: onDiscover });
    searchInput.current?.blur();
  };
  const close = () => {
    typing.current = false;
    setText('');
    if (onDiscover && urlQ) {
      const next = new URLSearchParams(params);
      next.delete('q');
      setParams(next, { replace: true });
    }
    if (!onDiscover) setOpen(false);
    searchInput.current?.blur();
  };

  return (
    <header className="relative z-30 flex h-[76px] items-center gap-3 md:h-[92px] md:gap-4">
      <Link to="/" className="shrink-0 text-xl font-semibold tracking-tight" aria-label="Charcoal home">
        Charcoal
      </Link>
      <form
        ref={form}
        role="search"
        className={cx(
          open
            ? 'fixed inset-x-0 top-0 z-50 bg-bg/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-md md:relative md:inset-auto md:ml-auto md:w-full md:max-w-md md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none'
            : 'sr-only',
        )}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex h-12 items-center gap-2 rounded-full bg-surface pr-1.5 pl-4 ring-1 ring-white/10 transition focus-within:ring-white/25 md:bg-black/30 md:backdrop-blur-md">
          <Search className="size-[18px] shrink-0 text-muted" />
          <input
            ref={(el) => {
              searchInput.current = el;
            }}
            value={text}
            onChange={(e) => {
              typing.current = true;
              setText(e.target.value);
            }}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            tabIndex={open ? 0 : -1}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder={onDiscover ? (PLACEHOLDER[params.get('type') ?? ''] ?? 'Search movies & TV shows') : 'Search movies & TV shows'}
            aria-label="Search"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {(text || !onDiscover) && (
            <button type="button" aria-label={onDiscover ? 'Clear search' : 'Close search'} onClick={close} className="grid size-9 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-white">
              <X className="size-4" />
            </button>
          )}
        </div>
      </form>
      {!open && (
        <button
          type="button"
          data-search-trigger
          onClick={() => searchCtl.open()}
          aria-label="Search"
          title="Search (/)"
          className="ml-auto hidden size-12 place-items-center rounded-full bg-black/30 ring-1 ring-white/10 backdrop-blur-md transition hover:bg-black/50 lg:grid"
        >
          <Search className="size-5" />
        </button>
      )}
    </header>
  );
}

// ---------- bottom bar (< lg) ----------

function BottomBar() {
  const section = useSection();
  const item = (to: string, Icon: typeof Home, label: string, active: boolean) => (
    <Link to={to} className={cx('flex flex-1 touch-manipulation flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] transition-colors', active ? 'text-white' : 'text-faint')}>
      <Icon className="size-[22px]" />
      {label}
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex items-end border-t border-white/5 bg-bg/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Main">
      {item('/', Home, 'Home', section === 'home')}
      {item('/discover?type=movie', Film, 'Movies', section === 'movies')}
      <div className="flex flex-1 justify-center">
        {/* Plain static styles: no hover/active states that stick after a tap on touch screens. */}
        <button
          type="button"
          data-search-trigger
          onClick={() => searchCtl.open()}
          aria-label="Search"
          className="-mt-5 mb-2 grid size-14 touch-manipulation place-items-center rounded-full bg-white text-black shadow-lg shadow-black/50 outline-none select-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <Search className="size-6" />
        </button>
      </div>
      {item('/discover?type=tv', Tv, 'TV', section === 'tv')}
      {item('/profile#profile', User, 'Profile', section.startsWith('profile'))}
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
