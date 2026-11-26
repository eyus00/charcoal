import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Copy, Download, ExternalLink, KeyRound, Puzzle, RefreshCw, Sparkles } from 'lucide-react';
import { checkFebboxToken } from '@charcoal/providers';
import { Dialog } from './Modal';
import { btn } from './Button';
import { toast } from './Toast';
import { detectExtension, extensionFetcher, findFebboxToken, LATEST_HELPER, olderThan } from '../lib/extension';
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
  const outdated = installed && olderThan(helper.data!.version, LATEST_HELPER);
  // Installed, allowed and up to date: on to Febbox by itself, once (going Back stays on step 1).
  const advanced = useRef(false);
  const ready = step === 1 && installed && (allowed || browser !== 'firefox') && !outdated;
  useEffect(() => {
    if (!ready || advanced.current) return;
    const t = window.setTimeout(() => {
      advanced.current = true;
      setStep(2);
    }, 900);
    return () => window.clearTimeout(t);
  }, [ready]);

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
            {step > 1 && (
              <button type="button" onClick={() => setStep((s) => (s - 1) as 1 | 2)} className={cx(btn({ variant: 'ghost' }), 'h-10 px-3.5 text-sm')}>
                <ArrowLeft className="size-4" /> Back
              </button>
            )}
            {/* One way on at a time: Next once a step is done; until then, a way to leave it for later. */}
            {step === 1 && !installed && (
              <button type="button" onClick={() => finish('skip')} className={cx(btn(), 'h-10 px-4 text-sm')}>
                Skip for now
              </button>
            )}
            {step === 1 && installed && !ready && (
              <button type="button" onClick={() => setStep(2)} className={cx(btn(), 'h-10 px-4 text-sm')}>
                Not now
              </button>
            )}
            {step === 1 && ready && (
              <button type="button" onClick={() => setStep(2)} className={cx(btn({ variant: 'primary' }), 'h-10 px-5 text-sm')}>
                Next
              </button>
            )}
            {step === 2 && !febbox && (
              <button type="button" onClick={() => setStep(3)} className={cx(btn(), 'h-10 px-4 text-sm')}>
                Skip this step
              </button>
            )}
            {step === 2 && febbox && (
              <button type="button" onClick={() => setStep(3)} className={cx(btn({ variant: 'primary' }), 'h-10 px-5 text-sm')}>
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
      {step === 1 && <InstallStep browser={browser} installed={installed} allowed={allowed} version={helper.data?.version} outdated={outdated} />}
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

function Status({ ok, pending, children }: { ok: boolean; pending?: boolean; children: React.ReactNode }) {
  return (
    <p className={cx('flex items-center gap-2 rounded-2xl px-4 py-3 text-sm ring-1', ok ? 'bg-success/10 text-success ring-success/20' : 'bg-white/[0.04] text-muted ring-white/[0.06]')}>
      {ok ? (
        <Check className="size-4 shrink-0" />
      ) : pending ? (
        <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-white/50" />
      ) : (
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning" />
      )}
      {children}
    </p>
  );
}

function InstallStep({ browser, installed, allowed, version, outdated }: { browser: Browser; installed: boolean; allowed: boolean; version?: string; outdated: boolean }) {
  // Installed already: only what's left to do (update it, or allow its site access), or that it's done.
  if (installed)
    return (
      <div className="space-y-4">
        <StepHead title={outdated ? 'Update Charcoal Helper' : 'Charcoal Helper'} body="The browser extension that finds and plays sources from your own connection." />
        {outdated ? (
          <UpdateNotice browser={browser} version={version ?? ''} />
        ) : browser === 'firefox' && !allowed ? (
          <>
            <Status ok={false}>Installed, but its site access is off.</Status>
            <p className="text-body-sm text-white/85">Click the Charcoal Helper icon in the toolbar and choose “Allow access to streaming sites”. This moves on by itself.</p>
          </>
        ) : (
          <Status ok>Charcoal Helper {version} is installed, the latest version</Status>
        )}
      </div>
    );
  return (
    <div className="space-y-4">
      <StepHead
        title="Install Charcoal Helper"
        body="A small browser extension. Sources are then found and played from your own connection, so many more of them work and start faster. It only talks to Charcoal."
      />
      {browser === 'firefox' ? (
        <ol className="space-y-2.5 text-body-sm text-white/85">
          <li className="flex items-center gap-3">
            <Num n={1} />
            <span className="flex-1">Click below; Firefox asks to add it.</span>
            <a href={XPI} className={cx(btn({ variant: 'primary' }), 'h-9 px-4 text-sm')}>
              <Download className="size-4" /> Add to Firefox
            </a>
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
      <Status ok={false} pending>
        Waiting for Charcoal Helper… this moves on by itself once it’s installed
      </Status>
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

function StepHead({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
        <Puzzle className="size-5" />
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-body-sm text-muted">{body}</p>
      </div>
    </div>
  );
}

/** An older Charcoal Helper than this page knows: what's new, and how to update in this browser. */
function UpdateNotice({ browser, version }: { browser: Browser; version: string }) {
  return (
    <div className="space-y-3 rounded-2xl bg-warning/10 p-4 ring-1 ring-warning/25">
      <p className="flex items-center gap-2 text-sm font-medium text-warning">
        <RefreshCw className="size-4 shrink-0" /> Charcoal Helper {version} is installed; {LATEST_HELPER} is out
      </p>
      <p className="text-body-sm text-white/80">
        {browser === 'firefox'
          ? 'Click Update: Firefox replaces it in place. Then come back to this tab.'
          : 'Download it, unzip it over the folder you loaded before (replace the files), then press the reload ↻ on Charcoal Helper in '}
        {browser !== 'firefox' && <CopyText text={browser === 'edge' ? 'edge://extensions' : 'chrome://extensions'} />}
        {browser !== 'firefox' && '. This tab notices by itself.'}
      </p>
      <a href={browser === 'firefox' ? XPI : ZIP} className={cx(btn({ variant: 'primary' }), 'h-9 px-4 text-sm')}>
        <Download className="size-4" /> {browser === 'firefox' ? 'Update' : `Download ${LATEST_HELPER}`}
      </a>
    </div>
  );
}

function FebboxStep() {
  const saved = useStore((s) => s.settings.febboxToken);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState('');
  const [where, setWhere] = useState(false);
  /** Connected, and the viewer asked to put in another token. */
  const [changing, setChanging] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(saved ? { ok: true, text: 'Febbox is connected.' } : null);
  const check = (token: string) => checkFebboxToken(extensionFetcher, token);
  const keep = async (raw: string) => {
    const token = raw.trim().replace(/^ui=/, '').replace(/;.*$/, '');
    if (!token) return;
    setBusy(true);
    setMsg({ ok: true, text: 'Checking with Febbox…' });
    const r = await check(token).catch(() => 'unknown' as const);
    setBusy(false);
    if (r === 'invalid') return setMsg({ ok: false, text: 'Febbox didn’t accept that token. Copy a fresh “ui” value after signing in again.' });
    actions.updateSettings({ febboxToken: token });
    setValue('');
    setChanging(false);
    setMsg({ ok: true, text: r === 'ok' ? 'Connected. Febbox accepted it.' : 'Saved (Febbox couldn’t be checked right now).' });
  };
  const grab = async () => {
    setBusy(true);
    setMsg({ ok: true, text: 'Looking for your Febbox sign-in…' });
    const found = await findFebboxToken(check);
    setBusy(false);
    if (found.status === 'ok' || found.status === 'unchecked') actions.updateSettings({ febboxToken: found.token });
    setMsg({ ok: found.status === 'ok' || found.status === 'unchecked', text: found.message });
  };
  useEffect(() => {
    if (saved && msg?.ok === false) setMsg({ ok: true, text: 'Febbox is connected.' });
  }, [saved, msg]);
  // Automatic: tried as soon as this step opens, and again each time the viewer comes back to this
  // tab (from signing in at febbox.com) until a token is saved. The button stays for a manual retry.
  const grabRef = useRef(grab);
  grabRef.current = grab;
  useEffect(() => {
    if (saved) return;
    void grabRef.current();
    const back = () => document.visibilityState === 'visible' && !getState().settings.febboxToken && void grabRef.current();
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [saved]);
  const pending = busy || /Checking|Looking/.test(msg?.text ?? '');
  const intro = (
    <div>
      <p className="font-medium">Connect Febbox (optional, recommended)</p>
      <p className="text-body-sm text-muted">Original Blu-ray files, often in 4K, from your own free Febbox account. The token stays in this browser and is only sent to febbox.com.</p>
    </div>
  );
  // Done: say so, and nothing else to press here but Next (or another token, if wanted).
  if (saved && !changing)
    return (
      <div className="space-y-4">
        {intro}
        <div className="flex items-center gap-3 rounded-2xl bg-success/10 px-4 py-3.5 ring-1 ring-success/20">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success/20 text-success">
            <Check className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-success">Febbox is connected</p>
            <p className="truncate text-xs text-white/60">
              {msg?.ok && !/is connected|Checking|Looking/.test(msg.text) ? `${msg.text} · ` : ''}token ••••{saved.slice(-4)}
            </p>
          </div>
          <button type="button" onClick={() => setChanging(true)} className="shrink-0 text-xs text-muted underline-offset-4 hover:text-white hover:underline">
            Use another token
          </button>
        </div>
      </div>
    );
  return (
    <div className="space-y-4">
      {intro}
      {/* Replacing a saved token: only the field below. */}
      {!saved && (
        <>
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
          <span className="flex-1">Come back to this tab: Charcoal Helper picks up your sign-in by itself.</span>
          <button type="button" onClick={() => void grab()} disabled={busy} className={cx(btn({ variant: 'primary' }), 'h-9 px-4 text-sm disabled:opacity-50')}>
            {busy ? 'Checking…' : 'Check again'}
          </button>
        </li>
      </ol>
      {msg && <Status ok={msg.ok && !pending} pending={pending}>{msg.text}</Status>}
        </>
      )}

      {/* Always here: the token typed in by hand, for when the helper can't read it. */}
      <form
        className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]"
        onSubmit={(e) => {
          e.preventDefault();
          void keep(value);
        }}
      >
        <label htmlFor="febbox-token" className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4 text-white/70" /> Or paste your token
        </label>
        <div className="mt-2.5 flex gap-2">
          <input
            id="febbox-token"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type="password"
            placeholder="The value of febbox.com’s “ui” cookie"
            autoComplete="off"
            spellCheck={false}
            className="h-11 min-w-0 flex-1 rounded-xl bg-black/30 px-3.5 text-sm ring-1 ring-white/10 transition placeholder:text-faint focus:ring-white/40 focus:outline-none"
          />
          <button disabled={!value.trim() || busy} className={cx(btn({ variant: 'primary' }), 'h-11 px-5 text-sm disabled:opacity-40')}>
            Save
          </button>
        </div>
        <div className="mt-2.5 flex gap-4">
          <button type="button" onClick={() => setWhere((w) => !w)} aria-expanded={where} className="text-xs text-muted underline-offset-4 hover:text-white hover:underline">
            Where do I find it?
          </button>
          {saved && (
            <button type="button" onClick={() => setChanging(false)} className="text-xs text-muted underline-offset-4 hover:text-white hover:underline">
              Keep the current token
            </button>
          )}
        </div>
        {where && (
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-white/70">
            <li>Open febbox.com, signed in.</li>
            <li>Open the developer tools: F12, or ⌥⌘I on a Mac.</li>
            <li>Application tab (Storage in Firefox) → Cookies → https://www.febbox.com.</li>
            <li>Copy the Value of the row named “ui” and paste it here.</li>
          </ol>
        )}
      </form>
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
