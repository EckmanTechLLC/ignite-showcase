import { Container, Graphics } from 'pixi.js';
import { BESS, COS, EV_LOT, FENCE_X, GENSET, H, LINK, PV_ROW, SUBSTATION, TRUNK_Y, bayRect, pvFieldRect, pvRowRect } from './model';
import { box, contact, cyl, line, poly, slab, wall, wallGradient } from './iso';

/** Static art of the energy assets: PV array hardware, BESS containers, genset, EV canopy + pedestals, substation yard, utility pole line. Dynamic parts are in actors.ts. */

// --- shared helpers -----------------------------------------------------------------------------

/** Chain-link fence between two ground points (posts, rails, faint mesh). */
export function fence(g: Graphics, x0: number, y0: number, x1: number, y1: number, h = 7, post = 14, alpha = 1): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(len / post));
  poly(g, [[x0, y0, 0], [x1, y1, 0], [x1, y1, h], [x0, y0, h]], 0xcdd6e2, 0.06 * alpha);
  for (let k = 1; k < 4; k++) {
    const t = k / 4;
    line(g, [[x0, y0, h * t], [x1, y1, h * t]], 0xaab4c2, 0.4, 0.28 * alpha);
  }
  line(g, [[x0, y0, h], [x1, y1, h]], 0xd0d8e3, 1, 0.85 * alpha);
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n;
    const y = y0 + ((y1 - y0) * k) / n;
    line(g, [[x, y, 0], [x, y, h]], 0x8f9aa9, 1.1, 0.9 * alpha);
  }
}

// --- PV arrays ----------------------------------------------------------------------------------

/** Cabinet rectangles (two inverters per array, in the strip behind the rows). */
export const invRect = (a: number, k: number): { x: number; y: number; w: number; d: number; h: number } => {
  const f = pvFieldRect(a);
  return { x: f.x + (k ? 188 : 70), y: f.y + 8, w: 42, d: 13, h: 20 };
};
/** Combiner box of string row `r` (west end of the row). */
export const combinerPos = (a: number, r: number): { x: number; y: number; z: number } => {
  const rr = pvRowRect(a, r);
  return { x: rr.x - 8, y: rr.y + rr.h - 4, z: 5 };
};
export const flagPos = (a: number): { x: number; y: number } => ({ x: pvFieldRect(a).x + pvFieldRect(a).w - 8, y: pvFieldRect(a).y + pvFieldRect(a).h - 6 });

/** Back and side fence of a field (drawn below the rows). */
export function buildPvBack(a: number): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const f = pvFieldRect(a);
  const m = 5;
  contact(g, f.x - m, f.y - m, f.w + 2 * m, f.h + 2 * m, 0.22);
  // concrete footing strips under each row
  for (let r = 0; r < 6; r++) {
    const rr = pvRowRect(a, r);
    slab(g, rr.x + 6, rr.y + rr.h - 2, rr.w - 12, 3, 0.2, 0x6a6c64);
  }
  fence(g, f.x - m, f.y - m, f.x + f.w + m, f.y - m);
  fence(g, f.x - m, f.y - m, f.x - m, f.y + f.h + m);
  fence(g, f.x + f.w + m, f.y - m, f.x + f.w + m, f.y + f.h + m);
  // inverter cabinets (two per array), each with louvres, door seam and a vent hood
  for (const k of [0, 1]) {
    const c = invRect(a, k);
    box(g, c.x, c.y, c.w, c.d, 0, c.h, { top: 0xdde3ea, front: 0xaab4c1 });
    wall(g, c.x + 2, c.x + c.w - 2, c.y + c.d, 1.5, 4, 0x6b7787);
    for (let q = 0; q < 5; q++) line(g, [[c.x + 4, c.y + c.d, 6 + q * 1.5], [c.x + 20, c.y + c.d, 6 + q * 1.5]], 0x5d6877, 0.6, 0.8);
    line(g, [[c.x + c.w / 2, c.y + c.d, 1], [c.x + c.w / 2, c.y + c.d, c.h - 1]], 0x6d7888, 0.8, 0.9);
    wall(g, c.x + c.w - 14, c.x + c.w - 4, c.y + c.d, c.h - 9, c.h - 3, 0x1a2330); // display
    box(g, c.x + c.w - 10, c.y + 2, 8, 6, c.h, 3, { top: 0x8c97a6, front: 0x6d7888 });
  }
  // conduit stubs from the cabinets towards the trunk lead
  slab(g, f.x + f.w / 2 - 3, f.y + 22, 6, f.h - 20, 0.1, 0x2a2f33, 0.6);
  return root;
}

/** Front fence, combiner boxes, status pole and the nameplate stand of a field (drawn over the rows). */
export function buildPvFront(a: number): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const f = pvFieldRect(a);
  const m = 5;
  fence(g, f.x - m, f.y + f.h + m, f.x + f.w + m, f.y + f.h + m, 7, 14);
  // combiner boxes at the west end of each row
  for (let r = 0; r < 6; r++) {
    const c = combinerPos(a, r);
    box(g, c.x, c.y - 3, 6, 5, 0, c.z, { top: 0xcfd6df, front: 0x9aa5b4 });
    line(g, [[c.x + 3, c.y + 2, 0.5], [c.x + 3, c.y + 2, c.z - 0.5]], 0x5b6675, 0.6, 0.8);
  }
  // curtailment flag pole
  const p = flagPos(a);
  line(g, [[p.x, p.y, 0], [p.x, p.y, 24]], 0xc7ced9, 1.6, 1);
  g.circle(p.x, p.y * COS - 24, 1.8).fill(0xe5e7eb);
  // nameplate stand
  const cx = f.x + f.w / 2;
  for (const dx of [-26, 26]) line(g, [[cx + dx, f.y + f.h + m + 6, 0], [cx + dx, f.y + f.h + m + 6, 9]], 0x6b7482, 1.6, 1);
  return root;
}

/** A single PV row sprite height in screen units (re-exported for the actor). */
export const PV_ROW_W = PV_ROW.w;

// --- BESS ---------------------------------------------------------------------------------------

export const BESS_Z = 26;
/** HVAC fans on the roof of container `i` (east end). */
export const bessFans = (i: number): { x: number; y: number; z: number; r: number }[] => {
  const b = BESS[i];
  return [0, 1, 2].map((k) => ({ x: b.x + 108 + k * 21, y: b.y + 18 + 8, z: BESS_Z + 7, r: 5 }));
};
/** SOC panel rectangle on the front face (x0, x1 at depth y, z0..z1). */
export const bessPanel = (i: number): { x0: number; x1: number; y: number; z0: number; z1: number } => {
  const b = BESS[i];
  return { x0: b.x + 52, x1: b.x + 112, y: b.y + b.h, z0: 9.5, z1: 17.5 };
};

export function buildBess(i: number): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const b = BESS[i];
  const yF = b.y + b.h;
  // concrete pad
  contact(g, b.x - 12, b.y - 12, b.w + 24, b.h + 24, 0.3);
  slab(g, b.x - 10, b.y - 10, b.w + 20, b.h + 20, 2, 0x8b9099);
  wall(g, b.x - 10, b.x + b.w + 10, b.y + b.h + 10, 0, 2, 0x5a6069);
  // container: corrugated front, corner posts, base rail, doors
  const Z0 = 2;
  const Hc = BESS_Z;
  wallGradient(g, b.x, b.x + b.w, yF, Z0, Z0 + Hc, 0xe6ebf1, 0xaeb8c4, 5);
  for (let k = 0; k < 80; k++) wall(g, b.x + 6 + k * 1.9, b.x + 6 + k * 1.9 + 0.8, yF, Z0 + 2, Z0 + Hc - 1.5, 0x7d8896, 0.28);
  wall(g, b.x, b.x + 6, yF, Z0, Z0 + Hc, 0x6f7b8a);
  wall(g, b.x + b.w - 6, b.x + b.w, yF, Z0, Z0 + Hc, 0x6f7b8a);
  wall(g, b.x, b.x + b.w, yF, Z0, Z0 + 2.2, 0x39424f);
  wall(g, b.x, b.x + b.w, yF, Z0 + Hc - 1.6, Z0 + Hc, 0x6f7b8a);
  // double door at the west end with locking bars and handles
  wall(g, b.x + 10, b.x + 46, yF, Z0 + 3, Z0 + Hc - 3, 0x8b97a6);
  line(g, [[b.x + 28, yF, Z0 + 3], [b.x + 28, yF, Z0 + Hc - 3]], 0x3d4655, 1, 0.9);
  for (const dx of [18, 22, 34, 38]) line(g, [[b.x + dx, yF, Z0 + 4], [b.x + dx, yF, Z0 + Hc - 4]], 0x5a6676, 0.9, 0.9);
  for (const dx of [26, 30]) wall(g, b.x + dx - 0.7, b.x + dx + 0.7, yF, Z0 + 11, Z0 + 15, 0x1d232c);
  // SOC panel frame (bar is dynamic) and warning signage
  const p = bessPanel(i);
  wall(g, p.x0 - 1.5, p.x1 + 1.5, yF, p.z0 + 2 - 1.5, p.z1 + 2 + 1.5, 0x39424f);
  wall(g, p.x0, p.x1, yF, p.z0 + 2, p.z1 + 2, 0x0c1118);
  poly(g, [[b.x + 120, yF, Z0 + 5], [b.x + 128, yF, Z0 + 5], [b.x + 124, yF, Z0 + 13]], 0xfacc15);
  line(g, [[b.x + 124, yF, Z0 + 7], [b.x + 124, yF, Z0 + 10.2]], 0x111111, 1, 1);
  wall(g, b.x + 134, b.x + 150, yF, Z0 + 8, Z0 + 12, 0xdc2626);
  line(g, [[b.x + 135.5, yF, Z0 + 10], [b.x + 148.5, yF, Z0 + 10]], 0xffffff, 0.8, 0.9);
  // roof: ribs, HVAC units on the east end with a refrigerant line
  const RZ = Z0 + Hc;
  slab(g, b.x, b.y, b.w, b.h, RZ, 0xd8dee6);
  for (let k = 1; k < 5; k++) line(g, [[b.x, b.y + (k * b.h) / 5, RZ], [b.x + b.w, b.y + (k * b.h) / 5, RZ]], 0xa7b1be, 0.7, 0.8);
  for (const f of bessFans(i)) {
    box(g, f.x - 8.5, f.y - 8, 17, 16, RZ, 7, { top: 0xa6b0bd, front: 0x76828f });
    for (let k = 1; k < 3; k++) line(g, [[f.x - 7.5, f.y + 8, RZ + k * 2.3], [f.x + 7.5, f.y + 8, RZ + k * 2.3]], 0x3f4856, 0.6, 0.8);
  }
  line(g, [[b.x + b.w - 78, b.y + 30, RZ], [b.x + b.w - 8, b.y + 30, RZ]], 0x4b5563, 1.4, 0.8);
  return root;
}

// --- genset -------------------------------------------------------------------------------------

export const GEN_Z = 3;
export const genStack = (): { x: number; y: number; z: number } => ({ x: GENSET.x + GENSET.w - 14, y: GENSET.y + 16, z: GEN_Z + H.genset - 2 + 20 });
export const genRadiator = (): { x: number; y: number; z: number; r: number } => ({ x: GENSET.x + GENSET.w - 34, y: GENSET.y + GENSET.h / 2 + 10, z: GEN_Z + H.genset - 2 + 7, r: 9 });
/** Fuel tank capsule (stripe is dynamic): ground rect in front of the set. */
export const FUEL = { x: GENSET.x + 10, y: GENSET.y + GENSET.h + 12, w: 84, r: 7 };

export function buildGenset(): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const G = GENSET;
  const yF = G.y + G.h;
  const Hh = H.genset - 2;
  contact(g, G.x - 12, G.y - 12, G.w + 24, G.h + 62, 0.3);
  slab(g, G.x - 10, G.y - 10, G.w + 20, G.h + 54, 1.6, 0x8b9099);
  wall(g, G.x - 10, G.x + G.w + 10, G.y + G.h + 44, 0, 1.6, 0x5a6069);
  // sub-base + acoustic enclosure
  wall(g, G.x, G.x + G.w, yF, 1.6, GEN_Z, 0x39424f);
  wallGradient(g, G.x, G.x + G.w, yF, GEN_Z, GEN_Z + Hh, 0xd7dde5, 0x9aa4b2, 5);
  wall(g, G.x, G.x + 4, yF, GEN_Z, GEN_Z + Hh, 0x6f7b8a);
  wall(g, G.x + G.w - 4, G.x + G.w, yF, GEN_Z, GEN_Z + Hh, 0x6f7b8a);
  // louvre panels (west part), door with handle + emergency stop
  for (let blk = 0; blk < 2; blk++) {
    const x0 = G.x + 8 + blk * 36;
    wall(g, x0, x0 + 32, yF, GEN_Z + 4, GEN_Z + Hh - 3, 0x55606e);
    for (let k = 0; k < 11; k++) line(g, [[x0 + 1, yF, GEN_Z + 5 + k * 1.75], [x0 + 31, yF, GEN_Z + 5 + k * 1.75]], 0xb1bac6, 0.8, 0.85);
  }
  wall(g, G.x + 82, G.x + 100, yF, GEN_Z + 2.5, GEN_Z + Hh - 4, 0x7e8a99);
  g.circle(G.x + 96, yF * COS - GEN_Z - 11, 1.6).fill(0x1d232c);
  g.circle(G.x + 86, yF * COS - GEN_Z - Hh + 7, 1.8).fill(0xdc2626).stroke({ color: 0xfacc15, width: 0.8 });
  wall(g, G.x + 104, G.x + 116, yF, GEN_Z + 7, GEN_Z + 15, 0x0c1118); // LCD (START countdown label sits here)
  // roof with radiator on the east end and a tall exhaust stack
  const RZ = GEN_Z + Hh;
  slab(g, G.x, G.y, G.w, G.h, RZ, 0xe3e8ee);
  line(g, [[G.x + 2, G.y + G.h / 2, RZ], [G.x + G.w - 2, G.y + G.h / 2, RZ]], 0xa7b1be, 0.7, 0.8);
  const r = genRadiator();
  box(g, r.x - 14, r.y - 12, 28, 22, RZ, 7, { top: 0x7f8b99, front: 0x56606d });
  const s = genStack();
  cyl(g, s.x, s.y, 3.2, RZ, 20, 0x5d6672, 0x2b3139);
  cyl(g, s.x, s.y, 4.4, RZ + 20, 1.6, 0x39424f, 0x1d2229);
  // fuel tank: horizontal capsule on two saddles, filler cap, gauge frame
  const T = FUEL;
  for (const dx of [14, T.w - 14]) wall(g, T.x + dx - 3, T.x + dx + 3, T.y + 2, 0, 5, 0x39424f);
  g.roundRect(T.x, T.y * COS - 5 - T.r * 2 * 0.62, T.w, T.r * 2 * 0.62 + 2, T.r * 0.62).fill(0x7b8794).stroke({ color: 0x2f3844, width: 0.9 });
  g.roundRect(T.x + 4, T.y * COS - 5 - T.r * 2 * 0.62 + 1, T.w - 8, 2.2, 1).fill({ color: 0xffffff, alpha: 0.35 });
  g.roundRect(T.x + T.w / 2 - 6, T.y * COS - 5 - T.r * 2 * 0.62 - 2.2, 12, 2.4, 1).fill(0x39424f);
  // hazard stripe along the pad edge
  for (let k = 0; k < 14; k++) wall(g, G.x - 10 + k * 9, G.x - 10 + k * 9 + 4.5, G.y + G.h + 44, 0, 1.6, k % 2 ? 0x1c1c1c : 0xfacc15);
  return root;
}

// --- EV lot -------------------------------------------------------------------------------------

export const CANOPY_Z = 30;
/** Pedestal position of bay `i` (rear of the bay, behind the car as seen from the camera). */
export const pedestal = (i: number): { x: number; y: number } => {
  const b = bayRect(i);
  return { x: b.x + b.w / 2, y: b.y + 9 };
};
export const PED_H = 17;
/** Canopy rectangles: one per bay row, cantilevered over the bays. */
export const canopyRects = (): { x: number; y: number; w: number; h: number }[] => [0, 1].map((r) => ({ x: EV_LOT.x - 6, y: bayRect(r * 5).y - 6, w: EV_LOT.w + 12, h: 40 }));

export function buildEvCanopy(): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  // asphalt slab edge, kerb and rear columns first, then pedestals, then roofs (the cars are drawn between pedestals and roofs by the actor)
  const lot = EV_LOT;
  wall(g, lot.x - 8, lot.x + lot.w + 8, lot.y + lot.h + 8, 0, 2.2, 0x6b727d);
  for (const c of canopyRects()) {
    for (let k = 0; k <= 5; k++) {
      const x = lot.x + k * 100;
      line(g, [[x, c.y + 3, 0], [x, c.y + 3, CANOPY_Z]], 0x8d97a6, 3, 1);
      line(g, [[x - 0.8, c.y + 3, 0], [x - 0.8, c.y + 3, CANOPY_Z]], 0xd1d7e0, 0.8, 0.8);
      g.ellipse(x, (c.y + 3) * COS, 3.4, 1.5).fill(0x4a515c);
    }
  }
  for (let i = 0; i < 10; i++) {
    const p = pedestal(i);
    // pedestal: body, screen, cable holster, base plate
    box(g, p.x - 5, p.y - 3, 10, 6, 0, PED_H, { top: 0xe8edf3, front: 0xbfc8d4 });
    wall(g, p.x - 3.4, p.x + 3.4, p.y + 3, PED_H - 9, PED_H - 3.6, 0x0c1118);
    g.circle(p.x, (p.y + 3) * COS - PED_H + 2.4, 1.1).fill(0x38bdf8);
    g.roundRect(p.x - 6, (p.y + 3) * COS - 2.4, 12, 3, 1).fill(0x59636f);
  }
  // wheel stops
  for (let i = 0; i < 10; i++) {
    const b = bayRect(i);
    slab(g, b.x + b.w / 2 - 22, b.y + 14, 44, 3, 1.2, 0xd8dde4, 0.9);
  }
  return root;
}

/** Canopy roofs with their own PV strip (drawn above the cars and pedestals). */
export function buildEvRoof(): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const lot = EV_LOT;
  for (const c of canopyRects()) {
    const y1 = c.y + c.h;
    // underside shade, thickness, panels
    slab(g, c.x, c.y, c.w, c.h, CANOPY_Z - 2.4, 0x0b0f16, 0.0);
    wall(g, c.x, c.x + c.w, y1, CANOPY_Z - 2.6, CANOPY_Z, 0x8a94a3);
    line(g, [[c.x, y1, CANOPY_Z - 2.6], [c.x + c.w, y1, CANOPY_Z - 2.6]], 0x39424f, 0.8, 0.9);
    slab(g, c.x, c.y, c.w, c.h, CANOPY_Z, 0x203a73);
    // cell grid on the roof PV
    const cols = 25;
    for (let k = 1; k < cols; k++) line(g, [[c.x + (k * c.w) / cols, c.y, CANOPY_Z], [c.x + (k * c.w) / cols, y1, CANOPY_Z]], 0x6c8fd4, 0.5, 0.5);
    for (let k = 1; k < 6; k++) line(g, [[c.x, c.y + (k * c.h) / 6, CANOPY_Z], [c.x + c.w, c.y + (k * c.h) / 6, CANOPY_Z]], 0x6c8fd4, 0.5, 0.5);
    for (let k = 0; k <= 5; k++) line(g, [[lot.x + k * 100, c.y, CANOPY_Z], [lot.x + k * 100, y1, CANOPY_Z]], 0xc6cfdc, 1.1, 0.8);
    line(g, [[c.x, c.y, CANOPY_Z], [c.x + c.w, c.y, CANOPY_Z], [c.x + c.w, y1, CANOPY_Z], [c.x, y1, CANOPY_Z], [c.x, c.y, CANOPY_Z]], 0xd9dfe8, 1.2, 0.9);
    // glint streaks
    for (let k = 0; k < 6; k++) {
      const x = c.x + 20 + k * 82;
      poly(g, [[x, c.y, CANOPY_Z], [x + 14, c.y, CANOPY_Z], [x + 3, y1, CANOPY_Z], [x - 11, y1, CANOPY_Z]], 0xffffff, 0.05);
    }
  }
  return root;
}

// --- substation ---------------------------------------------------------------------------------

export const SUB_BUS_Z = 26;
/** Gate position where the utility link crosses the property fence. */
export const GATE = { x: FENCE_X, y: TRUNK_Y };
/** Transformer origins (two units, west part of the yard). */
export const transformers = (): { x: number; y: number }[] => [0, 1].map((k) => ({ x: SUBSTATION.x + 16, y: SUBSTATION.y + 20 + k * 58 }));

function bushing(g: Graphics, x: number, y: number, z0: number, h: number): void {
  line(g, [[x, y, z0], [x, y, z0 + h]], 0x8a5a3a, 3, 1);
  for (let k = 0; k < 4; k++) {
    const z = z0 + 2 + (k * (h - 3)) / 3;
    g.ellipse(x, y * COS - z, 3.2, 1.4).fill(0xb1744a).stroke({ color: 0x5c3a24, width: 0.5 });
  }
  g.circle(x, y * COS - z0 - h, 1.3).fill(0xd9dde3);
}

export function buildSubstation(): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const S = SUBSTATION;
  contact(g, S.x - 4, S.y - 4, S.w + 8, S.h + 8, 0.25);
  // yard fence (back and sides first; the front fence is a separate layer)
  fence(g, S.x, S.y, S.x + S.w, S.y, 9, 12);
  fence(g, S.x + S.w, S.y, S.x + S.w, S.y + S.h, 9, 12);
  fence(g, S.x, S.y, S.x, TRUNK_Y - 16, 9, 12);
  fence(g, S.x, TRUNK_Y + 16, S.x, S.y + S.h, 9, 12);
  // earthing grid on the gravel
  for (let y = S.y + 10; y < S.y + S.h; y += 14) line(g, [[S.x + 4, y, 0], [S.x + S.w - 4, y, 0]], 0x2c2f27, 0.6, 0.4);
  // two transformers: tank, conservator, three bushings, radiator fins in front, nameplate
  for (const t of transformers()) {
    box(g, t.x, t.y, 48, 26, 0, 17, { top: 0x8493a2, front: 0x65717f });
    wall(g, t.x, t.x + 48, t.y + 26, 0, 3, 0x2f3844);
    for (let k = 0; k < 11; k++) wall(g, t.x + 2 + k * 4.2, t.x + 2 + k * 4.2 + 2.6, t.y + 26, 3, 15.5, k % 2 ? 0x4c5766 : 0x586473);
    line(g, [[t.x, t.y + 26, 15.8], [t.x + 48, t.y + 26, 15.8]], 0xaab4c1, 0.9, 0.9);
    g.roundRect(t.x + 8, (t.y + 4) * COS - 17 - 7, 32, 6, 3).fill(0x76848f).stroke({ color: 0x39424f, width: 0.7 }); // conservator
    for (let k = 0; k < 3; k++) bushing(g, t.x + 10 + k * 14, t.y + 12, 17, 10);
    wall(g, t.x + 19, t.x + 29, t.y + 26, 18.4 - 17.4, 1.6 + 6, 0xd5b94a, 0.0);
    g.rect(t.x + 20, (t.y + 26) * COS - 15.5, 8, 4).fill(0xd9c66a);
  }
  // breaker + disconnect on the trunk line, meter cabinet
  const bx = S.x + 84;
  box(g, bx, TRUNK_Y - 8, 20, 12, 0, 6, { top: 0xaab4c1, front: 0x7a8696 });
  for (let k = 0; k < 3; k++) bushing(g, bx + 4 + k * 6, TRUNK_Y - 2, 6, 11);
  box(g, S.x + 106, S.y + 70, 16, 9, 0, 15, { top: 0xdde3ea, front: 0xaeb8c5 });
  wall(g, S.x + 109, S.x + 119, S.y + 79, 6, 12, 0x10171f);
  g.circle(S.x + 114, (S.y + 79) * COS - 9, 2.4).fill(0xe5e7eb).stroke({ color: 0x39424f, width: 0.6 });
  line(g, [[S.x + 114, S.y + 79, 9], [S.x + 115.4, S.y + 79, 10.2]], 0xdc2626, 0.8, 1);
  // gantry: two steel columns and a crossbar carrying three conductors east to the gate
  for (const dy of [-16, 16]) {
    line(g, [[S.x + 70, TRUNK_Y + dy, 0], [S.x + 70, TRUNK_Y + dy, SUB_BUS_Z]], 0x59636f, 2.2, 1);
    line(g, [[S.x + 124, TRUNK_Y + dy, 0], [S.x + 124, TRUNK_Y + dy, SUB_BUS_Z]], 0x59636f, 2.2, 1);
  }
  line(g, [[S.x + 70, TRUNK_Y - 16, SUB_BUS_Z], [S.x + 70, TRUNK_Y + 16, SUB_BUS_Z]], 0x7b8696, 2, 1);
  line(g, [[S.x + 124, TRUNK_Y - 16, SUB_BUS_Z], [S.x + 124, TRUNK_Y + 16, SUB_BUS_Z]], 0x7b8696, 2, 1);
  for (const dy of [-10, 0, 10]) {
    line(g, [[SUBSTATION.x, TRUNK_Y + dy, SUB_BUS_Z - 1], [S.x + 70, TRUNK_Y + dy, SUB_BUS_Z], [S.x + 124, TRUNK_Y + dy, SUB_BUS_Z], [FENCE_X - 4, TRUNK_Y + dy, SUB_BUS_Z - 2]], 0xc7ced9, 1, 0.95);
    for (const x of [70, 124]) g.circle(S.x + x, (TRUNK_Y + dy) * COS - SUB_BUS_Z + 2.5, 1.5).fill(0xb1744a);
  }
  return root;
}

export function buildSubstationFront(): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const S = SUBSTATION;
  fence(g, S.x, S.y + S.h, S.x + S.w, S.y + S.h, 9, 12);
  // warning plate on the gate side and a danger sign
  const sx = S.x + S.w - 30;
  wall(g, sx, sx + 16, S.y + S.h, 3, 9, 0xfacc15);
  poly(g, [[sx + 8, S.y + S.h, 8.2], [sx + 12.5, S.y + S.h, 3.6], [sx + 3.5, S.y + S.h, 3.6]], 0x111111, 0.85);
  return root;
}

/** Utility pole line along the east edge; the pole at the link carries the crossarm the lead is tied to. */
export const POLE_Y = [TRUNK_Y - 190, TRUNK_Y, TRUNK_Y + 190, TRUNK_Y + 380];
export const POLE_Z = 40;
export const POLE_X = LINK[0].x;

export function buildPoleLine(): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const X = POLE_X;
  // wires first so poles overlap them
  const ys = [...POLE_Y];
  for (const dx of [-8, 0, 8]) {
    for (let k = 1; k < ys.length; k++) {
      const y0 = ys[k - 1];
      const y1 = ys[k];
      const pts: [number, number, number][] = [];
      for (let s = 0; s <= 8; s++) {
        const t = s / 8;
        pts.push([X + dx, y0 + (y1 - y0) * t, POLE_Z - 3 - 4 * Math.sin(Math.PI * t)]);
      }
      line(g, pts, 0x161a20, 0.9, 0.95);
    }
  }
  for (const y of ys) {
    contact(g, X - 3, y - 2, 6, 4, 0.3);
    line(g, [[X, y, 0], [X, y, POLE_Z]], 0x7a5a3a, 3, 1);
    line(g, [[X - 0.9, y, 0], [X - 0.9, y, POLE_Z]], 0xa57c52, 1, 0.7);
    line(g, [[X - 11, y, POLE_Z - 2], [X + 11, y, POLE_Z - 2]], 0x6a4c2f, 2.4, 1);
    line(g, [[X - 5, y, POLE_Z - 12], [X, y, POLE_Z - 2], [X + 5, y, POLE_Z - 12]], 0x6a4c2f, 1, 0.8);
    for (const dx of [-8, 0, 8]) {
      line(g, [[X + dx, y, POLE_Z - 2], [X + dx, y, POLE_Z + 0.4]], 0x9fb3c6, 2.4, 1);
    }
  }
  // transformer can on the link pole
  g.roundRect(X + 2, TRUNK_Y * COS - 26, 8, 11, 2.5).fill(0x6e7a88).stroke({ color: 0x2f3844, width: 0.8 });
  return root;
}

