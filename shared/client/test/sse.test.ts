import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureEnv } from '../src/env.js';
import { setToken } from '../src/http.js';
import { backoffDelay, subscribe, type ConnectionState } from '../src/sse.js';
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

  it('reconnects proactively before the 30 minute cap without closing state', () => {
    const states: ConnectionState[] = [];
    const s = subscribe(['a'], () => {}, { onState: (st) => states.push(st) });
    FakeEventSource.instances[0].open();
    vi.advanceTimersByTime(29 * 60_000);
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
});
