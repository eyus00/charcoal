import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, EyeOff, Heart, MessageCircle, MessagesSquare, PenLine, Star, Trash2 } from 'lucide-react';
import { Tip } from './Tip';
import { Dialog } from './Modal';
import { RowArrows, Scroller, SectionHeader, useRowScroll } from './Row';
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
import { setLocalRating, useLocalRating } from '../lib/ratings';

/**
 * What people think: the Trakt community's rating and comments for this title (shared with
 * every app that uses Trakt), with TMDB's reviews when Trakt has none. Loads when scrolled near.
 */
export default function Community({ type, id, name }: { type: MediaType; id: number; /** The title's name, for the reviews popup's header. */ name?: string }) {
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
  const [all, setAll] = useState(false);
  const [aboutTrakt, setAboutTrakt] = useState(false);
  // Comments live on Trakt: without it the button says why, and offers to connect.
  const write = () => (user ? setWriting(true) : toast('Comments are posted on Trakt', { label: 'Connect Trakt', run: () => setAboutTrakt(true) }));
  const shown = [...mine, ...others];
  const { ref: rowRef, scroll } = useRowScroll();
  const onDeleted = (c: TraktComment) => {
    setJustPosted((p) => p.filter((x) => x.id !== c.id));
    refresh();
  };
  const sortPills = (
    <div className="flex items-center gap-2">
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
    </div>
  );

  return (
    <section ref={ref} className="mt-10">
      {(loading || hasAnything) && <SectionHeader title="What people think" action={shown.length > 0 || tmdb.data?.results.length ? <RowArrows onScroll={scroll} /> : undefined} />}
      {loading && <CommunitySkeleton />}
      {!loading && hasAnything && (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-8">
          {/* Starts level with the toolbar and ends with the comment cards (toolbar 48px + cards 272px). */}
          <div className="flex flex-col">
            {t && (
              <SummaryWithMine r={ratings.data} t={t} type={type} id={id} user={user}>
                <YourRating t={t} type={type} id={id} user={user} />
              </SummaryWithMine>
            )}
          </div>
          <div className="min-w-0">
            {/* One fixed-height toolbar: sort, and the button that opens the composer. */}
            <div className="mb-3 flex h-9 items-center gap-2">
              {shown.length > 0 && sortPills}
              {t && (
                <button
                  type="button"
                  onClick={write}
                  aria-label={user ? 'Comment' : 'Comment (needs Trakt)'}
                  // Looks unavailable without Trakt, but still answers a tap (with how to get it).
                  className={cx(btn(), 'ml-auto h-9 px-4 text-sm', !user && 'opacity-50 hover:bg-white/10')}
                >
                  <PenLine className="size-4" /> Comment
                </button>
              )}
            </div>
            {shown.length > 0 ? (
              // Sideways like the other rows: the first few, then "Read more" for everything.
              <Scroller label="Comments" scrollRef={rowRef} bleed={false}>
                {shown.slice(0, 5).map((c) => (
                  <CommentCard key={c.id} c={c} me={user} pinned={mineIds.has(c.id)} onDeleted={() => onDeleted(c)} row />
                ))}
                <button
                  type="button"
                  onClick={() => setAll(true)}
                  className="flex h-[272px] w-[180px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl bg-white/[0.04] text-sm font-medium text-white/80 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.07] hover:text-white"
                >
                  <span className="grid size-11 place-items-center rounded-full bg-white/10">
                    <MessagesSquare className="size-5" />
                  </span>
                  Read more…
                </button>
              </Scroller>
            ) : tmdb.data && tmdb.data.results.length > 0 ? (
              <Scroller label="Reviews" scrollRef={rowRef} bleed={false}>
                {tmdb.data.results.slice(0, 8).map((r) => (
                  <TmdbReviewCard key={r.id} r={r} />
                ))}
              </Scroller>
            ) : (
              <div className="flex h-[272px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/[0.04] p-6 text-center ring-1 ring-white/[0.06]">
                <MessageCircle className="mb-1 size-6 text-faint" />
                <p className="text-sm font-medium">No comments yet</p>
                <p className="text-sm text-muted">Be the first to share what you think.</p>
              </div>
            )}
          </div>
        </div>
      )}
      {all && t && (
        <Dialog
          title={name ?? 'What people think'}
          subtitle={`What people think${ratings.data?.votes ? ` · ★ ${ratings.data.rating.toFixed(1)} from ${compact(ratings.data.votes)} ratings on Trakt` : ''}`}
          onClose={() => setAll(false)}
          wide
        >
          <div className="sticky top-0 z-10 -mx-5 mb-3 flex items-center gap-2 bg-surface px-5 pb-3">
            {sortPills}
            <button type="button" onClick={write} className={cx(btn(), 'ml-auto h-9 px-4 text-sm')}>
              <PenLine className="size-4" /> Comment
            </button>
          </div>
          <div className="space-y-3">
            {shown.map((c) => (
              <CommentCard key={c.id} c={c} me={user} pinned={mineIds.has(c.id)} onDeleted={() => onDeleted(c)} />
            ))}
            {comments.isFetchingNextPage && Array.from({ length: 2 }, (_, i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}
          </div>
          {comments.hasNextPage && !comments.isFetchingNextPage && (
            <div className="flex justify-center pt-4">
              <button type="button" onClick={() => comments.fetchNextPage()} className={cx(btn(), 'h-9 px-5 text-sm')}>
                Show more
              </button>
            </div>
          )}
        </Dialog>
      )}
      {aboutTrakt && <AboutTrakt onClose={() => setAboutTrakt(false)} />}
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

const compact = (n: number) =>
  new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);

/** Trakt's score and its spread (1 → 10); your own score gets a white cap on its bar. */
function RatingSummary({ r, mine = 0, children }: { r?: { rating: number; votes: number; distribution: Record<string, number> }; mine?: number; children?: React.ReactNode }) {
  const max = Math.max(1, ...Object.values(r?.distribution ?? {}));
  return (
    <div className="flex flex-1 flex-col rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/[0.06] lg:h-[320px] lg:flex-none">
      <div className="flex items-baseline gap-2">
        <Star className="size-5 self-center fill-current text-star" strokeWidth={0} />
        <span className="text-4xl font-semibold tracking-tight tabular-nums">{r?.votes ? r.rating.toFixed(1) : '–'}</span>
        <span className="text-sm text-muted">/ 10</span>
      </div>
      <p className="mt-1 text-xs text-muted">{r?.votes ? `${compact(r.votes)} ratings on Trakt` : 'No ratings on Trakt yet'}</p>
      {!!r?.votes && (
        <div className={cx('mt-auto', mine ? 'pt-7' : 'pt-4')}>
          <div className="flex h-12 items-end gap-1" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => {
              const yours = mine === i + 1;
              return (
                <div key={i} className="relative flex h-full flex-1 items-end">
                  <div
                    className={cx('relative w-full rounded-sm', yours ? 'bg-white' : 'bg-white/70')}
                    style={{ height: `${Math.max(4, ((r.distribution[String(i + 1)] ?? 0) / max) * 100)}%`, opacity: yours ? 1 : 0.35 + (i / 9) * 0.55 }}
                  >
                    {/* Your score, big, on top of its bar. */}
                    {yours && <span className="pop absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-xl leading-none font-semibold text-white tabular-nums">{i + 1}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-micro text-faint tabular-nums">
            <span>1</span>
            <span>10</span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

function SummaryWithMine({
  r,
  t,
  type,
  id,
  user,
  children,
}: {
  r?: { rating: number; votes: number; distribution: Record<string, number> };
  t: TraktTitle;
  type: MediaType;
  id: number;
  user: TraktUser | null;
  children?: React.ReactNode;
}) {
  return (
    <RatingSummary r={r} mine={useMyScore(t, type, id, user)}>
      {children}
    </RatingSummary>
  );
}

/** Your saved score: Trakt's when connected and set there, else this browser's. */
function useMyScore(t: TraktTitle, type: MediaType, id: number, user: TraktUser | null) {
  const local = useLocalRating(type, id);
  const remote = useQuery({ ...myRatingsQ(t.kind, !!user) });
  return (user ? remote.data?.get(t.traktId) : undefined) ?? local;
}

/**
 * Your rating, under the score card: the numbers 1–10. Hovering one shows a star above it; your
 * pick is a white pill with a star on top. No account needed (saved in this browser; sent to Trakt
 * when connected). Picking your score again removes it.
 */
function YourRating({ t, type, id, user }: { t: TraktTitle; type: MediaType; id: number; user: TraktUser | null }) {
  const qc = useQueryClient();
  const saved = useMyScore(t, type, id, user);
  const [hover, setHover] = useState(0);
  const [pending, setPending] = useState<number | null>(null);
  const mine = pending ?? saved;
  const pick = async (n: number) => {
    const next = n === saved ? null : n;
    setPending(next ?? 0);
    setLocalRating(type, id, next);
    try {
      if (user) {
        await rateTitle(t, next);
        qc.setQueryData(myRatingsQ(t.kind, true).queryKey, (m: Map<number, number> | undefined) => {
          const copy = new Map(m);
          if (next) copy.set(t.traktId, next);
          else copy.delete(t.traktId);
          return copy;
        });
        qc.invalidateQueries({ queryKey: ['trakt', 'ratings', t.kind, t.slug] });
      }
      toast(next ? `Rated ${next}/10` : 'Rating removed');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setPending(null);
    }
  };
  return (
    <div className="group/tip relative">
      <div role="radiogroup" aria-label="Your rating" onPointerLeave={() => setHover(0)} className="-mx-2 mt-4 border-t border-white/[0.07] pt-4">
        <p className="mb-2 px-2 text-sm font-semibold">{mine ? 'Your rating' : 'Rate it'}</p>
        <div className="grid grid-cols-10 gap-0.5">
          {Array.from({ length: 10 }, (_, i) => {
            const n = i + 1;
            const on = mine === n;
            // Hovering lights up every number to it, like filling stars.
            const upTo = hover ? n <= hover : on ? false : mine ? n <= mine : false;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${n} out of 10`}
                disabled={pending !== null}
                onPointerEnter={() => setHover(n)}
                onClick={() => pick(n)}
                className={cx(
                  'grid h-9 min-w-0 place-items-center rounded-lg text-[15px] leading-none font-semibold tabular-nums transition-colors',
                  on && !hover ? 'bg-white font-bold text-black' : hover === n ? 'bg-white font-bold text-black' : upTo ? 'text-white' : 'text-white/45 hover:text-white',
                )}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
      <Tip label={saved ? `Your rating: ${saved}/10 · pick it again to remove` : 'Your rating'} side="bottom" />
    </div>
  );
}

/** A reviewer's score, styled like the big one: ★ 8 /10. */
function Score({ n }: { n: number }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1" aria-label={`${n} out of 10`}>
      <Star className="size-3.5 self-center fill-current text-star" strokeWidth={0} />
      <span className="text-lg leading-none font-semibold tabular-nums">{n}</span>
      <span className="text-xs text-muted">/ 10</span>
    </span>
  );
}

/** What connecting Trakt is and does, with the button to do it. */
function AboutTrakt({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title="Connect Trakt"
      subtitle="Free, and takes a minute"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-xs text-muted">You sign in on trakt.tv. Charcoal never sees your password, and the sign-in stays in this browser.</p>
          <button type="button" onClick={() => startTraktLogin()} className={cx(btn({ variant: 'primary' }), 'h-10 px-5 text-sm')}>
            Connect Trakt
          </button>
        </div>
      }
    >
      <p className="text-body-sm leading-6 text-white/85">Trakt is a free service that keeps track of what you watch, shared by many apps. The comments and ratings here come from its community.</p>
      <ul className="mt-4 space-y-2.5 text-body-sm text-white/85">
        {[
          'Comment and reply to what others think, and like comments',
          'Keep your ratings on Trakt, not just in this browser',
          'Mark what you watch automatically (in the Jelly player)',
          'Keep your library in step with your Trakt watchlist',
        ].map((x) => (
          <li key={x} className="flex gap-2.5">
            <Check className="mt-1 size-4 shrink-0 text-success" />
            {x}
          </li>
        ))}
      </ul>
    </Dialog>
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
function Body({ text, spoiler, clamp, small, lines = 5 }: { text: string; spoiler: boolean; clamp: boolean; small?: boolean; lines?: 4 | 5 }) {
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
        className={cx(
          'break-words whitespace-pre-line text-white/85',
          small ? 'text-caption leading-5' : 'text-body-sm leading-6',
          clamp && (lines === 4 ? 'line-clamp-4' : 'line-clamp-5'),
          gated && 'blur-[7px] select-none',
        )}
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

function CommentCard({ c, me, pinned, row, onDeleted }: { c: TraktComment; me: TraktUser | null; pinned?: boolean; row?: boolean; onDeleted: () => void }) {
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
  const long = c.comment.length > (row ? 220 : 320);
  return (
    <article
      className={cx(
        'flex flex-col rounded-2xl p-4 ring-1',
        row && 'h-[272px] w-[300px] shrink-0 snap-start sm:w-[340px]',
        pinned ? 'bg-white/[0.06] ring-white/[0.12]' : 'bg-white/[0.04] ring-white/[0.06]',
      )}
    >
      <CommentHead c={c} pinned={pinned} />
      <Body text={c.comment} spoiler={c.spoiler} clamp lines={row ? 4 : 5} />
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
      {c.user_rating ? <Score n={c.user_rating} /> : null}
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
    <article className="flex h-[272px] w-[300px] shrink-0 snap-start flex-col rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06] sm:w-[340px]">
      <header className="flex items-center gap-3">
        <Avatar src={avatar} name={r.author} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{r.author}</p>
          <p className="text-xs text-faint">{ago(r.created_at)} · on TMDB</p>
        </div>
        {r.author_details.rating ? <Score n={r.author_details.rating} /> : null}
      </header>
      <Body text={r.content} spoiler={false} clamp lines={4} />
      {r.content.length > 220 && (
        <button type="button" onClick={() => setOpen(true)} className="mt-auto self-end pt-2 text-xs font-medium text-white/70 transition-colors hover:text-white">
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

/** Shaped like the real thing: score card (number, line, bars), rating pill, toolbar, comment cards. */
function CommunitySkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-8">
      <div className="flex h-[320px] flex-col rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/[0.06]">
        <div className="skeleton h-9 w-28 rounded-lg" />
        <div className="skeleton mt-2 h-3 w-32 rounded" />
        <div className="mt-auto flex h-12 items-end gap-1">
          {[8, 8, 8, 8, 10, 14, 30, 60, 50, 90].map((h, i) => (
            <div key={i} className="skeleton flex-1 rounded-sm" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="-mx-2 mt-4 border-t border-white/[0.07] px-2 pt-4">
          <div className="skeleton h-3.5 w-20 rounded" />
          <div className="mt-3 grid grid-cols-10 gap-1.5">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="skeleton h-7 rounded-md" />
            ))}
          </div>
        </div>
      </div>
      <div className="min-w-0">
        <div className="mb-3 flex h-9 items-center gap-2">
          <div className="skeleton h-8 w-14 rounded-full" />
          <div className="skeleton h-8 w-20 rounded-full" />
          <div className="skeleton ml-auto h-9 w-28 rounded-full" />
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex h-[272px] w-[300px] shrink-0 flex-col rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06] sm:w-[340px]">
              <div className="flex items-center gap-3">
                <div className="skeleton size-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-28 rounded" />
                  <div className="skeleton h-3 w-16 rounded" />
                </div>
                <div className="skeleton h-5 w-12 rounded" />
              </div>
              <div className="mt-4 space-y-2">
                <div className="skeleton h-3.5 w-full rounded" />
                <div className="skeleton h-3.5 w-full rounded" />
                <div className="skeleton h-3.5 w-11/12 rounded" />
                <div className="skeleton h-3.5 w-2/3 rounded" />
              </div>
              <div className="mt-auto flex gap-4">
                <div className="skeleton h-3.5 w-10 rounded" />
                <div className="skeleton h-3.5 w-8 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
