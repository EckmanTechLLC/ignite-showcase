import { describe, expect, it } from 'vitest';
import { LIVE_PATTERN, PREFIX, SELECTED_COUNT } from '../src/live/paths';

describe('live subscription', () => {
  it('is one folder pattern on the DC folder', () => {
    expect(PREFIX).toBe('[default]DC/');
    expect(LIVE_PATTERN).toBe('[default]DC/**');
    expect(SELECTED_COUNT).toBeGreaterThan(0);
  });

  it('keeps the SSE URL under 1 000 chars (worst case: long origin and a 128-char key)', () => {
    const url =
      `${'o'.repeat(24)}/data/ignite/sse?` +
      new URLSearchParams({ paths: LIVE_PATTERN, site: 'datacenter', apiKey: 'k'.repeat(128), token: 't'.repeat(64) });
    expect(url.length).toBeLessThan(1000);
  });
});
