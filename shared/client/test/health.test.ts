import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureEnv } from '../src/env.js';
import { classifyHistory, historyOf, probeHealth, probeHistory, trialDetail } from '../src/health.js';
import { systemStatus } from '../src/api/system.js';
import { MemoryStorage, mockFetch } from './helpers.js';

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  configureEnv({ gatewayUrl: 'https://gw.example', site: 'launch', key: 'K123' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  configureEnv({});
});

const t = '2026-01-01T00:00:00Z';

describe('history health', () => {
  it('classifies rows with values as ok', () => {
    expect(classifyHistory({ rows: [[t, null], [t, 3.2], [t, 3.3]] })).toBe('ok');
  });
  it('classifies all-null rows as unavailable', () => {
    expect(classifyHistory({ rows: [[t, null], [t, null], [t, null]] })).toBe('unavailable');
  });
  it('is unknown for empty, short or malformed answers', () => {
    expect(classifyHistory({ rows: [] })).toBe('unknown');
    expect(classifyHistory({ rows: [[t, null]] })).toBe('unknown');
    expect(classifyHistory(null)).toBe('unknown');
    expect(classifyHistory({})).toBe('unknown');
  });
  it('probeHistory requests one path over the window and swallows errors', async () => {
    const f = mockFetch(200, { rows: [[t, null], [t, null]] });
    expect(await probeHistory('[default]X/y')).toBe('unavailable');
    const url = new URL((f.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe('/data/ignite/tags/history');
    expect(url.searchParams.get('paths')).toBe('[default]X/y');
    mockFetch(500, { error: 'x' });
    expect(await probeHistory('[default]X/y')).toBe('unknown');
  });
});

const status = (over: object = {}) => ({
  gatewayName: 'gw',
  uptimeMs: 1,
  license: { mode: 'Trial', trialExpired: false, trialTimeLeftMs: 6_120_000, ...over },
});

describe('probeHealth', () => {
  it('uses /system/status and makes no history request', async () => {
    const f = mockFetch(200, status());
    const h = await probeHealth('[default]X/y');
    expect(f).toHaveBeenCalledTimes(1);
    expect(new URL((f.mock.calls[0] as unknown as [string])[0]).pathname).toBe('/data/ignite/system/status');
    expect(h).toEqual({ source: 'status', trialExpired: false, trialTimeLeftMs: 6_120_000, licenseMode: 'Trial', historian: null });
    expect(historyOf(h)).toBe('ok');
    expect(trialDetail(h)).toBe('Trial · 1 h 42 m left');
  });
  it('reports an expired trial', async () => {
    mockFetch(200, status({ trialExpired: true, trialTimeLeftMs: 0 }));
    const h = await probeHealth();
    expect(h.trialExpired).toBe(true);
    expect(historyOf(h)).toBe('unavailable');
    expect(trialDetail(h)).toBe('');
  });
  it('falls back to the history probe on 404 and 405', async () => {
    for (const code of [404, 405]) {
      const f = mockFetch(code, { error: 'x' });
      let n = 0;
      f.mockImplementation(async () => (n++ === 0 ? new Response('{}', { status: code }) : new Response(JSON.stringify({ rows: [[t, null], [t, null]] }), { status: 200 })));
      const h = await probeHealth('[default]X/y');
      expect(f).toHaveBeenCalledTimes(2);
      expect(h).toMatchObject({ source: 'history', trialExpired: true, historian: 'unavailable', licenseMode: null });
    }
  });
  it('does not guess without a fallback path, and swallows other errors', async () => {
    mockFetch(404, {});
    expect(await probeHealth()).toMatchObject({ source: 'history', trialExpired: null, historian: null });
    mockFetch(500, {});
    expect(await probeHealth('[default]X/y')).toMatchObject({ source: 'status', trialExpired: null });
  });
  it('systemStatus returns null on 404', async () => {
    mockFetch(404, {});
    expect(await systemStatus()).toBeNull();
  });
});
