// TMDB serves fixed widths. We never request `original` (often 4K, several MB);
// the browser picks the smallest width that satisfies the `sizes` attribute.
const BASE = 'https://image.tmdb.org/t/p/';

export type ImageKind = 'poster' | 'backdrop' | 'still' | 'logo' | 'profile';

const WIDTHS: Record<ImageKind, number[]> = {
  poster: [92, 154, 185, 342, 500, 780],
  backdrop: [300, 780, 1280],
  still: [92, 185, 300],
  logo: [92, 154, 185, 300, 500],
  profile: [45, 185],
};

export function imageUrl(path: string | null | undefined, kind: ImageKind, width?: number): string | undefined {
  if (!path) return undefined;
  const widths = WIDTHS[kind];
  const w = width ? (widths.find((x) => x >= width) ?? widths[widths.length - 1]) : widths[widths.length - 1];
  return `${BASE}w${w}${path}`;
}

export function imageSrcSet(path: string | null | undefined, kind: ImageKind): string | undefined {
  if (!path) return undefined;
  return WIDTHS[kind].map((w) => `${BASE}w${w}${path} ${w}w`).join(', ');
}
