import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureEnv } from '../src/env.js';
import { classifyHistory, probeHistory } from '../src/health.js';
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
