// Scene layout in metres. x runs along the rows (west -> east), z across them (north -> south), y is up.
// The hall is rows A..F in three pairs; a pair shares a cold aisle (rows A,C,E face +z, rows B,D,F face -z),
// hot aisles sit outside the pairs. CRAH 1-3 stand on the east wall at their cold aisle, CRAH 4 (assist) on the north wall.
// The electrical room is west of the hall; chillers sit on a roof deck east of it.
import type { Kind } from '../selection';

export const ROW_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const rackId = (n: number) => `R${String(n).padStart(2, '0')}`;

export const RACK_COLS = 10;
export const RACK_PITCH = 0.7;
export const RACK_W = 0.6;
export const RACK_D = 1.1;
export const RACK_H = 2.1;
export const AISLE_W = 1.4;
export const PAIR_PITCH = 5.0; // 2 racks + cold aisle + hot aisle = 1.1 + 1.4 + 1.1 + 1.4
export const HALL_X0 = -0.5;
export const HALL_X1 = 8.7;
export const HALL_Z0 = 0;
export const HALL_Z1 = 16.4;
export const HALL_CX = (HALL_X0 + HALL_X1) / 2;
export const HALL_CZ = (HALL_Z0 + HALL_Z1) / 2;
export const RACKS_X1 = (RACK_COLS - 1) * RACK_PITCH + RACK_W; // 6.9
export const WALL_H = 3.4;
export const BUSWAY_Y = 2.8;
export const ELEC_X0 = -7.4;

export const rackX = (col: number) => col * RACK_PITCH + RACK_W / 2 + 0.05;
/** Cold aisle centre z of pair p (0..2) and hot aisle centre z of aisle k (0..3). */
export const coldZ = (p: number) => 3.2 + PAIR_PITCH * p;
export const hotZ = (k: number) => 0.7 + PAIR_PITCH * k;

export interface RackPos {
  n: number;
  id: string;
  row: number;
  col: number;
  pair: number;
  side: 0 | 1;
  x: number;
  z: number;
  /** +1 when the inlet face looks towards +z. */
  face: 1 | -1;
}
/** Rack number 1..60 -> position. */
export function rackPos(n: number): RackPos {
  const row = Math.floor((n - 1) / 10);
  const col = (n - 1) % 10;
  const pair = row >> 1;
  const side = (row & 1) as 0 | 1;
  const z = side === 0 ? 1.4 + PAIR_PITCH * pair + RACK_D / 2 : 3.9 + PAIR_PITCH * pair + RACK_D / 2;
  return { n, id: rackId(n), row, col, pair, side, x: rackX(col), z, face: side === 0 ? 1 : -1 };
}
export const RACKS: RackPos[] = Array.from({ length: 60 }, (_, i) => rackPos(i + 1));

/** CRAH 1..4: centre, size (x, y, z) and the direction the grille faces. */
export interface CrahPos {
  n: number;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** Unit vector of the grille normal (towards the hall). */
  nx: number;
  nz: number;
  pair: number;
}
export const CRAHS: CrahPos[] = [
  ...[0, 1, 2].map((p): CrahPos => ({ n: p + 1, x: 8.2, y: 1.2, z: coldZ(p), sx: 1.0, sy: 2.4, sz: 1.8, nx: -1, nz: 0, pair: p })),
  { n: 4, x: 3.6, y: 1.1, z: -0.05, sx: 1.8, sy: 2.2, sz: 1.0, nx: 0, nz: 1, pair: -1 },
];

export interface Equip {
  kind: Kind;
  id: string;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}
const eq = (kind: Kind, id: string, x: number, z: number, sx: number, sy: number, sz: number): Equip => ({ kind, id, x, y: sy / 2, z, sx, sy, sz });
export const PDU_X = -1.6;
export const UPS_X = -3.4;
export const ATS_X = -5.0;
export const SRC_X = -6.5;
const pduZ = (feed: 'A' | 'B', k: number) => coldZ(k) + (feed === 'A' ? -0.8 : 0.8);
export const EQUIP: Equip[] = [
  eq('utility', '', SRC_X, 2.4, 1.3, 1.9, 1.5),
  eq('generator', '', SRC_X, 13.6, 2.6, 1.7, 1.2),
  eq('ats', '', ATS_X, HALL_CZ, 1.0, 1.7, 1.3),
  eq('ups', 'A', UPS_X, 5.6, 1.0, 2.0, 1.6),
  eq('ups', 'B', UPS_X, 10.8, 1.0, 2.0, 1.6),
  ...(['A', 'B'] as const).flatMap((f) => [0, 1, 2].map((k) => eq('pdu', `${f}${k + 1}`, PDU_X, pduZ(f, k), 0.8, 1.7, 0.9))),
];
export const equipOf = (kind: Kind, id: string) => EQUIP.find((e) => e.kind === kind && e.id === id);

export interface ChillerPos {
  n: number;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}
export const ROOF_Y = 6.0;
export const CHILLERS: ChillerPos[] = [
  { n: 1, x: 13.0, y: ROOF_Y + 0.85, z: 5.2, sx: 3.6, sy: 1.7, sz: 2.0 },
  { n: 2, x: 13.0, y: ROOF_Y + 0.85, z: 11.2, sx: 3.6, sy: 1.7, sz: 2.0 },
];

export interface Bounds {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}
/** World-space box of a selectable item (fly-to and the highlight outline). */
export function boundsOf(kind: Kind, id: string): Bounds | null {
  switch (kind) {
    case 'rack': {
      const r = RACKS[Number(id.slice(1)) - 1];
      return r ? { x: r.x, y: RACK_H / 2, z: r.z, sx: RACK_W, sy: RACK_H, sz: RACK_D } : null;
    }
    case 'crah': {
      const c = CRAHS[Number(id) - 1];
      return c ? { x: c.x, y: c.y, z: c.z, sx: c.sx, sy: c.sy, sz: c.sz } : null;
    }
    case 'chiller': {
      const c = CHILLERS[Number(id) - 1];
      return c ? { x: c.x, y: c.y, z: c.z, sx: c.sx, sy: c.sy, sz: c.sz } : null;
    }
    default: {
      const e = equipOf(kind, id);
      return e ? { x: e.x, y: e.y, z: e.z, sx: e.sx, sy: e.sy, sz: e.sz } : null;
    }
  }
}
