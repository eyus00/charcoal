import { OMSSServer } from '@omss/framework';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { knownThirdPartyProxies } from './thirdPartyProxies.js';
import { streamPatterns } from './streamPatterns.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// A single slow provider used to hold the whole response hostage (40s+).
// Every provider call is now capped; a provider that misses the deadline is
// reported in `diagnostics` like any other failure.
const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS ?? 15000);

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`${label} timed out after ${PROVIDER_TIMEOUT_MS}ms`)),
            PROVIDER_TIMEOUT_MS
        );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Railway injects RAILWAY_PUBLIC_DOMAIN; without a public URL every proxied
// stream link would point at http://localhost and fail in the browser.
const PUBLIC_URL =
    process.env.PUBLIC_URL ??
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);

// Same public key the Charcoal frontend ships with; override with TMDB_API_KEY.
const TMDB_API_KEY = process.env.TMDB_API_KEY || '50404130561567acf3e0725aeb09ec5d';

async function main() {
    if (!process.env.TMDB_API_KEY) console.warn('[Jelly] TMDB_API_KEY not set, using the default public key');
    if (!PUBLIC_URL) console.warn('[Jelly] PUBLIC_URL not set; stream URLs will point at localhost');

    const server = new OMSSServer({
        name: 'Jelly',
        version: '1.1.0',

        // Network
        host: process.env.HOST ?? '0.0.0.0',
        port: Number(process.env.PORT ?? 8080),
        publicUrl: PUBLIC_URL,

        // Cache (memory by default, Redis if CACHE_TYPE=redis)
        cache: {
            type: (process.env.CACHE_TYPE as 'memory' | 'redis') ?? 'memory',
            ttl: {
                sources: 60 * 60,
                subtitles: 60 * 60 * 24
            },
            redis: {
                host: process.env.REDIS_HOST ?? 'localhost',
                port: Number(process.env.REDIS_PORT ?? 6379),
                password: process.env.REDIS_PASSWORD
            }
        },

        // TMDB
        tmdb: {
            apiKey: TMDB_API_KEY,
            cacheTTL: 24 * 60 * 60
        },

        // Third-party proxy removal + which upstream URLs must be streamed
        // (not buffered in memory). Without streamPatterns, video from hosts
        // whose URLs have no file extension (pixeldrain, workers.dev, ...) was
        // fully downloaded into memory and failed on the 30s timeout.
        proxyConfig: {
            knownThirdPartyProxies,
            streamPatterns
        },

        cors: {
            origin: process.env.CORS_ORIGIN ?? '*',
            methods: ['GET', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
            exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'ETag'],
            preflightContinue: false,
            optionsSuccessStatus: 204
        }
    });

    const registry = server.getRegistry();
    await registry.discoverProviders(path.join(__dirname, './providers/'));

    for (const provider of registry.getProviders()) {
        const getMovie = provider.getMovieSources.bind(provider);
        const getTV = provider.getTVSources.bind(provider);
        provider.getMovieSources = (media) => withTimeout(getMovie(media), provider.name);
        provider.getTVSources = (media) => withTimeout(getTV(media), provider.name);
    }

    await server.start();
}

main().catch((error) => {
    console.error('[Fatal] Server failed to start:');
    console.error(error);
    process.exit(1);
});
