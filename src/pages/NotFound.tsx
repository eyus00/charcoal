import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { useTitle } from '../lib/util';
import { btn } from '../components/Button';

export default function NotFound() {
  useTitle('Not found');
  return (
    <div className="flex flex-col items-center px-4 py-28 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-surface text-muted">
        <Compass className="size-6" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-muted">That link doesn’t point to anything here.</p>
      <div className="mt-6 flex gap-2.5">
        <Link to="/" className={btn({ variant: 'primary' })}>
          Go home
        </Link>
        <Link to="/discover" className={btn()}>
          Discover titles
        </Link>
      </div>
    </div>
  );
}
