import { Link } from 'react-router';
import { X } from 'lucide-react';
import EpisodeTile, { Chip } from './EpisodeTile';
import { RowArrows, Scroller, SectionHeader, useRowScroll } from './Row';
import { toast } from './Toast';
import { getShelf, removeFromShelf, restoreShelf, resumePoint, shelfStatus, shelfWatchUrl, useShelf, type ShelfEntry } from '../lib/animeShelf';

function Tile({ e }: { e: ShelfEntry }) {
  const { episode, finished } = resumePoint(e);
  const status = shelfStatus(e);
  const progress = !e.done && e.duration ? Math.min(100, ((e.watched ?? 0) / e.duration) * 100) : 0;
  const line = e.film ? 'Film' : status === 'planned' ? 'Not started' : finished ? 'Watched' : `${e.done ? 'Next: episode' : 'Episode'} ${episode}`;
  return (
    <EpisodeTile
      to={status === 'completed' ? `/anime/title/${e.id}` : shelfWatchUrl(e)}
      title={e.title}
      image={{ path: null, kind: 'backdrop', src: e.cover }}
      primary={e.title}
      secondary={line}
      progress={progress}
      topLeft={status === 'planned' ? <Chip>In library</Chip> : undefined}
      titleLink={{ to: `/anime/title/${e.id}`, line: 'primary', label: `${e.title}: details` }}
      linkProps={{ 'data-shelf': e.id }}
    >
      <button
        type="button"
        aria-label={`Remove ${e.title}`}
        onClick={() => {
          const before = getShelf();
          removeFromShelf(e.id);
          toast(`Removed ${e.title}`, { label: 'Undo', run: () => restoreShelf(before) });
        }}
        className="absolute top-2.5 right-2.5 z-10 grid size-8 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <X className="size-4" />
      </button>
    </EpisodeTile>
  );
}

/**
 * Anime that TMDB doesn't list, from your library and history (see lib/animeShelf): what you are
 * watching, or everything kept. Nothing is rendered when there is nothing to show.
 */
export default function AnimeShelfRow({ title, show, bleed = true }: { title: string; show: 'watching' | 'history' | 'library'; bleed?: boolean }) {
  const shelf = useShelf();
  const { ref, scroll } = useRowScroll();
  const items = shelf
    .filter((e) => (show === 'watching' ? shelfStatus(e) === 'watching' : show === 'history' ? !!e.lastWatched : e.inLibrary))
    .sort((a, b) => (b.lastWatched ?? b.addedAt) - (a.lastWatched ?? a.addedAt))
    .slice(0, 30);
  if (!items.length) return null;
  return (
    <section data-testid={`anime-shelf-${show}`}>
      <SectionHeader
        title={title}
        action={
          <div className="flex items-center gap-3">
            <Link to="/anime" className="text-sm text-muted transition-colors hover:text-white">
              Anime
            </Link>
            <RowArrows onScroll={scroll} />
          </div>
        }
      />
      <Scroller label={title} scrollRef={ref} bleed={bleed}>
        {items.map((e) => (
          <Tile key={e.id} e={e} />
        ))}
      </Scroller>
    </section>
  );
}
