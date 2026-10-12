import { getHistory } from '@ignite/client';
import { num } from '../../live/store';
import { PROVIDER, type TagName } from '../../live/paths';
import { TRENDED } from '../../live/trended';
import { visible } from '../ui';

/**
 * Chart data, kept outside React and the R3F tree. A 1 Hz sampler records every trended tag from the live
 * store; history (60 points from /tags/history) fills the window to the left of what was recorded live.
 */

export type Pt = [number, number];

const LIVE_CAP = 960; // 16 min at 1 Hz
const live = new Map<TagName, Pt[]>(TRENDED.map((t) => [t, []]));
const hist = new Map<TagName, Pt[]>();

/** Implausible history values: nulls, NaN, and the uninitialised constants (1.8e-248, 12-18 digit ints). */
export function plausible(v: number): boolean {
  return Number.isFinite(v) && (v === 0 || (Math.abs(v) > 1e-100 && Math.abs(v) < 1e9));
}

/** Parse a /tags/history reply ({columns:[t_stamp, name...], rows:[[iso, value...]]}) into per-tag points. */
export function parseHistory(reply: unknown): Map<TagName, Pt[]> {
  const out = new Map<TagName, Pt[]>();
  const r = reply as { columns?: string[]; rows?: unknown[][] };
  if (!r?.columns || !r.rows) return out;
  r.columns.forEach((col, ci) => {
    if (ci === 0) return;
    const name = (col.startsWith(PROVIDER) ? col.slice(PROVIDER.length) : col) as TagName;
    const pts: Pt[] = [];
    for (const row of r.rows!) {
      const raw = row[ci];
      if (raw === null || raw === undefined || raw === '') continue;
      const t = Date.parse(String(row[0]));
      const v = Number(raw);
      if (Number.isFinite(t) && plausible(v)) pts.push([t, v]);
    }
    out.set(name, pts);
  });
  return out;
}

let sampler: ReturnType<typeof setInterval> | null = null;
export function startSampler(): void {
  if (sampler) return;
  const sample = () => {
    const now = Date.now();
    for (const [tag, buf] of live) {
      buf.push([now, num(tag, NaN)]);
      if (buf.length > LIVE_CAP) buf.splice(0, buf.length - LIVE_CAP);
    }
  };
  sample();
  sampler = setInterval(sample, 1000);
}

let histVersion = 0;
/** Replace the history for these tags with 60 points across the window ending now. */
export async function loadHistory(tags: TagName[], windowMs: number): Promise<void> {
  if (tags.length === 0) return;
  const end = new Date();
  try {
    const reply = await getHistory(
      tags.map((t) => PROVIDER + t),
      new Date(end.getTime() - windowMs),
      end,
      60,
    );
    const parsed = parseHistory(reply);
    for (const t of tags) hist.set(t, parsed.get(t) ?? []);
  } catch {
    for (const t of tags) hist.set(t, []);
  }
  histVersion++;
}

export const historyVersion = (): number => histVersion;

/** History older than the first live sample, then live samples; clipped to the window. */
export function series(tag: TagName, windowMs: number, now: number): Pt[] {
  const from = now - windowMs;
  const l = (live.get(tag) ?? []).filter((p) => p[0] >= from && Number.isFinite(p[1]));
  const firstLive = l.length ? l[0][0] : now;
  const h = (hist.get(tag) ?? []).filter((p) => p[0] >= from && p[0] < firstLive);
  return h.concat(l);
}

// --- shared render ticker: at most 2 updates per second, only while someone listens and the tab is visible ---

const FRAME_MS = 500;
const subs = new Set<(now: number) => void>();
let ticker: ReturnType<typeof setInterval> | null = null;

export function onFrame(cb: (now: number) => void): () => void {
  subs.add(cb);
  if (!ticker) {
    ticker = setInterval(() => {
      if (!visible()) return;
      const now = Date.now();
      for (const s of [...subs]) s(now);
    }, FRAME_MS);
  }
  return () => {
    subs.delete(cb);
    if (subs.size === 0 && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}
