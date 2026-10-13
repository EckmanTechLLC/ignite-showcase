/** Geometry and small shared helpers of the single-line diagram (viewBox units). */
export const BUS_Y = 360;
export const SRC_Y = 50; // top of the source cards (PV, genset, BESS)
export const SRC_H = 176;
export const LOAD_Y = 500; // top of the load cards

/** Flow dash speed (px/s): proportional to |kW|, with a floor so a trickle still reads and a ceiling so a peak stays legible. */
export const speedOf = (kw: number): number => (Number.isFinite(kw) && Math.abs(kw) >= 0.5 ? Math.min(120, Math.max(10, Math.abs(kw) * 0.4)) : 0);

export const PV_X = [250, 470, 690, 910];
export const PV_ARRAYS = ['A1', 'A2', 'A3', 'A4'] as const;
export const BESS_IDS = ['B1', 'B2'] as const;
export const BLDG_IDS = ['1', '2', '3'] as const;
export const CHARGERS = Array.from({ length: 10 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);
export const BLDG_NAME: Record<string, string> = { '1': 'Office', '2': 'Lab', '3': 'Residence' };

export type Tone = 'ok' | 'warn' | 'alarm' | 'info' | 'off';
export const TONE: Record<Tone, string> = { ok: 'var(--ok)', warn: 'var(--warn)', alarm: 'var(--alarm)', info: 'var(--info)', off: 'var(--fg-2)' };

export const invTone = (s: string): Tone => (s === 'RUN' ? 'ok' : s === 'CURTAILED' ? 'warn' : s === 'FAULT' ? 'alarm' : 'off');
export const healthTone = (h: number): Tone => (!Number.isFinite(h) ? 'off' : h >= 90 ? 'ok' : h >= 75 ? 'warn' : 'alarm');
