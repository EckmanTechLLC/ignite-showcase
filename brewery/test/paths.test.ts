import { describe, expect, it } from 'vitest';
import { LIVE_PATTERNS, MODEL_COUNT, PREFIX, TAG_COUNT } from '../src/live/paths';
import { parseTimeline, toSegs } from '../src/strip/batches';

describe('live subscription', () => {
  it('is a list of folder patterns under BR/ that stays below the 1000-tag server cap', () => {
    expect(PREFIX).toBe('[default]BR/');
    expect(LIVE_PATTERNS.every((p) => p.startsWith('[default]BR/') && /\/\*\*?$/.test(p))).toBe(true);
    expect(MODEL_COUNT).toBe(1039);
    expect(TAG_COUNT).toBe(908);
    expect(TAG_COUNT).toBeLessThanOrEqual(1000);
  });

  it('keeps the SSE URL under 1 500 chars (worst case: long origin, a 128-char key, a token)', () => {
    const url =
      `${'o'.repeat(24)}/data/ignite/sse?` +
      new URLSearchParams({ paths: LIVE_PATTERNS.join(','), site: 'brewery', apiKey: 'k'.repeat(128), token: 't'.repeat(64) });
    expect(url.length).toBeLessThan(1500);
  });
});

describe('batch timeline', () => {
  it('parses PHASE@hour entries', () => {
    expect(parseTimeline('MILLING@6.01,MASH@6.25')).toEqual([['MILLING', 6.01], ['MASH', 6.25]]);
    expect(parseTimeline('')).toEqual([]);
  });
  it('merges phases of one group and leaves the current one open', () => {
    const segs = toSegs(parseTimeline('MILLING@6,MASH@6.25,LAUTER@7.6,BOIL@9.4,FERMENTATION@12,DIACETYL_REST@33,CRASH@36,CONDITIONING@39'));
    expect(segs.map((s) => s.group)).toEqual([0, 1, 2, 5, 6]);
    expect(segs[0].to).toBe(7.6);
    expect(Number.isNaN(segs[segs.length - 1].to)).toBe(true);
  });
});
