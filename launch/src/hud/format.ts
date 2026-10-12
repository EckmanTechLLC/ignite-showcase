import { UNITS } from '../live/units';
import type { TagName } from '../live/paths';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Mission clock: T-00:09:58 before T0, T+00:02:14 after. Countdown rounds up, elapsed time rounds down. */
export function fmtClock(t: number): string {
  const n = t < 0 ? Math.ceil(-t) : Math.floor(t);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return `T${t < 0 ? '-' : '+'}${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/** Short form for hold markers: T-10:00 / T-0:40. */
export function fmtTShort(t: number): string {
  const n = Math.abs(Math.round(t));
  return `T${t < 0 ? '-' : '+'}${Math.floor(n / 60)}:${pad2(n % 60)}`;
}

export function fmtDuration(sec: number): string {
  const n = Math.max(0, Math.round(sec));
  return `${Math.floor(n / 60)}:${pad2(n % 60)}`;
}

/** Number with a fixed number of decimals, '--' while the tag has no value yet. */
export function fmtNum(v: unknown, digits = 1): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '--';
}

export function unitOf(tag: TagName): string {
  return UNITS[tag] ?? '';
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
