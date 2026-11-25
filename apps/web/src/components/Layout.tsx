import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, ScrollRestoration, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowUp, CalendarClock, CalendarDays, Clapperboard, Heart, Compass, Film, History, Home, Keyboard, PanelLeftClose, PanelLeftOpen, Radio, Search, Settings, SlidersHorizontal, Tv, User, X } from 'lucide-react';
import { EMPTY_FILTERS, activeFilterCount, genresFor, parseFilters, writeFilters, type Filters } from '../lib/filters';
import { addRecent, clearRecent, getRecent, removeRecent, restoreRecent } from '../lib/recent';
import { MODES, modeHome, useMode, warmMode, type Mode } from '../lib/mode';
import { actions, useStore } from '../lib/store';
import { cx, scrollBehavior, useDebounced } from '../lib/util';
import { QuickFilterMenu } from './Filters';
import { PageSkeleton } from './Skeletons';
import { Wordmark } from './Logo';
import { startReminderLoop } from '../lib/reminders';
import { migrateLibrary, useLibraryReminders } from '../lib/library';
import { startWatchlistSync, syncWatchlistOnStart } from '../lib/trakt';
import Hotkeys, { MOD, hotkeysCtl } from './Hotkeys';
import Kbd from './Kbd';
import { btn } from './Button';
import { OfflineNotice, Toaster, toast } from './Toast';
import { Tip as HoverTip } from './Tip';

// The details peek and the episode list it opens: needed on a hover or a long press, not to paint a page.
const PeekHost = lazy(() => import('./PeekHost'));
// What a search would find, under the field while typing: fetched with the first search, not the first page.
const SearchPreview = lazy(() => import('./SearchPreview'));

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
        <ReminderLoop />
      </>
    );
  }
  return <Shell />;
}

/** Due reminders (calendar) show while Charcoal is open, in any page. */
function ReminderLoop() {
  const navigate = useNavigate();
  useEffect(() => startReminderLoop((url) => navigate(url)), [navigate]);
  // Once: what you've watched (and old follows) join the library.
  useEffect(() => migrateLibrary(), []);
  // Your library's next episodes / streaming days get reminders; checked a moment after load, off the first paint.
  const [later, setLater] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setLater(true), 4000);
    return () => window.clearTimeout(t);
  }, []);
  return later ? <LibraryReminders /> : null;
}

function LibraryReminders() {
  useLibraryReminders();
  return null;
}

function Shell() {
  const sidebarOpen = useStore((s) => s.settings.sidebarOpen);
  // Trakt (when connected): push "To watch" changes as they happen; pull Trakt's watchlist once a visit.
  useEffect(() => {
    syncWatchlistOnStart();
    const stop = startWatchlistSync();
    return () => void stop();
  }, []);
  return (
    <div className={cx('relative min-h-dvh transition-[padding] duration-300 ease-out', sidebarOpen ? 'lg:pl-[232px]' : 'lg:pl-[80px]')}>
      <ScrollRestoration />
      <Rail />
      <div className={'relative min-w-0 px-4 pb-24 md:px-8 lg:px-10 lg:pb-12'}>
        <TopBar hideLogo={sidebarOpen} />
        <main>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      {/* Phones: a title's page is full screen (as it grows out of the details sheet): no tab bar. */}
      <BottomBar />
      <ScrollTop />
      <Hotkeys openSearch={() => searchCtl.open()} />
      <ReminderLoop />
      <Suspense fallback={null}>
        <PeekHost />
      </Suspense>
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
  if (pathname === '/calendar') return 'calendar';
  if (pathname === '/indian') return 'indian';
  if (pathname === '/anime') return 'anime';
  if (pathname === '/anime/browse') return params.get('type') === 'movie' ? 'anime-films' : 'anime-series';
  if (pathname === '/sports') return 'sports';
  if (pathname === '/sports/schedule') return 'sports-schedule';
  if (pathname === '/sports/channels') return 'sports-channels';
  if (pathname === '/profile') return hash && hash !== '#profile' ? `profile${hash}` : 'profile';
  return '';
}

// ---------- icon rail (lg+) ----------

interface RailItem {
  to: string;
  label: string;
  icon: typeof Home;
  id: string;
  keys?: string;
}
interface RailGroup extends RailItem {
  children: RailItem[];
}

const HOME: RailItem = {
  to: '/',
  label: 'Home',
  icon: Home,
  id: 'home',
  keys: 'G H',
};
const DISCOVER: RailGroup = {
  to: '/discover',
  label: 'Discover',
  icon: Compass,
  id: 'discover',
  keys: 'G D',
  children: [
    {
      to: '/discover?type=movie',
      label: 'Movies',
      icon: Film,
      id: 'movies',
      keys: 'G M',
    },
    {
      to: '/discover?type=tv',
      label: 'TV shows',
      icon: Tv,
      id: 'tv',
      keys: 'G T',
    },
    {
      to: '/indian',
      label: 'Indian cinema',
      icon: Clapperboard,
      id: 'indian',
      keys: 'G I',
    },
  ],
};
/** Anime and Sports are three pages each: a flat list, in the order the phone bar shows them. */
const FLAT: Record<Exclude<Mode, 'screen'>, RailItem[]> = {
  anime: [
    { to: '/anime', label: 'Home', icon: Home, id: 'anime', keys: 'G H' },
    { to: '/anime/browse', label: 'Series', icon: Tv, id: 'anime-series', keys: 'G T' },
    { to: '/anime/browse?type=movie', label: 'Films', icon: Film, id: 'anime-films', keys: 'G M' },
  ],
  sports: [
    { to: '/sports', label: 'Live', icon: Radio, id: 'sports', keys: 'G H' },
    { to: '/sports/schedule', label: 'Schedule', icon: CalendarClock, id: 'sports-schedule' },
    { to: '/sports/channels', label: 'Channels', icon: Tv, id: 'sports-channels' },
  ],
};
const PROFILE: RailGroup = {
  to: '/profile',
  label: 'Profile',
  icon: User,
  id: 'profile',
  keys: 'G P',
  children: [
    {
      to: '/profile#history',
      label: 'History',
      icon: History,
      id: 'profile#history',
      keys: 'G Y',
    },
    {
      to: '/profile#library',
      label: 'Library',
      icon: Heart,
      id: 'profile#library',
      keys: 'G L',
    },
    {
      to: '/calendar',
      label: 'Calendar',
      icon: CalendarDays,
      id: 'calendar',
      keys: 'G C',
    },
    {
      to: '/profile#settings',
      label: 'Settings',
      icon: Settings,
      id: 'profile#settings',
      keys: 'G S',
    },
  ],
};

/** Hover label for the collapsed rail. */
function Tip({ label, keys }: { label: string; keys?: string }) {
  return (
    <span className="pointer-events-none absolute left-full z-50 ml-4 flex items-center gap-2 rounded-lg border border-transparent bg-raised px-2.5 py-1 text-sm whitespace-nowrap text-white opacity-0 shadow-lg ring-1 ring-white/5 transition group-hover:opacity-100 group-focus-visible:opacity-100">
      {label}
      {keys && <Kbd>{keys}</Kbd>}
    </span>
  );
}

/**
 * One rail row: a plain icon and label, no boxes. Icons sit at the same x whether the rail is
 * collapsed or expanded, so toggling only reveals or hides the labels.
 */
function RailLink({ item, active, open, within }: { item: RailItem; active: boolean; open: boolean; within?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-label={open ? undefined : item.label}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group relative flex h-10 w-full items-center gap-3 rounded-xl px-[14px] text-sm transition-colors',
        active ? 'bg-white font-medium text-black' : within ? 'text-white' : 'text-muted hover:bg-white/[0.06] hover:text-white',
      )}
    >
      <Icon className="size-5 shrink-0" strokeWidth={active ? 2 : 1.75} />
      {open ? (
        <>
          <span className="truncate">{item.label}</span>
          {item.keys && <Kbd className={cx('ml-auto opacity-0 transition group-hover:opacity-100', active && 'bg-black/10 text-black/60 ring-0')}>{item.keys}</Kbd>}
        </>
      ) : (
        <Tip label={item.label} keys={item.keys} />
      )}
    </Link>
  );
}

/** A section and its sub-sections: just rows, a little space between groups. */
function RailGroupBox({ group, section, open }: { group: RailGroup; section: string; open: boolean }) {
  const childActive = group.children.some((c) => c.id === section);
  return (
    <div role="group" aria-label={group.label} className="flex flex-col gap-0.5">
      <RailLink item={group} open={open} active={section === group.id} within={childActive} />
      <Sep />
      {group.children.map((c) => (
        <RailLink key={c.id} item={c} open={open} active={section === c.id} />
      ))}
    </div>
  );
}

const Sep = () => <span aria-hidden className="mx-3 my-1 h-px bg-white/[0.08]" />;

/**
 * Screen, Anime or Sports. In the open sidebar it is the app's usual pill switch; in the narrow
 * one the same three stack as icons. The compact version sits at the top of the page below lg.
 */
function ModeSwitch({ mode, layout }: { mode: Mode; layout: 'row' | 'column' | 'compact' }) {
  const client = useQueryClient();
  return (
    <nav
      aria-label="Screen, Anime or Sports"
      data-testid="mode-switch"
      className={cx(
        'flex shrink-0 rounded-[24px] p-1',
        layout === 'column' ? 'flex-col bg-surface' : layout === 'row' ? 'bg-surface' : cx('ring-1 backdrop-blur-xl', FLOAT),
      )}
    >
      {MODES.map((m) => {
        const on = m.key === mode;
        return (
          <Link
            key={m.key}
            to={m.home}
            aria-current={on ? 'true' : undefined}
            onPointerEnter={() => !on && warmMode(m.key, client)}
            onFocus={() => !on && warmMode(m.key, client)}
            aria-label={layout === 'column' ? m.label : undefined}
            title={layout === 'column' ? undefined : m.about}
            className={cx(
              'group relative flex touch-manipulation items-center justify-center rounded-full text-sm transition-colors',
              layout === 'column' ? 'size-10' : layout === 'row' ? 'h-9 flex-1' : 'h-9 px-3 min-[400px]:px-4',
              on ? 'bg-white font-medium text-black' : 'text-white/75 hover:text-white',
            )}
          >
            {layout === 'column' ? (
              <>
                <m.icon className="size-5" strokeWidth={on ? 2 : 1.75} />
                <Tip label={m.label} />
              </>
            ) : (
              m.label
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Rail() {
  const section = useSection();
  const mode = useMode();
  const open = useStore((s) => s.settings.sidebarOpen);
  const toggle = () => actions.updateSettings({ sidebarOpen: !open });
  return (
    <aside
      className={cx(
        'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/[0.08] bg-bg px-4 pb-5 transition-[width] duration-300 ease-out lg:flex',
        open ? 'w-[232px] overflow-hidden' : 'w-[80px]',
      )}
    >
      <div className="flex h-[92px] shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={open}
          className="group relative grid size-12 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-white/[0.06] hover:text-white"
        >
          {open ? <PanelLeftClose className="size-5" strokeWidth={1.75} /> : <PanelLeftOpen className="size-5" strokeWidth={1.75} />}
          {!open && <Tip label="Expand sidebar" keys="[" />}
        </button>
        {open && (
          <Link to={modeHome(mode)} className="text-xl font-semibold tracking-tight whitespace-nowrap" aria-label="Charcoal home">
            <Wordmark />
          </Link>
        )}
      </div>
      <ModeSwitch mode={mode} layout={open ? 'row' : 'column'} />
      <nav className="mt-5 flex flex-col gap-5" aria-label="Browse">
        {mode === 'screen' ? (
          <>
            <RailLink item={HOME} open={open} active={section === 'home'} />
            <RailGroupBox group={DISCOVER} section={section} open={open} />
          </>
        ) : (
          <div className="flex flex-col gap-0.5">
            {FLAT[mode].map((item) => (
              <RailLink key={item.id} item={item} open={open} active={section === item.id} />
            ))}
          </div>
        )}
      </nav>
      <nav className="mt-auto flex flex-col gap-3" aria-label="Your library">
        <RailGroupBox group={PROFILE} section={section} open={open} />
        <button
          type="button"
          onClick={() => hotkeysCtl.help()}
          aria-label="Keyboard shortcuts"
          className={cx('group relative flex h-10 items-center gap-3 rounded-xl text-sm text-faint transition hover:text-white', open ? 'px-[14px]' : 'justify-center')}
        >
          <Keyboard className="size-5 shrink-0" strokeWidth={1.5} />
          {open && <span>Shortcuts</span>}
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

const PLACEHOLDER: Record<Filters['type'], string> = {
  all: 'Search movies & TV shows',
  movie: 'Search movies',
  tv: 'Search TV shows',
};

/**
 * What the search bar searches in each part of Charcoal, and the page that shows the results.
 * Screen has the full filter set; Anime and Sports search by text, on a page with its own switches.
 */
const SEARCH: Record<Mode, { path: string; filters?: boolean; placeholder?: string }> = {
  screen: { path: '/discover', filters: true },
  anime: { path: '/anime/browse', placeholder: 'Search anime' },
  sports: { path: '/sports', placeholder: 'Search teams and leagues' },
};

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
  const mode = useMode();
  const target = SEARCH[mode];
  // "onDiscover": on the page that shows this part's results (Discover, for Screen).
  const onDiscover = pathname === target.path;
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

  // Discover is the search page, so its field is always out. Anime's and Sports' results pages are
  // pages in their own right: the field is out there only while there is something searched for.
  const showing = onDiscover && (!!target.filters || !!urlQ);
  useEffect(() => {
    if (showing) setOpen(true);
    else if (!searchInput.current?.value || !onDiscover) setOpen(false);
    setMenu(false);
  }, [showing, onDiscover, pathname]);

  // Another part of Charcoal: what was typed for the last one doesn't carry over.
  useEffect(() => {
    typing.current = false;
    setText('');
    setDraft(EMPTY_FILTERS);
  }, [mode]);

  // URL → draft (results page only), unless the user is mid-typing.
  useEffect(() => {
    if (!onDiscover || typing.current) return;
    const p = new URLSearchParams(urlKey);
    setText(p.get('q') ?? '');
    setDraft(parseFilters(p));
  }, [onDiscover, urlKey]);

  const apply = (q: string, f: Filters, replace: boolean) => {
    // Screen: the draft is the whole query. Anime and Sports: the page's own switches stay as they are.
    // (Read from the address itself: this also runs from a timer, a moment after the last render.)
    const next = target.filters ? writeFilters(new URLSearchParams(), f) : new URLSearchParams(onDiscover ? window.location.search : undefined);
    if (q) next.set('q', q);
    else next.delete('q');
    const qs = next.toString();
    navigate(qs ? `${target.path}?${qs}` : target.path, { replace, preventScrollReset: true });
  };

  // Live results while typing on the results page.
  useEffect(() => {
    if (!onDiscover || !typing.current) return;
    const t = setTimeout(() => {
      typing.current = false;
      const v = text.trim();
      if (v !== urlQ || (target.filters && draft.type !== parseFilters(params).type)) apply(v, draft, true);
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
    setDraft(onDiscover && target.filters ? parseFilters(params) : EMPTY_FILTERS);
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
  // The preview follows the typing a beat behind (AniList allows 30 requests a minute).
  const typed = useDebounced(text.trim(), 300);
  // (Not on Discover: there the page under the field is already the live result.)
  const previewing = focused && !menu && !(onDiscover && target.filters) && typed.length >= 2 && text.trim().length >= 2;
  const atHome = pathname === modeHome(mode);
  // Below lg there is no sidebar: the switch sits at the top of the pages a section is made of
  // (not on a title's page), and makes way for the search field.
  const section = useSection();

  return (
    <>
      {/* The wordmark sits at the top of the page and scrolls away with it. */}
      <Link
        to={modeHome(mode)}
        className={cx(
          'absolute top-0 left-4 z-30 flex h-[76px] items-center text-2xl font-semibold tracking-tight md:left-8 md:h-[92px] lg:left-10',
          // With the sidebar open, the wordmark moves into it.
          hideLogo && 'lg:hidden',
          // Phones: the wordmark is on Home only; other pages start with their own title. The
          // narrowest phones have room for the switch alone.
          (open || !atHome) && 'max-md:hidden',
          'max-[359px]:hidden',
        )}
        aria-label="Charcoal home"
      >
        <Wordmark />
      </Link>
      {section && !open && (
        <div className="absolute top-0 right-4 z-30 flex h-[76px] items-center md:right-8 md:h-[92px] lg:hidden">
          <ModeSwitch mode={mode} layout="compact" />
        </div>
      )}
      <header
        // Only the search field floats and sticks (as a pill, no bar behind it). The header itself
        // ignores clicks so the page around the pill stays usable.
        className="pointer-events-none sticky top-0 z-30 flex h-[76px] items-center gap-3 md:h-[92px] md:gap-4"
      >
        <form
          ref={form}
          role="search"
          // The recent-searches list stays while focus moves inside the form (so Tab reaches it).
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setFocused(false)}
          className={cx('pointer-events-auto', open ? 'relative w-full md:ml-auto md:max-w-md' : 'sr-only lg:not-sr-only lg:relative lg:ml-auto lg:w-full lg:max-w-md')}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div
            className={cx(
              'group/search pointer-events-auto flex h-12 items-center gap-1.5 rounded-full pr-1.5 pl-4 ring-1 backdrop-blur-xl transition has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-accent',
              FLOAT,
            )}
          >
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
                // Live results never press Enter: remember the query once the user is done typing.
                if (onDiscover) addRecent(text);
              }}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder={target.placeholder ?? PLACEHOLDER[draft.type]}
              aria-label="Search"
              className="ml-1.5 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {!text && <Kbd className="mr-1.5 group-focus-within/search:hidden">{MOD} K</Kbd>}
            {(text || !onDiscover) && (
              <button
                type="button"
                aria-label={onDiscover ? 'Clear search' : 'Close search'}
                onClick={close}
                className={cx('grid size-9 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-white', !text && 'lg:hidden')}
              >
                <X className="size-4" />
              </button>
            )}
            {/* Filters live in the search bar on every page; the clear button sits before them so it doesn't shift. */}
            {target.filters && (
              <button
                type="button"
                onClick={() => setMenu((m) => !m)}
                aria-label={count ? `Filters (${count} active)` : 'Filters'}
                aria-expanded={menu}
                className={cx(
                  'group/tip relative flex h-9 shrink-0 items-center gap-1.5 rounded-full transition',
                  count ? 'px-3' : 'w-9 justify-center',
                  menu ? 'bg-white text-black' : count ? 'bg-white/15 text-white hover:bg-white/20' : 'text-muted hover:bg-white/10 hover:text-white',
                )}
              >
                <SlidersHorizontal className="size-4" />
                <HoverTip label="Filters" side="bottom" align="end" hidden={menu} />
                {count > 0 && <span className="text-xs font-medium tabular-nums">{count}</span>}
              </button>
            )}
          </div>
          {focused && !text && !menu && recent.length > 0 && (
            <div
              className="toast-in absolute inset-x-0 top-full z-50 mt-2 rounded-[18px] border border-transparent bg-raised p-1.5 shadow-2xl ring-1 shadow-black/50 ring-white/5"
              // Keep focus in the input while picking.
              onPointerDown={(e) => e.preventDefault()}
            >
              <div className="flex items-center justify-between px-3 pt-1.5 pb-1 text-xs text-faint">
                Recent searches
                <button
                  type="button"
                  onClick={() => {
                    const before = getRecent();
                    clearRecent();
                    setRecent([]);
                    toast('Recent searches cleared', {
                      label: 'Undo',
                      run: () => restoreRecent(before),
                    });
                  }}
                  className="rounded-full px-2 py-0.5 hover:bg-white/10 hover:text-white"
                >
                  Clear all
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
          {previewing && (
            <Suspense fallback={null}>
              <SearchPreview
                query={typed}
                first={mode}
                onPick={() => {
                  addRecent(text);
                  setFocused(false);
                  searchInput.current?.blur();
                }}
                onAll={submit}
              />
            </Suspense>
          )}
          {menu && (
            <QuickFilterMenu
              filters={draft}
              set={(patch) =>
                setDraft((d) => ({
                  ...d,
                  ...patch,
                  genres: patch.type ? (patch.genres ?? d.genres).filter((g) => genresFor(patch.type!).some((x) => x.slug === g)) : (patch.genres ?? d.genres),
                }))
              }
              onClear={() => setDraft(EMPTY_FILTERS)}
              onApply={submit}
              placement="below"
            />
          )}
        </form>
      </header>
    </>
  );
}

// ---------- bottom bar (< lg) ----------

function BottomBar() {
  const section = useSection();
  const item = (to: string, Icon: typeof Home, label: string, active: boolean) => (
    <Link to={to} className={cx('flex flex-1 touch-manipulation flex-col items-center gap-1 pt-2.5 pb-2 text-micro transition-colors', active ? 'text-white' : 'text-faint')}>
      <Icon className="size-[22px]" />
      {label}
    </Link>
  );
  const mode = useMode();
  // Two places either side of Search, then your profile: the same shape in every part.
  const [first, second, third] =
    mode === 'screen'
      ? [
          { to: '/', icon: Home, label: 'Home', id: 'home' },
          { to: '/discover?type=movie', icon: Film, label: 'Movies', id: 'movies' },
          { to: '/discover?type=tv', icon: Tv, label: 'TV', id: 'tv' },
        ]
      : FLAT[mode];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex items-end border-t border-white/5 bg-bg/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Main">
      {item(first.to, first.icon, first.label, section === first.id)}
      {item(second.to, second.icon, second.label, section === second.id)}
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
      {item(third.to, third.icon, third.label, section === third.id)}
      {item('/profile', User, 'Profile', section.startsWith('profile'))}
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
        onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
        inert={!show}
        aria-label="Scroll to top"
        className={cx(
          btn({ icon: true }),
          // Floats over content, so it keeps a backdrop behind its outline.
          'fixed right-4 bottom-24 z-30 size-11 border border-transparent bg-bg/80 shadow-lg backdrop-blur-md transition-[translate,opacity,background-color,box-shadow] lg:right-8 lg:bottom-8',
          show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-16 opacity-0',
        )}
      >
        <ArrowUp className="size-5" />
      </button>
    </>
  );
}
