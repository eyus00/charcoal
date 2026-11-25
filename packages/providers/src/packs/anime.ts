/**
 * The anime pack: providers adapted from Seanime-contributions/Seanime-Providers (MIT,
 * https://github.com/Seanime-contributions/Seanime-Providers), each in ../providers/anime-<name>.ts.
 *
 * Stages come from a live gate, not from the port compiling: every provider was run from a cloud
 * address against six entries (AniList 16498 Attack on Titan, 101922 Demon Slayer, 21 One Piece,
 * 113415 Jujutsu Kaisen, 199 Spirited Away, 21519 Your Name.; episode 1, subbed) and every stream it
 * returned was tried (playlist and first segment, or the file's first bytes). `stable` = at least one
 * stream verified for three or more of the six; `canary` = for fewer. A provider with none is not
 * here at all. The notes say what was measured and when; they describe that network on that day.
 *
 *   npm run try -- anime 16498 "Attack on Titan" 2013 1 --alt "Shingeki no Kyojin" --mal 16498 \
 *     --extra ./src/packs/anime.ts anime-shonen
 */
import type { DomainConfig, ProviderModule, Stage } from '@charcoal/provider-sdk';
import { animeAnimeheaven } from '../providers/anime-animeheaven.js';
import { animeAnimotvslash } from '../providers/anime-animotvslash.js';
import { animeMegavid } from '../providers/anime-megavid.js';
import { animeShonen } from '../providers/anime-shonen.js';
import { animeZokoanime } from '../providers/anime-zokoanime.js';

const one = (provider: string, roles: Record<string, string>): DomainConfig => ({ provider, version: 1, updatedAt: '2026-11-25T00:00:00.000Z', roles: Object.fromEntries(Object.entries(roles).map(([role, active]) => [role, { active }])) });

export const providers: { module: ProviderModule; stage: Stage }[] = [
  // 2026-11-25: 6/6 verified. Two 1080p playlists per entry (Japanese and English audio tracks in
  // one playlist, AES-128 segments) on *.animotvslash.ru; soft subtitles. Also verified that day: a
  // dub request, and the title-search path (no AniList id).
  { module: animeAnimotvslash, stage: 'stable' },
  // 2026-11-25: 6/6 verified (5/6 on 2026-11-24). Two playlists per entry: the site's own CDN copy
  // or its relay (1080p), and a mirror. One of the two answered 502/503/timeout for four entries;
  // the other one played. Also verified that day: a dub request, and the title-search path.
  { module: animeShonen, stage: 'stable' },
  // 2026-11-25: 6/6 verified. One 1080p playlist per entry on hls.dramahot.top (needs the Referer
  // the provider returns). A dub request verified too. Looked up by MyAnimeList id only.
  { module: animeZokoanime, stage: 'stable' },
  // 2026-11-25: 5/6 verified (one MP4 per entry, read by its header; quality not stated by the
  // site). Spirited Away is not in its catalogue under either name: NOT_FOUND. Subbed only.
  { module: animeAnimeheaven, stage: 'stable' },
  // 2026-11-25: answers for 6/6 but only 1/6 verified (2/6 on 2026-11-24): for the others the
  // endpoint names a playlist host (s-90.megavid.se) that does not exist in public DNS (NXDOMAIN on
  // cloudflare-dns.com). The one on cp.megavid.buzz plays (720p). Canary until that host answers.
  { module: animeMegavid, stage: 'stable' },
  // Not here: AnimeGG (upstream src/anime/animegg). 2026-11-24: found 5 of the 6, but every file
  // redirects to a host on port 8161, which this network's egress does not carry, so 0/6 could be
  // verified; 2026-11-25: its search took over 8 s twice for all six (TIMEOUT). Megaplay (upstream
  // src/anime/megaplay) was not ported: it needs a third-party decryption service.
];

export const domains: Record<string, DomainConfig> = {
  'anime-animotvslash': one('anime-animotvslash', { site: 'https://animotvslash.org', api: 'https://animotvslash.ru' }),
  'anime-shonen': one('anime-shonen', { site: 'https://shonen.to' }),
  'anime-zokoanime': one('anime-zokoanime', { site: 'https://zokoanime.video' }),
  'anime-animeheaven': one('anime-animeheaven', { site: 'https://animeheaven.me' }),
  'anime-megavid': one('anime-megavid', { site: 'https://megavid.buzz' }),
};
