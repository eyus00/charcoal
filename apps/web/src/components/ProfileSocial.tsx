import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Film, Heart, MessageCircle, Star, Trash2, UserCircle, Users } from 'lucide-react';
import Img from './Img';
import { btn } from './Button';
import { toast } from './Toast';
import { Tip } from './Tip';
import { ROW_ITEM, ROW_SIZES, RowArrows, Scroller, SectionHeader, useRowScroll } from './Row';
import { CardSkeleton } from './Skeletons';
import { FriendCard } from './TraktRows';
import { epLabel } from '../lib/episodes';
import { peekProps } from '../lib/peek';
import { deleteComment, startTraktLogin, useTraktUser } from '../lib/trakt';
import { fetchHistory, fetchMyComments, fetchMyRatings, fetchMyStats, tImg, type MyComment, type TMedia, type TUser } from '../lib/traktData';
import { cx, timeAgo } from '../lib/util';

const PANEL = 'rounded-3xl bg-surface/60 p-4 ring-1 ring-white/[0.06] md:p-6';

function Avatar({
  user,
  className,
}: {
  user: {
    username: string;
    name?: string | null;
    avatar?: string;
    images?: { avatar?: { full?: string } };
  };
  className?: string;
}) {
  const src = user.avatar ?? user.images?.avatar?.full;
  const name = user.name || user.username;
  return src ? (
    <img src={src} alt="" className={cx('shrink-0 rounded-full bg-white/10 object-cover', className)} />
  ) : (
    <span className={cx('grid shrink-0 place-items-center rounded-full bg-white/10 font-medium uppercase', className)}>{name[0]}</span>
  );
}

/**
 * The profile header: your Trakt identity and numbers when connected (merged with what's saved
 * here), otherwise this browser's.
 */
export function ProfileHeader({ local }: { local: { k: string; v: number }[] }) {
  const user = useTraktUser();
  const { data: s } = useQuery({
    queryKey: ['trakt', 'my-stats', user?.username],
    queryFn: fetchMyStats,
    enabled: !!user,
    staleTime: 10 * 60_000,
  });
  const stats = user
    ? [
        { k: 'Movies watched', v: s?.movies.watched ?? 0 },
        { k: 'Episodes watched', v: s?.episodes.watched ?? 0 },
        { k: 'Hours watched', v: s ? Math.round((s.movies.minutes + s.episodes.minutes) / 60) : 0 },
        { k: 'Ratings', v: s?.ratings.total ?? 0 },
      ]
    : local;
  return (
    <section id="profile" className="scroll-mt-4 space-y-3">
      <div className="flex items-center gap-4 rounded-3xl bg-surface p-5">
        {user ? (
          <Avatar user={user} className="size-14 text-xl" />
        ) : (
          <div className="grid size-14 place-items-center rounded-2xl bg-raised text-accent">
            <UserCircle className="size-7" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">{user ? user.name || user.username : 'Your profile'}</h1>
          <p className="truncate text-sm text-muted">
            {user ? (
              <>
                <a href={`https://trakt.tv/users/${user.username}`} target="_blank" rel="noreferrer" className="group/tip relative transition-colors hover:text-white">
                  @{user.username}
                  <Tip label="Open on trakt.tv" side="bottom" align="start" />
                </a>
              </>
            ) : (
              'Watch history, watchlist and settings, saved in this browser'
            )}
          </p>
        </div>
        {!user && (
          <button type="button" onClick={() => startTraktLogin('/profile')} className={cx(btn(), 'hidden sm:inline-flex')}>
            Connect Trakt
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((x) => (
          <div key={x.k} className="rounded-2xl bg-surface px-4 py-3.5">
            <div className="text-sm text-muted">{x.k}</div>
            {user && !s ? <div className="skeleton mt-2 h-7 w-20 rounded-md" /> : <div className="mt-1 text-2xl font-semibold tabular-nums">{x.v.toLocaleString()}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The empty / connect state every profile section uses (same as Library's). */
export function EmptyState({ icon: Icon, title, body, action }: { icon: typeof Users; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-2xl bg-raised/50 px-6 py-10 text-center">
      <Icon className="mb-1 size-7 text-faint" />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-pretty text-muted">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const connect = (to: string) => (
  <button type="button" onClick={() => startTraktLogin(to)} className={btn({ variant: 'primary' })}>
    Connect Trakt
  </button>
);

/** A titled panel with a sideways row and arrows, like Watch history and Watchlist. */
function RowPanel({ title, count, children }: { title: string; count?: number; children: (scrollRef: React.RefObject<HTMLDivElement | null>) => React.ReactNode }) {
  const { ref, scroll } = useRowScroll();
  return (
    <div className={PANEL}>
      <SectionHeader title={count ? `${title} · ${count}` : title} action={<RowArrows onScroll={scroll} />} />
      {children(ref)}
    </div>
  );
}

const WIDE_ITEM = 'w-[248px] shrink-0 snap-start sm:w-[288px]';

function WideSkeletons({ n = 5 }: { n?: number }) {
  return (
    <div className="-mx-1 flex gap-4 overflow-hidden px-1">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={WIDE_ITEM}>
          <div className="skeleton aspect-video rounded-2xl" />
          <div className="skeleton mt-2.5 h-3.5 w-3/4 rounded-md" />
          <div className="skeleton mt-2 h-3 w-1/3 rounded-md" />
        </div>
      ))}
    </div>
  );
}

const mediaOf = (x: { movie?: TMedia; show?: TMedia }) => (x.movie ? { m: x.movie, type: 'movie' as const } : x.show ? { m: x.show, type: 'tv' as const } : null);

// ---------- Activity: what you watched, your comments and ratings ----------

export function ActivityTab() {
  const user = useTraktUser();
  if (!user)
    return (
      <div className={PANEL}>
        <EmptyState
          icon={Activity}
          title="Your activity on Trakt"
          body="Connect Trakt to see everything you've watched, your comments and your ratings in one place."
          action={connect('/profile?tab=activity')}
        />
      </div>
    );
  return (
    <div className="space-y-6">
      <RecentlyWatched />
      <YourComments />
      <YourRatings />
    </div>
  );
}

function RecentlyWatched() {
  const user = useTraktUser()!;
  const { data, isPending, isError } = useQuery({ queryKey: ['trakt', 'history', 'me', user.username], queryFn: () => fetchHistory('me', 24), staleTime: 5 * 60_000 });
  const me: TUser = { username: user.username, name: user.name, ids: { slug: user.username } };
  return (
    <RowPanel title="Recently watched">
      {(ref) =>
        isPending ? (
          <WideSkeletons />
        ) : isError || !data?.length ? (
          <EmptyState icon={Film} title="Nothing here yet" body="Movies and episodes you finish in the Jelly player are marked on Trakt and show up here." />
        ) : (
          <Scroller label="Recently watched" scrollRef={ref} bleed={false}>
            {data.map((h) => {
              const x = mediaOf(h);
              return x && <FriendCard key={h.id} user={me} media={x.m} episode={h.episode} type={x.type} when={Date.parse(h.watched_at)} self />;
            })}
          </Scroller>
        )
      }
    </RowPanel>
  );
}

function YourComments() {
  const qc = useQueryClient();
  const user = useTraktUser()!;
  const { data, isPending, isError } = useQuery({ queryKey: ['trakt', 'my-comments', user.username], queryFn: fetchMyComments, staleTime: 2 * 60_000 });
  const list = (data ?? []).filter((c) => !c.comment.parent_id);
  const remove = useMutation({
    mutationFn: (id: number) => deleteComment(id),
    onSuccess: () => {
      toast('Comment deleted');
      qc.invalidateQueries({ queryKey: ['trakt', 'my-comments'] });
      qc.invalidateQueries({ queryKey: ['trakt', 'comments'] });
    },
    onError: (e) => toast((e as Error).message),
  });
  return (
    <RowPanel title="Your comments" count={list.length}>
      {(ref) =>
        isPending ? (
          <div className="-mx-1 flex gap-4 overflow-hidden px-1">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-44 w-[300px] shrink-0 rounded-2xl sm:w-[340px]" />
            ))}
          </div>
        ) : isError || !list.length ? (
          <EmptyState icon={MessageCircle} title="No comments yet" body="Open any title and share what you think under “What people think”. Your comments show up here." />
        ) : (
          <Scroller label="Your comments" scrollRef={ref} bleed={false}>
            {list.map((c) => (
              <MyCommentCard key={c.comment.id} c={c} onDelete={() => remove.mutate(c.comment.id)} />
            ))}
          </Scroller>
        )
      }
    </RowPanel>
  );
}

function MyCommentCard({ c, onDelete }: { c: MyComment; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const x = mediaOf(c);
  const id = x?.m.ids.tmdb;
  const where = c.episode ? `${epLabel(c.episode.season, c.episode.number)}` : c.type === 'season' ? 'Season' : null;
  return (
    <article className="flex h-44 w-[300px] shrink-0 snap-start gap-3 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06] sm:w-[340px]">
      {x && id ? (
        <Link to={`/${x.type}/${id}`} {...peekProps(x.type, id)} className="w-[76px] shrink-0 self-stretch overflow-hidden rounded-xl transition hover:brightness-110">
          <Img path={null} src={tImg(x.m.images?.poster)} kind="poster" sizes="76px" alt="" className="h-full" />
        </Link>
      ) : (
        <div className="w-[76px] shrink-0 rounded-xl bg-white/5" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-sm font-medium">
          {x?.m.title}
          {where && <span className="font-normal text-muted"> · {where}</span>}
        </p>
        <p className="text-xs text-faint">
          {timeAgo(Date.parse(c.comment.created_at))}
          {c.comment.spoiler && ' · Spoilers'}
        </p>
        <p className="mt-1.5 line-clamp-3 text-caption leading-5 whitespace-pre-line text-white/85">{c.comment.comment}</p>
        <div className="mt-auto flex items-center gap-4 text-xs text-faint">
          <span className="flex items-center gap-1 tabular-nums">
            <Heart className="size-3.5" /> {c.comment.likes}
          </span>
          <span className="flex items-center gap-1 tabular-nums">
            <MessageCircle className="size-3.5" /> {c.comment.replies}
          </span>
          <button
            type="button"
            onClick={() => (confirm ? onDelete() : setConfirm(true))}
            onBlur={() => setConfirm(false)}
            className={cx('ml-auto flex w-16 items-center justify-end gap-1 transition-colors', confirm ? 'text-danger' : 'hover:text-white')}
          >
            <Trash2 className="size-3.5" /> {confirm ? 'Delete?' : 'Delete'}
          </button>
        </div>
      </div>
    </article>
  );
}

function YourRatings() {
  const user = useTraktUser()!;
  const { data, isPending, isError } = useQuery({ queryKey: ['trakt', 'my-ratings-all', user.username], queryFn: fetchMyRatings, staleTime: 5 * 60_000 });
  const items = (data ?? []).filter((r) => (r.type === 'movie' || r.type === 'show') && (r.movie ?? r.show)?.ids.tmdb).sort((a, b) => Date.parse(b.rated_at) - Date.parse(a.rated_at));
  return (
    <RowPanel title="Your ratings" count={items.length}>
      {(ref) =>
        isPending ? (
          <div className="-mx-1 flex gap-4 overflow-hidden px-1">
            {Array.from({ length: 8 }, (_, i) => (
              <CardSkeleton key={i} className={ROW_ITEM} />
            ))}
          </div>
        ) : isError || !items.length ? (
          <EmptyState icon={Star} title="No ratings yet" body="Rate titles from their page, under “What people think”. Your scores show up here." />
        ) : (
          <Scroller label="Your ratings" scrollRef={ref} bleed={false}>
            {items.slice(0, 60).map((r) => {
              const x = mediaOf(r)!;
              const id = x.m.ids.tmdb!;
              return (
                <Link key={`${x.type}-${id}`} to={`/${x.type}/${id}`} {...peekProps(x.type, id)} className={cx('group', ROW_ITEM)}>
                  <div className="relative overflow-hidden rounded-2xl transition duration-200 group-hover:brightness-110">
                    <Img path={null} src={tImg(x.m.images?.poster)} kind="poster" sizes={ROW_SIZES} alt="" className="aspect-[2/3]" />
                    <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
                      <Star className="size-3 fill-current text-star" strokeWidth={0} /> {r.rating}
                    </span>
                  </div>
                  <div className="pt-2">
                    <p className="truncate text-body-sm font-medium text-white/90 transition-colors group-hover:text-white">{x.m.title}</p>
                    <p className="text-caption text-muted">
                      {x.m.year} · rated {timeAgo(Date.parse(r.rated_at))}
                    </p>
                  </div>
                </Link>
              );
            })}
          </Scroller>
        )
      }
    </RowPanel>
  );
}
