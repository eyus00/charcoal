import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

/**
 * Search for movies or TV shows
 * Query params:
 * - query: Search query (required)
 * - type: 'movie' or 'tv' (optional, searches both if not specified)
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { query, type } = req.query;
    const config = (req as any).config;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const endpoint = type === 'tv' 
      ? '/search/tv'
      : type === 'movie'
      ? '/search/movie'
      : '/search/multi';

    const response = await axios.get(`${config.tmdbBaseUrl}${endpoint}`, {
      params: {
        api_key: config.tmdbApiKey,
        query
      }
    });

    res.json({
      success: true,
      data: response.data
    });
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Search failed'
    });
  }
});

/**
 * Get movie details
 * Params:
 * - movieId: TMDB movie ID (required)
 */
router.get('/movie/:movieId', async (req: Request, res: Response) => {
  try {
    const { movieId } = req.params;
    const config = (req as any).config;

    const response = await axios.get(
      `${config.tmdbBaseUrl}/movie/${movieId}`,
      {
        params: {
          api_key: config.tmdbApiKey,
          append_to_response: 'videos,credits'
        }
      }
    );

    res.json({
      success: true,
      data: response.data
    });
  } catch (error: any) {
    console.error('Movie details error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch movie details'
    });
  }
});

/**
 * Get TV show details
 * Params:
 * - tvId: TMDB TV show ID (required)
 */
router.get('/tv/:tvId', async (req: Request, res: Response) => {
  try {
    const { tvId } = req.params;
    const config = (req as any).config;

    const response = await axios.get(
      `${config.tmdbBaseUrl}/tv/${tvId}`,
      {
        params: {
          api_key: config.tmdbApiKey,
          append_to_response: 'videos,credits'
        }
      }
    );

    res.json({
      success: true,
      data: response.data
    });
  } catch (error: any) {
    console.error('TV details error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch TV details'
    });
  }
});

/**
 * Get TV season details
 * Params:
 * - tvId: TMDB TV show ID (required)
 * - seasonNumber: Season number (required)
 */
router.get('/tv/:tvId/season/:seasonNumber', async (req: Request, res: Response) => {
  try {
    const { tvId, seasonNumber } = req.params;
    const config = (req as any).config;

    const response = await axios.get(
      `${config.tmdbBaseUrl}/tv/${tvId}/season/${seasonNumber}`,
      {
        params: {
          api_key: config.tmdbApiKey
        }
      }
    );

    res.json({
      success: true,
      data: response.data
    });
  } catch (error: any) {
    console.error('Season details error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch season details'
    });
  }
});

/**
 * Get TV episode details
 * Params:
 * - tvId: TMDB TV show ID (required)
 * - seasonNumber: Season number (required)
 * - episodeNumber: Episode number (required)
 */
router.get('/tv/:tvId/season/:seasonNumber/episode/:episodeNumber', async (req: Request, res: Response) => {
  try {
    const { tvId, seasonNumber, episodeNumber } = req.params;
    const config = (req as any).config;

    const response = await axios.get(
      `${config.tmdbBaseUrl}/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`,
      {
        params: {
          api_key: config.tmdbApiKey
        }
      }
    );

    res.json({
      success: true,
      data: response.data
    });
  } catch (error: any) {
    console.error('Episode details error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch episode details'
    });
  }
});

/**
 * Get recommendations
 * Params:
 * - type: 'movie' or 'tv' (required)
 * - id: TMDB ID (required)
 */
router.get('/:type(movie|tv)/:id/recommendations', async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    const config = (req as any).config;

    const response = await axios.get(
      `${config.tmdbBaseUrl}/${type}/${id}/recommendations`,
      {
        params: {
          api_key: config.tmdbApiKey
        }
      }
    );

    res.json({
      success: true,
      data: response.data
    });
  } catch (error: any) {
    console.error('Recommendations error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch recommendations'
    });
  }
});

export { router as metaRoutes };
