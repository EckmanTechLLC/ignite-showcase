import { Container, Graphics, Sprite, Text, Texture, type TextStyleOptions } from 'pixi.js';
import { BESS, BLDG, BLDG_FACADE, COLOR, EV_LOT, GENSET, H, LIGHTS, PV_ROWS, SUBSTATION, TRUNK_Y, FENCE_X, LINK, bayRect, pvFieldRect, pvRowRect, type Rect } from './model';
import { clamp, type Caster } from './sky';
import { finite, type Snap } from './read';
import type { Textures } from './textures';

/** Everything on the map that reacts to tags. Each actor owns its Pixi objects and updates them from one `Snap` per frame. */

const labelStyle = (size: number, fill = 0xdbe4ee): TextStyleOptions => ({ fontFamily: 'JetBrains Mono', fontSize: size, fontWeight: '700', fill, stroke: { color: 0x05080d, width: 3 }, letterSpacing: 1 });

export class Label {
  readonly text: Text;
  private cur = '';
  constructor(text: string, x: number, y: number, size: number, res: number, fill = 0xdbe4ee, anchorX = 0.5) {
    this.text = new Text({ text, style: labelStyle(size, fill), resolution: res });
    this.text.anchor.set(anchorX, 0.5);
    this.text.position.set(x, y);
    this.cur = text;
  }
  set(t: string): void {
    if (t !== this.cur) {
      this.cur = t;
      this.text.text = t;
    }
  }
}

const rectCaster = (r: Rect, h: number): Caster => ({ kind: 'rect', r, h });

// --- PV -----------------------------------------------------------------------------------------

export class PvField {
  readonly rows: Sprite[] = [];
  private readonly red: Sprite[] = [];
  readonly label: Label;
  private flick = 0;
  constructor(readonly index: number, tex: Textures, res: number, parent: Container, labels: Container) {
    for (let r = 0; r < PV_ROWS; r++) {
      const rr = pvRowRect(index, r);
      const s = new Sprite(tex.panels);
      s.position.set(rr.x, rr.y);
      s.width = rr.w;
      s.height = rr.h;
      parent.addChild(s);
      this.rows.push(s);
    }
    for (let h = 0; h < 2; h++) {
      const a = pvRowRect(index, h * 3);
      const b = pvRowRect(index, h * 3 + 2);
      const s = new Sprite(Texture.WHITE);
      s.position.set(a.x - 3, a.y - 3);
      s.width = a.w + 6;
      s.height = b.y + b.h - a.y + 6;
      s.tint = 0xff3b30;
      s.alpha = 0;
      s.visible = false;
      parent.addChild(s);
      this.red.push(s);
    }
    const f = pvFieldRect(index);
    this.label = new Label(`PV ${'A' + (index + 1)}`, f.x + 6, f.y + 14, 12, res, COLOR.pv, 0);
    labels.addChild(this.label.text);
  }

  casters(): Caster[] {
    return this.rows.map((_, r) => rectCaster(pvRowRect(this.index, r), H.pv));
  }

  update(s: Snap, t: number): void {
    const a = s.pv[this.index];
    // Brightness from the array's own irradiance (a passing cloud dims exactly this array) and each string's share of the best string.
    const level = clamp(Math.sqrt(clamp(finite(a.irr) / 900)));
    const maxDc = Math.max(0.05, ...a.dc.map((v) => finite(v)));
    this.flick = a.curtailed ? 0.82 + 0.18 * Math.sin(t * 17 + this.index * 2.1) * Math.sin(t * 5.3) : 1;
    for (let r = 0; r < PV_ROWS; r++) {
      const share = maxDc > 0.3 ? clamp(finite(a.dc[r]) / maxDc, 0.15, 1) : 1;
      const v = (0.3 + 0.7 * level * (0.45 + 0.55 * share)) * this.flick;
      const c = Math.round(clamp(v) * 255);
      this.rows[r].tint = (c << 16) | (c << 8) | c;
    }
    for (let h = 0; h < 2; h++) {
      const fault = a.inv[h] === 'FAULT';
      const sp = this.red[h];
      sp.visible = fault;
      if (fault) sp.alpha = 0.22 + 0.3 * (0.5 + 0.5 * Math.sin(t * 5 + h));
    }
  }
}

// --- BESS ---------------------------------------------------------------------------------------

export class BessUnit {
  readonly glow: Sprite;
  private readonly bar = new Graphics();
  readonly label: Label;
  private key = '';
  constructor(readonly index: number, tex: Textures, res: number, dyn: Container, fx: Container, labels: Container) {
    const b = BESS[index];
    this.glow = new Sprite(tex.glow);
    this.glow.anchor.set(0.5);
    this.glow.position.set(b.x + b.w / 2, b.y + b.h / 2);
    this.glow.width = b.w * 1.9;
    this.glow.height = b.h * 3.3;
    this.glow.blendMode = 'add';
    this.glow.alpha = 0;
    fx.addChild(this.glow);
    dyn.addChild(this.bar);
    this.label = new Label(`BESS ${b.id}`, b.x + 4, b.y - 16, 11, res, COLOR.bess, 0);
    labels.addChild(this.label.text);
  }
  casters(): Caster[] {
    const b = BESS[this.index];
    return [rectCaster(b, H.bess)];
  }
  update(s: Snap, t: number, reduced: boolean): void {
    const b = BESS[this.index];
    const d = s.bess[this.index];
    const soc = finite(d.soc);
    const k = `${Math.round(soc)}|${d.state}`;
    if (k !== this.key) {
      this.key = k;
      const x = b.x + 14;
      const w = b.w - 28;
      this.bar.clear();
      this.bar.roundRect(x, b.y + b.h - 17, w, 9, 3).fill(0x10151c).stroke({ color: 0x0b0f16, width: 1 });
      const col = d.state === 'FAULT' ? COLOR.island : soc < 15 ? COLOR.island : soc < 30 ? COLOR.warn : COLOR.grid;
      this.bar.roundRect(x + 1, b.y + b.h - 16, Math.max(2, (w - 2) * clamp(soc / 100)), 7, 2).fill(col);
      this.label.set(`${b.id}  ${Number.isFinite(soc) ? Math.round(soc) : '--'}%`);
    }
    const p = finite(d.kw);
    const mag = clamp(Math.abs(p) / d.rated);
    const on = Math.abs(p) > 0.8;
    this.glow.tint = p > 0 ? COLOR.bess : COLOR.bessCharge;
    // discharge pulses outwards, charge breathes slowly
    const pulse = reduced ? 0.7 : p > 0 ? 0.65 + 0.35 * Math.sin(t * 5) : 0.7 + 0.3 * Math.sin(t * 1.8);
    this.glow.alpha = on ? (0.12 + 0.5 * mag) * pulse : 0;
  }
}

// --- genset -------------------------------------------------------------------------------------

export class GensetUnit {
  private readonly puffs: Sprite[] = [];
  private readonly ring = new Graphics();
  readonly label: Label;
  readonly badge: Label;
  private readonly glow: Sprite;
  constructor(tex: Textures, res: number, dyn: Container, fx: Container, labels: Container) {
    for (let i = 0; i < 9; i++) {
      const p = new Sprite(tex.puff);
      p.anchor.set(0.5);
      p.tint = 0xb4bcc8;
      p.alpha = 0;
      dyn.addChild(p);
      this.puffs.push(p);
    }
    dyn.addChild(this.ring);
    this.glow = new Sprite(tex.glow);
    this.glow.anchor.set(0.5);
    this.glow.position.set(GENSET.x + GENSET.w / 2, GENSET.y + GENSET.h / 2);
    this.glow.width = GENSET.w * 1.9;
    this.glow.height = GENSET.h * 2.6;
    this.glow.blendMode = 'add';
    this.glow.tint = 0xffb04a;
    this.glow.alpha = 0;
    fx.addChild(this.glow);
    this.label = new Label('GENSET', GENSET.x + 4, GENSET.y - 14, 11, res, 0xb4bcc8, 0);
    this.badge = new Label('', GENSET.x + GENSET.w / 2, GENSET.y + GENSET.h / 2 + 12, 13, res, COLOR.warn);
    this.badge.text.visible = false;
    labels.addChild(this.label.text, this.badge.text);
  }
  casters(): Caster[] {
    return [rectCaster(GENSET, H.genset)];
  }
  update(s: Snap, t: number, reduced: boolean): void {
    const st = s.gen.state;
    const running = st === 'RUNNING' || st === 'COOLDOWN';
    const starting = st === 'STARTING';
    const sx = GENSET.x + GENSET.w - 18;
    const sy = GENSET.y + 20;
    this.ring.clear();
    if (starting || running) {
      const col = starting ? COLOR.warn : COLOR.grid;
      const a = starting ? 0.5 + 0.5 * Math.sin(t * 8) : 0.9;
      this.ring.roundRect(GENSET.x - 2, GENSET.y - 2, GENSET.w + 4, GENSET.h + 4, 4).stroke({ color: col, width: 2.5, alpha: a });
    }
    this.glow.alpha = running ? 0.22 + 0.1 * Math.sin(t * 3) : starting ? 0.16 * (0.5 + 0.5 * Math.sin(t * 8)) : 0;
    this.badge.text.visible = starting || running;
    this.badge.set(starting ? `START ${Math.max(0, Math.ceil(finite(s.gen.countdown)))}s` : st === 'COOLDOWN' ? 'COOLDOWN' : `RUN ${Math.round(finite(s.gen.kw))} kW`);
    this.badge.text.style.fill = starting ? COLOR.warn : COLOR.grid;
    // exhaust shimmer: puffs rise from the stack, drift with the wind, swell and fade
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (!running || reduced) {
        p.alpha = 0;
        continue;
      }
      const ph = (t * 0.55 + i / this.puffs.length) % 1;
      p.position.set(sx + ph * 22 + Math.sin(t * 2 + i) * 2, sy - ph * 46);
      const sc = 0.25 + ph * 0.7;
      p.scale.set(sc);
      p.alpha = (1 - ph) * 0.5 * Math.min(1, 0.4 + finite(s.gen.kw) / 250);
    }
  }
}

// --- EV lot -------------------------------------------------------------------------------------

const CAR_COLORS = [0xd9534f, 0x4f8fd9, 0xe8e8e8, 0x3d3d3d, 0xf0ad4e, 0x5cb85c, 0x9b6bd1, 0x2fb3b3, 0xc0c0c0, 0xe07a5f];

export class EvLot {
  private readonly cars: Container[] = [];
  private readonly rings: Graphics[] = [];
  private readonly level: number[] = Array(10).fill(0);
  private readonly keys: string[] = Array(10).fill('');
  private readonly state: string[] = Array(10).fill('');
  constructor(dyn: Container, labels: Container, res: number) {
    for (let i = 0; i < 10; i++) {
      const b = bayRect(i);
      const car = new Container();
      const g = new Graphics();
      const col = CAR_COLORS[i];
      g.roundRect(-17, -30, 34, 60, 9).fill(col).stroke({ color: 0x0b0f16, width: 1.2 });
      g.roundRect(-13, -14, 26, 12, 4).fill({ color: 0x0f1620, alpha: 0.85 });
      g.roundRect(-13, 8, 26, 8, 3).fill({ color: 0x0f1620, alpha: 0.7 });
      g.rect(-16, -29, 6, 3).fill(0xfff2c6);
      g.rect(10, -29, 6, 3).fill(0xfff2c6);
      car.addChild(g);
      car.position.set(b.x + b.w / 2, b.y + b.h / 2 + (i < 5 ? 2 : -2));
      car.visible = false;
      dyn.addChild(car);
      this.cars.push(car);
      const ring = new Graphics();
      ring.position.set(b.x + b.w / 2, i < 5 ? b.y + 10 : b.y + b.h - 10);
      dyn.addChild(ring);
      this.rings.push(ring);
    }
    const t = new Label('EV CHARGING', EV_LOT.x + 4, EV_LOT.y - 20, 11, res, COLOR.load, 0);
    labels.addChild(t.text);
  }
  /** Cars that currently cast a shadow. */
  casters(): Caster[] {
    const out: Caster[] = [];
    this.cars.forEach((c, i) => {
      if (this.level[i] > 0.5) {
        const b = bayRect(i);
        out.push(rectCaster({ x: b.x + b.w / 2 - 17, y: b.y + b.h / 2 - 30 + (i < 5 ? 2 : -2), w: 34, h: 60 }, H.car));
      }
      void c;
    });
    return out;
  }
  /** Bitmask of visible cars (shadow redraw trigger). */
  mask(): number {
    return this.level.reduce((m, l, i) => m | (l > 0.5 ? 1 << i : 0), 0);
  }
  update(s: Snap, t: number, dt: number, reduced: boolean): void {
    for (let i = 0; i < 10; i++) {
      const e = s.ev[i];
      const present = e.state !== '' && e.state !== 'IDLE';
      const goal = present ? 1 : 0;
      this.level[i] = reduced ? goal : this.level[i] + (goal - this.level[i]) * Math.min(1, dt * 3.5);
      if (Math.abs(this.level[i] - goal) < 0.01) this.level[i] = goal;
      const car = this.cars[i];
      const lv = this.level[i];
      car.visible = lv > 0.02;
      const dim = e.state === 'CURTAILED' ? 0.5 : 1;
      car.alpha = lv * dim;
      const home = bayRect(i);
      const base = home.y + home.h / 2 + (i < 5 ? 2 : -2);
      car.y = base + (1 - lv) * (i < 5 ? 70 : -70);
      // SOC ring on the charger post: redrawn only when the quantised value or state changes
      const soc = finite(e.soc);
      const k = `${e.state}|${present ? Math.round(soc / 3) : -1}`;
      if (k !== this.keys[i]) {
        this.keys[i] = k;
        this.state[i] = e.state;
        const r = this.rings[i];
        r.clear();
        if (present) {
          const col = e.state === 'FAULT' ? COLOR.island : e.state === 'CURTAILED' ? COLOR.warn : COLOR.grid;
          r.circle(0, 0, 11).stroke({ color: 0x0b0f16, width: 4, alpha: 0.85 });
          r.circle(0, 0, 11).stroke({ color: 0x3a4250, width: 2.5 });
          const f = e.state === 'FAULT' ? 1 : clamp(soc / 100);
          if (f > 0.01) r.arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f).stroke({ color: col, width: 2.5, cap: 'round' });
        }
      }
      this.rings[i].alpha = this.state[i] === 'FAULT' && !reduced ? 0.45 + 0.55 * Math.abs(Math.sin(t * 6)) : 1;
    }
  }
}

// --- buildings ----------------------------------------------------------------------------------

export class BuildingActor {
  readonly lights = new Graphics();
  private readonly dim = new Graphics();
  readonly crit: Graphics;
  private key = '';
  private readonly order: number[];
  readonly label: Label;
  constructor(readonly index: number, res: number, cam: Container, fx: Container, labels: Container) {
    const b = BLDG[index];
    this.dim.rect(b.x, b.y, b.w, b.h + BLDG_FACADE).fill({ color: 0x05080d, alpha: 0.5 });
    this.dim.visible = false;
    cam.addChild(this.dim);
    fx.addChild(this.lights);
    this.crit = new Graphics();
    this.crit.roundRect(b.x + b.w - 54, b.y + 6, 48, 16, 8).fill({ color: 0xb91c1c, alpha: 0.95 }).stroke({ color: 0xfecaca, width: 1 });
    this.crit.visible = false;
    labels.addChild(this.crit);
    const critText = new Label('CRITICAL', b.x + b.w - 36, b.y + 15, 9, res, 0xffffff);
    critText.text.visible = false;
    this.critText = critText;
    labels.addChild(critText.text);
    this.label = new Label(['OFFICE', 'LAB', 'RESIDENCE'][index], b.x + 8, b.y + b.h - 12, 11, res, 0xdbe4ee, 0);
    labels.addChild(this.label.text);
    // deterministic window order so "more load" lights the same windows first
    this.order = Array.from({ length: 18 }, (_, i) => i).sort((p, q) => ((p * 7 + index * 5) % 18) - ((q * 7 + index * 5) % 18));
  }
  private readonly critText: Label;
  casters(): Caster[] {
    const b = BLDG[this.index];
    return [rectCaster({ x: b.x, y: b.y, w: b.w, h: b.h + BLDG_FACADE }, H.bldg)];
  }
  update(s: Snap, night: number): void {
    const b = BLDG[this.index];
    const d = s.bldg[this.index];
    this.dim.visible = d.shed;
    this.crit.visible = d.crit;
    this.critText.text.visible = d.crit;
    const f = d.shed ? 0 : clamp(0.25 + finite(d.kw) / 110);
    const lit = night > 0.12 ? Math.round(f * 18) : 0;
    const key = `${lit}|${Math.round(night * 10)}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.lights;
    g.clear();
    if (lit === 0) return;
    const cw = (b.w - 16) / 9;
    for (let k = 0; k < lit; k++) {
      const w = this.order[k];
      const r = Math.floor(w / 9);
      const c = w % 9;
      g.rect(b.x + 8 + c * cw, b.y + b.h + 4 + r * 10, cw - 4, 7).fill({ color: 0xffd58a, alpha: 0.95 * Math.min(1, night * 1.4) });
    }
    // soft spill below the facade
    g.rect(b.x, b.y + b.h + BLDG_FACADE, b.w, 14).fill({ color: 0xffc46b, alpha: 0.1 * night * (lit / 18) });
  }
}

// --- substation + utility link ------------------------------------------------------------------

export class Substation {
  private readonly sw = new Graphics();
  private readonly flash: Sprite;
  private flashT = 1;
  private flashColor: number = COLOR.island;
  private prevIsland: boolean | null = null;
  /** 0..1 black overlay (campus dips for a beat when the link snaps open). */
  dipLevel = 0;
  readonly label: Label;
  constructor(tex: Textures, res: number, dyn: Container, fx: Container, labels: Container) {
    dyn.addChild(this.sw);
    this.flash = new Sprite(tex.glow);
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;
    this.flash.position.set(FENCE_X + 20, TRUNK_Y);
    fx.addChild(this.flash);
    this.label = new Label('SUBSTATION', SUBSTATION.x + 4, SUBSTATION.y - 14, 11, res, 0xb4bcc8, 0);
    labels.addChild(this.label.text);
  }
  casters(): Caster[] {
    return [rectCaster({ x: SUBSTATION.x + 18, y: SUBSTATION.y + 22, w: 54, h: 34 }, H.sub), rectCaster({ x: SUBSTATION.x + 18, y: SUBSTATION.y + 76, w: 54, h: 34 }, H.sub)];
  }
  update(s: Snap, dt: number, reduced: boolean): void {
    if (this.prevIsland !== null && this.prevIsland !== s.island) {
      this.flashT = 0;
      this.flashColor = s.island ? COLOR.island : COLOR.grid;
      if (s.island) this.dipLevel = 1;
    }
    this.prevIsland = s.island;
    this.flashT = Math.min(1, this.flashT + dt / 0.9);
    this.dipLevel = Math.max(0, this.dipLevel - dt / 0.6);
    this.flash.tint = this.flashColor;
    this.flash.alpha = this.flashT < 1 ? (1 - this.flashT) * 0.95 : 0;
    this.flash.scale.set(0.35 + this.flashT * 1.1);
    const g = this.sw;
    g.clear();
    const x0 = FENCE_X + 10;
    const x1 = x0 + 20;
    const y = TRUNK_Y;
    const poleX = LINK[0].x;
    g.moveTo(x1, y).lineTo(poleX, y).stroke({ color: s.island ? 0x59636f : COLOR.grid, width: 2.5, alpha: s.island ? 0.6 : 0.9 });
    g.moveTo(FENCE_X - 1, y).lineTo(x0, y).stroke({ color: 0xc8d0da, width: 3 });
    if (s.island) {
      // blade swung open, red contacts
      const blink = reduced ? 1 : 0.55 + 0.45 * Math.sin(performance.now() / 180);
      g.moveTo(x0, y).lineTo(x0 + 18, y - 15).stroke({ color: 0xe5e7eb, width: 3, cap: 'round' });
      g.circle(x0, y, 3.5).fill(COLOR.island);
      g.circle(x1, y, 3.5).fill({ color: COLOR.island, alpha: blink });
    } else {
      g.moveTo(x0, y).lineTo(x1, y).stroke({ color: 0xe5e7eb, width: 3, cap: 'round' });
      g.circle(x0, y, 3.5).fill(COLOR.grid);
      g.circle(x1, y, 3.5).fill(COLOR.grid);
    }
    g.circle(poleX, y - 12, 4).fill(s.avail ? COLOR.grid : 0x59636f);
  }
}

// --- street lights ------------------------------------------------------------------------------

export class StreetLights {
  private readonly glows: Sprite[] = [];
  constructor(tex: Textures, fx: Container) {
    for (const p of LIGHTS) {
      const s = new Sprite(tex.glow);
      s.anchor.set(0.5);
      s.position.set(p.x, p.y + 6);
      s.width = 118;
      s.height = 118;
      s.tint = 0xffcf8a;
      s.blendMode = 'add';
      s.alpha = 0;
      fx.addChild(s);
      this.glows.push(s);
    }
  }
  update(night: number): void {
    const a = night > 0.08 ? 0.6 * Math.min(1, night * 1.3) : 0;
    for (const g of this.glows) {
      g.alpha = a;
      g.visible = a > 0;
    }
  }
}
