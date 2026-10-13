import { acknowledgeAlarm, getAlarmStatus, type Alarm } from '@ignite/client';
import { toast } from '../../ui.svelte';

export const PRIORITY_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1, Diagnostic: 0 };

export interface Row {
  id: string;
  group: string;
  /** Tag path relative to [default]MG/, e.g. PV/A2/String/S4/Health (what the alarm watches). */
  tag: string;
  label: string;
  priority: string;
  state: string;
  active: boolean;
  acked: boolean;
  activeMs: number;
  clearMs: number;
}

/** Subsystem of an alarm by the first path segment under MG/. */
export function groupOf(tag: string): string {
  const head = tag.split('/')[0];
  return ({ PV: 'PV array', BESS: 'BESS', Grid: 'Grid', Genset: 'Genset', EV: 'EV', Loads: 'Loads' } as Record<string, string>)[head] ?? 'Other';
}
export const GROUP_ORDER = ['PV array', 'BESS', 'Grid', 'Genset', 'EV', 'Loads', 'Other'];

/**
 * The gateway-wide /alarms/status also lists other providers' tags and one zero-length "Cleared, Acknowledged" event
 * per alarm created by the tag load (active = ack = clear time): keep MG alarms with a real duration or an open state.
 */
export function toRow(a: Alarm): Row | null {
  if (!a.id || !a.displayPath.startsWith('MG/')) return null;
  const activeMs = a.activeTime ? Date.parse(a.activeTime) : Number.NaN;
  const clearMs = a.clearTime ? Date.parse(a.clearTime) : Number.NaN;
  if (!Number.isFinite(activeMs)) return null;
  if (a.isCleared && a.activeTime === a.clearTime) return null;
  const parts = a.displayPath.split('/');
  const tag = parts.slice(1, -1).join('/');
  return {
    id: a.id,
    group: groupOf(tag),
    tag,
    label: a.label || a.name,
    priority: a.priority ?? 'Low',
    state: a.state ?? '',
    active: !a.isCleared,
    acked: a.isAcked,
    activeMs,
    clearMs: Number.isFinite(clearMs) ? clearMs : Number.NaN,
  };
}

export const alarms = $state<{ rows: Row[]; error: string; lastFetch: number }>({ rows: [], error: '', lastFetch: 0 });

export const activeRows = (): Row[] => alarms.rows.filter((r) => r.active);
export const hasCritical = (): boolean => alarms.rows.some((r) => r.active && r.priority === 'Critical');

async function poll(): Promise<void> {
  try {
    const r = await getAlarmStatus();
    alarms.rows = (r.alarms ?? []).map(toRow).filter((x): x is Row => x !== null);
    alarms.error = '';
    alarms.lastFetch = Date.now();
  } catch (e) {
    alarms.error = e instanceof Error ? e.message : 'alarm status failed';
  }
}

let timer = 0;
/** Poll /alarms/status every 3 s; paused while the page is hidden, refreshed as soon as it is visible again. */
export function startAlarms(): void {
  if (timer) return;
  const tick = () => {
    if (!document.hidden) void poll();
  };
  tick();
  timer = window.setInterval(tick, 3000);
  document.addEventListener('visibilitychange', tick);
}

export async function acknowledge(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const results = await Promise.allSettled(ids.map((id) => acknowledgeAlarm(id)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) toast(`${ids.length - failed} acknowledged, ${failed} failed`, 'warn');
  else toast(ids.length === 1 ? 'Alarm acknowledged' : `${ids.length} alarms acknowledged`, 'ok');
  await poll();
}

export interface Step {
  row: Row;
  /** Where it sits in the inverter -> string -> array chain. */
  level: 'Inverter' | 'String' | 'Array';
}

const levelOf = (tag: string): Step['level'] => (/\/Inverter\//.test(tag) ? 'Inverter' : /\/String\//.test(tag) ? 'String' : 'Array');

/** The latest cluster (gaps <= 5 min) of PV-array alarms, oldest first: inverter fault, then its strings, then the array health. */
export function cascadeOf(all: Row[]): Step[] {
  const pv = all.filter((r) => r.group === 'PV array').sort((a, b) => b.activeMs - a.activeMs);
  if (!pv.length) return [];
  const cluster = [pv[0]];
  let edge = pv[0].activeMs;
  for (const r of pv.slice(1)) {
    const end = Number.isFinite(r.clearMs) ? r.clearMs : r.activeMs;
    if (edge - end > 5 * 60_000) break;
    cluster.push(r);
    edge = Math.min(edge, r.activeMs);
  }
  return cluster.sort((a, b) => a.activeMs - b.activeMs).map((row) => ({ row, level: levelOf(row.tag) }));
}
