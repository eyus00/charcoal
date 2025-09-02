import { useQuery, useQueries } from '@tanstack/react-query';
import { mediaService } from '../services/media';

export const useMovieDetails = (id: string | undefined) => {
  const { data: details, isLoading } = useQuery({
    queryKey: ['movie', id],
    queryFn: () => mediaService.getDetails('movie', Number(id)),
    enabled: !!id,
  });

  const contentRatingQuery = useQueries({
    queries: [{
      queryKey: ['contentRating', id],
      queryFn: async () => {
        const response = await fetch(
          `https://api.themoviedb.org/3/movie/${id}?api_key=50404130561567acf3e0725aeb09ec5d&append_to_response=content_ratings`
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

  const contentRating = contentRatingQuery[0]?.data;

  return {
    details,
    isLoading,
    contentRating,
  };
};