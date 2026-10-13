import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { rawBool, rawNum, rawStr } from '../live/store';
import { P } from './iso';
import { box, boxColors, frustum } from './box';
import { bands, phaseShort } from './vessel';
import { STEEL, shade } from './iso';

export interface EquipCtx {
  textRes: number;
  cacheRes: number;
}

export interface EquipSpec {
  id: string;
  kind: 'vessel' | 'util';
  title: string;
  x: number;
  y: number;
  /** Local hit rectangle. */
  hit: [number, number, number, number];
  draw: (g: Graphics, root: Container) => void;
  status: () => string;
  alert: () => boolean;
  /** Utility is doing work now (soft glow). */
  active?: () => boolean;
}

const p = P;
const body = (c: number) => boxColors(c);

function cyl(g: Graphics, rx: number, h: number, colour: number, level = -1, liquid = 0xcfe8ff): void {
  const ry = rx / 2;
  g.ellipse(0, 2, rx * 1.15, ry * 1.15).fill({ color: 0, alpha: 0.35 });
  bands(g, rx, ry, 0, -h, colour);
  if (level >= 0) bands(g, rx - 2, ry - 1, -2, -2 - (h - 6) * level, liquid, [0.7, 1, 1.15, 0.85]);
  g.ellipse(0, -h, rx, ry).fill(shade(colour, 1.3));
  g.ellipse(0, -h, rx * 0.7, ry * 0.7).fill(shade(colour, 1.45));
}

export const EQUIP: EquipSpec[] = [
  {
    id: 'Mill', kind: 'vessel', title: 'MILL', x: 200, y: 215, hit: [-34, -88, 68, 120],
    draw: (g) => {
      g.ellipse(0, 4, 40, 20).fill({ color: 0, alpha: 0.38 });
      box(g, p, -2.6, -2.6, 2.6, 2.6, 0, 4.6, body(0x7b6a55), 0x2a2218);
      frustum(g, p, -2.6, -2.6, 2.6, 2.6, 4.6, 8.4, 1.1, body(0x9a876d));
      box(g, p, 2.6, -1.2, 4.4, 1.2, 0.6, 2.8, body(0x4a5668));
    },
    status: () => phaseShort(rawStr('Brewhouse/Mill/Phase')),
    alert: () => rawBool('Brewhouse/Mill/Fault'),
  },
  {
    id: 'Chiller', kind: 'vessel', title: 'WORT CHILLER', x: 880, y: 215, hit: [-52, -66, 104, 100],
    draw: (g) => {
      g.ellipse(0, 4, 62, 26).fill({ color: 0, alpha: 0.38 });
      box(g, p, -4.6, -2.2, 4.6, 2.2, 0, 5.4, body(0x6f86a3), 0x1c2a3c);
      // plate stack: fine vertical lines on the front face
      for (let i = -4; i <= 4; i++) {
        const a = p(i * 1.0, 2.2, 0.3);
        const b = p(i * 1.0, 2.2, 5.1);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0x2b4361, width: 1.2, alpha: 0.8 });
      }
      box(g, p, -5.2, -1.2, -4.6, 1.2, 0.8, 4.6, body(0x3b82c4));
      box(g, p, 4.6, -1.2, 5.2, 1.2, 0.8, 4.6, body(0xe8782e));
    },
    status: () => {
      const ph = rawStr('Brewhouse/Chiller/Phase');
      const t = rawNum('Brewhouse/Chiller/WortOutC');
      return `${phaseShort(ph)}${ph === 'KNOCKOUT' && Number.isFinite(t) ? ` ${t.toFixed(1)}°` : ''}`;
    },
    alert: () => rawBool('Brewhouse/Chiller/Fault'),
  },
  {
    id: 'Glycol', kind: 'util', title: 'GLYCOL', x: 1100, y: 215, hit: [-46, -62, 92, 96],
    draw: (g) => {
      g.ellipse(0, 4, 56, 24).fill({ color: 0, alpha: 0.38 });
      box(g, p, -4.8, -2.8, 4.8, 2.8, 0, 4.6, body(0x8fb6d9), 0x20384f);
      for (const fx of [-2.2, 2.2]) {
        const c = p(fx, 0, 4.6);
        g.ellipse(c.x, c.y, 15, 7.5).fill(0x2a3b50);
        g.ellipse(c.x, c.y, 11, 5.5).fill(0x0d1520);
        g.moveTo(c.x - 10, c.y).lineTo(c.x + 10, c.y).stroke({ color: 0x5f7a99, width: 1.5 });
      }
      box(g, p, -5.4, -1, -4.8, 1, 0.6, 3.2, body(0x38bdf8));
    },
    status: () => {
      const s = rawNum('Utilities/Glycol/SupplyC');
      const l = rawNum('Utilities/Glycol/LoadPct');
      return `${Number.isFinite(s) ? s.toFixed(1) + '°' : '—'} ${Number.isFinite(l) ? l.toFixed(0) + '%' : ''}`;
    },
    alert: () => rawBool('Utilities/Glycol/Fault') || rawNum('Utilities/Glycol/SupplyC') > 1.5 || rawNum('Utilities/Glycol/LoadPct') > 95,
    active: () => rawNum('Utilities/Glycol/LoadPct') > 5,
  },
  {
    id: 'CIP', kind: 'util', title: 'CIP SKID', x: 1200, y: 215, hit: [-46, -62, 92, 96],
    draw: (g, root) => {
      g.ellipse(0, 4, 56, 24).fill({ color: 0, alpha: 0.38 });
      box(g, p, -4.6, -2.4, 4.6, 2.4, 0, 0.7, body(0x4a5668));
      for (const cx of [-2.8, 0, 2.8]) {
        const o = p(cx, 0, 0.7);
        const sub = new Graphics();
        cyl(sub, 11, 28, STEEL.base);
        sub.position.set(o.x, o.y);
        root.addChild(sub);
      }
    },
    status: () => {
      const step = rawStr('Utilities/CIP/Step');
      const tgt = rawStr('Utilities/CIP/TargetUnit');
      return step && step !== 'IDLE' ? `${step.replace(/_/g, ' ')}${tgt ? ' → ' + tgt : ''}` : 'IDLE';
    },
    alert: () => false,
    active: () => rawBool('Utilities/CIP/Active'),
  },
  {
    id: 'Boiler', kind: 'util', title: 'BOILER', x: 1320, y: 215, hit: [-34, -96, 68, 130],
    draw: (g) => {
      cyl(g, 24, 60, 0x8b3d30);
      g.rect(-5, -60 - 30, 10, 30).fill(STEEL.base);
      g.rect(-1, -60 - 30, 6, 30).fill(STEEL.light);
      g.ellipse(0, -90, 7, 3.5).fill(STEEL.top);
      g.roundRect(-9, -40, 18, 10, 2).fill(0x0d1520);
    },
    status: () => {
      const b = rawNum('Utilities/Boiler/PressureBar');
      const s = rawNum('Utilities/Boiler/SteamKgph');
      return `${Number.isFinite(b) ? b.toFixed(1) + ' bar' : '—'} ${Number.isFinite(s) ? Math.round(s) + ' kg/h' : ''}`;
    },
    alert: () => {
      const b = rawNum('Utilities/Boiler/PressureBar');
      return Number.isFinite(b) && (b > 9.5 || b < 6.5);
    },
    active: () => rawNum('Utilities/Boiler/SteamKgph') > 40,
  },
  {
    id: 'CO2', kind: 'util', title: 'CO₂', x: 1420, y: 215, hit: [-44, -86, 88, 124],
    draw: (_g, root) => {
      for (const x of [-18, 18]) {
        const t = new Graphics();
        cyl(t, 15, 62, 0xdfe7f1);
        t.position.set(x, 0);
        root.addChild(t);
      }
    },
    status: () => {
      const l = rawNum('Utilities/CO2/TankPct');
      const c = rawNum('Utilities/CO2/ConsumptionKgph');
      return `${Number.isFinite(l) ? l.toFixed(0) + '%' : '—'} ${Number.isFinite(c) ? c.toFixed(1) + ' kg/h' : ''}`;
    },
    alert: () => rawNum('Utilities/CO2/TankPct') < 20,
    active: () => rawNum('Utilities/CO2/ConsumptionKgph') > 0.8,
  },
  {
    id: 'Air', kind: 'util', title: 'AIR', x: 1520, y: 215, hit: [-44, -50, 88, 84],
    draw: (g) => {
      g.ellipse(0, 4, 50, 22).fill({ color: 0, alpha: 0.38 });
      box(g, p, -3.2, -2.2, 1.6, 2.2, 0, 3.4, body(0x7d8da3), 0x1c2a3c);
      const r = p(3.2, 0, 1.6);
      bands(g, 10, 5, r.y + 8, r.y - 18, 0x6c7c93);
      g.ellipse(r.x, r.y - 18, 10, 5).fill(0x9fb0c6);
    },
    status: () => {
      const b = rawNum('Utilities/Air/PressureBar');
      return Number.isFinite(b) ? `${b.toFixed(1)} bar` : '—';
    },
    alert: () => rawNum('Utilities/Air/PressureBar') < 5,
  },
];

export class Equip {
  readonly root = new Container();
  readonly spec: EquipSpec;
  private readonly glow = new Graphics();
  private readonly art = new Container();
  private dirty = true;
  private readonly nameText: Text;
  private readonly statusText: Text;
  private readonly levels: Graphics[] = [];
  private levelKey = '';
  private glowKey = '';
  private selected = false;
  private hovered = false;

  constructor(spec: EquipSpec, ctx: EquipCtx) {
    this.spec = spec;
    const { root } = this;
    root.position.set(spec.x, spec.y);
    root.zIndex = spec.y;
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.label = spec.id;
    root.hitArea = new Rectangle(...spec.hit);
    const art = this.art;
    const g = new Graphics();
    art.addChild(g);
    spec.draw(g, art);
    if (spec.id === 'CO2') for (const x of [-18, 18]) {
      const lv = new Graphics();
      lv.position.set(x, 0);
      this.levels.push(lv);
      art.addChild(lv);
    }
    this.nameText = new Text({ text: spec.title, style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: '700', fill: 0xe8eef6, stroke: { color: 0x05080d, width: 3 } }, resolution: ctx.textRes });
    this.nameText.anchor.set(0.5, 0);
    this.nameText.position.set(0, 21);
    this.statusText = new Text({ text: '', style: { fontFamily: 'JetBrains Mono', fontSize: 10.5, fill: 0xaebccd, stroke: { color: 0x05080d, width: 3 } }, resolution: ctx.textRes });
    this.statusText.anchor.set(0.5, 0);
    this.statusText.position.set(0, 35);
    art.addChild(this.nameText, this.statusText);
    art.cacheAsTexture({ resolution: ctx.cacheRes, antialias: true });
    root.addChild(art, this.glow);
  }

  setSelected(v: boolean): void {
    this.selected = v;
  }
  setHovered(v: boolean): void {
    this.hovered = v;
  }
  center(): { x: number; y: number } {
    const [x, y, w, h] = this.spec.hit;
    return { x: this.spec.x + x + w / 2, y: this.spec.y + y + h / 2 };
  }

  update(t: number, reduced: boolean): void {
    const s = this.spec;
    const st = s.status();
    if (this.statusText.text !== st) {
      this.statusText.text = st;
      this.dirty = true;
    }
    const alert = s.alert();
    const active = s.active?.() ?? false;
    const g = this.glow;
    const k = `${alert}|${this.selected}|${this.hovered}|${active}`;
    if (k !== this.glowKey) {
      this.glowKey = k;
      g.clear();
      const [x, y, w, h] = s.hit;
      const col = alert ? 0xff4d4d : this.selected ? 0xd4874a : this.hovered ? 0xe8eef6 : active ? 0x34d399 : -1;
      if (col >= 0) g.roundRect(x + 4, y + 4, w - 8, h - 24, 8).stroke({ color: col, width: this.selected || alert ? 3 : 2, alpha: active && !alert && !this.selected && !this.hovered ? 0.55 : 1 });
    }
    g.alpha = alert && !reduced ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 7)) : 1;
    if (s.id === 'CO2') {
      const l = Math.max(0, Math.min(1, rawNum('Utilities/CO2/TankPct') / 100));
      const key = String(Math.round(l * 50));
      if (key !== this.levelKey) {
        this.levelKey = key;
        this.dirty = true;
        for (const lv of this.levels) {
          lv.clear();
          if (l > 0.01) bands(lv, 12, 6, -2, -2 - 56 * l, l < 0.2 ? 0xf59e0b : 0x7fd3ff, [0.7, 1, 1.15, 0.85]);
        }
      }
    }
    if (this.dirty) {
      this.dirty = false;
      this.art.updateCacheTexture();
    }
  }
}
