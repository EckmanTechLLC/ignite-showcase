import { Container, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { rawBool, rawNum, rawStr } from '../live/store';
import { CASES_PER_PALLET, MACHINES, recipeColorRaw } from '../model';
import { L, LINE_LEN, MACHINE_H, MACHINE_W, MACHINE_X } from './layout';
import { box, boxColors } from './box';
import { bands } from './vessel';
import { hex, shade } from './iso';

const MACHINE_COLOR: Record<string, number> = {
  Depal: 0x7a8aa0, Rinser: 0x5f97c4, Filler: 0xb8892d, Seamer: 0x8d9bb0, Pasteurizer: 0xb2653a, Labeler: 0x4e9b82, Packer: 0x9d7b52, Palletizer: 0xd4874a,
};
const SHORT: Record<string, string> = { Depal: 'DEPAL', Rinser: 'RINSER', Filler: 'FILLER', Seamer: 'SEAMER', Pasteurizer: 'PASTEUR.', Labeler: 'LABELER', Packer: 'PACKER', Palletizer: 'PALLET' };
const LAMP: Record<string, number> = { RUNNING: 0x34d399, IDLE: 0x6b7a8f, STARVED: 0xfbbf24, BLOCKED: 0xfbbf24, FAULT: 0xff4d4d, DOWN: 0xff4d4d, CHANGEOVER: 0x60a5fa, CIP: 0x60a5fa };
/** Which machine shows a downtime reason. */
const REASON_MACHINE: Record<string, string> = {
  FILLER_JAM: 'Filler', LABEL_OUT: 'Labeler', SEAMER_FAULT: 'Seamer', CAN_SUPPLY: 'Depal', CHANGEOVER: 'Filler', CIP: 'Filler', NO_BEER: 'Filler',
};
const BELT_Z = 1.7;
const SPACING = 2.4; // plan units between cans at rated speed
const PACKER_X = MACHINE_X[6];

export interface PackCtx {
  can: Texture;
  textRes: number;
  cacheRes: number;
}

class Machine {
  readonly root = new Container();
  readonly id: string;
  readonly index: number;
  private readonly halo = new Graphics();
  private readonly art = new Container();
  private readonly lamp = new Graphics();
  private readonly label: Text;
  private haloKey = '';
  private lampKey = '';
  private selected = false;
  private hovered = false;

  constructor(index: number, ctx: PackCtx) {
    this.index = index;
    this.id = MACHINES[index];
    const mx = MACHINE_X[index];
    const w = MACHINE_W[index];
    const h = MACHINE_H[index];
    const o = L(mx, 0);
    const root = this.root;
    root.position.set(o.x, o.y);
    root.zIndex = o.y;
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.label = this.id;
    const p = (x: number, y: number, z: number) => ({ x: (x - y) * 7, y: (x + y) * 3.5 - z * 6 });
    const g = new Graphics();
    const c = MACHINE_COLOR[this.id];
    const d = 2.5;
    const extras: Container[] = [];
    g.ellipse(0, 6, w * 8, d * 8).fill({ color: 0, alpha: 0.35 });
    box(g, p, -w / 2, -d, w / 2, d, 0, h, boxColors(c), 0x0a1018);
    switch (this.id) {
      case 'Depal':
        box(g, p, -w / 2 + 0.6, -d + 0.6, w / 2 - 0.6, d - 0.6, h, h + 1.4, boxColors(0xa9b6c8), 0x0a1018);
        break;
      case 'Filler':
      case 'Seamer': {
        const t = p(0, 0, h);
        const sub = new Graphics();
        bands(sub, 17, 8.5, 0, -22, shade(c, 1.1));
        sub.ellipse(0, -22, 17, 8.5).fill(shade(c, 1.45));
        sub.ellipse(0, -22, 8, 4).fill(shade(c, 0.6));
        sub.position.set(t.x, t.y);
        extras.push(sub);
        break;
      }
      case 'Pasteurizer':
        for (let i = 0; i < 4; i++) {
          const a = p(-w / 2 + 1 + i * 1.8, d, 0.4);
          const b = p(-w / 2 + 1 + i * 1.8, d, h - 0.4);
          g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0x5c2f17, width: 1.5, alpha: 0.8 });
        }
        break;
      case 'Palletizer':
        box(g, p, w / 2 - 0.5, -d, w / 2, d, h, h + 1.2, boxColors(c));
        box(g, p, -w / 2, -d, -w / 2 + 0.5, d, h, h + 1.2, boxColors(c));
        break;
      default:
        break;
    }
    this.art.addChild(g, ...extras, this.lamp);
    const top = p(0, 0, h + (this.id === 'Filler' || this.id === 'Seamer' ? 4 : 0));
    this.lamp.position.set(top.x + 12, top.y - 4);
    this.label = new Text({ text: SHORT[this.id], style: { fontFamily: 'JetBrains Mono', fontSize: 10.5, fontWeight: '700', fill: 0xd9e3ef, stroke: { color: 0x05080d, width: 3 } }, resolution: ctx.textRes });
    this.label.anchor.set(0.5, 0);
    const lp = p(0, d + 2.2, 0);
    this.label.position.set(lp.x, lp.y + 4);
    this.art.addChild(this.label);
    this.art.cacheAsTexture({ resolution: ctx.cacheRes, antialias: true });
    root.addChild(this.art, this.halo);
    root.hitArea = new Rectangle(...this.bounds(8));
  }

  /** Screen-space rectangle (local) around the box, its top gear and the lamp, grown by `pad`. */
  private bounds(pad: number): [number, number, number, number] {
    const w = MACHINE_W[this.index];
    const h = MACHINE_H[this.index];
    const half = (w / 2 + 2.5) * 7;
    const top = -h * 6 - (w / 2 + 2.5) * 3.5 - 26;
    const bottom = (w / 2 + 2.5) * 3.5 + 8;
    return [-half - pad, top - pad, half * 2 + pad * 2, bottom - top + pad * 2];
  }

  center(): { x: number; y: number } {
    return { x: this.root.x, y: this.root.y - MACHINE_H[this.index] * 4 };
  }
  setSelected(v: boolean): void {
    this.selected = v;
  }
  setHovered(v: boolean): void {
    this.hovered = v;
  }

  update(t: number, reduced: boolean): void {
    const st = rawStr(`Packaging/${this.id}/State`);
    const fault = rawBool(`Packaging/${this.id}/Fault`) || st === 'FAULT';
    const lk = `${st}|${fault}`;
    if (lk !== this.lampKey) {
      this.lampKey = lk;
      this.lamp.clear().circle(0, 0, 4.5).fill(LAMP[fault ? 'FAULT' : st] ?? 0x6b7a8f).stroke({ color: 0x05080d, width: 1.5 });
      this.art.updateCacheTexture();
    }
    const hk = `${fault}|${this.selected}|${this.hovered}`;
    if (hk !== this.haloKey) {
      this.haloKey = hk;
      this.halo.clear();
      const col = fault ? 0xff4d4d : this.selected ? 0xd4874a : this.hovered ? 0xe8eef6 : -1;
      if (col >= 0) this.halo.roundRect(...this.bounds(2), 8).stroke({ color: col, width: this.selected || fault ? 3 : 2 });
    }
    this.halo.alpha = fault && !reduced ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 7)) : 1;
  }
}

interface Can {
  x: number;
  s: Sprite;
}

/** Conveyor, eight machines, cans on the belt at the line speed, the palletiser's stack and the downtime banner. */
export class PackLine {
  readonly root = new Container();
  readonly machines: Machine[] = [];
  private readonly belt = new Container();
  private readonly cansLayer = new Container();
  private readonly pallet = new Container();
  private readonly palletArt = new Graphics();
  private readonly banner = new Container();
  private readonly bannerBg = new Graphics();
  private readonly bannerText: Text;
  private readonly header: Text;
  private readonly cans: Can[] = [];
  private readonly pool: Sprite[] = [];
  private spawn = 0;
  private palletKey = '';
  private bannerKey = '';
  /** Cans on screen (perf readout). */
  visibleCans = 0;

  constructor(private readonly ctx: PackCtx) {
    this.root.sortableChildren = true;
    this.belt.zIndex = 0;
    this.cansLayer.zIndex = 1;
    // conveyor slab
    const g = new Graphics();
    const p = (x: number, y: number, z: number) => {
      const q = L(x, y, z);
      const o = L(0, 0);
      return { x: q.x - o.x, y: q.y - o.y };
    };
    this.belt.position.set(L(0, 0).x, L(0, 0).y);
    box(g, p, -1, -1.5, LINE_LEN + 4, 1.5, 0.9, BELT_Z, boxColors(0x3a4656), 0x0a1018);
    for (let x = 2; x < LINE_LEN; x += 6) {
      for (const y of [-1.1, 1.1]) {
        const a = p(x, y, 0);
        const b = p(x, y, 0.9);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0x2a3340, width: 2 });
      }
    }
    // belt centre stripe
    const a = p(0, 0, BELT_Z);
    const b = p(LINE_LEN + 4, 0, BELT_Z);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0x1b222d, width: 3 });
    this.belt.addChild(g);
    this.belt.cacheAsTexture({ resolution: ctx.cacheRes, antialias: true });
    this.root.addChild(this.belt, this.cansLayer);
    for (let i = 0; i < MACHINES.length; i++) {
      const m = new Machine(i, ctx);
      this.machines.push(m);
      this.root.addChild(m.root);
    }
    this.pallet.zIndex = L(63, 3).y;
    this.pallet.addChild(this.palletArt);
    this.pallet.cacheAsTexture({ resolution: ctx.cacheRes, antialias: true });
    this.root.addChild(this.pallet);
    this.bannerText = new Text({ text: '', style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: '700', fill: 0xffffff }, resolution: ctx.textRes });
    this.bannerText.anchor.set(0.5);
    this.banner.addChild(this.bannerBg, this.bannerText);
    this.banner.zIndex = 99999;
    this.banner.visible = false;
    this.root.addChild(this.banner);
    this.header = new Text({ text: '', style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: '700', fill: 0xd4874a, stroke: { color: 0x05080d, width: 3 } }, resolution: ctx.textRes });
    this.header.anchor.set(0, 1);
    const hp = L(0, -3.5, 7);
    this.header.position.set(hp.x - 6, hp.y - 14);
    this.header.zIndex = 99998;
    this.root.addChild(this.header);
  }

  private getCan(): Sprite {
    const s = this.pool.pop() ?? new Sprite(this.ctx.can);
    s.anchor.set(0.5, 1);
    this.cansLayer.addChild(s);
    return s;
  }

  update(t: number, dt: number, reduced: boolean): void {
    const state = rawStr('Packaging/Line/State');
    const cpm = rawNum('Packaging/Line/SpeedCPM');
    const running = state === 'RUNNING' && cpm > 1;
    const format = rawStr('Packaging/Line/Format');
    const tint = hex(recipeColorRaw(rawStr('Packaging/Line/Recipe')));

    for (const m of this.machines) m.update(t, reduced);

    // header line
    const ht = `PACKAGING LINE · ${state || '—'}${Number.isFinite(cpm) && cpm > 0 ? ` ${Math.round(cpm)} cpm` : ''}${format === 'KEG' ? ' · KEG' : ''}`;
    if (this.header.text !== ht) this.header.text = ht;

    // cans: move at the line speed while running, freeze otherwise (the belt is stopped)
    const v = running ? (cpm / 60) * SPACING : 0;
    if (running && !reduced) {
      this.spawn += (cpm / 60) * dt;
      while (this.spawn >= 1) {
        this.spawn -= 1;
        const s = this.getCan();
        s.tint = tint;
        this.cans.push({ x: 0, s });
      }
    } else if (running && reduced && this.cans.length === 0) {
      for (let x = 2; x < LINE_LEN - 3; x += SPACING * 1.3) {
        const s = this.getCan();
        s.tint = tint;
        this.cans.push({ x, s });
      }
    }
    if (!reduced || !running) {
      let vis = 0;
      for (let i = this.cans.length - 1; i >= 0; i--) {
        const c = this.cans[i];
        c.x += v * dt;
        if (c.x > LINE_LEN - 1) {
          this.cansLayer.removeChild(c.s);
          this.pool.push(c.s);
          this.cans.splice(i, 1);
          continue;
        }
        // hidden while inside a machine
        let inside = false;
        for (let k = 0; k < MACHINE_X.length; k++) if (Math.abs(c.x - MACHINE_X[k]) < MACHINE_W[k] / 2 - 0.1) inside = true;
        c.s.visible = !inside;
        if (inside) continue;
        vis++;
        const q = L(c.x, 0, BELT_Z);
        c.s.position.set(q.x, q.y);
        const packed = c.x > PACKER_X;
        c.s.scale.set(packed ? 2.0 : 1, packed ? 1.15 : 1);
        c.s.tint = packed ? 0xb48a54 : tint;
      }
      this.visibleCans = vis;
    }
    if (reduced && !running) {
      // nothing moves
    }

    // pallet stack
    const cases = rawNum('Packaging/Line/CasesToday');
    const pallets = rawNum('Packaging/Line/PalletsToday');
    const pk = `${cases}|${pallets}`;
    if (pk !== this.palletKey) {
      this.palletKey = pk;
      this.drawPallets(Number.isFinite(cases) ? cases : 0, Number.isFinite(pallets) ? pallets : 0);
    }

    // downtime banner on the machine that explains it
    const reason = rawStr('Packaging/Line/DowntimeReason');
    const bm = REASON_MACHINE[reason];
    const show = !!bm && reason !== 'NONE' && state !== 'RUNNING';
    const down = state === 'DOWN';
    const bk = `${show}|${reason}|${down}|${state}`;
    if (bk !== this.bannerKey) {
      this.bannerKey = bk;
      this.banner.visible = show;
      if (show) {
        const idx = MACHINES.indexOf(bm as (typeof MACHINES)[number]);
        const m = this.machines[idx];
        const txt = reason.replace(/_/g, ' ');
        this.bannerText.text = txt;
        const wd = this.bannerText.width + 14;
        const col = down ? 0xe0413a : state === 'IDLE' ? 0x4a5668 : 0xb7791f;
        this.bannerBg.clear().roundRect(-wd / 2, -10, wd, 20, 5).fill(col).stroke({ color: 0xffffff, width: 1, alpha: 0.5 });
        this.banner.position.set(m.root.x, m.root.y - MACHINE_H[idx] * 6 - 44);
      }
    }
    if (show && down && !reduced) this.banner.alpha = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 6));
    else this.banner.alpha = 1;
  }

  private drawPallets(cases: number, pallets: number): void {
    const g = this.palletArt;
    g.clear();
    const stack = (x: number, y: number, layers: number, partial: number, colour: number) => {
      box(g, L, x - 2.2, y - 2.2, x + 2.2, y + 2.2, 0, 0.5, boxColors(0x8a6a43));
      for (let i = 0; i < layers; i++) {
        box(g, L, x - 2, y - 2, x + 2, y + 2, 0.5 + i * 0.9, 0.5 + (i + 1) * 0.9 - 0.06, boxColors(i % 2 ? shade(colour, 0.94) : colour), 0x2a1c0c);
      }
      for (let k = 0; k < partial; k++) {
        const cx = x - 1.1 + (k % 2) * 2.2;
        const cy = y - 1.1 + (Math.floor(k / 2) % 2) * 2.2;
        const z0 = 0.5 + layers * 0.9;
        box(g, L, cx - 1, cy - 1, cx + 1, cy + 1, z0, z0 + 0.84, boxColors(colour), 0x2a1c0c);
      }
    };
    const rem = cases % CASES_PER_PALLET;
    const layers = Math.floor(rem / 8);
    stack(64.5, 0, layers, Math.min(4, rem % 8), 0xc79a5f);
    // finished pallets (up to three) in a row in front
    const done = Math.min(3, Math.floor(pallets));
    for (let i = 0; i < done; i++) stack(64.5, 6 + 5.6 * i, 6, 0, 0xb48a54);
    this.pallet.updateCacheTexture();
  }
}
