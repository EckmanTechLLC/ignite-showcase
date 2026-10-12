import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureEnv } from '../src/env.js';
import { getToken, onUnauthorized, setToken } from '../src/http.js';
import { readTags, getHistory, writeTags } from '../src/api/tags.js';
import { getAlarmHistory, getAlarmStatus, acknowledgeAlarm } from '../src/api/alarms.js';
import { callLibrary, callSystem } from '../src/api/scripts.js';
import { namedQuery } from '../src/api/db.js';
import { getAuditLogs } from '../src/api/audit.js';
import { login, logout } from '../src/api/auth.js';
import { lastCall, MemoryStorage, mockFetch } from './helpers.js';

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  configureEnv({ gatewayUrl: 'https://gw.example/', site: 'launch', key: 'K123' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  configureEnv({});
});

describe('header policy', () => {
  it('sends site and key headers, no Authorization without a token', async () => {
    const f = mockFetch(200, { tags: [] });
    await readTags(['[default]A/B']);
    const { headers, url } = lastCall(f);
    expect(headers['X-Ignite-Site']).toBe('launch');
    expect(headers['X-Ignite-Key']).toBe('K123');
    expect(headers['Authorization']).toBeUndefined();
    expect(url).toBe('https://gw.example/data/ignite/tags/read?paths=%5Bdefault%5DA%2FB');
  });

  it('adds Bearer when a token is stored', async () => {
    setToken('tok-1');
    const f = mockFetch();
    await readTags(['x']);
    expect(lastCall(f).headers['Authorization']).toBe('Bearer tok-1');
  });

  it('omits key and site headers when unknown', async () => {
    configureEnv({ gatewayUrl: '', site: '', key: '' });
    const f = mockFetch();
    await readTags(['x']);
    const { headers, url } = lastCall(f);
    expect(headers['X-Ignite-Site']).toBeUndefined();
    expect(headers['X-Ignite-Key']).toBeUndefined();
    expect(url.startsWith('/data/ignite/tags/read')).toBe(true);
  });

  it('never puts credentials in non-SSE URLs', async () => {
    setToken('tok-secret');
    const f = mockFetch();
    const calls: Array<() => Promise<unknown>> = [
      () => readTags(['a']),
      () => writeTags([{ path: 'a', value: 1 }]),
      () => getHistory(['a'], new Date(0), new Date(1000), 50),
      () => getAlarmStatus(),
      () => getAlarmHistory({ path: 'p' }),
      () => acknowledgeAlarm('id1'),
      () => callLibrary('demo', 'launch.resume'),
      () => callSystem('system.tag.readBlocking'),
      () => namedQuery('q', { a: 1 }),
      () => getAuditLogs({ auditProfile: 'IgniteAudit' }),
    ];
    for (const c of calls) {
      await c();
      const { url } = lastCall(f);
      expect(url).not.toMatch(/apiKey|K123|tok-secret|token=/);
    }
  });
});

describe('401 handling', () => {
  it('clears the token, emits unauthorized and throws', async () => {
    setToken('stale');
    mockFetch(401, { error: 'Unauthorized' });
    const seen = vi.fn();
    const off = onUnauthorized(seen);
    await expect(readTags(['a'])).rejects.toThrow(/HTTP 401/);
    off();
    expect(getToken()).toBeNull();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('does not emit when no token was stored', async () => {
    mockFetch(401);
    const seen = vi.fn();
    const off = onUnauthorized(seen);
    await expect(readTags(['a'])).rejects.toThrow();
    off();
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('wrappers', () => {
  it('builds the history query string', async () => {
    const f = mockFetch();
    await getHistory(['[default]A', '[default]B'], new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T01:00:00Z'), 200);
    const u = new URL(lastCall(f).url);
    expect(u.pathname).toBe('/data/ignite/tags/history');
    expect(u.searchParams.get('paths')).toBe('[default]A,[default]B');
    expect(u.searchParams.get('start')).toBe('2026-01-01T00:00:00.000Z');
    expect(u.searchParams.get('end')).toBe('2026-01-01T01:00:00.000Z');
    expect(u.searchParams.get('returnSize')).toBe('200');
  });

  it('builds alarm status/history/ack requests', async () => {
    const f = mockFetch();
    await getAlarmStatus({ path: 'a/b', state: 'ActiveUnacked' });
    let u = new URL(lastCall(f).url);
    expect(u.pathname).toBe('/data/ignite/alarms/status');
    expect(u.searchParams.get('state')).toBe('ActiveUnacked');
    await getAlarmHistory({ start: 's', end: 'e' });
    u = new URL(lastCall(f).url);
    expect(u.pathname).toBe('/data/ignite/alarms/history');
    expect(u.searchParams.get('start')).toBe('s');
    await acknowledgeAlarm('abc');
    const c = lastCall(f);
    expect(c.init.method).toBe('POST');
    expect(JSON.parse(c.init.body as string)).toEqual({ id: 'abc' });
  });

  it('posts script, named query and audit shapes', async () => {
    const f = mockFetch();
    await callLibrary('demo', 'launch.resume', [1], { a: 2 });
    expect(JSON.parse(lastCall(f).init.body as string)).toEqual({ project: 'demo', path: 'launch.resume', args: [1], kwargs: { a: 2 } });
    await callSystem('system.tag.readBlocking', [['x']]);
    expect(JSON.parse(lastCall(f).init.body as string)).toEqual({ function: 'system.tag.readBlocking', args: [['x']], kwargs: {} });
    await namedQuery('Q/one', { p: 1 });
    expect(JSON.parse(lastCall(f).init.body as string)).toEqual({ type: 'named', query: 'Q/one', params: { p: 1 } });
    await getAuditLogs({ auditProfile: 'IgniteAudit', startDate: 1, actor: 'bob' });
    const u = new URL(lastCall(f).url);
    expect(u.pathname).toBe('/data/ignite/audit/logs');
    expect(u.searchParams.get('auditProfile')).toBe('IgniteAudit');
    expect(u.searchParams.get('startDate')).toBe('1');
    expect(u.searchParams.get('actor')).toBe('bob');
  });

  it('login stores the token; logout clears it', async () => {
    mockFetch(200, { token: 'T9', user: 'u', roles: [], expiresIn: 1 });
    await login('u', 'p');
    expect(getToken()).toBe('T9');
    const f = mockFetch(200, { success: true });
    await logout();
    expect(lastCall(f).url).toContain('/auth/logout');
    expect(getToken()).toBeNull();
  });
});

describe('HttpError', () => {
  it('carries Retry-After seconds on a 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429, headers: { 'Retry-After': '300' } })));
    await expect(login('u', 'p')).rejects.toMatchObject({ status: 429, retryAfter: 300 });
  });
});
