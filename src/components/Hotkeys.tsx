import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Keyboard, X } from 'lucide-react';
import { actions, getState } from '../lib/store';
import { isTypingTarget, keyState } from '../lib/util';
import Modal from './Modal';
import { btn } from './Button';

export const GO: Record<string, { to: string; label: string }> = {
  h: { to: '/', label: 'Home' },
  m: { to: '/discover?type=movie', label: 'Movies' },
  t: { to: '/discover?type=tv', label: 'TV shows' },
  d: { to: '/discover', label: 'Discover' },
  p: { to: '/profile', label: 'Profile' },
  w: { to: '/profile#watchlist', label: 'Watchlist' },
  s: { to: '/profile#settings', label: 'Settings' },
  y: { to: '/profile#history', label: 'History' },
};

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';

/** Lets other components (e.g. the rail's help button) open the shortcuts dialog. */
export const hotkeysCtl = { help: () => {} };

const SECTIONS: { title: string; keys: [string[], string][] }[] = [
  { title: 'Everywhere', keys: [[[MOD, 'K'], 'Search'], [['/'], 'Search'], [['?'], 'Show shortcuts'], [['['], 'Expand / collapse sidebar'], [['Esc'], 'Close search / dialogs']] },
  { title: 'Go to', keys: Object.entries(GO).map(([k, v]) => [['g', k], v.label]) },
  { title: 'Home', keys: [[['←', '→'], 'Previous / next featured title']] },
  { title: 'Title page', keys: [[['p'], 'Play / resume (episodes for TV)'], [['b'], 'Add to / remove from watchlist'], [['t'], 'Play trailer']] },
  {
    title: 'Player',
    keys: [
      [['Space'], 'Play / pause'], [['K'], 'Play / pause'], [['J', 'L'], 'Back / forward 10s'], [['←', '→'], 'Back / forward 5s'],
      [['↑', '↓'], 'Volume'], [['0–9'], 'Jump to 0–90%'], [['<', '>'], 'Slower / faster'], [['F'], 'Fullscreen'], [['M'], 'Mute'],
      [['C'], 'Subtitles'], [['I'], 'Picture in picture'], [['Shift', 'N'], 'Next episode'], [['Shift', 'P'], 'Previous episode'],
      [['E'], 'Episodes'], [['S'], 'Servers'], [['Esc'], 'Back to the title page'],
    ],
  },
  { title: 'Episodes list', keys: [[['←', '→'], 'Previous / next season'], [['P'], 'Play / resume'], [['Shift', 'N'], 'Next episode (player)'], [['Shift', 'P'], 'Previous episode (player)'], [['Esc'], 'Close']] },
];

/** Global desktop shortcuts: ⌘K / Ctrl+K and "/" search, "g" + letter navigation, "?" help. */
export default function Hotkeys({ openSearch }: { openSearch?: () => void }) {
  const navigate = useNavigate();
  const [help, setHelp] = useState(false);
  hotkeysCtl.help = () => setHelp(true);
  // Without a search bar on the page (e.g. the player), search keys open Discover.
  const search = useRef<() => void>(() => {});
  search.current = openSearch ?? (() => navigate('/discover'));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setHelp(false);
        search.current();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
      if (e.key === '/') {
        e.preventDefault();
        search.current();
      } else if (e.key === '?') {
        e.preventDefault();
        setHelp((h) => !h);
      } else if (e.key === '[') {
        actions.updateSettings({ sidebarOpen: !getState().settings.sidebarOpen });
      } else if (e.key === 'Escape') {
        setHelp(false);
      } else if (e.key === 'g') {
        keyState.gAt = Date.now();
      } else if (keyState.gAt && Date.now() - keyState.gAt < 1200 && GO[e.key]) {
        e.preventDefault();
        navigate(GO[e.key].to);
        setTimeout(() => (keyState.gAt = 0));
      } else {
        keyState.gAt = 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  if (!help) return null;
  return (
    <Modal label="Keyboard shortcuts" onClose={() => setHelp(false)}>
    <div className="fixed inset-0 grid place-items-center bg-black/70 p-4" onClick={() => setHelp(false)}>
      <div className="toast-in max-h-[85dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-3xl border border-transparent bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center gap-3">
          <Keyboard className="size-5 text-muted" />
          <h2 className="flex-1 text-lg font-semibold">Keyboard shortcuts</h2>
          <button onClick={() => setHelp(false)} aria-label="Close" className={btn({ icon: true })}>
            <X className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="mb-2 text-sm text-muted">{s.title}</h3>
              <ul className="space-y-1.5">
                {s.keys.map(([keys, label]) => (
                  <li key={label + keys.join()} className="flex items-center justify-between gap-3 text-sm">
                    <span>{label}</span>
                    <span className="flex shrink-0 gap-1">
                      {keys.map((k) => (
                        <kbd key={k} className="min-w-6 rounded-md bg-raised px-1.5 py-0.5 text-center font-sans text-xs text-white/85 ring-1 ring-line">
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
    </Modal>
  );
}
