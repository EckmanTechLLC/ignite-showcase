import { Container, Graphics, TilingSprite, type Renderer, type Texture } from 'pixi.js';
import { COS, EV_LOT, TREE_R, FENCE_X, LEADS, PATHS, POND, ROADS, SUBSTATION, SUB_X, TRUNK_X0, TRUNK_Y, WORLD, bayRect, project, pvFieldRect, type Pt, type Rect } from './model';
import { box, hash, line, mixC, shade, slab } from './iso';
import { fence } from './energy';
import type { Textures } from './textures';

/** Ground, vegetation and lighting-pole art: drawn once from code and cached as textures by the scene. */

/** Dashed polyline through ground points (projected). */
function dashed(g: Graphics, pts: Pt[], dash: number, gap: number): void {
  for (let i = 1; i < pts.length; i++) {
    const a = project(pts[i - 1].x, pts[i - 1].y);
    const b = project(pts[i].x, pts[i].y);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.01) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      g.moveTo(a.x + ux * d, a.y + uy * d).lineTo(a.x + ux * e, a.y + uy * e);
    }
  }
}

function tiled(root: Container, tex: Texture, r: Rect, tint = 0xffffff, scale = 1): void {
  const t = new TilingSprite({ texture: tex, width: r.w, height: r.h * COS });
  t.position.set(r.x, r.y * COS);
  t.tileScale.set(scale);
  t.tint = tint;
  root.addChild(t);
}

export const HEDGES: Rect[] = [
  { x: 96, y: 546, w: 84, h: 8 },
  { x: 200, y: 546, w: 230, h: 8 },
  { x: 450, y: 546, w: 226, h: 8 },
  { x: 696, y: 546, w: 86, h: 8 },
  { x: 90, y: 848, w: 500, h: 8 },
];

export function buildGround(tex: Textures): Container {
  const root = new Container();
  // lawn with mowing stripes
  tiled(root, tex.lawn, { x: -60, y: -60, w: WORLD.w + 120, h: WORLD.h + 120 }, 0xffffff, 0.8);
  const g = new Graphics();
  root.addChild(g);
  for (let y = -60; y < WORLD.h + 60; y += 56) g.rect(-60, y * COS, WORLD.w + 120, 28 * COS).fill({ color: 0x9be39f, alpha: 0.05 });
  for (let k = 0; k < 26; k++) g.ellipse(60 + hash(k, 1) * (WORLD.w - 120), (30 + hash(k, 2) * (WORLD.h - 60)) * COS, 40 + hash(k, 3) * 70, 12 + hash(k, 4) * 24).fill({ color: hash(k, 5) > 0.5 ? 0x2c5a35 : 0x16321e, alpha: 0.18 });

  // roads: asphalt, kerbs, edge lines, centre lines
  for (const r of ROADS) tiled(root, tex.asphalt, r, 0xffffff, 1);
  for (const r of ROADS) {
    g.rect(r.x, r.y * COS - 1.2, r.w, 2.4).fill(0x8a919d); // north kerb (top face)
    g.rect(r.x, (r.y + r.h) * COS - 0.5, r.w, 3.4).fill(0x5d6572); // south kerb face
    g.rect(r.x, (r.y + r.h) * COS - 0.5, r.w, 1).fill(0xaab1bc);
  }
  g.setStrokeStyle({ width: 1.4, color: 0xd9c56a, alpha: 0.7 });
  dashed(g, [{ x: 44, y: 340 }, { x: FENCE_X + 10, y: 340 }], 14, 12);
  dashed(g, [{ x: 44, y: 575 }, { x: 1496, y: 575 }], 14, 12);
  dashed(g, [{ x: 830, y: 360 }, { x: 830, y: 560 }], 12, 10);
  g.stroke();
  g.setStrokeStyle({ width: 0.8, color: 0xe5e7eb, alpha: 0.4 });
  for (const y of [326, 354, 564, 586]) dashed(g, [{ x: 44, y }, { x: y < 400 ? FENCE_X + 10 : 1496, y }], 2000, 0);
  g.stroke();
  // zebra crossings on the south road at the building paths and across the main road before the junction
  for (const p of PATHS.slice(1)) for (let k = 0; k < 4; k++) g.rect(p.x - 4, (561 + k * 7 + 1) * COS, p.w + 8, 3 * COS).fill({ color: 0xe5e7eb, alpha: 0.7 });
  for (let k = 0; k < 5; k++) g.rect(781 + k * 6, 323 * COS, 3, 34 * COS).fill({ color: 0xe5e7eb, alpha: 0.7 });

  // footpaths
  for (const p of PATHS) {
    tiled(root, tex.gravel, p, 0xc9c2b2, 1);
    g.rect(p.x, p.y * COS, p.w, p.h * COS).stroke({ color: 0x7b7567, width: 0.8, alpha: 0.6 });
  }
  // gravel pads: PV fields, substation yard
  for (let a = 0; a < 4; a++) {
    const f = pvFieldRect(a);
    tiled(root, tex.gravel, { x: f.x - 5, y: f.y - 5, w: f.w + 10, h: f.h + 10 }, 0xb7b5a2, 0.9);
  }
  tiled(root, tex.gravel, { x: SUBSTATION.x, y: SUBSTATION.y, w: SUBSTATION.w, h: SUBSTATION.h }, 0x9a9a88, 0.9);
  // EV lot slab: lighter asphalt, kerb, bay lines, aisle arrows, EV symbols
  const lot = { x: EV_LOT.x - 8, y: EV_LOT.y - 8, w: EV_LOT.w + 16, h: EV_LOT.h + 16 };
  tiled(root, tex.asphalt, lot, 0xd2d6de, 1);
  g.rect(lot.x, lot.y * COS, lot.w, lot.h * COS).stroke({ color: 0x8a919d, width: 1.4 });
  g.setStrokeStyle({ width: 1.6, color: 0xeef2f7, alpha: 0.85 });
  for (let i = 0; i < 10; i++) {
    const b = bayRect(i);
    const p0 = project(b.x, b.y);
    const p1 = project(b.x + b.w, b.y + b.h);
    g.moveTo(p0.x, p0.y).lineTo(p0.x, p1.y);
    if (i % 5 === 4) g.moveTo(p1.x, p0.y).lineTo(p1.x, p1.y);
    g.moveTo(p0.x, i < 5 ? p0.y : p1.y).lineTo(p1.x, i < 5 ? p0.y : p1.y);
  }
  g.stroke();
  g.setStrokeStyle({ width: 1.2, color: 0xe5e7eb, alpha: 0.6 });
  dashed(g, [{ x: EV_LOT.x + 20, y: EV_LOT.y + EV_LOT.h / 2 }, { x: EV_LOT.x + EV_LOT.w - 20, y: EV_LOT.y + EV_LOT.h / 2 }], 12, 10);
  g.stroke();
  for (const dx of [140, 280, 420]) {
    const c = project(EV_LOT.x + dx, EV_LOT.y + EV_LOT.h / 2 - 8);
    g.poly([c.x - 7, c.y, c.x + 3, c.y, c.x + 3, c.y - 3, c.x + 10, c.y + 2, c.x + 3, c.y + 7, c.x + 3, c.y + 4, c.x - 7, c.y + 4]).fill({ color: 0xe5e7eb, alpha: 0.5 });
  }
  for (let i = 0; i < 10; i++) {
    const b = bayRect(i);
    const c = project(b.x + b.w / 2, b.y + (i < 5 ? b.h - 8 : b.h - 8));
    g.roundRect(c.x - 6, c.y - 2.5, 12, 5, 1.5).fill({ color: 0x34d399, alpha: 0.32 });
  }
  // service tracks to the storage and the genset
  tiled(root, tex.asphalt, { x: 990, y: 358, w: 20, h: 40 }, 0xc9ced6, 1);
  tiled(root, tex.asphalt, { x: 1220, y: 358, w: 20, h: 40 }, 0xc9ced6, 1);

  // buried conductors: a trench (dark) with a lid line, and manholes at the main taps
  g.setStrokeStyle({ width: 4.5, color: 0x07090d, alpha: 0.42, cap: 'round', join: 'round' });
  dashed(g, [{ x: TRUNK_X0, y: TRUNK_Y }, { x: SUB_X, y: TRUNK_Y }], 2000, 0);
  for (const p of Object.values(LEADS)) dashed(g, p, 2000, 0);
  g.stroke();
  g.setStrokeStyle({ width: 1.1, color: 0x9aa7b8, alpha: 0.32 });
  dashed(g, [{ x: TRUNK_X0, y: TRUNK_Y - 1.6 }, { x: SUB_X, y: TRUNK_Y - 1.6 }], 7, 5);
  for (const p of Object.values(LEADS)) dashed(g, p.map((q) => ({ x: q.x - 1.2, y: q.y })), 7, 5);
  g.stroke();
  const mh = (x: number, y: number) => {
    const c = project(x, y);
    g.ellipse(c.x, c.y, 5, 2.6).fill(0x2b3039).stroke({ color: 0x6b7482, width: 0.8 });
    g.moveTo(c.x - 3, c.y).lineTo(c.x + 3, c.y).stroke({ color: 0x6b7482, width: 0.6 });
  };
  for (const [k, p] of Object.entries(LEADS)) if (!k.startsWith('L')) mh(p[p.length - 1].x, p[p.length - 1].y);
  for (const k of ['L1', 'L2', 'L3']) mh(LEADS[k][1].x, LEADS[k][1].y);

  // pond: stone rim, water in depth rings, ripples, lily pads, reeds, a bench
  const P = POND;
  const pc = project(P.x, P.y);
  g.ellipse(pc.x, pc.y + 3, P.rx + 9, (P.ry + 9) * COS).fill({ color: 0x03060a, alpha: 0.35 });
  g.ellipse(pc.x, pc.y, P.rx + 7, (P.ry + 7) * COS).fill(0x8e8879).stroke({ color: 0x5b574c, width: 1 });
  for (let k = 0; k < 7; k++) g.ellipse(pc.x, pc.y, P.rx - k * 14, (P.ry - k * 7) * COS).fill(mixC(0x2a6f86, 0x0f3a52, k / 6));
  g.ellipse(pc.x - 28, pc.y - 8, 52, 9).fill({ color: 0xffffff, alpha: 0.08 });
  for (let k = 0; k < 5; k++) g.ellipse(pc.x + 40 + k * 8, pc.y + 6 + k * 3, 18 - k * 2, 3.5).stroke({ color: 0xcfe9f5, width: 0.6, alpha: 0.2 });
  for (let k = 0; k < 6; k++) {
    const lx = pc.x - 70 + hash(k, 20) * 150;
    const ly = pc.y - 12 + hash(k, 21) * 28;
    g.ellipse(lx, ly, 7, 3).fill({ color: 0x3f8f4e, alpha: 0.9 });
    g.circle(lx + 2, ly - 0.8, 1.2).fill(hash(k, 22) > 0.5 ? 0xf9a8d4 : 0xfef3c7);
  }
  for (let k = 0; k < 18; k++) {
    const a = hash(k, 30) * Math.PI * 2;
    const x = pc.x + Math.cos(a) * (P.rx + 6);
    const y = pc.y + Math.sin(a) * (P.ry + 6) * COS;
    if (Math.sin(a) < 0.1) for (let r = 0; r < 3; r++) g.moveTo(x + r * 1.6, y).lineTo(x + r * 1.6 + (r - 1) * 1.2, y - 7 - hash(k, r) * 4).stroke({ color: 0x5f9a4a, width: 1, alpha: 0.9 });
  }
  slab(g, P.x - 16, P.y - P.ry - 38, 32, 16, 0.1, 0xc9c2b2);
  box(g, P.x - 11, P.y - P.ry - 31, 22, 4, 2.5, 2.2, { top: 0x9b6b45, front: 0x7a5233 });
  box(g, P.x - 11, P.y - P.ry - 32.4, 22, 1.2, 4.7, 3.4, { top: 0x9b6b45, front: 0x7a5233 });

  // hedges (low, dense, with leaf speckle)
  for (const h of HEDGES) {
    box(g, h.x, h.y, h.w, h.h, 0, 6.5, { top: 0x2f6a3b, front: 0x1c4426, ao: 0.1 });
    for (let k = 0; k < h.w / 3; k++) g.circle(h.x + hash(k, h.y) * h.w, (h.y + hash(k, 9) * h.h) * COS - 6.5, 1.4).fill({ color: hash(k, 3) > 0.5 ? 0x55a05f : 0x3c8248, alpha: 0.7 });
  }
  // property fence on every side, with a gate gap at the utility link
  fence(g, 10, 8, WORLD.w - 40, 8, 7, 16, 0.85);
  fence(g, 10, 8, 10, WORLD.h - 6, 7, 16, 0.85);
  fence(g, 10, WORLD.h - 6, WORLD.w - 40, WORLD.h - 6, 7, 16, 0.85);
  fence(g, FENCE_X, 8, FENCE_X, TRUNK_Y - 16, 8, 14);
  fence(g, FENCE_X, TRUNK_Y + 16, FENCE_X, WORLD.h - 6, 8, 14);
  for (const dy of [-16, 16]) line(g, [[FENCE_X, TRUNK_Y + dy, 0], [FENCE_X, TRUNK_Y + dy, 10]], 0xe5e7eb, 2.4, 1);
  return root;
}

// --- vegetation ---------------------------------------------------------------------------------

/** Texture of a tree (3 kinds x 3 sizes); anchor at the foot of the trunk. */
export function treeTexture(renderer: Renderer, kind: number, size: number): { tex: Texture; ax: number; ay: number } {
  const R = TREE_R[size];
  const g = new Graphics();
  g.ellipse(0, 0, R * 0.9, R * 0.38).fill({ color: 0x02050a, alpha: 0.28 }); // soft drop shadow at the foot
  const crown = (cx: number, cy: number, r: number, base: number) => {
    g.circle(cx + r * 0.1, cy + r * 0.12, r).fill(shade(base, 0.62));
    g.circle(cx, cy, r).fill(base);
    g.circle(cx - r * 0.28, cy - r * 0.32, r * 0.62).fill(shade(base, 1.22));
    g.circle(cx - r * 0.42, cy - r * 0.46, r * 0.26).fill(shade(base, 1.5));
  };
  if (kind === 1) {
    g.rect(-R * 0.08, -R * 0.45, R * 0.16, R * 0.45).fill(0x4b3526);
    const tiers: [number, number, number][] = [[0, -R * 0.35, R * 0.78], [1, -R * 0.95, R * 0.62], [2, -R * 1.5, R * 0.44]];
    for (const [i, y, w] of tiers) {
      const c = [0x1f5a3a, 0x24663f, 0x2b7447][i];
      g.poly([-w, y, w, y, 0, y - R * 0.95]).fill(shade(c, 0.7));
      g.poly([-w, y, 0, y, 0, y - R * 0.95]).fill(c);
      g.poly([-w * 0.9, y - 0.5, -w * 0.2, y - 0.5, -w * 0.2, y - R * 0.5]).fill({ color: 0xffffff, alpha: 0.06 });
    }
  } else if (kind === 2) {
    g.rect(-R * 0.07, -R * 1.25, R * 0.14, R * 1.25).fill(0xe3dccd);
    for (let k = 0; k < 4; k++) g.rect(-R * 0.07, -R * (0.25 + k * 0.28), R * 0.1, R * 0.05).fill(0x3a3730);
    crown(0, -R * 1.65, R * 0.72, 0x6fae52);
    crown(-R * 0.42, -R * 1.3, R * 0.5, 0x62a24a);
    crown(R * 0.45, -R * 1.35, R * 0.5, 0x7bb85a);
  } else {
    g.rect(-R * 0.12, -R * 0.9, R * 0.24, R * 0.9).fill(0x5a3f2a);
    g.rect(R * 0.02, -R * 0.9, R * 0.1, R * 0.9).fill({ color: 0x000000, alpha: 0.25 });
    crown(-R * 0.45, -R * 1.3, R * 0.62, 0x2f7a3e);
    crown(R * 0.45, -R * 1.3, R * 0.6, 0x2a6f39);
    crown(0, -R * 1.75, R * 0.72, 0x378548);
  }
  const b = g.getLocalBounds();
  const tex = renderer.generateTexture({ target: g, resolution: 2, antialias: true });
  g.destroy();
  return { tex, ax: -b.x / b.width, ay: -b.y / b.height };
}

/** One street lamp (shared texture): base plate, pole, arm and a lit head. Anchor at the foot. */
export function lampTexture(renderer: Renderer): { tex: Texture; ax: number; ay: number } {
  const g = new Graphics();
  g.ellipse(0, 0, 4, 1.8).fill({ color: 0x02050a, alpha: 0.35 });
  g.ellipse(0, 0, 2.6, 1.2).fill(0x59636f);
  g.rect(-1.1, -24, 2.2, 24).fill(0x8c97a6);
  g.rect(0, -24, 0.9, 24).fill({ color: 0x000000, alpha: 0.25 });
  g.rect(-0.2, -24.6, 7, 1.4).fill(0x8c97a6);
  g.roundRect(3.2, -25.6, 7.5, 2.8, 1.2).fill(0xdfe5ec).stroke({ color: 0x39424f, width: 0.6 });
  g.roundRect(4, -23, 6, 1, 0.5).fill(0xfff1c2);
  const b = g.getLocalBounds();
  const tex = renderer.generateTexture({ target: g, resolution: 3, antialias: true });
  g.destroy();
  return { tex, ax: -b.x / b.width, ay: -b.y / b.height };
}
/** Lamp head offset from the foot (screen units), for the light cone. */
export const LAMP_HEAD = { x: 7, y: -24.2 };
