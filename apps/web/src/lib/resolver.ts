/**
 * Source discovery for the website: the browser side of @charcoal/client.
 *
 * One hook, `useSources`, whatever is behind it. Providers that can run in this browser (through
 * Charcoal Helper or an app shell) run here; the rest are asked of the viewer's own server or the
 * hosted one; results from both arrive progressively as one ranked list. Pages and the player
 * never see providers, runtimes or servers, only sources.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  RegistryClient,
  resolveSources,
  type PlayableSource,
  type RemoteEvent,
  type ResolveState,
  type ResolverDeps,
} from "@charcoal/client";
import {
  DEFAULT_WEIGHTS,
  HealthStore,
  mergeCaptions,
  normalizeStream,
  type EpisodeMedia,
  type HealthRecord,
  type AnimeMedia,
  type Media,
  type MovieMedia,
  type PlaybackCapabilities,
  type Stream,
} from "@charcoal/provider-sdk";
import { animeMediaFor, looksLikeAnime, type AnimeAudio } from "./anime";
import { within } from "./content";
import { getBridge } from "./extension";
import { altTitlesOf } from "./regional";
import {
  HOSTED_SERVER,
  languageName,
  type JellyResult,
  type JellySource,
  type JellySubtitle,
  type ProviderReport,
  type Target,
} from "./servers";
import { getState } from "./store";
import type { Details } from "./tmdb";

// ---------- servers ----------

/** Resolver APIs to try, in order: the viewer's own server (if set), then the hosted one. */
function servers(): string[] {
  return [
    ...new Set([getState().settings.serverUrl, HOSTED_SERVER].filter(Boolean)),
  ];
}

// A server that has been asleep can take a while to answer at all; once it answers, results stream.
const FIRST_BYTE_MS = 25_000;
const TOTAL_MS = 60_000;

/** /v2/sources as a stream of events (newline-delimited JSON). Falls back to /v1 on an older server. */
async function* remote(
  base: string,
  query: URLSearchParams,
  signal: AbortSignal,
): AsyncGenerator<RemoteEvent> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal.addEventListener("abort", onAbort);
  const first = setTimeout(() => ctrl.abort(), FIRST_BYTE_MS);
  const total = setTimeout(() => ctrl.abort(), TOTAL_MS);
  try {
    let res: Response;
    try {
      // Both types: the server framework refuses, with 406, a request that does not also accept JSON.
      res = await fetch(`${base}/v2/sources?${query}`, {
        signal: ctrl.signal,
        headers: { Accept: "application/x-ndjson, application/json" },
      });
    } catch {
      throw new Error(
        signal.aborted ? "cancelled" : "Couldn’t reach the server",
      );
    }
    clearTimeout(first);
    // A server from before the provider platform: it only speaks /v1.
    if (res.status === 404) {
      yield* legacy(base, query, ctrl.signal);
      return;
    }
    if (res.status === 429)
      throw new Error("The server is busy; try again in a moment");
    if (!res.ok || !res.body)
      throw new Error(`The server returned ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let at: number;
      while ((at = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (line) yield JSON.parse(line) as RemoteEvent;
      }
    }
    if (buffer.trim()) yield JSON.parse(buffer) as RemoteEvent;
  } finally {
    clearTimeout(first);
    clearTimeout(total);
    signal.removeEventListener("abort", onAbort);
  }
}

interface V1Response {
  sources?: {
    url: string;
    type: string;
    quality: string;
    audioTracks?: { language: string; label: string }[];
    provider: { id: string; name: string };
  }[];
  subtitles?: { url: string; label: string; format: string }[];
  error?: { message?: string };
}

/** The old OMSS endpoint, presented as platform events (everything it returns is already relayed). */
async function* legacy(
  base: string,
  query: URLSearchParams,
  signal: AbortSignal,
): AsyncGenerator<RemoteEvent> {
  const kind = query.get("kind");
  const tmdb = query.get("tmdb");
  if ((kind !== "movie" && kind !== "tv") || !tmdb) return;
  const path =
    kind === "movie"
      ? `/v1/movies/${tmdb}`
      : `/v1/tv/${tmdb}/seasons/${query.get("s")}/episodes/${query.get("e")}`;
  const started = Date.now();
  const res = await fetch(base + path, { signal });
  const body = (await res.json().catch(() => null)) as V1Response | null;
  if (!res.ok && res.status !== 404)
    throw new Error(
      body?.error?.message || `The server returned ${res.status}`,
    );
  const skip = new Set(query.get("skip")?.split(",") ?? []);
  const byProvider = new Map<
    string,
    { name: string; streams: (Stream & { relay?: string })[] }
  >();
  for (const s of body?.sources ?? []) {
    if (skip.has(s.provider.id.toLowerCase())) continue;
    let upstream: { url: string; headers?: Record<string, string> } = {
      url: s.url,
    };
    try {
      const data = new URL(s.url).searchParams.get("data");
      if (data) upstream = JSON.parse(data);
    } catch {
      /* not a relay URL: use it as it is */
    }
    const provider = {
      id: s.provider.id.toLowerCase(),
      name: s.provider.name,
      version: "v1",
    };
    const a = s.audioTracks?.[0];
    const stream = normalizeStream(
      {
        url: upstream.url,
        type: s.type as Stream["type"],
        quality: s.quality,
        headers: upstream.headers,
        language: a?.label,
        languageCode: a?.language,
      },
      { provider, runtime: "server" },
    );
    if ("rejected" in stream) continue;
    const entry = byProvider.get(provider.id) ?? {
      name: provider.name,
      streams: [],
    };
    // Header-less or not, a v1 server only vouches for its own relay URL.
    entry.streams.push({ ...stream, ipBound: true, relay: s.url });
    byProvider.set(provider.id, entry);
  }
  yield {
    t: "plan",
    runtime: "server",
    providers: [...byProvider].map(([id, p]) => ({
      id,
      name: p.name,
      wave: 1,
    })),
    skipped: [],
  };
  let first = true;
  for (const [id, p] of byProvider) {
    yield {
      t: "result",
      provider: { id, name: p.name, version: "v1" },
      outcome: "ok",
      ms: Date.now() - started,
      streams: p.streams,
      captions: first
        ? (body?.subtitles ?? []).map((c) => ({
            url: c.url,
            label: c.label,
            format: (c.format === "srt" ? "srt" : "vtt") as "srt" | "vtt",
          }))
        : [],
      requests: 0,
    };
    first = false;
  }
  yield {
    t: "done",
    ms: Date.now() - started,
    ok: byProvider.size,
    empty: 0,
    failed: 0,
  };
}

// ---------- registry, health, device ----------

const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode or full: fine */
    }
  },
};

/** Public keys this build trusts for registry signatures: `VITE_REGISTRY_KEYS="keyId=base64,keyId2=base64"`. */
function trustedKeys(): Record<string, string> | undefined {
  const raw = (import.meta.env.VITE_REGISTRY_KEYS as string | undefined) ?? "";
  const pairs = raw
    .split(",")
    .map((p) => p.trim().split("="))
    .filter((p) => p.length >= 2 && p[0] && p[1]);
  return pairs.length
    ? Object.fromEntries(pairs.map(([id, ...rest]) => [id, rest.join("=")]))
    : undefined;
}

const registry = new RegistryClient({
  urls: () => servers().map((b) => `${b}/v2/registry`),
  fetchJson: async (url, signal) => {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  trustedKeys: trustedKeys(),
  storage,
});

const HEALTH_KEY = "charcoal:health";
const health = new HealthStore();
try {
  health.load(JSON.parse(storage.get(HEALTH_KEY) ?? "[]") as HealthRecord[]);
} catch {
  /* start clean */
}

let caps: Omit<PlaybackCapabilities, "bridge" | "relay"> | undefined;
/** What this browser can play, measured once. */
export function deviceCapabilities(): Omit<
  PlaybackCapabilities,
  "bridge" | "relay"
> {
  if (caps) return caps;
  const v = document.createElement("video");
  const can = (t: string) => v.canPlayType(t) !== "";
  const mse = "MediaSource" in window || "ManagedMediaSource" in window;
  const videoCodecs = ["avc"];
  if (
    can('video/mp4; codecs="hvc1.1.6.L93.B0"') ||
    can('video/mp4; codecs="hev1.1.6.L93.B0"')
  )
    videoCodecs.push("hevc");
  if (can('video/mp4; codecs="av01.0.05M.08"')) videoCodecs.push("av1");
  if (
    can('video/webm; codecs="vp9"') ||
    can('video/mp4; codecs="vp09.00.10.08"')
  )
    videoCodecs.push("vp9");
  const audioCodecs = ["aac", "mp3"];
  if (can('audio/webm; codecs="opus"') || can('audio/mp4; codecs="opus"'))
    audioCodecs.push("opus");
  if (can('audio/mp4; codecs="ac-3"')) audioCodecs.push("ac3");
  if (can('audio/mp4; codecs="ec-3"')) audioCodecs.push("eac3");
  if (can("audio/flac") || can('audio/mp4; codecs="flac"'))
    audioCodecs.push("flac");
  caps = {
    hls: mse || can("application/vnd.apple.mpegurl"),
    // The player loads dash.js on demand, which needs Media Source Extensions. Phones that only
    // have ManagedMediaSource are left out until DASH has been tried there; they get HLS and files.
    dash: "MediaSource" in window,
    mp4: true,
    // Browsers play some Matroska files and say they play none; they stay in the list, last.
    mkv: true,
    webm: can("video/webm"),
    videoCodecs,
    audioCodecs,
    frames: true,
  };
  return caps;
}

// ---------- to the player's shapes ----------

/**
 * /v2/sources carries alternate titles as one comma-separated value and reads the first eight, so
 * a name with a comma in it can't travel (it would arrive as two wrong names).
 */
const MAX_ALT_TITLES = 8;
const sendable = (titles: string[]) =>
  titles.filter((t) => !t.includes(",")).slice(0, MAX_ALT_TITLES);

function mediaOf(
  t: Target,
  d: Details,
  episodeTmdbId?: number,
): MovieMedia | EpisodeMedia {
  const date = d.release_date || d.first_air_date || "";
  const common = {
    ids: {
      tmdb: String(t.id),
      ...(d.imdb_id || d.external_ids?.imdb_id
        ? { imdb: (d.imdb_id || d.external_ids?.imdb_id) as string }
        : {}),
    },
    title: d.title || d.name || "",
    // The original title, transliterations and translated titles: what regional and anime sites list it under.
    altTitles: sendable(altTitlesOf(d, [getState().settings.audioLang])),
    year: Number(date.slice(0, 4)) || undefined,
    originalLanguage: d.original_language,
    runtime: d.runtime || d.episode_run_time?.[0] || undefined,
  };
  if (t.type === "tv")
    return {
      kind: "tv",
      ...common,
      season: t.season ?? 1,
      episode: t.episode ?? 1,
      episodeTmdbId: episodeTmdbId ? String(episodeTmdbId) : undefined,
    };
  return { kind: "movie", ...common };
}

/**
 * The audio languages a source reports, the wanted one first (the player's source list shows the
 * first as the source's tag). Undefined when it doesn't say: nearly always the original audio.
 */
function audioTracksOf(
  s: PlayableSource,
  preferred: string,
): JellySource["audioTracks"] {
  const seen = new Set<string>();
  const tracks: NonNullable<JellySource["audioTracks"]> = [];
  for (const a of s.audio) {
    const named =
      a.lang !== "und" || (a.label && !/^(original|unknown)$/i.test(a.label));
    if (!named) continue;
    const name = a.label ?? languageName(a.lang);
    const label = a.dub && !/dub/i.test(name) ? `${name} dub` : name;
    if (seen.has(`${a.lang}|${label}`)) continue;
    seen.add(`${a.lang}|${label}`);
    tracks.push({ language: a.lang, label });
  }
  if (!tracks.length) return undefined;
  return [
    ...tracks.filter((t) => t.language === preferred),
    ...tracks.filter((t) => t.language !== preferred),
  ];
}

function toSource(s: PlayableSource, preferred: string): JellySource {
  return {
    id: s.id,
    url: s.playUrl,
    type: s.type,
    quality: s.quality,
    audioTracks: audioTracksOf(s, preferred),
    provider: { id: s.provider.id, name: s.provider.name },
    headers: s.delivery === "headers" ? s.headers : undefined,
    bridged: s.delivery === "headers",
    delivery: s.delivery,
    expiresAt: s.expiresAt,
    note: s.note,
    size: s.size,
    levels: s.levels,
    verification: s.verification && {
      state: s.verification.state,
      level: s.verification.level,
      code: s.verification.code,
      message: s.verification.message,
      maxHeight: s.verification.detail?.maxHeight,
      audioLanguages: s.verification.detail?.audioLanguages,
    },
  };
}

/** How one search's results are ordered and labelled. */
interface Taste {
  /** The audio language to put first (ISO 639-1). */
  language: string;
  /** Set for anime: original audio with subtitles, or dubbed. */
  animeAudio?: AnimeAudio;
  /** The language the title was made in (ISO 639-1), when TMDB says. */
  originalLanguage?: string;
}

/**
 * Audio order for a title made in another language than the one the viewer asked for. The ranker
 * knows one wanted language and weighs it against picture quality and the rest, and it counts a
 * source that says it carries the ORIGINAL audio as "another language", below one that doesn't say
 * (which is assumed original). Here the order is what the setting promises, plainly:
 *   1. sources that carry the wanted language (the viewer asked for them; they are tried first);
 *   2. everything else by rank, stated original audio being worth what unstated audio is;
 *   3. sources with only dubs nobody asked for (a Tamil film in Hindi, for a viewer who asked for English).
 * A title in the viewer's own language is left exactly as ranked.
 */
function byAudioPreference(
  sources: PlayableSource[],
  taste: Taste,
): PlayableSource[] {
  const original = taste.originalLanguage;
  if (!original || original === taste.language) return sources;
  const wanted = (s: PlayableSource) =>
    s.audio.some((a) => a.lang === taste.language);
  const inOriginal = (s: PlayableSource) =>
    s.audio.some((a) => a.lang === original && !a.dub);
  const unwanted = (s: PlayableSource) =>
    s.audio.length > 0 &&
    s.audio.every(
      (a) =>
        a.lang !== "und" &&
        a.lang !== taste.language &&
        (a.lang !== original || !!a.dub),
    );
  // What the ranker gives audio it knows nothing about (rank.ts: 0.85 of the language weight).
  const worth = (s: PlayableSource) =>
    (s.score ?? 0) + (inOriginal(s) ? DEFAULT_WEIGHTS.language * 0.85 : 0);
  // Array.prototype.sort is stable: sources worth the same keep the ranker's order.
  const rest = sources
    .filter((s) => !wanted(s) && !unwanted(s))
    .sort((a, b) => worth(b) - worth(a));
  return [
    ...sources.filter(wanted),
    ...rest,
    ...sources.filter((s) => !wanted(s) && unwanted(s)),
  ];
}

/**
 * Anime: sources in the wanted audio first, the ranking otherwise kept. A source that doesn't say
 * what it carries counts as the original (Japanese) audio, which is what nearly all of them are.
 */
function byAnimeAudio(
  sources: PlayableSource[],
  want: AnimeAudio,
): PlayableSource[] {
  const dubbed = (s: PlayableSource) =>
    s.audio.some((a) => a.dub || (a.lang !== "und" && a.lang !== "ja"));
  const original = (s: PlayableSource) =>
    !s.audio.length ||
    s.audio.some((a) => !a.dub && (a.lang === "ja" || a.lang === "und"));
  const fits = want === "dub" ? dubbed : original;
  return [...sources.filter(fits), ...sources.filter((s) => !fits(s))];
}

const OUTCOME_RANK: Record<ResolveState["providers"][number]["state"], number> =
  { ok: 4, pending: 3, empty: 2, error: 1, skipped: 0 };

const NOTHING: ResolveState = {
  sources: [],
  captions: [],
  providers: [],
  unplayable: [],
  pending: { local: false, remote: false },
  done: false,
  mode: { bridge: null, server: null },
};

/**
 * Several searches for the same thing under different identities (a TMDB episode and its anime
 * entry) as one: one ranked list without duplicates, one set of captions, every provider's
 * outcome. `waiting`: another search may still start, so the picture isn't final yet.
 */
function mergeStates(parts: ResolveState[], waiting: boolean): ResolveState {
  if (!parts.length)
    return { ...NOTHING, pending: { local: waiting, remote: waiting } };
  if (parts.length === 1 && !waiting) return parts[0];
  const seen = new Set<string>();
  const sources: PlayableSource[] = [];
  // Scores come from the same ranker with the same preferences, so they compare across searches.
  // (Array.prototype.sort is stable: on a tie the earlier search, the TMDB one, stays first.)
  for (const s of parts
    .flatMap((p) => p.sources)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))) {
    // The same upstream file found under both identities is one source.
    if (seen.has(`file:${s.dedupKey}`) || seen.has(`id:${s.id}`)) continue;
    seen.add(`file:${s.dedupKey}`).add(`id:${s.id}`);
    sources.push(s);
  }
  const providers = new Map<string, ResolveState["providers"][number]>();
  for (const p of parts.flatMap((x) => x.providers)) {
    const had = providers.get(p.id);
    // A provider asked under both identities is reported once, by its better outcome.
    if (!had || OUTCOME_RANK[p.state] > OUTCOME_RANK[had.state])
      providers.set(p.id, p);
  }
  const unplayable = new Map(
    parts
      .flatMap((p) => p.unplayable)
      .map((u) => [`${u.provider}|${u.reason}`, u]),
  );
  return {
    sources,
    captions: parts
      .slice(1)
      .reduce(
        (all, p) => mergeCaptions(all, p.captions) as ResolveState["captions"],
        parts[0].captions,
      ),
    providers: [...providers.values()],
    unplayable: [...unplayable.values()],
    pending: {
      local: parts.some((p) => p.pending.local),
      remote: waiting || parts.some((p) => p.pending.remote),
    },
    done: !waiting && parts.every((p) => p.done),
    mode: {
      bridge: parts.find((p) => p.mode.bridge)?.mode.bridge ?? null,
      server: parts.find((p) => p.mode.server)?.mode.server ?? null,
    },
    remoteError: parts.every((p) => p.remoteError)
      ? parts[0].remoteError
      : undefined,
  };
}

function toResult(state: ResolveState, taste: Taste): JellyResult {
  const wanted = taste.animeAudio
    ? byAnimeAudio(state.sources, taste.animeAudio)
    : byAudioPreference(state.sources, taste);
  // MKV last, as before: most browsers can't play most of them.
  const ordered = [
    ...wanted.filter((s) => s.type !== "mkv" && s.type !== "frame"),
    ...wanted.filter((s) => s.type === "mkv"),
  ];
  const subtitles: JellySubtitle[] = state.captions.map((c) => {
    const relay = (c as { relay?: string }).relay;
    const bridged = c.local && !!state.mode.bridge;
    return {
      url: !c.local && relay ? relay : c.url,
      label: c.label,
      format: c.format,
      headers: bridged ? c.headers : undefined,
      bridged,
    };
  });
  const report: ProviderReport[] = state.providers
    .filter((p) => p.state !== "pending")
    .map((p) => ({
      name: p.name,
      ok: p.state === "ok",
      reason: p.state === "ok" ? undefined : p.reason,
      group: p.id.startsWith("sv-") ? "StreamViva" : undefined,
      where: p.where,
      code: p.code,
    }));
  for (const u of state.unplayable)
    if (!report.some((r) => r.name === u.provider && !r.ok))
      report.push({
        name: u.provider,
        ok: false,
        reason: u.reason,
        unplayable: true,
      });
  const own = getState().settings.serverUrl;
  const anyLocal = ordered.some((s) => s.local);
  return {
    responseId: "platform",
    expiresAt: "",
    sources: ordered.map((s) => toSource(s, taste.language)),
    subtitles,
    report,
    via: anyLocal
      ? "extension"
      : state.mode.server && state.mode.server === own
        ? "own"
        : "hosted",
    ownError:
      own && state.mode.server && state.mode.server !== own
        ? "it didn’t answer"
        : undefined,
  };
}

let warmedAt = 0;
/**
 * Gets everything a search needs ready before the viewer presses play: wakes the resolver server
 * (its registry request), loads the in-browser providers and asks the helper extension what it can
 * do. Called from title pages; at most every two minutes. Costs a few small requests.
 */
export function warmUp() {
  if (Date.now() - warmedAt < 120_000) return;
  warmedAt = Date.now();
  void registry.refresh().catch(() => {});
  void import("@charcoal/providers").catch(() => {});
  if (getState().settings.useExtension) void getBridge().catch(() => null);
}

/** How long a search waits to learn a title's anime identity before going on without it. */
const ANIME_IDENTITY_MS = 8_000;

/** What every search here runs with: this browser's providers, bridge, servers and health records. */
function resolverDeps(taste: Taste): ResolverDeps {
  const settings = getState().settings;
  // Not awaited: a newer registry applies to the next search; discovery never delays playback.
  void registry.refresh();
  return {
    pack: async () =>
      (await import("@charcoal/providers")).loadPack({ fallback: true }),
    bridge: async () => (settings.useExtension ? getBridge() : null),
    registry: () => registry.current(),
    servers,
    remote,
    settings: () => ({
      febboxToken: settings.febboxToken || undefined,
      febboxMaxHeight: settings.febboxMaxHeight || undefined,
    }),
    device: deviceCapabilities,
    preferences: () => ({
      language: taste.language,
      lastProvider: settings.lastProvider,
    }),
    health,
    report: settings.shareHealth
      ? (reports) => {
          const base = servers()[servers().length - 1];
          if (base)
            fetch(`${base}/v2/report`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reports }),
              keepalive: true,
            }).catch(() => {});
        }
      : undefined,
  };
}

/**
 * Sources for an anime known only by its AniList / MAL entry (one TMDB does not list): the anime
 * providers are asked by those ids and the entry's names. There is no TMDB search to go with it.
 */
export async function findEntrySources(
  media: AnimeMedia,
  signal: AbortSignal,
  onUpdate: (r: JellyResult, done: boolean) => void,
): Promise<JellyResult> {
  const taste: Taste = {
    language: media.audio === "dub" ? getState().settings.audioLang : "ja",
    animeAudio: media.audio,
    originalLanguage: "ja",
  };
  const final = await resolveSources(
    { ...media, altTitles: sendable(media.altTitles ?? []) },
    resolverDeps(taste),
    { signal, onUpdate: (s) => onUpdate(toResult(s, taste), s.done) },
  );
  storage.set(HEALTH_KEY, JSON.stringify(health.snapshot()));
  return toResult(final, taste);
}

/**
 * One discovery run for a title. Resolves when every provider has answered.
 *
 * A title that is anime is searched for under both of its identities at once: as the TMDB movie
 * or episode it is, and as its AniList / MAL entry (kind "anime", the episode numbered inside that
 * entry, the names anime sites use, sub or dub). Both feed one list. The TMDB search never waits
 * for the anime one, and if the anime identity can't be worked out the TMDB search is all there is.
 */
export async function findSources(
  t: Target,
  d: Details,
  episodeTmdbId: number | undefined,
  signal: AbortSignal,
  onUpdate: (r: JellyResult, done: boolean) => void,
): Promise<JellyResult> {
  const settings = getState().settings;
  const media = mediaOf(t, d, episodeTmdbId);
  const anime = looksLikeAnime(d);
  const animeAudio = anime ? settings.animeAudio : undefined;
  // Anime in its original audio is Japanese whatever language the viewer otherwise prefers.
  const taste: Taste = {
    language: animeAudio === "sub" ? "ja" : settings.audioLang,
    animeAudio,
    originalLanguage: d.original_language || undefined,
  };
  const deps = resolverDeps(taste);

  // [the TMDB search, the anime search]: either may be missing at any moment.
  const parts: (ResolveState | undefined)[] = [undefined, undefined];
  let awaitingIdentity = anime;
  const merged = () =>
    mergeStates(
      parts.filter((p): p is ResolveState => !!p),
      awaitingIdentity,
    );
  const publish = () => {
    const state = merged();
    onUpdate(toResult(state, taste), state.done);
  };
  const search = (m: Media, slot: 0 | 1) =>
    resolveSources(m, deps, {
      signal,
      onUpdate: (s) => ((parts[slot] = s), publish()),
    }).then((s) => void (parts[slot] = s));
  const asAnime = !anime
    ? Promise.resolve()
    : within(
        animeMediaFor(media, d, animeAudio!),
        ANIME_IDENTITY_MS,
        "Looking up the anime entry",
      )
        .catch((e) => void console.warn("[anime]", (e as Error).message))
        .then((entry) => {
          awaitingIdentity = false;
          if (!entry || signal.aborted) return;
          return search(
            { ...entry, altTitles: sendable(entry.altTitles ?? []) },
            1,
          );
        })
        // Whatever goes wrong on the anime side, the TMDB search stands by itself.
        .catch(
          (e) =>
            void console.warn(
              "[anime] the anime search failed:",
              (e as Error).message,
            ),
        )
        .finally(() => {
          awaitingIdentity = false;
        });
  await Promise.all([search(media, 0), asAnime]);
  storage.set(HEALTH_KEY, JSON.stringify(health.snapshot()));
  return toResult(merged(), taste);
}

// ---------- the hook ----------

export interface SourcesQuery {
  /** The current list (it grows while `searching`). Undefined until the first playable source. */
  data: JellyResult | undefined;
  /** Providers are still answering. */
  searching: boolean;
  /** A search started by `refetch` is running (the previous list stays on screen meanwhile). */
  refreshing: boolean;
  /** The search finished and found nothing playable. */
  error: Error | undefined;
  /** Changes when a NEW search replaces the list (not while one search is still adding to it). */
  generation: number;
  refetch(): void;
}

type Search = (
  signal: AbortSignal,
  onUpdate: (r: JellyResult, done: boolean) => void,
) => Promise<JellyResult>;

/** One search at a time for `key`, its list growing as providers answer. `search` is read when a search starts. */
function useSearch(
  key: string,
  ready: boolean,
  enabled: boolean,
  search: Search,
): SourcesQuery {
  const [run, setRun] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: JellyResult;
    searching: boolean;
    error?: Error;
    generation: number;
  }>({ key, searching: enabled, generation: 0 });
  const latest = useRef(search);
  latest.current = search;

  useEffect(() => {
    if (!ready) return;
    const ctrl = new AbortController();
    let adopted = false;
    setState((s) =>
      s.key === key
        ? { ...s, searching: true, error: undefined }
        : { key, searching: true, generation: s.generation },
    );
    const adopt = (r: JellyResult, done: boolean) => {
      if (ctrl.signal.aborted) return;
      if (!r.sources.length && !done) return; // keep whatever is on screen until there is something to show
      setState((s) => {
        const generation = adopted ? s.generation : s.generation + 1;
        adopted = true;
        if (!r.sources.length)
          return {
            key,
            data: undefined,
            searching: false,
            error: new Error(noSourcesMessage(r)),
            generation: s.generation,
          };
        return { key, data: r, searching: !done, error: undefined, generation };
      });
    };
    latest
      .current(ctrl.signal, adopt)
      .then((r) => adopt(r, true))
      .catch(
        (e) =>
          !ctrl.signal.aborted &&
          setState((s) => ({
            key,
            data: s.key === key ? s.data : undefined,
            searching: false,
            error: s.key === key && s.data ? undefined : (e as Error),
            generation: s.generation,
          })),
      );
    return () => ctrl.abort();
  }, [key, run, ready]);

  const refetch = useCallback(() => setRun((n) => n + 1), []);
  const current =
    state.key === key
      ? state
      : {
          key,
          searching: ready,
          generation: state.generation,
          data: undefined,
          error: undefined,
        };
  return {
    data: current.data,
    searching: current.searching,
    refreshing: current.searching && !!current.data && run > 0,
    error: current.error,
    generation: current.generation,
    refetch,
  };
}

const settingsKey = () => {
  const settings = getState().settings;
  return [
    settings.serverUrl,
    settings.useExtension,
    !!settings.febboxToken,
    settings.febboxMaxHeight,
  ].join("|");
};

/** Sources for a title, progressively. Searches again only when asked to (`refetch`). */
export function useSources(
  target: Target,
  d: Details | undefined,
  episodeTmdbId: number | undefined,
  enabled: boolean,
): SourcesQuery {
  const key = [
    target.type,
    target.id,
    target.season,
    target.episode,
    settingsKey(),
  ].join("|");
  return useSearch(key, enabled && !!d, enabled, (signal, onUpdate) =>
    findSources(target, d!, episodeTmdbId, signal, onUpdate),
  );
}

/** Sources for an episode of an AniList entry (see findEntrySources). Nothing is searched until the entry is known. */
export function useEntrySources(media: AnimeMedia | undefined): SourcesQuery {
  const key = [
    "entry",
    media?.ids.anilist,
    media?.episode,
    media?.audio,
    settingsKey(),
  ].join("|");
  return useSearch(key, !!media, true, (signal, onUpdate) =>
    findEntrySources(media!, signal, onUpdate),
  );
}

function noSourcesMessage(r: JellyResult): string {
  const why = (r.report ?? [])
    .filter((p) => !p.ok && p.reason)
    .slice(0, 3)
    .map((p) => `${p.name}: ${p.reason}`);
  return why.length
    ? `No playable source (${why.join("; ")})`
    : "No sources found for this title";
}
