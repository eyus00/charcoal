/** Just enough semver for version compatibility checks: x.y.z comparison and simple ranges. */

export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(v).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export const isVersion = (v: string) => parseVersion(v) !== null;

/** Negative when a < b, positive when a > b, 0 when equal. Unparseable versions sort first. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/**
 * Whether a version satisfies a range. Supported: "1.2.3", ">=1.2.3", ">1.2.3", "<=", "<", "^1.2.3",
 * "~1.2.3", "*", and several of them separated by spaces (all must hold).
 */
export function satisfies(version: string, range: string | undefined): boolean {
  if (!range || range.trim() === '*' || range.trim() === '') return true;
  const v = parseVersion(version);
  if (!v) return false;
  return range
    .trim()
    .split(/\s+/)
    .every((part) => {
      const m = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(part);
      const target = m && parseVersion(m[2]);
      if (!m || !target) return false;
      const c = compareVersions(version, m[2]);
      switch (m[1]) {
        case '>=':
          return c >= 0;
        case '>':
          return c > 0;
        case '<=':
          return c <= 0;
        case '<':
          return c < 0;
        case '^': {
          if (c < 0) return false;
          // ^0.y.z keeps the minor fixed, as in npm.
          return target[0] === 0 ? v[0] === 0 && v[1] === target[1] : v[0] === target[0];
        }
        case '~':
          return c >= 0 && v[0] === target[0] && v[1] === target[1];
        default:
          return c === 0;
      }
    });
}
