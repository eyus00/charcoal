import { Server } from 'lucide-react';

export interface Source {
  id: string;
  name: string;
  movieUrl: string;
  tvUrl: string;
  rank: number;
}

const vidLinkParams = '?primaryColor=3b82f6&poster=true&autoplay=false';

export const SOURCES: Source[] = [
  {
    id: 'videasy.net',
    name: 'VIDEASY',
    movieUrl: 'https://player.videasy.net/movie/{id}?color=DC2626&nextEpisode=true&episodeSelector=true&autoplay=true',
    tvUrl: 'https://player.videasy.net/tv/{id}/{season}/{episode}?color=DC2626&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true',
    rank: 100, // Highest rank to ensure it's first
  },
  {
    id: 'vidlink.pro',
    name: 'Vid Link',
    movieUrl: `https://vidlink.pro/movie/{id}${vidLinkParams}`,
    tvUrl: `https://vidlink.pro/tv/{id}/{season}/{episode}${vidLinkParams}`,
    rank: 90,
  },
  {
    id: 'vidsrc.pro',
    name: 'VidSrc.pro',
    movieUrl: 'https://vidsrc.pro/embed/movie/{id}',
    tvUrl: 'https://vidsrc.pro/embed/tv/{id}/{season}/{episode}',
    rank: 36,
  },
  {
    id: 'superembed',
    name: 'Super Embed',
    movieUrl: 'https://multiembed.mov/?tmdb=1&video_id={id}',
    tvUrl: `https://multiembed.mov/?tmdb=1&video_id={id}&s={season}&e={episode}`,
    rank: 8,
  },
  {
    id: 'vidsrc.dev',
    name: 'Vid Binge',
    movieUrl: 'https://vidsrc.dev/embed/movie/{id}',
    tvUrl: 'https://vidsrc.dev/embed/tv/{id}/{season}/{episode}',
    rank: 6,
  },
  {
    id: 'vidsrc.to',
    name: 'VidSrc.to',
    movieUrl: 'https://vidsrc.to/embed/movie/{id}',
    tvUrl: 'https://vidsrc.to/embed/tv/{id}/{season}/{episode}',
    rank: 11,
  },
  {
    id: 'vidsrc.cc',
    name: 'VidSrc.cc',
    movieUrl: 'https://vidsrc.cc/v2/embed/movie/{id}',
    tvUrl: 'https://vidsrc.cc/v2/embed/tv/{id}/{season}/{episode}',
    rank: 10,
  },
  {
    id: 'moviesapi.club',
    name: 'Movies Club',
    movieUrl: 'https://moviesapi.club/movie/{id}',
    tvUrl: 'https://moviesapi.club/tv/{id}-{season}-{episode}',
    rank: 13,
  },
  {
    id: 'vidsrc.vip',
    name: 'VidSrc.vip',
    tvUrl: 'https://vidsrc.vip/embed/tv/{id}/{season}/{episode}',
    movieUrl: 'https://vidsrc.vip/embed/movie/{id}',
    rank: 4,
  }
];

export const DEFAULT_SOURCE = SOURCES[0]!;

export function getSource(sourceId?: string | null) {
  if (!sourceId) return DEFAULT_SOURCE;
  return SOURCES.find(source => source.id === sourceId) ?? DEFAULT_SOURCE;
}

export function getTvUrl(
  sourceId: string,
  id: number,
  season: number,
  episode: number
) {
  const source = getSource(sourceId);
  return source.tvUrl
    .replace('{id}', id.toString())
    .replace('{season}', season.toString())
    .replace('{episode}', episode.toString());
}

export function getMovieUrl(sourceId: string, id: number) {
  const source = getSource(sourceId);
  return source.movieUrl.replace('{id}', id.toString());
}