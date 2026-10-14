import { batch, createSignal, type Accessor } from 'solid-js';
import { createStore } from 'solid-js/store';
import { historyOf, probeHealth, subscribe, trialDetail, type ConnectionState, type HistoryHealth, type Subscription, type TagUpdate } from '@ignite/client';
import { LIVE_PATTERNS, PREFIX } from './paths';

/** A tag value as the gateway delivers it. */
export type TagValue = string | number | boolean | null;

// Plain copy of every value (the Pixi scene reads this every frame without tracking) plus one Solid signal per tag,
// created the first time something reads it. Names are relative to PREFIX ("Cellar/FV01/TempC").
const raw = new Map<string, TagValue>();
const sigs = new Map<string, [Accessor<TagValue>, (v: TagValue) => void]>();

function sig(name: string): [Accessor<TagValue>, (v: TagValue) => void] {
  let s = sigs.get(name);
  if (!s) {
    const [get, set] = createSignal<TagValue>(raw.get(name) ?? null, { equals: (a, b) => a === b });
    s = [get, (v) => void set(() => v)];
    sigs.set(name, s);
  }
  return s;
}

/** Live value of one tag (null until the first value arrives). Read it inside a component, memo or effect. */
export const tag = (name: string): TagValue => sig(name)[0]();
export const tagNum = (name: string): number => {
  const v = tag(name);
  return typeof v === 'number' ? v : Number.NaN;
};
export const tagStr = (name: string): string => {
  const v = tag(name);
  return v == null ? '' : String(v);
};
export const tagBool = (name: string): boolean => {
  const v = tag(name);
  return v === true || v === 1 || v === 'true';
};

// Untracked reads for the render loop.
export const rawNum = (name: string): number => {
  const v = raw.get(name);
  return typeof v === 'number' ? v : Number.NaN;
};
export const rawStr = (name: string): string => {
  const v = raw.get(name);
  return v == null ? '' : String(v);
};
export const rawBool = (name: string): boolean => {
  const v = raw.get(name);
  return v === true || v === 1 || v === 'true';
};

const short = (full: string) => (full.startsWith(PREFIX) ? full.slice(PREFIX.length) : full);

// --- connection / data age ---------------------------------------------------------------

export const [live, setLive] = createStore({
  /** Connection state of the single SSE stream. */
  connection: 'connecting' as ConnectionState,
  /** Tags the server confirmed for the stream (`event: subscribed`); 0 until then. */
  tagCount: 0,
  /** From GET /system/status: 'unavailable' when the gateway trial has expired (historian/alarms stopped). */
  history: 'unknown' as HistoryHealth,
  /** Quiet trial detail ("Trial · 1 h 42 m left"); '' when not in Trial mode. */
  trial: '',
  wallNow: Date.now(),
  lastDataAt: 0,
  /** True once the first snapshot has been applied. */
  ready: false,
});

/** Seconds since the last tag update was applied (Infinity before the first). */
export const dataAgeS = (): number => (live.lastDataAt ? Math.max(0, (live.wallNow - live.lastDataAt) / 1000) : Infinity);

/** Counters for the perf readout (plain, not tracked). */
export const stats = { batches: 0, updates: 0 };

/** Simulated absolute hours (day x 24 + hour of day), from the last tick. */
export const simNowH = (): number => tagNum('Time/DayIndex') * 24 + tagNum('Time/HourOfDay');

/** The snapshot and every later batch land here: all signals are written inside one batch, so one update pass follows. */
function apply(updates: TagUpdate[]): void {
  batch(() => {
    for (const u of updates) {
      const name = short(u.path);
      const v = u.value as TagValue;
      raw.set(name, v);
      sigs.get(name)?.[1](v);
    }
    stats.batches++;
    stats.updates += updates.length;
    setLive({ lastDataAt: Date.now(), ready: true });
  });
}

const HEALTH_PROBE_MS = 60_000;

async function probe(): Promise<void> {
  const h = await probeHealth();
  const history = historyOf(h);
  if (history === 'unknown') return;
  setLive({ history, trial: trialDetail(h) });
}

let started = false;
let sub: Subscription | null = null;
let timers: number[] = [];

/** One SSE connection: the server expands the folder patterns and sends every value as a snapshot. */
export function startLive(): void {
  if (started) return;
  started = true;
  sub = subscribe(LIVE_PATTERNS, apply, {
    onState: (s) => setLive('connection', s),
    onSubscribed: (n) => setLive('tagCount', n),
  });
  void probe();
  timers = [window.setInterval(() => setLive('wallNow', Date.now()), 500), window.setInterval(probe, HEALTH_PROBE_MS)];
}

export function stopLive(): void {
  sub?.close();
  sub = null;
  timers.forEach((t) => clearInterval(t));
  timers = [];
  started = false;
}
