import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, RefreshCw } from 'lucide-react';
import { btn } from '../components/Button';
import { ErrorBox } from '../components/Grid';
import { Empty, PageTitle } from '../components/PageHeader';
import { Pill, SectionHeader } from '../components/Row';
import { Bone } from '../components/Skeletons';
import { HOSTED_SERVER } from '../lib/servers';
import { useStore } from '../lib/store';
import { cx, useTitle } from '../lib/util';

// ---------- what the server says (the fields this page reads) ----------

interface Health {
  provider: string;
  runtime: string;
  status: string;
  reliability: number;
  hitRate: number;
  averageMs?: number;
  ok: number;
  empty: number;
  failed: number;
  benchedForSeconds: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailure?: { code: string; label: string; message?: string; host?: string; redirectedTo?: string };
  placement?: string;
  verified: number;
  unverified: number;
}
interface HealthAnswer {
  generatedAt: string;
  runtime: string;
  egress: string;
  features: string[];
  browser?: { state: string; version?: string; crashes?: number; served?: number; challenges?: number };
  providers: Health[];
  fleet: Health[];
  placement: { provider: string; verdict: string; worksOn: string[]; blockedOn: string[]; unreachableOn: string[]; brokenOn: string[] }[];
  proposals: { provider: string; role: string; from: string; to: string }[];
}
interface AdminProvider {
  id: string;
  name: string;
  version: string;
  stage: 'stable' | 'canary' | 'disabled';
  rank: number;
  runtimes: string[];
  domains?: { roles: Record<string, { active: string; alternates?: string[] }> };
}
interface Diagnosis {
  origin: string;
  role?: string;
  position?: string;
  verdict: string;
  summary: string;
  dns: { status: string };
  http?: { status?: number; ms: number; redirectedTo?: string };
}
interface Audit {
  at: string;
  by: string;
  provider: string;
  action: string;
  detail?: Record<string, unknown>;
}

const TOKEN_KEY = 'charcoal:admin-token';
const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};

async function ask<T>(base: string, path: string, token?: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (res.status === 401) throw new Error('The admin token was refused');
  if (res.status === 404 && path.startsWith('/v2/admin')) throw new Error('This server has no control plane (ADMIN_TOKEN is not set on it)');
  if (!res.ok) throw new Error(`The server answered ${res.status}`);
  return (await res.json()) as T;
}

const TONE: Record<string, string> = {
  healthy: 'bg-success/15 text-success',
  works: 'bg-success/15 text-success',
  ok: 'bg-success/15 text-success',
  stable: 'bg-success/15 text-success',
  degraded: 'bg-warning/15 text-warning',
  'works-elsewhere': 'bg-warning/15 text-warning',
  canary: 'bg-warning/15 text-warning',
  resting: 'bg-warning/15 text-warning',
  down: 'bg-danger/15 text-danger',
  broken: 'bg-danger/15 text-danger',
  blocked: 'bg-danger/15 text-danger',
  unreachable: 'bg-danger/15 text-danger',
  disabled: 'bg-white/10 text-white/60',
};
const Tag = ({ children }: { children: string }) => (
  <span className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-micro font-semibold tracking-wide whitespace-nowrap uppercase', TONE[children] ?? 'bg-white/10 text-white/70')}>{children.replace(/-/g, ' ')}</span>
);
const ago = (iso?: string) => {
  if (!iso) return 'never';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
};
const pct = (n: number) => `${Math.round(n * 100)}%`;
/** Worst first: what needs looking at is at the top. */
const RANK: Record<string, number> = { broken: 0, blocked: 1, unreachable: 2, 'works-elsewhere': 3, unknown: 4, works: 5 };
type Filter = 'all' | 'trouble' | 'working';

/**
 * Status of a server's sources, for whoever runs it: which providers work, which are refused or
 * unreachable and why, how often streams verify, the browser worker, and proposed address
 * changes. With the server's admin token: stages, addresses (checked on demand), a recovery run
 * and the audit log. The token is kept for this tab only and sent to that server alone.
 */
export default function Admin() {
  useTitle('Status');
  const own = useStore((s) => s.settings.serverUrl);
  const [base, setBase] = useState(own || HOSTED_SERVER);
  const [draft, setDraft] = useState(base);
  const [token, setToken] = useState(readToken);
  const [filter, setFilter] = useState<Filter>('all');
  const client = useQueryClient();

  const health = useQuery({ queryKey: ['admin-health', base], queryFn: () => ask<HealthAnswer>(base, '/v2/health'), refetchInterval: 30_000, staleTime: 10_000, retry: false });
  const admin = useQuery({ queryKey: ['admin-providers', base, token], queryFn: () => ask<{ registryVersion: number; problems: string[]; providers: AdminProvider[] }>(base, '/v2/admin/providers', token), enabled: !!token, retry: false, staleTime: 30_000 });
  const audit = useQuery({ queryKey: ['admin-audit', base, token], queryFn: () => ask<{ audit: Audit[] }>(base, '/v2/admin/audit?limit=30', token), enabled: !!token && admin.isSuccess, retry: false });
  const recover = useMutation({ mutationFn: () => ask<{ actions: unknown[] }>(base, '/v2/admin/recover', token, { method: 'POST', body: JSON.stringify({ by: 'dashboard' }) }), onSettled: () => client.invalidateQueries({ queryKey: ['admin-health'] }) });
  const refresh = () => client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('admin-') });

  const rows = useMemo(() => {
    const h = health.data;
    if (!h) return [];
    const ids = [...new Set([...h.providers.map((p) => p.provider), ...h.fleet.map((p) => p.provider), ...(admin.data?.providers.map((p) => p.id) ?? [])])];
    return ids
      .map((id) => ({
        id,
        here: h.providers.find((p) => p.provider === id),
        fleet: h.fleet.filter((p) => p.provider === id),
        verdict: h.placement.find((p) => p.provider === id)?.verdict ?? 'unknown',
        admin: admin.data?.providers.find((p) => p.id === id),
      }))
      .sort((a, b) => (RANK[a.verdict] ?? 4) - (RANK[b.verdict] ?? 4) || a.id.localeCompare(b.id));
  }, [health.data, admin.data]);
  const count = (v: string[]) => rows.filter((r) => v.includes(r.verdict)).length;
  const shown = rows.filter((r) => (filter === 'all' ? true : filter === 'working' ? ['works', 'works-elsewhere'].includes(r.verdict) : ['broken', 'blocked', 'unreachable'].includes(r.verdict)));

  const saveToken = (value: string) => {
    setToken(value);
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, value);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* kept for this page only */
    }
  };

  return (
    <div className="space-y-10 pb-10">
      <div>
        <PageTitle
          title="Status"
          body="How a server’s sources are doing: what works, what is refused or unreachable and why. Refreshed every half minute."
          action={
            <button type="button" onClick={refresh} className={btn()}>
              <RefreshCw className={cx('size-4', health.isFetching && 'animate-spin')} strokeWidth={1.5} /> Refresh
            </button>
          }
        />
        <form
          className="grid gap-3 rounded-2xl bg-surface p-4 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            setBase(draft.trim().replace(/\/+$/, '') || HOSTED_SERVER);
          }}
        >
          <label className="text-xs text-muted">
            Server
            <input value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} className="mt-1 block h-10 w-full rounded-xl bg-bg px-3 text-sm text-white outline-none ring-1 ring-white/10 focus-visible:ring-2 focus-visible:ring-accent" />
          </label>
          <label className="text-xs text-muted">
            Admin token (optional; this tab only)
            <input type="password" value={token} onChange={(e) => saveToken(e.target.value.trim())} autoComplete="off" placeholder="ADMIN_TOKEN of that server" className="mt-1 block h-10 w-full rounded-xl bg-bg px-3 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-faint focus-visible:ring-2 focus-visible:ring-accent" />
          </label>
          <button type="submit" className={cx(btn({ variant: 'primary' }), 'self-end')}>
            Check
          </button>
        </form>
        {token && admin.error && <p className="mt-3 text-sm text-warning">{admin.error.message}. The public status below still applies.</p>}
      </div>

      {health.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <Bone key={i} className="h-24 rounded-2xl!" />
          ))}
        </div>
      ) : health.error || !health.data ? (
        <ErrorBox onRetry={() => health.refetch()} message={`Couldn’t read ${base}/v2/health: ${health.error?.message ?? 'no answer'}. Check the address, and that the server allows this site (CORS_ORIGIN).`} />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="admin-summary">
            <Stat label="Working" value={count(['works', 'works-elsewhere'])} note={`of ${rows.length} providers${count(['works-elsewhere']) ? `; ${count(['works-elsewhere'])} only from viewers’ connections` : ''}`} tone="text-success" />
            <Stat label="In trouble" value={count(['broken', 'blocked', 'unreachable'])} note={`${count(['blocked'])} refused · ${count(['unreachable'])} unreachable · ${count(['broken'])} broken`} tone={count(['broken', 'blocked', 'unreachable']) ? 'text-danger' : undefined} />
            <Stat label="Streams verified" value={pct(ratio(health.data.providers.reduce((n, p) => n + p.verified, 0), health.data.providers.reduce((n, p) => n + p.verified + p.unverified, 0)))} note="of the streams this server tried" />
            <Stat label="Runs from" value={health.data.egress === 'user' ? 'Home' : 'Data centre'} note={`${health.data.runtime} · ${health.data.browser ? `browser ${health.data.browser.state}` : 'no browser worker'} · read ${ago(health.data.generatedAt)}`} />
          </ul>

          {health.data.proposals.length > 0 && (
            <section>
              <SectionHeader title="Proposed address changes" />
              <ul className="space-y-2.5">
                {health.data.proposals.map((p) => (
                  <li key={p.provider + p.role} className="rounded-2xl bg-surface px-4 py-3 text-sm">
                    <span className="font-medium">{p.provider}</span> <span className="text-muted">({p.role})</span>: {p.from} → {p.to}
                    <span className="block text-caption text-faint">Monitoring found the active address down and this alternate working. Apply or dismiss it with the control plane.</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <SectionHeader
              title="Providers"
              action={
                token && admin.isSuccess ? (
                  <button type="button" onClick={() => recover.mutate()} disabled={recover.isPending} className={btn()}>
                    {recover.isPending ? 'Checking every provider…' : 'Run a recovery check now'}
                  </button>
                ) : undefined
              }
            />
            <div className="mb-5 flex gap-2.5" role="group" aria-label="Show">
              {(['all', 'trouble', 'working'] as const).map((f) => (
                <Pill key={f} on={filter === f} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f === 'trouble' ? 'In trouble' : 'Working'}
                </Pill>
              ))}
            </div>
            {recover.error && <p className="mb-3 text-sm text-warning">{recover.error.message}</p>}
            {!shown.length ? (
              <Empty icon={Activity} title="Nothing to show" body={rows.length ? 'No provider is in this state.' : 'This server has not run any provider yet. Its first searches (or its scheduled monitoring) fill this in.'} />
            ) : (
              <ul className="space-y-2.5" data-testid="admin-providers">
                {shown.map((r) => (
                  <ProviderRow key={r.id} row={r} base={base} token={admin.isSuccess ? token : ''} />
                ))}
              </ul>
            )}
          </section>

          {audit.data && audit.data.audit.length > 0 && (
            <section>
              <SectionHeader title="Recent changes" />
              <ul className="divide-y divide-white/[0.06] rounded-2xl bg-surface text-sm">
                {audit.data.audit.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2.5">
                    <span className="w-24 shrink-0 text-caption text-faint tabular-nums">{ago(a.at)}</span>
                    <span className="font-medium">{a.provider}</span>
                    <span className="text-muted">{a.action.replace(/-/g, ' ')}</span>
                    <span className="min-w-0 flex-1 truncate text-caption text-faint">{a.detail ? JSON.stringify(a.detail) : ''}</span>
                    <span className="text-caption text-faint">by {a.by}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

function Stat({ label, value, note, tone }: { label: string; value: string | number; note: string; tone?: string }) {
  return (
    <li className="rounded-2xl bg-surface p-4">
      <p className="text-micro font-semibold tracking-wider text-muted uppercase">{label}</p>
      <p className={cx('mt-1 text-3xl font-semibold tracking-tight tabular-nums', tone)}>{value}</p>
      <p className="mt-1 text-caption text-pretty text-faint">{note}</p>
    </li>
  );
}

function ProviderRow({ row: r, base, token }: { row: { id: string; here?: Health; fleet: Health[]; verdict: string; admin?: AdminProvider }; base: string; token: string }) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const h = r.here;
  const diagnosis = useQuery({ queryKey: ['admin-diagnose', base, r.id], queryFn: () => ask<{ addresses: Diagnosis[] }>(base, `/v2/admin/providers/${encodeURIComponent(r.id)}/diagnose`, token), enabled: false, retry: false });
  const stage = useMutation({
    mutationFn: (to: string) => ask(base, `/v2/admin/providers/${encodeURIComponent(r.id)}`, token, { method: 'POST', body: JSON.stringify({ stage: to, by: 'dashboard', reason: 'set from the status page' }) }),
    onSettled: () => client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('admin-') }),
  });
  const viewers = r.fleet.reduce((n, f) => n + f.ok + f.empty + f.failed, 0);
  const viewersOk = r.fleet.reduce((n, f) => n + f.ok, 0);
  return (
    <li className="rounded-2xl bg-surface" data-provider={r.id}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left">
        <span className="min-w-0 flex-1 basis-40">
          <span className="block truncate text-body-sm font-medium">{r.admin?.name ?? r.id}</span>
          <span className="block truncate text-caption text-muted">{h?.lastFailure && r.verdict !== 'works' ? `${h.lastFailure.label}${h.lastFailure.host ? ` · ${h.lastFailure.host}` : ''}` : h ? `Last worked ${ago(h.lastSuccessAt)}` : 'Not run on this server yet'}</span>
        </span>
        <Tag>{r.verdict}</Tag>
        {r.admin && <Tag>{r.admin.stage}</Tag>}
        <span className="w-28 text-right text-caption text-muted tabular-nums max-sm:hidden">{h ? `${pct(h.reliability)} answer · ${h.averageMs ? `${(h.averageMs / 1000).toFixed(1)} s` : '–'}` : ''}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-white/[0.06] px-4 py-3 text-sm">
          {h ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-caption sm:grid-cols-4">
              <Fact k="Runs here" v={`${h.ok} with streams · ${h.empty} empty · ${h.failed} failed`} />
              <Fact k="Finds something" v={pct(h.hitRate)} />
              <Fact k="Streams verified" v={`${h.verified} of ${h.verified + h.unverified}`} />
              <Fact k="Resting" v={h.benchedForSeconds ? `${Math.ceil(h.benchedForSeconds / 60)} min more` : 'no'} />
              <Fact k="Last success" v={ago(h.lastSuccessAt)} />
              <Fact k="Last failure" v={ago(h.lastFailureAt)} />
              <Fact k="From viewers" v={viewers ? `${viewersOk} of ${viewers} runs found streams` : 'no reports'} />
              <Fact k="Version" v={r.admin?.version ?? '–'} />
            </dl>
          ) : (
            <p className="text-muted">No run recorded on this server.{viewers ? ` Viewers reported ${viewersOk} of ${viewers} runs with streams.` : ''}</p>
          )}
          {h?.lastFailure && (
            <p className="rounded-xl bg-bg px-3 py-2 text-caption text-pretty text-muted">
              <span className="font-medium text-white/85">{h.lastFailure.label}</span> ({h.lastFailure.code}){h.lastFailure.host ? ` at ${h.lastFailure.host}` : ''}
              {h.lastFailure.redirectedTo ? `, redirected to ${h.lastFailure.redirectedTo}` : ''}
              {h.lastFailure.message ? `: ${h.lastFailure.message}` : ''}
            </p>
          )}
          {r.admin?.domains && (
            <p className="text-caption text-muted">
              Addresses:{' '}
              {Object.entries(r.admin.domains.roles)
                .map(([role, d]) => `${role} ${d.active}${d.alternates?.length ? ` (+${d.alternates.length} alternate${d.alternates.length > 1 ? 's' : ''})` : ''}`)
                .join(' · ')}
            </p>
          )}
          {token && r.admin && (
            <div className="flex flex-wrap items-center gap-2">
              {r.admin.domains && (
                <button type="button" onClick={() => diagnosis.refetch()} disabled={diagnosis.isFetching} className={btn()}>
                  {diagnosis.isFetching ? 'Checking addresses…' : 'Check its addresses'}
                </button>
              )}
              {(['stable', 'canary', 'disabled'] as const)
                .filter((s) => s !== r.admin!.stage)
                .map((s) => (
                  <button key={s} type="button" onClick={() => stage.mutate(s)} disabled={stage.isPending} className={btn()}>
                    {s === 'disabled' ? 'Disable' : `Make ${s}`}
                  </button>
                ))}
              {(stage.error || diagnosis.error) && <span className="text-caption text-warning">{(stage.error ?? diagnosis.error)!.message}</span>}
            </div>
          )}
          {diagnosis.data && (
            <ul className="space-y-1.5" data-testid="admin-diagnosis">
              {diagnosis.data.addresses.map((d) => (
                <li key={d.origin + d.role} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-bg px-3 py-2 text-caption">
                  <Tag>{d.verdict === 'ok' ? 'ok' : 'down'}</Tag>
                  <span className="font-medium text-white/85">{d.origin}</span>
                  <span className="text-faint">{[d.role, d.position].filter(Boolean).join(' · ')}</span>
                  <span className="min-w-0 flex-1 text-pretty text-muted">{d.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div>
    <dt className="text-faint">{k}</dt>
    <dd className="text-white/85 tabular-nums">{v}</dd>
  </div>
);
