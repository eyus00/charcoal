import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Heart,
  MessageCircle,
  Search,
  Star,
  Trash2,
  UserCircle,
  Users,
} from "lucide-react";
import Img from "./Img";
import { btn } from "./Button";
import { toast } from "./Toast";
import { Tip } from "./Tip";
import { SectionHeader } from "./Row";
import { FriendCard } from "./TraktRows";
import { epLabel } from "../lib/episodes";
import { peekProps } from "../lib/peek";
import { deleteComment, startTraktLogin, useTraktUser } from "../lib/trakt";
import {
  fetchFollowing,
  fetchFriendsActivity,
  fetchHistory,
  fetchMyComments,
  fetchMyRatings,
  fetchMyStats,
  follow,
  searchUsers,
  tImg,
  type MyComment,
  type TMedia,
  type TUser,
} from "../lib/traktData";
import { cx, timeAgo } from "../lib/util";

const PANEL = "rounded-3xl bg-surface/60 p-4 ring-1 ring-white/[0.06] md:p-6";
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
    <img
      src={src}
      alt=""
      className={cx(
        "shrink-0 rounded-full bg-white/10 object-cover",
        className,
      )}
    />
  ) : (
    <span
      className={cx(
        "grid shrink-0 place-items-center rounded-full bg-white/10 font-medium uppercase",
        className,
      )}
    >
      {name[0]}
    </span>
  );
}

/**
 * The profile header: your Trakt identity and numbers when connected (merged with what's saved
 * here), otherwise this browser's.
 */
export function ProfileHeader({
  local,
}: {
  local: { k: string; v: number }[];
}) {
  const user = useTraktUser();
  const { data: s } = useQuery({
    queryKey: ["trakt", "my-stats", user?.username],
    queryFn: fetchMyStats,
    enabled: !!user,
    staleTime: 10 * 60_000,
  });
  const stats = s
    ? [
        { k: "Movies watched", v: s.movies.watched },
        { k: "Episodes watched", v: s.episodes.watched },
        {
          k: "Hours watched",
          v: Math.round((s.movies.minutes + s.episodes.minutes) / 60),
        },
        { k: "Ratings", v: s.ratings.total },
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
          <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">
            {user ? user.name || user.username : "Your profile"}
          </h1>
          <p className="truncate text-sm text-muted">
            {user ? (
              <>
                <a
                  href={`https://trakt.tv/users/${user.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group/tip relative transition-colors hover:text-white"
                >
                  @{user.username}
                  <Tip label="Open on trakt.tv" side="bottom" align="start" />
                </a>
                {s && (
                  <>
                    {" · "}
                    {fmt(s.network.following)} following ·{" "}
                    {fmt(s.network.followers)} followers
                  </>
                )}
              </>
            ) : (
              "Watch history, watchlist and settings, saved in this browser"
            )}
          </p>
        </div>
        {!user && (
          <button
            type="button"
            onClick={() => startTraktLogin("/profile")}
            className={cx(btn(), "hidden sm:inline-flex")}
          >
            Connect Trakt
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((x) => (
          <div key={x.k} className="rounded-2xl bg-surface px-4 py-3.5">
            <div className="text-sm text-muted">{x.k}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {x.v.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Shown on Trakt tabs while not connected. */
function ConnectCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      className={cx(
        PANEL,
        "flex flex-col items-center gap-2 py-14 text-center",
      )}
    >
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-pretty text-muted">{body}</p>
      <button
        type="button"
        onClick={() => startTraktLogin("/profile?tab=activity")}
        className={cx(btn({ variant: "primary" }), "mt-3")}
      >
        Connect Trakt
      </button>
    </div>
  );
}

const mediaOf = (x: { movie?: TMedia; show?: TMedia }) =>
  x.movie
    ? { m: x.movie, type: "movie" as const }
    : x.show
      ? { m: x.show, type: "tv" as const }
      : null;

// ---------- Activity: your comments, ratings and what you watched ----------

export function ActivityTab() {
  const user = useTraktUser();
  if (!user)
    return (
      <ConnectCard
        title="Your activity on Trakt"
        body="Connect Trakt to see your comments, ratings and everything you've watched, in one place."
      />
    );
  return (
    <div className="space-y-6">
      <div className={PANEL}>
        <RecentlyWatched />
      </div>
      <div className={PANEL}>
        <YourComments />
      </div>
      <div className={PANEL}>
        <YourRatings />
      </div>
    </div>
  );
}

function RecentlyWatched() {
  const user = useTraktUser();
  const { data, isPending } = useQuery({
    queryKey: ["trakt", "history", "me", user?.username],
    queryFn: () => fetchHistory("me", 24),
    staleTime: 5 * 60_000,
  });
  return (
    <section>
      <SectionHeader title="Recently watched" />
      {isPending ? (
        <div className="skeleton h-40 rounded-2xl" />
      ) : !data?.length ? (
        <p className="text-sm text-muted">
          Nothing on Trakt yet. What you finish in the Jelly player shows up
          here.
        </p>
      ) : (
        <div className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-1">
          {data.map((h) => {
            const x = mediaOf(h);
            return (
              x && (
                <FriendCard
                  key={h.id}
                  user={{
                    username: user!.username,
                    name: user!.name,
                    ids: { slug: user!.username },
                    images: { avatar: { full: user!.avatar } },
                  }}
                  media={x.m}
                  episode={h.episode}
                  type={x.type}
                  when={Date.parse(h.watched_at)}
                  self
                />
              )
            );
          })}
        </div>
      )}
    </section>
  );
}

function YourComments() {
  const qc = useQueryClient();
  const user = useTraktUser();
  const { data, isPending } = useQuery({
    queryKey: ["trakt", "my-comments", user?.username],
    queryFn: fetchMyComments,
    staleTime: 2 * 60_000,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteComment(id),
    onSuccess: () => {
      toast("Comment deleted");
      qc.invalidateQueries({ queryKey: ["trakt", "my-comments"] });
      qc.invalidateQueries({ queryKey: ["trakt", "comments"] });
    },
    onError: (e) => toast((e as Error).message),
  });
  return (
    <section>
      <SectionHeader title="Your comments" />
      {isPending ? (
        <div className="skeleton h-28 rounded-2xl" />
      ) : !data?.length ? (
        <p className="text-sm text-muted">
          You haven't commented yet. Open any title and share what you think.
        </p>
      ) : (
        <div className="no-scrollbar grid max-h-[32rem] gap-3 overflow-y-auto overscroll-contain md:grid-cols-2">
          {data.map((c) => (
            <MyCommentCard
              key={c.comment.id}
              c={c}
              onDelete={() => remove.mutate(c.comment.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MyCommentCard({
  c,
  onDelete,
}: {
  c: MyComment;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const x = mediaOf(c);
  const id = x?.m.ids.tmdb;
  const where = c.episode
    ? `${epLabel(c.episode.season, c.episode.number)}${c.episode.title ? ` · ${c.episode.title}` : ""}`
    : c.type === "season"
      ? "Season"
      : null;
  return (
    <article className="flex gap-3 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06]">
      {x && id ? (
        <Link
          to={`/${x.type}/${id}`}
          {...peekProps(x.type, id)}
          className="w-14 shrink-0 self-start overflow-hidden rounded-lg"
        >
          <Img
            path={null}
            src={tImg(x.m.images?.poster)}
            kind="poster"
            sizes="56px"
            alt=""
            className="aspect-[2/3]"
          />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {x?.m.title}
          {where && <span className="font-normal text-muted"> · {where}</span>}
        </p>
        <p className="text-xs text-faint">
          {timeAgo(Date.parse(c.comment.created_at))}
          {c.comment.review && " · Review"}
          {c.comment.spoiler && " · Spoilers"}
        </p>
        <p className="mt-1.5 line-clamp-4 text-caption leading-5 whitespace-pre-line text-white/85">
          {c.comment.comment}
        </p>
        <div className="mt-2 flex items-center gap-4 text-xs text-faint">
          <span className="flex items-center gap-1">
            <Heart className="size-3.5" /> {c.comment.likes}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="size-3.5" /> {c.comment.replies}
          </span>
          <button
            type="button"
            onClick={() => (confirm ? onDelete() : setConfirm(true))}
            onBlur={() => setConfirm(false)}
            className={cx(
              "ml-auto flex items-center gap-1 transition-colors",
              confirm ? "text-danger" : "hover:text-white",
            )}
          >
            <Trash2 className="size-3.5" /> {confirm ? "Delete?" : "Delete"}
          </button>
        </div>
      </div>
    </article>
  );
}

function YourRatings() {
  const user = useTraktUser();
  const { data, isPending } = useQuery({
    queryKey: ["trakt", "my-ratings-all", user?.username],
    queryFn: fetchMyRatings,
    staleTime: 5 * 60_000,
  });
  const items = (data ?? [])
    .filter((r) => r.type === "movie" || r.type === "show")
    .sort((a, b) => Date.parse(b.rated_at) - Date.parse(a.rated_at));
  return (
    <section>
      <SectionHeader title="Your ratings" />
      {isPending ? (
        <div className="skeleton h-40 rounded-2xl" />
      ) : !items.length ? (
        <p className="text-sm text-muted">
          No ratings yet. Rate titles from their page, under “What people
          think”.
        </p>
      ) : (
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {items.slice(0, 40).map((r) => {
            const x = mediaOf(r);
            const id = x?.m.ids.tmdb;
            if (!x || !id) return null;
            return (
              <Link
                key={`${x.type}-${id}`}
                to={`/${x.type}/${id}`}
                {...peekProps(x.type, id)}
                className="group w-28 shrink-0"
              >
                <div className="relative overflow-hidden rounded-xl transition group-hover:brightness-110">
                  <Img
                    path={null}
                    src={tImg(x.m.images?.poster)}
                    kind="poster"
                    sizes="112px"
                    alt=""
                    className="aspect-[2/3]"
                  />
                  <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium backdrop-blur-sm">
                    <Star
                      className="size-3 fill-current text-star"
                      strokeWidth={0}
                    />{" "}
                    {r.rating}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-xs text-white/85 group-hover:text-white">
                  {x.m.title}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------- Friends ----------

export function FriendsTab() {
  const user = useTraktUser();
  const qc = useQueryClient();
  const following = useQuery({
    queryKey: ["trakt", "following", user?.username],
    queryFn: fetchFollowing,
    enabled: !!user,
    staleTime: 2 * 60_000,
  });
  const activity = useQuery({
    queryKey: ["trakt", "friends-activity", user?.username],
    queryFn: () =>
      fetchFriendsActivity((following.data ?? []).map((f) => f.user)),
    enabled: !!following.data?.length,
    staleTime: 2 * 60_000,
  });
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const results = useQuery({
    queryKey: ["trakt", "user-search", submitted],
    queryFn: () => searchUsers(submitted),
    enabled: !!user && submitted.length > 1,
    staleTime: 60_000,
  });
  const followed = new Set((following.data ?? []).map((f) => f.user.ids.slug));
  const toggle = useMutation({
    mutationFn: ({ u, on }: { u: TUser; on: boolean }) =>
      follow(u.ids.slug, on),
    onSuccess: (_d, { u, on }) => {
      toast(
        on
          ? u.private
            ? `Follow request sent to ${u.username}`
            : `Following ${u.name || u.username}`
          : `Unfollowed ${u.name || u.username}`,
      );
      qc.invalidateQueries({ queryKey: ["trakt", "following"] });
      qc.invalidateQueries({ queryKey: ["trakt", "friends-activity"] });
      qc.invalidateQueries({ queryKey: ["trakt", "my-stats"] });
    },
    onError: (e) => toast((e as Error).message),
  });

  if (!user)
    return (
      <ConnectCard
        title="Friends"
        body="Connect Trakt to follow friends and see what they're watching, rating and talking about."
      />
    );

  const a = activity.data;
  return (
    <div className="space-y-6">
      <div className={PANEL}>
        <SectionHeader title="Find people" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(query.trim());
          }}
          className="flex gap-2"
        >
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-raised px-3.5">
            <Search className="size-4 shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Trakt username or name"
              aria-label="Search Trakt users"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint sm:text-sm"
            />
          </div>
          <button className={btn({ variant: "primary" })}>Search</button>
        </form>
        {submitted && (
          <div className="mt-3 space-y-1">
            {results.isPending && <div className="skeleton h-14 rounded-xl" />}
            {results.data?.length === 0 && (
              <p className="text-sm text-muted">
                No one found for “{submitted}”.
              </p>
            )}
            {results.data?.map(({ user: u }) => (
              <PersonRow
                key={u.ids.slug}
                u={u}
                following={followed.has(u.ids.slug)}
                me={u.username === user.username}
                onToggle={(on) => toggle.mutate({ u, on })}
              />
            ))}
          </div>
        )}
      </div>

      <div className={PANEL}>
        <SectionHeader
          title={`Following${following.data ? ` · ${following.data.length}` : ""}`}
        />
        {following.isPending ? (
          <div className="skeleton h-14 rounded-xl" />
        ) : !following.data?.length ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Users className="size-7 text-faint" />
            <p className="text-sm text-muted">
              Find your friends above and follow them to see what they watch.
            </p>
          </div>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2">
            {following.data.map(({ user: u }) => {
              const now = a?.watchingNow.find(
                (w) => w.user.ids.slug === u.ids.slug,
              )?.now;
              const what = now && (now.movie ?? now.show);
              return (
                <PersonRow
                  key={u.ids.slug}
                  u={u}
                  following
                  status={
                    what
                      ? `Watching ${what.title}${now.episode ? ` · ${epLabel(now.episode.season, now.episode.number)}` : ""}`
                      : undefined
                  }
                  onToggle={(on) => toggle.mutate({ u, on })}
                />
              );
            })}
          </div>
        )}
      </div>

      {!!following.data?.length && (
        <div className={PANEL}>
          <SectionHeader title="What friends watched" />
          {activity.isPending ? (
            <div className="skeleton h-40 rounded-2xl" />
          ) : !a?.feed.length && !a?.watchingNow.length ? (
            <p className="text-sm text-muted">
              Nothing yet. Their plays show up here (private profiles stay
              private).
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(248px,1fr))]">
              {a!.watchingNow.map(({ user: u, now }) => {
                const x = mediaOf(now);
                return (
                  x && (
                    <FriendCard
                      key={`now-${u.username}`}
                      user={u}
                      media={x.m}
                      episode={now.episode}
                      type={x.type}
                      when={Date.now()}
                      live
                      className="w-auto"
                    />
                  )
                );
              })}
              {a!.feed.map(({ user: u, row, at }) => {
                const x = mediaOf(row);
                return (
                  x && (
                    <FriendCard
                      key={row.id}
                      user={u}
                      media={x.m}
                      episode={row.episode}
                      type={x.type}
                      when={at}
                      className="w-auto"
                    />
                  )
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PersonRow({
  u,
  following,
  me,
  status,
  onToggle,
}: {
  u: TUser;
  following: boolean;
  me?: boolean;
  status?: string;
  onToggle: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/[0.04]">
      <Avatar user={u} className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{u.name || u.username}</p>
        <p
          className={cx(
            "truncate text-xs",
            status ? "text-success" : "text-muted",
          )}
        >
          {status ?? (
            <a
              href={`https://trakt.tv/users/${u.ids.slug}`}
              target="_blank"
              rel="noreferrer"
              className="group/tip relative transition-colors hover:text-white"
            >
              @{u.username}
              {u.private ? " · private" : ""}
              <Tip label="Open on trakt.tv" side="bottom" align="start" />
            </a>
          )}
        </p>
      </div>
      {!me && (
        <button
          type="button"
          onClick={() => onToggle(!following)}
          className={cx(
            btn({ variant: following ? "secondary" : "primary" }),
            "h-9 px-4 text-sm",
          )}
        >
          {following ? "Following" : "Follow"}
        </button>
      )}
    </div>
  );
}
