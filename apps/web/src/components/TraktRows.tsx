import { Link } from 'react-router';
import Img from './Img';
import MediaCard, { CARD_IMAGE, CARD_INFO, CARD_LIFT, CARD_TITLE, CornerArc } from './MediaCard';
import { ROW_BLEED, ROW_ITEM, ROW_SIZES, RowArrows, Scroller, SectionHeader, useRowScroll } from './Row';
import { CardSkeleton } from './Skeletons';
import { epLabel } from '../lib/episodes';
import { peekProps } from '../lib/peek';
import { useForYou } from '../lib/recommend';
import { tImg, type TEpisode, type TMedia, type TUser } from '../lib/traktData';
import { cx, timeAgo } from '../lib/util';

/** Picks for you from what you watch (and Trakt, when connected): see lib/recommend. */
export function ForYouRow() {
  const { items, loading, hasSeeds } = useForYou();
  const { ref: scrollRef, scroll } = useRowScroll();
  if (!hasSeeds || (!loading && items.length < 4)) return null;
  return (
    <section>
      <SectionHeader title="For you" action={<RowArrows onScroll={scroll} />} />
      {loading ? (
        <div className={cx('flex gap-4 overflow-hidden', ROW_BLEED)}>
          {Array.from({ length: 8 }, (_, i) => (
            <CardSkeleton key={i} className={ROW_ITEM} />
          ))}
        </div>
      ) : (
        <Scroller label="For you" scrollRef={scrollRef}>
          {items.map((item) => (
            <MediaCard key={`${item.media_type}-${item.id}`} item={item} sizes={ROW_SIZES} className={ROW_ITEM} />
          ))}
        </Scroller>
      )}
    </section>
  );
}

/** One friend's play: their face on the picture, what and when. */
export function FriendCard({
  user,
  media,
  episode,
  type,
  when,
  live,
  self,
  className,
}: {
  user: TUser;
  media: TMedia;
  episode?: TEpisode;
  type: 'movie' | 'tv';
  when: number;
  live?: boolean;
  /** your own play: no name chip */ self?: boolean;
  className?: string;
}) {
  const id = media.ids.tmdb;
  if (!id) return null;
  const name = user.name || user.username;
  const avatar = user.images?.avatar?.full;
  const image = tImg(episode?.images?.screenshot, true) ?? tImg(media.images?.fanart, true) ?? tImg(media.images?.thumb);
  return (
    <Link to={`/${type}/${id}`} {...peekProps(type, id)} className={cx('group block shrink-0 snap-start', className ?? 'w-[248px] sm:w-[288px]', CARD_LIFT)}>
      <div className={CARD_IMAGE}>
        <Img path={null} src={image} kind="still" sizes="288px" alt="" className="aspect-video" />
        {!self && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/60 py-1 pr-2.5 pl-1 text-xs backdrop-blur-sm">
            {avatar ? (
              <img src={avatar} alt="" className="size-5 rounded-full object-cover" />
            ) : (
              <span className="grid size-5 place-items-center rounded-full bg-white/20 text-micro uppercase">{name[0]}</span>
            )}
            <span className="max-w-28 truncate">{name}</span>
          </span>
        )}
        {live && (
          <span className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-black">
            <span className="size-1.5 animate-pulse rounded-full bg-success" /> Watching now
          </span>
        )}
      </div>
      <div className={CARD_INFO}>
        <div className={CARD_TITLE}>{media.title}</div>
        <div className="truncate text-caption text-muted">
          {episode ? `${epLabel(episode.season, episode.number)}${episode.title ? ` · ${episode.title}` : ''}` : media.year}
          {!live && <span className="text-faint"> · {timeAgo(when)}</span>}
        </div>
        <CornerArc />
      </div>
    </Link>
  );
}
