import { Container, Graphics } from 'pixi.js';
import { BESS, BLDG, BLDG_FACADE, EV_LOT, FENCE_X, GENSET, LEADS, LIGHTS, LINK, ROADS, SUBSTATION, SUB_X, TRUNK_X0, TRUNK_Y, WORLD, bayRect, pvFieldRect, type Pt, type Tree } from './model';

/** Static art, drawn once from code and cached as textures by the scene: ground, props, tree canopies. */

function dashed(g: Graphics, pts: Pt[], dash: number, gap: number): void {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      g.moveTo(a.x + ux * d, a.y + uy * d).lineTo(a.x + ux * e, a.y + uy * e);
    }
  }
}

export function buildGround(): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  // lawn: mowing stripes
  g.rect(0, 0, WORLD.w, WORLD.h).fill(0x1c3a25);
  for (let y = 0; y < WORLD.h; y += 60) g.rect(0, y, WORLD.w, 30).fill({ color: 0x21442b, alpha: 0.55 });
  // roads
  for (const r of ROADS) g.rect(r.x, r.y, r.w, r.h).fill(0x2b3039);
  for (const r of ROADS) g.rect(r.x, r.y, r.w, r.h).stroke({ color: 0x3b424d, width: 1.5 });
  g.setStrokeStyle({ width: 1.5, color: 0xd9c56a, alpha: 0.5 });
  dashed(g, [{ x: 44, y: 340 }, { x: FENCE_X + 10, y: 340 }], 16, 14);
  dashed(g, [{ x: 44, y: 575 }, { x: 1496, y: 575 }], 16, 14);
  g.stroke();
  // PV fields: gravel, perimeter fence, inverter pads
  for (let a = 0; a < 4; a++) {
    const f = pvFieldRect(a);
    g.roundRect(f.x - 4, f.y - 4, f.w + 8, f.h + 8, 6).fill(0x3a3d32).stroke({ color: 0x6b7280, width: 1.2, alpha: 0.7 });
    for (let y = f.y + 18; y < f.y + f.h; y += 34) g.rect(f.x + 8, y - 5, f.w - 16, 3).fill({ color: 0x2f3228, alpha: 0.7 });
  }
  // EV lot: slab, bay lines, aisle arrows
  g.roundRect(EV_LOT.x - 8, EV_LOT.y - 8, EV_LOT.w + 16, EV_LOT.h + 16, 8).fill(0x2d323b).stroke({ color: 0x3f4753, width: 1.5 });
  g.setStrokeStyle({ width: 1.5, color: 0xe5e7eb, alpha: 0.7 });
  for (let i = 0; i < 10; i++) {
    const b = bayRect(i);
    g.rect(b.x, b.y, b.w, b.h);
  }
  g.stroke();
  dashed(g, [{ x: EV_LOT.x + 20, y: EV_LOT.y + EV_LOT.h / 2 }, { x: EV_LOT.x + EV_LOT.w - 20, y: EV_LOT.y + EV_LOT.h / 2 }], 14, 12);
  g.stroke({ width: 1.2, color: 0xe5e7eb, alpha: 0.35 });
  // concrete pads under storage, genset, substation
  for (const b of BESS) g.roundRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20, 4).fill(0x4a4f57);
  g.roundRect(GENSET.x - 10, GENSET.y - 10, GENSET.w + 20, GENSET.h + 20, 4).fill(0x4a4f57);
  g.rect(SUBSTATION.x, SUBSTATION.y, SUBSTATION.w, SUBSTATION.h).fill(0x3a3f33).stroke({ color: 0x8b95a5, width: 1.5 });
  for (let y = SUBSTATION.y + 8; y < SUBSTATION.y + SUBSTATION.h; y += 8) g.moveTo(SUBSTATION.x + 3, y).lineTo(SUBSTATION.x + SUBSTATION.w - 3, y);
  g.stroke({ color: 0x4a5043, width: 1, alpha: 0.6 });
  // property fence along the east edge with a gate at the link
  g.setStrokeStyle({ width: 2, color: 0x9ca3af, alpha: 0.7 });
  for (let y = 8; y < WORLD.h; y += 14) {
    if (y > TRUNK_Y - 16 && y < TRUNK_Y + 16) continue;
    g.moveTo(FENCE_X, y).lineTo(FENCE_X, y + 8);
  }
  g.stroke();
  // buried conductors: faint "utility locate" dashes (the live flows run on top of these)
  g.setStrokeStyle({ width: 3, color: 0x0a0d12, alpha: 0.5 });
  dashed(g, [{ x: TRUNK_X0, y: TRUNK_Y }, { x: SUB_X, y: TRUNK_Y }], 18, 6);
  for (const p of Object.values(LEADS)) dashed(g, p, 18, 6);
  g.stroke();
  g.setStrokeStyle({ width: 1, color: 0x8da2bb, alpha: 0.35 });
  dashed(g, [{ x: TRUNK_X0, y: TRUNK_Y }, { x: SUB_X, y: TRUNK_Y }], 6, 14);
  for (const p of Object.values(LEADS)) dashed(g, p, 6, 14);
  g.stroke();
  return root;
}

const box = (g: Graphics, x: number, y: number, w: number, h: number, fill: number, edge = 0x0b0f16) => g.roundRect(x, y, w, h, 2).fill(fill).stroke({ color: edge, width: 1, alpha: 0.8 });

export function buildProps(): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);

  // buildings: roof + south facade
  const roofs = [0x5b6777, 0x546070, 0x62594f];
  BLDG.forEach((b, i) => {
    g.rect(b.x, b.y + b.h, b.w, BLDG_FACADE).fill(0x2f3846).stroke({ color: 0x0b0f16, width: 1 });
    g.rect(b.x, b.y, b.w, b.h).fill(roofs[i]).stroke({ color: 0x0b0f16, width: 1.2 });
    g.rect(b.x + 4, b.y + 4, b.w - 8, b.h - 8).stroke({ color: 0x7c8999, width: 1, alpha: 0.5 });
    // roof plant: HVAC units
    const n = i === 1 ? 4 : 3;
    for (let k = 0; k < n; k++) {
      box(g, b.x + 16 + k * ((b.w - 48) / n), b.y + 14 + (k % 2) * 40, 26, 22, 0x8693a3);
      g.circle(b.x + 29 + k * ((b.w - 48) / n), b.y + 25 + (k % 2) * 40, 7).stroke({ color: 0x3b4553, width: 1.2 });
    }
    // dark windows (the lit ones are drawn by the scene at night)
    for (let r = 0; r < 2; r++) for (let c = 0; c < 9; c++) g.rect(b.x + 8 + c * ((b.w - 16) / 9), b.y + b.h + 4 + r * 10, (b.w - 16) / 9 - 4, 7).fill(0x141b27);
  });

  // BESS containers
  for (const b of BESS) {
    box(g, b.x, b.y, b.w, b.h, 0xcfd6df);
    g.rect(b.x, b.y, 10, b.h).fill(0x8d97a5);
    g.rect(b.x + b.w - 10, b.y, 10, b.h).fill(0x8d97a5);
    for (let k = 0; k < 5; k++) g.rect(b.x + 20 + k * 25, b.y + 4, 3, b.h - 8).fill({ color: 0x8d97a5, alpha: 0.6 });
    for (let k = 0; k < 3; k++) box(g, b.x + 28 + k * 42, b.y - 8, 26, 10, 0x9aa5b4);
  }

  // genset enclosure with louvres and stack
  box(g, GENSET.x, GENSET.y, GENSET.w, GENSET.h, 0xb8c0cb);
  for (let k = 0; k < 7; k++) g.moveTo(GENSET.x + 8, GENSET.y + 10 + k * 8).lineTo(GENSET.x + GENSET.w - 36, GENSET.y + 10 + k * 8);
  g.stroke({ color: 0x59636f, width: 1.4, alpha: 0.8 });
  box(g, GENSET.x + GENSET.w - 28, GENSET.y + 8, 20, 54, 0x8d97a5);
  g.circle(GENSET.x + GENSET.w - 18, GENSET.y + 20, 6).fill(0x2b3039).stroke({ color: 0x0b0f16, width: 1 });
  // fuel tank
  g.roundRect(GENSET.x + 10, GENSET.y + GENSET.h + 8, 80, 18, 9).fill(0x6b7280).stroke({ color: 0x0b0f16, width: 1 });

  // substation: two transformers with radiators, bus and breaker
  for (const dy of [22, 76]) {
    box(g, SUBSTATION.x + 18, SUBSTATION.y + dy, 46, 34, 0x70808f);
    for (let k = 0; k < 6; k++) g.rect(SUBSTATION.x + 64, SUBSTATION.y + dy + 3 + k * 5, 8, 3).fill(0x4b5663);
    g.circle(SUBSTATION.x + 34, SUBSTATION.y + dy + 17, 7).stroke({ color: 0x2f3846, width: 1.4 });
  }
  g.setStrokeStyle({ width: 3, color: 0xc8d0da });
  g.moveTo(SUBSTATION.x, TRUNK_Y).lineTo(SUBSTATION.x + 20, TRUNK_Y).moveTo(SUBSTATION.x + 20, SUBSTATION.y + 38).lineTo(SUBSTATION.x + 20, SUBSTATION.y + 92);
  g.moveTo(SUBSTATION.x + 78, TRUNK_Y).lineTo(FENCE_X - 1, TRUNK_Y);
  g.stroke();
  box(g, SUBSTATION.x + 88, TRUNK_Y - 8, 18, 16, 0xdde3ea);
  // utility pole beyond the fence
  g.rect(LINK[0].x - 3, LINK[0].y - 3, 6, 6).fill(0x8a6a45);
  g.moveTo(LINK[0].x - 12, LINK[0].y - 12).lineTo(LINK[0].x + 12, LINK[0].y - 12).stroke({ color: 0x8a6a45, width: 3 });

  // charger posts and street light poles
  for (let i = 0; i < 10; i++) {
    const b = bayRect(i);
    const top = i < 5;
    box(g, b.x + b.w / 2 - 6, top ? b.y + 3 : b.y + b.h - 17, 12, 14, 0x9aa5b4);
  }
  for (const p of LIGHTS) g.circle(p.x, p.y, 2.4).fill(0x1a1f27).stroke({ color: 0x9ca3af, width: 1 });
  return root;
}

const CANOPY = [0x2f6b3a, 0x2a5f35, 0x367a43];
export function buildCanopies(trees: Tree[]): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  for (const t of trees) {
    g.circle(t.x, t.y, t.r).fill(CANOPY[t.tone]).stroke({ color: 0x14301b, width: 1, alpha: 0.8 });
    g.circle(t.x - t.r * 0.25, t.y - t.r * 0.28, t.r * 0.55).fill({ color: 0x5fae6b, alpha: 0.5 });
  }
  return root;
}
