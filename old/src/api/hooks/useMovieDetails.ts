import { useQuery, useQueries } from '@tanstack/react-query';
import { mediaService } from '../services/media';
import { useMedia } from './useMedia';

export const useMovieDetails = (id: string | undefined) => {
  const { data: details, isLoading } = useQuery({
    queryKey: ['movie', id],
    queryFn: () => mediaService.getDetails('movie', Number(id)),
    enabled: !!id,
  });

  const { data: contentRating } = useMedia.useContentRating('movie', Number(id));

  return {
    details,
    isLoading,
    contentRating,
  };
};