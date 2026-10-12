import { getToken, toQuery, apiBase } from './http.js';
import { readEnv } from './env.js';

export type ConnectionState = 'connecting' | 'open' | 'closed';

export interface TagUpdate {
  path: string;
  value: unknown;
  quality: string;
  timestamp: string;
}

export interface SubscribeOptions {
  onState?: (state: ConnectionState) => void;
  /** Reconnect proactively this long after opening (server cap is 30 min). Default 29 min. */
  maxConnectionMs?: number;
}

export interface Subscription {
  readonly state: ConnectionState;
  close(): void;
}

export const BACKOFF_MIN_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
export const DEFAULT_MAX_CONNECTION_MS = 29 * 60_000;

/** Delay before reconnect attempt n (0-based): 1 s doubling to a 30 s ceiling. */
export function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_MIN_MS * 2 ** attempt, BACKOFF_MAX_MS);
}

/** Build the SSE URL. This is the only place the API key and token appear in a query string. */
export function sseUrl(paths: string[]): string {
  const { site, key } = readEnv();
  const token = getToken();
  return `${apiBase()}/sse${toQuery({
    paths: paths.join(','),
    site,
    apiKey: key,
    token,
  })}`;
}

function scheduleFrame(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fn());
  else setTimeout(fn, 16);
}

/**
 * Subscribe to tag changes. Events are buffered and delivered once per animation frame
 * as a batch holding the latest update per path (insertion order preserved).
 */
export function subscribe(
  paths: string[],
  onBatch: (batch: TagUpdate[]) => void,
  options: SubscribeOptions = {},
): Subscription {
  const maxConnectionMs = options.maxConnectionMs ?? DEFAULT_MAX_CONNECTION_MS;
  let state: ConnectionState = 'closed';
  let es: EventSource | null = null;
  let closed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let capTimer: ReturnType<typeof setTimeout> | undefined;
  let pending = new Map<string, TagUpdate>();
  let framePending = false;

  const setState = (next: ConnectionState) => {
    if (state === next) return;
    state = next;
    options.onState?.(next);
  };

  const flush = () => {
    framePending = false;
    if (closed || pending.size === 0) {
      pending.clear();
      return;
    }
    const batch = [...pending.values()];
    pending = new Map();
    onBatch(batch);
  };

  const enqueue = (u: TagUpdate) => {
    pending.delete(u.path); // keep latest value, move to end
    pending.set(u.path, u);
    if (!framePending) {
      framePending = true;
      scheduleFrame(flush);
    }
  };

  const teardownSource = () => {
    clearTimeout(capTimer);
    if (es) {
      es.onopen = es.onmessage = es.onerror = null;
      es.close();
      es = null;
    }
  };

  const connect = () => {
    if (closed) return;
    setState('connecting');
    const source = new EventSource(sseUrl(paths), { withCredentials: true });
    es = source;
    source.onopen = () => {
      attempt = 0;
      setState('open');
      capTimer = setTimeout(() => {
        // Proactive reconnect before the server's connection cap; no backoff, no 'closed' flap.
        teardownSource();
        connect();
      }, maxConnectionMs);
    };
    source.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(String(e.data)) as Partial<TagUpdate> & { type?: string };
        if (msg.type === 'tagChange' && typeof msg.path === 'string') {
          enqueue({
            path: msg.path,
            value: msg.value,
            quality: msg.quality ?? 'Unknown',
            timestamp: msg.timestamp ?? '',
          });
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    source.onerror = () => {
      teardownSource();
      setState('closed');
      const delay = backoffDelay(attempt++);
      retryTimer = setTimeout(connect, delay);
    };
  };

  connect();

  return {
    get state() {
      return state;
    },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      teardownSource();
      pending.clear();
      setState('closed');
    },
  };
}
