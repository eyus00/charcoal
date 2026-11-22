import { Link } from 'react-router';
import { Maximize2, Star, X } from 'lucide-react';
import Img from '../components/Img';
import Modal from '../components/Modal';
import { CertBadge } from '../components/MediaCard';
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

  return (
    <Modal label={`${title}: details`} onClose={onClose}>
      {/* Phones: a sheet from the bottom; larger screens: a centred card. */}
      <div className="fixed inset-0 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
        {/* A small version of the details page: backdrop, then the same glass info card on it. */}
        <div
          className="toast-in relative max-h-[90dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-h-[88dvh] sm:max-w-3xl sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <Img path={d.backdrop_path} kind="backdrop" sizes="(min-width: 640px) 768px, 100vw" alt="" className="absolute! inset-0 size-full" imgClassName="object-[70%_20%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-bg/40" />
          <div className="absolute inset-0 hidden bg-gradient-to-r from-bg/80 via-bg/20 to-transparent sm:block" />

          <div className="absolute top-3 right-3 z-10 flex gap-2">
            <Link to={detailsUrl} aria-label="Open the full details page" className={cx(btn({ icon: true }), 'group/tip relative bg-black/55! backdrop-blur-md hover:bg-black/75!')}>
              <Maximize2 className="size-4" />
              <Tip label="Open full page" side="bottom" align="end" />
            </Link>
            <button type="button" onClick={onClose} aria-label="Close" className={cx(btn({ icon: true }), 'group/tip relative bg-black/55! backdrop-blur-md hover:bg-black/75!')}>
              <X className="size-4" />
              <Tip label="Close" keys="Esc" side="bottom" align="end" />
            </button>
          </div>

          <div className="relative flex min-h-[26rem] items-end p-4 sm:min-h-[30rem] sm:p-6">
            <div className="max-w-xl rounded-3xl bg-black/35 p-5 ring-1 ring-white/10 backdrop-blur-xl md:p-7">
              <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">{title}</h2>
              {/* Same order everywhere: year · ★ rating · age rating · length; genres below. */}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/80">
                {[year, d.vote_average > 0 ? 'rating' : '', cert ? 'cert' : '', length].filter(Boolean).map((t, i) => (
                  <span key={i} className="flex items-center gap-2">
                    {i > 0 && <span className="text-white/35">·</span>}
                    {t === 'cert' ? (
                      <CertBadge>{cert}</CertBadge>
                    ) : t === 'rating' ? (
                      <span className="flex items-center gap-1 font-medium">
                        <Star className="size-3.5 fill-current text-star" strokeWidth={0} />
                        {d.vote_average.toFixed(1)}
                      </span>
                    ) : (
                      t
                    )}
                  </span>
                ))}
              </div>
              {d.genres.length > 0 && <p className="mt-1.5 text-sm text-white/70">{d.genres.map((g) => g.name).join(', ')}</p>}
              {d.overview && <p className="mt-4 line-clamp-5 text-body-sm leading-6 text-pretty text-white/80">{d.overview}</p>}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
