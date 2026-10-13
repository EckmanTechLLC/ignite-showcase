import { createSignal } from 'solid-js';
import { HttpError, callLibrary } from '@ignite/client';
import { refreshIdentity } from '../../identity';
import { toast } from '../../ui';

/** The slice of brew.status() the panel uses (sim/brewery/README.md, Library API). */
export interface BrewState {
  mode: string;
  scenario: string;
  speed: number;
  ferment_accel: number;
  schedule: { brews_per_day: number; queue: string; next_recipe: string };
  line: { state: string; held: boolean; batch: string; format: string };
  faults: string[];
  pending: { start_batch: string; changeover: string; cip: string; qa_release: string; qa_dump: string };
  last_error?: string;
}

export const [status, setStatus] = createSignal<BrewState | null>(null);
export const [busy, setBusy] = createSignal(false);

const PROJECT = 'demo';

async function lib<T>(fn: string, args: unknown[] = []): Promise<T> {
  const r = (await callLibrary(PROJECT, `brew.${fn}`, args)) as { result: T };
  return r.result;
}

/** brew.status() is write tier on the gateway: a Viewer or anonymous caller gets a 403 and the panel falls back to tags. */
export async function refreshStatus(): Promise<void> {
  try {
    setStatus(await lib<BrewState>('status'));
  } catch {
    /* keep the last known state */
  }
}

/** Call a brew.* control, toast the library message, refresh brew.status(). */
export async function run(fn: string, args: unknown[] = []): Promise<boolean> {
  setBusy(true);
  try {
    const r = await lib<{ ok?: boolean; message?: string }>(fn, args);
    toast(r.message || `${fn} done`, r.ok === false ? 'warn' : 'ok');
    return r.ok !== false;
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) void refreshIdentity();
    toast(e instanceof HttpError && e.status === 403 ? 'That needs a higher tier. Log in first (L).' : `${fn} failed: ${e instanceof Error ? e.message : 'error'}`, 'alarm');
    return false;
  } finally {
    setBusy(false);
    await refreshStatus();
  }
}
