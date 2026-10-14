/** Geometry (world units, ~1 unit = 25 cm) and shared constants of the campus map. North is up, east is right. */
export const WORLD = { x: 0, y: 0, w: 1610, h: 900 };

export const PV_ARRAYS = ['A1', 'A2', 'A3', 'A4'] as const;
export const BESS_IDS = ['B1', 'B2'] as const;
export const BLDG_IDS = ['1', '2', '3'] as const;
export const CHARGERS = Array.from({ length: 10 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);
export const BLDG_NAME: Record<string, string> = { '1': 'Office', '2': 'Lab', '3': 'Residence' };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Pt = { x: number; y: number };

/** The buried trunk runs along the central road; every asset taps it with a short lead. */
export const TRUNK_Y = 340;
export const TRUNK_X0 = 120;
export const SUB_X = 1400; // trunk meets the substation bus
export const LINK_END = { x: 1585, y: TRUNK_Y }; // utility pole beyond the fence

export const PV_FIELD = { x: [30, 370, 710, 1050], y: 40, w: 300, h: 236 } as const;
export const PV_ROWS = 6;
export const PV_ROW = { dx: 15, dy: 28, w: 270, h: 24, pitch: 34 } as const;
export const pvRowRect = (a: number, r: number): Rect => ({ x: PV_FIELD.x[a] + PV_ROW.dx, y: PV_FIELD.y + PV_ROW.dy + r * PV_ROW.pitch, w: PV_ROW.w, h: PV_ROW.h });
export const pvFieldRect = (a: number): Rect => ({ x: PV_FIELD.x[a], y: PV_FIELD.y, w: PV_FIELD.w, h: PV_FIELD.h });
export const pvTap = (a: number): Pt => ({ x: PV_FIELD.x[a] + PV_FIELD.w / 2, y: PV_FIELD.y + PV_FIELD.h });

export const BLDG = [
  { id: '1', x: 90, y: 410, w: 200, h: 110 },
  { id: '2', x: 340, y: 410, w: 200, h: 110 },
  { id: '3', x: 590, y: 410, w: 190, h: 110 },
] as const;
export const BLDG_FACADE = 26;

export const BESS = [
  { id: 'B1', x: 920, y: 400, w: 160, h: 54 },
  { id: 'B2', x: 920, y: 480, w: 160, h: 54 },
] as const;

export const GENSET = { x: 1170, y: 400, w: 120, h: 70 };
export const SUBSTATION = { x: 1395, y: 285, w: 135, h: 130 };
export const FENCE_X = 1545;

export const EV_LOT = { x: 90, y: 610, w: 500, h: 220 };
export const EV_BAY = { w: 100, h: 82 };
/** Bay rectangle of charger `i` (0..9): two rows of five, aisle between. */
export const bayRect = (i: number): Rect => {
  const col = i % 5;
  const row = Math.floor(i / 5);
  return { x: EV_LOT.x + col * EV_BAY.w, y: EV_LOT.y + (row ? 138 : 0), w: EV_BAY.w, h: EV_BAY.h };
};

/** Heights (world units) used for the shadow projection. */
export const H = { pv: 9, bldg: 46, tree: 30, bess: 15, genset: 20, sub: 26, car: 8, pole: 24 } as const;

export const COLOR = {
  pv: 0xfacc15,
  bess: 0x38bdf8,
  bessCharge: 0x2dd4bf,
  grid: 0x34d399,
  genset: 0x9aa7b8,
  load: 0x60a5fa,
  island: 0xf87171,
  warn: 0xfbbf24,
  accent: 0xa3e635,
} as const;

/** Buried conductors: lead from each asset to the trunk (source direction first), then the trunk and the utility link. */
export const LEADS: Record<string, Pt[]> = {
  A1: [pvTap(0), { x: pvTap(0).x, y: TRUNK_Y }],
  A2: [pvTap(1), { x: pvTap(1).x, y: TRUNK_Y }],
  A3: [pvTap(2), { x: pvTap(2).x, y: TRUNK_Y }],
  A4: [pvTap(3), { x: pvTap(3).x, y: TRUNK_Y }],
  B1: [{ x: 1000, y: 400 }, { x: 1000, y: TRUNK_Y }],
  B2: [{ x: 920, y: 507 }, { x: 895, y: 507 }, { x: 895, y: TRUNK_Y }],
  GEN: [{ x: 1230, y: 400 }, { x: 1230, y: TRUNK_Y }],
  EV: [{ x: 590, y: 720 }, { x: 830, y: 720 }, { x: 830, y: TRUNK_Y }],
  L1: [{ x: 190, y: 410 }, { x: 190, y: TRUNK_Y }],
  L2: [{ x: 440, y: 410 }, { x: 440, y: TRUNK_Y }],
  L3: [{ x: 685, y: 410 }, { x: 685, y: TRUNK_Y }],
};
/** Trunk position of each lead's tap. */
export const TAP_X: Record<string, number> = Object.fromEntries(Object.entries(LEADS).map(([k, p]) => [k, p[p.length - 1].x]));
/** Substation bus and utility link, in the import direction (pole -> substation). */
export const LINK: Pt[] = [LINK_END, { x: SUB_X, y: TRUNK_Y }];

export const ROADS: Rect[] = [
  { x: 40, y: 322, w: FENCE_X - 40 + 20, h: 36 },
  { x: 40, y: 560, w: 1460, h: 30 },
  { x: 816, y: 340, w: 28, h: 230 },
];

/** Street light positions (also shadow casters and night glow). */
export const LIGHTS: Pt[] = [
  ...Array.from({ length: 9 }, (_, i) => ({ x: 150 + i * 150, y: 316 })),
  ...Array.from({ length: 7 }, (_, i) => ({ x: 150 + i * 200, y: 554 })),
  { x: 86, y: 606 }, { x: 594, y: 606 }, { x: 86, y: 834 }, { x: 594, y: 834 },
];

export interface Tree {
  x: number;
  y: number;
  r: number;
  tone: number;
}

/** Deterministic tree scatter on the free lawn (seeded, so every load looks the same). */
export function makeTrees(): Tree[] {
  const solid: Rect[] = [
    ...PV_FIELD.x.map((_, a) => ({ ...pvFieldRect(a), x: PV_FIELD.x[a] - 14, w: PV_FIELD.w + 28 })),
    ...BLDG.map((b) => ({ x: b.x - 20, y: b.y - 20, w: b.w + 40, h: b.h + BLDG_FACADE + 40 })),
    ...BESS.map((b) => ({ x: b.x - 40, y: b.y - 20, w: b.w + 60, h: b.h + 40 })),
    { x: GENSET.x - 20, y: GENSET.y - 20, w: GENSET.w + 60, h: GENSET.h + 40 },
    { x: SUBSTATION.x - 20, y: SUBSTATION.y - 20, w: 200, h: SUBSTATION.h + 40 },
    { x: EV_LOT.x - 24, y: EV_LOT.y - 24, w: EV_LOT.w + 48, h: EV_LOT.h + 48 },
    ...ROADS.map((r) => ({ x: r.x - 18, y: r.y - 18, w: r.w + 36, h: r.h + 36 })),
    { x: 580, y: 700, w: 270, h: 40 }, // EV feeder run
  ];
  let seed = 20261014;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out: Tree[] = [];
  let guard = 0;
  while (out.length < 54 && guard++ < 4000) {
    const r = 9 + rnd() * 8;
    const x = 20 + rnd() * (WORLD.w - 60);
    const y = 12 + rnd() * (WORLD.h - 24);
    if (solid.some((s) => x > s.x - r && x < s.x + s.w + r && y > s.y - r && y < s.y + s.h + r)) continue;
    if (out.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + r + 4)) continue;
    out.push({ x, y, r, tone: Math.floor(rnd() * 3) });
  }
  return out;
}
