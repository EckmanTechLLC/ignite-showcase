import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureEnv } from '../src/env.js';
import { setToken } from '../src/http.js';
import { backoffDelay, REGISTER_URL_LIMIT, SNAPSHOT_TIMEOUT_MS, sseUrl, subscribe, type ConnectionState } from '../src/sse.js';
import { FakeEventSource, MemoryStorage } from './helpers.js';

const ev = (path: string, value: unknown) => ({ type: 'tagChange', path, value, quality: 'Good', timestamp: 't' });

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('localStorage', new MemoryStorage());
  configureEnv({ gatewayUrl: 'https://gw.example', site: 'launch', key: 'K123' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  configureEnv({});
});

describe('sse', () => {
  it('carries apiKey, token, site and paths as query params', () => {
    setToken('tok-1');
    const s = subscribe(['[default]A', '[default]B'], () => {});
    const u = new URL(FakeEventSource.instances[0].url);
    expect(u.pathname).toBe('/data/ignite/sse');
    expect(u.searchParams.get('apiKey')).toBe('K123');
    expect(u.searchParams.get('token')).toBe('tok-1');
    expect(u.searchParams.get('site')).toBe('launch');
    expect(u.searchParams.get('paths')).toBe('[default]A,[default]B');
    s.close();
  });

  it('coalesces N events into one batch per frame (setTimeout fallback)', () => {
    const onBatch = vi.fn();
    const s = subscribe(['a', 'b'], onBatch);
    const es = FakeEventSource.instances[0];
    es.open();
    es.emitNamed('subscribed', { type: 'subscribed', count: 2 }); // end the (empty) snapshot phase
    for (let i = 0; i < 50; i++) es.emit(ev('a', i));
    es.emit(ev('b', 'x'));
    es.emit({ type: 'other', path: 'z' });
    es.emit('not json');
    expect(onBatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    expect(onBatch).toHaveBeenCalledTimes(1);
    const batch = onBatch.mock.calls[0][0];
    expect(batch).toHaveLength(2);
    expect(batch.find((u: { path: string }) => u.path === 'a').value).toBe(49);
    s.close();
  });

  it('uses requestAnimationFrame when available', () => {
    const cbs: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => cbs.push(cb));
    const onBatch = vi.fn();
    const s = subscribe(['a'], onBatch);
    const es = FakeEventSource.instances[0];
    es.emit(ev('a', 1));
    es.emit(ev('a', 2));
    expect(cbs).toHaveLength(1);
    cbs[0]();
    expect(onBatch).toHaveBeenCalledTimes(1);
    s.close();
  });

  it('backoff sequence is 1s doubling to 30s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(backoffDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it('reconnects with backoff after errors and resets after open', () => {
    const states: ConnectionState[] = [];
    const s = subscribe(['a'], () => {}, { onState: (st) => states.push(st) });
    expect(FakeEventSource.instances).toHaveLength(1);
    FakeEventSource.instances[0].fail();
    expect(states).toEqual(['connecting', 'closed']);
    vi.advanceTimersByTime(999);
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(2);
    FakeEventSource.instances[1].fail();
    vi.advanceTimersByTime(1999);
    expect(FakeEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(3);
    FakeEventSource.instances[2].open();
    expect(s.state).toBe('open');
    FakeEventSource.instances[2].fail();
    vi.advanceTimersByTime(1000);
    expect(FakeEventSource.instances).toHaveLength(4);
    s.close();
    expect(s.state).toBe('closed');
  });

  it('reconnects proactively before the 20 minute cap without closing state', () => {
    const states: ConnectionState[] = [];
    const s = subscribe(['a'], () => {}, { onState: (st) => states.push(st) });
    FakeEventSource.instances[0].open();
    vi.advanceTimersByTime(19 * 60_000);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(states).not.toContain('closed');
    s.close();
  });

  it('close() stops delivery and reconnects', () => {
    const onBatch = vi.fn();
    const s = subscribe(['a'], onBatch);
    const es = FakeEventSource.instances[0];
    es.emit(ev('a', 1));
    s.close();
    vi.advanceTimersByTime(60_000);
    expect(onBatch).not.toHaveBeenCalled();
    expect(es.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('sends folder patterns verbatim in the paths param', () => {
    const s = subscribe(['[default]Launch/**', '[default]DC/Hall/*'], () => {});
    const u = new URL(FakeEventSource.instances[0].url);
    expect(u.searchParams.get('paths')).toBe('[default]Launch/**,[default]DC/Hall/*');
    s.close();
  });

  it('delivers the snapshot as one batch when subscribed arrives, then reports the count', () => {
    const batches: Array<{ n: number; snapshot: boolean }> = [];
    const counts: number[] = [];
    const s = subscribe(['[default]X/**'], (b, info) => batches.push({ n: b.length, snapshot: info.snapshot }), {
      onSubscribed: (c) => counts.push(c),
    });
    const es = FakeEventSource.instances[0];
    es.open();
    for (let i = 0; i < 30; i++) es.emit(ev(`t${i}`, i));
    vi.advanceTimersByTime(100); // no frame delivery while the snapshot is being collected
    expect(batches).toEqual([]);
    es.emitNamed('subscribed', { type: 'subscribed', count: 30 });
    expect(batches).toEqual([{ n: 30, snapshot: true }]);
    expect(counts).toEqual([30]);
    es.emit(ev('t1', 99));
    vi.advanceTimersByTime(16);
    expect(batches[1]).toEqual({ n: 1, snapshot: false });
    s.close();
  });

  it('delivers a snapshot after a timeout when the server never sends subscribed', () => {
    const onBatch = vi.fn();
    const s = subscribe(['a'], onBatch);
    const es = FakeEventSource.instances[0];
    es.open();
    es.emit(ev('a', 1));
    vi.advanceTimersByTime(SNAPSHOT_TIMEOUT_MS - 1);
    expect(onBatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onBatch).toHaveBeenCalledTimes(1);
    expect(onBatch.mock.calls[0][1]).toEqual({ snapshot: true });
    s.close();
  });

  it('reconnects immediately on the reconnect event, without backoff or a closed state', () => {
    const states: ConnectionState[] = [];
    const s = subscribe(['a'], () => {}, { onState: (st) => states.push(st) });
    const first = FakeEventSource.instances[0];
    first.open();
    first.emitNamed('reconnect', { type: 'reconnect' });
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(first.closed).toBe(true);
    expect(states).not.toContain('closed');
    // the new connection starts a fresh snapshot
    const second = FakeEventSource.instances[1];
    second.open();
    expect(s.state).toBe('open');
    s.close();
  });

  it('ignores a malformed subscribed payload but still ends the snapshot', () => {
    const onBatch = vi.fn();
    const onSubscribed = vi.fn();
    const s = subscribe(['a'], onBatch, { onSubscribed });
    const es = FakeEventSource.instances[0];
    es.open();
    es.emit(ev('a', 1));
    es.emitNamed('subscribed', 'not json');
    expect(onBatch).toHaveBeenCalledTimes(1);
    expect(onSubscribed).not.toHaveBeenCalled();
    s.close();
  });

  describe('registered subscriptions', () => {
    const longPaths = () => Array.from({ length: 400 }, (_, i) => `[default]CR/Rooms/R${i}/DP_1/Value`);
    const reg = (id = 'sub-1', status = 200, body: unknown = { id, count: 400, expiresInMs: 60_000 }) =>
      vi.fn(async () => new Response(JSON.stringify(body), { status }));
    const flush = async () => {
      for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0);
    };

    it('keeps short lists on the plain URL (no POST)', () => {
      const fetchFn = reg();
      vi.stubGlobal('fetch', fetchFn);
      const s = subscribe(['[default]CR/Rooms/*/DP_1/Value'], () => {});
      expect(fetchFn).not.toHaveBeenCalled();
      expect(new URL(FakeEventSource.instances[0].url).searchParams.get('paths')).toBe('[default]CR/Rooms/*/DP_1/Value');
      s.close();
    });

    it('sseUrl accepts {subscription}', () => {
      const u = new URL(sseUrl({ subscription: 'abc' }));
      expect(u.searchParams.get('subscription')).toBe('abc');
      expect(u.searchParams.get('paths')).toBeNull();
      expect(u.searchParams.get('apiKey')).toBe('K123');
    });

    it('registers by POST when the URL would exceed the limit, then streams by id', async () => {
      const paths = longPaths();
      expect(sseUrl(paths).length).toBeGreaterThan(REGISTER_URL_LIMIT);
      const fetchFn = reg();
      vi.stubGlobal('fetch', fetchFn);
      const s = subscribe(paths, () => {});
      expect(FakeEventSource.instances).toHaveLength(0);
      await flush();
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://gw.example/data/ignite/sse/subscriptions');
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ paths, alarms: false, path: null });
      expect((init.headers as Record<string, string>)['X-Ignite-Key']).toBe('K123');
      expect(FakeEventSource.instances).toHaveLength(1);
      const u = new URL(FakeEventSource.instances[0].url);
      expect(u.searchParams.get('subscription')).toBe('sub-1');
      expect(u.searchParams.get('paths')).toBeNull();
      s.close();
    });

    it('register: true forces registration for a short list', async () => {
      const fetchFn = reg();
      vi.stubGlobal('fetch', fetchFn);
      const s = subscribe(['[default]A'], () => {}, { register: true });
      await flush();
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(new URL(FakeEventSource.instances[0].url).searchParams.get('subscription')).toBe('sub-1');
      s.close();
    });

    it('re-registers when the id expired before a reconnect', async () => {
      let n = 0;
      const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: `sub-${++n}`, count: 1, expiresInMs: 60_000 }), { status: 200 }));
      vi.stubGlobal('fetch', fetchFn);
      const s = subscribe(['[default]A'], () => {}, { register: true, maxConnectionMs: 120_000 });
      await flush();
      FakeEventSource.instances[0].open();
      await vi.advanceTimersByTimeAsync(120_000); // proactive reconnect after the id's lifetime
      expect(fetchFn).toHaveBeenCalledTimes(2);
      const last = FakeEventSource.instances.at(-1)!;
      expect(new URL(last.url).searchParams.get('subscription')).toBe('sub-2');
      s.close();
    });

    it('re-registers without backoff when the server answers 404 for a stale id', async () => {
      let n = 0;
      const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') return new Response(JSON.stringify({ id: `sub-${++n}`, expiresInMs: 60_000 }), { status: 200 });
        return new Response('{"error":"subscription not found or expired"}', { status: 404 }); // the probe GET
      });
      vi.stubGlobal('fetch', fetchFn);
      const s = subscribe(['[default]A'], () => {}, { register: true });
      await flush();
      FakeEventSource.instances[0].fail();
      await flush();
      const posts = fetchFn.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
      expect(posts).toHaveLength(2);
      expect(FakeEventSource.instances).toHaveLength(2);
      expect(new URL(FakeEventSource.instances[1].url).searchParams.get('subscription')).toBe('sub-2');
      s.close();
    });

    it('keeps the id and backs off when the error is not a stale id', async () => {
      const fetchFn = vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? new Response(JSON.stringify({ id: 'sub-1', expiresInMs: 60_000 }), { status: 200 })
          : new Response('{"error":"too many live connections"}', { status: 503 }));
      vi.stubGlobal('fetch', fetchFn);
      const s = subscribe(['[default]A'], () => {}, { register: true });
      await flush();
      FakeEventSource.instances[0].fail();
      await flush();
      expect(FakeEventSource.instances).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(FakeEventSource.instances).toHaveLength(2);
      expect(new URL(FakeEventSource.instances[1].url).searchParams.get('subscription')).toBe('sub-1');
      s.close();
    });

    it('surfaces the POST error text through onError and does not retry a 400', async () => {
      const fetchFn = vi.fn(async () => new Response('{"error":"too many tags in subscription (limit 1000)"}', { status: 400 }));
      vi.stubGlobal('fetch', fetchFn);
      const onError = vi.fn();
      const states: ConnectionState[] = [];
      const s = subscribe(longPaths(), () => {}, { onError, onState: (st) => states.push(st) });
      await flush();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].status).toBe(400);
      expect(onError.mock.calls[0][0].body).toBe('too many tags in subscription (limit 1000)');
      expect(FakeEventSource.instances).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(states.at(-1)).toBe('closed');
      s.close();
    });

    it('surfaces a scope 403 and retries a 5xx with backoff', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(new Response('{"error":"tag path not permitted"}', { status: 403 }));
      vi.stubGlobal('fetch', fetchFn);
      const onError = vi.fn();
      const s = subscribe(['[default]A'], () => {}, { register: true, onError });
      await flush();
      expect(onError.mock.calls[0][0].body).toBe('tag path not permitted');
      s.close();

      const fail503 = vi.fn(async () => new Response('{"error":"busy"}', { status: 503 }));
      vi.stubGlobal('fetch', fail503);
      const onError2 = vi.fn();
      const s2 = subscribe(['[default]A'], () => {}, { register: true, onError: onError2 });
      await flush();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(fail503).toHaveBeenCalledTimes(2);
      expect(onError2).toHaveBeenCalledTimes(2);
      s2.close();
    });
  });
});
