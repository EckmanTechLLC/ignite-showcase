// Isometric helpers. Plan units (x runs to the lower right, y to the lower left, z up) -> world pixels of the Pixi scene.
// A plan circle of radius r projects to an ellipse with half-axes (r K sqrt2, r K sqrt2 / 2).

export const K = 7; // pixels per plan unit along x and y
export const ZK = 6; // pixels per unit of height
export interface Pt {
  x: number;
  y: number;
}
export const P = (x: number, y: number, z = 0): Pt => ({ x: (x - y) * K, y: (x + y) * K * 0.5 - z * ZK });
export const ellipseRx = (r: number): number => r * K * Math.SQRT2;

// --- colours (numbers 0xRRGGBB) ----------------------------------------------------------------

export function hex(s: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  return m ? parseInt(m[1], 16) : 0x9aa7b8;
}
export function rgb(c: number): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
export function mix(a: number, b: number, t: number): number {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const f = (x: number, y: number) => Math.round(x + (y - x) * t);
  return (f(ar, br) << 16) | (f(ag, bg) << 8) | f(ab, bb);
}
/** f < 1 darkens, f > 1 lightens (towards white). */
export function shade(c: number, f: number): number {
  return f <= 1 ? mix(0x05080d, c, f) : mix(c, 0xffffff, Math.min(1, f - 1));
}
/** Black or near-white text for a background. */
export function contrast(c: number): number {
  const [r, g, b] = rgb(c);
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? 0x0a1018 : 0xf2f6fb;
}

/** Temperature ramp for the vessel jackets: ice blue -> teal -> green -> amber -> hot orange. */
const RAMP: [number, number][] = [
  [0, 0x6ec6ff],
  [8, 0x4fd1c5],
  [20, 0x9ad06a],
  [45, 0xf2c14e],
  [70, 0xff8a3d],
  [98, 0xff4d36],
];
export function tempColor(t: number): number {
  if (!Number.isFinite(t)) return 0x5b6b80;
  if (t <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) return mix(RAMP[i - 1][1], RAMP[i][1], (t - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]));
  }
  return RAMP[RAMP.length - 1][1];
}

export const STEEL = { dark: 0x3a4656, base: 0x5f6e82, light: 0x93a4ba, top: 0xb4c2d4 };
export const COPPER = { dark: 0x7a3f1c, base: 0xb4622b, light: 0xe39458, top: 0xf0b585 };
