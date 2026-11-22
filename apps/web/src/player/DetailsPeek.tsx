import { Link } from 'react-router';
import { Maximize2, Star, X } from 'lucide-react';
import Img from '../components/Img';
import Modal from '../components/Modal';
import { Tip } from '../components/Tip';
import { btn } from '../components/Button';
import { certificationOf, titleOf, type Details, type MediaType } from '../lib/tmdb';
import { cx, formatRuntime } from '../lib/util';

/**
 * A quick look at the title's details over the player (opened from the top-left title block),
 * so watching isn't interrupted. The expand button opens the full details page.
 */
export default function DetailsPeek({ d, type, detailsUrl, onClose }: { d: Details; type: MediaType; detailsUrl: string; onClose: () => void }) {
  const title = titleOf(d);
  const year = (d.release_date || d.first_air_date || '').slice(0, 4);
  const cert = certificationOf(d);
  const length =
    type === 'movie' ? formatRuntime(d.runtime ?? 0) : d.number_of_seasons ? `${d.number_of_seasons} season${d.number_of_seasons === 1 ? '' : 's'}` : '';
  const cast = (d.credits?.cast ?? []).slice(0, 6);

  return (
    <Modal label={`${title}: details`} onClose={onClose}>
      <div className="fixed inset-0 grid place-items-center bg-black/70 p-4" onClick={onClose}>
        <div className="toast-in relative max-h-[88dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-3xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="relative">
            <Img path={d.backdrop_path} kind="backdrop" sizes="672px" alt="" className="aspect-[16/7]" />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />
            <div className="absolute top-3 right-3 flex gap-2">
              <Link to={detailsUrl} aria-label="Open the full details page" className={cx(btn({ icon: true }), 'group/tip relative bg-black/55! backdrop-blur-md hover:bg-black/75!')}>
                <Maximize2 className="size-4" />
                <Tip label="Open full page" side="bottom" align="end" />
              </Link>
              <button type="button" onClick={onClose} aria-label="Close" className={cx(btn({ icon: true }), 'group/tip relative bg-black/55! backdrop-blur-md hover:bg-black/75!')}>
                <X className="size-4" />
                <Tip label="Close" keys="Esc" side="bottom" align="end" />
              </button>
            </div>
          </div>

          <div className="-mt-10 px-6 pb-6 md:px-7">
            <h2 className="relative text-2xl leading-tight font-semibold text-balance md:text-3xl">{title}</h2>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-white/70">
              {[year, cert, length].filter(Boolean).map((t, i) => (
                <span key={i} className="contents">
                  {i > 0 && <span className="text-white/30">·</span>}
                  <span>{t}</span>
                </span>
              ))}
              {d.vote_average > 0 && (
                <>
                  <span className="text-white/30">·</span>
                  <span className="flex items-center gap-1 font-medium text-white/90">
                    <Star className="size-3.5 fill-current text-star" strokeWidth={0} />
                    {d.vote_average.toFixed(1)}
                  </span>
                </>
              )}
            </p>
            {d.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.genres.slice(0, 4).map((g) => (
                  <span key={g.id} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/80">
                    {g.name}
                  </span>
                ))}
              </div>
            )}
            {d.tagline && <p className="mt-4 text-sm text-white/60 italic">{d.tagline}</p>}
            {d.overview && <p className="mt-2 text-body-sm leading-relaxed text-white/80">{d.overview}</p>}

            {cast.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xs text-muted">Cast</h3>
                <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {cast.map((c) => (
                    <div key={c.id} className="min-w-0 text-center">
                      <Img path={c.profile_path} kind="profile" sizes="64px" alt="" className="mx-auto aspect-square w-14 rounded-full" />
                      <p className="mt-1.5 truncate text-xs text-white/85">{c.name}</p>
                      {c.character && <p className="truncate text-micro text-faint">{c.character}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
