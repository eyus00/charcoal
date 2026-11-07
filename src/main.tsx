import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import './index.css';

// Route-level code splitting: the player (and hls.js) never loads while browsing.
const Catalog = lazy(() => import('./pages/Catalog'));
const Discover = lazy(() => import('./pages/Discover'));
const Details = lazy(() => import('./pages/Details'));
const Profile = lazy(() => import('./pages/Profile'));
const Watch = lazy(() => import('./pages/Watch'));

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

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'movies', element: <Catalog type="movie" /> },
      { path: 'tv', element: <Catalog type="tv" /> },
      { path: 'discover', element: <Discover /> },
      { path: 'search', element: <SearchRedirect /> },
      { path: 'movie/:id', element: <Details type="movie" /> },
      { path: 'tv/:id', element: <Details type="tv" /> },
      { path: 'profile', element: <Profile /> },
      { path: 'library', element: <LibraryRedirect /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  { path: 'watch/:type/:id', element: <Layout bare />, children: [{ index: true, element: <Watch /> }] },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
