import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import Img from "./Img";
import MediaCard, {
  CARD_IMAGE,
  CARD_INFO,
  CARD_LIFT,
  CARD_TITLE,
  CornerArc,
} from "./MediaCard";
import {
  ROW_BLEED,
  ROW_ITEM,
  ROW_SIZES,
  RowArrows,
  Scroller,
  SectionHeader,
  useRowScroll,
} from "./Row";
import { CardSkeleton } from "./Skeletons";
import { epLabel } from "../lib/episodes";
import { peekProps } from "../lib/peek";
import { useTraktUser } from "../lib/trakt";
import {
  fetchFollowing,
  fetchFriendsActivity,
  fetchRecommendations,
  tImg,
  type TEpisode,
  type TMedia,
  type TUser,
} from "../lib/traktData";
import { cx, timeAgo, useInView } from "../lib/util";

/** Picks from your Trakt ratings and history (only when connected). */
export function ForYouRow() {
  const user = useTraktUser();
  const [ref, inView] = useInView<HTMLElement>("500px");
  const { data, isPending } = useQuery({
    queryKey: ["trakt", "for-you", user?.username],
    queryFn: () => fetchRecommendations("all"),
    enabled: !!user && inView,
    staleTime: 30 * 60_000,
  });
  const { ref: scrollRef, scroll } = useRowScroll();
  if (!user || (data && !data.length)) return null;
  return (
    <section ref={ref}>
      <SectionHeader
        title="For you"
        action={
          <div className="flex items-center gap-3">
            <Link
              to="/discover?list=foryou"
              className="text-sm text-muted transition-colors hover:text-white"
            >
              See all
            </Link>
            <RowArrows onScroll={scroll} />
          </div>
        }
      />
      {isPending || !data ? (
        <div className={cx("flex gap-4 overflow-hidden", ROW_BLEED)}>
          {Array.from({ length: 8 }, (_, i) => (
            <CardSkeleton key={i} className={ROW_ITEM} />
          ))}
        </div>
      ) : (
        <Scroller label="For you" scrollRef={scrollRef}>
          {data.slice(0, 20).map(({ item }) => (
            <MediaCard
              key={`${item.media_type}-${item.id}`}
              item={item}
              sizes={ROW_SIZES}
              className={ROW_ITEM}
            />
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
  type: "movie" | "tv";
  when: number;
  live?: boolean;
  /** your own play: no name chip */ self?: boolean;
  className?: string;
}) {
  const id = media.ids.tmdb;
  if (!id) return null;
  const name = user.name || user.username;
  const avatar = user.images?.avatar?.full;
  const image =
    tImg(episode?.images?.screenshot) ??
    tImg(media.images?.fanart) ??
    tImg(media.images?.thumb);
  return (
    <Link
      to={`/${type}/${id}`}
      {...peekProps(type, id)}
      className={cx(
        "group block shrink-0 snap-start",
        className ?? "w-[248px] sm:w-[288px]",
        CARD_LIFT,
      )}
    >
      <div className={CARD_IMAGE}>
        <Img
          path={null}
          src={image}
          kind="still"
          sizes="288px"
          alt=""
          className="aspect-video"
        />
        {!self && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/60 py-1 pr-2.5 pl-1 text-xs backdrop-blur-sm">
            {avatar ? (
              <img
                src={avatar}
                alt=""
                className="size-5 rounded-full object-cover"
              />
            ) : (
              <span className="grid size-5 place-items-center rounded-full bg-white/20 text-micro uppercase">
                {name[0]}
              </span>
            )}
            <span className="max-w-28 truncate">{name}</span>
          </span>
        )}
        {live && (
          <span className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-black">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />{" "}
            Watching now
          </span>
        )}
      </div>
      <div className={CARD_INFO}>
        <div className={CARD_TITLE}>{media.title}</div>
        <div className="truncate text-caption text-muted">
          {episode
            ? `${epLabel(episode.season, episode.number)}${episode.title ? ` · ${episode.title}` : ""}`
            : media.year}
          {!live && <span className="text-faint"> · {timeAgo(when)}</span>}
        </div>
        <CornerArc />
      </div>
    </Link>
  );
}

/** What the people you follow on Trakt are watching (only when connected and following someone). */
export function FriendsRow() {
  const user = useTraktUser();
  const [ref, inView] = useInView<HTMLElement>("500px");
  const following = useQuery({
    queryKey: ["trakt", "following", user?.username],
    queryFn: fetchFollowing,
    enabled: !!user && inView,
    staleTime: 10 * 60_000,
  });
  const activity = useQuery({
    queryKey: ["trakt", "friends-activity", user?.username],
    queryFn: () =>
      fetchFriendsActivity((following.data ?? []).map((f) => f.user)),
    enabled: !!following.data?.length,
    staleTime: 5 * 60_000,
  });
  const { ref: scrollRef, scroll } = useRowScroll();
  if (!user) return null;
  if (following.data && !following.data.length) return null;
  const a = activity.data;
  const cards = a
    ? [
        ...a.watchingNow.map(({ user: u, now }) => ({
          key: `now-${u.username}`,
          user: u,
          media: (now.movie ?? now.show)!,
          episode: now.episode,
          type: now.movie ? ("movie" as const) : ("tv" as const),
          when: Date.now(),
          live: true,
        })),
        ...a.feed.map(({ user: u, row, at }) => ({
          key: `h-${row.id}`,
          user: u,
          media: (row.movie ?? row.show)!,
          episode: row.episode,
          type: row.movie ? ("movie" as const) : ("tv" as const),
          when: at,
          live: false,
        })),
      ].filter((c) => c.media)
    : [];
  if (a && !cards.length) return null;
  return (
    <section ref={ref}>
      <SectionHeader
        title="Friends"
        action={
          <div className="flex items-center gap-3">
            <Link
              to="/profile?tab=friends"
              className="text-sm text-muted transition-colors hover:text-white"
            >
              See all
            </Link>
            <RowArrows onScroll={scroll} />
          </div>
        }
      />
      {!a ? (
        <div className={cx("flex gap-4 overflow-hidden", ROW_BLEED)}>
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="skeleton aspect-video w-[248px] shrink-0 rounded-2xl sm:w-[288px]"
            />
          ))}
        </div>
      ) : (
        <Scroller label="Friends" scrollRef={scrollRef}>
          {cards.slice(0, 20).map(({ key, ...c }) => (
            <FriendCard key={key} {...c} />
          ))}
        </Scroller>
      )}
    </section>
  );
}
