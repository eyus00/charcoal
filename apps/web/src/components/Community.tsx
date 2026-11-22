import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Heart, MessageCircle, Star } from 'lucide-react';
import { SectionHeader } from './Row';
import { traktQ, traktUrl, type CommentSort, type TraktComment, type TraktTitle } from '../lib/trakt';
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

  const hasAnything = !!ratings.data?.votes || list.length > 0 || !!tmdb.data?.results.length;
  const loading = inView && (title.isPending || (!!t && comments.isPending));

  return (
    <section ref={ref} className="mt-10">
      {(loading || hasAnything) && (
        <SectionHeader
          title="What people think"
          action={
            t && (
              <a href={traktUrl(t, 'comments')} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-white">
                on Trakt <ArrowUpRight className="size-3.5" />
              </a>
            )
          }
        />
      )}
      {loading && <CommunitySkeleton />}
      {!loading && hasAnything && (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
          {ratings.data && ratings.data.votes > 0 ? <RatingSummary r={ratings.data} t={t!} /> : <div className="hidden lg:block" />}
          <div className="min-w-0">
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
                    <CommentCard key={c.id} c={c} />
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

function RatingSummary({ r, t }: { r: { rating: number; votes: number; distribution: Record<string, number> }; t: TraktTitle }) {
  const max = Math.max(1, ...Object.values(r.distribution));
  return (
    <a href={traktUrl(t)} target="_blank" rel="noreferrer" className="block self-start rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.06]">
      <div className="flex items-baseline gap-2">
        <Star className="size-5 self-center fill-current text-star" strokeWidth={0} />
        <span className="text-4xl font-semibold tracking-tight tabular-nums">{r.rating.toFixed(1)}</span>
        <span className="text-sm text-muted">/ 10</span>
      </div>
      <p className="mt-1 text-xs text-muted">{compact(r.votes)} ratings on Trakt</p>
      {/* Votes per score, 1 → 10. */}
      <div className="mt-4 flex h-10 items-end gap-1 lg:h-14" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex-1 rounded-sm bg-white/70" style={{ height: `${Math.max(4, ((r.distribution[String(i + 1)] ?? 0) / max) * 100)}%`, opacity: 0.35 + (i / 9) * 0.65 }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-micro text-faint tabular-nums">
        <span>1</span>
        <span>10</span>
      </div>
    </a>
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

function CommentCard({ c }: { c: TraktComment }) {
  const [open, setOpen] = useState(false);
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
        <span className="flex items-center gap-1">
          <Heart className="size-3.5" /> {c.likes}
        </span>
        <a href={`https://trakt.tv/comments/${c.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 transition-colors hover:text-white">
          <MessageCircle className="size-3.5" /> {c.replies}
        </a>
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
