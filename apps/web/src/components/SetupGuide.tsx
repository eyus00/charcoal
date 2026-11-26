import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Download, ExternalLink, Puzzle, Sparkles } from 'lucide-react';
import { checkFebboxToken } from '@charcoal/providers';
import { Dialog } from './Modal';
import { btn } from './Button';
import { toast } from './Toast';
import { detectExtension, extensionFetcher, febboxTokenFromHelper } from '../lib/extension';
import { actions, getState, useStore } from '../lib/store';
import { cx } from '../lib/util';

const RELEASES = 'https://github.com/eyus00/charcoal/releases/latest';
const XPI = `${RELEASES}/download/charcoal-helper.xpi`;
const ZIP = `${RELEASES}/download/charcoal-helper.zip`;

export type Browser = 'firefox' | 'edge' | 'chromium' | 'unsupported';

/** Which install steps fit this browser. Phones, tablets and Safari can't run the helper. */
export function browserKind(): Browser {
  const ua = navigator.userAgent;
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (touch || /Android|iPhone|iPad|Mobile/i.test(ua)) return 'unsupported';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Chrome\//.test(ua)) return 'chromium';
  return 'unsupported';
}

/** Whether the setup should open by itself now (first play, in a browser that can use it). */
export function shouldOfferSetup() {
  const s = getState().settings;
  // Someone with a Febbox token saved has been through this already.
  return s.setup === 'new' && !s.febboxToken && browserKind() !== 'unsupported';
}

/**
 * The first-play setup: Charcoal Helper (more sources, from the viewer's own connection), then
 * their Febbox token (4K originals). Each step can be left; it can all be run again from Settings.
 */
export default function SetupGuide({ onClose }: { onClose: () => void }) {
  const browser = browserKind();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [never, setNever] = useState(false);
  // While on the first step, look for the helper every two seconds: installing it moves on by itself.
  const helper = useQuery({ queryKey: ['helper', 'setup'], queryFn: () => detectExtension(true), refetchInterval: step === 1 ? 2000 : false, retry: false, staleTime: 0 });
  const installed = !!helper.data;
  const allowed = !!helper.data?.hasPermission;
  const febbox = useStore((s) => s.settings.febboxToken);

  const finish = (how: 'done' | 'skip') => {
    if (how === 'done' || never) actions.updateSettings({ setup: how === 'done' ? 'done' : 'off' });
    onClose();
  };

  return (
    <Dialog
      title="Get the most out of Charcoal"
      subtitle={`Step ${step} of 3 · a couple of minutes, once`}
      onClose={() => finish('skip')}
      wide
      footer={
        <div className="flex flex-wrap items-center gap-3">
          {step < 3 && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted select-none">
              <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} className="size-4 accent-white" />
              Don’t show this again
            </label>
          )}
          <div className="ml-auto flex gap-2">
            {step < 3 && (
              <button type="button" onClick={() => (step === 1 && !installed ? finish('skip') : setStep((s) => (s + 1) as 2 | 3))} className={cx(btn(), 'h-10 px-4 text-sm')}>
                {step === 1 && !installed ? 'Skip for now' : 'Skip this step'}
              </button>
            )}
            {step === 1 && (
              <button type="button" disabled={!installed} onClick={() => setStep(2)} className={cx(btn({ variant: 'primary' }), 'h-10 px-5 text-sm disabled:opacity-40')}>
                Next
              </button>
            )}
            {step === 2 && (
              <button type="button" disabled={!febbox} onClick={() => setStep(3)} className={cx(btn({ variant: 'primary' }), 'h-10 px-5 text-sm disabled:opacity-40')}>
                Next
              </button>
            )}
            {step === 3 && (
              <button type="button" onClick={() => finish('done')} className={cx(btn({ variant: 'primary' }), 'h-10 px-5 text-sm')}>
                Start watching
              </button>
            )}
          </div>
        </div>
      }
    >
      <ol className="mb-5 flex gap-1.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <li key={n} className={cx('h-1 flex-1 rounded-full transition-colors', n <= step ? 'bg-white' : 'bg-white/15')} />
        ))}
      </ol>
      {step === 1 && <InstallStep browser={browser} installed={installed} allowed={allowed} version={helper.data?.version} />}
      {step === 2 && <FebboxStep />}
      {step === 3 && (
        <div className="py-4 text-center">
          <Sparkles className="mx-auto mb-3 size-8 text-white/80" />
          <p className="text-lg font-semibold">You’re set</p>
          <p className="mx-auto mt-1 max-w-sm text-body-sm text-muted">
            {installed ? 'Charcoal Helper is on' : 'You can add Charcoal Helper any time'}
            {febbox ? ', and Febbox will be tried first for the best quality.' : '.'} All of this is in Settings, with a button to run this again.
          </p>
        </div>
      )}
    </Dialog>
  );
}

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className={cx('flex items-center gap-2 rounded-2xl px-4 py-3 text-sm ring-1', ok ? 'bg-success/10 text-success ring-success/20' : 'bg-white/[0.04] text-muted ring-white/[0.06]')}>
      {ok ? <Check className="size-4 shrink-0" /> : <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-white/50" />}
      {children}
    </p>
  );
}

function InstallStep({ browser, installed, allowed, version }: { browser: Browser; installed: boolean; allowed: boolean; version?: string }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
          <Puzzle className="size-5" />
        </span>
        <div>
          <p className="font-medium">Install Charcoal Helper</p>
          <p className="text-body-sm text-muted">
            A small browser extension. Sources are then found and played from your own connection, so many more of them work and start faster. It only talks to Charcoal.
          </p>
        </div>
      </div>
      {browser === 'firefox' ? (
        <ol className="space-y-2.5 text-body-sm text-white/85">
          <li className="flex items-center gap-3">
            <Num n={1} />
            <span className="flex-1">Click below; Firefox asks to add it.</span>
            <a href={XPI} className={cx(btn({ variant: 'primary' }), 'h-9 px-4 text-sm')}>
              <Download className="size-4" /> Add to Firefox
            </a>
          </li>
          <li className="flex items-center gap-3">
            <Num n={2} />
            <span className="flex-1">Click the Charcoal Helper icon in the toolbar and choose “Allow access to streaming sites”.</span>
          </li>
        </ol>
      ) : (
        <ol className="space-y-2.5 text-body-sm text-white/85">
          <li className="flex items-center gap-3">
            <Num n={1} />
            <span className="flex-1">Download it and unzip it into a folder you’ll keep.</span>
            <a href={ZIP} className={cx(btn({ variant: 'primary' }), 'h-9 px-4 text-sm')}>
              <Download className="size-4" /> Download
            </a>
          </li>
          <li className="flex items-center gap-3">
            <Num n={2} />
            <span className="flex-1">
              Open <CopyText text={browser === 'edge' ? 'edge://extensions' : 'chrome://extensions'} /> in a new tab and turn on <b className="font-medium text-white">Developer mode</b>.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Num n={3} />
            <span className="flex-1">
              Click <b className="font-medium text-white">Load unpacked</b> and pick the unzipped folder. Then come back to this tab.
            </span>
          </li>
        </ol>
      )}
      {installed && browser === 'firefox' && !allowed ? (
        <Status ok={false}>Installed. Now allow it access to streaming sites (step 2).</Status>
      ) : (
        <Status ok={installed}>{installed ? `Charcoal Helper ${version ?? ''} is installed` : 'Waiting for Charcoal Helper… this moves on by itself once it’s installed'}</Status>
      )}
      <p className="text-xs text-faint">
        Problems? All versions are on{' '}
        <a href={RELEASES} target="_blank" rel="noreferrer" className="text-white/70 hover:text-white">
          the releases page
        </a>
        .
      </p>
    </div>
  );
}

function FebboxStep() {
  const saved = useStore((s) => s.settings.febboxToken);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(saved ? { ok: true, text: 'A Febbox token is saved.' } : null);
  const keep = async (raw: string) => {
    const token = raw.trim().replace(/^ui=/, '').replace(/;.*$/, '');
    if (!token) return;
    setMsg({ ok: true, text: 'Checking with Febbox…' });
    const r = await checkFebboxToken(extensionFetcher, token).catch(() => 'unknown' as const);
    if (r === 'invalid') return setMsg({ ok: false, text: 'Febbox didn’t accept that token. Sign in at febbox.com again and retry.' });
    actions.updateSettings({ febboxToken: token });
    setMsg({ ok: true, text: r === 'ok' ? 'Connected. Febbox accepted it.' : 'Saved (Febbox couldn’t be checked right now).' });
  };
  const grab = async () => {
    setBusy(true);
    try {
      const token = await febboxTokenFromHelper();
      if (!token) setMsg({ ok: false, text: 'You’re not signed in to Febbox in this browser yet. Sign in (button on the left), then try again.' });
      else await keep(token);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      setManual(true);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (saved && msg?.ok === false) setMsg({ ok: true, text: 'A Febbox token is saved.' });
  }, [saved, msg]);
  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">Connect Febbox (optional, recommended)</p>
        <p className="text-body-sm text-muted">Original Blu-ray files, often in 4K, from your own free Febbox account. The token stays in this browser and is only sent to febbox.com.</p>
      </div>
      <ol className="space-y-2.5 text-body-sm text-white/85">
        <li className="flex items-center gap-3">
          <Num n={1} />
          <span className="flex-1">Sign in at febbox.com (a separate Google account is safest).</span>
          <a href="https://www.febbox.com" target="_blank" rel="noreferrer" className={cx(btn(), 'h-9 px-4 text-sm')}>
            febbox.com <ExternalLink className="size-3.5" />
          </a>
        </li>
        <li className="flex items-center gap-3">
          <Num n={2} />
          <span className="flex-1">Come back, and let Charcoal Helper fetch your sign-in token.</span>
          <button type="button" onClick={grab} disabled={busy} className={cx(btn({ variant: 'primary' }), 'h-9 px-4 text-sm disabled:opacity-50')}>
            {busy ? 'Getting it…' : 'Get it from Febbox'}
          </button>
        </li>
      </ol>
      {msg && <Status ok={msg.ok && !/Checking/.test(msg.text)}>{msg.text}</Status>}
      {manual ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void keep(value);
          }}
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type="password"
            placeholder="Paste the “ui” cookie value"
            autoComplete="off"
            spellCheck={false}
            aria-label="Febbox token"
            className="h-10 min-w-0 flex-1 rounded-xl bg-raised px-3.5 text-sm placeholder:text-faint"
          />
          <button className={cx(btn(), 'h-10 px-4 text-sm')}>Save</button>
        </form>
      ) : (
        <button type="button" onClick={() => setManual(true)} className="text-xs text-faint hover:text-white">
          Paste the token yourself instead
        </button>
      )}
      {manual && <p className="text-xs text-faint">On febbox.com: DevTools → Application (Storage in Firefox) → Cookies → www.febbox.com → copy the value of “ui”.</p>}
    </div>
  );
}

const Num = ({ n }: { n: number }) => <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold tabular-nums">{n}</span>;

function CopyText({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard?.writeText(text).then(() => toast('Copied. Paste it into the address bar.'))}
      className="inline-flex items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white hover:bg-white/15"
    >
      {text} <Copy className="size-3" />
    </button>
  );
}
