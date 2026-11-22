import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import DetailsPeek from '../player/DetailsPeek';
import { peek, usePeek } from '../lib/peek';
import { q } from '../lib/tmdb';

/** Shows the details peek opened from a card (see lib/peek). Closes when the page changes. */
export default function PeekHost() {
  const target = usePeek();
  const { pathname } = useLocation();
  useEffect(() => peek.close(), [pathname]);
  const { data } = useQuery({ ...q.details(target?.type ?? 'movie', target?.id ?? 0), enabled: !!target });
  if (!target || !data || data.id !== target.id) return null;
  return <DetailsPeek d={data} type={target.type} detailsUrl={`/${target.type}/${target.id}`} onClose={peek.close} />;
}
