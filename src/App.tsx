import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Home from './pages/Home';
import Movies from './pages/Movies';
import TVShows from './pages/TVShows';
import Search from './pages/Search';
import MovieDetails from './pages/MovieDetails';
import TVDetails from './pages/TVDetails';
import WatchPage from './pages/WatchPage';
import Profile from './pages/Profile';
import ScrollHandle from './components/ScrollHandle';
import { useStore } from './store/useStore';

const queryClient = new QueryClient();

function App() {
  const { darkMode } = useStore();

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="movies" element={<Movies />} />
            <Route path="movie/:id" element={<MovieDetails />} />
            <Route path="tv" element={<TVShows />} />
            <Route path="tv/:id" element={<TVDetails />} />
            <Route path="search" element={<Search />} />
            <Route path="profile" element={<Profile />} />
          </Route>
          <Route path="/watch/:mediaType/:id" element={<WatchPage />} />
        </Routes>
        <ScrollHandle />
      </Router>
    </QueryClientProvider>
  );
}

export default App