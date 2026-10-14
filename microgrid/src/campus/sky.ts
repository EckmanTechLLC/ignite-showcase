import type { Pt, Rect } from './model';

/** Pure sun / shadow / grading maths (no Pixi): unit-tested. Screen frame: x east, y south (north is up). */

export const clamp = (v: number, lo = 0, hi = 1): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface Sun {
  /** Compass azimuth, degrees: 90 = east, 180 = south, 270 = west. */
  az: number;
  elev: number;
  /** Unit vector on the ground plane pointing from the scene towards the sun. */
  toSun: Pt;
  /** Shadow length per unit of object height: 1 / tan(elevation), capped. */
  len: number;
  /** Shadow opacity 0..1 (fades towards the horizon, softens under cloud). */
  alpha: number;
  /** 0 = full day, 1 = night. */
  night: number;
}

export const MAX_SHADOW_LEN = 8;

/** Azimuth derived from the hour: 06 h east, 12 h south, 18 h west (15 degrees per hour). */
export const azimuthOf = (hour: number): number => 90 + (hour - 6) * 15;

export function sunOf(hour: number, elev: number, cloud = 0): Sun {
  const az = azimuthOf(Number.isFinite(hour) ? hour : 12);
  const e = Number.isFinite(elev) ? elev : 45;
  const a = (az * Math.PI) / 180;
  const toSun = { x: Math.sin(a), y: -Math.cos(a) };
  const len = e > 0 ? Math.min(MAX_SHADOW_LEN, 1 / Math.tan((Math.max(e, 0.5) * Math.PI) / 180)) : 0;
  const alpha = 0.46 * smooth(0, 9, e) * (1 - 0.62 * clamp(cloud));
  return { az, elev: e, toSun, len, alpha, night: 1 - smooth(-6, 6, e) };
}

/** Shadow offset (world units) of a point at `height`. Points away from the sun. */
export const shadowVec = (s: Sun, height: number): Pt => ({ x: -s.toSun.x * s.len * height, y: -s.toSun.y * s.len * height });

type P = [number, number];
function cross(o: P, a: P, b: P): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}
/** Convex hull (monotone chain), counter-clockwise, as a flat [x0,y0,x1,y1,...] polygon. */
export function hull(points: P[]): number[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p.flat();
  const lo: P[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: P[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop();
  up.pop();
  return [...lo, ...up].flat();
}

export type Caster = { kind: 'rect'; r: Rect; h: number } | { kind: 'disc'; x: number; y: number; r: number; h: number };

/** Projected shadow polygon of one caster: the footprint swept along the shadow vector. */
export function shadowPoly(c: Caster, s: Sun): number[] {
  const v = shadowVec(s, c.h);
  if (c.kind === 'rect') {
    const { x, y, w, h } = c.r;
    const base: P[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    return hull([...base, ...base.map((p): P => [p[0] + v.x, p[1] + v.y])]);
  }
  // A tree: a small trunk at the foot, the canopy disc displaced by the shadow vector.
  const pts: P[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    pts.push([c.x + Math.cos(a) * c.r * 0.22, c.y + Math.sin(a) * c.r * 0.22]);
    pts.push([c.x + v.x + Math.cos(a) * c.r, c.y + v.y + Math.sin(a) * c.r]);
  }
  return hull(pts);
}

/** Multiply-blend grade of the whole scene by sun elevation: night blue, warm at dawn / dusk, neutral by day. */
export function gradeOf(elev: number): { r: number; g: number; b: number } {
  const e = Number.isFinite(elev) ? elev : 30;
  const night = { r: 0.33, g: 0.4, b: 0.68 };
  const glow = { r: 0.7, g: 0.5, b: 0.58 }; // just below the horizon: magenta-ish
  const warm = { r: 1, g: 0.72, b: 0.55 }; // just above: amber
  const day = { r: 1, g: 1, b: 1 };
  const mix = (a: typeof night, b: typeof night, t: number) => ({ r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) });
  if (e <= -8) return night;
  if (e <= 0) return mix(night, glow, smooth(-8, 0, e));
  if (e <= 3) return mix(glow, warm, smooth(0, 3, e));
  if (e <= 16) return mix(warm, day, smooth(3, 16, e));
  return day;
}

/** Pack a 0..1 rgb grade into a 0xRRGGBB colour. */
export const packRgb = (c: { r: number; g: number; b: number }): number => (Math.round(clamp(c.r) * 255) << 16) | (Math.round(clamp(c.g) * 255) << 8) | Math.round(clamp(c.b) * 255);
