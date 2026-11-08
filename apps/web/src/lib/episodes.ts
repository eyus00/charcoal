import type { Details, SeasonSummary } from './tmdb';
import type { EpisodeKey } from './store';

/** Regular seasons that have episodes, sorted. Specials (season 0) are separate. */
export function regularSeasons(d: Details | undefined): SeasonSummary[] {
  return (d?.seasons ?? []).filter((s) => s.season_number > 0 && s.episode_count > 0).sort((a, b) => a.season_number - b.season_number);
}

export function allSeasons(d: Details | undefined): SeasonSummary[] {
  const regular = regularSeasons(d);
  const specials = (d?.seasons ?? []).find((s) => s.season_number === 0 && s.episode_count > 0);
  return specials ? [...regular, specials] : regular;
}

const isAfter = (a: EpisodeKey, b: { season_number: number; episode_number: number }) =>
  a.season > b.season_number || (a.season === b.season_number && a.episode > b.episode_number);

/** Previous/next episode using season episode counts; next never goes past the last aired episode. */
export function neighbors(d: Details | undefined, season: number, episode: number) {
  const list = season === 0 ? allSeasons(d).filter((s) => s.season_number === 0) : regularSeasons(d);
  const idx = list.findIndex((s) => s.season_number === season);
  const cur = list[idx];
  let prev: EpisodeKey | null = null;
  let next: EpisodeKey | null = null;
  if (cur) {
    if (episode > 1) prev = { season, episode: episode - 1 };
    else if (idx > 0) prev = { season: list[idx - 1].season_number, episode: list[idx - 1].episode_count };

    if (episode < cur.episode_count) next = { season, episode: episode + 1 };
    else if (idx < list.length - 1) next = { season: list[idx + 1].season_number, episode: 1 };
  }
  const last = d?.last_episode_to_air;
  if (next && last && season !== 0 && isAfter(next, last)) next = null;
  return { prev, next };
}

/** Validate an episode against the show; returns a corrected target, or null if impossible. */
export function resolveEpisode(d: Details, season: number, episode: number): EpisodeKey | null {
  const s = allSeasons(d).find((x) => x.season_number === season);
  if (s && episode >= 1 && episode <= s.episode_count) return { season, episode };
  // Past the end of a season (e.g. "next episode" from Continue Watching) -> next season.
  if (s && episode > s.episode_count) {
    const nextSeason = regularSeasons(d).find((x) => x.season_number > season);
    return nextSeason ? { season: nextSeason.season_number, episode: 1 } : null;
  }
  return null;
}

export const epLabel = (s?: number, e?: number) => (s === undefined || e === undefined ? '' : s === 0 ? `Special ${e}` : `S${s} E${e}`);
