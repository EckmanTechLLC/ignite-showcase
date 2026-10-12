import { computed, shallowRef } from 'vue';
import { acknowledgeAlarm, getAlarmStatus, type Alarm } from '@ignite/client';
import { toast } from '../ui';

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low' | 'Diagnostic';
export const PRIORITY_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1, Diagnostic: 0 };

export interface Row {
  id: string;
  group: string;
  /** Tag path relative to [default]DC/, e.g. Racks/R32/InletTempC (what the alarm watches). */
  tag: string;
  label: string;
  priority: string;
  state: string;
  active: boolean;
  acked: boolean;
  activeMs: number;
  clearMs: number;
}

/** Group a DC alarm by its source: racks by row, then UPS / PDU / CRAH / Hall / the rest. */
export function groupOf(tag: string): string {
  const m = /^Racks\/R(\d+)\//.exec(tag);
  if (m) return `Racks row ${'ABCDEF'[Math.min(5, Math.floor((Number(m[1]) - 1) / 10))]}`;
  if (tag.startsWith('Power/UPS/')) return 'UPS';
  if (tag.startsWith('Power/PDU/')) return 'PDU';
  if (tag.startsWith('Cooling/CRAH/')) return 'CRAH';
  if (tag.startsWith('Hall/')) return 'Hall';
  return 'Power and cooling plant';
}
export const GROUP_ORDER = ['Hall', 'UPS', 'PDU', 'CRAH', 'Power and cooling plant', ...'ABCDEF'.split('').map((r) => `Racks row ${r}`)];

/**
 * The gateway-wide /alarms/status also lists other providers' tags and one zero-length
 * "Cleared, Acknowledged" event per alarm created by the tag load (active = ack = clear time):
 * keep DC alarms with a real duration or a still-open state.
 */
export function toRow(a: Alarm): Row | null {
  if (!a.id || !a.displayPath.startsWith('DC/')) return null;
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

export interface Sample {
  t: number;
  n: number;
  crit: number;
}
const SAMPLE_WINDOW_MS = 15 * 60_000;

export const rows = shallowRef<Row[]>([]);
export const samples = shallowRef<Sample[]>([]);
export const alarmError = shallowRef('');
export const lastFetch = shallowRef(0);

export const activeRows = computed(() => rows.value.filter((r) => r.active));
export const hasCritical = computed(() => activeRows.value.some((r) => r.priority === 'Critical'));

async function poll(): Promise<void> {
  try {
    const r = await getAlarmStatus();
    const next = (r.alarms ?? []).map(toRow).filter((x): x is Row => x !== null);
    rows.value = next;
    alarmError.value = '';
    const now = Date.now();
    const act = next.filter((x) => x.active);
    const cut = now - SAMPLE_WINDOW_MS;
    samples.value = [...samples.value.filter((s) => s.t >= cut), { t: now, n: act.length, crit: act.filter((x) => x.priority === 'Critical').length }];
    lastFetch.value = now;
  } catch (e) {
    alarmError.value = e instanceof Error ? e.message : 'alarm status failed';
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

export interface Storm {
  firstHigh: number | null;
  firstCritical: number | null;
  /** Latest clear time when every event of the storm has cleared, else null (still going). */
  cleared: number | null;
  events: number;
  first: Row | null;
}

/** The most recent cluster of events (gaps <= 5 min): first High -> first Critical -> all clear. */
export function stormOf(all: Row[]): Storm | null {
  const real = all.filter((r) => PRIORITY_RANK[r.priority] >= PRIORITY_RANK.High).sort((a, b) => b.activeMs - a.activeMs);
  if (!real.length) return null;
  const cluster = [real[0]];
  let edge = real[0].activeMs;
  for (const r of real.slice(1)) {
    const end = Number.isFinite(r.clearMs) ? r.clearMs : r.activeMs;
    if (edge - end > 5 * 60_000) break;
    cluster.push(r);
    edge = Math.min(edge, r.activeMs);
  }
  const high = cluster.filter((r) => r.priority === 'High');
  const crit = cluster.filter((r) => r.priority === 'Critical');
  const min = (a: Row[]) => (a.length ? Math.min(...a.map((r) => r.activeMs)) : null);
  const first = cluster.reduce((m, r) => (r.activeMs < m.activeMs ? r : m), cluster[0]);
  const open = cluster.some((r) => r.active);
  const cleared = open ? null : Math.max(...cluster.map((r) => (Number.isFinite(r.clearMs) ? r.clearMs : r.activeMs)));
  return { firstHigh: min(high), firstCritical: min(crit), cleared, events: cluster.length, first };
}
