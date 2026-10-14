import type { Graphics } from 'pixi.js';
import { COS } from './model';

/** Drawing helpers for the oblique view. Coordinates are ground (x east, y south) plus height z; everything goes through the same projection as `model.project`. */

export type V3 = [number, number, number];

export const shade = (c: number, k: number): number => {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * k)));
  return (r << 16) | (g << 8) | b;
};
export const mixC = (a: number, b: number, t: number): number => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

const flat = (pts: V3[]): number[] => pts.flatMap(([x, y, z]) => [x, y * COS - z]);

/** Filled polygon in 3D space. */
export function poly(g: Graphics, pts: V3[], fill: number, alpha = 1): Graphics {
  g.poly(flat(pts)).fill({ color: fill, alpha });
  return g;
}
/** Polyline in 3D space (call `g.stroke` afterwards, or pass a style here). */
export function line(g: Graphics, pts: V3[], color: number, width = 1, alpha = 1): Graphics {
  const f = flat(pts);
  g.moveTo(f[0], f[1]);
  for (let i = 2; i < f.length; i += 2) g.lineTo(f[i], f[i + 1]);
  g.stroke({ color, width, alpha, cap: 'round', join: 'round' });
  return g;
}

/** South-facing vertical wall quad between x0..x1 at ground depth y, from z0 up to z1. */
export const wall = (g: Graphics, x0: number, x1: number, y: number, z0: number, z1: number, fill: number, alpha = 1): Graphics => poly(g, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], fill, alpha);
/** Horizontal face at height z. */
export const slab = (g: Graphics, x: number, y: number, w: number, d: number, z: number, fill: number, alpha = 1): Graphics => poly(g, [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]], fill, alpha);

/** Vertical gradient band on a south wall (n steps from `top` to `bot`). */
export function wallGradient(g: Graphics, x0: number, x1: number, y: number, z0: number, z1: number, top: number, bot: number, n = 6): void {
  const dz = (z1 - z0) / n;
  for (let i = 0; i < n; i++) wall(g, x0, x1, y, z0 + i * dz, z0 + (i + 1) * dz + 0.4, mixC(bot, top, i / Math.max(1, n - 1)));
}

export interface BoxStyle {
  top: number;
  front: number;
  edge?: number;
  /** Darker lower part of the front face (ambient occlusion). */
  ao?: number;
}

/** Box standing on the ground (or on `z0`): the south face and the top are visible; the top is lit, the front is darker. */
export function box(g: Graphics, x: number, y: number, w: number, d: number, z0: number, h: number, st: BoxStyle): void {
  wallGradient(g, x, x + w, y + d, z0, z0 + h, st.front, shade(st.front, 1 - (st.ao ?? 0.22)), 3);
  slab(g, x, y, w, d, z0 + h, st.top);
  const e = st.edge ?? shade(st.front, 0.45);
  line(g, [[x, y + d, z0], [x, y + d, z0 + h], [x + w, y + d, z0 + h], [x + w, y + d, z0]], e, 0.8, 0.9);
  line(g, [[x, y, z0 + h], [x + w, y, z0 + h], [x + w, y + d, z0 + h], [x, y + d, z0 + h]], shade(st.top, 1.25), 0.7, 0.55);
}

/** Cylinder standing on z0 (vertical axis): a lit side, an ellipse cap. */
export function cyl(g: Graphics, cx: number, cy: number, r: number, z0: number, h: number, side: number, cap: number): void {
  const y0 = cy * COS - z0;
  const y1 = y0 - h;
  const ry = r * COS;
  g.ellipse(cx, y0, r, ry).fill(shade(side, 0.8));
  g.rect(cx - r, y1, r * 2, h).fill(side);
  g.rect(cx - r * 0.35, y1, r * 0.5, h).fill({ color: 0xffffff, alpha: 0.12 });
  g.rect(cx + r * 0.45, y1, r * 0.55, h).fill({ color: 0x000000, alpha: 0.16 });
  g.ellipse(cx, y1, r, ry).fill(cap).stroke({ color: shade(cap, 0.6), width: 0.8, alpha: 0.8 });
}

/** Soft contact shadow on the ground under an object (static, independent of the sun). */
export function contact(g: Graphics, x: number, y: number, w: number, d: number, alpha = 0.35): void {
  g.roundRect(x - 3, y * COS - 1, w + 6, d * COS + 5, 4).fill({ color: 0x02050a, alpha });
}

/** Deterministic hash noise 0..1. */
export const hash = (i: number, j = 0): number => {
  let h = Math.imul(i + 1, 374761393) ^ Math.imul(j + 7, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
