/**
 * The benchmark itself: for every title, ask the target, then try what came back.
 *
 * Four counts are kept apart on purpose, because they are routinely confused:
 *   discovered  streams an extraction returned (a URL, nothing more)
 *   unique      the same, after removing the same upstream file found by several providers
 *   verified    unique streams whose manifest parsed and whose first media bytes answered
 *   started     verified streams that began playing in a real browser player
 */
import { codecFamilies, describeRuntime, fetchTransport, validateStream, type Fetcher, type Media, type RuntimeDescriptor, type Verification } from '@charcoal/provider-sdk';
import type { FoundStream, ProviderRun, Target, TargetInfo } from './targets.js';
import type { BenchTitle, Category } from './titles.js';

export interface PlaybackResult {
  started: boolean;
  /** From asking the player to load until the first frame advanced. */
  ms: number;
  /** Not tried: the test browser has no decoder for this stream's video (a real device may). */
  undecodable?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface PlaybackChecker {
  check(stream: { url: string; type: string; headers: Record<string, string> }): Promise<PlaybackResult>;
  /** Video codec families the test browser decodes ("avc", "hevc", …), when it can say. */
  videoCodecs?: string[];
  close(): Promise<void>;
}

/** A stream as it is written to a report: where it came from and what happened, never its URL. */
export interface ReportedStream {
  provider: string;
  alsoFrom: string[];
  host: string;
  type: string;
  quality: string;
  languages: string[];
  arrivedMs: number;
  verification: Pick<Verification, 'state' | 'level' | 'code' | 'message' | 'ms' | 'detail'>;
  playback?: PlaybackResult;
}

export interface TitleResult {
  key: string;
  category: Category;
  language: string;
  year: number;
  providersQueried: number;
  /** Answered "here it is" or "don't have it": the provider itself worked. */
  providersResponding: number;
  providersWithResults: number;
  providersSkipped: number;
  discovered: number;
  unique: number;
  verified: number;
  unchecked: number;
  playbackTried: number;
  started: number;
  /** Verified streams set aside because the test browser cannot decode their video codec. */
  undecodable: number;
  firstResultMs?: number;
  /** Arrival of the earliest stream that verified, plus the time its check took. */
  firstVerifiedMs?: number;
  firstStartedMs?: number;
  totalMs: number;
  failures: Record<string, number>;
  providers: (Omit<ProviderRun, 'streams'> & { streams: number })[];
  streams: ReportedStream[];
  error?: string;
}

export interface BenchReport {
  schema: 1;
  label: string;
  /** 'live' = real sites over the network; 'fixtures' = canned responses, proves nothing about availability. */
  mode: 'live' | 'fixtures';
  startedAt: string;
  finishedAt: string;
  commit?: string;
  target: TargetInfo;
  /** Where streams were tried from. */
  checkedFrom: { egress: string; note?: string };
  playbackChecked: boolean;
  titles: TitleResult[];
  summary: Summary;
}

export interface Summary {
  titles: number;
  providersRegistered: number;
  /** Providers that returned at least one stream for at least one title. */
  providersEverReturning: number;
  /** Providers that never got a real answer (ok or empty) from their site for any title. */
  providersNeverResponding: number;
  titlesWithAnyStream: number;
  titlesWithVerified: number;
  titlesWithPlayback: number;
  discovered: number;
  unique: number;
  verified: number;
  started: number;
  playbackTried: number;
  /** Verified streams the test browser could not decode (HEVC and the like), not counted as tried. */
  undecodable: number;
  meanProviderMs: number;
  medianFirstResultMs?: number;
  medianFirstVerifiedMs?: number;
  failures: Record<string, number>;
  byCategory: Record<string, { titles: number; withVerified: number; withPlayback: number; unique: number; verified: number; started: number }>;
  byProvider: Record<string, { name: string; ok: number; empty: number; error: number; skipped: number; streams: number; verified: number; started: number; meanMs: number; codes: Record<string, number> }>;
}

export interface RunOptions {
  label: string;
  mode: 'live' | 'fixtures';
  titles: BenchTitle[];
  /** Tries streams. Defaults to plain fetch from this machine. */
  transport?: Fetcher;
  /** This machine's runtime, for the verification record. */
  checker?: RuntimeDescriptor;
  /** Try streams through the target's relay link when it gave one. */
  via?: 'direct' | 'relay';
  playback?: PlaybackChecker;
  /** How many verified streams per title to try in the player. */
  playbackPerTitle?: number;
  verifyConcurrency?: number;
  titleTimeoutMs?: number;
  commit?: string;
  note?: string;
  onProgress?: (line: string) => void;
}

const median = (values: number[]): number | undefined => {
  if (!values.length) return undefined;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url.startsWith('data:') ? '(inline)' : '(invalid)';
  }
};
const RANK = { ok: 3, empty: 2, error: 1, skipped: 0 } as const;

async function runTitle(target: Target, title: BenchTitle, o: RunOptions, checker: RuntimeDescriptor): Promise<TitleResult> {
  const started = Date.now();
  const merged = new Map<string, ProviderRun>();
  const arrivals = new Map<string, { stream: FoundStream; at: number; from: Set<string> }>();
  let discovered = 0;
  let firstResultMs: number | undefined;
  let error: string | undefined;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.titleTimeoutMs ?? 90_000);
  try {
    // A title's queries (a show and its anime entry, say) run one after the other; times are from the title's start.
    for (const media of title.queries as Media[]) {
      const offset = Date.now() - started;
      await target.resolve(
        media,
        (run, atMs) => {
          const at = offset + atMs;
          const prev = merged.get(run.id);
          if (!prev) merged.set(run.id, { ...run, streams: [...run.streams] });
          else {
            // Keep the better outcome; a provider that doesn't handle one kind of query is not a failure of the other.
            if (RANK[run.outcome] > RANK[prev.outcome]) Object.assign(prev, { outcome: run.outcome, code: run.code, message: run.message, host: run.host });
            prev.ms = Math.max(prev.ms, run.ms);
            prev.requests = (prev.requests ?? 0) + (run.requests ?? 0);
            prev.captions += run.captions;
            prev.streams.push(...run.streams);
          }
          for (const s of run.streams) {
            discovered++;
            firstResultMs ??= at;
            const seen = arrivals.get(s.dedupKey);
            if (seen) seen.from.add(s.provider);
            else arrivals.set(s.dedupKey, { stream: s, at, from: new Set([s.provider]) });
          }
        },
        ctrl.signal,
      );
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    clearTimeout(timer);
  }
  const resolveMs = Date.now() - started;

  // Try every unique stream from here.
  const unique = [...arrivals.values()];
  const transport = o.transport ?? fetchTransport;
  const verifications = new Array<Verification>(unique.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(o.verifyConcurrency ?? 4, unique.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= unique.length) return;
        const s = unique[i].stream;
        const viaRelay = o.via === 'relay' && s.relay;
        verifications[i] = await validateStream(viaRelay ? { url: s.relay!, type: s.type, headers: {}, expiresAt: s.expiresAt } : s, transport, { runtime: checker });
      }
    }),
  );

  // Then really play a few of the ones that verified, best quality first, spread over providers.
  const reported: ReportedStream[] = unique.map((u, i) => ({
    provider: u.stream.provider,
    alsoFrom: [...u.from].filter((p) => p !== u.stream.provider),
    host: hostOf(u.stream.url),
    type: u.stream.type,
    quality: u.stream.quality,
    languages: u.stream.languages,
    arrivedMs: u.at,
    verification: { state: verifications[i].state, level: verifications[i].level, code: verifications[i].code, message: verifications[i].message, ms: verifications[i].ms, detail: verifications[i].detail },
  }));
  let playbackTried = 0;
  if (o.playback) {
    // A stream whose every video codec the test browser lacks is not a playback failure: it is set aside and counted.
    const decodes = o.playback.videoCodecs;
    const unsupported = (i: number): string | undefined => {
      const video = codecFamilies(verifications[i].detail?.codecs?.join(' ')).filter((f) => ['hevc', 'av1', 'vp9', 'avc'].includes(f));
      return decodes && video.length && !video.some((f) => decodes.includes(f)) ? video[0] : undefined;
    };
    unique.forEach((_u, i) => {
      const family = verifications[i].state === 'verified' ? unsupported(i) : undefined;
      if (family) reported[i].playback = { started: false, ms: 0, undecodable: family, error: `the test browser cannot decode ${family.toUpperCase()}` };
    });
    const candidates = unique
      .map((u, i) => ({ u, i }))
      .filter(({ i }) => verifications[i].state === 'verified' && !reported[i].playback?.undecodable)
      .sort((a, b) => (Number(b.u.stream.quality) || 0) - (Number(a.u.stream.quality) || 0));
    const picked: typeof candidates = [];
    const usedProviders = new Set<string>();
    for (const c of candidates) if (!usedProviders.has(c.u.stream.provider) && picked.length < (o.playbackPerTitle ?? 2)) (picked.push(c), usedProviders.add(c.u.stream.provider));
    for (const c of candidates) if (!picked.includes(c) && picked.length < (o.playbackPerTitle ?? 2)) picked.push(c);
    for (const { u, i } of picked) {
      playbackTried++;
      const viaRelay = o.via === 'relay' && u.stream.relay;
      reported[i].playback = await o.playback.check(viaRelay ? { url: u.stream.relay!, type: u.stream.type, headers: {} } : { url: u.stream.url, type: u.stream.type, headers: u.stream.headers }).catch((e) => ({ started: false, ms: 0, error: e instanceof Error ? e.message : String(e) }));
      if (reported[i].playback!.started) reported[i].verification.level = 'playback';
    }
  }

  const runs = [...merged.values()];
  const failures: Record<string, number> = {};
  for (const r of runs) if (r.outcome === 'error') failures[r.code ?? 'UNKNOWN'] = (failures[r.code ?? 'UNKNOWN'] ?? 0) + 1;
  const verified = reported.filter((s) => s.verification.state === 'verified');
  const startedStreams = reported.filter((s) => s.playback?.started);
  return {
    key: title.key,
    category: title.category,
    language: title.language,
    year: title.year,
    providersQueried: runs.filter((r) => r.outcome !== 'skipped').length,
    providersResponding: runs.filter((r) => r.outcome === 'ok' || r.outcome === 'empty').length,
    providersWithResults: runs.filter((r) => r.outcome === 'ok').length,
    providersSkipped: runs.filter((r) => r.outcome === 'skipped').length,
    discovered,
    unique: unique.length,
    verified: verified.length,
    unchecked: reported.filter((s) => s.verification.state === 'unchecked').length,
    playbackTried,
    started: startedStreams.length,
    undecodable: reported.filter((s) => s.playback?.undecodable).length,
    firstResultMs,
    firstVerifiedMs: verified.length ? Math.min(...verified.map((s) => s.arrivedMs + s.verification.ms)) : undefined,
    firstStartedMs: startedStreams.length ? Math.min(...startedStreams.map((s) => s.arrivedMs + s.verification.ms + (s.playback?.ms ?? 0))) : undefined,
    totalMs: resolveMs,
    failures,
    providers: runs.map((r) => ({ ...r, streams: r.streams.length, message: r.message?.slice(0, 200) })),
    streams: reported,
    error,
  };
}

export function summarize(info: TargetInfo, titles: TitleResult[]): Summary {
  const byProvider: Summary['byProvider'] = {};
  const failures: Record<string, number> = {};
  let msTotal = 0;
  let msCount = 0;
  for (const t of titles) {
    for (const p of t.providers) {
      const b = (byProvider[p.id] ??= { name: p.name, ok: 0, empty: 0, error: 0, skipped: 0, streams: 0, verified: 0, started: 0, meanMs: 0, codes: {} });
      b[p.outcome]++;
      b.streams += p.streams;
      if (p.outcome !== 'skipped') {
        b.meanMs += p.ms;
        msTotal += p.ms;
        msCount++;
      }
      if (p.outcome === 'error') {
        const code = p.code ?? 'UNKNOWN';
        b.codes[code] = (b.codes[code] ?? 0) + 1;
        failures[code] = (failures[code] ?? 0) + 1;
      }
    }
    for (const s of t.streams) {
      const b = byProvider[s.provider];
      if (!b) continue;
      if (s.verification.state === 'verified') b.verified++;
      if (s.playback?.started) b.started++;
    }
  }
  for (const b of Object.values(byProvider)) {
    const n = b.ok + b.empty + b.error;
    b.meanMs = n ? Math.round(b.meanMs / n) : 0;
  }
  const byCategory: Summary['byCategory'] = {};
  for (const t of titles) {
    const c = (byCategory[t.category] ??= { titles: 0, withVerified: 0, withPlayback: 0, unique: 0, verified: 0, started: 0 });
    c.titles++;
    c.unique += t.unique;
    c.verified += t.verified;
    c.started += t.started;
    if (t.verified) c.withVerified++;
    if (t.started) c.withPlayback++;
  }
  const sum = (f: (t: TitleResult) => number) => titles.reduce((n, t) => n + f(t), 0);
  return {
    titles: titles.length,
    providersRegistered: info.providers.length || Object.keys(byProvider).length,
    providersEverReturning: Object.values(byProvider).filter((b) => b.ok > 0).length,
    providersNeverResponding: Object.values(byProvider).filter((b) => b.ok + b.empty === 0).length,
    titlesWithAnyStream: titles.filter((t) => t.unique > 0).length,
    titlesWithVerified: titles.filter((t) => t.verified > 0).length,
    titlesWithPlayback: titles.filter((t) => t.started > 0).length,
    discovered: sum((t) => t.discovered),
    unique: sum((t) => t.unique),
    verified: sum((t) => t.verified),
    started: sum((t) => t.started),
    playbackTried: sum((t) => t.playbackTried),
    undecodable: sum((t) => t.undecodable ?? 0),
    meanProviderMs: msCount ? Math.round(msTotal / msCount) : 0,
    medianFirstResultMs: median(titles.map((t) => t.firstResultMs).filter((n): n is number => n !== undefined)),
    medianFirstVerifiedMs: median(titles.map((t) => t.firstVerifiedMs).filter((n): n is number => n !== undefined)),
    failures,
    byCategory,
    byProvider,
  };
}

export async function runBenchmark(target: Target, o: RunOptions): Promise<BenchReport> {
  const startedAt = new Date().toISOString();
  const info = await target.info();
  const checker = o.checker ?? describeRuntime('server');
  const titles: TitleResult[] = [];
  for (const title of o.titles) {
    const r = await runTitle(target, title, o, checker);
    titles.push(r);
    o.onProgress?.(
      `${title.key.padEnd(18)} providers ${String(r.providersWithResults).padStart(2)}/${String(r.providersQueried).padStart(2)} with results · unique ${String(r.unique).padStart(2)} · verified ${String(r.verified).padStart(2)}${o.playback ? ` · started ${r.started}/${r.playbackTried}` : ''} · ${(r.totalMs / 1000).toFixed(1)}s${r.error ? ` · ERROR ${r.error}` : ''}`,
    );
  }
  return {
    schema: 1,
    label: o.label,
    mode: o.mode,
    startedAt,
    finishedAt: new Date().toISOString(),
    commit: o.commit,
    target: info,
    checkedFrom: { egress: checker.egress, note: o.note },
    playbackChecked: !!o.playback,
    titles,
    summary: summarize(info, titles),
  };
}
