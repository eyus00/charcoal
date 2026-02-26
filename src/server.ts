// src/server.ts
import { OMSSServer } from '@omss/framework';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { knownThirdPartyProxies } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const server = new OMSSServer({
    name: 'Jelly',
    version: '1.0.0',

    // Network
    host: process.env.HOST ?? '0.0.0.0', // Railway requires 0.0.0.0
    port: Number(process.env.PORT ?? 3000),
    publicUrl: process.env.PUBLIC_URL,

    // Cache (memory only for free tier)
    cache: {
      type: 'memory',
      ttl: {
        sources: 60 * 60, // 1 hour
        subtitles: 60 * 60 * 24 // 24 hours
      }
    },

    // TMDB
    tmdb: {
      apiKey: process.env.TMDB_API_KEY!,
      cacheTTL: 24 * 60 * 60 // 24h
    },

    // Third Party Proxy removal
    proxyConfig: {
      knownThirdPartyProxies: knownThirdPartyProxies
    },

    // Allow frontend requests
    cors: { origin: '*' }
  });

  // Register providers
  const registry = server.getRegistry();
  await registry.discoverProviders(path.join(__dirname, './providers/'));

  await server.start();
  console.log(`Jelly server running at ${process.env.PUBLIC_URL ?? `http://localhost:${server.port}`}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
