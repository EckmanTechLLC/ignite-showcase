import { computed, reactive, shallowRef, type ComputedRef, type ShallowRef } from 'vue';
import { readTags, subscribe, type ConnectionState, type Subscription, type TagUpdate } from '@ignite/client';
import { LIVE_CHUNKS, PREFIX, STATIC_CHUNKS } from './paths';

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

export const chunkStates = reactive<ConnectionState[]>(LIVE_CHUNKS.map(() => 'connecting'));
export const wallNow = shallowRef(Date.now());
export const lastDataAt = shallowRef(0);

const RANK: Record<ConnectionState, number> = { open: 0, connecting: 1, closed: 2 };
/** Worst state across all chunks. */
export const connection = computed<ConnectionState>(() =>
  chunkStates.reduce<ConnectionState>((w, s) => (RANK[s] > RANK[w] ? s : w), 'open'),
);
export const openChunks = computed(() => chunkStates.filter((s) => s === 'open').length);
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

async function seed(chunk: readonly string[]): Promise<void> {
  try {
    const r = await readTags(chunk.map((p) => PREFIX + p));
    for (const t of r.tags) {
      const ref = tagRef(short(t.path));
      // SSE may already have delivered something newer; only fill gaps.
      if (ref.value === null) ref.value = t.value as TagValue;
    }
    if (!lastDataAt.value) lastDataAt.value = Date.now();
  } catch {
    /* the SSE snapshot fills the store regardless */
  }
}

async function refreshStatic(): Promise<void> {
  await Promise.all(
    STATIC_CHUNKS.map(async (chunk) => {
      try {
        const r = await readTags(chunk.map((p) => PREFIX + p));
        for (const t of r.tags) tagRef(short(t.path)).value = t.value as TagValue;
      } catch {
        /* retried on the next refresh */
      }
    }),
  );
}

let started = false;
const subs: Subscription[] = [];
let timers: number[] = [];

/** Seed every chunk with one /tags/read, open one SSE connection per chunk, poll the constants slowly. */
export function startLive(): void {
  if (started) return;
  started = true;
  LIVE_CHUNKS.forEach((chunk, i) => {
    void seed(chunk);
    subs.push(subscribe(chunk.map((p) => PREFIX + p), apply, { onState: (s) => (chunkStates[i] = s) }));
  });
  void refreshStatic();
  timers = [window.setInterval(() => (wallNow.value = Date.now()), 500), window.setInterval(refreshStatic, 30_000)];
}

export function stopLive(): void {
  subs.splice(0).forEach((s) => s.close());
  timers.forEach((t) => clearInterval(t));
  timers = [];
  started = false;
}
