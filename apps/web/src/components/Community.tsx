import { useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Heart, MessageCircle, Star, Trash2 } from 'lucide-react';
import { SectionHeader } from './Row';
import { btn } from './Button';
import { toast } from './Toast';
import { letterboxdUrl } from '../lib/letterboxd';
import {
  deleteComment,
  likeComment,
  myRatingsQ,
  postComment,
  rateTitle,
  startTraktLogin,
  traktQ,
  traktUrl,
  useTraktUser,
  type CommentSort,
  type TraktComment,
  type TraktTitle,
  type TraktUser,
} from '../lib/trakt';
import { q, type MediaType, type TmdbReview } from '../lib/tmdb';
import { cx, useInView } from '../lib/util';

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
  const refresh = () => qc.invalidateQueries({ queryKey: ['trakt', 'comments', t?.kind, t?.slug] });

  return (
    <section ref={ref} className="mt-10">
      {(loading || hasAnything) && (
        <SectionHeader
          title="What people think"
          action={
            <div className="flex items-center gap-4">
              {type === 'movie' && (
                <a href={letterboxdUrl(id)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-white">
                  Letterboxd <ArrowUpRight className="size-3.5" />
                </a>
              )}
              {t && (
                <a href={traktUrl(t, 'comments')} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-white">
                  Trakt <ArrowUpRight className="size-3.5" />
                </a>
              )}
            </div>
          }
        />
      )}
      {loading && <CommunitySkeleton />}
      {!loading && hasAnything && (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
          {t ? <RatingSummary r={ratings.data} t={t} user={user} /> : <div className="hidden lg:block" />}
          <div className="min-w-0">
            {t && (
              <Composer
                t={t}
                user={user}
                onPosted={() => {
                  setSort('newest');
                  refresh();
                }}
              />
            )}
            {list.length > 0 && (
              <>
                <div className="mb-3 flex items-center gap-2">
                  {(
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
                  <span className="ml-auto text-xs text-faint">{total.toLocaleString()} comments</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {list.map((c) => (
                    <CommentCard key={c.id} c={c} me={user} onDeleted={refresh} />
                  ))}
                </div>
                {comments.hasNextPage && (
                  <button
                    type="button"
                    onClick={() => comments.fetchNextPage()}
                    disabled={comments.isFetchingNextPage}
                    className="mt-4 h-10 w-full rounded-full bg-white/[0.06] text-sm text-white/85 transition-colors hover:bg-white/10 disabled:opacity-50"
                  >
                    {comments.isFetchingNextPage ? 'Loading…' : 'Show more'}
                  </button>
                )}
              </>
            )}
            {!list.length && tmdb.data && tmdb.data.results.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {tmdb.data.results.slice(0, 6).map((r) => (
                  <TmdbReviewCard key={r.id} r={r} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

function RatingSummary({ r, t, user }: { r?: { rating: number; votes: number; distribution: Record<string, number> }; t: TraktTitle; user: TraktUser | null }) {
  const max = Math.max(1, ...Object.values(r?.distribution ?? {}));
  return (
    <div className="self-start rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/[0.06]">
      <a href={traktUrl(t)} target="_blank" rel="noreferrer" className="block transition-opacity hover:opacity-85">
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
                <div key={i} className="flex-1 rounded-sm bg-white/70" style={{ height: `${Math.max(4, ((r.distribution[String(i + 1)] ?? 0) / max) * 100)}%`, opacity: 0.35 + (i / 9) * 0.65 }} />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-micro text-faint tabular-nums">
              <span>1</span>
              <span>10</span>
            </div>
          </>
        )}
      </a>
      {user && <YourRating t={t} />}
    </div>
  );
}

/** Your own 1–10 rating, saved to Trakt. Picking the same score again removes it. */
function YourRating({ t }: { t: TraktTitle }) {
  const qc = useQueryClient();
  const mine = useQuery(myRatingsQ(t.kind, true));
  const saved = mine.data?.get(t.traktId) ?? 0;
  const [hover, setHover] = useState(0);
  const [pending, setPending] = useState<number | null>(null);
  const shown = hover || (pending ?? saved);
  const pick = async (n: number) => {
    const next = n === saved ? null : n;
    setPending(next ?? 0);
    try {
      await rateTitle(t, next);
      qc.setQueryData(myRatingsQ(t.kind, true).queryKey, (m: Map<number, number> | undefined) => {
        const copy = new Map(m);
        if (next) copy.set(t.traktId, next);
        else copy.delete(t.traktId);
        return copy;
      });
      qc.invalidateQueries({ queryKey: ['trakt', 'ratings', t.kind, t.slug] });
      toast(next ? `Rated ${next}/10 on Trakt` : 'Rating removed');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setPending(null);
    }
  };
  return (
    <div className="mt-4 border-t border-white/[0.06] pt-3.5">
      <p className="flex justify-between text-xs text-muted">
        Your rating <span className="text-white/85 tabular-nums">{shown ? `${shown}/10` : ''}</span>
      </p>
      <div className="mt-2 flex" role="radiogroup" aria-label="Your rating" onPointerLeave={() => setHover(0)}>
        {Array.from({ length: 10 }, (_, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={saved === i + 1}
            aria-label={`${i + 1} out of 10`}
            disabled={pending !== null}
            onPointerEnter={() => setHover(i + 1)}
            onClick={() => pick(i + 1)}
            className="grid h-7 flex-1 place-items-center"
          >
            <Star className={cx('size-[18px] transition-colors', i < shown ? 'fill-current text-star' : 'text-white/25')} strokeWidth={i < shown ? 0 : 1.5} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Write a comment (posted to Trakt, so everyone there sees it). */
function Composer({ t, user, onPosted }: { t: TraktTitle; user: TraktUser | null; onPosted: () => void }) {
  const [text, setText] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  if (!user)
    return (
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3 pl-4 ring-1 ring-white/[0.06]">
        <p className="min-w-0 flex-1 text-sm text-muted">Rate it and share what you think, on Trakt.</p>
        <button type="button" onClick={() => startTraktLogin()} className={cx(btn(), 'h-9 shrink-0 px-4 text-sm')}>
          Connect Trakt
        </button>
      </div>
    );
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const ok = words >= 5;
  const send = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await postComment(t, text.trim(), spoiler);
      setText('');
      setSpoiler(false);
      setOpen(false);
      toast(words >= 200 ? 'Review posted to Trakt' : 'Comment posted to Trakt');
      onPosted();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-4 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06]">
      <div className="flex gap-3">
        <Avatar src={user.avatar} name={user.name || user.username} />
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && send()}
          rows={open ? 4 : 1}
          placeholder="Share what you think…"
          aria-label="Your comment"
          className="min-h-9 min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none placeholder:text-faint sm:text-sm"
        />
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-12">
          <button
            type="button"
            aria-pressed={spoiler}
            onClick={() => setSpoiler((v) => !v)}
            className={cx('h-8 rounded-full px-3 text-xs transition-colors', spoiler ? 'bg-white font-medium text-black' : 'bg-white/[0.06] text-white/80 hover:bg-white/10')}
          >
            Contains spoilers
          </button>
          <span className="text-xs text-faint">{ok ? (words >= 200 ? 'Posts as a review' : `${words} words`) : `At least 5 words (${words})`}</span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setText('');
                box.current?.blur();
              }}
              className={cx(btn(), 'h-9 px-4 text-sm')}
            >
              Cancel
            </button>
            <button type="button" onClick={send} disabled={!ok || busy} className={cx(btn({ variant: 'primary' }), 'h-9 px-4 text-sm disabled:opacity-40')}>
              {busy ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Trakt marks spoilers inline as [spoiler]…[/spoiler]: blur those parts until tapped. */
function Body({ text, spoiler, clamp }: { text: string; spoiler: boolean; clamp: boolean }) {
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
  return (
    <div className="relative mt-2.5">
      <p className={cx('text-body-sm leading-6 break-words whitespace-pre-line text-white/85', clamp && 'line-clamp-5', spoiler && !shown && 'blur-[6px] select-none')}>{content}</p>
      {spoiler && !shown && (
        <button type="button" onClick={() => setShown(true)} className="absolute inset-0 grid place-items-center text-sm font-medium text-white">
          <span className="rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">Contains spoilers · Show</span>
        </button>
      )}
    </div>
  );
}

function Avatar({ src, name }: { src?: string | null; name: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className="size-9 shrink-0 rounded-full bg-white/10 object-cover" />
  ) : (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-medium uppercase">{name.slice(0, 1)}</span>
  );
}

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

function CommentCard({ c, me, onDeleted }: { c: TraktComment; me: TraktUser | null; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(c.likes);
  const [confirm, setConfirm] = useState(false);
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
  const name = c.user.name || c.user.username;
  const long = c.comment.length > 320;
  return (
    <article className="flex flex-col rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]">
      <header className="flex items-center gap-3">
        <Avatar src={c.user.images?.avatar?.full} name={name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
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
      <Body text={c.comment} spoiler={c.spoiler} clamp={!open} />
      <footer className="mt-auto flex items-center gap-4 pt-3 text-xs text-faint">
        {me && !mine ? (
          <button type="button" onClick={like} aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'} className={cx('flex items-center gap-1 transition-colors hover:text-white', liked && 'text-white')}>
            <Heart className={cx('size-3.5', liked && 'fill-current')} /> {likes}
          </button>
        ) : (
          <span className="flex items-center gap-1">
            <Heart className="size-3.5" /> {likes}
          </span>
        )}
        <a href={`https://trakt.tv/comments/${c.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 transition-colors hover:text-white">
          <MessageCircle className="size-3.5" /> {c.replies}
        </a>
        {mine && (
          <button
            type="button"
            onClick={remove}
            onBlur={() => setConfirm(false)}
            className={cx('flex items-center gap-1 transition-colors', confirm ? 'text-danger' : 'hover:text-white')}
          >
            <Trash2 className="size-3.5" /> {confirm ? 'Delete?' : 'Delete'}
          </button>
        )}
        {long && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="ml-auto font-medium text-white/70 transition-colors hover:text-white">
            {open ? 'Less' : 'Read more'}
          </button>
        )}
      </footer>
    </article>
  );
}

function TmdbReviewCard({ r }: { r: TmdbReview }) {
  const [open, setOpen] = useState(false);
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
      <Body text={r.content} spoiler={false} clamp={!open} />
      {r.content.length > 320 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-3 self-end text-xs font-medium text-white/70 transition-colors hover:text-white">
          {open ? 'Less' : 'Read more'}
        </button>
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
