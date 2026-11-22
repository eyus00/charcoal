import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, Check, Plus } from 'lucide-react';
import Img from './Img';
import { Chip } from './EpisodeTile';
import { CARD_IMAGE, CARD_INFO, CARD_TITLE, CornerArc, TypeIcon } from './MediaCard';
import { Tip } from './Tip';
import { toast } from './Toast';
import { peekProps } from '../lib/peek';
import { toggleFollow, useFollows } from '../lib/follows';
import { DAY, startOfDay, type Airing } from '../lib/schedule';
import { actions, useStore } from '../lib/store';
import { q } from '../lib/tmdb';
import { cx } from '../lib/util';

/** "Today", "Tomorrow", "Thursday" or "Nov 30". */
export function dayName(at: number, long = true) {
  const d = startOfDay(new Date(at)).getTime();
  const today = startOfDay(new Date()).getTime();
  if (d === today) return 'Today';
  if (d === today + DAY) return 'Tomorrow';
  if (d === today - DAY) return 'Yesterday';
  if (d > today && d < today + 7 * DAY) return new Date(d).toLocaleDateString(undefined, { weekday: long ? 'long' : 'short' });
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const linkOf = (a: Airing) => (a.type === 'tv' && a.season ? `/tv/${a.id}?episodes=${a.season}&ep=${a.episode}` : `/${a.type}/${a.id}`);

const subOf = (a: Airing) => a.sub ?? (a.tag === 'In theaters' ? 'Movie · In theaters' : 'Movie · New to stream');

/**
 * The card's one action. Shows: Follow (joins "Your shows", with reminders for new episodes).
 * Movies: add to your watchlist as "To watch" (in-theater films can't be streamed yet, so that's
 * all they get).
 */
function AiringAction({ a }: { a: Airing }) {
  const qc = useQueryClient();
  const follows = useFollows();
  const listed = useStore((s) => s.watchlist.find((w) => w.mediaType === 'movie' && w.id === a.id));
  const round = 'group/tip relative grid size-9 place-items-center rounded-full backdrop-blur-sm transition-colors';
  if (a.type === 'tv') {
    const on = a.yours || follows.some((f) => f.id === a.id);
    const followed = follows.some((f) => f.id === a.id);
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          // Shows you watch or saved are already yours; only explicit follows toggle.
          if (on && !followed) return toast(`${a.title} is already in your shows`);
          toggleFollow(a.id, a.title);
        }}
        aria-pressed={on}
        aria-label={on ? `Following ${a.title}` : `Follow ${a.title}`}
        className={cx(round, on ? 'bg-white text-black' : 'bg-black/60 text-white hover:bg-black/80')}
      >
        {on ? <Check className="size-4" strokeWidth={2.5} /> : <Plus className="size-4" strokeWidth={2.5} />}
        <Tip label={on ? (followed ? 'Following · tap to unfollow' : 'In your shows') : 'Follow: add to your shows, with reminders'} side="bottom" align="end" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        if (listed) {
          actions.removeBookmark('movie', a.id);
          return toast(`Removed “${a.title}” from your watchlist`);
        }
        const d = await qc.fetchQuery(q.lite('movie', a.id)).catch(() => null);
        actions.setBookmark({ id: a.id, mediaType: 'movie', title: a.title, posterPath: d?.poster_path ?? null, releaseDate: d?.release_date, ratingScore: d?.vote_average, status: 'planned' });
        toast(`Added “${a.title}” to To watch`);
      }}
      aria-pressed={!!listed}
      aria-label={listed ? `Remove ${a.title} from your watchlist` : `Add ${a.title} to To watch`}
      className={cx(round, listed ? 'bg-white text-black' : 'bg-black/60 text-white hover:bg-black/80')}
    >
      {listed ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
      <Tip label={listed ? 'On your watchlist · tap to remove' : 'Add to To watch'} side="bottom" align="end" />
    </button>
  );
}

/** A release as a landscape card, the same for shows and movies. `day`: show which day (Home). */
export default function AiringTile({ a, day, className }: { a: Airing; day?: boolean; className?: string }) {
  const highlight = a.tag === 'Series premiere' ? 'Premiere' : a.tag === 'Season premiere' ? 'New season' : a.tag === 'Finale' ? 'Finale' : null;
  return (
    <div className={cx('group relative', className)}>
      <Link to={linkOf(a)} {...peekProps(a.type, a.id)} aria-label={`${a.title}, ${subOf(a)}`} className="absolute inset-0 z-0 rounded-2xl" />
      <div className="pointer-events-none relative">
        <div className={CARD_IMAGE}>
          <Img path={null} src={a.image} kind="still" sizes="(min-width: 640px) 320px, 280px" alt="" className="aspect-video" />
          {day && (
            <span className="absolute top-2 left-2">
              <Chip>{dayName(a.at)}</Chip>
            </span>
          )}
          {highlight && (
            <span className="absolute bottom-2 left-2">
              <Chip light>{highlight}</Chip>
            </span>
          )}
          <span className="pointer-events-auto absolute top-2 right-2">
            <AiringAction a={a} />
          </span>
        </div>
        <div className={CARD_INFO}>
          <div className={CARD_TITLE}>{a.title}</div>
          <div className="flex items-center gap-1.5 text-caption text-muted">
            <span className="truncate">{subOf(a)}</span>
            <TypeIcon type={a.type} />
          </div>
          <CornerArc />
        </div>
      </div>
    </div>
  );
}

export function AiringTileSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="skeleton aspect-video rounded-2xl" />
      <div className="skeleton mt-2.5 h-3.5 w-3/4 rounded-md" />
      <div className="skeleton mt-2 h-3 w-1/2 rounded-md" />
    </div>
  );
}
