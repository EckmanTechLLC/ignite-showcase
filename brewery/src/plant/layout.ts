import type { VesselSpec } from './vessel';
import { BBTS, FVS } from '../model';
import { P, type Pt } from './iso';

// World layout in pixels. Vessels stand in horizontal rows (brewhouse, fermenters, bright tanks); the packaging line
// and its machines are isometric boxes along the x axis. All pipe routes below are polylines in the same pixels.

export const ROW_A = 215; // brewhouse + liquor tanks + utilities
export const ROW_B = 420; // fermenters
export const ROW_C = 588; // bright tanks

const brew = (id: string, title: string, x: number, rx: number, h: number, extra: Partial<VesselSpec> = {}): VesselSpec => ({
  id, title, base: `Brewhouse/${id}`, x, y: ROW_A, rx, h, elev: 6, cone: 0, palette: 'steel', lid: 'flat', process: true, kind: 'brew', ...extra,
});

export const BREWHOUSE: VesselSpec[] = [
  brew('HLT', 'HLT', 80, 30, 62, { elev: 8, process: false, kind: 'liquor', lid: 'dome' }),
  brew('MashTun', 'MASH TUN', 330, 40, 40, { lid: 'dome' }),
  brew('LauterTun', 'LAUTER TUN', 470, 44, 34),
  brew('Kettle', 'KETTLE', 620, 38, 52, { palette: 'copper', lid: 'chimney' }),
  brew('Whirlpool', 'WHIRLPOOL', 760, 28, 58, { palette: 'copper' }),
  brew('CLT', 'CLT', 990, 30, 62, { elev: 8, process: false, kind: 'liquor', lid: 'dome' }),
];
/** Brewhouse units without a cylinder (drawn as machines): Mill and Chiller. */
export const MILL = { id: 'Mill', title: 'MILL', x: 200, y: ROW_A };
export const CHILLER = { id: 'Chiller', title: 'WORT CHILLER', x: 880, y: ROW_A };

export const FV_X = (i: number): number => 90 + 76 * i;
export const BBT_X = (i: number): number => 130 + 130 * i;

export const CELLAR: VesselSpec[] = [
  ...FVS.map((id, i): VesselSpec => ({
    id, title: id, base: `Cellar/${id}`, x: FV_X(i), y: ROW_B, rx: 26, h: 58, elev: 16, cone: 12, palette: 'steel', lid: 'dome', process: true, kind: 'fv',
  })),
  ...BBTS.map((id, i): VesselSpec => ({
    id, title: id, base: `Cellar/${id}`, x: BBT_X(i), y: ROW_C, rx: 36, h: 34, elev: 12, cone: 8, palette: 'steel', lid: 'dome', process: true, kind: 'bbt',
  })),
];

/** Utilities pad x positions (ROW_A). */
export const UTIL_X = { Glycol: 1100, CIP: 1200, Boiler: 1320, CO2: 1420, Air: 1520 };

// --- packaging line (isometric) ---
export const LINE_ORIGIN: Pt = { x: 1150, y: 395 };
export const LINE_LEN = 63; // plan units
export const MACHINE_X = [6, 13.1, 20.2, 27.3, 34.4, 41.5, 48.6, 55.7];
export const MACHINE_W = [4.6, 4.2, 5.2, 4.2, 8, 4.4, 5.2, 4.4];
export const MACHINE_H = [4.6, 3.6, 6, 4.8, 3.6, 4.4, 4.6, 6.4];
/** Plan -> world for the line. */
export const L = (x: number, y: number, z = 0): Pt => {
  const p = P(x, y, z);
  return { x: LINE_ORIGIN.x + p.x, y: LINE_ORIGIN.y + p.y };
};

// --- pipe routes ---
const PROC_Y = ROW_A - 16;
export const LIQ_Y = 266;
export const STEAM_Y = 108;
export const FILL_Y = 298; // wort in
export const BEER_Y = 312; // beer out
export const FILL_X = 1026;
export const BEER_X = 1042;
export const H2_Y = 505;
export const H3_Y = 636;
export const GLY_Y = 472;
export const GLY_X = UTIL_X.Glycol;

export const pt = (x: number, y: number): Pt => ({ x, y });
const path = (...c: [number, number][]): Pt[] => c.map(([x, y]) => ({ x, y }));

export interface PipeDef {
  id: string;
  kind: 'grist' | 'water' | 'wort' | 'beer' | 'glycol' | 'steam' | 'cold';
  pts: Pt[];
  /** Pixel width of the pipe. */
  w?: number;
}

export const PIPES: PipeDef[] = [
  { id: 'mill-mash', kind: 'grist', pts: path([226, PROC_Y], [290, PROC_Y]) },
  { id: 'hlt-mash', kind: 'water', pts: path([104, ROW_A + 12], [104, LIQ_Y], [362, LIQ_Y], [362, ROW_A + 8]) },
  { id: 'hlt-lauter', kind: 'water', pts: path([362, LIQ_Y], [505, LIQ_Y], [505, ROW_A + 8]) },
  { id: 'mash-lauter', kind: 'wort', pts: path([370, PROC_Y], [426, PROC_Y]) },
  { id: 'lauter-kettle', kind: 'wort', pts: path([514, PROC_Y], [582, PROC_Y]) },
  { id: 'kettle-whirl', kind: 'wort', pts: path([658, PROC_Y], [732, PROC_Y]) },
  { id: 'whirl-chill', kind: 'wort', pts: path([788, PROC_Y], [850, PROC_Y]) },
  { id: 'clt-chill', kind: 'cold', pts: path([960, PROC_Y], [910, PROC_Y]) },
  { id: 'steam-kettle', kind: 'steam', pts: path([UTIL_X.Boiler, ROW_A - 66], [UTIL_X.Boiler, STEAM_Y], [634, STEAM_Y], [634, ROW_A - 62]), w: 4 },
  // chiller -> fill header -> fermenters
  { id: 'knockout', kind: 'wort', pts: path([905, ROW_A + 6], [905, 285], [FILL_X, 285], [FILL_X, FILL_Y]) },
  ...FVS.map((id, i): PipeDef => ({ id: `fill-${id}`, kind: 'wort', pts: path([FILL_X, FILL_Y], [FV_X(i) + 12, FILL_Y], [FV_X(i) + 12, ROW_B - 16 - 58 - 8]) })),
  // fermenter -> beer header -> trunk -> bright tank header -> bright tank
  ...FVS.map((id, i): PipeDef => ({ id: `xfer-${id}`, kind: 'beer', pts: path([FV_X(i) - 12, ROW_B - 16 - 58 - 4], [FV_X(i) - 12, BEER_Y], [BEER_X, BEER_Y], [BEER_X, H2_Y]) })),
  ...[0, 1, 2, 3].map((i): PipeDef => ({ id: `bbt-in-${i}`, kind: 'beer', pts: path([BEER_X, H2_Y], [BBT_X(i) + 12, H2_Y], [BBT_X(i) + 12, ROW_C - 12 - 34 - 12]) })),
  // bright tank -> filler
  ...[0, 1, 2, 3].map((i): PipeDef => ({ id: `bbt-out-${i}`, kind: 'beer', pts: path([BBT_X(i) + 33, ROW_C + 8], [BBT_X(i) + 33, H3_Y], [L(20.2, 3).x, H3_Y], [L(20.2, 3).x, L(20.2, 3).y + 6]) })),
  // glycol
  { id: 'glycol-main', kind: 'glycol', pts: path([GLY_X, ROW_A + 24], [GLY_X, GLY_Y]), w: 5 },
  ...FVS.map((id, i): PipeDef => ({ id: `glycol-${id}`, kind: 'glycol', pts: path([GLY_X, GLY_Y], [FV_X(i) + 24, GLY_Y], [FV_X(i) + 24, ROW_B - 6]), w: 4 })),
];

export const FLOW_COLOR: Record<PipeDef['kind'], number> = {
  grist: 0xc9a66b,
  water: 0x7cc4ff,
  wort: 0xf2a33a,
  beer: 0xffd25a,
  glycol: 0x4fd1f0,
  steam: 0xf4f7fb,
  cold: 0x6ea8ff,
};
