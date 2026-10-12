import { probeHistory, subscribe, type BatchInfo, type ConnectionState, type HistoryHealth, type TagUpdate } from '@ignite/client';
import { PROVIDER, TAG_NAMES, type TagName } from './paths';

/**
 * Mutable tag store: a plain module, no framework. The scene reads it inside useFrame (no React
 * involved); the HUD reads it through useTagValue (useSyncExternalStore, notified per changed path).
 */

type Listener = () => void;

const values = new Map<TagName, unknown>();
/** performance.now() at which each tag last changed; -Infinity for values from the initial read. */
const changedAt = new Map<TagName, number>();
const listeners = new Map<TagName, Set<Listener>>();
const known = new Set<string>(TAG_NAMES);

export interface ConnectionInfo {
  state: ConnectionState;
  /** Date.now() of the last SSE batch (0 before the first). */
  lastEventAt: number;
  /** True once the first snapshot has been applied. */
  loaded: boolean;
  /** Tags the server confirmed for this connection (`event: subscribed`); 0 until then. */
  tagCount: number;
  /** Historian probe: 'unavailable' when history answers with nothing but nulls (gateway trial expired). */
  history: HistoryHealth;
}

let conn: ConnectionInfo = { state: 'connecting', lastEventAt: 0, loaded: false, tagCount: 0, history: 'unknown' };
const connListeners = new Set<Listener>();

function emitConn(patch: Partial<ConnectionInfo>): void {
  conn = { ...conn, ...patch };
  for (const l of [...connListeners]) l();
}

export function getConnection(): ConnectionInfo {
  return conn;
}

export function subscribeConnection(fn: Listener): () => void {
  connListeners.add(fn);
  return () => connListeners.delete(fn);
}

export function subscribeTag(name: TagName, fn: Listener): () => void {
  let set = listeners.get(name);
  if (!set) listeners.set(name, (set = new Set()));
  set.add(fn);
  return () => set!.delete(fn);
}

export function getValue(name: TagName): unknown {
  return values.get(name);
}

export function num(name: TagName, fallback = 0): number {
  const v = values.get(name);
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return fallback;
}

export function bool(name: TagName, fallback = false): boolean {
  const v = values.get(name);
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return fallback;
}

export function str(name: TagName, fallback = ''): string {
  const v = values.get(name);
  return typeof v === 'string' ? v : v === undefined || v === null ? fallback : String(v);
}

/** Seconds since the tag last changed via SSE; Infinity when it only ever held its initial value. */
export function sinceChange(name: TagName): number {
  const t = changedAt.get(name);
  return t === undefined ? Infinity : (performance.now() - t) / 1000;
}

function toName(path: string): TagName | null {
  const rel = path.startsWith(PROVIDER) ? path.slice(PROVIDER.length) : path;
  return known.has(rel) ? (rel as TagName) : null;
}

function apply(name: TagName, value: unknown, at: number): void {
  const prev = values.get(name);
  if (prev === value && values.has(name)) return;
  values.set(name, value);
  changedAt.set(name, at);
  const set = listeners.get(name);
  if (set) for (const l of [...set]) l();
}

// Wall-clock sample time of the most recent clock tags, for extrapolating the mission clock.
let clockSampleAt = performance.now();
export function clockAge(): number {
  return (performance.now() - clockSampleAt) / 1000;
}

// The gateway sends every tag's current value when a stream opens (the snapshot). Those values are
// "initial", not events: sinceChange() reports Infinity for the first snapshot (a page loaded mid-flight
// must not replay the stage separation). Snapshots after a reconnect are real changes and keep their time.
let firstSnapshotDone = false;

/** Counters for the perf readout. */
export const stats = { batches: 0, updates: 0 };

function onBatch(batch: TagUpdate[], info: BatchInfo): void {
  const now = performance.now();
  stats.batches++;
  stats.updates += batch.length;
  const at = info.snapshot && !firstSnapshotDone ? -Infinity : now;
  if (info.snapshot) firstSnapshotDone = true;
  for (const u of batch) {
    const name = toName(u.path);
    if (!name) continue;
    if (name === 'Launch/_Sim_/State/TMinusExact') clockSampleAt = now;
    apply(name, u.value, at);
  }
  emitConn({ lastEventAt: Date.now(), loaded: true });
}

/** One folder subscription covers every Launch tag (one SSE connection per page). */
export const LIVE_PATTERN = `${PROVIDER}Launch/**`;

/** Historized tag that moves whenever the sim runs; its history going all-null means the historian stopped. */
const HISTORY_PROBE_TAG = `${PROVIDER}Launch/Propellant/LOX/TankLevelPct`;
const HISTORY_PROBE_MS = 60_000;

let started = false;

/** Start the live feed once: a single SSE connection on `[default]Launch/**` (the server sends the snapshot). */
export function startLive(): void {
  if (started) return;
  started = true;
  subscribe([LIVE_PATTERN], onBatch, {
    onState: (state) => emitConn({ state }),
    onSubscribed: (tagCount) => emitConn({ tagCount }),
  });
  const probe = () =>
    void probeHistory(HISTORY_PROBE_TAG).then((history) => {
      if (history !== 'unknown' && history !== conn.history) emitConn({ history });
    });
  probe();
  setInterval(probe, HISTORY_PROBE_MS);
}

/** Dev tool (exposed on window in dev builds only): set tag values without a gateway. `fresh` marks them as just changed. */
export function __seed(map: Partial<Record<TagName, unknown>>, fresh = false): void {
  const at = fresh ? performance.now() : -Infinity;
  clockSampleAt = performance.now();
  for (const [k, v] of Object.entries(map)) apply(k as TagName, v, at);
}
