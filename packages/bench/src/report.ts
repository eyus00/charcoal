/** Benchmark reports as Markdown: one run, or two runs side by side. */
import { FAILURES, type FailureCode } from '@charcoal/provider-sdk';
import type { BenchReport, Summary } from './run.js';
import { CATEGORIES } from './titles.js';

const CATEGORY_NAMES: Record<string, string> = { 'western-movie': 'Western films', 'western-tv': 'Western television', anime: 'Anime', indian: 'Indian cinema and TV', international: 'Other languages' };
const label = (code: string) => (code in FAILURES ? FAILURES[code as FailureCode].label : code === 'LEGACY' ? 'Failed (the older API gives only a message)' : code);
const ms = (n?: number) => (n === undefined ? '–' : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);
const table = (head: string[], rows: (string | number)[][]) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

function banner(r: BenchReport): string {
  const kind = r.mode === 'live' ? '**LIVE** (real sites over the network)' : '**FIXTURES** (canned responses: this says nothing about real availability)';
  return [
    `- Run: \`${r.label}\`, ${kind}`,
    `- Target: ${r.target.label} (${r.target.kind}${r.target.kind === 'engine' ? `, providers ran from a ${r.target.egress === 'user' ? 'home' : 'data-centre'} address` : ''})`,
    `- Streams tried from: a ${r.checkedFrom.egress === 'user' ? 'home' : 'data-centre'} address${r.checkedFrom.note ? ` (${r.checkedFrom.note})` : ''}`,
    `- Playback in a browser: ${r.playbackChecked ? 'checked' : 'not checked'}`,
    `- When: ${r.startedAt} to ${r.finishedAt}${r.commit ? `, commit \`${r.commit}\`` : ''}`,
  ].join('\n');
}

function summaryRows(s: Summary, playback: boolean): (string | number)[][] {
  return [
    ['Titles', s.titles],
    ['Providers registered', s.providersRegistered],
    ['Providers that got an answer from their site at least once', s.providersRegistered - s.providersNeverResponding],
    ['Providers that returned a stream at least once', s.providersEverReturning],
    ['Streams discovered (every provider, with duplicates)', s.discovered],
    ['Unique streams', s.unique],
    ['Unique streams verified (manifest and first media bytes)', s.verified],
    ['Streams that started in a browser player', playback ? `${s.started} of ${s.playbackTried} tried` : 'not checked'],
    ...(playback && s.undecodable ? [['Verified streams the test browser cannot decode (not tried)', s.undecodable] as (string | number)[]] : []),
    ['Titles with at least one stream', `${s.titlesWithAnyStream} of ${s.titles}`],
    ['Titles with at least one verified stream', `${s.titlesWithVerified} of ${s.titles}`],
    ['Titles with a stream that started', playback ? `${s.titlesWithPlayback} of ${s.titles}` : 'not checked'],
    ['Mean provider response time', ms(s.meanProviderMs)],
    ['Median time to first result', ms(s.medianFirstResultMs)],
    ['Median time to first verified stream', ms(s.medianFirstVerifiedMs)],
  ];
}

export function renderReport(r: BenchReport): string {
  const s = r.summary;
  const out: string[] = [`# Source availability: ${r.label}`, '', banner(r), '', '## Summary', '', table(['Measure', 'Value'], summaryRows(s, r.playbackChecked)), ''];

  out.push('## By category', '');
  out.push(
    table(
      ['Category', 'Titles', 'With a verified stream', 'With playback started', 'Unique streams', 'Verified', 'Started'],
      CATEGORIES.filter((c) => s.byCategory[c]).map((c) => {
        const b = s.byCategory[c];
        return [CATEGORY_NAMES[c], b.titles, b.withVerified, r.playbackChecked ? b.withPlayback : '–', b.unique, b.verified, r.playbackChecked ? b.started : '–'];
      }),
    ),
    '',
  );

  const failures = Object.entries(s.failures).sort((a, b) => b[1] - a[1]);
  out.push('## Why providers failed', '');
  out.push(failures.length ? table(['Failure', 'Provider runs', 'Meaning'], failures.map(([code, n]) => [`\`${code}\``, n, label(code)])) : 'No provider run failed.', '');

  out.push('## By provider', '');
  out.push(
    table(
      ['Provider', 'Found', 'Not there', 'Failed', 'Skipped', 'Streams', 'Verified', 'Started', 'Mean time', 'Main failure'],
      Object.entries(s.byProvider)
        .sort((a, b) => b[1].verified - a[1].verified || b[1].ok - a[1].ok || a[0].localeCompare(b[0]))
        .map(([id, b]) => {
          const top = Object.entries(b.codes).sort((x, y) => y[1] - x[1])[0];
          return [`${b.name} (\`${id}\`)`, b.ok, b.empty, b.error, b.skipped, b.streams, b.verified, r.playbackChecked ? b.started : '–', ms(b.meanMs), top ? `\`${top[0]}\` ×${top[1]}` : ''];
        }),
    ),
    '',
  );

  out.push('## By title', '');
  out.push(
    table(
      ['Title', 'Category', 'Lang', 'Year', 'Queried', 'Responding', 'With results', 'Unique', 'Verified', 'Started', 'First result', 'First verified', 'Failures'],
      r.titles.map((t) => [
        t.key,
        CATEGORY_NAMES[t.category],
        t.language,
        t.year,
        t.providersQueried,
        t.providersResponding,
        t.providersWithResults,
        t.unique,
        t.verified,
        r.playbackChecked ? `${t.started}/${t.playbackTried}` : '–',
        ms(t.firstResultMs),
        ms(t.firstVerifiedMs),
        Object.entries(t.failures)
          .sort((a, b) => b[1] - a[1])
          .map(([c, n]) => `${c}×${n}`)
          .join(' ') || (t.error ? `request failed: ${t.error}` : ''),
      ]),
    ),
    '',
  );

  const bad = r.titles.flatMap((t) => t.streams.filter((x) => x.verification.state === 'failed').map((x) => ({ t: t.key, ...x })));
  if (bad.length) {
    const byReason: Record<string, number> = {};
    for (const b of bad) byReason[`${b.provider}: ${b.verification.code} (${b.verification.message ?? ''})`.replace(/\([^()]*\.[a-z]{2,}[^()]*\)/g, '(host)')] = (byReason[`${b.provider}: ${b.verification.code} (${b.verification.message ?? ''})`.replace(/\([^()]*\.[a-z]{2,}[^()]*\)/g, '(host)')] ?? 0) + 1;
    out.push('## Discovered streams that did not verify', '', table(['Provider and reason', 'Streams'], Object.entries(byReason).sort((a, b) => b[1] - a[1]).slice(0, 25)), '');
  }
  const failed = r.titles.flatMap((t) => t.streams.filter((x) => x.playback && !x.playback.started && !x.playback.undecodable).map((x) => [t.key, x.provider, x.type, x.playback!.error ?? '']));
  if (failed.length) out.push('## Verified streams that did not start in the player', '', table(['Title', 'Provider', 'Type', 'Why'], failed.slice(0, 40)), '');
  return out.join('\n');
}

const delta = (a: number, b: number) => (b === a ? '=' : b > a ? `+${b - a}` : `${b - a}`);

/** Two runs side by side. `before` and `after` should use the same titles. */
export function renderComparison(before: BenchReport, after: BenchReport): string {
  const a = before.summary;
  const b = after.summary;
  const pb = before.playbackChecked && after.playbackChecked;
  const out: string[] = [`# Source availability: ${before.label} → ${after.label}`, '', '**Before**', '', banner(before), '', '**After**', '', banner(after), ''];
  if (before.mode !== after.mode) out.push('> The two runs are of different kinds (live and fixtures); the numbers are not comparable.', '');
  out.push(
    '## Summary',
    '',
    table(
      ['Measure', 'Before', 'After', 'Change'],
      [
        ['Providers registered', a.providersRegistered, b.providersRegistered, delta(a.providersRegistered, b.providersRegistered)],
        ['Providers that got an answer from their site', a.providersRegistered - a.providersNeverResponding, b.providersRegistered - b.providersNeverResponding, delta(a.providersRegistered - a.providersNeverResponding, b.providersRegistered - b.providersNeverResponding)],
        ['Providers that returned a stream', a.providersEverReturning, b.providersEverReturning, delta(a.providersEverReturning, b.providersEverReturning)],
        ['Unique streams', a.unique, b.unique, delta(a.unique, b.unique)],
        ['Unique streams verified', a.verified, b.verified, delta(a.verified, b.verified)],
        ['Streams started in a browser player', pb ? a.started : '–', pb ? b.started : '–', pb ? delta(a.started, b.started) : '–'],
        ['Titles with a verified stream', `${a.titlesWithVerified}/${a.titles}`, `${b.titlesWithVerified}/${b.titles}`, delta(a.titlesWithVerified, b.titlesWithVerified)],
        ['Titles with playback started', pb ? `${a.titlesWithPlayback}/${a.titles}` : '–', pb ? `${b.titlesWithPlayback}/${b.titles}` : '–', pb ? delta(a.titlesWithPlayback, b.titlesWithPlayback) : '–'],
        ['Median time to first result', ms(a.medianFirstResultMs), ms(b.medianFirstResultMs), ''],
        ['Median time to first verified stream', ms(a.medianFirstVerifiedMs), ms(b.medianFirstVerifiedMs), ''],
      ],
    ),
    '',
    '## By category (titles with a verified stream)',
    '',
    table(
      ['Category', 'Titles', 'Before', 'After', 'Verified streams before', 'Verified streams after'],
      CATEGORIES.filter((c) => a.byCategory[c] || b.byCategory[c]).map((c) => [CATEGORY_NAMES[c], (b.byCategory[c] ?? a.byCategory[c]).titles, a.byCategory[c]?.withVerified ?? '–', b.byCategory[c]?.withVerified ?? '–', a.byCategory[c]?.verified ?? '–', b.byCategory[c]?.verified ?? '–']),
    ),
    '',
    '## By title (unique → verified' + (pb ? ' → started' : '') + ')',
    '',
    table(
      ['Title', 'Before', 'After'],
      after.titles.map((t) => {
        const o = before.titles.find((x) => x.key === t.key);
        const cell = (x?: typeof t) => (x ? `${x.unique} → ${x.verified}${pb ? ` → ${x.started}` : ''}` : '–');
        return [t.key, cell(o), cell(t)];
      }),
    ),
    '',
    '## Failures',
    '',
    table(
      ['Failure', 'Before', 'After'],
      [...new Set([...Object.keys(a.failures), ...Object.keys(b.failures)])].sort().map((c) => [`\`${c}\``, a.failures[c] ?? 0, b.failures[c] ?? 0]),
    ),
    '',
  );
  return out.join('\n');
}

const BLOCKED = new Set(['CHALLENGE', 'ACCESS_DENIED']);
const UNREACHABLE = new Set(['DNS', 'CONNECT', 'TLS', 'TIMEOUT', 'NETWORK', 'REDIRECTED']);
const BROKEN = new Set(['STRUCTURE_CHANGED', 'SELECTOR_MISSING', 'INVALID_RESULT']);

/** What one run says about one provider, in a few words. */
function cell(b: Summary['byProvider'][string] | undefined, titles: number): string {
  if (!b) return '–';
  if (b.ok) return `**works**: streams for ${b.ok}/${titles}, ${b.verified} verified`;
  const top = Object.entries(b.codes).sort((x, y) => y[1] - x[1])[0]?.[0];
  if (top) {
    const kind = BLOCKED.has(top) ? 'refused here' : UNREACHABLE.has(top) ? 'unreachable' : BROKEN.has(top) ? 'needs updating' : top === 'LEGACY' ? 'failed (no detail)' : 'failed';
    return `${kind} (\`${top}\`)`;
  }
  if (b.empty) return 'answers, had none of the titles';
  if (b.skipped) return 'not run here';
  return '–';
}

/**
 * One row per provider, one column per run: the same providers seen from different places (a
 * hosted server, a cloud machine, a home connection). A provider that is refused in one column and
 * works in another is not broken; it has to run where it works.
 */
export function renderMatrix(reports: BenchReport[]): string {
  const ids = [...new Set(reports.flatMap((r) => Object.keys(r.summary.byProvider)))].sort();
  const name = (id: string) => reports.map((r) => r.summary.byProvider[id]?.name).find(Boolean) ?? id;
  const head = ['Provider', ...reports.map((r) => `${r.label}${r.mode === 'fixtures' ? ' (FIXTURES)' : ''}`)];
  const out = ['# Providers by where they ran', '', ...reports.map((r) => `**${r.label}**\n\n${banner(r)}\n`), table(head, ids.map((id) => [`${name(id)} (\`${id}\`)`, ...reports.map((r) => cell(r.summary.byProvider[id], r.summary.titles))])), ''];
  out.push(
    '## Totals',
    '',
    table(
      ['Run', 'Providers that returned a stream', 'Unique streams', 'Verified', 'Titles with a verified stream'],
      reports.map((r) => [r.label, r.summary.providersEverReturning, r.summary.unique, r.summary.verified, `${r.summary.titlesWithVerified}/${r.summary.titles}`]),
    ),
    '',
  );
  return out.join('\n');
}
