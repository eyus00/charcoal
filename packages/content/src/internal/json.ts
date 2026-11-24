/** Small readers for untyped JSON. Every upstream response is treated as unknown until read through these. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A trimmed, non-empty string; undefined for anything else. */
export function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** An integer given as a number or as a numeric string ("36"); undefined for anything else. */
export function integer(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value === 'string' && /^\s*-?\d+\s*$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** An integer ≥ 1 (ids, episode numbers). */
export function positiveInteger(value: unknown): number | undefined {
  const parsed = integer(value);
  return parsed !== undefined && parsed >= 1 ? parsed : undefined;
}

/** A finite number given as a number or a numeric string. */
export function finite(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Parses a response body, naming the source in the error instead of leaking a raw SyntaxError. */
export function parseJson(body: string, source: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${source}: the response is not valid JSON`);
  }
}

/** Keeps the first occurrence of each value. */
export function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}
