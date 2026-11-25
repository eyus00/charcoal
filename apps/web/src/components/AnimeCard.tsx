import { Link } from 'react-router';
import type { AnimeCard as Anime } from '@charcoal/content';
import Img from './Img';
import { CARD_IMAGE, CARD_INFO, CARD_TITLE, CornerArc, Meta, TypeIcon } from './MediaCard';
import { Chip } from './EpisodeTile';
import { cx } from '../lib/util';

/** A poster card for an AniList entry: the same card as a title's, with what has aired in its corner. */
export default function AnimeCard({ anime: a, sizes, className }: { anime: Anime; sizes: string; className?: string }) {
  return (
    <div className={cx('group relative', className)}>
      <Link to={`/anime/title/${a.id}`} className="block" data-anime={a.id}>
        <div className={CARD_IMAGE}>
          <Img path={null} src={a.cover} kind="poster" sizes={sizes} alt="" className="aspect-[2/3]" />
          {a.status === 'RELEASING' && a.aired !== undefined && (
            <span className="absolute top-2 left-2">
              <Chip>Ep {a.aired}</Chip>
            </span>
          )}
        </div>
        <div className={CARD_INFO}>
          <div className={CARD_TITLE} title={a.romaji && a.romaji !== a.title ? `${a.title} (${a.romaji})` : a.title}>
            {a.title}
          </div>
          <Meta year={a.year ? String(a.year) : undefined} rating={a.score} className="mt-0.5" extra={<TypeIcon type={a.kind === 'film' ? 'movie' : 'tv'} />} />
          <CornerArc />
        </div>
      </Link>
    </div>
  );
}
