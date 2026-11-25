/**
 * Charcoal has three parts that share one shell, one library and one player:
 *
 *   screen  movies and TV shows
 *   anime   the same catalogue cut down to anime, searched the way anime sites number it
 *   sports  live events and channels
 *
 * The part you are in follows the page: /anime… is Anime, /sports… is Sports, the home page and
 * Discover are Screen. Pages that belong to all three (a title, your profile, the calendar) keep
 * the part you came from, which is also where opening Charcoal next time lands.
 */
import { MonitorPlay, Sparkles, Trophy, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import type { QueryClient } from '@tanstack/react-query';
import { actions, getState, useStore } from './store';

export type Mode = 'screen' | 'anime' | 'sports';

export const MODES: { key: Mode; label: string; home: string; icon: LucideIcon; about: string }[] = [
  { key: 'screen', label: 'Screen', home: '/', icon: MonitorPlay, about: 'Movies and TV shows' },
  { key: 'anime', label: 'Anime', home: '/anime', icon: Sparkles, about: 'Series and films from Japan' },
  { key: 'sports', label: 'Sports', home: '/sports', icon: Trophy, about: 'Live events and channels' },
];

export const modeHome = (mode: Mode) => MODES.find((m) => m.key === mode)!.home;

/** The part a page belongs to; undefined for pages shared by all three. */
export function modeOfPath(pathname: string): Mode | undefined {
  const first = pathname.split('/')[1] ?? '';
  if (first === 'anime') return 'anime';
  if (first === 'sports' || first === 'live') return 'sports';
  if (first === '' || first === 'discover' || first === 'indian') return 'screen';
  return undefined;
}

/** The part of Charcoal on screen now. */
export function useMode(): Mode {
  const { pathname } = useLocation();
  const kept = useStore((s) => s.settings.mode);
  const here = modeOfPath(pathname);
  useEffect(() => {
    if (here && here !== getState().settings.mode) actions.updateSettings({ mode: here });
  }, [here]);
  return here ?? kept;
}

/**
 * The pointer is on a part's name: fetch its home's code, and for Sports what is on, so the
 * click that follows opens a page that is already there. (Imported on demand: none of it is in
 * the first download.)
 */
export function warmMode(mode: Mode, client: QueryClient) {
  if (mode === 'anime') void import('../pages/Anime');
  if (mode === 'sports') {
    void import('../pages/Sports');
    void import('./sports').then((m) => m.prefetchDirectory(client));
  }
}

/**
 * Opening Charcoal itself (not a link to a page) lands in the part used last. Called once, before
 * the router reads the address.
 */
export function openInLastMode() {
  if (location.pathname !== '/' || location.search || location.hash) return;
  const mode = getState().settings.mode;
  if (mode !== 'screen') history.replaceState(history.state, '', modeHome(mode));
}
