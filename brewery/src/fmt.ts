import { UNITS } from './live/units';

/** Fixed-decimal number, or an em dash while the value has not arrived. */
export function num(v: number, digits = 1): string {
  return Number.isFinite(v) ? v.toFixed(digits) : '—';
}
/** Whole number with thousands separators. */
export function int(v: number): string {
  return Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—';
}
export const unitOf = (name: string): string => UNITS[name] ?? '';
export const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
/** hh:mm from a 0-24 hour. */
export function hhmm(h: number): string {
  if (!Number.isFinite(h)) return '—:—';
  const m = Math.floor(((h % 24) + 24) % 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export const pretty = (s: string) => (s ? s.replace(/_/g, ' ').toUpperCase() : '—');
/** Title case of an enum value: "DIACETYL_REST" -> "Diacetyl rest". */
export const sentence = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—');
