import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Film, Heart, MessageCircle, Search, Star, Trash2, UserCircle, UserPlus, Users } from 'lucide-react';
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
import {
  fetchFollowing,
  fetchFriendsActivity,
  fetchHistory,
  fetchMyComments,
  fetchMyRatings,
  fetchMyStats,
  follow,
  fetchFollowers,
  lookupUser,
  userSlug,
  tImg,
  type MyComment,
  type TMedia,
  type TUser,
} from '../lib/traktData';
import { cx, timeAgo } from '../lib/util';

const PANEL = 'rounded-3xl bg-surface/60 p-4 ring-1 ring-white/[0.06] md:p-6';
const fmt = (n: number) => new Intl.NumberFormat().format(n);

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
                {s && (
                  <>
                    {' · '}
                    {fmt(s.network.following)} following · {fmt(s.network.followers)} followers
                  </>
                )}
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

// ---------- Friends ----------

type Lookup = { state: 'idle' } | { state: 'loading'; slug: string } | { state: 'found'; user: TUser } | { state: 'missing'; slug: string };

export function FriendsTab() {
  const user = useTraktUser();
  const qc = useQueryClient();
  const following = useQuery({ queryKey: ['trakt', 'following', user?.username], queryFn: fetchFollowing, enabled: !!user, staleTime: 2 * 60_000 });
  const followers = useQuery({ queryKey: ['trakt', 'followers', user?.username], queryFn: fetchFollowers, enabled: !!user, staleTime: 5 * 60_000 });
  const activity = useQuery({
    queryKey: ['trakt', 'friends-activity', user?.username],
    queryFn: () => fetchFriendsActivity((following.data ?? []).map((f) => f.user)),
    enabled: !!following.data?.length,
    staleTime: 2 * 60_000,
  });
  const followed = new Set((following.data ?? []).map((f) => f.user.ids.slug));
  // Optimistic follow state, so buttons flip at once.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const isFollowing = (slug: string) => pending[slug] ?? followed.has(slug);
  const toggle = useMutation({
    mutationFn: ({ u, on }: { u: TUser; on: boolean }) => follow(u.ids.slug, on),
    onMutate: ({ u, on }) => setPending((p) => ({ ...p, [u.ids.slug]: on })),
    onSuccess: (_d, { u, on }) => {
      toast(on ? (u.private ? `Follow request sent to ${u.username}` : `Following ${u.name || u.username}`) : `Unfollowed ${u.name || u.username}`);
      qc.invalidateQueries({ queryKey: ['trakt', 'following'] });
      qc.invalidateQueries({ queryKey: ['trakt', 'friends-activity'] });
      qc.invalidateQueries({ queryKey: ['trakt', 'my-stats'] });
    },
    onError: (e, { u }) => {
      setPending((p) => ({ ...p, [u.ids.slug]: !p[u.ids.slug] }));
      toast((e as Error).message);
    },
  });
  const onToggle = (u: TUser) => toggle.mutate({ u, on: !isFollowing(u.ids.slug) });

  if (!user)
    return (
      <div className={PANEL}>
        <EmptyState icon={Users} title="Friends" body="Connect Trakt to follow friends and see what they're watching, rating and talking about." action={connect('/profile?tab=friends')} />
      </div>
    );

  const a = activity.data;
  const suggestions = (followers.data ?? []).filter((f) => !followed.has(f.user.ids.slug) && f.user.ids.slug !== user.username).slice(0, 6);
  const feedCount = (a?.watchingNow.length ?? 0) + (a?.feed.length ?? 0);
  return (
    <div className="space-y-6">
      <FindPeople me={user.username} isFollowing={isFollowing} onToggle={onToggle} />

      <RowPanel title="What friends watched">
        {(ref) =>
          following.isPending || (!!following.data?.length && activity.isPending) ? (
            <WideSkeletons />
          ) : !following.data?.length ? (
            <EmptyState icon={Users} title="Follow people to see what they watch" body="Find friends by their Trakt username above. Their plays show up here." />
          ) : !feedCount ? (
            <EmptyState icon={Film} title="Nothing yet" body="When people you follow watch something it shows up here. Private profiles stay private." />
          ) : (
            <Scroller label="What friends watched" scrollRef={ref} bleed={false}>
              {a!.watchingNow.map(({ user: u, now }) => {
                const x = mediaOf(now);
                return x && <FriendCard key={`now-${u.username}`} user={u} media={x.m} episode={now.episode} type={x.type} when={Date.now()} live />;
              })}
              {a!.feed.map(({ user: u, row, at }) => {
                const x = mediaOf(row);
                return x && <FriendCard key={row.id} user={u} media={x.m} episode={row.episode} type={x.type} when={at} />;
              })}
            </Scroller>
          )
        }
      </RowPanel>

      <div className={PANEL}>
        <SectionHeader title={following.data?.length ? `Following · ${following.data.length}` : 'Following'} />
        {following.isPending ? (
          <PeopleSkeleton />
        ) : !following.data?.length ? (
          <EmptyState icon={UserPlus} title="You’re not following anyone yet" body="Look people up by username above, or follow back the people who follow you." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {following.data.map(({ user: u }) => {
              const now = a?.watchingNow.find((w) => w.user.ids.slug === u.ids.slug)?.now;
              const what = now && (now.movie ?? now.show);
              return (
                <PersonRow
                  key={u.ids.slug}
                  u={u}
                  following={isFollowing(u.ids.slug)}
                  status={what ? `Watching ${what.title}${now.episode ? ` · ${epLabel(now.episode.season, now.episode.number)}` : ''}` : undefined}
                  onToggle={() => onToggle(u)}
                />
              );
            })}
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className={PANEL}>
          <SectionHeader title="Follows you" />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {suggestions.map(({ user: u }) => (
              <PersonRow key={u.ids.slug} u={u} following={isFollowing(u.ids.slug)} onToggle={() => onToggle(u)} followBack />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Look someone up by username or profile link. One fixed-height result slot, so nothing jumps. */
function FindPeople({ me, isFollowing, onToggle }: { me: string; isFollowing: (slug: string) => boolean; onToggle: (u: TUser) => void }) {
  const [query, setQuery] = useState('');
  const [res, setRes] = useState<Lookup>({ state: 'idle' });
  const find = async () => {
    const slug = userSlug(query);
    if (!slug) return;
    setRes({ state: 'loading', slug });
    try {
      const u = await lookupUser(slug);
      setRes(u?.ids?.slug ? { state: 'found', user: u } : { state: 'missing', slug });
    } catch {
      setRes({ state: 'missing', slug });
    }
  };
  return (
    <div className={PANEL}>
      <SectionHeader title="Find people" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          find();
        }}
        className="flex gap-2"
      >
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-raised px-4 ring-1 ring-white/[0.06] focus-within:ring-white/20">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) setRes({ state: 'idle' });
            }}
            placeholder="Trakt username or profile link"
            aria-label="Trakt username or profile link"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint sm:text-sm"
          />
        </label>
        <button className={cx(btn({ variant: 'primary' }), 'h-11')} disabled={!query.trim() || res.state === 'loading'}>
          Find
        </button>
      </form>
      <div className="mt-3 h-[68px]" aria-live="polite">
        {res.state === 'idle' && (
          <p className="flex h-full items-center px-2 text-sm text-faint">
            Trakt doesn’t list members, so enter the exact username (it’s in their profile link: trakt.tv/users/<span className="text-muted">name</span>).
          </p>
        )}
        {res.state === 'loading' && (
          <div className="flex h-full items-center gap-3 px-2">
            <div className="skeleton size-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3.5 w-40 rounded-md" />
              <div className="skeleton h-3 w-24 rounded-md" />
            </div>
          </div>
        )}
        {res.state === 'missing' && <p className="flex h-full items-center px-2 text-sm text-muted">No Trakt member called “{res.slug}”. Check the spelling, or paste their profile link.</p>}
        {res.state === 'found' && <PersonRow u={res.user} big following={isFollowing(res.user.ids.slug)} me={res.user.ids.slug === me} onToggle={() => onToggle(res.user)} />}
      </div>
    </div>
  );
}

function PeopleSkeleton() {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex h-[60px] items-center gap-3 p-2">
          <div className="skeleton size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-32 rounded-md" />
            <div className="skeleton h-3 w-20 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PersonRow({
  u,
  following,
  me,
  status,
  big,
  followBack,
  onToggle,
}: {
  u: TUser;
  following: boolean;
  me?: boolean;
  status?: string;
  big?: boolean;
  followBack?: boolean;
  onToggle: () => void;
}) {
  const sub = status ?? [`@${u.username}`, u.private && 'private', u.location].filter(Boolean).join(' · ');
  return (
    <div className={cx('flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-white/[0.04]', big ? 'h-[68px]' : 'h-[60px]')}>
      <a href={`https://trakt.tv/users/${u.ids.slug}`} target="_blank" rel="noreferrer" className="group/tip relative flex min-w-0 flex-1 items-center gap-3">
        <Avatar user={u} className={big ? 'size-11' : 'size-10'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{u.name || u.username}</span>
          <span className={cx('block truncate text-xs', status ? 'text-success' : 'text-muted')}>{sub}</span>
        </span>
        <Tip label="Open profile on trakt.tv" side="bottom" align="start" />
      </a>
      {!me && (
        <button type="button" onClick={onToggle} className={cx(btn({ variant: following ? 'secondary' : 'primary' }), 'h-9 w-[104px] shrink-0 px-0 text-sm')}>
          {following ? 'Following' : followBack ? 'Follow back' : 'Follow'}
        </button>
      )}
    </div>
  );
}
