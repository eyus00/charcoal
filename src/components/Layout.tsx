import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowUp, Bookmark, Film, Home, Search, Tv, X } from 'lucide-react';
import { cx } from '../lib/util';
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
    <div className="relative min-h-dvh">
      <ScrollRestoration />
      <TopBar />
      <main className="pb-24 md:pb-12">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <MobileNav />
      <ScrollTop />
    </div>
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
          'fixed right-4 bottom-20 z-30 grid size-11 place-items-center rounded-full border border-line bg-raised/90 shadow-lg backdrop-blur-sm transition-all hover:bg-raised md:right-8 md:bottom-8',
          show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
        )}
      >
        <ArrowUp className="size-5" />
      </button>
    </>
  );
}

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/tv', label: 'TV Shows', icon: Tv },
];

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4 md:h-16 md:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <img src="/icon.png" alt="" width={28} height={28} className="rounded-md" />
          <span>Charcoal</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx('rounded-md px-3 py-1.5 text-sm transition-colors', isActive ? 'text-white' : 'text-muted hover:text-white')
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SearchBox className="hidden w-72 md:flex lg:w-80" />
          <NavLink
            to="/library"
            className={({ isActive }) =>
              cx(
                'hidden items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors md:flex',
                isActive ? 'text-white' : 'text-muted hover:text-white',
              )
            }
          >
            <Bookmark className="size-4" /> Library
          </NavLink>
        </div>
      </div>
    </header>
  );
}

/** Live search: typing updates /search?q=… (filters in the URL are kept). Press "/" to focus. */
export function SearchBox({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const onSearch = location.pathname === '/search';
  const urlQ = onSearch ? (params.get('q') ?? '') : '';
  const [value, setValue] = useState(urlQ);
  const input = useRef<HTMLInputElement>(null);
  const typing = useRef(false);

  // Follow the URL (back/forward, links) unless the user is mid-typing.
  useEffect(() => {
    if (!typing.current) setValue(urlQ);
  }, [urlQ]);

  useEffect(() => {
    if (!typing.current) return;
    const t = setTimeout(() => {
      typing.current = false;
      const v = value.trim();
      if (v === urlQ.trim()) return;
      if (!v && !onSearch) return;
      const next = new URLSearchParams(onSearch ? params : undefined);
      if (v) next.set('q', v);
      else next.delete('q');
      navigate(`/search?${next}`, { replace: onSearch });
    }, 300);
    return () => clearTimeout(t);
  }, [value, urlQ, onSearch, params, navigate]);

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
    <form
      role="search"
      className={cx(
        'h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 transition-colors focus-within:border-white/30',
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault();
        typing.current = false;
        const next = new URLSearchParams(onSearch ? params : undefined);
        if (value.trim()) next.set('q', value.trim());
        navigate(`/search?${next}`, { replace: onSearch });
        input.current?.blur();
      }}
    >
      <Search className="size-4 shrink-0 text-faint" />
      <input
        ref={input}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          typing.current = true;
          setValue(e.target.value);
        }}
        type="search"
        enterKeyHint="search"
        placeholder="Search movies & TV"
        aria-label="Search movies and TV"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          className="text-faint hover:text-white"
          onClick={() => {
            typing.current = true;
            setValue('');
            input.current?.focus();
          }}
        >
          <X className="size-4" />
        </button>
      )}
    </form>
  );
}

function MobileNav() {
  const items = [...NAV.slice(0, 1), { to: '/search', label: 'Search', icon: Search }, ...NAV.slice(1), { to: '/library', label: 'Library', icon: Bookmark }];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <div className="grid grid-cols-5">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={'end' in n ? n.end : false}
            className={({ isActive }) =>
              cx('flex flex-col items-center gap-1 py-2.5 text-[11px]', isActive ? 'text-accent' : 'text-muted')
            }
          >
            <n.icon className="size-5" />
            {n.label === 'TV Shows' ? 'TV' : n.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
