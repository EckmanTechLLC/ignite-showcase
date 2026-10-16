import { getToken, toQuery, apiBase, postJson, HttpError } from './http.js';
import { readEnv } from './env.js';

export type ConnectionState = 'connecting' | 'open' | 'closed';

export interface TagUpdate {
  path: string;
  value: unknown;
  quality: string;
  timestamp: string;
}

export interface BatchInfo {
  /** True for the batch that carries the server's initial snapshot (one per connection, delivered whole). */
  snapshot: boolean;
}

export interface SubscribeOptions {
  onState?: (state: ConnectionState) => void;
  /** Called with the tag count when the server confirms the subscription (`event: subscribed`). */
  onSubscribed?: (count: number) => void;
  /** Reconnect proactively this long after opening (server cap is 20 min and announces it). Default 19 min. */
  maxConnectionMs?: number;
  /**
   * Register the path list with `POST /sse/subscriptions` and stream it by id. Happens automatically
   * when the plain URL would exceed {@link REGISTER_URL_LIMIT} characters; `true` forces it.
   */
  register?: boolean;
  /**
   * Called when registration fails, with the server's error text in `body`
   * (`too many tags in subscription (limit N)`, a 403 scope denial, ...). Client errors (4xx other
   * than 408/429) are not retried: the subscription stays closed.
   */
  onError?: (error: HttpError) => void;
}

export interface Subscription {
  readonly state: ConnectionState;
  close(): void;
}

export const BACKOFF_MIN_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
export const DEFAULT_MAX_CONNECTION_MS = 19 * 60_000;
/** Deliver a snapshot anyway if `subscribed` has not arrived by then (servers without the event). */
export const SNAPSHOT_TIMEOUT_MS = 3_000;
/** When the plain `paths=` URL would be longer than this, the subscription is registered by POST instead. */
export const REGISTER_URL_LIMIT = 6_000;
/** Registered id lifetime assumed until the server says otherwise (`expiresInMs`). */
const DEFAULT_REGISTRATION_TTL_MS = 60_000;
/** Re-register this long before the id would expire (clock and latency slack). */
const REGISTRATION_SLACK_MS = 5_000;

/** Delay before reconnect attempt n (0-based): 1 s doubling to a 30 s ceiling. */
export function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_MIN_MS * 2 ** attempt, BACKOFF_MAX_MS);
}

/**
 * Build the SSE URL. This is the only place the API key and token appear in a query string.
 * Entries are sent verbatim: explicit paths, or patterns (a trailing `/*` or `/**`, or `*` inside any
 * segment). `{ subscription }` streams a registered id (POST /sse/subscriptions).
 */
export function sseUrl(target: string[] | { subscription: string }): string {
  const { site, key } = readEnv();
  const token = getToken();
  return `${apiBase()}/sse${toQuery({
    ...(Array.isArray(target) ? { paths: target.join(',') } : { subscription: target.subscription }),
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
 * The server's initial snapshot (everything before `event: subscribed`) is delivered as one batch
 * with `info.snapshot === true`. `event: reconnect` makes the client reopen at once, without backoff.
 */
export function subscribe(
  paths: string[],
  onBatch: (batch: TagUpdate[], info: BatchInfo) => void,
  options: SubscribeOptions = {},
): Subscription {
  const maxConnectionMs = options.maxConnectionMs ?? DEFAULT_MAX_CONNECTION_MS;
  const useRegistration = options.register === true || sseUrl(paths).length > REGISTER_URL_LIMIT;
  /** Registered subscription id, its lifetime and when it was last used (each connect refreshes it server side). */
  let subId: string | null = null;
  let subTtlMs = DEFAULT_REGISTRATION_TTL_MS;
  let subUsedAt = 0;
  let registering = false;
  let state: ConnectionState = 'closed';
  let es: EventSource | null = null;
  let closed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let capTimer: ReturnType<typeof setTimeout> | undefined;
  let snapTimer: ReturnType<typeof setTimeout> | undefined;
  /** True from open until `subscribed`: events accumulate and are delivered as one snapshot batch. */
  let snapshotting = false;
  let pending = new Map<string, TagUpdate>();
  let framePending = false;

  const setState = (next: ConnectionState) => {
    if (state === next) return;
    state = next;
    options.onState?.(next);
  };

  const flush = (snapshot = false) => {
    framePending = false;
    if (closed || pending.size === 0) {
      pending.clear();
      return;
    }
    const batch = [...pending.values()];
    pending = new Map();
    onBatch(batch, { snapshot });
  };

  const endSnapshot = () => {
    clearTimeout(snapTimer);
    if (!snapshotting) return;
    snapshotting = false;
    flush(true);
  };

  const enqueue = (u: TagUpdate) => {
    pending.delete(u.path); // keep latest value, move to end
    pending.set(u.path, u);
    if (!framePending && !snapshotting) {
      framePending = true;
      scheduleFrame(flush);
    }
  };

  const teardownSource = () => {
    clearTimeout(capTimer);
    clearTimeout(snapTimer);
    snapshotting = false;
    if (es) {
      es.onopen = es.onmessage = es.onerror = null;
      es.close();
      es = null;
    }
  };

  const failRegistration = (e: unknown) => {
    const err = toHttpError(e);
    options.onError?.(err);
    setState('closed');
    // a client error (bad pattern, scope, tag cap) repeats forever: stop; server/network trouble retries
    if (err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) return;
    retryTimer = setTimeout(connect, backoffDelay(attempt++));
  };

  const register = (): Promise<void> =>
    postJson<{ id: string; expiresInMs?: number }>(`${apiBase()}/sse/subscriptions`, {
      paths,
      alarms: false,
      path: null,
    }).then((r) => {
      subId = r.id;
      subTtlMs = typeof r.expiresInMs === 'number' ? r.expiresInMs : DEFAULT_REGISTRATION_TTL_MS;
      subUsedAt = Date.now();
    });

  /** After a stream error on a registered id: 404/410 = the id expired, register again at once. */
  const idIsStale = async (): Promise<boolean> => {
    if (!subId) return false;
    const ctl = new AbortController();
    try {
      const res = await fetch(sseUrl({ subscription: subId }), { credentials: 'include', signal: ctl.signal });
      return res.status === 404 || res.status === 410;
    } catch {
      return false;
    } finally {
      ctl.abort();
    }
  };

  const connect = () => {
    if (closed || registering) return;
    setState('connecting');
    if (useRegistration && (!subId || Date.now() - subUsedAt >= subTtlMs - REGISTRATION_SLACK_MS)) {
      registering = true;
      register().then(
        () => {
          registering = false;
          open();
        },
        (e) => {
          registering = false;
          if (!closed) failRegistration(e);
        },
      );
      return;
    }
    open();
  };

  const open = () => {
    if (closed) return;
    const source = new EventSource(sseUrl(subId ? { subscription: subId } : paths), { withCredentials: true });
    es = source;
    if (subId) subUsedAt = Date.now();
    source.onopen = () => {
      attempt = 0;
      setState('open');
      snapshotting = true;
      snapTimer = setTimeout(endSnapshot, SNAPSHOT_TIMEOUT_MS);
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
    source.addEventListener('subscribed', (e: Event) => {
      endSnapshot();
      try {
        const msg = JSON.parse(String((e as MessageEvent).data)) as { count?: unknown };
        if (typeof msg.count === 'number') options.onSubscribed?.(msg.count);
      } catch {
        /* ignore malformed frames */
      }
    });
    source.addEventListener('reconnect', () => {
      // The server is about to close the stream (connection cap): reopen at once, no backoff, no 'closed' flap.
      teardownSource();
      connect();
    });
    source.onerror = () => {
      teardownSource();
      setState('closed');
      if (!useRegistration) {
        retryTimer = setTimeout(connect, backoffDelay(attempt++));
        return;
      }
      void idIsStale().then((stale) => {
        if (closed) return;
        if (stale) {
          subId = null; // a fresh connect: register again, no backoff
          connect();
        } else {
          retryTimer = setTimeout(connect, backoffDelay(attempt++));
        }
      });
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

/** The server's JSON `{"error": "..."}` text as the error body, so callers can show it directly. */
function toHttpError(e: unknown): HttpError {
  if (e instanceof HttpError) {
    let text = e.body;
    try {
      const j = JSON.parse(e.body) as { error?: unknown };
      if (typeof j.error === 'string') text = j.error;
    } catch {
      /* body is not JSON */
    }
    return new HttpError(e.status, text, e.retryAfter);
  }
  return new HttpError(0, e instanceof Error ? e.message : String(e));
}
