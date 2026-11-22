import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { btn } from '../components/Button';
import { toast } from '../components/Toast';
import { finishTraktLogin, syncWatchlistOnStart } from '../lib/trakt';
import { useTitle } from '../lib/util';

/** Where Trakt sends you back after signing in: finish it, then return to where you were. */
export default function TraktCallback() {
  useTitle('Connecting Trakt');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    finishTraktLogin(params)
      .then(({ returnTo, user }) => {
        toast(user ? `Connected to Trakt as ${user.name || user.username}` : 'Connected to Trakt');
        syncWatchlistOnStart();
        navigate(returnTo, { replace: true });
      })
      .catch((e: Error) => setError(e.message));
  }, [params, navigate]);

  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      {error ? (
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-semibold">Couldn’t connect Trakt</h1>
          <p className="text-sm text-muted">{error}</p>
          <Link to="/profile#settings" replace className={btn({ variant: 'primary' })}>
            Back to settings
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="mx-auto size-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
          <p className="text-sm text-muted">Connecting Trakt…</p>
        </div>
      )}
    </div>
  );
}
