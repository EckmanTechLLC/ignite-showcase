import { getHistory } from '@ignite/client';
import { PREFIX } from '../../live/paths';

export type WindowKey = '15m' | '1h' | '24h';
export const WINDOWS: Record<WindowKey, { ms: number; points: number; label: string }> = {
  '15m': { ms: 15 * 60_000, points: 90, label: '15 min' },
  '1h': { ms: 60 * 60_000, points: 120, label: '1 h' },
  '24h': { ms: 24 * 60 * 60_000, points: 144, label: '24 h' },
};

export type Point = [number, number];

/** Values come back as strings; drop nulls and the implausible constants the historian holds from before the sim. */
export function plausible(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : Number.NaN;
  if (!Number.isFinite(n) || Math.abs(n) > 1e7) return null;
  if (n !== 0 && Math.abs(n) < 1e-6) return null;
  return n;
}

export async function fetchSeries(tags: string[], win: WindowKey): Promise<Map<string, Point[]>> {
  const w = WINDOWS[win];
  const end = new Date();
  const start = new Date(end.getTime() - w.ms);
  const r = (await getHistory(tags.map((t) => PREFIX + t), start, end, w.points)) as { columns?: string[]; rows?: unknown[][] };
  const cols = r.columns ?? [];
  const out = new Map<string, Point[]>();
  for (const tag of tags) {
    const ci = cols.indexOf('DC/' + tag);
    const pts: Point[] = [];
    if (ci > 0) {
      for (const row of r.rows ?? []) {
        const v = plausible(row[ci]);
        const t = Date.parse(String(row[0]));
        if (v !== null && Number.isFinite(t)) pts.push([t, v]);
      }
    }
    out.set(tag, pts);
  }
  return out;
}
