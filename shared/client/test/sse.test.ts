import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureEnv } from '../src/env.js';
import { setToken } from '../src/http.js';
import { backoffDelay, SNAPSHOT_TIMEOUT_MS, subscribe, type ConnectionState } from '../src/sse.js';
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
});
