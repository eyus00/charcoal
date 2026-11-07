import { useEffect } from 'react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { AlertTriangle, Home, RotateCw } from 'lucide-react';
import NotFound from './NotFound';

const RELOAD_KEY = 'charcoal:chunk-reload';

/** After a deploy, an open tab can ask for code chunks that no longer exist. */
const isChunkError = (e: unknown) =>
  e instanceof Error && /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch dynamically/i.test(e.message);

/** Shown instead of a blank page or the router's default error screen. */
export default function RouteError() {
  const error = useRouteError();
  const chunk = isChunkError(error);

  // A stale tab after a deploy: reload once to pick up the new build.
  useEffect(() => {
    if (!chunk) return;
    try {
      if (sessionStorage.getItem(RELOAD_KEY)) return;
      sessionStorage.setItem(RELOAD_KEY, '1');
    } catch {
      return;
    }
    window.location.reload();
  }, [chunk]);
  useEffect(() => {
    if (!chunk) console.error(error);
  }, [chunk, error]);

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-6 text-center">
      <div className="flex max-w-sm flex-col items-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-surface text-muted">
          <AlertTriangle className="size-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold">{chunk ? 'Charcoal was updated' : 'Something went wrong'}</h1>
        <p className="mt-2 text-sm text-muted">
          {chunk ? 'Reload to get the latest version.' : 'This page hit an unexpected error. Reloading usually fixes it.'}
        </p>
        <div className="mt-6 flex gap-2.5">
          <button
            onClick={() => window.location.reload()}
            className="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-black transition hover:bg-white/90"
          >
            <RotateCw className="size-4" /> Reload
          </button>
          <Link to="/" reloadDocument className="flex h-11 items-center gap-2 rounded-full px-5 text-sm ring-1 ring-white/20 transition hover:bg-white/10">
            <Home className="size-4" /> Home
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Clear the one-shot reload guard once the app has loaded fine. */
export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* storage unavailable */
  }
}
