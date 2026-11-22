import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Heart, MessageCircle, Star, Trash2 } from 'lucide-react';
import { SectionHeader } from './Row';
import { btn } from './Button';
import { toast } from './Toast';
import { Tip } from './Tip';
import { letterboxdUrl } from '../lib/letterboxd';
import {
  deleteComment,
  likeComment,
  myRatingsQ,
  postComment,
  postReply,
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
                <ExternalLink href={letterboxdUrl(id)} tip="Open on letterboxd.com">
                  Letterboxd
                </ExternalLink>
              )}
              {t && (
                <ExternalLink href={traktUrl(t, 'comments')} tip="Open on trakt.tv" align="end">
                  Trakt
                </ExternalLink>
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
                {/* A couple of rows high; the rest scrolls (and loads more near the end). */}
                <Scrollbox key={sort} onEnd={() => comments.hasNextPage && !comments.isFetchingNextPage && comments.fetchNextPage()}>
                  <div className="grid gap-3 md:grid-cols-2">
                    {list.map((c) => (
                      <CommentCard key={c.id} c={c} me={user} onDeleted={refresh} />
                    ))}
                  </div>
                  {comments.isFetchingNextPage && <p className="py-4 text-center text-xs text-faint">Loading more…</p>}
                </Scrollbox>
              </>
            )}
            {!list.length && tmdb.data && tmdb.data.results.length > 0 && (
              <Scrollbox>
                <div className="grid gap-3 md:grid-cols-2">
                  {tmdb.data.results.map((r) => (
                    <TmdbReviewCard key={r.id} r={r} />
                  ))}
                </div>
              </Scrollbox>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** A link that leaves Charcoal: arrow icon, and a tooltip saying where it goes. */
function ExternalLink({ href, tip, align = 'center', children }: { href: string; tip: string; align?: 'start' | 'center' | 'end'; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="group/tip relative flex items-center gap-1 text-sm text-muted transition-colors hover:text-white">
      {children} <ArrowUpRight className="size-3.5" />
      <Tip label={tip} side="bottom" align={align} />
    </a>
  );
}

/** A fixed-height scrolling area with a soft fade at the bottom; `onEnd` fires near the end. */
function Scrollbox({ children, onEnd }: { children: React.ReactNode; onEnd?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const cb = useRef(onEnd);
  cb.current = onEnd;
  const [atEnd, setAtEnd] = useState(false);
  useEffect(() => {
    if (!box.current || !end.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setAtEnd(e.isIntersecting);
        if (e.isIntersecting) cb.current?.();
      },
      { root: box.current, rootMargin: '0px 0px 300px 0px' },
    );
    io.observe(end.current);
    return () => io.disconnect();
  }, []);
  return (
    <div className="relative">
      <div ref={box} className="no-scrollbar max-h-[34rem] overflow-y-auto overscroll-contain rounded-2xl md:max-h-[30rem]">
        {children}
        <div ref={end} className="h-px" />
      </div>
      <div aria-hidden className={cx('pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent transition-opacity', atEnd && 'opacity-0')} />
    </div>
  );
}

const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

function RatingSummary({ r, t, user }: { r?: { rating: number; votes: number; distribution: Record<string, number> }; t: TraktTitle; user: TraktUser | null }) {
  const max = Math.max(1, ...Object.values(r?.distribution ?? {}));
  return (
    <div className="self-start rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/[0.06]">
      <a href={traktUrl(t)} target="_blank" rel="noreferrer" className="group/tip relative block transition-opacity hover:opacity-85">
        <Tip label="Open on trakt.tv" side="bottom" align="start" />
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

/** A small on/off switch with its label (like the settings toggles). */
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex items-center gap-2 rounded-full py-1 pr-2 text-xs text-white/80 transition-colors hover:text-white">
      <span className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-white/15')}>
        <span className={cx('absolute top-0.5 left-0.5 size-4 rounded-full transition-transform', on ? 'translate-x-4 bg-black' : 'bg-white')} />
      </span>
      {label}
    </button>
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
          placeholder="Share what you think (5 words or more)…"
          aria-label="Your comment"
          className="min-h-9 min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none placeholder:text-faint sm:text-sm"
        />
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
          <Switch on={spoiler} onChange={setSpoiler} label="Spoilers" />
          <div className="ml-auto flex items-center gap-2">
            {/* Right where it matters: next to Post, only while it can't be posted yet (or will post as a review). */}
            {(!ok || words >= 200) && <span className="text-xs text-faint">{ok ? 'Posts as a review' : `${5 - words} more word${5 - words === 1 ? '' : 's'}`}</span>}
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
  return (
    <div className={cx('relative', small ? 'mt-0.5' : 'mt-2.5')}>
      <p className={cx('break-words whitespace-pre-line text-white/85', small ? 'text-caption leading-5' : 'text-body-sm leading-6', clamp && 'line-clamp-5', spoiler && !shown && 'blur-[6px] select-none')}>{content}</p>
      {spoiler && !shown && (
        <button type="button" onClick={() => setShown(true)} className="absolute inset-0 grid place-items-center text-sm font-medium text-white">
          <span className="rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">Contains spoilers · Show</span>
        </button>
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

function CommentCard({ c, me, onDeleted }: { c: TraktComment; me: TraktUser | null; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(c.likes);
  const [confirm, setConfirm] = useState(false);
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
        <button
          type="button"
          onClick={() => setThread((v) => !v)}
          aria-expanded={thread}
          aria-label={`${c.replies} replies`}
          className={cx('flex items-center gap-1 transition-colors hover:text-white', thread && 'text-white')}
        >
          <MessageCircle className={cx('size-3.5', thread && 'fill-current')} /> {replies}
        </button>
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
      {thread && <Thread id={c.id} me={me} onReplied={() => setReplies((n) => n + 1)} />}
    </article>
  );
}

/** A comment's replies, read here; signed in, you can answer. */
function Thread({ id, me, onReplied }: { id: number; me: TraktUser | null; onReplied: () => void }) {
  const qc = useQueryClient();
  const { data, isPending, isError } = useQuery(traktQ.replies(id));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const send = async () => {
    if (words < 5 || busy) return;
    setBusy(true);
    try {
      await postReply(id, text.trim(), false);
      setText('');
      onReplied();
      qc.invalidateQueries({ queryKey: ['trakt', 'replies', id] });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
      {isPending && <div className="skeleton h-12 rounded-xl" />}
      {isError && <p className="text-xs text-faint">Couldn’t load the replies.</p>}
      {data?.length === 0 && <p className="text-xs text-faint">No replies yet.</p>}
      {data?.map((r) => {
        const name = r.user.name || r.user.username;
        return (
          <div key={r.id} className="flex gap-2.5">
            <Avatar src={r.user.images?.avatar?.full} name={name} small />
            <div className="min-w-0 flex-1">
              <p className="text-xs">
                <span className="font-medium text-white/90">{name}</span> <span className="text-faint">· {ago(r.created_at)}</span>
              </p>
              <Body text={r.comment} spoiler={r.spoiler} clamp={false} small />
            </div>
          </div>
        );
      })}
      {me && (
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && send()}
            rows={1}
            placeholder="Reply (5 words or more)…"
            aria-label="Your reply"
            className="min-h-9 min-w-0 flex-1 resize-none rounded-xl bg-white/[0.06] px-3 py-2 text-base outline-none placeholder:text-faint sm:text-sm"
          />
          <button type="button" onClick={send} disabled={words < 5 || busy} className={cx(btn({ variant: 'primary' }), 'h-9 px-4 text-sm disabled:opacity-40')}>
            {busy ? '…' : 'Reply'}
          </button>
        </div>
      )}
    </div>
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
