import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import RouteError, { clearChunkReloadFlag } from './pages/RouteError';
import { openInLastMode } from './lib/mode';
import { persistQueries } from './lib/persist';
import './index.css';

// Route-level code splitting: the player (and hls.js) never loads while browsing.
const Discover = lazy(() => import('./pages/Discover'));
const Details = lazy(() => import('./pages/Details'));
const Profile = lazy(() => import('./pages/Profile'));
const Watch = lazy(() => import('./pages/Watch'));
const TraktCallback = lazy(() => import('./pages/TraktCallback'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Anime = lazy(() => import('./pages/Anime'));
const AnimeBrowse = lazy(() => import('./pages/AnimeBrowse'));
const Indian = lazy(() => import('./pages/Indian'));
const Sports = lazy(() => import('./pages/Sports'));
const SportsSchedule = lazy(() => import('./pages/SportsSchedule'));
const SportsChannels = lazy(() => import('./pages/SportsChannels'));
const SportsWatch = lazy(() => import('./pages/SportsWatch'));
const Live = lazy(() => import('./pages/Live'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 10,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      retry: (count, err) => count < 2 && !(err instanceof Error && err.message === 'Not found'),
    },
  },
});
persistQueries(queryClient);

/** /movies and /tv are Discover with that type selected (other params kept). */
function TypeRedirect({ type }: { type: 'movie' | 'tv' }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('type', type);
  return <Navigate to={`/discover?${params}`} replace />;
}

/** Old /search links keep working (same query string). */
function SearchRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/discover${search}`} replace />;
}

/** /library links from the interim version → the profile sections. */
function LibraryRedirect() {
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab');
  const hash = tab === 'history' ? '#history' : tab === 'settings' ? '#settings' : '#watchlist';
  return <Navigate to={`/profile${hash}`} replace />;
}

openInLastMode();

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Home /> },
      { path: 'movies', element: <TypeRedirect type="movie" /> },
      { path: 'tv', element: <TypeRedirect type="tv" /> },
      { path: 'discover', element: <Discover /> },
      { path: 'search', element: <SearchRedirect /> },
      { path: 'movie/:id', element: <Details type="movie" /> },
      { path: 'tv/:id', element: <Details type="tv" /> },
      { path: 'profile', element: <Profile /> },
      { path: 'trakt/callback', element: <TraktCallback /> },
      { path: 'calendar', element: <Calendar /> },
      { path: 'anime', element: <Anime /> },
      { path: 'anime/browse', element: <AnimeBrowse /> },
      { path: 'indian', element: <Indian /> },
      { path: 'sports', element: <Sports /> },
      { path: 'sports/schedule', element: <SportsSchedule /> },
      { path: 'sports/channels', element: <SportsChannels /> },
      { path: 'library', element: <LibraryRedirect /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: 'watch/:type/:id',
    element: <Layout bare />,
    errorElement: <RouteError />,
    children: [{ index: true, element: <Watch /> }],
  },
  {
    // An event or a channel from the sports directory, in its own player.
    path: 'sports/watch/:id',
    element: <Layout bare />,
    errorElement: <RouteError />,
    children: [{ index: true, element: <SportsWatch /> }],
  },
  {
    // A public free-to-air channel, live in Charcoal's player (Sports → Channels).
    path: 'live/:channelId',
    element: <Layout bare />,
    errorElement: <RouteError />,
    children: [{ index: true, element: <Live /> }],
  },
]);

// The app booted fine, so a later stale-chunk error may reload once again.
window.setTimeout(clearChunkReloadFlag, 10_000);

// Once the first page is up and the browser has nothing to do: the code for what a hover or a
// long press opens (the details peek), so it doesn't start with a download. Not on a connection
// the viewer has asked to spare.
if (!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) {
  const whenIdle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 2500));
  whenIdle(() => void import('./components/PeekHost'), { timeout: 6000 });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
