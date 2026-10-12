import { UNITS } from './live/units';

/** Fixed-decimal number, or an em dash while the value has not arrived. */
export function num(v: number, digits = 1): string {
  return Number.isFinite(v) ? v.toFixed(digits) : '—';
}

export const unitOf = (name: string): string => UNITS[name] ?? '';

/** mm:ss from seconds. */
export function clock(s: number): string {
  if (!Number.isFinite(s)) return '—';
  const t = Math.max(0, Math.round(s));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export type Tone = 'ok' | 'warn' | 'alarm' | 'info' | 'off' | 'violet';
export const TONE_COLOR: Record<Tone, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  alarm: 'var(--alarm)',
  info: 'var(--info)',
  off: 'var(--fg-2)',
  violet: 'var(--feed-b)',
};
