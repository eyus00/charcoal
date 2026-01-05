import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getProviderInstance } from '../utils/providerManager.js';

const router = Router();

// Types for stream data
interface StreamQuality {
  quality: string;
  url: string;
}

interface Caption {
  language: string;
  url: string;
  default?: boolean;
}

export interface StreamResponse {
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


/**
 * Convert provider stream format to our format
 */
function convertStreamToQuality(stream: any): StreamQuality[] {
  const qualities: StreamQuality[] = [];

  try {
    // Handle HLS streams
    if (stream.type === 'hls') {
      const url = stream.playlist;
      if (url) {
        qualities.push({
          quality: stream.quality || 'auto',
          url
        });
      }
    }
    // Handle file-based streams (MP4, WebM, etc.)
    else if (stream.type === 'file') {
      if (stream.file && stream.file.url) {
        qualities.push({
          quality: stream.quality || 'auto',
          url: stream.file.url
        });
      }
    }
  } catch (error) {
    console.error('Error converting stream:', error);
  }

  return qualities;
}

/**
 * Extract captions from provider output
 */
function extractCaptions(output: any): Caption[] {
  const captions: Caption[] = [];

  try {
    if (output.captions && Array.isArray(output.captions)) {
      output.captions.forEach((caption: any, index: number) => {
        captions.push({
          language: caption.label || caption.language || `Subtitle ${index + 1}`,
          url: caption.url || caption.src || '',
          default: index === 0
        });
      });
    }
  } catch (error) {
    console.error('Error extracting captions:', error);
  }

  return captions;
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
    const config = (req as any).config;

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

    try {
      // Try to use provider-source if available
      let isUsingProviderSource = false;

      try {
        // Initialize providers
        const providers = await getProviderInstance(config.proxyUrl);

        if (!providers) {
          throw new Error('Provider-source not available');
        }

        // Build media object for provider
        const media = {
          type: type === 'movie' ? 'movie' : 'show',
          tmdbId: Number(tmdbId),
          ...(type === 'tv' && {
            season: {
              number: Number(season)
            },
            episode: {
              number: Number(episode)
            }
          })
        };

        console.log(`[STREAM] Scraping ${type} ${tmdbId}${type === 'tv' ? ` S${season}E${episode}` : ''}`);

        // Run providers to get streams
        const results = await providers.runSourceScraper({
          media,
          timeout: 10000,
          events: {
            onStart: (ev: any) => console.log(`[SCRAPER] Starting: ${ev.id}`),
            onSuccess: (ev: any) => console.log(`[SCRAPER] Success: ${ev.id}`),
            onError: (ev: any) => console.log(`[SCRAPER] Error: ${ev.id} - ${ev.error}`)
          }
        });

        if (results && results.sources && results.sources.length > 0) {
          isUsingProviderSource = true;

          // Get first available source
          const source = results.sources[0];

          // Collect all qualities from all embedded streams
          const allQualities: Map<string, StreamQuality> = new Map();

          if (source.embeds && Array.isArray(source.embeds)) {
            for (const embed of source.embeds) {
              if (embed.stream && Array.isArray(embed.stream)) {
                for (const stream of embed.stream) {
                  const qualities = convertStreamToQuality(stream);
                  qualities.forEach(q => {
                    // Use quality as key to avoid duplicates
                    if (!allQualities.has(q.quality)) {
                      allQualities.set(q.quality, q);
                    }
                  });
                }
              }
            }
          }

          // If no qualities found in embeds, try direct streams
          if (allQualities.size === 0 && source.stream && Array.isArray(source.stream)) {
            for (const stream of source.stream) {
              const qualities = convertStreamToQuality(stream);
              qualities.forEach(q => {
                if (!allQualities.has(q.quality)) {
                  allQualities.set(q.quality, q);
                }
              });
            }
          }

          // Extract captions
          const captions = extractCaptions(source);

          // Build response
          const qualitiesArray = Array.from(allQualities.values());

          if (qualitiesArray.length > 0) {
            const response: StreamResponse = {
              success: true,
              data: {
                title: media.tmdbId.toString(),
                type: qualitiesArray[0].url.includes('.m3u8') ? 'hls' : 'mp4',
                qualities: qualitiesArray,
                captions,
                sourceProvider: source.name || 'unknown',
                duration: undefined
              },
              fallbacks: ['videasy.net', 'vidlink.pro', 'vidsrc.pro']
            };

            console.log(`[STREAM] Success: ${qualitiesArray.length} quality options found`);
            return res.json(response);
          }
        }
      } catch (scraperError: any) {
        console.warn(`[SCRAPER] Provider source unavailable or failed: ${scraperError.message}`);
      }

      // If provider-source is not available or failed, return fallback response
      if (!isUsingProviderSource) {
        console.log(`[STREAM] Falling back to embedded players for ${type} ${tmdbId}`);
        return res.status(200).json({
          success: false,
          error: 'Real stream scraping unavailable, using embedded players',
          fallbacks: ['videasy.net', 'vidlink.pro', 'vidsrc.pro', 'superembed']
        });
      }

    } catch (error: any) {
      console.error('[STREAM ERROR]', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch streams',
        fallbacks: ['videasy.net', 'vidlink.pro', 'vidsrc.pro']
      });
    }

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
