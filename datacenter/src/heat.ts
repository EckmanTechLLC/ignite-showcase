// Perceptual rack heat scale: cool blue (18 C) -> teal -> lime (24) -> amber (27, ASHRAE recommended
// limit) -> orange -> red (32+, ASHRAE A1 allowable). Stops were chosen so lightness rises monotonically
// to amber and the two ASHRAE thresholds read as distinct steps on the dark background.

export const T_MIN = 18;
export const T_RECOMMENDED = 27;
export const T_ALLOWABLE = 32;
export const T_MAX = 36;

const STOPS: [number, [number, number, number]][] = [
  [18, [40, 96, 214]],
  [21, [34, 160, 184]],
  [24, [150, 190, 70]],
  [27, [245, 165, 36]],
  [30, [240, 100, 40]],
  [32, [232, 52, 52]],
  [36, [255, 40, 96]],
];

function mix(t: number): [number, number, number] {
  if (t <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    if (t <= t1) {
      const [t0, c0] = STOPS[i - 1];
      const f = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

const LUT: string[] = [];
for (let i = 0; i <= (T_MAX - T_MIN) * 10; i++) {
  const [r, g, b] = mix(T_MIN + i / 10);
  LUT.push(`rgb(${r | 0} ${g | 0} ${b | 0})`);
}
const NEUTRAL = 'rgb(58 70 86)';

/** Fill colour for a rack inlet temperature (deg C). */
export function heatColor(tempC: number): string {
  if (!Number.isFinite(tempC)) return NEUTRAL;
  const i = Math.round((Math.min(T_MAX, Math.max(T_MIN, tempC)) - T_MIN) * 10);
  return LUT[i];
}

/** Position 0..1 of a temperature along the legend. */
export const heatPos = (t: number) => (Math.min(T_MAX, Math.max(T_MIN, t)) - T_MIN) / (T_MAX - T_MIN);

const WATER: [number, [number, number, number]][] = [
  [6, [47, 140, 255]],
  [9, [70, 200, 235]],
  [11, [150, 210, 170]],
  [12.5, [245, 190, 90]],
  [15, [255, 110, 60]],
];

/** Chilled-water colour: 6 C blue -> 12.5 C amber -> 15 C orange. Drives the loop drift when a chiller trips. */
export function waterColor(tempC: number): string {
  if (!Number.isFinite(tempC)) return 'rgb(70 90 110)';
  tempC = Math.round(tempC * 4) / 4; // quarter-degree steps: the colour only moves (and transitions) when it visibly changes
  if (tempC <= WATER[0][0]) return `rgb(${WATER[0][1].join(' ')})`;
  for (let i = 1; i < WATER.length; i++) {
    const [t1, c1] = WATER[i];
    if (tempC <= t1) {
      const [t0, c0] = WATER[i - 1];
      const f = (tempC - t0) / (t1 - t0);
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * f)).join(' ')})`;
    }
  }
  return `rgb(${WATER[WATER.length - 1][1].join(' ')})`;
}

/** Hot aisle tint from the mean outlet temperature (28 C calm .. 44 C hot). */
export function hotAisleColor(outletC: number): string {
  if (!Number.isFinite(outletC)) return 'rgb(60 40 40)';
  const f = Math.min(1, Math.max(0, (outletC - 28) / 16));
  return `rgb(${Math.round(120 + 135 * f)} ${Math.round(70 - 30 * f)} ${Math.round(50 - 10 * f)})`;
}
