import { shallowRef } from 'vue';
import { callLibrary } from '@ignite/client';
import { toast } from '../ui';

/** The slice of dc.status() the panel gates on. */
export interface DcState {
  mode: string;
  scenario: string;
  speed: number;
  workload_profile: string;
  utility_available: boolean;
  ats: string;
  active_alarms: number;
  faults: { utility_out: boolean; crah: number };
  crah: Record<string, string>;
  last_error?: string;
}

export const status = shallowRef<DcState | null>(null);
export const busy = shallowRef(false);

const PROJECT = 'demo';

async function lib<T>(fn: string, args: unknown[] = []): Promise<T> {
  const r = (await callLibrary(PROJECT, `dc.${fn}`, args)) as { result: T };
  return r.result;
}

export async function refreshStatus(): Promise<void> {
  try {
    status.value = await lib<DcState>('status');
  } catch {
    /* keep the last known state */
  }
}

/** Call a dc.* control, toast the library message, refresh dc.status(). */
export async function run(fn: string, args: unknown[] = []): Promise<void> {
  busy.value = true;
  try {
    const r = await lib<{ ok?: boolean; message?: string }>(fn, args);
    toast(r.message ?? `${fn} done`, r.ok === false ? 'warn' : 'ok');
  } catch (e) {
    toast(`${fn} failed: ${e instanceof Error ? e.message : 'error'}`, 'alarm');
  } finally {
    busy.value = false;
    await refreshStatus();
  }
}
