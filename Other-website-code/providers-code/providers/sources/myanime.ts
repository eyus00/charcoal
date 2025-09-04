import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { compareTitle } from '@/utils/compare';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

// Levenshtein distance function for string similarity
const levenshtein = (s: string, t: string): number => {
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const arr: number[][] = [];
  for (let i = 0; i <= t.length; i++) {
    arr[i] = [i];
    for (let j = 1; j <= s.length; j++) {
      arr[i][j] =
        i === 0
          ? j
          : Math.min(arr[i - 1][j] + 1, arr[i][j - 1] + 1, arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1));
    }
  }
  return arr[t.length][s.length];
};

const universalScraper = async (ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> => {
  const searchResults = await ctx.proxiedFetcher<any>(
    `https://anime-api-cyan-zeta.vercel.app/api/search?keyword=${encodeURIComponent(ctx.media.title)}`,
  );

  const bestMatch = searchResults.results.data
    .map((item: any) => {
      const similarity =
        1 - levenshtein(item.title, ctx.media.title) / Math.max(item.title.length, ctx.media.title.length);
      const isExactMatch = compareTitle(item.title, ctx.media.title);
      return { ...item, similarity, isExactMatch };
    })
    .sort((a: any, b: any) => {
      if (a.isExactMatch && !b.isExactMatch) return -1;
      if (!a.isExactMatch && b.isExactMatch) return 1;
      return b.similarity - a.similarity;
    })[0];

  if (!bestMatch) {
    throw new NotFoundError('No watchable sources found');
  }

  const episodeData = await ctx.proxiedFetcher<any>(`https://anime.aether.mom/api/episodes/${bestMatch.id}`);

  const episode = episodeData.results.episodes.find(
    (e: any) => e.episode_no === (ctx.media.type === 'show' ? ctx.media.episode.number : 1),
  );

  if (!episode) {
    throw new NotFoundError('No watchable sources found');
  }

  return {
    embeds: [
      {
        embedId: 'myanimesub',
        url: episode.id,
      },
      {
        embedId: 'myanimedub',
        url: episode.id,
      },
    ],
  };
};

export const myanimeScraper = makeSourcerer({
  id: 'myanime',
  name: 'MyAnime',
  rank: 101,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: universalScraper,
  scrapeShow: universalScraper,
});
