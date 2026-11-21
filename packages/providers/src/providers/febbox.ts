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

/** Playable links for one file, from the quality list (needs the viewer's token). */
async function qualities(fetcher: Fetcher, file: FebFile, shareKey: string, token: string, signal?: AbortSignal): Promise<Stream[]> {
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
  const out: Stream[] = [];
  for (const tag of html.match(/<div[^>]*class="[^"]*file_quality[^"]*"[^>]*>/g) ?? []) {
    const url = tag.match(/data-url="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    const label = tag.match(/data-quality="([^"]+)"/)?.[1] ?? '';
    if (!url) continue;
    const q = label.toUpperCase();
    const quality = /ORG|ORIGINAL/.test(q) ? 'original' : /4K|2160/.test(q) ? '2160' : (q.match(/(\d{3,4})/)?.[1] ?? 'auto');
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
    out.push({
      url,
      type: ext === 'm3u8' ? 'hls' : ext === 'mkv' ? 'mkv' : 'mp4',
      quality,
      headers: VIDEO_HEADERS,
      note: describe(file),
    });
  }
  return out;
}

/** "Inception.2010.2160p.BluRay.x265.10bit…mkv", "48 GB" → "BluRay · x265 10bit · 48 GB". */
function describe(f: FebFile): string {
  const n = f.file_name;
  const parts = [
    n.match(/blu-?ray|web-?dl|webrip|hdtv|remux/i)?.[0],
    n.match(/x26[45]|h\.?26[45]|hevc|av1/i)?.[0]?.replace(/^h\.?/i, 'H.'),
    n.match(/10bit|hdr10\+?|hdr|dolby.?vision|dv\b/i)?.[0],
    n.match(/atmos|dts-?hd(\.ma)?|truehd|ddp?5\.1|aac/i)?.[0],
    f.file_size,
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

    const streams = (await Promise.all(files.map((f) => qualities(fetch, f, shareKey, token, signal)))).flat();
    if (!streams.length) throw new NotFoundError('Febbox: no playable links');
    return { streams, captions: [] };
  },
};

/** Checks a token against a known public share (Inception). 'unknown' if Febbox changed. */
export async function checkFebboxToken(fetcher: Fetcher, token: string): Promise<'ok' | 'invalid' | 'unknown'> {
  try {
    const streams = await qualities(fetcher, { fid: 2605016, file_name: 'Inception.2010.1080p.mp4' }, 'Bp1Hw1MK', cleanToken(token));
    return streams.length ? 'ok' : 'unknown';
  } catch (e) {
    return /token wasn’t accepted/.test((e as Error).message) ? 'invalid' : 'unknown';
  }
}
