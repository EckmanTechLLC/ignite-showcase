import { getHistory } from '@ignite/client';
import { PREFIX } from '../../live/paths';
import { tagNum } from '../../live/store.svelte';

/** A simulated day is 12 real minutes at the default speed (120x), so "today" is the last 12 real minutes. */
export type WindowKey = 'today' | '3d';
export const WINDOWS: Record<WindowKey, { ms: number; points: number; label: string; tickH: number }> = {
  today: { ms: 12 * 60_000, points: 144, label: 'Today (24 h)', tickH: 4 },
  '3d': { ms: 36 * 60_000, points: 144, label: '3 days', tickH: 12 },
};

/** [real epoch ms, value] */
export type Point = [number, number];

/** Values come back as strings; drop nulls and the garbage constants the historian holds (1.9E-248 in PV night rows). */
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
    const ci = cols.indexOf('MG/' + tag);
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

// --- simulated time -----------------------------------------------------------------------
// History is stored against wall-clock time; the x-axis shows simulated hours. The mapping anchors on the live
// clock tags and assumes the speed factor has not changed inside the window (a jump or speed change bends old points).

export interface SimClock {
  nowMs: number;
  /** Simulated hours since the sim started (DayIndex x 24 + HourOfDay). */
  abs: number;
  /** Simulated seconds per real second. */
  speed: number;
}

export function simClock(): SimClock {
  const speed = tagNum('_Sim_/SpeedFactor');
  return { nowMs: Date.now(), abs: (tagNum('Time/DayIndex') || 0) * 24 + (tagNum('Time/HourOfDay') || 0), speed: Number.isFinite(speed) && speed > 0 ? speed : 120 };
}
export const simAt = (c: SimClock, ms: number): number => c.abs + ((ms - c.nowMs) * c.speed) / 3_600_000;

export type Band = 'OFFPEAK' | 'SHOULDER' | 'PEAK';
export interface Seg {
  from: number;
  to: number;
  band: Band;
}
const WEEKDAY: Seg[] = [
  { from: 0, to: 7, band: 'OFFPEAK' },
  { from: 7, to: 16, band: 'SHOULDER' },
  { from: 16, to: 21, band: 'PEAK' },
  { from: 21, to: 22, band: 'SHOULDER' },
  { from: 22, to: 24, band: 'OFFPEAK' },
];
const WEEKEND: Seg[] = [
  { from: 0, to: 8, band: 'OFFPEAK' },
  { from: 8, to: 22, band: 'SHOULDER' },
  { from: 22, to: 24, band: 'OFFPEAK' },
];

/** Tariff segments (and, for the weekday PEAK ones, the demand window) between two simulated hours. Day 0 is a Monday. */
export function tariffSegments(lo: number, hi: number): (Seg & { day: number })[] {
  const out: (Seg & { day: number })[] = [];
  for (let d = Math.floor(lo / 24); d <= Math.floor(hi / 24); d++) {
    for (const s of d % 7 >= 5 ? WEEKEND : WEEKDAY) {
      const from = d * 24 + s.from;
      const to = d * 24 + s.to;
      if (to > lo && from < hi) out.push({ ...s, from: Math.max(from, lo), to: Math.min(to, hi), day: d });
    }
  }
  return out;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Axis label for a simulated hour: "16:00" (or "16:36" with `minutes`), with the weekday on the 3-day chart. */
export function hourLabel(abs: number, withDay: boolean, minutes = false): string {
  const day = Math.floor(abs / 24);
  const t = Math.floor((abs - day * 24) * 60 + 1e-3);
  const h = Math.floor(t / 60) % 24;
  const m = minutes ? t % 60 : 0;
  const hh = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return withDay ? `${DAYS[((day % 7) + 7) % 7]} ${hh}` : hh;
}
