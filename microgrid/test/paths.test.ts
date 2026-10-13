import { describe, expect, it } from 'vitest';
import { LIVE_PATTERN, PREFIX, TAG_COUNT } from '../src/live/paths';

describe('live subscription', () => {
  it('is one folder pattern on the MG folder', () => {
    expect(PREFIX).toBe('[default]MG/');
    expect(LIVE_PATTERN).toBe('[default]MG/**');
    expect(TAG_COUNT).toBe(405);
  });

  it('keeps the SSE URL under 1 000 chars (worst case: long origin and a 128-char key)', () => {
    const url =
      `${'o'.repeat(24)}/data/ignite/sse?` +
      new URLSearchParams({ paths: LIVE_PATTERN, site: 'microgrid', apiKey: 'k'.repeat(128), token: 't'.repeat(64) });
    expect(url.length).toBeLessThan(1000);
  });
});
