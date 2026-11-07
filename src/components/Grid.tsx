import { useEffect, useRef } from 'react';
import type { MediaItem, MediaType } from '../lib/tmdb';
import MediaCard from './MediaCard';
import { CardSkeleton, GRID, GRID_SIZES, GridSkeleton } from './Skeletons';

interface Props {
  items: MediaItem[];
  type?: MediaType;
  loading: boolean;
  error?: unknown;
  onRetry?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  empty?: React.ReactNode;
}

export default function Grid({ items, type, loading, error, onRetry, hasMore, loadingMore, onLoadMore, empty }: Props) {
  if (loading) return <GridSkeleton />;
  if (error && !items.length) return <ErrorBox onRetry={onRetry} />;
  if (!items.length) return <>{empty ?? <p className="py-20 text-center text-muted">Nothing found.</p>}</>;
  return (
    <>
      <div className={GRID}>
        {items.map((m) => (
          <MediaCard key={(m.media_type ?? type) + String(m.id)} item={m} type={type} sizes={GRID_SIZES} />
        ))}
        {loadingMore && Array.from({ length: 6 }, (_, i) => <CardSkeleton key={`s${i}`} />)}
      </div>
      {hasMore && onLoadMore && <LoadMore onLoad={onLoadMore} busy={!!loadingMore} />}
    </>
  );
}

/** Auto-loads when scrolled into view; the button is the fallback. */
function LoadMore({ onLoad, busy }: { onLoad: () => void; busy: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const cb = useRef(onLoad);
  cb.current = onLoad;
  useEffect(() => {
    const el = ref.current;
    if (!el || busy || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && cb.current(), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [busy]);
  return (
    <div className="mt-12 flex justify-center">
      <button
        ref={ref}
        onClick={onLoad}
        disabled={busy}
        className="h-12 rounded-full bg-surface px-6 text-[15px] text-white/85 transition hover:bg-raised disabled:opacity-50"
      >
        {busy ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}

export function ErrorBox({ onRetry, message = 'Something went wrong loading this.' }: { onRetry?: () => void; message?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-muted">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="h-11 rounded-full bg-surface px-5 text-sm hover:bg-raised">
          Try again
        </button>
      )}
    </div>
  );
}
