import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { rawBool, rawNum, rawStr } from '../live/store';
import { FVS } from '../model';
import { FLOW_COLOR, PIPES, type PipeDef } from './layout';
import type { Pt } from './iso';

const clamp = (v: number, lo = 0, hi = 1): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const phaseOf = (p: string): string => rawStr(p);

/** Intensity 0..1 of each pipe, from the tags. A pipe with no entry here is drawn but never animated. */
const BH = 'Brewhouse/';
function ph(unit: string): string {
  return phaseOf(`${BH}${unit}/Phase`);
}
export const INTENSITY: Record<string, () => number> = {
  'mill-mash': () => (ph('Mill') === 'MILLING' || ph('MashTun') === 'MASH_IN' ? 1 : 0),
  'hlt-mash': () => (ph('MashTun') === 'MASH_IN' ? 1 : 0),
  'hlt-lauter': () => (ph('LauterTun') === 'RUNOFF' ? clamp(rawNum(`${BH}LauterTun/SpargeLpm`) / 8) : 0),
  'mash-lauter': () => (ph('LauterTun') === 'VORLAUF' || (ph('MashTun') === 'WAIT_LAUTER' && ph('LauterTun') === 'IDLE') ? 1 : 0),
  'lauter-kettle': () => (ph('LauterTun') === 'RUNOFF' ? clamp(rawNum(`${BH}LauterTun/RunoffLpm`) / 8) : 0),
  'kettle-whirl': () => (ph('Kettle') === 'TRANSFER' || ph('Whirlpool') === 'FILL' ? 1 : 0),
  'whirl-chill': () => (ph('Chiller') === 'PRECOOL' || ph('Chiller') === 'KNOCKOUT' ? 1 : 0),
  'clt-chill': () => (ph('Chiller') === 'PRECOOL' || ph('Chiller') === 'KNOCKOUT' ? 1 : 0),
  'steam-kettle': () => clamp(rawNum(`${BH}Kettle/SteamKgph`) / 300),
  knockout: () => (ph('Chiller') === 'KNOCKOUT' ? clamp(rawNum(`${BH}Chiller/FlowLpm`) / 30, 0.3) : 0),
  'glycol-main': () => (rawBool('Utilities/Glycol/Fault') ? 0 : clamp(rawNum('Utilities/Glycol/LoadPct') / 40)),
};

FVS.forEach((id) => {
  const base = `Cellar/${id}/`;
  INTENSITY[`fill-${id}`] = () => (ph('Chiller') === 'KNOCKOUT' && rawStr(`${base}Phase`) === 'FILLING' ? 1 : 0);
  INTENSITY[`xfer-${id}`] = () => (rawStr(`${base}Phase`) === 'TRANSFER' ? 1 : 0);
  INTENSITY[`glycol-${id}`] = () => (rawBool('Utilities/Glycol/Fault') ? 0 : clamp(rawNum(`${base}GlycolValvePct`) / 35));
});
[1, 2, 3, 4].forEach((n, i) => {
  const base = `Cellar/BBT${n}/`;
  INTENSITY[`bbt-in-${i}`] = () => (rawStr(`${base}Phase`) === 'FILLING' ? 1 : 0);
  INTENSITY[`bbt-out-${i}`] = () => (rawStr(`${base}Phase`) === 'PACKAGING' ? clamp(rawNum('Packaging/Line/SpeedCPM') / 150, 0.15) : 0);
});

interface Flow {
  def: PipeDef;
  pts: Pt[];
  cum: number[];
  len: number;
  glow: Graphics;
  dots: Sprite[];
  phase: number;
  level: () => number;
  on: number;
}

function along(f: Flow, d: number): Pt {
  const { pts, cum } = f;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const t = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
  return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
}

/** The pipework: static tubes on the ground layer, glowing and carrying dots while a flow is active. */
export class Flows {
  private readonly flows: Flow[] = [];
  /** Number of dots currently visible (for the perf readout). */
  active = 0;

  constructor(staticLayer: Container, ground: Container, dotLayer: Container, dot: Texture) {
    const base = new Graphics();
    staticLayer.addChild(base);
    for (const def of PIPES) {
      const w = def.w ?? 6;
      const pts = def.pts;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const poly = (g: Graphics) => {
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      };
      poly(base);
      base.stroke({ width: w + 3, color: 0x141c28, join: 'round', cap: 'round' });
      poly(base);
      base.stroke({ width: w, color: 0x34465c, join: 'round', cap: 'round' });
      poly(base);
      base.stroke({ width: 1.5, color: 0x5d7898, alpha: 0.8, join: 'round', cap: 'round' });
      const glow = new Graphics();
      glow.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) glow.lineTo(pts[i].x, pts[i].y);
      glow.stroke({ width: w, color: FLOW_COLOR[def.kind], alpha: 0.42, join: 'round', cap: 'round' });
      glow.visible = false;
      ground.addChild(glow);
      const len = cum[cum.length - 1];
      const n = Math.max(2, Math.round(len / 18));
      const dots: Sprite[] = [];
      for (let i = 0; i < n; i++) {
        const s = new Sprite(dot);
        s.anchor.set(0.5);
        s.tint = FLOW_COLOR[def.kind];
        s.visible = false;
        dotLayer.addChild(s);
        dots.push(s);
      }
      this.flows.push({ def, pts, cum, len, glow, dots, phase: Math.random(), level: INTENSITY[def.id] ?? (() => 0), on: 0 });
    }
  }

  /** Intensity of one pipe now (tooltips and tests). */
  intensity(id: string): number {
    return this.flows.find((f) => f.def.id === id)?.on ?? 0;
  }

  update(dt: number, reduced: boolean): void {
    let active = 0;
    for (const f of this.flows) {
      const target = f.level();
      f.on += (target - f.on) * Math.min(1, dt * 5);
      if (target === 0 && f.on < 0.02) f.on = 0;
      const on = f.on > 0.02;
      f.glow.visible = on;
      if (on) f.glow.alpha = 0.5 + 0.5 * Math.min(1, f.on);
      const speed = 34 + 70 * f.on;
      if (!reduced) f.phase = (f.phase + (dt * speed) / f.len) % 1;
      const n = f.dots.length;
      for (let i = 0; i < n; i++) {
        const s = f.dots[i];
        s.visible = on;
        if (!on) continue;
        active++;
        const d = ((f.phase + i / n) % 1) * f.len;
        const p = along(f, d);
        s.position.set(p.x, p.y);
        s.alpha = Math.min(1, 0.35 + f.on);
        s.scale.set(f.def.kind === 'steam' ? 0.6 : 0.5);
      }
    }
    this.active = active;
  }
}
