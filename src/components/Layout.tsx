import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowUp, Bookmark, Compass, Film, History, Home, Keyboard, PanelLeftClose, PanelLeftOpen, Search, Settings, SlidersHorizontal, Tv, User, X } from 'lucide-react';
import { EMPTY_FILTERS, activeFilterCount, genresFor, parseFilters, writeFilters, type Filters } from '../lib/filters';
import { addRecent, clearRecent, getRecent, removeRecent } from '../lib/recent';
import { actions, useStore } from '../lib/store';
import { cx } from '../lib/util';
import { QuickFilterMenu } from './Filters';
import { PageSkeleton } from './Skeletons';
import { LogoMark } from './Logo';
import Hotkeys, { MOD, hotkeysCtl } from './Hotkeys';
import Kbd from './Kbd';
import { OfflineNotice, Toaster } from './Toast';

/** The one search input; search buttons focus it inside the tap so mobile keyboards open. */
const searchInput: { current: HTMLInputElement | null } = { current: null };
const searchCtl = { open: () => {} };

export default function Layout({ bare = false }: { bare?: boolean }) {
  if (bare) {
    return (
      <>
        <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
          <Outlet />
        </Suspense>
        <Toaster />
        <OfflineNotice />
        <Hotkeys />
      </>
    );
  }
  return <Shell />;
}

function Shell() {
  const sidebarOpen = useStore((s) => s.settings.sidebarOpen);
  return (
    <div className={cx('relative min-h-dvh transition-[padding] duration-300 ease-out', sidebarOpen ? 'lg:pl-[248px]' : 'lg:pl-[88px]')}>
      <ScrollRestoration />
      <Rail />
      <div className="min-w-0 px-4 pb-24 md:px-8 lg:px-10 lg:pb-12">
        <TopBar hideLogo={sidebarOpen} />
        <main>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <BottomBar />
      <ScrollTop />
      <Hotkeys openSearch={() => searchCtl.open()} />
      <Toaster />
      <OfflineNotice />
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

/** Hover label for the collapsed rail. */
function Tip({ label, keys }: { label: string; keys?: string }) {
  return (
    <span className="pointer-events-none absolute left-full z-50 ml-4 flex items-center gap-2 rounded-lg bg-raised px-2.5 py-1 text-sm whitespace-nowrap text-white opacity-0 shadow-lg ring-1 ring-white/5 transition group-hover:opacity-100 group-focus-visible:opacity-100">
      {label}
      {keys && <Kbd>{keys}</Kbd>}
    </span>
  );
}

/**
 * One rail row. Icons sit at the same x whether the rail is collapsed or expanded,
 * so toggling only reveals/hides the labels.
 */
function RailLink({ item, active, open, size, within }: { item: RailItem; active: boolean; open: boolean; size: 'lg' | 'sm'; within?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-label={open ? undefined : item.label}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group relative flex w-full items-center gap-3 transition-colors',
        size === 'lg' ? 'h-12 rounded-2xl px-[14px]' : 'h-10 rounded-xl px-[10px]',
        active ? 'bg-white text-black' : within ? 'text-white' : 'text-muted hover:bg-white/[0.06] hover:text-white',
      )}
    >
      <Icon className="size-5 shrink-0" />
      {open ? (
        <>
          <span className={cx('truncate text-sm', size === 'lg' || within || active ? 'font-medium' : '')}>{item.label}</span>
          {item.keys && <Kbd className={cx('ml-auto opacity-0 transition group-hover:opacity-100', active && 'bg-black/10 text-black/60 ring-0')}>{item.keys}</Kbd>}
        </>
      ) : (
        <Tip label={item.label} keys={item.keys} />
      )}
    </Link>
  );
}

/** A section and its sub-sections, grouped in one soft container. */
function RailGroupBox({ group, section, open }: { group: RailGroup; section: string; open: boolean }) {
  const childActive = group.children.some((c) => c.id === section);
  return (
    <div role="group" aria-label={group.label} className="flex flex-col gap-0.5 rounded-[20px] bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
      <RailLink item={group} size="sm" open={open} active={section === group.id} within={childActive} />
      <span aria-hidden className="mx-2.5 my-0.5 h-px bg-white/[0.06]" />
      {group.children.map((c) => (
        <RailLink key={c.id} item={c} size="sm" open={open} active={section === c.id} />
      ))}
    </div>
  );
}

function Rail() {
  const section = useSection();
  const open = useStore((s) => s.settings.sidebarOpen);
  const toggle = () => actions.updateSettings({ sidebarOpen: !open });
  return (
    <aside
      className={cx(
        'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/5 bg-bg px-5 pb-5 transition-[width] duration-300 ease-out lg:flex',
        open ? 'w-[248px] overflow-hidden' : 'w-[88px]',
      )}
    >
      <div className="flex h-[92px] shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={open}
          className="group relative grid size-12 shrink-0 place-items-center rounded-2xl text-muted transition hover:bg-white/[0.06] hover:text-white"
        >
          {open ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
          {!open && <Tip label="Expand sidebar" keys="[" />}
        </button>
        {open && (
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight whitespace-nowrap" aria-label="Charcoal home">
            <LogoMark className="size-7" />
            Charcoal
          </Link>
        )}
      </div>
      <nav className="mt-3 flex flex-col gap-3" aria-label="Browse">
        <RailLink item={HOME} size="lg" open={open} active={section === 'home'} />
        <RailGroupBox group={DISCOVER} section={section} open={open} />
      </nav>
      <nav className="mt-auto flex flex-col gap-3" aria-label="Your library">
        <RailGroupBox group={PROFILE} section={section} open={open} />
        <button
          type="button"
          onClick={() => hotkeysCtl.help()}
          aria-label="Keyboard shortcuts"
          className={cx('group relative flex h-10 items-center gap-2 rounded-xl text-faint transition hover:text-white', open ? 'px-[14px]' : 'justify-center')}
        >
          <Keyboard className="size-[18px] shrink-0" />
          {open && <span className="text-sm">Shortcuts</span>}
          <Kbd className={open ? 'ml-auto' : ''}>?</Kbd>
          {!open && <Tip label="Keyboard shortcuts" />}
        </button>
      </nav>
    </aside>
  );
}

// ---------- top bar: wordmark + universal search ----------

/** Floating pill look shared by the logo and the search field (matches the sidebar's group boxes). */
const FLOAT = 'bg-bg/70 ring-white/[0.08] hover:ring-white/15';

const PLACEHOLDER: Record<Filters['type'], string> = { all: 'Search movies & TV shows', movie: 'Search movies', tv: 'Search TV shows' };

/**
 * Universal search. The bar keeps a draft (text + type + quick filters):
 * - the search button always starts a universal search (type All, no filters);
 * - on the results page (/discover) typing writes text, type and filters to the URL live,
 *   and changes made on the page (type switch, filter pills) flow back into the draft;
 * - elsewhere, Enter / "Search" in the quick filters opens the results page.
 */
function TopBar({ hideLogo }: { hideLogo: boolean }) {
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
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
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
    addRecent(text);
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
    <header
      // Sticky on every screen size. No bar behind it: the logo and the search field float as
      // separate pills, styled like the sidebar's group boxes. The header itself ignores clicks so
      // the page between them stays usable. On phones an open search takes the logo's place.
      className="pointer-events-none sticky top-0 z-30 flex h-[76px] items-center gap-3 md:h-[92px] md:gap-4"
    >
      <Link
        to="/"
        className={cx(
          'pointer-events-auto flex h-12 shrink-0 items-center gap-2.5 rounded-full pr-5 pl-2 text-lg font-semibold tracking-tight ring-1 backdrop-blur-xl transition',
          FLOAT,
          hideLogo && 'lg:hidden',
          open && 'max-md:hidden',
        )}
        aria-label="Charcoal home"
      >
        <LogoMark className="size-8" />
        Charcoal
      </Link>
      <form
        ref={form}
        role="search"
        className={cx(
          'pointer-events-auto',
          open
            ? 'relative w-full md:ml-auto md:max-w-md'
            : 'sr-only lg:not-sr-only lg:relative lg:ml-auto lg:w-full lg:max-w-md',
        )}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className={cx('group/search pointer-events-auto flex h-12 items-center gap-1.5 rounded-full pr-1.5 pl-4 ring-1 backdrop-blur-xl transition focus-within:ring-white/25', FLOAT)}>
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
            onFocus={() => {
              setOpen(true);
              setFocused(true);
              setRecent(getRecent());
            }}
            onBlur={() => {
              setFocused(false);
              // Live results never press Enter: remember the query once the user is done typing.
              if (onDiscover) addRecent(text);
            }}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder={PLACEHOLDER[draft.type]}
            aria-label="Search"
            className="ml-1.5 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {!text && <Kbd className="mr-1.5 group-focus-within/search:hidden">{MOD} K</Kbd>}
          {/* Quick filters live in the search bar on every page. */}
          {(
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
        {focused && !text && !menu && recent.length > 0 && (
          <div
            className="absolute inset-x-0 top-full z-50 mt-2 rounded-2xl bg-raised p-1.5 shadow-2xl ring-1 shadow-black/50 ring-white/5"
            // Keep focus in the input while picking.
            onPointerDown={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between px-3 pt-1.5 pb-1 text-xs text-faint">
              Recent searches
              <button
                type="button"
                onClick={() => {
                  clearRecent();
                  setRecent([]);
                }}
                className="rounded-full px-2 py-0.5 hover:bg-white/10 hover:text-white"
              >
                Clear
              </button>
            </div>
            {recent.map((r) => (
              <div key={r} className="group/recent flex items-center rounded-xl hover:bg-white/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    typing.current = false;
                    setText(r);
                    addRecent(r);
                    apply(r, draft, onDiscover);
                    searchInput.current?.blur();
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left text-sm"
                >
                  <History className="size-4 shrink-0 text-faint" />
                  <span className="truncate">{r}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove “${r}” from recent searches`}
                  onClick={() => {
                    removeRecent(r);
                    setRecent(getRecent());
                  }}
                  className="mr-1 grid size-8 shrink-0 place-items-center rounded-full text-faint opacity-0 transition group-hover/recent:opacity-100 hover:bg-white/10 hover:text-white focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {menu && (
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
