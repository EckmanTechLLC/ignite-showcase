import { readTags, sseUrl, subscribe, type ConnectionState, type Subscription, type TagUpdate } from '@ignite/client';
import { PROVIDER, TAG_NAMES, TAG_PATHS, type TagName } from './paths';

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
  /** True once the initial /tags/read finished (successfully or not). */
  loaded: boolean;
}

let conn: ConnectionInfo = { state: 'connecting', lastEventAt: 0, loaded: false };
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

// The gateway sends every tag's current value when a stream opens. Values arriving in that first
// burst are "initial", not events: sinceChange() reports Infinity for them (a page loaded mid-flight
// must not replay the stage separation).
const INITIAL_BURST_MS = 2500;
let burstEndsAt = 0;

function onBatch(batch: TagUpdate[]): void {
  const now = performance.now();
  if (burstEndsAt === 0) burstEndsAt = now + INITIAL_BURST_MS;
  const at = now < burstEndsAt ? -Infinity : now;
  for (const u of batch) {
    const name = toName(u.path);
    if (!name) continue;
    if (name === 'Launch/_Sim_/State/TMinusExact') clockSampleAt = now;
    apply(name, u.value, at);
  }
  emitConn({ lastEventAt: Date.now() });
}

/** Split a path list so that each SSE URL stays under the limit (Jetty rejects request lines > 8 KiB). */
export function splitPaths(paths: string[], limit = 6500): string[][] {
  if (sseUrl(paths).length <= limit) return [paths];
  const mid = Math.ceil(paths.length / 2);
  return [...splitPaths(paths.slice(0, mid), limit), ...splitPaths(paths.slice(mid), limit)];
}

async function initialRead(): Promise<void> {
  const ingest = (tags: { path: string; value: unknown }[]) => {
    for (const t of tags) {
      const name = toName(t.path);
      if (name && !values.has(name)) apply(name, t.value, -Infinity);
    }
  };
  try {
    ingest((await readTags(TAG_PATHS)).tags);
  } catch {
    // The URL may be too long for one request; retry in chunks.
    for (let i = 0; i < TAG_PATHS.length; i += 40) {
      try {
        ingest((await readTags(TAG_PATHS.slice(i, i + 40))).tags);
      } catch {
        /* the SSE stream will fill in what is missing */
      }
    }
  }
}

/** Re-read after a reconnect so changes missed while the stream was down are not lost. */
async function resync(): Promise<void> {
  try {
    const now = performance.now();
    for (const t of (await readTags(TAG_PATHS)).tags) {
      const name = toName(t.path);
      if (name) apply(name, t.value, now);
    }
  } catch {
    /* next event will correct it */
  }
}

let started = false;

/** Start the live feed once: initial read, then one coalesced subscription over every Launch tag. */
export function startLive(): void {
  if (started) return;
  started = true;
  const parts = splitPaths(TAG_PATHS);
  const states: ConnectionState[] = parts.map(() => 'connecting');
  let everOpen = false;
  const subs: Subscription[] = parts.map((paths, i) =>
    subscribe(paths, onBatch, {
      onState: (s) => {
        states[i] = s;
        const agg: ConnectionState = states.every((x) => x === 'open')
          ? 'open'
          : states.some((x) => x === 'closed')
            ? 'closed'
            : 'connecting';
        const wasOpen = conn.state === 'open';
        emitConn({ state: agg });
        if (agg === 'open' && !wasOpen) {
          if (everOpen) void resync();
          everOpen = true;
        }
      },
    }),
  );
  void initialRead().finally(() => emitConn({ loaded: true }));
  // Keep the subscriptions referenced for the lifetime of the page (no teardown path: single-page app).
  void subs;
}

/** Dev tool (exposed on window in dev builds only): set tag values without a gateway. `fresh` marks them as just changed. */
export function __seed(map: Partial<Record<TagName, unknown>>, fresh = false): void {
  const at = fresh ? performance.now() : -Infinity;
  clockSampleAt = performance.now();
  for (const [k, v] of Object.entries(map)) apply(k as TagName, v, at);
}
