import type { Graphics } from 'pixi.js';
import { shade, type Pt } from './iso';

export type Proj = (x: number, y: number, z: number) => Pt;

export interface BoxColors {
  top: number;
  left: number;
  right: number;
}
/** Colours for a body colour: lit from the upper left. */
export const boxColors = (c: number): BoxColors => ({ top: shade(c, 1.22), left: shade(c, 1.0), right: shade(c, 0.66) });

const flat = (pts: Pt[]): number[] => pts.flatMap((p) => [p.x, p.y]);

/** Isometric box: footprint (x0..x1, y0..y1), heights z0..z1 in plan units. The faces visible are the top, y = y1 (left) and x = x1 (right). */
export function box(g: Graphics, p: Proj, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: BoxColors, edge = 0): void {
  g.poly(flat([p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)])).fill(c.left);
  g.poly(flat([p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)])).fill(c.right);
  g.poly(flat([p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)])).fill(c.top);
  if (edge) {
    g.poly(flat([p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)])).stroke({ color: edge, width: 1, alpha: 0.5 });
    g.poly(flat([p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)])).stroke({ color: edge, width: 1, alpha: 0.5 });
    g.poly(flat([p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)])).stroke({ color: edge, width: 1, alpha: 0.5 });
  }
}

/** A frustum on a box top: square (x0..x1, y0..y1) at z0 narrowing to the inset square at z1. */
export function frustum(g: Graphics, p: Proj, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, inset: number, c: BoxColors): void {
  const a = { x0: x0 + inset, y0: y0 + inset, x1: x1 - inset, y1: y1 - inset };
  g.poly(flat([p(x0, y1, z0), p(x1, y1, z0), p(a.x1, a.y1, z1), p(a.x0, a.y1, z1)])).fill(c.left);
  g.poly(flat([p(x1, y0, z0), p(x1, y1, z0), p(a.x1, a.y1, z1), p(a.x1, a.y0, z1)])).fill(c.right);
  g.poly(flat([p(a.x0, a.y0, z1), p(a.x1, a.y0, z1), p(a.x1, a.y1, z1), p(a.x0, a.y1, z1)])).fill(c.top);
}
