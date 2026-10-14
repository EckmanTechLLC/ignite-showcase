import { describe, expect, it } from 'vitest';
import { spacingOf, speedOf, supplyGroup, trunkSegments, type Tap } from '../src/campus/network';

const taps = (over: Partial<Record<string, number>> = {}): Tap[] => [
  { id: 'A1', x: 100, kw: over.pv ?? 100, group: 'pv' },
  { id: 'L1', x: 200, kw: -(over.load ?? 40), group: 'pv' },
  { id: 'B1', x: 300, kw: over.bess ?? 0, group: 'bess' },
  { id: 'GEN', x: 400, kw: over.gen ?? 0, group: 'gen' },
  { id: 'GRID', x: 500, kw: over.grid ?? -60, group: 'grid' },
];

describe('trunk flow', () => {
  it('PV surplus flows east towards the grid (export) in PV colour', () => {
    const s = trunkSegments(taps());
    expect(s.map((x) => x.kw)).toEqual([100, 60, 60, 60]);
    expect(s[0].group).toBe('pv');
  });

  it('import flows west, coloured by the grid', () => {
    const s = trunkSegments(taps({ pv: 0, load: 100, grid: 100 }));
    expect(s.every((x) => x.kw <= 0)).toBe(true);
    expect(s[s.length - 1].group).toBe('grid');
  });

  it('islanded: genset and battery feed the loads, the link carries nothing', () => {
    const s = trunkSegments(taps({ pv: 0, load: 120, bess: 40, gen: 80, grid: 0 }));
    const last = s[s.length - 1];
    expect(last.kw).toBeCloseTo(0, 5);
    expect(s[1].kw).toBeLessThan(0);
    expect(s[1].group).toBe('gen');
  });

  it('density follows |kW|, nothing below the dead band', () => {
    expect(spacingOf(0.2)).toBeNull();
    expect(spacingOf(300)!).toBeLessThan(spacingOf(30)!);
    expect(speedOf(200)).toBeGreaterThan(speedOf(5));
  });

  it('names the largest supplier', () => {
    expect(supplyGroup(10, 120, 0, 0)).toBe('pv');
    expect(supplyGroup(0, 0, 0, 80)).toBe('gen');
    expect(supplyGroup(0, 0, 0, 0)).toBe('grid');
  });
});
