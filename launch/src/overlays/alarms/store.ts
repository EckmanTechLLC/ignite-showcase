import { useSyncExternalStore } from 'react';
import { buildUrl, getAlarmStatus, HttpError, postJson, type Alarm } from '@ignite/client';
import { getValue, str, subscribeTag } from '../../live/store';
import { TAG_NAMES, type TagName } from '../../live/paths';
import { refreshSession } from '../identity/session';
import { toast, visible } from '../ui';

/**
 * Alarm board data: GET /alarms/status every 3 s (paused while the tab is hidden). The gateway returns
 * every alarm on the server, so keep only Launch tags, and drop the zero-length Cleared/Acknowledged events
 * the tag load leaves behind (they have no activeTime; sim/datacenter/README.md).
 */

export interface LaunchAlarm extends Alarm {
  tag: TagName | null;
  active: boolean;
  /** Current value of the source tag, formatted; '--' when unknown. */
  value: string;
}

export interface AlarmSnapshot {
  alarms: LaunchAlarm[];
  activeCount: number;
  unackedCount: number;
  criticalActive: boolean;
  error: string | null;
  updatedAt: number;
}

const POLL_MS = 3000;
const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Diagnostic: 4 };
const KNOWN = new Set<string>(TAG_NAMES);

export const priorityRank = (p: string | null): number => PRIORITY_RANK[p ?? ''] ?? 9;

let snap: AlarmSnapshot = { alarms: [], activeCount: 0, unackedCount: 0, criticalActive: false, error: null, updatedAt: 0 };
const listeners = new Set<() => void>();

function emit(next: AlarmSnapshot): void {
  snap = next;
  for (const l of [...listeners]) l();
}

export function useAlarms(): AlarmSnapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snap,
  );
}

/** 'prov:default:/tag:Launch/Propellant/LOX/PressureBar:/alm:LowPressure' -> 'Launch/Propellant/LOX/PressureBar' */
function sourceTag(source: string | null): TagName | null {
  const m = /\/tag:(.+?):\/alm:/.exec(source ?? '');
  return m && KNOWN.has(m[1]) ? (m[1] as TagName) : null;
}

function fmtValue(tag: TagName | null): string {
  if (!tag) return '--';
  const v = getValue(tag);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return v === undefined || v === null ? '--' : String(v);
}

/** Active-unacked first, then active-acked, cleared-unacked, cleared-acked; priority, then newest. */
export function sortAlarms(list: LaunchAlarm[]): LaunchAlarm[] {
  const bucket = (a: LaunchAlarm) => (a.active ? (a.isAcked ? 1 : 0) : a.isAcked ? 3 : 2);
  return [...list].sort(
    (a, b) =>
      bucket(a) - bucket(b) ||
      priorityRank(a.priority) - priorityRank(b.priority) ||
      (b.activeTime ?? '').localeCompare(a.activeTime ?? ''),
  );
}

export function shape(raw: Alarm[]): AlarmSnapshot {
  const alarms: LaunchAlarm[] = [];
  for (const a of raw) {
    if (!(a.source ?? '').includes('/tag:Launch/')) continue;
    if (!a.activeTime) continue;
    const tag = sourceTag(a.source);
    alarms.push({ ...a, tag, active: !a.isCleared, value: fmtValue(tag) });
  }
  const sorted = sortAlarms(alarms);
  return {
    alarms: sorted,
    activeCount: sorted.filter((a) => a.active).length,
    unackedCount: sorted.filter((a) => !a.isAcked).length,
    criticalActive: sorted.some((a) => a.active && a.priority === 'Critical'),
    error: null,
    updatedAt: Date.now(),
  };
}

export async function refreshAlarms(): Promise<void> {
  try {
    const r = await getAlarmStatus();
    emit(shape(r.alarms ?? []));
  } catch (e) {
    emit({ ...snap, error: e instanceof HttpError ? `HTTP ${e.status}` : 'offline' });
  }
}

/** Acknowledge by id (POST /alarms/acknowledge accepts ids[]). */
export async function acknowledge(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await postJson<{ acknowledged: number }>(buildUrl('/alarms/acknowledge'), { ids });
    // The reply's count is 0 for already-cleared alarms even though they are acknowledged, so report what was sent.
    toast(`Acknowledged ${ids.length} alarm${ids.length === 1 ? '' : 's'}`);
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) void refreshSession();
    toast(e instanceof HttpError && e.status === 403 ? 'Acknowledge needs the Operator tier' : 'Acknowledge failed', 'bad');
  }
  await refreshAlarms();
}

// --- abort cascade (LOX low -> NO-GO hold -> ABORT), latched until the vehicle recycles ---

export interface Cascade {
  lowPressure: boolean;
  noGoHold: boolean;
  abort: boolean;
}

let cascade: Cascade = { lowPressure: false, noGoHold: false, abort: false };
const cascadeListeners = new Set<() => void>();

function updateCascade(): void {
  const phase = str('Launch/Clock/Phase', 'IDLE');
  const reason = str('Launch/Clock/HoldReason');
  const low = snap.alarms.some((a) => a.active && a.name === 'LowPressure');
  let next: Cascade;
  if (phase === 'IDLE' || phase === 'RECYCLE') next = { lowPressure: false, noGoHold: false, abort: false };
  else
    next = {
      lowPressure: cascade.lowPressure || low,
      noGoHold: cascade.noGoHold || (phase === 'HOLD' && reason.startsWith('NO-GO')),
      abort: cascade.abort || phase === 'ABORT',
    };
  if (next.lowPressure !== cascade.lowPressure || next.noGoHold !== cascade.noGoHold || next.abort !== cascade.abort) {
    cascade = next;
    for (const l of [...cascadeListeners]) l();
  }
}

export function useCascade(): Cascade {
  return useSyncExternalStore(
    (cb) => {
      cascadeListeners.add(cb);
      return () => cascadeListeners.delete(cb);
    },
    () => cascade,
  );
}

let started = false;
export function startAlarms(): void {
  if (started) return;
  started = true;
  const tick = async () => {
    if (visible()) {
      await refreshAlarms();
      updateCascade();
    }
  };
  void tick();
  setInterval(() => void tick(), POLL_MS);
  document.addEventListener('visibilitychange', () => visible() && void tick());
  subscribeTag('Launch/Clock/Phase', updateCascade);
  subscribeTag('Launch/Clock/HoldReason', updateCascade);
}
