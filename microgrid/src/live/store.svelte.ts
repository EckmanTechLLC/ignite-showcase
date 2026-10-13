import { probeHistory, subscribe, type ConnectionState, type HistoryHealth, type Subscription, type TagUpdate } from '@ignite/client';
import { LIVE_PATTERN, PREFIX } from './paths';

/** A tag value as the gateway delivers it. */
export type TagValue = string | number | boolean | null;

// One signal per tag, module level: a $state object tracks each key on its own, including a key that does not exist yet.
// Names are relative to PREFIX ("PV/A1/ACkW").
const values: Record<string, TagValue> = $state({});

/** Live value of one tag (null until the first value arrives). Read it inside a template, `$derived` or `$effect`. */
export const tag = (name: string): TagValue => values[name] ?? null;
/** Numeric tag value, or NaN until the first value arrives. */
export const tagNum = (name: string): number => {
  const v = tag(name);
  return typeof v === 'number' ? v : Number.NaN;
};
/** String tag value, '' until the first value arrives. */
export const tagStr = (name: string): string => {
  const v = tag(name);
  return v == null ? '' : String(v);
};
export const tagBool = (name: string): boolean => {
  const v = tag(name);
  return v === true || v === 1 || v === 'true';
};

const short = (full: string) => (full.startsWith(PREFIX) ? full.slice(PREFIX.length) : full);

// --- connection / data age ---------------------------------------------------------------

export const live = $state({
  /** Connection state of the single SSE stream. */
  connection: 'connecting' as ConnectionState,
  /** Tags the server confirmed for the stream (`event: subscribed`); 0 until then. */
  tagCount: 0,
  /** Historian probe: 'unavailable' when history answers with nothing but nulls (gateway trial expired). */
  history: 'unknown' as HistoryHealth,
  wallNow: Date.now(),
  lastDataAt: 0,
});

/** Seconds since the last tag update was applied (Infinity before the first). */
export const dataAgeS = (): number => (live.lastDataAt ? Math.max(0, (live.wallNow - live.lastDataAt) / 1000) : Infinity);

/** Counters for the perf readout (plain, not tracked). */
export const stats = { batches: 0, updates: 0 };

/** The snapshot and every later batch land here: all cells are written in one synchronous pass, so one render follows. */
function apply(updates: TagUpdate[]): void {
  for (const u of updates) values[short(u.path)] = u.value as TagValue;
  stats.batches++;
  stats.updates += updates.length;
  live.lastDataAt = Date.now();
}

/** Historized tag that moves whenever the sim runs; its history going all-null means the historian stopped. */
const HISTORY_PROBE_TAG = PREFIX + 'KPI/NetLoadkW';
const HISTORY_PROBE_MS = 60_000;

async function probe(): Promise<void> {
  const h = await probeHistory(HISTORY_PROBE_TAG);
  if (h !== 'unknown') live.history = h;
}

let started = false;
let sub: Subscription | null = null;
let timers: number[] = [];

/** One SSE connection on `[default]MG/**`: the server expands the folder and sends every value as a snapshot. */
export function startLive(): void {
  if (started) return;
  started = true;
  sub = subscribe([LIVE_PATTERN], apply, {
    onState: (s) => (live.connection = s),
    onSubscribed: (n) => (live.tagCount = n),
  });
  void probe();
  timers = [window.setInterval(() => (live.wallNow = Date.now()), 500), window.setInterval(probe, HISTORY_PROBE_MS)];
}

export function stopLive(): void {
  sub?.close();
  sub = null;
  timers.forEach((t) => clearInterval(t));
  timers = [];
  started = false;
}
