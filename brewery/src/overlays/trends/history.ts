import { getHistory } from '@ignite/client';
import { PREFIX } from '../../live/paths';
import { rawNum, rawStr } from '../../live/store';
import { SLOTS } from '../../model';
import { parseTimeline } from '../../strip/batches';

/** "shift" = 8 simulated hours (8 real minutes at 60x), "batch" = the full fermentation window of the batches in the cellar. */
export type WindowKey = 'shift' | 'batch';
export const WINDOW_LABEL: Record<WindowKey, string> = { shift: 'Shift (8 h)', batch: 'Batch (ferment)' };
export const POINTS = 240;

/** [real epoch ms, value] */
export type Point = [number, number];

/** Values come back as strings; drop nulls and the garbage constants the historian holds (1.9E-248 before data exists). */
export function plausible(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : Number.NaN;
  if (!Number.isFinite(n) || Math.abs(n) > 1e9) return null;
  if (n !== 0 && Math.abs(n) < 1e-6) return null;
  return n;
}

/**
 * Simulated hours the batch window spans: the longest time any batch in the cellar has been fermenting plus a margin,
 * in 6 h steps (so the chart does not reload at every tick), at least 24 h and at most 48 h.
 */
export function fermentWindowH(): number {
  const now = rawNum('Time/DayIndex') * 24 + rawNum('Time/HourOfDay');
  let age = 0;
  for (const s of SLOTS) {
    const tl = parseTimeline(rawStr(`Batches/${s}/Timeline`));
    const f = tl.find(([p]) => p === 'FERMENTATION');
    const state = rawStr(`Batches/${s}/State`);
    if (f && state === 'FERMENTING' && Number.isFinite(now)) age = Math.max(age, now - f[1]);
  }
  return Math.min(48, Math.max(24, Math.ceil((age + 2) / 6) * 6));
}

export const windowHours = (w: WindowKey): number => (w === 'shift' ? 8 : fermentWindowH());

/** Simulated seconds per real second (the sim speed factor), 60 when unknown. */
export function simSpeed(): number {
  const s = rawNum('_Sim_/SpeedFactor');
  return Number.isFinite(s) && s > 0 ? s : 60;
}
/** Real milliseconds a window covers at the current speed. */
export const windowMs = (hours: number, speed = simSpeed()): number => (hours * 3_600_000) / speed;

export interface Signal {
  id: string;
  label: string;
  color: string;
  /** Tags (relative to BR/) the series is computed from. */
  tags: string[];
  /** Combines the tag values (same order as `tags`); default is the first one. Return null to skip the point. */
  fn?: (v: number[]) => number | null;
  dashed?: boolean;
  /** 0 = left axis, 1 = right axis */
  axis?: number;
  /** Filled area; with `stack` the areas pile up. */
  area?: boolean;
  stack?: string;
  width?: number;
}
/** Horizontal reference line whose value is a live tag (target FG, setpoint). */
export interface RefLine {
  tag: string;
  label: string;
  color: string;
  /** No text on the chart (many lines). */
  quiet?: boolean;
}

export const valueOf = (s: Signal, get: (t: string) => number | null): number | null => {
  const vals: number[] = [];
  for (const t of s.tags) {
    const v = get(t);
    if (v === null) return null;
    vals.push(v);
  }
  return s.fn ? s.fn(vals) : vals[0];
};

/** History of every tag the signals need over the last `ms`, turned into one point list per signal. */
export async function fetchSeries(signals: Signal[], ms: number): Promise<Map<string, Point[]>> {
  const tags = [...new Set(signals.flatMap((s) => s.tags))];
  const end = new Date();
  const start = new Date(end.getTime() - ms);
  const r = (await getHistory(tags.map((t) => PREFIX + t), start, end, POINTS)) as { columns?: string[]; rows?: unknown[][] };
  const cols = r.columns ?? [];
  const idx = new Map(tags.map((t) => [t, cols.indexOf('BR/' + t)]));
  const out = new Map<string, Point[]>(signals.map((s) => [s.id, []]));
  for (const row of r.rows ?? []) {
    const t = Date.parse(String(row[0]));
    if (!Number.isFinite(t)) continue;
    for (const s of signals) {
      const v = valueOf(s, (tag) => {
        const i = idx.get(tag) ?? -1;
        return i > 0 ? plausible(row[i]) : null;
      });
      if (v !== null) out.get(s.id)!.push([t, v]);
    }
  }
  return out;
}

// --- simulated time -----------------------------------------------------------------------
// History is stored against wall-clock time; the x-axis shows simulated hours. The mapping anchors on the live clock
// tags and assumes the speed factor has not changed inside the window (a speed change bends the old points).

export interface SimClock {
  nowMs: number;
  /** Simulated hours since the sim started (DayIndex x 24 + HourOfDay). */
  abs: number;
  /** Simulated seconds per real second. */
  speed: number;
}
export function simClock(): SimClock {
  return { nowMs: Date.now(), abs: (rawNum('Time/DayIndex') || 0) * 24 + (rawNum('Time/HourOfDay') || 0), speed: simSpeed() };
}
export const simAt = (c: SimClock, ms: number): number => c.abs + ((ms - c.nowMs) * c.speed) / 3_600_000;

/** Axis label for a simulated hour: "D3 14:00" on the long window, "14:00" (or "14:36" with `minutes`) on the short one. */
export function hourLabel(abs: number, withDay: boolean, minutes = false): string {
  const day = Math.floor(abs / 24);
  const t = Math.floor((abs - day * 24) * 60 + 1e-3);
  const hh = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(minutes ? t % 60 : 0).padStart(2, '0')}`;
  return withDay ? `D${day} ${hh}` : hh;
}
