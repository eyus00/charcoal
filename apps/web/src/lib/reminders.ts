/**
 * Reminders for things airing / releasing, kept in this browser.
 *
 * - While Charcoal is open (any tab), a due reminder shows a notification (if allowed) and a toast.
 * - For reminders when Charcoal is closed, "Add to calendar" downloads an .ics file: the phone's or
 *   computer's own calendar then alerts you (15 minutes before). Real push notifications with the
 *   site closed would need a push server; this needs none.
 */
import { useSyncExternalStore } from 'react';
import { toast } from '../components/Toast';

export interface Reminder {
  key: string;
  title: string;
  /** e.g. "S2 E5 · The Long Night" */
  body?: string;
  /** ms */
  at: number;
  /** no time of day, just the date */
  allDay?: boolean;
  url: string;
  done?: boolean;
}

const KEY = 'charcoal:reminders';
const read = (): Reminder[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
};
let list: Reminder[] = typeof window !== 'undefined' ? read() : [];
const subs = new Set<() => void>();
function save(next: Reminder[]) {
  list = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* blocked: in memory only */
  }
  subs.forEach((f) => f());
}
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      list = read();
      subs.forEach((f) => f());
    }
  });

export const useReminders = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => list,
  );

export const hasReminder = (key: string) => list.some((r) => r.key === key);

/**
 * Turn a reminder on or off. Asks for notification permission the first time.
 * `already`: what it's about has started (a live match kept as "yours"): kept, but never fires.
 * `words`: the toasts, when the default ones don't fit.
 */
export async function toggleReminder(r: Reminder, opts: { already?: boolean; words?: { on: string; off: string } } = {}) {
  if (hasReminder(r.key)) {
    save(list.filter((x) => x.key !== r.key));
    toast(opts.words?.off ?? 'Reminder removed');
    return;
  }
  save([...list, { ...r, done: !!opts.already }]);
  if (opts.already) return void toast(opts.words?.on ?? 'Saved');
  if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission().catch(() => {});
  const allowed = 'Notification' in window && Notification.permission === 'granted';
  toast(opts.words?.on ?? (allowed ? 'Reminder set. You’ll get a notification while Charcoal is open.' : 'Reminder set. You’ll see it here while Charcoal is open.'));
}

/** Check for due reminders now and every minute (call once from the app shell). */
export function startReminderLoop(open: (url: string) => void) {
  const check = () => {
    const now = Date.now();
    // Date-only reminders fire at 9:00 local on the day.
    const due = list.filter((r) => !r.done && (r.allDay ? new Date(r.at).setHours(9, 0, 0, 0) : r.at) <= now);
    if (!due.length) return;
    for (const r of due) {
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(r.title, {
          body: r.body === 'Now streaming' ? 'Now streaming' : r.body ? `${r.body} · out now` : 'Out now',
          tag: r.key,
          icon: '/favicon.svg',
        });
        n.onclick = () => {
          window.focus();
          open(r.url);
        };
      }
      toast(r.body === 'Now streaming' ? `${r.title} is now streaming` : `${r.title}${r.body ? ` · ${r.body}` : ''} is out now`, {
        label: 'Open',
        run: () => open(r.url),
      });
    }
    const week = 7 * 86_400_000;
    save(list.map((r) => (due.includes(r) ? { ...r, done: true } : r)).filter((r) => !(r.done && now - r.at > week)));
  };
  check();
  const t = window.setInterval(check, 60_000);
  return () => window.clearInterval(t);
}

// ---------- calendar files (.ics) ----------

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const dateOnly = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** An iCalendar file with an alert 15 minutes before each event. */
export function makeIcs(events: (Reminder & { minutes?: number })[]) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Charcoal//Calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    const start = new Date(e.at);
    const end = new Date(e.at + (e.minutes ?? 60) * 60_000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.key}@charcoal`,
      `DTSTAMP:${stamp(new Date())}`,
      ...(e.allDay ? [`DTSTART;VALUE=DATE:${dateOnly(start)}`] : [`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`]),
      `SUMMARY:${esc(e.body ? `${e.title} · ${e.body}` : e.title)}`,
      `URL:${new URL(e.url, window.location.origin)}`,
      `DESCRIPTION:${esc(`Watch on Charcoal: ${new URL(e.url, window.location.origin)}`)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(e.title)}`,
      'TRIGGER:-PT15M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(name: string, events: (Reminder & { minutes?: number })[]) {
  const blob = new Blob([makeIcs(events)], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^\w\- ]+/g, '').trim() || 'charcoal'}.ics`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Add reminders that aren't there yet, quietly (for followed shows). */
export function ensureReminders(rs: Reminder[]) {
  const fresh = rs.filter((r) => !list.some((x) => x.key === r.key));
  if (fresh.length) save([...list, ...fresh.map((r) => ({ ...r, done: false }))]);
}

/** Remove every reminder whose key starts with `prefix` (e.g. an unfollowed show's). */
export function removeReminders(prefix: string) {
  if (list.some((r) => r.key.startsWith(prefix))) save(list.filter((r) => !r.key.startsWith(prefix)));
}
