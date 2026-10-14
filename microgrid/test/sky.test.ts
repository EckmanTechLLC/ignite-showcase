import { describe, expect, it } from 'vitest';
import { azimuthOf, gradeOf, hull, MAX_SHADOW_LEN, shadowPoly, shadowVec, sunOf } from '../src/campus/sky';

describe('sun', () => {
  it('derives azimuth from the hour: 06 east, 12 south, 18 west', () => {
    expect(azimuthOf(6)).toBe(90);
    expect(azimuthOf(12)).toBe(180);
    expect(azimuthOf(18)).toBe(270);
  });

  it('points shadows away from the sun (morning: west, noon: north, evening: east)', () => {
    const am = shadowVec(sunOf(6, 15), 10);
    expect(am.x).toBeLessThan(-10);
    expect(Math.abs(am.y)).toBeLessThan(1e-6);
    const noon = shadowVec(sunOf(12, 76), 10);
    expect(noon.y).toBeLessThan(0); // north is up (negative y)
    expect(Math.abs(noon.x)).toBeLessThan(1e-6);
    expect(shadowVec(sunOf(18, 15), 10).x).toBeGreaterThan(10);
  });

  it('length is proportional to 1/tan(elevation) and capped near the horizon', () => {
    expect(sunOf(12, 45).len).toBeCloseTo(1, 5);
    expect(sunOf(12, 76).len).toBeLessThan(sunOf(9, 20).len);
    expect(sunOf(6, 0.1).len).toBe(MAX_SHADOW_LEN);
    expect(sunOf(22, -20).len).toBe(0);
  });

  it('shadow fades at night and softens under cloud', () => {
    expect(sunOf(22, -20).alpha).toBe(0);
    expect(sunOf(22, -20).night).toBe(1);
    expect(sunOf(12, 70).night).toBe(0);
    expect(sunOf(12, 70, 0.9).alpha).toBeLessThan(sunOf(12, 70, 0).alpha);
  });

  it('shadow polygon of a rectangle reaches the projected corner', () => {
    const poly = shadowPoly({ kind: 'rect', r: { x: 100, y: 100, w: 20, h: 10 }, h: 10 }, sunOf(6, 15));
    const xs = poly.filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeLessThan(100 - 10);
    expect(Math.max(...xs)).toBeCloseTo(120, 5);
  });

  it('hull drops interior points', () => {
    expect(hull([[0, 0], [4, 0], [4, 4], [0, 4], [2, 2]]).length).toBe(8);
  });
});

describe('grade', () => {
  it('is night blue in the dark, warm at the horizon, neutral by day', () => {
    const night = gradeOf(-30);
    expect(night.b).toBeGreaterThan(night.r);
    const dawn = gradeOf(3);
    expect(dawn.r).toBeGreaterThan(dawn.b);
    expect(gradeOf(40)).toEqual({ r: 1, g: 1, b: 1 });
  });
});
