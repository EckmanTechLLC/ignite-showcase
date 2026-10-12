import { callLibrary, HttpError } from '@ignite/client';
import { refreshSession } from '../identity/session';
import { toast, visible } from '../ui';
import { useSyncExternalStore } from 'react';
import { subscribeTag } from '../../live/store';

/** Calls into the `launch` project library (sim/launch/README.md, Library API) through POST /script/library. */

export interface LaunchState {
  phase: string;
  t_minus: number;
  clock_running: boolean;
  hold_reason: string;
  scenario: string;
  speed: number;
  auto_cycle: boolean;
  go: Record<string, boolean>;
  no_go: string[];
  faults: Record<string, boolean>;
  can: Record<'start_count' | 'resume' | 'hold' | 'abort' | 'recycle', boolean>;
  command_pending: boolean;
  /** Real seconds until RECYCLE ends (0 outside RECYCLE). Absent on older sim builds. */
  recycle_remaining_s?: number;
}

interface Reply {
  ok: boolean;
  message: string;
  state?: LaunchState;
}

const PROJECT = 'demo';

async function call<T>(fn: string, args: unknown[] = []): Promise<T> {
  const r = (await callLibrary(PROJECT, `launch.${fn}`, args)) as { result: T };
  return r.result;
}

let state: LaunchState | null = null;
const listeners = new Set<() => void>();
const emit = (s: LaunchState | null) => {
  state = s;
  for (const l of [...listeners]) l();
};

export function useLaunchState(): LaunchState | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

/** launch.status() (write tier on the gateway). A 403 for a Viewer leaves the state unknown. */
export async function refreshStatus(): Promise<void> {
  try {
    emit(await call<LaunchState>('status'));
  } catch {
    /* a Viewer cannot call the library; the panel shows the tag-derived state instead */
  }
}

/** Run a command, toast the library's message, refresh the status. Resolves to the reply's ok flag. */
export async function command(fn: string, args: unknown[] = []): Promise<boolean> {
  try {
    const r = await call<Reply>(fn, args);
    toast(r.message || (r.ok ? 'OK' : 'Refused'), r.ok ? 'ok' : 'warn');
    void refreshStatus();
    return r.ok;
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) void refreshSession();
    toast(e instanceof HttpError && e.status === 403 ? 'That needs a higher tier. Log in first (L).' : `Command failed${e instanceof HttpError ? ` (HTTP ${e.status})` : ''}`, 'bad');
    return false;
  }
}

// --- restart: abort / recycle / start, one safe step per status refresh ---

let restarting = false;
const restartListeners = new Set<() => void>();
const setRestarting = (v: boolean) => {
  restarting = v;
  for (const l of [...restartListeners]) l();
};

export function useRestarting(): boolean {
  return useSyncExternalStore(
    (cb) => {
      restartListeners.add(cb);
      return () => restartListeners.delete(cb);
    },
    () => restarting,
  );
}

export function cancelRestart(): void {
  setRestarting(false);
}

/**
 * "Restart count": the sim only starts a count from IDLE and only recycles from HOLD/ABORT/SAFING/ORBIT,
 * so a running count is aborted, recycled and restarted in turn. Each step waits for `can` to allow it.
 */
export function beginRestart(): void {
  setRestarting(true);
  void stepRestart();
}

let stepping = false;
async function stepRestart(): Promise<void> {
  if (!restarting || stepping) return;
  stepping = true;
  try {
    await refreshStatus();
    const s = state;
    if (!s || s.command_pending) return;
    if (s.can.start_count) {
      setRestarting(false);
      await command('start_count');
    } else if (s.can.recycle) {
      await command('recycle');
    } else if (s.can.abort) {
      await command('abort', ['Operator restart']);
    }
  } finally {
    stepping = false;
  }
}

let started = false;
let kick: ReturnType<typeof setTimeout> | null = null;
/**
 * launch.status() is audited like every library call, so it is not polled hard: every 10 s while `wanted()`
 * (panel open, Operator tier, tab visible), plus shortly after the phase, hold, command slot or scenario tags
 * change. The restart macro steps every 2 s while it runs.
 */
export function startStatusPolling(wanted: () => boolean): void {
  if (started) return;
  started = true;
  const refresh = () => {
    if (visible() && wanted()) void refreshStatus();
  };
  const soon = () => {
    if (kick) clearTimeout(kick);
    kick = setTimeout(refresh, 600);
  };
  for (const t of ['Launch/Clock/Phase', 'Launch/Clock/HoldReason', 'Launch/_Sim_/Cmd/Pending', 'Launch/_Sim_/Scenario'] as const) subscribeTag(t, soon);
  setInterval(() => {
    if (!visible()) return;
    if (restarting) void stepRestart();
  }, 2000);
  setInterval(refresh, 10_000);
}
