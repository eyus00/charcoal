import { useQuery } from '@tanstack/react-query';
import { Tip } from './Tip';
import { releaseDatesQ } from '../lib/library';
import type { Details, MediaType } from '../lib/tmdb';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The best quality that exists for a title, worked out from its releases (like streaming sites'
 * WEB-DL / CAM tags):
 * - a disc release is out: BluRay; a digital (streaming / rental) release: WEB-DL;
 * - only in theaters so far: CAM (only camera recordings exist);
 * - shows: WEB-DL once an episode has aired. Nothing out yet: no tag.
 */
export default function QualityTag({ d, type, className }: { d: Details; type: MediaType; className?: string }) {
  const { data } = useQuery({ ...releaseDatesQ(d.id), enabled: type === 'movie' });
  let tag: { label: string; tip: string } | null = null;
  if (type === 'tv') {
    if (d.last_episode_to_air?.air_date && d.last_episode_to_air.air_date <= today()) tag = { label: 'WEB-DL', tip: 'Episodes come from streaming releases (WEB-DL)' };
  } else if (data) {
    if (data.physical && data.physical <= today()) tag = { label: 'BluRay', tip: 'Out on disc: the best quality there is' };
    else if (data.digital && data.digital <= today()) tag = { label: 'WEB-DL', tip: 'Out digitally: streaming-quality release' };
    else if (data.theatrical && data.theatrical <= today()) tag = { label: 'CAM', tip: 'Only in theaters so far: just camera recordings exist' };
  } else if (d.release_date && d.release_date <= today()) {
    // Before the release dates load: nothing (avoid flashing a wrong tag).
    tag = null;
  }
  if (!tag) return null;
  // Positioned by a wrapper: the tag itself is the tooltip's anchor (relative).
  return (
    <span className={className}>
      <span tabIndex={0} className="group/tip relative inline-flex h-7 items-center rounded-full px-3 text-[11px] font-semibold tracking-wider text-white ring-1 ring-white/45 outline-none ring-inset">
        {tag.label}
        <Tip label={tag.tip} side="bottom" align="end" />
      </span>
    </span>
  );
}
