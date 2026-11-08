import { Fragment, type ReactNode } from 'react';
import { actions, useStore } from '../lib/store';
import { cx } from '../lib/util';

/** One subtitle line block, times in seconds. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const toSec = (m: RegExpMatchArray) => Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;

/** Parses WebVTT or SRT into cues (cue settings, notes and styles are ignored). */
export function parseCaptions(raw: string): Cue[] {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i === -1) continue;
    const [a, b] = lines[i].split('-->');
    const s = a.match(TIME);
    const e = b?.match(TIME);
    if (!s || !e) continue;
    const body = lines.slice(i + 1).join('\n').trim();
    if (body) cues.push({ start: toSec(s), end: toSec(e), text: body });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** Cues showing at time t (cues can overlap). */
export function activeCues(cues: Cue[], t: number): Cue[] {
  // Binary search for the last cue starting at or before t, then look back over overlaps.
  let lo = 0;
  let hi = cues.length - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      at = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const out: Cue[] = [];
  for (let i = at; i >= 0 && i > at - 8; i--) if (cues[i].end > t) out.unshift(cues[i]);
  return out;
}

/** Cue text with only <i>, <b> and <u> kept (rendered as elements, never as HTML). */
export function CueText({ text }: { text: string }): ReactNode {
  const clean = text
    .replace(/<(?!\/?[ibu]>)[^>]*>/gi, '') // other tags (voice, colour, timestamps)
    .replace(/\{\\[^}]*\}/g, '') // ASS overrides that sometimes end up in SRTs
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
  const out: ReactNode[] = [];
  const style = { i: false, b: false, u: false };
  clean.split(/(<\/?[ibu]>)/i).forEach((part, k) => {
    const tag = part.match(/^<(\/?)([ibu])>$/i);
    if (tag) {
      style[tag[2].toLowerCase() as 'i' | 'b' | 'u'] = !tag[1];
      return;
    }
    if (!part) return;
    out.push(
      <span key={k} className={cx(style.i && 'italic', style.b && 'font-bold', style.u && 'underline')}>
        {part.split('\n').map((line, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {line}
          </Fragment>
        ))}
      </span>,
    );
  });
  return out;
}

export interface CaptionStyle {
  subSize: number;
  subColor: string;
  subBg: number;
  subBold: boolean;
}

/** The caption box itself (also used for the live preview in Settings). */
export function CaptionLine({ children, style, className }: { children: ReactNode; style: CaptionStyle; className?: string }) {
  return (
    <span
      className={cx('inline rounded-md px-2 py-0.5 leading-[1.45] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]', className)}
      style={{
        color: style.subColor,
        backgroundColor: `rgb(0 0 0 / ${style.subBg})`,
        fontWeight: style.subBold ? 700 : 500,
        // Text outline keeps it readable when the background is off.
        textShadow: style.subBg < 0.3 ? '0 0 4px rgb(0 0 0 / 0.9), 0 1px 2px rgb(0 0 0 / 0.9)' : undefined,
      }}
    >
      {children}
    </span>
  );
}

/** Overlay that draws the current cues above the video; rises when the controls are showing. */
export function CaptionOverlay({ cues, time, raised, style }: { cues: Cue[]; time: number; raised: boolean; style: CaptionStyle }) {
  const now = activeCues(cues, time);
  if (!now.length) return null;
  return (
    <div
      aria-live="off"
      className={cx(
        'pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-1 px-[6%] text-center transition-[bottom] duration-200',
        raised ? 'bottom-28 md:bottom-32' : 'bottom-[6%]',
      )}
      // Scales with the player: comfortable on phones, large on a TV.
      style={{ fontSize: `calc(clamp(16px, 2.6vw, 44px) * ${style.subSize})` }}
    >
      {now.map((c, i) => (
        <div key={`${c.start}-${i}`} className="max-w-[46ch] text-balance">
          <CaptionLine style={style}>
            <CueText text={c.text} />
          </CaptionLine>
        </div>
      ))}
    </div>
  );
}

/** Size, colour, background and weight for subtitles, with a live sample. Also used in Settings. */
export function SubtitleStyleControls({ preview = true }: { preview?: boolean }) {
  const s = useStore((st) => st.settings);
  const set = actions.updateSettings;
  const SIZES = [0.75, 1, 1.25, 1.5, 2];
  const COLORS = [
    ['#ffffff', 'White'],
    ['#ffe14d', 'Yellow'],
    ['#7fe3ff', 'Cyan'],
    ['#9dff9d', 'Green'],
  ] as const;
  const BGS = [
    [0, 'None'],
    [0.5, 'Light'],
    [0.8, 'Dark'],
  ] as const;
  const chip = (on: boolean) => cx('h-8 rounded-full px-3 text-xs transition', on ? 'bg-white font-medium text-black' : 'bg-white/10 hover:bg-white/20');
  return (
    <div className="space-y-3 px-3 pt-1 pb-3 text-sm">
      {preview && (
        <div className="grid h-20 place-items-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,#3a4556,#151922)] px-3 text-center" style={{ fontSize: `${16 * s.subSize}px` }}>
          <span>
            <CaptionLine style={s}>Subtitles look like this</CaptionLine>
          </span>
        </div>
      )}
      <Field label="Size">
        {SIZES.map((v) => (
          <button key={v} aria-pressed={s.subSize === v} onClick={() => set({ subSize: v })} className={chip(s.subSize === v)}>
            {Math.round(v * 100)}%
          </button>
        ))}
      </Field>
      <Field label="Colour">
        {COLORS.map(([c, name]) => (
          <button
            key={c}
            aria-pressed={s.subColor === c}
            aria-label={name}
            title={name}
            onClick={() => set({ subColor: c })}
            className={cx('grid size-8 place-items-center rounded-full ring-2 transition', s.subColor === c ? 'ring-white' : 'ring-transparent hover:ring-white/30')}
          >
            <span className="size-5 rounded-full" style={{ background: c }} />
          </button>
        ))}
      </Field>
      <Field label="Background">
        {BGS.map(([v, name]) => (
          <button key={v} aria-pressed={s.subBg === v} onClick={() => set({ subBg: v })} className={chip(s.subBg === v)}>
            {name}
          </button>
        ))}
      </Field>
      <Field label="Weight">
        <button aria-pressed={!s.subBold} onClick={() => set({ subBold: false })} className={chip(!s.subBold)}>
          Regular
        </button>
        <button aria-pressed={s.subBold} onClick={() => set({ subBold: true })} className={chip(s.subBold)}>
          Bold
        </button>
      </Field>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <div className="mb-1.5 text-xs text-muted">{label}</div>
    <div className="flex flex-wrap items-center gap-1.5">{children}</div>
  </div>
);

