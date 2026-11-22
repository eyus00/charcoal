/**
 * Frames from what you watched, used as Continue watching images.
 *
 * While the Jelly player plays, it grabs a still of the picture every so often (and when you
 * pause or leave). The latest one per title / episode is kept in this browser's IndexedDB as a
 * small WebP, nothing is uploaded. Only the newest MAX_FRAMES are kept.
 *
 * A frame can only be read when the video isn't cross-origin-tainted (HLS through hls.js always
 * works; a plain cross-origin MP4 may not), and black or near-black frames (fades, credits) are
 * skipped, so the last good picture stays.
 */
import { useEffect, useState } from 'react';
import type { MediaType } from './tmdb';

const DB_NAME = 'charcoal-frames';
const STORE = 'frames';
const MAX_FRAMES = 60;
const WIDTH = 640;

interface FrameRow {
  key: string;
  blob: Blob;
  at: number;
}

export const frameKey = (type: MediaType, id: number, season?: number, episode?: number) =>
  type === 'tv' && season !== undefined && episode !== undefined ? `tv-${id}-${season}-${episode}` : `${type}-${id}`;

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' }).createIndex('at', 'at');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => (dbp = null));
  }
  return dbp;
}

const listeners = new Set<(key: string) => void>();

async function put(key: string, blob: Blob) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put({ key, blob, at: Date.now() } satisfies FrameRow);
    // Keep only the newest MAX_FRAMES.
    const count = store.count();
    count.onsuccess = () => {
      let extra = count.result - MAX_FRAMES;
      if (extra <= 0) return;
      store.index('at').openCursor().onsuccess = (e) => {
        const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cur || extra-- <= 0) return;
        cur.delete();
        cur.continue();
      };
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  listeners.forEach((f) => f(key));
}

export async function getFrame(key: string): Promise<Blob | undefined> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const req = d.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as FrameRow | undefined)?.blob);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

export async function deleteFrames(prefix: string) {
  try {
    const d = await db();
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).openCursor().onsuccess = (e) => {
      const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cur) return;
      if (String(cur.key).startsWith(prefix)) cur.delete();
      cur.continue();
    };
  } catch {
    /* nothing stored */
  }
}

/** Grab the video's current picture and keep it. Returns false when it can't (tainted, black, not ready). */
export function captureFrame(video: HTMLVideoElement, key: string): boolean {
  if (video.readyState < 2 || !video.videoWidth) return false;
  try {
    // Mostly black (a fade or the credits)? Keep the previous frame.
    const probe = document.createElement('canvas');
    probe.width = 32;
    probe.height = 18;
    const pc = probe.getContext('2d', { willReadFrequently: true })!;
    pc.drawImage(video, 0, 0, 32, 18);
    const px = pc.getImageData(0, 0, 32, 18).data; // throws if the video is cross-origin-tainted
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    if (sum / (px.length / 4) < 8) return false;

    const c = document.createElement('canvas');
    c.width = WIDTH;
    c.height = Math.round((WIDTH * video.videoHeight) / video.videoWidth);
    c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height);
    c.toBlob((b) => b && put(key, b).catch(() => {}), 'image/webp', 0.75);
    return true;
  } catch {
    return false;
  }
}

/** The saved frame for a key, as an object URL (undefined when there's none). */
export function useFrame(key: string | undefined, enabled = true): string | undefined {
  const [url, setUrl] = useState<string>();
  const [rev, setRev] = useState(0);
  useEffect(() => {
    if (!key || !enabled) return;
    const f = (k: string) => k === key && setRev((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, [key, enabled]);
  useEffect(() => {
    if (!key || !enabled) return setUrl(undefined);
    let live = true;
    let made: string | undefined;
    getFrame(key).then((b) => {
      if (!live || !b) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [key, enabled, rev]);
  return url;
}
