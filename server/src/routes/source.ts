import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

// Types for stream data
interface StreamQuality {
  quality: string;
  url: string;
}

interface StreamResponse {
  success: boolean;
  data?: {
    title: string;
    type: 'hls' | 'mp4';
    qualities: StreamQuality[];
    captions: Caption[];
    sourceProvider: string;
    duration?: number;
  };
  error?: string;
  fallbacks?: string[];
}

interface Caption {
  language: string;
  url: string;
  default?: boolean;
}

/**
 * Get stream URLs for a movie or TV episode
 * Query params:
 * - tmdbId: TMDB ID of the media (required)
 * - type: 'movie' or 'tv' (required)
 * - season: Season number (required for TV)
 * - episode: Episode number (required for TV)
 * - quality: Preferred quality (optional) - 'best', '1080p', '720p', '480p', 'auto'
 */
router.get('/get', async (req: Request, res: Response) => {
  try {
    const { tmdbId, type, season, episode, quality = 'auto' } = req.query;

    // Validation
    if (!tmdbId || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: tmdbId and type'
      });
    }

    if (type !== 'movie' && type !== 'tv') {
      return res.status(400).json({
        success: false,
        error: 'Type must be "movie" or "tv"'
      });
    }

    if (type === 'tv' && (!season || !episode)) {
      return res.status(400).json({
        success: false,
        error: 'Season and episode are required for TV shows'
      });
    }

    // TODO: Integrate with provider-source for real stream scraping
    // For now, return mock data structure that frontend can use
    const mockResponse: StreamResponse = {
      success: true,
      data: {
        title: `${type === 'movie' ? 'Movie' : 'Episode'} ${tmdbId}`,
        type: 'hls',
        qualities: [
          {
            quality: '1080p',
            url: `https://example.com/stream/1080p/${tmdbId}.m3u8`
          },
          {
            quality: '720p',
            url: `https://example.com/stream/720p/${tmdbId}.m3u8`
          },
          {
            quality: '480p',
            url: `https://example.com/stream/480p/${tmdbId}.m3u8`
          }
        ],
        captions: [
          {
            language: 'English',
            url: `https://example.com/captions/${tmdbId}_en.vtt`,
            default: true
          },
          {
            language: 'Spanish',
            url: `https://example.com/captions/${tmdbId}_es.vtt`
          }
        ],
        sourceProvider: 'placeholder',
        duration: 7200
      },
      fallbacks: [
        'videasy.net',
        'vidlink.pro',
        'vidsrc.pro'
      ]
    };

    res.json(mockResponse);
  } catch (error: any) {
    console.error('Error fetching streams:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch streams'
    });
  }
});

/**
 * Get available sources/providers
 */
router.get('/providers', (req: Request, res: Response) => {
  const providers = [
    { id: 'videasy', name: 'Videasy', priority: 1 },
    { id: 'vidlink', name: 'Vid Link', priority: 2 },
    { id: 'vidsrc', name: 'VidSrc', priority: 3 },
    { id: 'superembed', name: 'Super Embed', priority: 4 }
  ];

  res.json({
    success: true,
    data: providers
  });
});

/**
 * Proxy endpoint for proxying requests through the external proxy
 * This helps bypass CORS and geo-blocking
 */
router.post('/proxy', async (req: Request, res: Response) => {
  try {
    const { url, headers = {} } = req.body;
    const config = (req as any).config;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // Create proxy request through the external proxy service
    const proxyUrl = new URL(config.proxyUrl);
    proxyUrl.searchParams.set('url', url);

    const response = await axios.get(proxyUrl.toString(), {
      headers: {
        ...headers,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000,
      responseType: 'stream'
    });

    // Forward headers and content
    Object.keys(response.headers).forEach(key => {
      if (['content-type', 'content-length', 'content-range'].includes(key.toLowerCase())) {
        res.setHeader(key, response.headers[key]);
      }
    });

    response.data.pipe(res);
  } catch (error: any) {
    console.error('Proxy error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Proxy request failed'
    });
  }
});

export { router as sourceRoutes };
