import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue';
import { probeHistory, subscribe, type ConnectionState, type HistoryHealth, type Subscription, type TagUpdate } from '@ignite/client';
import { LIVE_PATTERN, PREFIX } from './paths';

/** A tag value as the gateway delivers it. */
export type TagValue = string | number | boolean | null;

// One shallowRef per tag, module level, no Pinia. Names are relative to PREFIX ("Racks/R01/InletTempC").
const refs = new Map<string, ShallowRef<TagValue>>();

export function tagRef(name: string): ShallowRef<TagValue> {
  let r = refs.get(name);
  if (!r) {
    r = shallowRef<TagValue>(null);
    refs.set(name, r);
  }
  return r;
}

/** Reactive live value of one tag (read-only view). */
export function useTag(name: string): Readonly<ShallowRef<TagValue>> {
  return tagRef(name);
}

/** Numeric tag value, or NaN until the first value arrives. */
export function useTagNumber(name: string): ComputedRef<number> {
  const r = tagRef(name);
  return computed(() => (typeof r.value === 'number' ? r.value : Number.NaN));
}

/** String tag value, '' until the first value arrives. */
export function useTagString(name: string): ComputedRef<string> {
  const r = tagRef(name);
  return computed(() => (r.value == null ? '' : String(r.value)));
}

export function useTagBool(name: string): ComputedRef<boolean | null> {
  const r = tagRef(name);
  return computed(() => (typeof r.value === 'boolean' ? r.value : r.value == null ? null : Boolean(r.value)));
}

const short = (full: string) => (full.startsWith(PREFIX) ? full.slice(PREFIX.length) : full);

// --- connection / data age ---------------------------------------------------------------

/** Connection state of the single SSE stream. */
export const connection = shallowRef<ConnectionState>('connecting');
/** Tags the server confirmed for the stream (`event: subscribed`); 0 until then. */
export const tagCount = shallowRef(0);
/** Historian probe: 'unavailable' when history answers with nothing but nulls (gateway trial expired). */
export const historyHealth = shallowRef<HistoryHealth>('unknown');
export const wallNow = shallowRef(Date.now());
export const lastDataAt = shallowRef(0);

/** Seconds since the last tag update was applied (Infinity before the first). */
export const dataAgeS = computed(() => (lastDataAt.value ? Math.max(0, (wallNow.value - lastDataAt.value) / 1000) : Infinity));

/** Counters for the perf readout. */
export const stats = { batches: 0, updates: 0 };

function apply(updates: TagUpdate[]): void {
  for (const u of updates) tagRef(short(u.path)).value = u.value as TagValue;
  stats.batches++;
  stats.updates += updates.length;
  lastDataAt.value = Date.now();
}

/** Historized tag that moves whenever the sim runs; its history going all-null means the historian stopped. */
const HISTORY_PROBE_TAG = PREFIX + 'Hall/TotalFacilityKW';
const HISTORY_PROBE_MS = 60_000;

async function probe(): Promise<void> {
  const h = await probeHistory(HISTORY_PROBE_TAG);
  if (h !== 'unknown') historyHealth.value = h;
}

let started = false;
let sub: Subscription | null = null;
let timers: number[] = [];

/** One SSE connection on `[default]DC/**`: the server expands the folder and sends every value as a snapshot. */
export function startLive(): void {
  if (started) return;
  started = true;
  sub = subscribe([LIVE_PATTERN], apply, {
    onState: (s) => (connection.value = s),
    onSubscribed: (n) => (tagCount.value = n),
  });
  void probe();
  timers = [window.setInterval(() => (wallNow.value = Date.now()), 500), window.setInterval(probe, HISTORY_PROBE_MS)];
}

export function stopLive(): void {
  sub?.close();
  sub = null;
  timers.forEach((t) => clearInterval(t));
  timers = [];
  started = false;
}
