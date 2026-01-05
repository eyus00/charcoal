/**
 * Manages provider-source integration
 * Handles lazy loading and error handling for provider initialization
 */

let providersInstance: any = null;
let loadPromise: Promise<any> | null = null;

interface ProviderImports {
  buildProviders: any;
  makeSimpleProxyFetcher: any;
  setM3U8ProxyUrl: any;
}

/**
 * Load provider-source dynamically
 * Handles ESM imports and path resolution
 */
async function loadProviderSource(): Promise<ProviderImports | null> {
  try {
    console.log('[PROVIDER-SOURCE] Attempting to load provider-source library...');
    
    // Try the relative import path
    const providerModule = await import('../../provider-source/index.js');
    
    return {
      buildProviders: providerModule.buildProviders,
      makeSimpleProxyFetcher: providerModule.makeSimpleProxyFetcher,
      setM3U8ProxyUrl: providerModule.setM3U8ProxyUrl
    };
  } catch (error: any) {
    console.warn('[PROVIDER-SOURCE] Failed to load provider-source:', error.message);
    return null;
  }
}

/**
 * Initialize and cache provider instance
 */
export async function getProviderInstance(proxyUrl: string) {
  if (providersInstance) {
    return providersInstance;
  }

  // Use a promise to prevent multiple concurrent initialization attempts
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const imports = await loadProviderSource();
      
      if (!imports) {
        console.warn('[PROVIDER-SOURCE] Provider-source imports not available');
        return null;
      }

      const { buildProviders, makeSimpleProxyFetcher, setM3U8ProxyUrl } = imports;

      console.log('[PROVIDER-SOURCE] Building provider instance...');
      
      const fetcher = makeSimpleProxyFetcher(proxyUrl);
      setM3U8ProxyUrl(proxyUrl);

      providersInstance = buildProviders({
        fetcher,
        targets: {
          SOURCES: true,
          EMBEDS: true
        }
      });

      console.log('[PROVIDER-SOURCE] Provider instance initialized successfully');
      return providersInstance;
    } catch (error: any) {
      console.error('[PROVIDER-SOURCE] Failed to initialize:', error.message);
      return null;
    }
  })();

  return loadPromise;
}

/**
 * Check if provider-source is available
 */
export function isProviderSourceAvailable(): boolean {
  return providersInstance !== null;
}

/**
 * Reset provider instance (useful for testing/reloading)
 */
export function resetProviderInstance(): void {
  providersInstance = null;
  loadPromise = null;
  console.log('[PROVIDER-SOURCE] Provider instance reset');
}
