import { createMemo, createRoot, createSignal } from 'solid-js';
import { acknowledgeAlarm, getAlarmStatus, type Alarm } from '@ignite/client';
import { toast } from '../../ui';

export const PRIORITY_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1, Diagnostic: 0 };

export interface Row {
  id: string;
  group: string;
  /** Tag path relative to [default]BR/, e.g. Cellar/FV03/TempC (what the alarm watches). */
  tag: string;
  name: string;
  label: string;
  priority: string;
  state: string;
  active: boolean;
  acked: boolean;
  activeMs: number;
  clearMs: number;
  /** Zero-length "Cleared" event the tag load creates for every alarm (active time = clear time). */
  artefact: boolean;
}

/** Area of an alarm: brewhouse, one group per fermenter, the other cellar tanks, packaging, utilities, quality. */
export function groupOf(tag: string): string {
  const [head, second] = tag.split('/');
  if (head === 'Brewhouse') return 'Brewhouse';
  if (head === 'Cellar') return /^FV\d\d$/.test(second) ? `Cellar ${second}` : 'Cellar';
  if (head === 'Packaging' || tag === 'KPI/RejectPct') return 'Packaging';
  if (head === 'Utilities') return 'Utilities';
  if (head === 'Batches') return 'Quality';
  return 'Other';
}
const AREA_ORDER = ['Brewhouse', 'Cellar', 'Packaging', 'Utilities', 'Quality', 'Other'];
/** Sort key: brewhouse, cellar (the tank groups by number), packaging, utilities, quality. */
export const groupRank = (g: string): number => {
  const area = g.startsWith('Cellar') ? 'Cellar' : g;
  return AREA_ORDER.indexOf(area) * 100 + (g.startsWith('Cellar ') ? Number(g.slice(-2)) : 0);
};

/**
 * The gateway-wide /alarms/status also lists one zero-length "Cleared, Acknowledged" event per alarm created by the
 * tag load (active = clear time). They are kept and marked `artefact`; the board hides them behind a filter.
 */
export function toRow(a: Alarm): Row | null {
  if (!a.id || !a.displayPath.startsWith('BR/')) return null;
  const activeMs = a.activeTime ? Date.parse(a.activeTime) : Number.NaN;
  const clearMs = a.clearTime ? Date.parse(a.clearTime) : Number.NaN;
  if (!Number.isFinite(activeMs)) return null;
  const parts = a.displayPath.split('/');
  const tag = parts.slice(1, -1).join('/');
  return {
    id: a.id,
    group: groupOf(tag),
    tag,
    name: a.name,
    label: a.label || a.name,
    priority: a.priority ?? 'Low',
    state: a.state ?? '',
    active: !a.isCleared,
    acked: a.isAcked,
    activeMs,
    clearMs: Number.isFinite(clearMs) ? clearMs : Number.NaN,
    artefact: a.isCleared && a.activeTime === a.clearTime,
  };
}

const [rows, setRows] = createSignal<Row[]>([]);
const [error, setError] = createSignal('');
export { rows as alarmRows, error as alarmError };

export const activeRows = createRoot(() => createMemo(() => rows().filter((r) => r.active)));
/** The model's highest priority is High; Critical would count too. These pulse the HUD tile and the dock. */
export const isSevere = (r: Row): boolean => r.priority === 'Critical' || r.priority === 'High';
export const hasSevere = createRoot(() => createMemo(() => activeRows().some(isSevere)));

async function poll(): Promise<void> {
  try {
    const r = await getAlarmStatus();
    setRows((r.alarms ?? []).map(toRow).filter((x): x is Row => x !== null));
    setError('');
  } catch (e) {
    setError(e instanceof Error ? e.message : 'alarm status failed');
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
  /** Where it sits in the glycol supply -> fermenter temperatures -> QA risk chain. */
  level: 'Glycol' | 'Fermenters' | 'QA risk';
}

const levelOf = (r: Row): Step['level'] | null =>
  r.group === 'Utilities' && r.tag.startsWith('Utilities/Glycol') ? 'Glycol'
  : r.group.startsWith('Cellar FV') ? 'Fermenters'
  : r.group === 'Quality' ? 'QA risk'
  : null;

const CASCADE_MS = 10 * 60_000;

/**
 * The latest glycol failure as a timeline: the glycol alarms (supply high, load high), the fermenter temperature and
 * pressure alarms that follow, then the QA hold, in the order they raised. Anchored on the newest glycol alarm and
 * limited to alarms raised within 10 minutes after the first of that cluster. Empty when no glycol alarm is on record.
 */
export function cascadeOf(all: Row[]): Step[] {
  const gly = all.filter((r) => !r.artefact && levelOf(r) === 'Glycol').sort((a, b) => b.activeMs - a.activeMs);
  if (!gly.length) return [];
  let start = gly[0].activeMs;
  for (const g of gly.slice(1)) {
    if (start - g.activeMs > 5 * 60_000) break;
    start = g.activeMs;
  }
  return all
    .filter((r) => !r.artefact && r.activeMs >= start - 1000 && r.activeMs <= start + CASCADE_MS)
    .map((row) => ({ row, level: levelOf(row) }))
    .filter((s): s is Step => s.level !== null)
    .sort((a, b) => a.row.activeMs - b.row.activeMs);
}
