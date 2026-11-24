import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import DetailsPeek from '../player/DetailsPeek';
import EpisodeSelector from './EpisodeSelector';
import { peek, usePeek } from '../lib/peek';
import { q, type Details } from '../lib/tmdb';

/**
 * Shows the details peek opened from a card (see lib/peek); closes when the page changes. For
 * TV, Play opens the episode list (like the details page), which resumes / plays from its footer.
 */
export default function PeekHost() {
  const target = usePeek();
  const { pathname } = useLocation();
  const [episodesOf, setEpisodesOf] = useState<Details | null>(null);
  useEffect(() => {
    peek.close();
    setEpisodesOf(null);
  }, [pathname]);
  const { data } = useQuery({ ...q.details(target?.type ?? 'movie', target?.id ?? 0), enabled: !!target });
  return (
    <>
      {target && data && data.id === target.id && (
        <DetailsPeek
          key={`${target.type}-${target.id}-${target.mode}`}
          d={data}
          type={target.type}
          detailsUrl={`/${target.type}/${target.id}`}
          onClose={peek.close}
          mini={target.mode === 'mini'}
          anchor={target.anchor}
          episode={target.episode}
          onEpisodes={() => {
            peek.close();
            setEpisodesOf(data);
          }}
        />
      )}
      {episodesOf && <EpisodeSelector show={episodesOf} onClose={() => setEpisodesOf(null)} />}
    </>
  );
}
