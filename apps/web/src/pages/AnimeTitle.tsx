import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Play, Sparkles, Star } from 'lucide-react';
import { watchableEpisodes, type AnimeDetails } from '@charcoal/content';
import { btn } from '../components/Button';
import { ErrorBox } from '../components/Grid';
import { BLEED } from '../components/Hero';
import { Empty } from '../components/PageHeader';
import { Pill, SectionHeader } from '../components/Row';
import Segmented from '../components/Segmented';
import { DetailsSkeleton } from '../components/Skeletons';
import { FORMAT_LABEL, lastEpisode, useAnimeEntry, useTmdbPage } from '../lib/anilist';
import type { AnimeAudio } from '../lib/anime';
import { actions, useStore } from '../lib/store';
import { cx, useTitle } from '../lib/util';

const AUDIO: { key: AnimeAudio; label: string }[] = [
  { key: 'sub', label: 'Sub' },
  { key: 'dub', label: 'Dub' },
];
/** Episodes per page of the episode grid (long-running entries have hundreds). */
const RANGE = 100;
const FRAME = cx(BLEED, 'min-h-[92svh] md:min-h-[86svh]');

/**
 * An AniList entry. One that TMDB also has opens as that TMDB title (library, history, episode
 * stills, everything a title page has). One it doesn't have is shown here from AniList, and its
 * episodes play by its AniList / MAL id.
 */
export default function AnimeTitle() {
  const id = Number(useParams().id);
  const valid = Number.isInteger(id) && id > 0;
  const tmdb = useTmdbPage(valid ? id : 0);
  const entry = useAnimeEntry(valid ? id : 0);
  useTitle(entry.data?.title ?? 'Anime');

  if (!valid) return <Empty icon={Sparkles} title="This anime doesn’t exist" body="The address isn’t one of AniList’s entries." />;
  if (tmdb.data) return <Navigate to={tmdb.data} replace />;
  // Wait for both: showing this page and then jumping to the TMDB one would be a flash.
  if (tmdb.isPending || entry.isPending) return <DetailsSkeleton className={FRAME} />;
  if (entry.error) return <ErrorBox onRetry={() => entry.refetch()} message="Couldn’t load this anime. AniList didn’t answer; try again in a moment." />;
  if (!entry.data) return <Empty icon={Sparkles} title="This anime doesn’t exist" body="AniList has no entry with this number." />;
  return <Entry a={entry.data} />;
}

function Entry({ a }: { a: AnimeDetails }) {
  const audio = useStore((s) => s.settings.animeAudio);
  const count = watchableEpisodes(a);
  const last = useMemo(() => lastEpisode(a.id), [a.id]);
  const resume = last && last <= count ? last : 1;
  const names = [a.romaji, a.native].filter((n) => n && n !== a.title).join(' · ');
  const facts = [
    a.format && (FORMAT_LABEL[a.format] ?? a.format),
    a.year,
    a.kind === 'series' && (a.episodes ? `${a.episodes} episodes` : a.aired ? `${a.aired} episodes so far` : null),
    a.duration && `${a.duration} min`,
    a.studio,
  ].filter(Boolean);
  return (
    <div className="pb-10">
      <section className={cx(FRAME, 'relative flex items-end overflow-hidden bg-surface')}>
        {(a.banner ?? a.cover) && (
          <img src={a.banner ?? a.cover} alt="" referrerPolicy="no-referrer" className={cx('absolute inset-0 size-full object-cover', !a.banner && 'scale-110 opacity-40 blur-2xl')} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-bg/50" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-bg/80 via-bg/20 to-transparent md:block" />
        <div className="relative w-full px-4 pb-6 md:px-8 md:pb-10 lg:px-10">
          <div className="relative max-w-xl rounded-3xl bg-black/35 p-5 ring-1 ring-white/10 backdrop-blur-xl md:p-7">
            <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">{a.title}</h1>
            {names && (
              <p className="mt-1 text-sm text-white/70" data-testid="other-names">
                {names}
              </p>
            )}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-white/75">
              {facts.map((f, i) => (
                <span key={i} className="contents">
                  {i > 0 && <span className="text-white/40">·</span>}
                  <span>{f}</span>
                </span>
              ))}
              {a.score && (
                <>
                  <span className="text-white/40">·</span>
                  <span className="flex items-center gap-1 font-medium text-white/90">
                    <Star className="size-3.5 fill-current text-star" strokeWidth={0} />
                    {a.score.toFixed(1)}
                  </span>
                </>
              )}
            </p>
            {a.genres.length > 0 && <p className="mt-2 text-sm text-muted">{a.genres.slice(0, 4).join(', ')}</p>}
            {a.description && <p className="mt-3 line-clamp-5 text-body-sm whitespace-pre-line text-pretty text-white/75">{a.description}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {count > 0 ? (
                <Link to={`/anime/watch/${a.id}${resume > 1 ? `?ep=${resume}` : ''}`} className={btn({ variant: 'primary', size: 'lg' })}>
                  <Play className="size-4 fill-current" strokeWidth={0} /> {a.kind === 'film' ? 'Watch now' : resume > 1 ? `Continue episode ${resume}` : 'Watch episode 1'}
                </Link>
              ) : (
                <span className={cx(btn({ size: 'lg' }), 'pointer-events-none opacity-60')}>Not out yet</span>
              )}
              <Segmented value={audio} options={AUDIO} onChange={(v) => actions.updateSettings({ animeAudio: v })} label="Anime audio" />
            </div>
          </div>
        </div>
      </section>

      {a.kind === 'series' && count > 1 && <Episodes id={a.id} count={count} current={last} />}
      <p className="mt-8 text-xs text-pretty text-faint">
        From AniList. TMDB doesn’t list this entry, so it can’t be added to your library yet; the episode you last opened is remembered on this device.
      </p>
    </div>
  );
}

function Episodes({ id, count, current }: { id: number; count: number; current?: number }) {
  const ranges = Math.ceil(count / RANGE);
  const [range, setRange] = useState(() => Math.floor(((current && current <= count ? current : 1) - 1) / RANGE));
  const first = range * RANGE + 1;
  const shown = Math.min(RANGE, count - first + 1);
  return (
    <section className="mt-10" aria-label="Episodes">
      <SectionHeader title="Episodes" />
      {ranges > 1 && (
        <div className="no-scrollbar scroll-row mb-5 flex gap-2.5 overflow-x-auto" role="group" aria-label="Episode range">
          {Array.from({ length: ranges }, (_, r) => (
            <Pill key={r} on={r === range} onClick={() => setRange(r)}>
              {r * RANGE + 1}–{Math.min(count, (r + 1) * RANGE)}
            </Pill>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-5 gap-2.5 sm:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12" data-testid="anime-episodes">
        {Array.from({ length: shown }, (_, i) => {
          const n = first + i;
          return (
            <li key={n}>
              <Link
                to={`/anime/watch/${id}?ep=${n}`}
                aria-label={`Episode ${n}`}
                aria-current={n === current ? 'true' : undefined}
                className={cx('grid h-11 place-items-center rounded-xl text-sm tabular-nums transition-colors', n === current ? 'bg-white font-medium text-black' : 'bg-surface text-white/85 hover:bg-raised hover:text-white')}
              >
                {n}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
