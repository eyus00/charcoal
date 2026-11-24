/**
 * Declarative providers. A rule pack describes an extraction as data: fetch these addresses,
 * pull these values out with a selector / path / pattern, emit these streams. The engine below
 * interprets it with the SDK's extraction modules.
 *
 * Because a rule pack is data, it can be published in the registry, versioned, rolled back and
 * updated without shipping any code, and running one never executes anything it brought along.
 * It runs under the same network policy, budgets and diagnostics as a code provider. Extraction
 * that needs real logic (custom decryption, multi-step sessions) stays a code provider.
 */
import { ProviderError, type FailureCode } from './errors.js';
import { attr as attrOf, parseHtml, textOf, type HtmlNode } from './extract/html.js';
import { extractMeta, findJsonLd, jsonPath, safeJsonParse } from './extract/json.js';
import { findIframes, findMediaUrls, parseHls, resolveUrl, sniffStreamType } from './extract/media.js';
import { expectOk } from './net.js';
import type { Caption, FetchResponse, Media, MediaKind, ProviderContext, ProviderManifest, ProviderModule, RawStream, StreamType } from './types.js';

export const RULES_SCHEMA = 1;

type When = { when?: MediaKind | MediaKind[] };

export interface FetchStep extends When {
  /** URL template, e.g. "{{domain.api}}/movie/{{media.ids.tmdb}}". */
  fetch: string;
  /** Variable the response is stored in. */
  as: string;
  method?: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  /** Statuses that mean "this title isn't here" (default 404 and 410). */
  notFoundOn?: number[];
  /** A failure of this request doesn't fail the provider; the variable is left empty. */
  optional?: boolean;
}

export interface ExtractStep extends When {
  extract: 'css' | 'xpath' | 'json' | 'regex' | 'jsonld' | 'meta' | 'iframes' | 'media' | 'hls';
  /** Variable to read (a response's body, or a value extracted earlier). */
  from: string;
  /** Selector, XPath, JSONPath, pattern, or meta key, depending on `extract`. */
  expr?: string;
  /** css: attribute to read instead of the text. */
  attr?: string;
  /** regex: capture group (default 1 when the pattern has one, else 0). */
  group?: number;
  /** Keep every match (a list) instead of the first. */
  all?: boolean;
  as: string;
  /** Finding nothing is a failure: the page no longer has what the rules expect. */
  required?: boolean;
}

export interface RequireStep extends When {
  /** Template; an empty result fails the run. */
  require: string;
  code?: FailureCode;
  message?: string;
}

export interface SetStep extends When {
  set: string;
  value: string;
}

export interface RenderStep extends When {
  /** URL template of a page to open in a browser (needs the `js-render` feature). */
  render: string;
  /** Variable the rendered document is stored in (usable by extract steps like a fetched page). */
  as: string;
  /** A CSS selector to wait for, or "media" to wait until the page asks for a playlist or file. */
  waitFor?: string;
  /** A CSS selector to click once the page is ready (a play button), before waiting for media. */
  click?: string;
  /** Variable that receives the list of media addresses the page asked for (playlists, manifests, files). */
  capture?: string;
  /** Variable that receives the list of caption addresses the page asked for. */
  captureCaptions?: string;
  timeoutMs?: number;
  optional?: boolean;
}

export type RuleStep = FetchStep | ExtractStep | RequireStep | SetStep | RenderStep;

export interface EmitRule extends When {
  /** A list variable to emit one stream per item of; inside, {{item}} is the current one. */
  each?: string;
  url: string;
  type?: StreamType | 'auto';
  quality?: string;
  language?: string;
  note?: string;
  headers?: Record<string, string>;
}

export interface CaptionRule extends When {
  each?: string;
  url: string;
  label: string;
  lang?: string;
}

export interface RulePack {
  schema: typeof RULES_SCHEMA;
  /** The provider this pack implements. */
  id: string;
  version: string;
  steps: RuleStep[];
  emit: EmitRule[];
  captions?: CaptionRule[];
}

const MAX_STEPS = 40;
const RESERVED = new Set(['media', 'domain', 'domainSetting', 'settings', 'item']);
const MAX_PATTERN = 400;
/** A group that repeats something that itself repeats: the classic way to make a regex take forever. */
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*[+*{]/;

const kinds = (w: When['when']) => (w === undefined ? undefined : Array.isArray(w) ? w : [w]);

/** Problems with a rule pack, as sentences. */
export function validateRulePack(pack: RulePack, manifest?: ProviderManifest): string[] {
  const e: string[] = [];
  if (!pack || typeof pack !== 'object') return ['rule pack is not an object'];
  if (pack.schema !== RULES_SCHEMA) e.push(`rule schema ${pack.schema} is not supported`);
  if (!pack.id) e.push('id is required');
  if (manifest && manifest.id !== pack.id) e.push(`rule pack is for "${pack.id}", manifest is "${manifest.id}"`);
  if (!Array.isArray(pack.steps) || !pack.steps.length) e.push('steps is empty');
  if ((pack.steps?.length ?? 0) > MAX_STEPS) e.push(`more than ${MAX_STEPS} steps`);
  if (!Array.isArray(pack.emit) || !pack.emit.length) e.push('emit is empty');
  const defined = new Set<string>();
  (pack.steps ?? []).forEach((s, i) => {
    const at = `step ${i + 1}:`;
    // These names always mean the title, the addresses, the settings and the current list item.
    for (const name of ['as' in s ? s.as : undefined, 'set' in s ? s.set : undefined, 'capture' in s ? s.capture : undefined, 'captureCaptions' in s ? s.captureCaptions : undefined]) {
      if (name && RESERVED.has(name)) e.push(`${at} "${name}" is a reserved name`);
    }
    if ('fetch' in s) {
      if (!s.as) e.push(`${at} fetch needs "as"`);
      if (!/^\{\{domain\.[a-z0-9_-]+\}\}|^https?:\/\//i.test(s.fetch)) e.push(`${at} fetch must start with a {{domain.role}} or an absolute URL`);
      for (const role of templateRoles(s.fetch)) if (manifest && !manifest.domainRoles.includes(role)) e.push(`${at} uses domain role "${role}", which the manifest doesn't declare`);
      defined.add(s.as);
    } else if ('extract' in s) {
      if (!s.as || !s.from) e.push(`${at} extract needs "from" and "as"`);
      if (s.from && !defined.has(s.from)) e.push(`${at} reads "${s.from}" before anything sets it`);
      if (['css', 'xpath', 'json', 'regex', 'meta'].includes(s.extract) && !s.expr) e.push(`${at} ${s.extract} needs "expr"`);
      if (s.extract === 'regex' && s.expr) {
        if (s.expr.length > MAX_PATTERN) e.push(`${at} pattern is longer than ${MAX_PATTERN} characters`);
        else if (NESTED_QUANTIFIER.test(s.expr)) e.push(`${at} pattern repeats a repeating group (can hang on crafted input)`);
        else
          try {
            new RegExp(s.expr);
          } catch {
            e.push(`${at} pattern doesn't compile`);
          }
      }
      defined.add(s.as);
    } else if ('set' in s) {
      if (!s.set) e.push(`${at} set needs a name`);
      defined.add(s.set);
    } else if ('render' in s) {
      if (!s.as) e.push(`${at} render needs "as"`);
      if (!/^\{\{domain\.[a-z0-9_-]+\}\}|^https?:\/\//i.test(s.render)) e.push(`${at} render must start with a {{domain.role}} or an absolute URL`);
      for (const role of templateRoles(s.render)) if (manifest && !manifest.domainRoles.includes(role)) e.push(`${at} uses domain role "${role}", which the manifest doesn't declare`);
      if (manifest && !manifest.requires?.features?.includes('js-render')) e.push(`${at} render needs the manifest to require the "js-render" feature`);
      defined.add(s.as);
      if (s.capture) defined.add(s.capture);
      if (s.captureCaptions) defined.add(s.captureCaptions);
    } else if (!('require' in s)) e.push(`${at} is not a known step`);
  });
  return e;
}

function templateRoles(t: string): string[] {
  return [...t.matchAll(/\{\{\s*domain\.([a-z0-9_-]+)/gi)].map((m) => m[1]);
}

type Scope = Record<string, unknown>;

function lookup(scope: Scope, path: string): unknown {
  let v: unknown = scope;
  for (const part of path.split('.')) {
    if (v === null || v === undefined) return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

const FILTERS: Record<string, (v: unknown, arg?: string) => unknown> = {
  urlencode: (v) => encodeURIComponent(String(v ?? '')),
  json: (v) => JSON.stringify(v ?? null),
  lower: (v) => String(v ?? '').toLowerCase(),
  upper: (v) => String(v ?? '').toUpperCase(),
  trim: (v) => String(v ?? '').trim(),
  default: (v, arg) => (v === undefined || v === null || v === '' ? arg : v),
  pad2: (v) => String(v ?? '').padStart(2, '0'),
};

function evaluate(expr: string, scope: Scope): unknown {
  const [path, ...filters] = expr.split('|').map((s) => s.trim());
  let v = lookup(scope, path);
  for (const f of filters) {
    const [name, arg] = f.split(':').map((s) => s.trim());
    const fn = FILTERS[name];
    if (!fn) throw new ProviderError('INTERNAL', `Unknown template filter "${name}"`);
    v = fn(v, arg);
  }
  return v;
}

/** "{{a.b | urlencode}}" → text. A template that is exactly one expression keeps the value's type. */
export function renderTemplate(template: string, scope: Scope): unknown {
  const single = /^\{\{([^{}]+)\}\}$/.exec(template.trim());
  if (single) return evaluate(single[1], scope);
  return template.replace(/\{\{([^{}]+)\}\}/g, (_m, expr: string) => {
    const v = evaluate(expr, scope);
    return v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

const text = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const isResponse = (v: unknown): v is FetchResponse => !!v && typeof v === 'object' && typeof (v as FetchResponse).body === 'string' && typeof (v as FetchResponse).status === 'number';
const bodyOf = (v: unknown) => (isResponse(v) ? v.body : typeof v === 'string' ? v : text(v));
const baseOf = (v: unknown) => (isResponse(v) ? v.url : undefined);

function runExtract(step: ExtractStep, source: unknown): unknown {
  const body = bodyOf(source);
  let found: unknown[];
  switch (step.extract) {
    case 'css': {
      const nodes = parseHtml(body).selectAll(step.expr!);
      found = nodes.map((n) => (step.attr ? attrOf(n, step.attr) : textOf(n))).filter((v) => v !== undefined && v !== '');
      break;
    }
    case 'xpath':
      found = parseHtml(body).xpath(step.expr!).map((n) => (typeof n === 'string' ? n : textOf(n as HtmlNode))).filter((v) => v !== '');
      break;
    case 'json': {
      const value = isResponse(source) || typeof source === 'string' ? safeJsonParse(body) : source;
      found = value === undefined ? [] : jsonPath(value, step.expr!);
      break;
    }
    case 'regex': {
      const re = new RegExp(step.expr!, 'g');
      const input = body.length > 2_000_000 ? body.slice(0, 2_000_000) : body;
      found = [...input.matchAll(re)].map((m) => m[step.group ?? (m.length > 1 ? 1 : 0)]).filter((v) => v !== undefined);
      break;
    }
    case 'jsonld': {
      const blocks = findJsonLd(body);
      found = step.expr ? blocks.flatMap((b) => jsonPath(b, step.expr!)) : blocks;
      break;
    }
    case 'meta': {
      const v = extractMeta(body)[step.expr!.toLowerCase()];
      found = v === undefined ? [] : [v];
      break;
    }
    case 'iframes':
      found = findIframes(body, baseOf(source)).map((f) => f.url);
      break;
    case 'media':
      found = findMediaUrls(body).filter((m) => !step.expr || m.type === step.expr).map((m) => m.url);
      break;
    case 'hls': {
      const base = baseOf(source);
      if (!base) throw new ProviderError('INTERNAL', 'hls extraction needs a fetched response');
      try {
        found = [parseHls(body, base)];
      } catch {
        found = [];
      }
      break;
    }
    default:
      throw new ProviderError('INTERNAL', `Unknown extractor "${(step as ExtractStep).extract}"`);
  }
  if (!found.length && step.required) throw new ProviderError('SELECTOR_MISSING', `Nothing matched ${step.extract} "${step.expr ?? ''}"`, { step: `${step.extract}:${step.expr ?? ''}` });
  return step.all ? found : found[0];
}

function scopeFor(media: Media, ctx: ProviderContext, vars: Scope, roles: string[]): Scope {
  const domain: Record<string, string> = {};
  for (const r of roles) domain[r] = ctx.domain(r);
  // {{domainSetting.site.apiVersion}}: values that belong to the address in use.
  const domainSetting = new Proxy({}, { get: (_t, role) => new Proxy({}, { get: (_u, key) => (typeof role === 'string' && typeof key === 'string' ? ctx.domainSetting(role, key) : undefined) }) });
  return { ...vars, media, domain, domainSetting, settings: ctx.settings };
}

/** Interprets a rule pack for one title. */
export async function runRulePack(pack: RulePack, manifest: ProviderManifest, media: Media, ctx: ProviderContext) {
  const vars: Scope = {};
  const applies = (w: When['when']) => !kinds(w) || kinds(w)!.includes(media.kind);
  // The scope is rebuilt per step so a domain fail-over during the run is picked up.
  const scope = (extra: Scope = {}) => ({ ...scopeFor(media, ctx, vars, manifest.domainRoles), ...extra });

  for (const step of pack.steps.slice(0, MAX_STEPS)) {
    if (!applies(step.when)) continue;
    if ('fetch' in step) {
      const url = text(renderTemplate(step.fetch, scope()));
      const headers = Object.fromEntries(Object.entries(step.headers ?? {}).map(([k, v]) => [k, text(renderTemplate(v, scope()))]));
      try {
        const res = await ctx.fetch(url, { method: step.method, headers, body: step.body === undefined ? undefined : text(renderTemplate(step.body, scope())), signal: ctx.signal });
        if ((step.notFoundOn ?? [404, 410]).includes(res.status)) throw new ProviderError('NOT_FOUND');
        vars[step.as] = expectOk(res, manifest.name);
      } catch (e) {
        if (!step.optional || (e instanceof ProviderError && e.code === 'CANCELLED')) throw e;
        vars[step.as] = undefined;
      }
    } else if ('render' in step) {
      if (!ctx.browser) throw new ProviderError('UNSUPPORTED_RUNTIME', `${manifest.name}: needs a browser, and this runtime has none`);
      const url = text(renderTemplate(step.render, scope()));
      try {
        const page = await ctx.browser.open(url, { waitFor: step.click || step.waitFor === 'media' || !step.waitFor ? 'load' : { selector: step.waitFor }, timeoutMs: step.timeoutMs });
        try {
          if (page.status === 404 || page.status === 410) throw new ProviderError('NOT_FOUND');
          if (step.click) await page.click(step.click, { timeoutMs: step.timeoutMs, frames: true });
          if (step.waitFor === 'media') await page.waitFor({ media: true }, step.timeoutMs);
          vars[step.as] = { status: page.status, ok: true, url: page.url, headers: {}, body: await page.html() };
          const seen = page.media();
          if (step.capture) vars[step.capture] = seen.filter((m) => m.type !== 'captions').map((m) => m.url);
          if (step.captureCaptions) vars[step.captureCaptions] = seen.filter((m) => m.type === 'captions').map((m) => m.url);
          // Remember what each address needs sent with it, for the emit rules.
          for (const m of seen) (vars.__mediaHeaders as Record<string, Record<string, string>> | undefined ?? (vars.__mediaHeaders = {} as Record<string, Record<string, string>>))[m.url] = m.headers;
        } finally {
          await page.close();
        }
      } catch (e) {
        if (!step.optional || (e instanceof ProviderError && e.code === 'CANCELLED')) throw e;
        vars[step.as] = undefined;
      }
    } else if ('extract' in step) {
      const source = vars[step.from];
      if (source === undefined) {
        if (step.required) throw new ProviderError('SELECTOR_MISSING', `"${step.from}" is empty`, { step: `${step.extract}:${step.expr ?? ''}` });
        vars[step.as] = step.all ? [] : undefined;
      } else vars[step.as] = runExtract(step, source);
    } else if ('set' in step) {
      vars[step.set] = renderTemplate(step.value, scope());
    } else if ('require' in step) {
      const v = renderTemplate(step.require, scope());
      if (v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length)) {
        throw new ProviderError(step.code ?? 'STRUCTURE_CHANGED', step.message ? `${manifest.name}: ${step.message}` : undefined, { step: step.require });
      }
    }
  }

  const streams: RawStream[] = [];
  const base = Object.values(vars).map(baseOf).filter(Boolean).pop();
  for (const rule of pack.emit) {
    if (!applies(rule.when)) continue;
    const items = rule.each ? ([] as unknown[]).concat((renderTemplate(`{{${rule.each}}}`, scope()) as unknown[] | undefined) ?? []) : [undefined];
    for (const item of items) {
      const s = scope({ item });
      const url = resolveUrl(text(renderTemplate(rule.url, s)), base);
      if (!url) continue;
      const type = rule.type && rule.type !== 'auto' ? rule.type : sniffStreamType(url);
      if (!type) continue;
      const opt = (t?: string) => (t === undefined ? undefined : text(renderTemplate(t, s)) || undefined);
      streams.push({
        url,
        type,
        quality: opt(rule.quality),
        language: opt(rule.language),
        note: opt(rule.note),
        headers: { ...((vars.__mediaHeaders as Record<string, Record<string, string>> | undefined)?.[url] ?? {}), ...Object.fromEntries(Object.entries(rule.headers ?? {}).map(([k, v]) => [k, text(renderTemplate(v, s))])) },
      });
    }
  }
  const captions: Caption[] = [];
  for (const rule of pack.captions ?? []) {
    if (!applies(rule.when)) continue;
    const items = rule.each ? ([] as unknown[]).concat((renderTemplate(`{{${rule.each}}}`, scope()) as unknown[] | undefined) ?? []) : [undefined];
    for (const item of items) {
      const s = scope({ item });
      const url = resolveUrl(text(renderTemplate(rule.url, s)), base);
      if (!url) continue;
      captions.push({ url, label: text(renderTemplate(rule.label, s)) || 'Unknown', lang: rule.lang ? text(renderTemplate(rule.lang, s)) || undefined : undefined, format: /\.srt(\?|$)/i.test(url) ? 'srt' : 'vtt' });
    }
  }
  if (!streams.length) throw new ProviderError('NOT_FOUND');
  return { streams, captions };
}

/** A provider module backed by a rule pack. Throws when the pack isn't valid for the manifest. */
export function defineRuleProvider(manifest: ProviderManifest, pack: RulePack): ProviderModule {
  const errors = validateRulePack(pack, manifest);
  if (errors.length) throw new Error(`Rule pack for "${manifest.id}" is not valid: ${errors.join('; ')}`);
  return { manifest, getSources: (media, ctx) => runRulePack(pack, manifest, media, ctx) };
}
