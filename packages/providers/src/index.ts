export * from './types.js';
export { nativeFetcher, getJson } from './fetch.js';
import { castle } from './providers/castle.js';
import { vidapi } from './providers/vidapi.js';
import { vixsrc } from './providers/vixsrc.js';
import { febbox } from './providers/febbox.js';
export { checkFebboxToken } from './providers/febbox.js';
import { NotFoundError, type Media, type Provider, type ScrapeContext, type ScrapeResult } from './types.js';

/** Every provider, best first. */
export const providers: Provider[] = [febbox, castle, vixsrc, vidapi].sort((a, b) => b.rank - a.rank);
export { castle, febbox, vidapi, vixsrc };

export interface ProviderOutcome {
  provider: Pick<Provider, 'id' | 'name'>;
  result?: ScrapeResult;
  /** 'notfound' = the title isn't on this source; 'error' = the source failed. */
  status: 'ok' | 'notfound' | 'error';
  error?: string;
  ms: number;
}

/**
 * Runs providers in parallel (each with its own time limit) and reports how each did.
 * `only` limits it to some provider ids.
 */
export async function scrapeAll(
  media: Media,
  ctx: ScrapeContext,
  { only, timeoutMs = 20_000, onResult }: { only?: string[]; timeoutMs?: number; onResult?: (o: ProviderOutcome) => void } = {},
): Promise<ProviderOutcome[]> {
  const list = providers.filter((p) => p.supports.includes(media.type) && (!only || only.includes(p.id)) && (!p.requires || ctx.settings?.[p.requires]));
  return Promise.all(
    list.map(async (p) => {
      const started = Date.now();
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      ctx.signal?.addEventListener('abort', onAbort);
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let outcome: ProviderOutcome;
      try {
        const result = await Promise.race([
          p.scrape(media, { ...ctx, signal: ctrl.signal }),
          new Promise<never>((_, reject) => ctrl.signal.addEventListener('abort', () => reject(new Error(`${p.name} took too long`)))),
        ]);
        outcome = { provider: p, result, status: result.streams.length ? 'ok' : 'notfound', ms: Date.now() - started };
      } catch (e) {
        outcome = { provider: p, status: e instanceof NotFoundError ? 'notfound' : 'error', error: (e as Error)?.message, ms: Date.now() - started };
      } finally {
        clearTimeout(timer);
        ctx.signal?.removeEventListener('abort', onAbort);
      }
      onResult?.(outcome);
      return outcome;
    }),
  );
}
