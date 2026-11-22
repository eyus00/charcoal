import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, EyeOff, Heart, MessageCircle, PenLine, Star, Trash2 } from 'lucide-react';
import { Dialog } from './Modal';
import { SectionHeader } from './Row';
import { btn } from './Button';
import { toast } from './Toast';
import {
  deleteComment,
  likeComment,
  myRatingsQ,
  postComment,
  postReply,
  rateTitle,
  startTraktLogin,
  traktQ,
  useTraktUser,
  type CommentSort,
  type TraktComment,
  type TraktTitle,
  type TraktUser,
} from '../lib/trakt';
import { q, type MediaType, type TmdbReview } from '../lib/tmdb';
import { cx, useInView } from '../lib/util';
import { fetchMyComments } from '../lib/traktData';

/**
 * What people think: the Trakt community's rating and comments for this title (shared with
 * every app that uses Trakt), with TMDB's reviews when Trakt has none. Loads when scrolled near.
 */
export default function Community({ type, id }: { type: MediaType; id: number }) {
  const [ref, inView] = useInView<HTMLElement>('600px');
  const title = useQuery({ ...traktQ.title(type, id), enabled: inView });
  const t = title.data;
  const ratings = useQuery(traktQ.ratings(t));
  const [sort, setSort] = useState<CommentSort>('likes');
  const comments = useInfiniteQuery({
    queryKey: ['trakt', 'comments', t?.kind, t?.slug, sort],
    enabled: !!t,
    staleTime: 10 * 60_000,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => traktQ.comments(t, sort, pageParam).queryFn({ signal }),
    getNextPageParam: (last, all) => (all.length < last.pages ? all.length + 1 : undefined),
  });
  const list = useMemo(() => comments.data?.pages.flatMap((p) => p.data) ?? [], [comments.data]);
  const total = comments.data?.pages[0]?.total ?? 0;
  const noTrakt = title.isSuccess && (!t || (comments.isSuccess && !list.length));
  const tmdb = useQuery({ ...q.reviews(type, id), enabled: inView && noTrakt });

  const user = useTraktUser();
  const qc = useQueryClient();
  const hasAnything = !!t || !!tmdb.data?.results.length;
  const loading = inView && (title.isPending || (!!t && comments.isPending));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['trakt', 'comments', t?.kind, t?.slug] });
    qc.invalidateQueries({ queryKey: ['trakt', 'my-comments'] });
  };

  // Your own comments on this title come first (Trakt's "Top" order can bury them), labelled "You".
  const myComments = useQuery({
    queryKey: ['trakt', 'my-comments', user?.username],
    queryFn: fetchMyComments,
    enabled: !!user && !!t,
    staleTime: 2 * 60_000,
  });
  const [justPosted, setJustPosted] = useState<TraktComment[]>([]);
  const mine = useMemo(() => {
    if (!t || !user) return [];
    const fromTrakt = (myComments.data ?? [])
      .filter((m) => (t.kind === 'movies' ? m.type === 'movie' : m.type === 'show') && (m.movie ?? m.show)?.ids.trakt === t.traktId && !m.comment.parent_id)
      .map((m) => ({
        ...m.comment,
        user: m.comment.user ?? {
          username: user.username,
          name: user.name,
          images: { avatar: { full: user.avatar } },
        },
      }));
    const ids = new Set(fromTrakt.map((c) => c.id));
    return [...justPosted.filter((c) => !ids.has(c.id)), ...fromTrakt];
  }, [myComments.data, justPosted, t, user]);
  const mineIds = new Set(mine.map((c) => c.id));
  const others = list.filter((c) => !mineIds.has(c.id));

  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState({ text: '', spoiler: false });
  const write = () => (user ? setWriting(true) : startTraktLogin());
  const shown = [...mine, ...others];

  return (
    <section ref={ref} className="mt-10">
      {(loading || hasAnything) && <SectionHeader title="What people think" />}
      {loading && <CommunitySkeleton />}
      {!loading && hasAnything && (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
          {t ? <RatingSummary r={ratings.data} t={t} user={user} /> : <div className="hidden lg:block" />}
          <div className="min-w-0">
            {/* One fixed-height toolbar: sort, count, and the button that opens the composer. */}
            <div className="mb-3 flex h-9 items-center gap-2">
              {shown.length > 0 &&
                (
                  [
                    ['likes', 'Top'],
                    ['newest', 'Newest'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={sort === v}
                    onClick={() => setSort(v)}
                    className={cx('h-8 rounded-full px-3.5 text-sm transition-colors', sort === v ? 'bg-white font-medium text-black' : 'bg-white/[0.06] text-white/80 hover:bg-white/10')}
                  >
                    {label}
                  </button>
                ))}
              {shown.length > 0 && <span className="ml-1 hidden text-xs text-faint sm:inline">{total.toLocaleString()} comments</span>}
              {t && (
                <button type="button" onClick={write} className={cx(btn(), 'ml-auto h-9 px-4 text-sm')}>
                  <PenLine className="size-4" /> {user ? 'Write a comment' : 'Connect Trakt to comment'}
                </button>
              )}
            </div>
            {shown.length > 0 ? (
              <Scrollbox
                more={
                  comments.hasNextPage ? (
                    <button type="button" onClick={() => comments.fetchNextPage()} disabled={comments.isFetchingNextPage} className={cx(btn(), 'h-9 px-5 text-sm disabled:opacity-60')}>
                      {comments.isFetchingNextPage ? 'Loading…' : 'Show more'}
                    </button>
                  ) : null
                }
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {mine.map((c) => (
                    <CommentCard
                      key={c.id}
                      c={c}
                      me={user}
                      pinned
                      onDeleted={() => {
                        setJustPosted((p) => p.filter((x) => x.id !== c.id));
                        refresh();
                      }}
                    />
                  ))}
                  {others.map((c) => (
                    <CommentCard key={c.id} c={c} me={user} onDeleted={refresh} />
                  ))}
                </div>
              </Scrollbox>
            ) : tmdb.data && tmdb.data.results.length > 0 ? (
              <Scrollbox>
                <div className="grid gap-3 md:grid-cols-2">
                  {tmdb.data.results.map((r) => (
                    <TmdbReviewCard key={r.id} r={r} />
                  ))}
                </div>
              </Scrollbox>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/[0.04] p-6 text-center ring-1 ring-white/[0.06]">
                <MessageCircle className="mb-1 size-6 text-faint" />
                <p className="text-sm font-medium">No comments yet</p>
                <p className="text-sm text-muted">Be the first to share what you think.</p>
              </div>
            )}
          </div>
        </div>
      )}
      {writing && t && user && (
        <Composer
          t={t}
          user={user}
          draft={draft}
          setDraft={setDraft}
          onClose={() => setWriting(false)}
          onPosted={(c) => {
            setWriting(false);
            setDraft({ text: '', spoiler: false });
            if (c) setJustPosted((p) => [c, ...p]);
            refresh();
          }}
        />
      )}
    </section>
  );
}

/** A fixed-height scrolling area with a soft fade at the bottom, and "Show more" at its end. */
function Scrollbox({ children, more }: { children: React.ReactNode; more?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);
  useEffect(() => {
    if (!box.current || !end.current) return;
    const io = new IntersectionObserver(([e]) => setAtEnd(e.isIntersecting), { root: box.current });
    io.observe(end.current);
    return () => io.disconnect();
  }, []);
  return (
    <div className="relative">
      <div ref={box} className="no-scrollbar max-h-[34rem] overflow-y-auto overscroll-contain rounded-2xl md:max-h-[30rem]">
        {children}
        {more && <div className="flex justify-center pt-4 pb-1">{more}</div>}
        <div ref={end} className="h-px" />
      </div>
      <div aria-hidden className={cx('pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent transition-opacity', atEnd && 'opacity-0')} />
    </div>
  );
}

const compact = (n: number) =>
  new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);

function RatingSummary({ r, t, user }: { r?: { rating: number; votes: number; distribution: Record<string, number> }; t: TraktTitle; user: TraktUser | null }) {
  const max = Math.max(1, ...Object.values(r?.distribution ?? {}));
  return (
    <div className="self-start rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/[0.06]">
      <div className="flex items-baseline gap-2">
        <Star className="size-5 self-center fill-current text-star" strokeWidth={0} />
        <span className="text-4xl font-semibold tracking-tight tabular-nums">{r?.votes ? r.rating.toFixed(1) : '–'}</span>
        <span className="text-sm text-muted">/ 10</span>
      </div>
      <p className="mt-1 text-xs text-muted">{r?.votes ? `${compact(r.votes)} ratings on Trakt` : 'No ratings on Trakt yet'}</p>
      {/* Votes per score, 1 → 10. */}
      {!!r?.votes && (
        <>
          <div className="mt-4 flex h-10 items-end gap-1 lg:h-14" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-white/70"
                style={{
                  height: `${Math.max(4, ((r.distribution[String(i + 1)] ?? 0) / max) * 100)}%`,
                  opacity: 0.35 + (i / 9) * 0.65,
                }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-micro text-faint tabular-nums">
            <span>1</span>
            <span>10</span>
          </div>
        </>
      )}
      {user && <YourRating t={t} />}
    </div>
  );
}

const SCORE_WORDS = ['', 'Awful', 'Terrible', 'Bad', 'Poor', 'Meh', 'Fair', 'Good', 'Great', 'Superb', 'Masterpiece'];

/** Your own 1–10 rating, saved to Trakt. Picking the same score again removes it. */
function YourRating({ t }: { t: TraktTitle }) {
  const qc = useQueryClient();
  const mine = useQuery(myRatingsQ(t.kind, true));
  const saved = mine.data?.get(t.traktId) ?? 0;
  const [hover, setHover] = useState(0);
  const [pending, setPending] = useState<number | null>(null);
  // Bumped on each save so the stars replay their "pop".
  const [popKey, setPopKey] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const shown = hover || (pending ?? saved);
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(id);
  }, [flash]);
  const pick = async (n: number) => {
    const next = n === saved ? null : n;
    setPending(next ?? 0);
    setHover(0);
    try {
      await rateTitle(t, next);
      qc.setQueryData(myRatingsQ(t.kind, true).queryKey, (m: Map<number, number> | undefined) => {
        const copy = new Map(m);
        if (next) copy.set(t.traktId, next);
        else copy.delete(t.traktId);
        return copy;
      });
      qc.invalidateQueries({ queryKey: ['trakt', 'ratings', t.kind, t.slug] });
      if (next) setPopKey((k) => k + 1);
      setFlash(next ? 'Saved' : 'Removed');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setPending(null);
    }
  };
  const label = flash ? null : shown ? `${shown}/10 · ${SCORE_WORDS[shown]}` : 'Tap a star';
  return (
    <div className="mt-4 border-t border-white/[0.06] pt-3.5">
      <p className="flex h-4 items-center justify-between text-xs text-muted">
        Your rating
        {flash ? (
          <span key={flash + popKey} className="toast-in flex items-center gap-1 font-medium text-success">
            <Check className="size-3.5" strokeWidth={2.5} /> {flash}
          </span>
        ) : (
          <span className={cx('tabular-nums', shown ? 'text-white/85' : 'text-faint')}>{label}</span>
        )}
      </p>
      <div className={cx('mt-2 flex transition-opacity', pending !== null && 'opacity-60')} role="radiogroup" aria-label="Your rating" onPointerLeave={() => setHover(0)}>
        {Array.from({ length: 10 }, (_, i) => {
          const on = i < shown;
          return (
            <button
              key={`${i}-${popKey}`}
              type="button"
              role="radio"
              aria-checked={saved === i + 1}
              aria-label={`${i + 1} out of 10, ${SCORE_WORDS[i + 1]}`}
              disabled={pending !== null}
              onPointerEnter={() => setHover(i + 1)}
              onClick={() => pick(i + 1)}
              className="grid h-8 flex-1 place-items-center rounded-md transition-colors hover:bg-white/[0.06]"
            >
              <Star
                className={cx(
                  'size-[18px] transition-[color,transform] duration-150',
                  on ? 'fill-current text-star' : 'text-white/25',
                  hover === i + 1 && 'scale-125',
                  popKey > 0 && on && i < saved && 'pop',
                )}
                style={popKey > 0 ? { animationDelay: `${i * 30}ms` } : undefined}
                strokeWidth={on ? 0 : 1.5}
              />
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 h-4 text-micro text-faint">{saved && !hover ? 'Tap your score again to remove it' : ''}</p>
    </div>
  );
}

/** A small on/off switch with its label (like the settings toggles). */
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2.5 rounded-full py-1 pr-2 text-sm text-white/80 transition-colors hover:text-white"
    >
      <span className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-white/15')}>
        <span className={cx('absolute top-0.5 left-0.5 size-4 rounded-full transition-transform', on ? 'translate-x-4 bg-black' : 'bg-white')} />
      </span>
      {label}
    </button>
  );
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Write a comment (posted to Trakt, so everyone there sees it), in a dialog. The draft survives closing. */
function Composer({
  t,
  user,
  draft,
  setDraft,
  onClose,
  onPosted,
}: {
  t: TraktTitle;
  user: TraktUser;
  draft: { text: string; spoiler: boolean };
  setDraft: (d: { text: string; spoiler: boolean }) => void;
  onClose: () => void;
  onPosted: (c: TraktComment | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const words = wordCount(draft.text);
  const ok = words >= 5;
  const send = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const posted = await postComment(t, draft.text.trim(), draft.spoiler);
      toast(words >= 200 ? 'Review posted to Trakt' : 'Comment posted to Trakt');
      onPosted(posted?.id ? { ...posted, user: posted.user ?? { username: user.username, name: user.name, images: { avatar: { full: user.avatar } } } } : null);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Write a comment"
      subtitle="Posted to Trakt, where everyone can read it"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          <Switch on={draft.spoiler} onChange={(spoiler) => setDraft({ ...draft, spoiler })} label="Contains spoilers" />
          <button type="button" onClick={send} disabled={!ok || busy} className={cx(btn({ variant: 'primary' }), 'ml-auto h-10 px-5 text-sm disabled:opacity-40')}>
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      }
    >
      <div className="flex gap-3">
        <Avatar src={user.avatar} name={user.name || user.username} />
        <textarea
          autoFocus
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && send()}
          rows={7}
          placeholder="What did you think? (5 words or more)"
          aria-label="Your comment"
          className="min-w-0 flex-1 resize-none rounded-2xl bg-white/[0.04] px-4 py-3 text-base leading-6 ring-1 ring-white/[0.06] outline-none placeholder:text-faint focus:ring-white/20 sm:text-sm"
        />
      </div>
    </Dialog>
  );
}

/** Trakt marks spoilers inline as [spoiler]…[/spoiler]: blur those parts until tapped. */
function Body({ text, spoiler, clamp, small }: { text: string; spoiler: boolean; clamp: boolean; small?: boolean }) {
  const [shown, setShown] = useState(false);
  const parts = text.split(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi);
  const content = parts.map((p, i) =>
    i % 2 ? (
      <button key={i} type="button" onClick={() => setShown(true)} className={cx('rounded transition', !shown && 'bg-white/10 text-transparent blur-[5px] select-none')}>
        {p}
      </button>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
  const gated = spoiler && !shown;
  return (
    <div className={cx('relative', small ? 'mt-0.5' : 'mt-2.5', gated && 'min-h-20')}>
      <p
        aria-hidden={gated}
        className={cx('break-words whitespace-pre-line text-white/85', small ? 'text-caption leading-5' : 'text-body-sm leading-6', clamp && 'line-clamp-5', gated && 'blur-[7px] select-none')}
      >
        {content}
      </p>
      {gated && (
        <div className="absolute inset-0 flex items-center justify-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white/85 backdrop-blur-sm">
            <EyeOff className="size-3.5" /> Contains spoilers
          </span>
          <button type="button" onClick={() => setShown(true)} className="h-7 rounded-full bg-white px-3 text-xs font-medium text-black transition-colors hover:bg-white/85">
            Show
          </button>
        </div>
      )}
    </div>
  );
}

function Avatar({ src, name, small }: { src?: string | null; name: string; small?: boolean }) {
  const size = small ? 'size-7 text-xs' : 'size-9 text-sm';
  return src ? (
    <img src={src} alt="" loading="lazy" className={cx('shrink-0 rounded-full bg-white/10 object-cover', size)} />
  ) : (
    <span className={cx('grid shrink-0 place-items-center rounded-full bg-white/10 font-medium uppercase', size)}>{name.slice(0, 1)}</span>
  );
}

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

function CommentCard({ c, me, pinned, onDeleted }: { c: TraktComment; me: TraktUser | null; pinned?: boolean; onDeleted: () => void }) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(c.likes);
  const [confirm, setConfirm] = useState(false);
  // The full comment and its replies open in a dialog, so the list never changes size.
  const [thread, setThread] = useState(false);
  const [replies, setReplies] = useState(c.replies);
  const mine = !!me && me.username === c.user.username;
  const like = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      await likeComment(c.id, next);
    } catch (e) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      toast((e as Error).message);
    }
  };
  const remove = async () => {
    if (!confirm) return setConfirm(true);
    try {
      await deleteComment(c.id);
      toast('Comment deleted');
      onDeleted();
    } catch (e) {
      toast((e as Error).message);
      setConfirm(false);
    }
  };
  const long = c.comment.length > 320;
  return (
    <article className={cx('flex flex-col rounded-2xl p-4 ring-1', pinned ? 'bg-white/[0.06] ring-white/[0.12]' : 'bg-white/[0.04] ring-white/[0.06]')}>
      <CommentHead c={c} pinned={pinned} />
      <Body text={c.comment} spoiler={c.spoiler} clamp />
      <footer className="mt-auto flex items-center gap-4 pt-3 text-xs text-faint">
        {me && !mine ? (
          <button
            type="button"
            onClick={like}
            aria-pressed={liked}
            aria-label={liked ? 'Unlike' : 'Like'}
            className={cx('flex items-center gap-1 tabular-nums transition-colors hover:text-white', liked && 'text-white')}
          >
            <Heart className={cx('size-3.5', liked && 'fill-current')} /> {likes}
          </button>
        ) : (
          <span className="flex items-center gap-1 tabular-nums">
            <Heart className="size-3.5" /> {likes}
          </span>
        )}
        <button type="button" onClick={() => setThread(true)} aria-label={`${replies} replies`} className="flex items-center gap-1 tabular-nums transition-colors hover:text-white">
          <MessageCircle className="size-3.5" /> {replies}
        </button>
        {mine && (
          <button type="button" onClick={remove} onBlur={() => setConfirm(false)} className={cx('flex w-16 items-center gap-1 transition-colors', confirm ? 'text-danger' : 'hover:text-white')}>
            <Trash2 className="size-3.5" /> {confirm ? 'Delete?' : 'Delete'}
          </button>
        )}
        {long && (
          <button type="button" onClick={() => setThread(true)} className="ml-auto font-medium text-white/70 transition-colors hover:text-white">
            Read more
          </button>
        )}
      </footer>
      {thread && <Thread c={c} me={me} pinned={pinned} onClose={() => setThread(false)} onReplied={() => setReplies((n) => n + 1)} />}
    </article>
  );
}

function CommentHead({ c, pinned }: { c: TraktComment; pinned?: boolean }) {
  const name = c.user.name || c.user.username;
  return (
    <header className="flex items-center gap-3">
      <Avatar src={c.user.images?.avatar?.full} name={name} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          {name}
          {pinned && <span className="rounded-full bg-white px-1.5 py-px text-micro font-medium text-black">You</span>}
        </p>
        <p className="text-xs text-faint">
          {ago(c.created_at)}
          {c.review && <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-px text-micro text-white/80">Review</span>}
        </p>
      </div>
      {c.user_rating ? (
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium">
          <Star className="size-3.5 fill-current text-star" strokeWidth={0} />
          {c.user_rating}
        </span>
      ) : null}
    </header>
  );
}

/** A comment in full with its replies, in a dialog; signed in, you can answer from the bottom. */
function Thread({ c, me, pinned, onClose, onReplied }: { c: TraktComment; me: TraktUser | null; pinned?: boolean; onClose: () => void; onReplied: () => void }) {
  const qc = useQueryClient();
  const { data, isPending, isError } = useQuery(traktQ.replies(c.id));
  const [text, setText] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<TraktComment[]>([]);
  const list = [...(data ?? []), ...posted.filter((p) => !data?.some((d) => d.id === p.id))];
  const ok = wordCount(text) >= 5;
  const send = async () => {
    if (!ok || busy || !me) return;
    setBusy(true);
    try {
      const r = await postReply(c.id, text.trim(), spoiler);
      if (r?.id) setPosted((p) => [...p, { ...r, user: r.user ?? { username: me.username, name: me.name, images: { avatar: { full: me.avatar } } } }]);
      setText('');
      setSpoiler(false);
      onReplied();
      qc.invalidateQueries({ queryKey: ['trakt', 'replies', c.id] });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const name = c.user.name || c.user.username;
  return (
    <Dialog
      title={`${name}’s comment`}
      onClose={onClose}
      wide
      footer={
        me ? (
          <div className="space-y-2.5">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && send()}
              rows={2}
              placeholder="Write a reply (5 words or more)"
              aria-label="Your reply"
              className="block w-full resize-none rounded-2xl bg-white/[0.04] px-4 py-2.5 text-base leading-6 ring-1 ring-white/[0.06] outline-none placeholder:text-faint focus:ring-white/20 sm:text-sm"
            />
            <div className="flex items-center gap-3">
              <Switch on={spoiler} onChange={setSpoiler} label="Contains spoilers" />
              <button type="button" onClick={send} disabled={!ok || busy} className={cx(btn({ variant: 'primary' }), 'ml-auto h-9 px-5 text-sm disabled:opacity-40')}>
                {busy ? 'Replying…' : 'Reply'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-muted">Connect Trakt to reply.</p>
            <button type="button" onClick={() => startTraktLogin()} className={cx(btn(), 'h-9 px-4 text-sm')}>
              Connect Trakt
            </button>
          </div>
        )
      }
    >
      <div className={cx('rounded-2xl p-4 ring-1', pinned ? 'bg-white/[0.06] ring-white/[0.12]' : 'bg-white/[0.04] ring-white/[0.06]')}>
        <CommentHead c={c} pinned={pinned} />
        <Body text={c.comment} spoiler={c.spoiler} clamp={false} />
      </div>
      <h3 className="mt-5 mb-3 text-sm font-medium text-muted">{isPending ? 'Replies' : `${list.length} ${list.length === 1 ? 'reply' : 'replies'}`}</h3>
      <div className="space-y-4">
        {isPending &&
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex gap-2.5">
              <div className="skeleton size-7 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3 w-32 rounded" />
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-2/3 rounded" />
              </div>
            </div>
          ))}
        {isError && <p className="text-sm text-faint">Couldn’t load the replies.</p>}
        {!isPending && !isError && !list.length && <p className="text-sm text-faint">No replies yet.</p>}
        {list.map((r) => {
          const rn = r.user.name || r.user.username;
          return (
            <div key={r.id} className="flex gap-2.5">
              <Avatar src={r.user.images?.avatar?.full} name={rn} small />
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-medium text-white/90">{rn}</span> <span className="text-faint">· {ago(r.created_at)}</span>
                </p>
                <Body text={r.comment} spoiler={r.spoiler} clamp={false} small />
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

function TmdbReviewCard({ r }: { r: TmdbReview }) {
  const [open, setOpen] = useState(false);
  const avatarSrc = r.author_details.avatar_path ? `https://image.tmdb.org/t/p/w92${r.author_details.avatar_path}` : null;
  const avatar = r.author_details.avatar_path ? `https://image.tmdb.org/t/p/w92${r.author_details.avatar_path}` : null;
  return (
    <article className="flex flex-col rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]">
      <header className="flex items-center gap-3">
        <Avatar src={avatar} name={r.author} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{r.author}</p>
          <p className="text-xs text-faint">{ago(r.created_at)} · on TMDB</p>
        </div>
        {r.author_details.rating ? (
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium">
            <Star className="size-3.5 fill-current text-star" strokeWidth={0} />
            {r.author_details.rating}
          </span>
        ) : null}
      </header>
      <Body text={r.content} spoiler={false} clamp />
      {r.content.length > 320 && (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 self-end text-xs font-medium text-white/70 transition-colors hover:text-white">
          Read more
        </button>
      )}
      {open && (
        <Dialog title={`${r.author}’s review`} subtitle="On TMDB" onClose={() => setOpen(false)} wide>
          <div className="flex items-center gap-3">
            <Avatar src={avatarSrc} name={r.author} />
            <p className="text-xs text-faint">{ago(r.created_at)}</p>
          </div>
          <Body text={r.content} spoiler={false} clamp={false} />
        </Dialog>
      )}
    </article>
  );
}

function CommunitySkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
      <div className="skeleton h-44 rounded-3xl" />
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
