/** Charcoal mark: a faceted lump with a glowing ember crack. Inline SVG, no request. */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M5 20 9 8.5 18.5 4.5 27 10.5l1.5 10-6.5 7H10.5z" fill="#2c323d" />
      <path d="M9 8.5 18.5 4.5 27 10.5 18.5 14z" fill="#454d5c" />
      <path d="M18.5 14 27 10.5l1.5 10-6.5 7z" fill="#20252e" />
      <path d="M5 20 9 8.5 18.5 14 10.5 27.5z" fill="#353c48" />
      <path d="M11.5 21.5 15 18.5l2.5 2.5 4.5-4.5" fill="none" stroke="#ff7a3d" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="16.5" r="1.1" fill="#ffb07a" />
    </svg>
  );
}

/** The mark as a plain white glyph with the ember crack cut out (used as the "o" in the wordmark). */
export function LogoGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="4 3.5 25.5 25" className={className} aria-hidden>
      <defs>
        <mask id="charcoal-ember">
          <rect x="0" y="0" width="32" height="32" fill="white" />
          <path d="M11.5 21.5 15 18.5l2.5 2.5 4.5-4.5" fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="22" cy="16.5" r="1.4" fill="black" />
        </mask>
      </defs>
      <path d="M5 20 9 8.5 18.5 4.5 27 10.5l1.5 10-6.5 7H10.5z" fill="currentColor" mask="url(#charcoal-ember)" />
    </svg>
  );
}

/** The logo and "Charcoal" beside it; inside a part of the app, its name follows ("Charcoal Sports"). */
export function Wordmark({ className, part }: { className?: string; part?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ''}`}>
      <LogoMark className="size-[1.3em]" />
      <span>Charcoal{part && <span className="font-normal text-white/60"> {part}</span>}</span>
    </span>
  );
}

/** The part of the app a path belongs to, for the wordmark (none for the main app). */
export const partOf = (pathname: string) => (/^\/(sports|live)(\/|$)/.test(pathname) ? 'Sports' : undefined);
