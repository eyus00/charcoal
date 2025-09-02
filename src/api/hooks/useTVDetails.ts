import { useQuery, useQueries } from '@tanstack/react-query';
import { mediaService } from '../services/media';

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

  const contentRatingQuery = useQueries({
    queries: [{
      queryKey: ['contentRating', id],
      queryFn: async () => {
        const response = await fetch(
          `https://api.themoviedb.org/3/tv/${id}?api_key=50404130561567acf3e0725aeb09ec5d&append_to_response=content_ratings`
        );
        const data = await response.json();
        const usRating = data.content_ratings?.results?.find(
          (r: any) => r.iso_3166_1 === 'US'
        )?.rating;
        return usRating || 'NR';
      },
      enabled: !!id,
    }]
  });

  const seasons = seasonQueries
    .filter(query => query.data)
    .map(query => query.data);

  const contentRating = contentRatingQuery[0]?.data;

  return {
    details,
    isLoading,
    seasons,
    contentRating,
  };
};