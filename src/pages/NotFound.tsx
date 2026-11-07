import { Link } from 'react-router';
import { useTitle } from '../lib/util';

export default function NotFound() {
  useTitle('Not found');
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-32 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted">That link doesn't point to anything here.</p>
      <Link to="/" className="h-10 rounded-lg bg-white/10 px-5 text-sm leading-10 hover:bg-white/15">
        Go home
      </Link>
    </div>
  );
}
