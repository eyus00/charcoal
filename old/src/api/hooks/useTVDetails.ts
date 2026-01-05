import { useQuery, useQueries } from '@tanstack/react-query';
import { mediaService } from '../services/media';
import { useMedia } from './useMedia';

export const useTVDetails = (id: string | undefined) => {
  const { data: details, isLoading } = useQuery({
    queryKey: ['tv', id],
    queryFn: () => mediaService.getDetails('tv', Number(id)),
    enabled: !!id,
  });

  const seasonQueries = useQueries({
    queries: (details?.seasons ?? []).map(season => ({
      queryKey: ['season', id, season.season_number],
      queryFn: () => mediaService.getTVSeasonDetails(Number(id), season.season_number),
      enabled: !!details
    }))
  });

  const { data: contentRating } = useMedia.useContentRating('tv', Number(id));

  const seasons = seasonQueries
    .filter(query => query.data)
    .map(query => query.data);

  return {
    details,
    isLoading,
    seasons,
    contentRating,
  };
};