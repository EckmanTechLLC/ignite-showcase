import { Container, Graphics } from 'pixi.js';
import { BLDG, BLDG_WALL, COLS, COS, windowCells } from './model';
import { box, contact, cyl, hash, line, poly, shade, slab, wall, wallGradient } from './iso';

/** Static facades, roofs and roof plant of the three buildings (procedural, oblique). Dynamic parts (lit windows, fans, badges) live in actors.ts. */

/** Roof fans (HVAC units) per building: centre in world coordinates + roof height, spun by `HVACkW`. */
export function roofFans(i: number): { x: number; y: number; z: number; r: number }[] {
  const b = BLDG[i];
  const z = BLDG_WALL[i] + 2.4;
  if (i === 0) return [0, 1, 2].map((k) => ({ x: b.x + 36 + k * 62 + 14, y: b.y + 22 + (k === 1 ? 30 : 0) + 8, z: z + 8, r: 6.5 }));
  if (i === 1) return [0, 1].map((k) => ({ x: b.x + 44 + k * 74 + 14, y: b.y + 20 + 8, z: z + 7, r: 6 }));
  return [];
}

export const FACADE_Y = (i: number): number => BLDG[i].y + BLDG[i].h;
/** Centre of the entrance sign plate (screen position of the name label). */
export const signCentre = (i: number): { x: number; y: number } => {
  const b = BLDG[i];
  if (i === 0) return { x: b.x + b.w / 2, y: (b.y + b.h) * COS - 19 };
  if (i === 1) return { x: b.x + 54, y: (b.y + b.h - 8) * COS - 41 };
  return { x: b.x + 58, y: (b.y + b.h + 22) * COS - 9 };
};

function bulkhead(g: Graphics, x: number, y: number, w: number, d: number, z: number, h: number, c: number): void {
  box(g, x, y, w, d, z, h, { top: shade(c, 1.15), front: c });
}

function hvacUnit(g: Graphics, x: number, y: number, w: number, d: number, z: number, h: number): void {
  box(g, x, y, w, d, z, h, { top: 0x9aa6b5, front: 0x6d7a8a });
  // louvres on the front
  for (let k = 1; k < 4; k++) line(g, [[x + 2, y + d, z + (h * k) / 4], [x + w - 2, y + d, z + (h * k) / 4]], 0x39424f, 0.7, 0.8);
}

function officeStatic(): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const b = BLDG[0];
  const yF = b.y + b.h;
  const H = BLDG_WALL[0];
  const cx = b.x + b.w / 2;
  contact(g, b.x, b.y, b.w, b.h, 0.34);
  // glass curtain wall: sky reflection fading to a dark base, floor slabs, cells, mullions
  wallGradient(g, b.x, b.x + b.w, yF, 0, H, 0x7aa0bd, 0x24425a, 10);
  for (let f = 1; f < 4; f++) wall(g, b.x, b.x + b.w, yF, f * 12 - 0.9, f * 12 + 0.9, 0xb7c2d0);
  for (const w of windowCells(0)) {
    wall(g, w.x0, w.x1, yF, w.z0, w.z1, 0x142638);
    wall(g, w.x0, w.x1, yF, w.z1 - (w.z1 - w.z0) * 0.45, w.z1, 0x2d5372, 0.85);
    // diagonal reflection streak
    poly(g, [[w.x0 + 1, yF, w.z0 + 0.5], [w.x0 + 3.2, yF, w.z0 + 0.5], [w.x0 + 5.6, yF, w.z1 - 0.3], [w.x0 + 3.4, yF, w.z1 - 0.3]], 0xcfe6ff, 0.13);
  }
  const pitch = (b.w - 16) / COLS[0];
  for (let c = 0; c <= COLS[0]; c++) line(g, [[b.x + 8 + c * pitch, yF, 0], [b.x + 8 + c * pitch, yF, H]], 0xa9b6c6, 0.9, 0.8);
  wall(g, b.x, b.x + 8, yF, 0, H, 0x8794a5);
  wall(g, b.x + b.w - 8, b.x + b.w, yF, 0, H, 0x7a8799);
  wall(g, b.x, b.x + b.w, yF, 0, 1.6, 0x39424f); // plinth
  // lobby: three glass doors under a canopy
  wall(g, cx - 18, cx + 18, yF, 0, 11, 0x0d1923);
  for (let k = 0; k < 3; k++) wall(g, cx - 17 + k * 11.6, cx - 6.5 + k * 11.6, yF, 0.4, 9.6, 0x2a4d68, 0.9);
  for (let k = 0; k <= 3; k++) line(g, [[cx - 18 + k * 12, yF, 0], [cx - 18 + k * 12, yF, 11]], 0xc6cfdb, 0.9, 0.8);
  // entrance canopy (slab out front on two columns)
  wall(g, cx - 4, cx + 4, yF + 15, 0, 13, 0x6c7787, 0.0);
  slab(g, cx - 24, yF, 48, 15, 14, 0xe1e6ec);
  wall(g, cx - 24, cx + 24, yF + 15, 12.6, 14, 0xa3adba);
  for (const dx of [-21, 21]) line(g, [[cx + dx, yF + 13, 0], [cx + dx, yF + 13, 12.6]], 0xb8c1cd, 2, 1);
  slab(g, cx - 24, yF + 6, 48, 9, 0.2, 0x3a424e, 0.55); // shade under the canopy
  // sign plate over the canopy
  wall(g, cx - 26, cx + 26, yF, 15, 23, 0x0b121a);
  line(g, [[cx - 26, yF, 23], [cx + 26, yF, 23], [cx + 26, yF, 15], [cx - 26, yF, 15], [cx - 26, yF, 23]], 0x7dd3fc, 0.8, 0.9);
  // parapet + roof
  wall(g, b.x - 1, b.x + b.w + 1, yF, H, H + 2.4, 0xd6dce4);
  const RZ = H + 2.4;
  slab(g, b.x - 1, b.y - 1, b.w + 2, b.h + 2, RZ, 0xaab4c1);
  slab(g, b.x + 3, b.y + 3, b.w - 6, b.h - 6, RZ, 0x5d687a);
  for (let k = 1; k < 9; k++) line(g, [[b.x + 3, b.y + 3 + k * ((b.h - 6) / 9), RZ], [b.x + b.w - 3, b.y + 3 + k * ((b.h - 6) / 9), RZ]], 0x6e7a8c, 0.6, 0.5);
  // roof plant: three HVAC units, stair bulkhead, a small roof PV strip
  for (const f of roofFans(0)) hvacUnit(g, f.x - 14, f.y - 8, 28, 16, RZ, 8);
  bulkhead(g, b.x + b.w - 40, b.y + 12, 26, 20, RZ, 10, 0xaeb7c3);
  // roof PV strip: tilted panel row at the back, with a frame and cell grid
  const px = b.x + 12;
  const pw = 74;
  poly(g, [[px, b.y + 9, RZ + 5.2], [px + pw, b.y + 9, RZ + 5.2], [px + pw, b.y + 19, RZ + 1], [px, b.y + 19, RZ + 1]], 0x2c4f9b);
  for (let k = 1; k < 12; k++) line(g, [[px + (k * pw) / 12, b.y + 9, RZ + 5.2], [px + (k * pw) / 12, b.y + 19, RZ + 1]], 0x8fb0e8, 0.5, 0.6);
  line(g, [[px, b.y + 14, RZ + 3.1], [px + pw, b.y + 14, RZ + 3.1]], 0x8fb0e8, 0.5, 0.6);
  line(g, [[px, b.y + 19, RZ + 1], [px + pw, b.y + 19, RZ + 1]], 0xd0d8e4, 1.2, 0.9);
  return root;
}

function labStatic(): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const b = BLDG[1];
  const yF = b.y + b.h;
  const H = BLDG_WALL[1];
  contact(g, b.x, b.y, b.w, b.h, 0.34);
  // generator pad + small standby set east of the lab
  slab(g, b.x + b.w + 6, b.y + 62, 38, 42, 1.4, 0x6b7077);
  wall(g, b.x + b.w + 6, b.x + b.w + 44, b.y + 104, 0, 1.4, 0x474d55);
  box(g, b.x + b.w + 12, b.y + 74, 26, 16, 1.4, 11, { top: 0xaab3bf, front: 0x8a95a3 });
  cyl(g, b.x + b.w + 34, b.y + 78, 1.6, 12.4, 12, 0x3b4450, 0x59636f);
  for (let k = 1; k < 4; k++) line(g, [[b.x + b.w + 14, b.y + 90, 1.4 + k * 2.6], [b.x + b.w + 36, b.y + 90, 1.4 + k * 2.6]], 0x4b5563, 0.7, 0.8);
  // ground floor brick, upper floor metal panel cladding
  wallGradient(g, b.x, b.x + b.w, yF, 0, 14, 0x9a6650, 0x7a4c3b, 4);
  for (let k = 1; k < 7; k++) line(g, [[b.x, yF, k * 2], [b.x + b.w, yF, k * 2]], 0x5a3427, 0.5, 0.45);
  for (let k = 0; k < 40; k++) for (let r = 0; r < 7; r++) if (hash(k, r) > 0.82) wall(g, b.x + k * 5, b.x + k * 5 + 4.6, yF, r * 2 + 0.2, r * 2 + 1.8, hash(k, r + 9) > 0.5 ? 0xa8735b : 0x6d4233, 0.7);
  wallGradient(g, b.x, b.x + b.w, yF, 14, H, 0x93a7ba, 0x6c8095, 4);
  for (let k = 0; k <= 16; k++) line(g, [[b.x + k * 12.5, yF, 14], [b.x + k * 12.5, yF, H]], 0x56687a, 0.7, 0.7);
  wall(g, b.x, b.x + b.w, yF, 13.4, 14.8, 0xc0c9d4); // floor band
  for (const w of windowCells(1)) {
    wall(g, w.x0, w.x1, yF, w.z0, w.z1, 0x142030);
    wall(g, w.x0, w.x1, yF, w.z1 - 2, w.z1, 0x3a5a76, 0.8);
    line(g, [[w.x0, yF, w.z0], [w.x1, yF, w.z0]], 0xd0d8e2, 1, 0.9);
  }
  // main entrance (double door) and loading dock with roll-up door
  wall(g, b.x + 100, b.x + 114, yF, 0, 9, 0x10202c);
  line(g, [[b.x + 107, yF, 0], [b.x + 107, yF, 9]], 0xaeb9c6, 0.9, 0.8);
  slab(g, b.x + 96, yF, 22, 7, 11, 0x4a5563);
  wall(g, b.x + 96, b.x + 118, yF + 7, 10, 11, 0x2f3845);
  wall(g, b.x + 128, b.x + 188, yF, 0, 12, 0x161c25); // dock recess
  for (let k = 0; k < 10; k++) wall(g, b.x + 134, b.x + 156, yF, 1.2 + k * 1.05, 1.9 + k * 1.05, k % 2 ? 0x8a94a1 : 0xa4adb9);
  wall(g, b.x + 162, b.x + 184, yF, 0, 8, 0x1c232d);
  slab(g, b.x + 126, yF, 64, 12, 3.4, 0x676e78); // dock leveller apron
  wall(g, b.x + 126, b.x + 190, yF + 12, 0, 3.4, 0x464c55);
  for (const x of [128, 184]) box(g, b.x + x, yF + 1, 4, 3, 2.4, 3, { top: 0x2a2f37, front: 0x1b1f26 });
  line(g, [[b.x + 126, yF + 12, 3.4], [b.x + 190, yF + 12, 3.4]], 0xf6c945, 1.6, 0.9); // hazard edge
  // roof: parapet, surface, exhaust stacks, fume-hood boxes, roof sign
  wall(g, b.x - 1, b.x + b.w + 1, yF, H, H + 2.2, 0xcfd5dd);
  const RZ = H + 2.2;
  slab(g, b.x - 1, b.y - 1, b.w + 2, b.h + 2, RZ, 0xa7b0bc);
  slab(g, b.x + 3, b.y + 3, b.w - 6, b.h - 6, RZ, 0x566474);
  for (let k = 1; k < 6; k++) line(g, [[b.x + 3 + k * 32, b.y + 3, RZ], [b.x + 3 + k * 32, b.y + b.h - 3, RZ]], 0x677588, 0.6, 0.45);
  for (const f of roofFans(1)) hvacUnit(g, f.x - 14, f.y - 8, 28, 16, RZ, 7);
  for (let k = 0; k < 3; k++) {
    const sx = b.x + 120 + k * 24;
    cyl(g, sx, b.y + 38, 3.6, RZ, 15, 0xb9c2cd, 0x737f8d);
    cyl(g, sx, b.y + 38, 5, RZ + 15, 2, 0x6a7482, 0x4a525e); // hood
  }
  box(g, b.x + 20, b.y + 52, 38, 22, RZ, 8, { top: 0x7e8a98, front: 0x58636f });
  box(g, b.x + 70, b.y + 60, 30, 18, RZ, 6, { top: 0x7e8a98, front: 0x58636f });
  // roof sign on two legs (the CRITICAL badge sits on it)
  const sy = yF - 8;
  for (const sx of [b.x + 40, b.x + 118]) line(g, [[sx, sy, RZ], [sx, sy, RZ + 9]], 0x39424f, 1.6, 1);
  wall(g, b.x + 32, b.x + 126, sy, RZ + 6, RZ + 16, 0x0b121a);
  line(g, [[b.x + 32, sy, RZ + 16], [b.x + 126, sy, RZ + 16], [b.x + 126, sy, RZ + 6], [b.x + 32, sy, RZ + 6], [b.x + 32, sy, RZ + 16]], 0xfbbf24, 0.9, 0.9);
  return root;
}

function residenceStatic(): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const b = BLDG[2];
  const yF = b.y + b.h;
  const H = BLDG_WALL[2];
  const cx = b.x + b.w * 0.5;
  contact(g, b.x, b.y, b.w, b.h, 0.34);
  // plaster walls with trim, windows with shutters
  wallGradient(g, b.x, b.x + b.w, yF, 0, H, 0xd4bf9f, 0xb09a7c, 6);
  wall(g, b.x, b.x + b.w, yF, 0, 2, 0x8c7860);
  for (let f = 1; f < 3; f++) wall(g, b.x, b.x + b.w, yF, f * 12 - 0.5, f * 12 + 0.5, 0xeee3cf);
  wall(g, b.x, b.x + 3, yF, 0, H, 0xe9dcc4);
  wall(g, b.x + b.w - 3, b.x + b.w, yF, 0, H, 0xe9dcc4);
  for (const w of windowCells(2)) {
    wall(g, w.x0 - 1.4, w.x1 + 1.4, yF, w.z0 - 0.8, w.z1 + 0.6, 0xf0e6d2); // frame
    wall(g, w.x0, w.x1, yF, w.z0, w.z1, 0x1a2634);
    wall(g, w.x0, w.x1, yF, w.z1 - 2.2, w.z1, 0x36516a, 0.8);
    line(g, [[(w.x0 + w.x1) / 2, yF, w.z0], [(w.x0 + w.x1) / 2, yF, w.z1]], 0xf0e6d2, 0.8, 0.9);
    wall(g, w.x0 - 4.2, w.x0 - 1.6, yF, w.z0 - 0.6, w.z1 + 0.4, 0x4f6b57); // shutters
    wall(g, w.x1 + 1.6, w.x1 + 4.2, yF, w.z0 - 0.6, w.z1 + 0.4, 0x4f6b57);
  }
  // front door with a small porch
  const dx = b.x + 8 + 2 * ((b.w - 16) / COLS[2]);
  wall(g, dx + 2, dx + 2 + 2 * ((b.w - 16) / COLS[2]) - 4, yF, 0, 9, 0x4b3326);
  line(g, [[dx + 2 + ((b.w - 16) / COLS[2]) - 2, yF, 0], [dx + 2 + ((b.w - 16) / COLS[2]) - 2, yF, 9]], 0x2a1b12, 1, 0.9);
  slab(g, dx - 2, yF, 2 * ((b.w - 16) / COLS[2]) + 4, 9, 11, 0xd7ccb7);
  wall(g, dx - 2, dx + 2 * ((b.w - 16) / COLS[2]) + 2, yF + 9, 10, 11, 0x9c8f78);
  // balconies on floors 2 and 3 with railings
  for (const f of [1, 2]) {
    const bz = f * 12;
    for (const [bx0, bw] of [[b.x + 12, 38], [b.x + b.w - 50, 38]] as const) {
      slab(g, bx0, yF, bw, 8, bz, 0xcdc2ae);
      wall(g, bx0, bx0 + bw, yF + 8, bz - 1.2, bz, 0x7e7360);
      for (let k = 0; k <= 8; k++) line(g, [[bx0 + (k * bw) / 8, yF + 8, bz], [bx0 + (k * bw) / 8, yF + 8, bz + 4.4]], 0x38424f, 0.8, 0.9);
      line(g, [[bx0, yF + 8, bz + 4.4], [bx0 + bw, yF + 8, bz + 4.4]], 0x38424f, 1.2, 1);
    }
  }
  // pitched clay-tile roof: back slope (darker), front slope (lit), ridge cap, chimneys
  const ry = b.y + b.h / 2;
  poly(g, [[b.x - 5, ry, H + 14], [b.x + b.w + 5, ry, H + 14], [b.x + b.w + 5, b.y - 5, H - 1], [b.x - 5, b.y - 5, H - 1]], 0x5d2e2a);
  const front: [number, number, number][] = [[b.x - 5, yF + 5, H - 1], [b.x + b.w + 5, yF + 5, H - 1], [b.x + b.w + 5, ry, H + 14], [b.x - 5, ry, H + 14]];
  poly(g, front, 0x8c4a3e);
  for (let k = 1; k < 12; k++) {
    const t = k / 12;
    line(g, [[b.x - 5, yF + 5 + (ry - yF - 5) * t, H - 1 + 15 * t], [b.x + b.w + 5, yF + 5 + (ry - yF - 5) * t, H - 1 + 15 * t]], 0x6b352c, 0.8, 0.7);
  }
  for (let k = 0; k < 16; k++) line(g, [[b.x - 5 + (k * (b.w + 10)) / 16, yF + 5, H - 1], [b.x - 5 + (k * (b.w + 10)) / 16, ry, H + 14]], 0x6b352c, 0.4, 0.35);
  wall(g, b.x - 5, b.x + b.w + 5, yF + 5, H - 2, H - 0.6, 0xdfd3bd); // fascia
  line(g, [[b.x - 5, ry, H + 14], [b.x + b.w + 5, ry, H + 14]], 0xb25f4e, 2.2, 1);
  for (const cxp of [b.x + 40, b.x + b.w - 52]) {
    box(g, cxp, ry - 14, 12, 9, H + 6, 11, { top: 0x6c5a4e, front: 0x9a6a55 });
    for (let k = 1; k < 4; k++) line(g, [[cxp, ry - 5, H + 6 + k * 2.6], [cxp + 12, ry - 5, H + 6 + k * 2.6]], 0x5e3e30, 0.6, 0.7);
    slab(g, cxp + 2, ry - 12, 8, 5, H + 17.2, 0x2a2420);
  }
  // garden name board in front of the porch
  for (const sx of [b.x + 34, b.x + 82]) line(g, [[sx, yF + 22, 0], [sx, yF + 22, 6]], 0x6b5a45, 1.6, 1);
  wall(g, b.x + 28, b.x + 88, yF + 22, 5, 13, 0x0b121a);
  line(g, [[b.x + 28, yF + 22, 13], [b.x + 88, yF + 22, 13], [b.x + 88, yF + 22, 5], [b.x + 28, yF + 22, 5], [b.x + 28, yF + 22, 13]], 0xf0abfc, 0.8, 0.9);
  // a dormer on the front slope
  box(g, cx - 10, ry + 4, 20, 10, H + 10.5, 6, { top: 0x6e3a30, front: 0xcdbd9f });
  wall(g, cx - 6, cx + 6, ry + 14, H + 12, H + 15.5, 0x1a2634);
  return root;
}

/** Static art of building `i` (cached as one texture by the scene). */
export function buildBuilding(i: number): Container {
  return i === 0 ? officeStatic() : i === 1 ? labStatic() : residenceStatic();
}

