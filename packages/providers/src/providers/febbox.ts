/**
 * Febbox: the original files behind the ShowBox app (Blu-ray rips, often 4K), using the viewer's
 * own free Febbox account. Steps:
 *
 *  1. Search ShowBox's website for the title; its page holds the ShowBox id.
 *  2. ShowBox's share_link gives the title's Febbox share folder.
 *  3. Febbox lists the folder (season folders, then episode files).
 *  4. With the viewer's "ui" cookie, Febbox's video_quality_list gives playable links per quality,
 *     counted against that account's monthly traffic.
 *
 * The token is only ever sent to febbox.com (from the viewer's browser through the extension).
 */
import { NotFoundError, type Fetcher, type Provider, type Stream } from '../types.js';

const SHOWBOX = 'https://www.showbox.media';
const FEBBOX = 'https://www.febbox.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const PAGE_HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en' };
const VIDEO_HEADERS = { Referer: `${FEBBOX}/` };

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** "ui=abc" or "abc" → "abc". */
const cleanToken = (t: string) => t.trim().replace(/^ui=/, '').replace(/;.*$/, '');

interface FebFile {
  fid: number;
  file_name: string;
  file_size?: string;
  is_dir?: 0 | 1;
}

async function json<T>(fetcher: Fetcher, url: string, signal?: AbortSignal, headers: Record<string, string> = PAGE_HEADERS): Promise<T> {
  const res = await fetcher(url, { headers, signal });
  if (!res.ok) throw new Error(`Febbox: ${new URL(url).hostname} returned ${res.status}`);
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new Error(`Febbox: unexpected answer from ${new URL(url).pathname}`);
  }
}

/** ShowBox page path for the title, from its website search. */
async function findPage(fetcher: Fetcher, title: string, year: number | undefined, type: 'movie' | 'tv', signal?: AbortSignal) {
  const res = await fetcher(`${SHOWBOX}/search?keyword=${encodeURIComponent(title)}`, { headers: PAGE_HEADERS, signal });
  if (!res.ok) throw new Error(`Febbox: ShowBox search returned ${res.status}`);
  const prefix = type === 'movie' ? '/movie/m-' : '/tv/t-';
  const paths = [...new Set([...res.body.matchAll(/href="(\/(?:movie|tv)\/[mt]-[^"]+)"/g)].map((m) => m[1]))].filter((p) => p.startsWith(prefix));
  const want = slug(title);
  const parse = (p: string) => {
    const m = p.slice(prefix.length).match(/^(.*)-(\d{4})$/);
    return m ? { slug: m[1], year: Number(m[2]), path: p } : null;
  };
  const rows = paths.map(parse).filter((r): r is NonNullable<ReturnType<typeof parse>> => !!r && r.slug === want);
  return (year ? (rows.find((r) => r.year === year) ?? rows.find((r) => Math.abs(r.year - year) <= 1)) : rows[0])?.path ?? null;
}

interface Link {
  url: string;
  /** "2160", "1080", … or "original" */
  quality: string;
  size?: number;
}

/** "18.2 GB" → bytes. */
function parseSize(text = ''): number | undefined {
  const m = text.replace(/,/g, '').match(/([\d.]+)\s*(TB|GB|MB|KB)/i);
  if (!m) return undefined;
  return Math.round(Number(m[1]) * { TB: 1e12, GB: 1e9, MB: 1e6, KB: 1e3 }[m[2].toUpperCase() as 'TB' | 'GB' | 'MB' | 'KB']);
}

/** Playable links for one file, from the quality list (needs the viewer's token). */
async function qualities(fetcher: Fetcher, file: FebFile, shareKey: string, token: string, signal?: AbortSignal): Promise<Link[]> {
  const res = await fetcher(`${FEBBOX}/console/video_quality_list?fid=${file.fid}&share_key=${shareKey}`, {
    headers: { ...PAGE_HEADERS, Cookie: `ui=${token}`, 'X-Requested-With': 'XMLHttpRequest' },
    signal,
  });
  let data: { html?: string; login_required?: number; msg?: string } | null = null;
  try {
    data = JSON.parse(res.body);
  } catch {
    /* an HTML page: the login page */
  }
  // Not logged in: {"code":-1,"msg":"Please login","login_required":1}, or the login page itself.
  if (!data || data.login_required) {
    throw new Error('Febbox: the token wasn’t accepted (log in to febbox.com again and copy a fresh "ui" cookie)');
  }
  const html = data.html ?? '';
  const out: Link[] = [];
  // Each quality is a <div class="file_quality" data-url data-quality>…<p class="size">1.2 GB</p>…
  const blocks = html.split(/(?=<div[^>]*class="[^"]*file_quality)/);
  for (const block of blocks) {
    const tag = block.match(/^<div[^>]*class="[^"]*file_quality[^"]*"[^>]*>/)?.[0];
    if (!tag) continue;
    const url = tag.match(/data-url="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    const label = (tag.match(/data-quality="([^"]+)"/)?.[1] ?? '').toUpperCase();
    if (!url) continue;
    const quality = /ORG|ORIGINAL/.test(label) ? 'original' : /4K|2160/.test(label) ? '2160' : (label.match(/(\d{3,4})/)?.[1] ?? 'auto');
    const size = parseSize(block.match(/class="[^"]*size[^"]*"[^>]*>([^<]+)</)?.[1]);
    out.push({ url, quality, size });
  }
  return out;
}

const isHls = (url: string) => /\.m3u8(\?|$)/i.test(url);
/** Rough bitrates when nothing better is known (bits per second). */
const TYPICAL_BPS: Record<number, number> = { 2160: 16e6, 1440: 9e6, 1080: 5.5e6, 720: 2.8e6, 480: 1.4e6, 360: 0.8e6 };

/**
 * One adaptive stream from a file's qualities: a small master playlist (as a data: URL) listing
 * each quality, so the player starts at the best one the connection and screen can take and steps
 * down instead of stalling. If a quality's own URL is itself a master playlist, its variant is used.
 */
async function adaptive(fetcher: Fetcher, links: Link[], runtimeMin: number | undefined, signal?: AbortSignal) {
  const variants = (
    await Promise.all(
      links.map(async (l, idx) => {
        let url = l.url;
        let bandwidth: number | undefined;
        let height = Number(l.quality) || 0;
        let width: number | undefined;
        let attrs = '';
        let media: string[] = [];
        try {
          const r = await fetcher(l.url, { headers: VIDEO_HEADERS, signal });
          if (!r.ok || !r.body.trimStart().startsWith('#EXTM3U')) return null; // dead link
          const base = r.url || l.url;
          const inf = r.body.match(/#EXT-X-STREAM-INF:([^\n]*)\n\s*([^\n#][^\n]*)/);
          if (inf) {
            url = new URL(inf[2].trim(), base).toString();
            bandwidth = Number(inf[1].match(/BANDWIDTH=(\d+)/)?.[1]) || undefined;
            const res = inf[1].match(/RESOLUTION=(\d+)x(\d+)/);
            if (res) [width, height] = [Number(res[1]), Number(res[2])];
            // Febbox keeps the sound in separate audio playlists (EXT-X-MEDIA). Without them the
            // picture plays silently, so carry them over, each quality with its own group name.
            const group = inf[1].match(/AUDIO="([^"]+)"/)?.[1];
            if (group) {
              const own = `a${idx}`;
              media = r.body
                .split(/\r?\n/)
                .filter((line) => line.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/.test(line) && line.includes(`GROUP-ID="${group}"`))
                .map((line) =>
                  line
                    .replace(`GROUP-ID="${group}"`, `GROUP-ID="${own}"`)
                    .replace(/URI="([^"]+)"/, (_m, u: string) => `URI="${new URL(u, base).toString()}"`),
                );
              if (media.length) attrs += `,AUDIO="${own}"`;
            }
            const codecs = inf[1].match(/CODECS="[^"]+"/)?.[0];
            if (codecs) attrs += `,${codecs}`;
          }
        } catch {
          return null;
        }
        if (!height) return null;
        bandwidth ??= l.size && runtimeMin ? Math.round((l.size * 8) / (runtimeMin * 60)) : (TYPICAL_BPS[height] ?? 3e6);
        width ??= Math.round((height * 16) / 9);
        // Label by Febbox's quality name (a 3840×1600 picture is still "4K"); height stays for the playlist.
        return { url, height, width, bandwidth, attrs, media, tier: Number(l.quality) || height, size: l.size };
      }),
    )
  )
    .filter((v): v is NonNullable<typeof v> => !!v)
    .sort((a, b) => b.tier - a.tier);
  if (!variants.length) return null;
  const master =
    '#EXTM3U\n#EXT-X-VERSION:4\n' +
    variants.flatMap((v) => v.media).join('\n') +
    (variants.some((v) => v.media.length) ? '\n' : '') +
    variants.map((v) => `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},RESOLUTION=${v.width}x${v.height}${v.attrs}\n${v.url}`).join('\n') +
    '\n';
  const b64 = btoa(unescape(encodeURIComponent(master)));
  return { url: `data:application/vnd.apple.mpegurl;base64,${b64}`, variants };
}

/** "Inception.2010.2160p.BluRay.x265.10bit…mkv", "48 GB" → "BluRay · x265 10bit · 48 GB". */
function describe(f: FebFile, withSize = true): string {
  const n = f.file_name;
  const parts = [
    n.match(/blu-?ray|web-?dl|webrip|hdtv|remux/i)?.[0],
    n.match(/x26[45]|h\.?26[45]|hevc|av1/i)?.[0]?.replace(/^h\.?/i, 'H.'),
    n.match(/10bit|hdr10\+?|hdr|dolby.?vision|dv\b/i)?.[0],
    n.match(/atmos|dts-?hd(\.ma)?|truehd|ddp?5\.1|aac/i)?.[0],
    withSize ? f.file_size : undefined,
  ].filter(Boolean);
  return parts.join(' · ');
}

export const febbox: Provider = {
  id: 'febbox',
  name: 'Febbox',
  rank: 300,
  supports: ['movie', 'tv'],
  requires: 'febboxToken',
  async scrape(media, { fetch, signal, settings }) {
    const token = cleanToken(settings?.febboxToken ?? '');
    if (!token) throw new NotFoundError('Febbox: no token set');

    const path = await findPage(fetch, media.title, media.year, media.type, signal);
    if (!path) throw new NotFoundError('Febbox: not on ShowBox');
    const page = await fetch(SHOWBOX + path, { headers: PAGE_HEADERS, signal });
    const ids = page.body.match(/share_link'[\s\S]{0,200}?'id':\s*(\d+),\s*'type':\s*(\d)/);
    if (!ids) throw new Error('Febbox: no ShowBox id on the title page');

    const share = await json<{ data?: { link?: string } }>(fetch, `${SHOWBOX}/index/share_link?id=${ids[1]}&type=${ids[2]}`, signal);
    const shareKey = share.data?.link?.split('/').pop();
    if (!shareKey) throw new NotFoundError('Febbox: no share folder');

    const list = (parent?: number) =>
      json<{ data?: { file_list?: FebFile[] } }>(
        fetch,
        `${FEBBOX}/file/file_share_list?share_key=${shareKey}${parent ? `&parent_id=${parent}&page=1` : ''}`,
        signal,
      ).then((r) => r.data?.file_list ?? []);

    let files = await list();
    if (media.type === 'tv') {
      const folder = files.find((f) => f.is_dir && f.file_name?.toLowerCase() === `season ${media.season}`);
      if (!folder) throw new NotFoundError(`Febbox: no season ${media.season}`);
      const ep = new RegExp(`s0*${media.season}e0*${media.episode}(?!\\d)`, 'i');
      files = (await list(folder.fid)).filter((f) => !f.is_dir && ep.test(f.file_name));
    }
    files = files.filter((f) => !f.is_dir && /\.(mp4|mkv|m4v)$/i.test(f.file_name)).slice(0, 4);
    if (!files.length) throw new NotFoundError('Febbox: no video file');

    const max = settings?.febboxMaxHeight || Infinity;
    const perFile = await Promise.all(
      files.map(async (f) => {
        const links = await qualities(fetch, f, shareKey, token, signal);
        const out: Stream[] = [];
        // Febbox's own conversions (HLS) as one adaptive stream, capped by the data-saver setting.
        const hls = links.filter((l) => isHls(l.url) && l.quality !== 'original' && (Number(l.quality) || 0) <= max);
        const a = hls.length ? await adaptive(fetch, hls, media.runtime, signal) : null;
        if (a) {
          out.push({
            url: a.url,
            type: 'hls',
            quality: String(a.variants[0].tier),
            headers: VIDEO_HEADERS,
            note: describe(f, false),
            size: a.variants[0].size,
            levels: a.variants.map((v) => ({ quality: String(v.tier), size: v.size })),
          });
        }
        // The untouched file, only when a browser can play it: MP4 (not MKV) with audio browsers
        // decode (AAC / Opus / MP3, or unnamed). DTS, TrueHD, FLAC, PCM and (E-)AC3 files stall or
        // play silent, so they're left out; the conversions above have browser-friendly audio.
        const browserAudio = !/dts|truehd|atmos|flac|pcm|\bddp?\b|dd\+|ddp?5|e-?ac-?3|\bac-?3/i.test(f.file_name) || /aac|opus|mp3/i.test(f.file_name);
        for (const l of links.filter((x) => browserAudio && x.quality === 'original' && !isHls(x.url) && !/\.mkv(\?|$)/i.test(x.url))) {
          out.push({ url: l.url, type: 'mp4', quality: 'original', headers: VIDEO_HEADERS, note: describe(f, true), size: l.size ?? parseSize(f.file_size) });
        }
        return out;
      }),
    );
    const streams = perFile.flat();
    if (!streams.length) throw new NotFoundError('Febbox: no playable links');
    return { streams, captions: [] };
  },
};

/** Checks a token against a known public share (Inception). 'unknown' if Febbox changed. */
export async function checkFebboxToken(fetcher: Fetcher, token: string): Promise<'ok' | 'invalid' | 'unknown'> {
  try {
    const links = await qualities(fetcher, { fid: 2605016, file_name: 'Inception.2010.1080p.mp4' }, 'Bp1Hw1MK', cleanToken(token));
    return links.length ? 'ok' : 'unknown';
  } catch (e) {
    return /token wasn’t accepted/.test((e as Error).message) ? 'invalid' : 'unknown';
  }
}
