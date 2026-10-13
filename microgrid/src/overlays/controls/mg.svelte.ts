import { HttpError, callLibrary } from '@ignite/client';
import { refreshIdentity } from '../../identity.svelte';
import { toast } from '../../ui.svelte';

/** The slice of mg.status() the panel uses (sim/microgrid/README.md, Library API). */
export interface MgState {
  mode: string;
  scenario: string;
  speed: number;
  scenario_step: number;
  grid: { available: boolean; islanded: boolean };
  bess: Record<string, { mode: string; state: string; soc_pct: number }>;
  pv: Record<string, { curtailed: boolean; setpoint_kw: number; inverters: Record<string, string> }>;
  faults: { grid_out: boolean; charger: number; inverters: string[]; bess_offline: string[] };
  time: { hour: number; cloud_override: number };
  loads: { ev_smart_chargers: number };
  last_error?: string;
}

export const mg = $state<{ status: MgState | null; busy: boolean }>({ status: null, busy: false });

const PROJECT = 'demo';

async function lib<T>(fn: string, args: unknown[] = []): Promise<T> {
  const r = (await callLibrary(PROJECT, `mg.${fn}`, args)) as { result: T };
  return r.result;
}

/** mg.status() is write tier on the gateway: a Viewer or anonymous caller gets a 403 and the panel falls back to tags. */
export async function refreshStatus(): Promise<void> {
  try {
    mg.status = await lib<MgState>('status');
  } catch {
    /* keep the last known state */
  }
}

/** Call an mg.* control, toast the library message, refresh mg.status(). */
export async function run(fn: string, args: unknown[] = []): Promise<boolean> {
  mg.busy = true;
  try {
    const r = await lib<{ ok?: boolean; message?: string }>(fn, args);
    toast(r.message || `${fn} done`, r.ok === false ? 'warn' : 'ok');
    return r.ok !== false;
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) void refreshIdentity();
    toast(e instanceof HttpError && e.status === 403 ? 'That needs a higher tier. Log in first (L).' : `${fn} failed: ${e instanceof Error ? e.message : 'error'}`, 'alarm');
    return false;
  } finally {
    mg.busy = false;
    await refreshStatus();
  }
}
