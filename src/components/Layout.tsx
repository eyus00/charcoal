import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowUp, Bookmark, Compass, Film, History, Home, Keyboard, Search, Settings, SlidersHorizontal, Tv, User, X } from 'lucide-react';
import { EMPTY_FILTERS, activeFilterCount, genresFor, parseFilters, writeFilters, type Filters } from '../lib/filters';
import { cx } from '../lib/util';
import { QuickFilterMenu } from './Filters';
import { PageSkeleton } from './Skeletons';
import { LogoMark } from './Logo';
import Hotkeys, { MOD, hotkeysCtl } from './Hotkeys';
import Kbd from './Kbd';

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
      <Hotkeys openSearch={() => searchCtl.open()} />
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
  if (pathname === '/profile') return hash && hash !== '#profile' ? `profile${hash}` : 'profile';
  return '';
}

// ---------- icon rail (lg+) ----------

interface RailItem { to: string; label: string; icon: typeof Home; id: string; keys?: string }
interface RailGroup extends RailItem { children: RailItem[] }

const HOME: RailItem = { to: '/', label: 'Home', icon: Home, id: 'home', keys: 'G H' };
const DISCOVER: RailGroup = {
  to: '/discover', label: 'Discover', icon: Compass, id: 'discover', keys: 'G D',
  children: [
    { to: '/discover?type=movie', label: 'Movies', icon: Film, id: 'movies', keys: 'G M' },
    { to: '/discover?type=tv', label: 'TV Shows', icon: Tv, id: 'tv', keys: 'G T' },
  ],
};
const PROFILE: RailGroup = {
  to: '/profile#profile', label: 'Profile', icon: User, id: 'profile', keys: 'G P',
  children: [
    { to: '/profile#history', label: 'History', icon: History, id: 'profile#history', keys: 'G Y' },
    { to: '/profile#watchlist', label: 'Watchlist', icon: Bookmark, id: 'profile#watchlist', keys: 'G W' },
    { to: '/profile#settings', label: 'Settings', icon: Settings, id: 'profile#settings', keys: 'G S' },
  ],
};

function Tip({ label, keys }: { label: string; keys?: string }) {
  return (
    <span className="pointer-events-none absolute left-full z-50 ml-3 flex items-center gap-2 rounded-lg bg-raised px-2.5 py-1 text-sm whitespace-nowrap text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
      {label}
      {keys && <Kbd>{keys}</Kbd>}
    </span>
  );
}

function RailLink({ item, active, child, within }: { item: RailItem; active: boolean; child?: boolean; within?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group relative grid place-items-center transition',
        child ? 'size-10 rounded-xl' : 'size-12 rounded-2xl',
        active ? 'bg-white text-black' : within ? 'bg-surface text-white' : 'text-muted hover:bg-surface hover:text-white',
      )}
    >
      <Icon className={child ? 'size-[18px]' : 'size-5'} />
      <Tip label={item.label} keys={item.keys} />
    </Link>
  );
}

/** A parent icon with its sub-sections hanging below it on a connecting line. */
function RailTree({ group, section }: { group: RailGroup; section: string }) {
  const childActive = group.children.some((c) => c.id === section);
  return (
    <div className="flex flex-col items-center">
      <RailLink item={group} active={section === group.id} within={childActive} />
      <div className="relative mt-1.5 flex flex-col gap-1.5 pl-7">
        {/* trunk + one branch per child */}
        <span aria-hidden className="absolute top-0 bottom-5 left-[17px] w-px bg-white/15" />
        {group.children.map((c) => (
          <div key={c.id} className="relative">
            <span aria-hidden className="absolute top-1/2 -left-[11px] h-px w-[11px] bg-white/15" />
            <RailLink item={c} child active={section === c.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Rail() {
  const section = useSection();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[88px] flex-col items-center border-r border-white/5 bg-bg pt-[104px] pb-5 lg:flex">
      <nav className="flex flex-col items-center gap-2" aria-label="Browse">
        <RailLink item={HOME} active={section === 'home'} />
        <RailTree group={DISCOVER} section={section} />
      </nav>
      <nav className="mt-auto flex flex-col items-center gap-4" aria-label="Your library">
        <RailTree group={PROFILE} section={section} />
        <button type="button" onClick={() => hotkeysCtl.help()} aria-label="Keyboard shortcuts" className="group relative grid h-8 w-10 place-items-center rounded-lg text-xs font-medium text-faint ring-1 ring-white/10 transition hover:text-white hover:ring-white/25">
          <Keyboard className="size-4" />
          <Tip label="Keyboard shortcuts" keys="?" />
        </button>
      </nav>
    </aside>
  );
}

// ---------- top bar: wordmark + universal search ----------

const PLACEHOLDER: Record<Filters['type'], string> = { all: 'Search movies & TV shows', movie: 'Search movies', tv: 'Search TV shows' };

/**
 * Universal search. The bar keeps a draft (text + type + quick filters):
 * - the search button always starts a universal search (type All, no filters);
 * - on the results page (/discover) typing writes text, type and filters to the URL live,
 *   and changes made on the page (type switch, filter pills) flow back into the draft;
 * - elsewhere, Enter / "Search" in the quick filters opens the results page.
 */
function TopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const onDiscover = pathname === '/discover';
  const urlQ = onDiscover ? (params.get('q') ?? '') : '';
  const urlKey = onDiscover ? params.toString() : '';
  const [text, setText] = useState(urlQ);
  const [draft, setDraft] = useState<Filters>(() => (onDiscover ? parseFilters(params) : EMPTY_FILTERS));
  const [open, setOpen] = useState(onDiscover);
  const [menu, setMenu] = useState(false);
  const typing = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (onDiscover) setOpen(true);
    else if (!searchInput.current?.value) setOpen(false);
    setMenu(false);
  }, [onDiscover, pathname]);

  // URL → draft (results page only), unless the user is mid-typing.
  useEffect(() => {
    if (!onDiscover || typing.current) return;
    const p = new URLSearchParams(urlKey);
    setText(p.get('q') ?? '');
    setDraft(parseFilters(p));
  }, [onDiscover, urlKey]);

  const apply = (q: string, f: Filters, replace: boolean) => {
    const next = writeFilters(new URLSearchParams(), f);
    if (q) next.set('q', q);
    navigate(`/discover?${next}`, { replace, preventScrollReset: true });
  };

  // Live results while typing on the results page.
  useEffect(() => {
    if (!onDiscover || !typing.current) return;
    const t = setTimeout(() => {
      typing.current = false;
      const v = text.trim();
      if (v !== urlQ || draft.type !== parseFilters(params).type) apply(v, draft, true);
    }, 350);
    return () => clearTimeout(t);
  }, [text]);

  // Close when tapping elsewhere with an empty field (not on the results page).
  useEffect(() => {
    if (!open && !menu) return;
    const onDown = (e: PointerEvent) => {
      if (form.current?.contains(e.target as Node) || (e.target as Element).closest?.('[data-search-trigger]')) return;
      setMenu(false);
      if (!onDiscover && !searchInput.current?.value) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, menu, onDiscover]);

  // Focus first, inside the tap (opens the keyboard), then reveal a fresh universal search.
  searchCtl.open = () => {
    searchInput.current?.focus({ preventScroll: true });
    setOpen(true);
    setMenu(false);
    // Keep the page's type on Movies / TV (results page); elsewhere start a universal search.
    setDraft(onDiscover ? parseFilters(params) : EMPTY_FILTERS);
  };


  const submit = () => {
    typing.current = false;
    setMenu(false);
    apply(text.trim(), draft, onDiscover);
    searchInput.current?.blur();
  };
  const close = () => {
    typing.current = false;
    setText('');
    setMenu(false);
    if (onDiscover && urlQ) {
      const next = new URLSearchParams(params);
      next.delete('q');
      setParams(next, { replace: true });
    }
    if (!onDiscover) setOpen(false);
    searchInput.current?.blur();
  };
  // Type isn't counted: it's shown by the placeholder (and the page switch on results).
  const count = activeFilterCount(draft);

  return (
    <header className="relative z-30 flex h-[76px] items-center gap-3 md:h-[92px] md:gap-4">
      <Link to="/" className="flex shrink-0 items-center gap-2 text-xl font-semibold tracking-tight" aria-label="Charcoal home">
        <LogoMark className="size-8" />
        Charcoal
      </Link>
      <form
        ref={form}
        role="search"
        className={cx(
          open
            ? 'fixed inset-x-0 top-0 z-50 bg-bg/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-md md:relative md:inset-auto md:ml-auto md:w-full md:max-w-md md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none'
            : 'sr-only lg:not-sr-only lg:relative lg:ml-auto lg:w-full lg:max-w-md',
        )}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="group/search flex h-12 items-center gap-1.5 rounded-full bg-surface pr-1.5 pl-4 ring-1 ring-white/10 transition focus-within:ring-white/25 md:bg-black/30 md:backdrop-blur-md">
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
            onFocus={() => setOpen(true)}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder={PLACEHOLDER[draft.type]}
            aria-label="Search"
            className="ml-1.5 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {!text && <Kbd className="mr-1.5 group-focus-within/search:hidden">{MOD} K</Kbd>}
          {/* Pages with the full filter bar (results / Movies / TV) don't also get quick filters. */}
          {!onDiscover && (
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              aria-label={count ? `Quick filters (${count} active)` : 'Quick filters'}
              title="Filters"
              aria-expanded={menu}
              className={cx(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-full transition',
                count ? 'px-3' : 'w-9 justify-center',
                menu ? 'bg-white text-black' : count ? 'bg-white/15 text-white hover:bg-white/20' : 'text-muted hover:bg-white/10 hover:text-white',
              )}
            >
              <SlidersHorizontal className="size-4" />
              {count > 0 && <span className="text-xs font-medium tabular-nums">{count}</span>}
            </button>
          )}
          {(text || !onDiscover) && (
            <button type="button" aria-label={onDiscover ? 'Clear search' : 'Close search'} onClick={close} className={cx('grid size-9 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-white', !text && 'lg:hidden')}>
              <X className="size-4" />
            </button>
          )}
        </div>
        {menu && !onDiscover && (
          <QuickFilterMenu
            filters={draft}
            set={(patch) => setDraft((d) => ({ ...d, ...patch, genres: patch.type ? (patch.genres ?? d.genres).filter((g) => genresFor(patch.type!).some((x) => x.slug === g)) : (patch.genres ?? d.genres) }))}
            onClear={() => setDraft(EMPTY_FILTERS)}
            onApply={submit}
            placement="below"
          />
        )}
      </form>
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
