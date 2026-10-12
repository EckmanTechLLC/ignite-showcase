// Scene geometry in viewBox units (1920 x 940). Everything is procedural SVG.

export const W = 1920;
export const H = 940;
/** Visible window: the top 52 units are margin, so the scene starts right under the HUD. */
export const VIEW_Y = 52;

export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const PAIRS = [
  { rows: ['A', 'B'], pdu: '1', crah: 1 },
  { rows: ['C', 'D'], pdu: '2', crah: 2 },
  { rows: ['E', 'F'], pdu: '3', crah: 3 },
] as const;

export const RACK_W = 76;
export const RACK_H = 50;
export const PITCH = 84;
export const RACK_X0 = 590;
export const RACK_X1 = RACK_X0 + 9 * PITCH + RACK_W; // 1422
/** Top of each row (A..F). Rows A,C,E take inlet air from the cold aisle below; B,D,F from above. */
export const ROW_Y = [104, 198, 282, 376, 460, 554];
export const COLD_Y = [154, 332, 510];
export const COLD_H = 44;
export const HOT_Y = [70, 248, 426, 604];
export const HOT_H = 34;

export const HALL_BOX = { x: 498, y: 64, w: 1010, h: 642 };
export const POWER_BOX = { x: 8, y: 64, w: 484, h: 642 };
export const COOL_BOX = { x: 1514, y: 64, w: 398, h: 846 };

export const BAND_TOP = [104, 282, 460];
export const bandCenter = (k: number) => BAND_TOP[k] + 72;
export const coldCenter = (k: number) => COLD_Y[k] + COLD_H / 2;

/** Rack number 1..60 -> grid position. */
export function rackPos(n: number) {
  const row = Math.floor((n - 1) / 10);
  const col = (n - 1) % 10;
  return { row, col, x: RACK_X0 + col * PITCH, y: ROW_Y[row], inletDown: row % 2 === 0 };
}
export const rackId = (n: number) => `R${String(n).padStart(2, '0')}`;

/** Busway y positions for a row (A feed, B feed): on the hot-aisle side of the racks. */
export function busY(row: number): { a: number; b: number } {
  const top = ROW_Y[row];
  return row % 2 === 0 ? { a: top - 8, b: top - 4 } : { a: top + RACK_H + 8, b: top + RACK_H + 4 };
}

// CRAH units at the row ends (x 1438..1500); 4 is the N+1 assist unit below the hall.
export const CRAH_X = 1438;
export const CRAH_W = 62;
export const crahBox = (n: number) => (n <= 3 ? { y: ROW_Y[(n - 1) * 2], h: 144 } : { y: 626, h: 68 });
export const crahCy = (n: number) => (n <= 3 ? coldCenter(n - 1) : 660);

// Power chain columns
export const PDU_X = 372;
export const PDU_W = 120;
export const PDU_H = 68;
export const pduY = (feed: 'A' | 'B', k: number) => BAND_TOP[k] + (feed === 'A' ? 0 : 76);
export const A_RISER = 520;
export const B_RISER = 528;
