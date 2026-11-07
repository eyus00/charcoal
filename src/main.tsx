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
const Search = lazy(() => import('./pages/Search'));
const Details = lazy(() => import('./pages/Details'));
const Library = lazy(() => import('./pages/Library'));
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

/** Old /profile#history links → /library */
function ProfileRedirect() {
  const { hash } = useLocation();
  const tab = hash === '#history' ? 'history' : 'bookmarks';
  return <Navigate to={`/library?tab=${tab}`} replace />;
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'movies', element: <Catalog type="movie" /> },
      { path: 'tv', element: <Catalog type="tv" /> },
      { path: 'search', element: <Search /> },
      { path: 'movie/:id', element: <Details type="movie" /> },
      { path: 'tv/:id', element: <Details type="tv" /> },
      { path: 'library', element: <Library /> },
      { path: 'profile', element: <ProfileRedirect /> },
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
