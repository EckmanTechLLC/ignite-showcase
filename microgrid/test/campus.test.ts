import { describe, expect, it } from 'vitest';
import { BESS, BLDG, BLDG_TOP, COS, TREE_R, VIEW, WORLD, makeTrees, project, projBox, treeClass, windowCells } from '../src/campus/model';

import { shadowPoly, sunOf } from '../src/campus/sky';


describe('oblique projection', () => {
  it('foreshortens ground depth by cos(30 deg) and lifts height straight up', () => {
    expect(COS).toBeCloseTo(Math.sqrt(3) / 2, 10);
    expect(project(100, 200)).toEqual({ x: 100, y: 200 * COS });
    expect(project(100, 200, 30)).toEqual({ x: 100, y: 200 * COS - 30 });
  });

  it('projBox covers the footprint and the extruded height', () => {
    const b = projBox(BLDG[0], BLDG_TOP[0]);
    expect(b.y).toBeCloseTo(BLDG[0].y * COS - BLDG_TOP[0], 10);
    expect(b.y + b.h).toBeCloseTo((BLDG[0].y + BLDG[0].h) * COS, 10);
    expect(b.w).toBe(BLDG[0].w);
  });

  it('the camera view contains the whole projected world', () => {
    expect(VIEW.x).toBeLessThanOrEqual(WORLD.x);
    expect(VIEW.y + VIEW.h).toBeGreaterThanOrEqual(WORLD.h * COS);
  });

  it('a shadow on the ground plane projects to a shorter screen offset north-south than east-west', () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    const east = shadowPoly({ kind: 'rect', r, h: 10 }, sunOf(6, 15)); // morning sun: shadow west
    const north = shadowPoly({ kind: 'rect', r, h: 10 }, sunOf(12, 45)); // noon: shadow north
    const xs = east.filter((_, i) => i % 2 === 0);
    const ys = north.filter((_, i) => i % 2 === 1).map((y) => y * COS);
    expect(Math.min(...xs)).toBeLessThan(-30);
    expect(Math.min(...ys)).toBeCloseTo(-10 * COS, 5);
  });
});

describe('campus layout', () => {
  it('windows stay on their facade and light floor by floor', () => {
    BLDG.forEach((b, i) => {
      const cells = windowCells(i);
      expect(cells.length).toBeGreaterThan(8);
      for (const c of cells) {
        expect(c.x0).toBeGreaterThanOrEqual(b.x);
        expect(c.x1).toBeLessThanOrEqual(b.x + b.w);
        expect(c.z1).toBeLessThanOrEqual(BLDG_TOP[i]);
        expect(c.x1).toBeGreaterThan(c.x0);
      }
      expect(new Set(cells.map((c) => c.floor)).size).toBe([4, 2, 3][i]);
    });
  });

  it('trees are deterministic, keep off the BESS pads and fall into the three size classes', () => {
    const a = makeTrees();
    const b = makeTrees();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(30);
    for (const t of a) {
      expect(BESS.some((c) => t.x > c.x - 10 && t.x < c.x + c.w + 10 && t.y > c.y - 10 && t.y < c.y + c.h + 10)).toBe(false);
      expect([0, 1, 2]).toContain(treeClass(t.r));
      expect([0, 1, 2]).toContain(t.kind);
    }
    expect(TREE_R[0]).toBeLessThan(TREE_R[2]);
  });
});
