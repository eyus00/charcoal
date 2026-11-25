/**
 * Starting a stream in a real browser player.
 *
 * A headless Chromium loads a page with the same player library the website uses (hls.js for HLS,
 * dash.js for DASH, the video element for files) and the check passes only when the picture
 * actually advances. The page's requests go through an interceptor that adds the stream's required
 * headers and CORS, which is what the Charcoal helper extension does for a viewer; so "started"
 * means "plays in a desktop browser that has the helper", measured from this machine's network.
 *
 * Playwright is not a dependency of this package: it is looked up at run time, and the benchmark
 * simply reports playback as "not checked" where it is absent.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PlaybackChecker, PlaybackResult } from './run.js';

const PAGE = `<!doctype html><meta charset="utf-8"><video id="v" muted playsinline></video>
<script src="/hls.js"></script><script src="/dash.js"></script>
<script>
  const v = document.getElementById('v');
  window.state = { events: [] };
  window.start = (url, type) => {
    if (type === 'hls' && window.Hls && Hls.isSupported()) {
      const h = new Hls({ maxBufferLength: 8, maxMaxBufferLength: 8, startLevel: 0 });
      h.on(Hls.Events.ERROR, (_e, d) => { state.events.push(d.details); if (d.fatal) state.fatal = d.type + ': ' + d.details; });
      h.loadSource(url); h.attachMedia(v);
    } else if (type === 'dash' && window.dashjs) {
      const p = dashjs.MediaPlayer().create();
      p.on('error', (e) => { state.fatal = 'dash: ' + (e.error && (e.error.message || e.error.code) || 'error'); });
      p.initialize(v, url, true);
    } else {
      v.addEventListener('error', () => { state.fatal = 'media error ' + (v.error ? v.error.code : '?'); });
      v.src = url;
    }
    v.play().catch((e) => { state.playError = String(e); });
  };
</script>`;

export interface PlaybackOptions {
  /** How long a stream gets to show a moving picture. */
  timeoutMs?: number;
  /** Paths of the player libraries; found in the website's dependencies by default. */
  hlsJs?: string;
  dashJs?: string;
  /** At most this many requests per check (a stream that never starts must not download for ever). */
  maxRequests?: number;
}

function findLibrary(name: string): string | undefined {
  for (const from of ['../../../apps/web/package.json', '../package.json']) {
    try {
      return createRequire(new URL(from, import.meta.url)).resolve(name);
    } catch {
      /* try the next place */
    }
  }
  // A package that does not export its dist files by name can still be read from where it is installed.
  for (const root of ['../../../node_modules/', '../../../apps/web/node_modules/']) {
    const file = fileURLToPath(new URL(root + name, import.meta.url));
    if (existsSync(file)) return file;
  }
  return undefined;
}

/** Returns undefined when no browser is available here. */
/* The few parts of Playwright used here, typed locally so the package needs no browser dependency. */
interface PwResponse {
  headers(): Record<string, string>;
}
interface PwRoute {
  request(): { url(): string; method(): string; headers(): Record<string, string> };
  fulfill(o: { status?: number; contentType?: string; body?: string; headers?: Record<string, string>; response?: PwResponse }): Promise<void>;
  fetch(o: { headers?: Record<string, string>; timeout?: number }): Promise<PwResponse>;
  abort(): Promise<void>;
}
interface PwPage {
  goto(url: string): Promise<unknown>;
  evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
  evaluate<T>(fn: () => T): Promise<T>;
  waitForFunction<T>(fn: () => T | false, arg: undefined, o: { timeout: number; polling: number }): Promise<{ jsonValue(): Promise<unknown> }>;
}
interface PwContext {
  route(pattern: string, handler: (route: PwRoute) => Promise<void>): Promise<void>;
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwBrowser {
  newContext(o?: Record<string, unknown>): Promise<PwContext>;
  close(): Promise<void>;
}
interface PwChromium {
  launch(o: Record<string, unknown>): Promise<PwBrowser>;
}

export async function createPlaybackChecker(o: PlaybackOptions = {}): Promise<PlaybackChecker | undefined> {
  let chromium: PwChromium | undefined;
  for (const name of ['playwright', 'playwright-core']) {
    try {
      chromium = (createRequire(import.meta.url)(name) as { chromium: PwChromium }).chromium;
      break;
    } catch {
      /* try the next name */
    }
  }
  if (!chromium) return undefined;
  const hlsPath = o.hlsJs ?? findLibrary('hls.js/dist/hls.min.js');
  const dashPath = o.dashJs ?? findLibrary('dashjs/dist/modern/umd/dash.all.min.js') ?? findLibrary('dashjs/dist/dash.all.min.js');
  const hlsJs = hlsPath ? readFileSync(hlsPath, 'utf8') : '';
  const dashJs = dashPath ? readFileSync(dashPath, 'utf8') : '';
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'], ...(proxy ? { proxy: { server: proxy } } : {}) });
  const timeoutMs = o.timeoutMs ?? 25_000;
  const ORIGIN = 'https://player.bench.invalid';
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' };

  // What this browser can decode, asked once: a stream in a codec it lacks is not a playback failure.
  const probe = await browser.newContext();
  const videoCodecs = await (async () => {
    try {
      const page = await probe.newPage();
      // As source text: a function compiled by the TypeScript loader carries helpers the page does not have.
      return (await page.evaluate(`(() => {
        const ok = (t) => typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(t);
        const out = [];
        if (ok('video/mp4; codecs="avc1.64001f"')) out.push('avc');
        if (ok('video/mp4; codecs="hvc1.1.6.L93.B0"') || ok('video/mp4; codecs="hev1.1.6.L93.B0"')) out.push('hevc');
        if (ok('video/mp4; codecs="av01.0.05M.08"')) out.push('av1');
        if (ok('video/webm; codecs="vp09.00.10.08"') || ok('video/mp4; codecs="vp09.00.10.08"')) out.push('vp9');
        return out;
      })()` as never)) as string[];
    } catch {
      return undefined;
    } finally {
      await probe.close().catch(() => undefined);
    }
  })();

  return {
    videoCodecs,
    async check(stream): Promise<PlaybackResult> {
      const context = await browser.newContext({ ignoreHTTPSErrors: false });
      const started = Date.now();
      let requests = 0;
      try {
        await context.route('**/*', async (route: PwRoute) => {
          const req = route.request();
          const url = req.url();
          if (url === `${ORIGIN}/`) return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
          if (url === `${ORIGIN}/hls.js`) return route.fulfill({ status: 200, contentType: 'text/javascript', body: hlsJs });
          if (url === `${ORIGIN}/dash.js`) return route.fulfill({ status: 200, contentType: 'text/javascript', body: dashJs });
          if (url.startsWith(ORIGIN)) return route.fulfill({ status: 404, body: '' });
          if (++requests > (o.maxRequests ?? 80)) return route.abort();
          if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
          try {
            // What the helper extension does for a viewer: the headers the host insists on, and CORS on the way back.
            const headers = { ...req.headers(), ...stream.headers };
            delete headers.origin;
            if (stream.headers.Origin ?? stream.headers.origin) headers.origin = stream.headers.Origin ?? stream.headers.origin;
            const res = await route.fetch({ headers, timeout: 15_000 });
            await route.fulfill({ response: res, headers: { ...res.headers(), ...cors } });
          } catch {
            await route.abort().catch(() => undefined);
          }
        });
        const page = await context.newPage();
        await page.goto(`${ORIGIN}/`);
        const began = Date.now();
        await page.evaluate((a: string[]) => (window as unknown as { start: (u: string, t: string) => void }).start(a[0], a[1]), [stream.url, stream.type]);
        const outcome = await page
          .waitForFunction(
            () => {
              const v = document.getElementById('v') as HTMLVideoElement;
              const s = (window as unknown as { state: { fatal?: string } }).state;
              if (v.currentTime > 0.25 && v.videoWidth > 0) return { started: true, width: v.videoWidth, height: v.videoHeight };
              if (s.fatal) return { started: false, error: s.fatal };
              return false;
            },
            undefined,
            { timeout: timeoutMs, polling: 200 },
          )
          .then((h: { jsonValue(): Promise<unknown> }) => h.jsonValue() as Promise<{ started: boolean; width?: number; height?: number; error?: string }>)
          .catch(async () => {
            const s = await page.evaluate(() => {
              const v = document.getElementById('v') as HTMLVideoElement;
              const st = (window as unknown as { state: { events: string[]; playError?: string } }).state;
              return { t: v.currentTime, ready: v.readyState, w: v.videoWidth, events: st.events.slice(-3), playError: st.playError };
            });
            return { started: false, error: `no picture after ${timeoutMs / 1000}s (readyState ${s.ready}${s.w ? `, ${s.w}px wide` : ''}${s.events.length ? `, ${s.events.join(', ')}` : ''}${s.playError ? `, ${s.playError}` : ''})` };
          });
        return { ...outcome, ms: Date.now() - began };
      } catch (e) {
        return { started: false, ms: Date.now() - started, error: e instanceof Error ? e.message.split('\n')[0] : String(e) };
      } finally {
        await context.close().catch(() => undefined);
      }
    },
    close: () => browser.close(),
  };
}
