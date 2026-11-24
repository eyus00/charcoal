/**
 * The browser worker: a headless Chromium that providers can open pages in, kept on a short lead.
 *
 * What a provider gets is the BrowserSession of the SDK contract. What the worker guarantees:
 *
 * - Isolation. One browser context per provider run: its own cookie jar and storage, no service
 *   workers, no downloads, no permissions, pop-ups closed, gone when the run ends.
 * - Network policy. The page itself may only navigate to hosts the provider's policy allows
 *   (its domain roles, declared extra hosts, hosts its own pages named). Everything a page loads
 *   must be a public address; private and internal addresses are refused. Media files and segments
 *   are noted and then cancelled, so no video ever flows through the worker, and each session has a
 *   request budget. A worker is therefore not a general-purpose proxy: callers of the platform
 *   choose a title, never an address, and a provider cannot make the worker fetch for it outside
 *   these bounds.
 * - Limits. A cap on concurrent sessions with a bounded queue, on pages and requests per session,
 *   on navigation time and on the session's lifetime; the browser is recycled periodically.
 * - Honesty about access. A bot-check interstitial is reported as CHALLENGE as soon as it is seen;
 *   nothing waits it out, clicks through it or disguises the browser. A signed-out or expired
 *   session is AUTH_REQUIRED. The automation flags Chromium sets are left as they are.
 * - Health. Launches, crashes, queue length, challenges and policy blocks are counted; a browser
 *   that keeps crashing is marked down for a cool-off instead of being relaunched in a loop.
 */
import { chromium, type Browser, type BrowserContext, type Frame, type Page, type Route } from 'playwright-core';
import {
  classifyMediaRequest,
  classifyStatus,
  FAILURES,
  isPublicHost,
  isSegmentRequest,
  looksLikeChallenge,
  ProviderError,
  type BrowserOpenOptions,
  type BrowserPage,
  type BrowserRun,
  type BrowserSession,
  type BrowserWait,
  type BrowserWorkerHealth,
  type BrowserWorkerLike,
  type CapturedMedia,
  type FailureCode,
} from '@charcoal/provider-sdk';
import { startEgressGuard, type EgressGuard, type EgressGuardOptions } from './egress.js';
import { cookiesToKeep, liveCookies, memorySessionStore, readSuppliedSession, type SessionStore, type StoredCookie } from './sessions.js';

export interface BrowserWorkerOptions {
  /** Use a browser running elsewhere (its own container) instead of launching one in this process. */
  connect?: { wsEndpoint: string; protocol?: 'playwright' | 'cdp' };
  executablePath?: string;
  headless?: boolean;
  /** Upstream proxy for the browser's traffic. Defaults to HTTPS_PROXY when that is set. */
  proxy?: string;
  userAgent?: string;
  launchArgs?: string[];
  /** Sessions running at once; more wait in a queue. */
  maxSessions?: number;
  maxQueue?: number;
  queueTimeoutMs?: number;
  maxPagesPerSession?: number;
  maxRequestsPerSession?: number;
  navigationTimeoutMs?: number;
  /** Resource types pages are not allowed to load at all. */
  blockResources?: string[];
  recycleAfterSessions?: number;
  recycleAfterMs?: number;
  /** Crashes within `crashWindowMs` before the worker is marked down for `coolOffMs`. */
  maxCrashes?: number;
  crashWindowMs?: number;
  coolOffMs?: number;
  sessions?: SessionStore;
  /** DNS-level check that a host does not resolve to a private address. */
  resolveCheck?: (hostname: string) => Promise<boolean>;
  /**
   * The egress guard every connection of a launched browser passes through (see egress.ts). On by
   * default. It cannot be put in front of a browser running elsewhere (`connect`): that browser's
   * own network must then be restricted where it runs.
   */
  egress?: Omit<EgressGuardOptions, 'upstream'> | false;
  now?: () => number;
}

const DEFAULTS = {
  maxSessions: 2,
  maxQueue: 8,
  queueTimeoutMs: 10_000,
  maxPagesPerSession: 3,
  maxRequestsPerSession: 300,
  navigationTimeoutMs: 15_000,
  blockResources: ['image', 'font', 'media'],
  recycleAfterSessions: 60,
  recycleAfterMs: 30 * 60_000,
  maxCrashes: 3,
  crashWindowMs: 5 * 60_000,
  coolOffMs: 60_000,
};
const LAUNCH_ARGS = ['--disable-dev-shm-usage', '--disable-gpu', '--mute-audio', '--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--js-flags=--max-old-space-size=384'];
const MAX_HTML_CHARS = 2_000_000;
const MAX_EVAL_CHARS = 262_144;
/** Widgets that mean "prove you are human". Their presence explains a page that never shows its content. */
const CHALLENGE_WIDGETS = 'iframe[src*="challenges.cloudflare.com"], iframe[src*="hcaptcha.com"], iframe[src*="recaptcha"], .g-recaptcha, .h-captcha, #challenge-form, #cf-challenge-running';

const NET_ERRORS: [RegExp, FailureCode][] = [
  [/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED/, 'DNS'],
  [/ERR_CERT_|ERR_SSL_|ERR_BAD_SSL/, 'TLS'],
  [/ERR_CONNECTION_|ERR_ADDRESS_UNREACHABLE|ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY_CONNECTION_FAILED|ERR_INTERNET_DISCONNECTED|ERR_EMPTY_RESPONSE/, 'CONNECT'],
  [/ERR_TIMED_OUT|Timeout .* exceeded|TimeoutError/i, 'TIMEOUT'],
];
const classifyNavigation = (e: unknown): FailureCode => {
  const message = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  for (const [re, code] of NET_ERRORS) if (re.test(message)) return code;
  return 'NETWORK';
};

export class BrowserWorker implements BrowserWorkerLike {
  private browser?: Browser;
  private guard?: EgressGuard;
  private launching?: Promise<Browser>;
  private closing = false;
  private active = 0;
  private readonly waiters: { resolve: () => void; reject: (e: Error) => void }[] = [];
  private servedSinceLaunch = 0;
  private crashTimes: number[] = [];
  private downUntil = 0;
  private readonly stats = { launches: 0, crashes: 0, sessionsServed: 0, challenges: 0, policyBlocks: 0, lastError: undefined as string | undefined, lastLaunchAt: undefined as number | undefined, version: undefined as string | undefined };
  private readonly o: BrowserWorkerOptions & typeof DEFAULTS;
  private readonly store: SessionStore;
  private readonly now: () => number;

  constructor(options: BrowserWorkerOptions = {}) {
    this.o = { ...DEFAULTS, ...options };
    this.store = options.sessions ?? memorySessionStore();
    this.now = options.now ?? Date.now;
  }

  health(): BrowserWorkerHealth {
    const down = this.now() < this.downUntil;
    return {
      state: down ? 'down' : !this.browser ? 'stopped' : this.active >= this.o.maxSessions ? 'busy' : 'ready',
      browserVersion: this.stats.version,
      launches: this.stats.launches,
      crashes: this.stats.crashes,
      sessionsOpen: this.active,
      sessionsServed: this.stats.sessionsServed,
      queued: this.waiters.length,
      challenges: this.stats.challenges,
      policyBlocks: this.stats.policyBlocks + (this.guard?.blocked() ?? 0),
      lastError: this.stats.lastError,
      lastLaunchAt: this.stats.lastLaunchAt,
    };
  }

  /** Opens a blank page and runs one expression: is the browser actually alive? */
  async probe(): Promise<{ ok: boolean; ms: number; detail?: string }> {
    const started = this.now();
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        const two = await page.evaluate('1 + 1');
        return { ok: two === 2, ms: this.now() - started };
      } finally {
        await context.close();
      }
    } catch (e) {
      this.stats.lastError = e instanceof Error ? e.message.split('\n')[0] : String(e);
      return { ok: false, ms: this.now() - started, detail: this.stats.lastError };
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    for (const w of this.waiters.splice(0)) w.reject(new ProviderError('CANCELLED'));
    const b = this.browser;
    this.browser = undefined;
    await b?.close().catch(() => undefined);
    await this.guard?.close().catch(() => undefined);
    this.guard = undefined;
    this.closing = false;
  }

  private async getBrowser(): Promise<Browser> {
    if (this.now() < this.downUntil) throw new ProviderError('UNSUPPORTED_RUNTIME', 'The browser worker is resting after repeated crashes');
    const due = this.browser && this.active === 0 && (this.servedSinceLaunch >= this.o.recycleAfterSessions || this.now() - (this.stats.lastLaunchAt ?? 0) > this.o.recycleAfterMs);
    if (due) {
      // A long-lived browser accumulates memory; a fresh one costs a second.
      const old = this.browser!;
      this.browser = undefined;
      this.closing = true;
      await old.close().catch(() => undefined);
      this.closing = false;
    }
    if (this.browser?.isConnected()) return this.browser;
    this.launching ??= (async () => {
      try {
        const upstream = (this.o.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy) || undefined;
        // Everything a launched browser sends goes through the guard, loopback included.
        if (!this.o.connect && this.o.egress !== false) this.guard ??= await startEgressGuard({ ...(this.o.egress ?? {}), upstream });
        const proxy = this.guard ? { server: this.guard.url, bypass: '<-loopback>' } : upstream ? { server: upstream } : undefined;
        const browser = this.o.connect
          ? this.o.connect.protocol === 'cdp'
            ? await chromium.connectOverCDP(this.o.connect.wsEndpoint)
            : await chromium.connect(this.o.connect.wsEndpoint)
          : await chromium.launch({ headless: this.o.headless ?? true, executablePath: this.o.executablePath, args: [...LAUNCH_ARGS, ...(this.o.launchArgs ?? [])], ...(proxy ? { proxy } : {}) });
        this.stats.launches++;
        this.stats.lastLaunchAt = this.now();
        this.stats.version = browser.version();
        this.servedSinceLaunch = 0;
        browser.on('disconnected', () => {
          if (this.browser === browser) this.browser = undefined;
          if (this.closing) return;
          this.stats.crashes++;
          this.stats.lastError = 'The browser process ended unexpectedly';
          const t = this.now();
          this.crashTimes = [...this.crashTimes.filter((c) => t - c < this.o.crashWindowMs), t];
          if (this.crashTimes.length >= this.o.maxCrashes) this.downUntil = t + this.o.coolOffMs;
        });
        this.browser = browser;
        return browser;
      } catch (e) {
        this.stats.lastError = e instanceof Error ? e.message.split('\n')[0] : String(e);
        throw new ProviderError('UNSUPPORTED_RUNTIME', `The browser could not be started: ${this.stats.lastError}`);
      } finally {
        this.launching = undefined;
      }
    })();
    return this.launching;
  }

  private async acquire(signal: AbortSignal): Promise<void> {
    if (this.active < this.o.maxSessions) {
      this.active++;
      return;
    }
    if (this.waiters.length >= this.o.maxQueue) throw new ProviderError('RATE_LIMITED', 'The browser worker is busy');
    await new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve: () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          resolve();
        },
        reject,
      };
      const drop = (e: Error) => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(e);
      };
      const timer = setTimeout(() => drop(new ProviderError('RATE_LIMITED', 'The browser worker is busy')), this.o.queueTimeoutMs);
      const onAbort = () => drop(new ProviderError('CANCELLED'));
      signal.addEventListener('abort', onAbort);
      this.waiters.push(waiter);
    });
    // The slot was handed over by release(); `active` already counts it.
  }

  private release() {
    const next = this.waiters.shift();
    if (next) next.resolve();
    else this.active--;
  }

  session(run: BrowserRun): BrowserSession & { dispose(): Promise<void> } {
    const worker = this;
    const o = this.o;
    const captured: CapturedMedia[] = [];
    let context: BrowserContext | undefined;
    let preparing: Promise<BrowserContext> | undefined;
    let holding = false;
    let disposed = false;
    let pages = 0;
    let requests = 0;
    let suppliedSession = false;
    /** The reason the route handler refused the page's own navigation, for the caller of goto(). */
    let refused: ProviderError | undefined;

    const capture = (url: string, type: CapturedMedia['type'], headers: Record<string, string>, frameUrl?: string) => {
      if (captured.length >= 200 || captured.some((m) => m.url === url)) return;
      const keep: Record<string, string> = {};
      if (headers.referer) keep.Referer = headers.referer;
      if (headers.origin) keep.Origin = headers.origin;
      captured.push({ url, type, headers: keep, frameUrl });
    };

    const route = async (r: Route) => {
      const req = r.request();
      const url = req.url();
      if (!/^https?:/i.test(url)) return r.abort('blockedbyclient');
      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        return r.abort('blockedbyclient');
      }
      // Whatever a page asks for, it never reaches a private or internal address.
      if (!isPublicHost(host) || (o.resolveCheck && !(await o.resolveCheck(host)))) {
        worker.stats.policyBlocks++;
        return r.abort('addressunreachable');
      }
      if (++requests > o.maxRequestsPerSession) {
        worker.stats.policyBlocks++;
        return r.abort('blockedbyclient');
      }
      let frame: Frame | undefined;
      try {
        frame = req.frame();
      } catch {
        /* a request without a frame (service worker, navigation in progress) */
      }
      // A navigation whose frame is not known yet is the page's own (sub-frames exist before they navigate).
      const top = req.isNavigationRequest() && (!frame || frame.parentFrame() === null);
      if (top) {
        // The page itself only goes where the provider's policy lets a request go.
        try {
          await run.guard.check(url, 'GET');
        } catch (e) {
          worker.stats.policyBlocks++;
          const from = req.redirectedFrom();
          const fromHost = from ? new URL(from.url()).hostname : undefined;
          const role = fromHost ? run.domains.roleOf(fromHost) : undefined;
          refused = from && role ? new ProviderError('REDIRECTED', `${fromHost} now redirects to ${host}`, { host: fromHost, role, redirectedTo: host }) : (e as ProviderError);
          return r.abort('blockedbyclient');
        }
      }
      const kind = classifyMediaRequest(url);
      if (kind) capture(url, kind, req.headers(), frame?.url());
      // Video itself never flows through the worker: files and segments are noted and cancelled.
      if ((kind && kind !== 'hls' && kind !== 'dash' && kind !== 'captions') || isSegmentRequest(url) || (!top && o.blockResources.includes(req.resourceType()))) return r.abort('blockedbyclient');
      return r.continue();
    };

    const prepare = async (): Promise<BrowserContext> => {
      if (disposed) throw new ProviderError('CANCELLED');
      if (context) return context;
      preparing ??= (async () => {
        // A viewer's own session, when the provider is for a service they have an account with.
        let supplied: StoredCookie[] = [];
        if (run.auth) {
          const s = readSuppliedSession(run.settings[run.auth.setting], worker.now());
          if (s?.expired) throw new ProviderError('AUTH_REQUIRED', 'The saved session has expired; sign in again and save a new one');
          if (s) {
            supplied = s.cookies;
            suppliedSession = true;
          }
        }
        await worker.acquire(run.signal);
        holding = true;
        try {
          const browser = await worker.getBrowser();
          const ctx = await browser.newContext({ userAgent: o.userAgent, viewport: { width: 1280, height: 720 }, locale: 'en-US', serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
          ctx.setDefaultTimeout(o.navigationTimeoutMs);
          const cookies = [...liveCookies(worker.store.load(run.providerId), worker.now()), ...supplied];
          if (cookies.length) await ctx.addCookies(cookies).catch((e) => run.log('browser.cookies-rejected', { message: String(e).slice(0, 120) }));
          await ctx.route('**/*', route);
          // Content types can reveal a playlist that has no telling extension.
          ctx.on('response', (res) => {
            const kind = classifyMediaRequest(res.url(), res.headers()['content-type']);
            if (kind) capture(res.url(), kind, res.request().headers(), res.frame()?.url());
          });
          if (disposed) {
            await ctx.close().catch(() => undefined);
            throw new ProviderError('CANCELLED');
          }
          context = ctx;
          return ctx;
        } catch (e) {
          holding = false;
          worker.release();
          throw e;
        }
      })();
      return preparing;
    };

    const dispose = async () => {
      if (disposed) return;
      disposed = true;
      const ctx = context;
      context = undefined;
      if (ctx) {
        try {
          // Keep the provider's own sites' cookies for next time; never a viewer's account session.
          if (!suppliedSession) worker.store.save(run.providerId, cookiesToKeep((await ctx.cookies()) as StoredCookie[], run.guard.policy.allow, worker.now()));
        } catch {
          /* the browser is gone: nothing to keep */
        }
        await ctx.close().catch(() => undefined);
      }
      if (holding) {
        holding = false;
        worker.stats.sessionsServed++;
        worker.servedSinceLaunch++;
        worker.release();
      }
    };
    if (run.signal.aborted) void dispose();
    else run.signal.addEventListener('abort', () => void dispose(), { once: true });

    const loadState = (w: BrowserWait | undefined): 'domcontentloaded' | 'load' | 'networkidle' => (typeof w === 'string' ? w : 'load');

    const wrap = (page: Page): BrowserPage => {
      let status = 0;
      const waitFor = async (what: Exclude<BrowserWait, string>, timeoutMs = o.navigationTimeoutMs) => {
        if ('ms' in what) return void (await page.waitForTimeout(Math.min(what.ms, timeoutMs)));
        try {
          if ('selector' in what) await page.waitForSelector(what.selector, { timeout: timeoutMs, state: 'attached' });
          else {
            const deadline = worker.now() + timeoutMs;
            while (!captured.some((m) => m.type !== 'captions')) {
              if (run.signal.aborted) throw new ProviderError('CANCELLED');
              if (worker.now() > deadline) throw new Error('Timeout waiting for media');
              await page.waitForTimeout(150);
            }
          }
        } catch (e) {
          if (e instanceof ProviderError) throw e;
          if (run.signal.aborted) throw new ProviderError('CANCELLED');
          // Why did it never appear? A human check on the page is the usual reason.
          const widget = await page.locator(CHALLENGE_WIDGETS).count().catch(() => 0);
          if (widget) {
            worker.stats.challenges++;
            throw new ProviderError('CHALLENGE', `${FAILURES.CHALLENGE.label} (${new URL(page.url()).hostname})`, { host: new URL(page.url()).hostname });
          }
          throw new ProviderError('SELECTOR_MISSING', 'selector' in what ? `The page never showed "${what.selector}"` : 'The page did not ask for any media', { step: 'selector' in what ? what.selector : 'media', host: new URL(page.url()).hostname });
        }
      };

      const navigate = async (url: string, options: BrowserOpenOptions = {}) => {
        let target: URL;
        try {
          target = new URL(url);
        } catch {
          throw new ProviderError('POLICY', `Not a valid address: ${String(url).slice(0, 80)}`);
        }
        const role = run.domains.roleOf(target.hostname);
        const started = worker.now();
        const record = (outcome: FailureCode | 'ok', st?: number) => run.trace.push({ host: target.hostname, role, path: target.pathname, method: 'GET', status: st, ms: worker.now() - started, outcome, attempt: 1 });
        refused = undefined;
        let response;
        try {
          response = await page.goto(url, { waitUntil: loadState(options.waitFor), timeout: options.timeoutMs ?? o.navigationTimeoutMs, referer: options.referer });
        } catch (e) {
          if (run.signal.aborted || disposed) {
            record('CANCELLED');
            throw new ProviderError('CANCELLED');
          }
          // Set by the route handler when it refused this navigation (TypeScript cannot see that write).
          const why = refused as ProviderError | undefined;
          if (why) {
            record(why.code);
            throw why;
          }
          // The browser only knows "the proxy tunnel failed"; the guard knows why.
          const seen = classifyNavigation(e);
          const code = (seen === 'CONNECT' || seen === 'NETWORK' ? worker.guard?.lastFailure(target.hostname) : undefined) ?? seen;
          record(code);
          throw new ProviderError(code, `${FAILURES[code].label} (${target.hostname})`, { host: target.hostname, role });
        }
        status = response?.status() ?? 0;
        const headers: Record<string, string> = response ? await response.allHeaders().catch(() => ({})) : {};
        // A plain-http request the guard could not or would not make comes back as its own error page.
        const guarded = headers['x-egress-error'] as FailureCode | undefined;
        if (guarded && guarded in FAILURES) {
          record(guarded, status);
          throw new ProviderError(guarded, `${FAILURES[guarded].label} (${target.hostname})`, { host: target.hostname, role });
        }
        // Redirects are followed by the browser without the interceptor being asked. Where the page
        // ended up must still be somewhere the provider's policy allows, or nothing is read from it.
        const landed = new URL(page.url()).hostname;
        if (landed !== target.hostname && !run.guard.isDeclared(landed) && !run.guard.discoveredHosts.includes(landed.toLowerCase())) {
          worker.stats.policyBlocks++;
          await page.goto('about:blank').catch(() => undefined);
          const code: FailureCode = role ? 'REDIRECTED' : 'POLICY';
          record(code, status);
          throw new ProviderError(code, role ? `${target.hostname} now redirects to ${landed}` : `Redirected to a host outside the allow-list: ${landed}`, role ? { host: target.hostname, role, redirectedTo: landed } : { host: landed });
        }
        const body = response ? await response.text().catch(() => '') : '';
        const title = await page.title().catch(() => '');
        // A bot check is reported the moment it is seen. Nothing here waits it out or answers it.
        if (looksLikeChallenge(status, headers, body) || /^just a moment/i.test(title)) {
          worker.stats.challenges++;
          record('CHALLENGE', status);
          throw new ProviderError('CHALLENGE', `${FAILURES.CHALLENGE.label} (${target.hostname})`, { host: target.hostname, role, status });
        }
        const signedOut = status === 401 || (run.auth?.loginUrl && page.url().includes(run.auth.loginUrl)) || (run.auth?.signedOutSelector && (await page.locator(run.auth.signedOutSelector).count().catch(() => 0)) > 0);
        if (signedOut) {
          record('AUTH_REQUIRED', status);
          throw new ProviderError('AUTH_REQUIRED', suppliedSession ? 'The saved session is no longer accepted; sign in again and save a new one' : 'This source needs you to be signed in', { host: target.hostname, role, status });
        }
        record(classifyStatus(status) ?? 'ok', status);
        // Hosts the page names may be visited next, exactly as with a fetched page.
        run.guard.noteResponse(new URL(page.url()).hostname, body);
        if (options.waitFor && typeof options.waitFor !== 'string') await waitFor(options.waitFor, options.timeoutMs);
      };

      return {
        get url() {
          return page.url();
        },
        get status() {
          return status;
        },
        async html() {
          const html = await page.content();
          return html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html;
        },
        async select(selector, options = {}) {
          const frames = options.frames ? page.frames() : [page.mainFrame()];
          const out: string[] = [];
          for (const f of frames) {
            const found = await f.$$eval(selector, (els, attr) => els.map((e) => (attr ? e.getAttribute(attr as string) : e.textContent)), options.attr ?? null).catch(() => [] as (string | null)[]);
            for (const v of found) if (typeof v === 'string' && out.length < 500) out.push(v.trim());
          }
          return out;
        },
        async evaluate<T>(expression: string) {
          const value = await Promise.race([page.evaluate(expression), new Promise((_, reject) => setTimeout(() => reject(new ProviderError('TIMEOUT', 'The page took too long to evaluate an expression')), 5000))]);
          const json = JSON.stringify(value ?? null);
          if (json.length > MAX_EVAL_CHARS) throw new ProviderError('POLICY', 'The value read from the page is too large');
          return JSON.parse(json) as T;
        },
        media: () => [...captured],
        frames: () => page.frames().map((f) => ({ url: f.url(), name: f.name() })),
        async click(selector, options = {}) {
          const timeout = options.timeoutMs ?? 5000;
          const frames = options.frames ? page.frames() : [page.mainFrame()];
          let last: unknown;
          for (const f of frames) {
            try {
              await f.locator(selector).first().click({ timeout: frames.length > 1 ? Math.min(timeout, 2000) : timeout });
              return;
            } catch (e) {
              last = e;
            }
          }
          if (run.signal.aborted) throw new ProviderError('CANCELLED');
          run.log('browser.click-failed', { selector, reason: String(last).slice(0, 120) });
          throw new ProviderError('SELECTOR_MISSING', `Nothing to click at "${selector}"`, { step: selector, host: new URL(page.url()).hostname });
        },
        waitFor,
        goto: navigate,
        async close() {
          await page.close().catch(() => undefined);
        },
      } satisfies BrowserPage;
    };

    return {
      dispose,
      async open(url, options) {
        if (++pages > o.maxPagesPerSession) throw new ProviderError('POLICY', `More than ${o.maxPagesPerSession} pages in one run`);
        const ctx = await prepare();
        const page = await ctx.newPage();
        // Pop-ups and dialogs are how embed pages advertise; neither is ever wanted.
        page.on('popup', (p) => void p.close().catch(() => undefined));
        page.on('dialog', (d) => void d.dismiss().catch(() => undefined));
        const wrapped = wrap(page);
        try {
          await wrapped.goto(url, options);
        } catch (e) {
          await page.close().catch(() => undefined);
          throw e;
        }
        return wrapped;
      },
    };
  }
}

/** A worker with the given options. Nothing is launched until a provider opens a page. */
export function createBrowserWorker(options: BrowserWorkerOptions = {}): BrowserWorker {
  return new BrowserWorker(options);
}
