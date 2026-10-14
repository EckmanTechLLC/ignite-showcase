import { Container, Graphics, Sprite, Text, Texture, type Renderer, type TextStyleOptions } from 'pixi.js';
import { BESS, BLDG, BLDG_TOP, COLOR, COS, EV_LOT, FENCE_X, GENSET, H, LIGHTS, PV_ROW, PV_ROWS, SUBSTATION, TRUNK_Y, bayRect, project, projBox, pvFieldRect, pvRowRect, windowCells } from './model';
import { clamp, smooth, type Caster, type Sun } from './sky';
import { finite, type Snap } from './read';
import { PV_FACE, PV_LEG, type Textures } from './textures';
import { box, line, poly, shade, slab, wall } from './iso';
import { buildBuilding, signCentre, roofFans, FACADE_Y } from './buildings';
import { BESS_Z, CANOPY_Z, GEN_Z, POLE_X, POLE_Z, bessFans, bessPanel, buildBess, buildEvCanopy, buildEvRoof, buildGenset, buildPoleLine, buildPvBack, buildPvFront, buildSubstation, buildSubstationFront, canopyRects, combinerPos, flagPos, genRadiator, genStack, invRect, pedestal, FUEL, transformers } from './energy';
import { lampTexture, LAMP_HEAD } from './art';

/** Everything on the map that reacts to tags. Each actor owns its Pixi objects and updates them from one `Snap` per frame. */

const labelStyle = (size: number, fill = 0xdbe4ee): TextStyleOptions => ({ fontFamily: 'JetBrains Mono', fontSize: size, fontWeight: '700', fill, stroke: { color: 0x05080d, width: 3 }, letterSpacing: 1 });

/** What an actor needs to attach itself: the depth-sorted world, the additive light layer, the label layer, and the texture helpers. */
export interface Ctx {
  tex: Textures;
  res: number;
  /** Depth-sorted container of everything standing on the ground. */
  world: Container;
  /** Additive lights and glints (above the night grade). */
  fx: Container;
  /** Labels, badges and hit areas (above everything). */
  ui: Container;
  /** Cache a static container as one texture. */
  stat: <T extends Container>(c: T) => T;
  plate: (lines: string[], accent: string, w?: number) => Texture;
}

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

/** Nameplates are painted at 1x and shown a little larger so they stay legible at the fitted zoom. */
const PLATE_S = 1.25;

const rectCaster = (r: { x: number; y: number; w: number; h: number }, h: number): Caster => ({ kind: 'rect', r, h });

/** Depth key: everything is sorted by the ground y of its south edge. */
function asset(ctx: Ctx, depth: number): Container {
  const c = new Container();
  c.zIndex = depth;
  ctx.world.addChild(c);
  return c;
}

/** A spinning rotor lying on a horizontal surface (`flat`, squashed by the view) or standing on a wall. */
class Fan {
  readonly node = new Container();
  private readonly sp: Sprite;
  constructor(tex: Texture, x: number, y: number, z: number, r: number, flat: boolean) {
    this.sp = new Sprite(tex);
    this.sp.anchor.set(0.5);
    this.sp.width = r * 2;
    this.sp.height = r * 2;
    this.sp.rotation = Math.random() * 6;
    this.node.addChild(this.sp);
    this.node.position.set(x, y * COS - z);
    if (flat) this.node.scale.y = COS;
  }
  spin(dt: number, speed: number): void {
    if (speed !== 0) this.sp.rotation = (this.sp.rotation + speed * dt) % (Math.PI * 2);
  }
}

const HEALTH_COLOR = (h: number): number => (!Number.isFinite(h) ? 0x59636f : h >= 90 ? 0x34d399 : h >= 75 ? 0xfbbf24 : 0xef4444);

// --- PV -----------------------------------------------------------------------------------------

export class PvField {
  readonly rows: Sprite[] = [];
  private readonly glints: Sprite[] = [];
  private readonly red: Sprite[] = [];
  private readonly leds = new Graphics();
  private readonly flag = new Graphics();
  private readonly fans: Fan[] = [];
  private flick = 0;
  private ledKey = '';
  constructor(readonly index: number, ctx: Ctx) {
    const f = pvFieldRect(index);
    const c = asset(ctx, f.y + f.h);
    c.addChild(ctx.stat(buildPvBack(index)));
    for (let r = 0; r < PV_ROWS; r++) {
      const rr = pvRowRect(index, r);
      const s = new Sprite(ctx.tex.panels);
      s.position.set(rr.x, (rr.y + rr.h) * COS - (PV_FACE + PV_LEG));
      s.width = rr.w;
      s.height = PV_FACE + PV_LEG;
      c.addChild(s);
      this.rows.push(s);
      const gl = new Sprite(ctx.tex.sheen);
      gl.width = 80;
      gl.height = PV_FACE - 2;
      gl.position.set(rr.x, s.y + 1);
      gl.blendMode = 'add';
      gl.alpha = 0;
      gl.visible = false;
      ctx.fx.addChild(gl);
      this.glints.push(gl);
    }
    for (let h = 0; h < 2; h++) {
      const a = this.rows[h * 3];
      const b = this.rows[h * 3 + 2];
      const s = new Sprite(Texture.WHITE);
      s.position.set(a.x - 2, a.y);
      s.width = PV_ROW.w + 4;
      s.height = b.y + b.height - a.y;
      s.tint = 0xff3b30;
      s.alpha = 0;
      s.visible = false;
      c.addChild(s);
      this.red.push(s);
    }
    c.addChild(ctx.stat(buildPvFront(index)));
    for (const k of [0, 1]) {
      const iv = invRect(index, k);
      for (const dx of [12, 30]) {
        const fan = new Fan(ctx.tex.fan, iv.x + dx, iv.y + iv.d / 2, iv.h, 4.6, true);
        c.addChild(fan.node);
        this.fans.push(fan);
      }
    }
    c.addChild(this.leds, this.flag);
    const pl = new Sprite(ctx.plate([`PV ${'A' + (index + 1)}`, '180 kWp - 2 inverters'], '#facc15', 128));
    pl.anchor.set(0.5, 1);
    pl.position.set(f.x + f.w / 2, (f.y + f.h + 24) * COS);
    pl.scale.set(PLATE_S);
        c.addChild(pl);
  }

  casters(): Caster[] {
    return this.rows.map((_, r) => rectCaster(pvRowRect(this.index, r), H.pv));
  }

  update(s: Snap, t: number, dt: number, sun: Sun): void {
    const a = s.pv[this.index];
    // Brightness from the array's own irradiance (a passing cloud dims exactly this array) and each string's share of the best string.
    const level = clamp(Math.sqrt(clamp(finite(a.irr) / 900)));
    const maxDc = Math.max(0.05, ...a.dc.map((v) => finite(v)));
    this.flick = a.curtailed ? 0.82 + 0.18 * Math.sin(t * 17 + this.index * 2.1) * Math.sin(t * 5.3) : 1;
    // glint: a bright band that sweeps along the rows with the sun's azimuth; strongest at high sun in clear air
    const gl = clamp(level * smooth(4, 32, sun.elev) * (1 - 0.75 * clamp(s.cloud)));
    const frac = clamp((sun.az - 95) / 170);
    for (let r = 0; r < PV_ROWS; r++) {
      const share = maxDc > 0.3 ? clamp(finite(a.dc[r]) / maxDc, 0.15, 1) : 1;
      const v = (0.3 + 0.7 * level * (0.45 + 0.55 * share)) * this.flick;
      const c = Math.round(clamp(v) * 255);
      this.rows[r].tint = (c << 16) | (c << 8) | c;
      const g = this.glints[r];
      const on = gl * share > 0.04;
      g.visible = on;
      if (on) {
        g.alpha = 0.55 * gl * share * this.flick;
        g.x = this.rows[r].x + frac * (PV_ROW.w - 80) + (r % 2) * 14;
      }
    }
    for (let h = 0; h < 2; h++) {
      const fault = a.inv[h] === 'FAULT';
      const sp = this.red[h];
      sp.visible = fault;
      if (fault) sp.alpha = 0.22 + 0.3 * (0.5 + 0.5 * Math.sin(t * 5 + h));
    }
    // inverter fans follow the output
    const out = clamp(finite(a.ac) / a.rated);
    this.fans.forEach((fan, i) => fan.spin(dt, a.inv[i < 2 ? 0 : 1] === 'RUN' ? 2 + 20 * out : 0));
    // status LEDs: one per string combiner (health), one per inverter (state)
    const blink = Math.floor(t * 4) % 2;
    const key = `${a.health.map((v) => (Number.isFinite(v) ? Math.round(v / 5) : -1)).join(',')}|${a.inv.join(',')}|${a.inv.includes('FAULT') ? blink : 0}`;
    if (key !== this.ledKey) {
      this.ledKey = key;
      const g = this.leds;
      g.clear();
      for (let r = 0; r < PV_ROWS; r++) {
        const c = combinerPos(this.index, r);
        const p = project(c.x + 3, c.y + 2, c.z - 1.8);
        g.circle(p.x, p.y, 1.5).fill(HEALTH_COLOR(a.health[r]));
      }
      for (let k = 0; k < 2; k++) {
        const iv = invRect(this.index, k);
        const st = a.inv[k];
        const col = st === 'RUN' ? 0x34d399 : st === 'CURTAILED' ? 0xfbbf24 : st === 'FAULT' ? (blink ? 0xef4444 : 0x7f1d1d) : 0x59636f;
        const p = project(iv.x + 6, iv.y + iv.d, iv.h - 3.4);
        g.circle(p.x, p.y, 1.8).fill(col);
        g.circle(p.x, p.y, 3.4).fill({ color: col, alpha: 0.22 });
      }
    }
    // curtailment flag
    const fg = this.flag;
    fg.clear();
    fg.visible = a.curtailed;
    if (a.curtailed) {
      const p = flagPos(this.index);
      const b = project(p.x, p.y, 24);
      const w = Math.sin(t * 6 + this.index);
      fg.poly([b.x, b.y, b.x + 12, b.y + 1.5 + w * 1.5, b.x + 9, b.y + 3.5, b.x + 12.5, b.y + 5.5 - w, b.x, b.y + 6]).fill(0xfbbf24).stroke({ color: 0x7c5a0a, width: 0.6 });
    }
  }
}

// --- BESS ---------------------------------------------------------------------------------------

export class BessUnit {
  readonly glow: Sprite;
  private readonly bar = new Graphics();
  private readonly fans: Fan[] = [];
  readonly label: Label;
  private key = '';
  constructor(readonly index: number, ctx: Ctx) {
    const b = BESS[index];
    const c = asset(ctx, b.y + b.h + 10);
    c.addChild(ctx.stat(buildBess(index)));
    for (const f of bessFans(index)) {
      const fan = new Fan(ctx.tex.fan, f.x, f.y, f.z, f.r, true);
      c.addChild(fan.node);
      this.fans.push(fan);
    }
    c.addChild(this.bar);
    const pl = new Sprite(ctx.plate([`BESS ${b.id}`, '500 kWh - 250 kW'], '#38bdf8', 100));
    pl.anchor.set(0.5, 1);
    pl.position.set(b.x + 50, (b.y + b.h - 8) * COS - BESS_Z - 2);
        c.addChild(pl);
    this.glow = new Sprite(ctx.tex.glow);
    this.glow.anchor.set(0.5);
    const cc = project(b.x + b.w / 2, b.y + b.h / 2, 12);
    this.glow.position.set(cc.x, cc.y);
    this.glow.width = b.w * 1.9;
    this.glow.height = b.h * 2.7;
    this.glow.blendMode = 'add';
    this.glow.alpha = 0;
    ctx.fx.addChild(this.glow);
    const pp = bessPanel(index);
    const lp = project((pp.x0 + pp.x1) / 2, b.y + b.h, (pp.z0 + pp.z1) / 2 + 2);
    this.label = new Label('--%', lp.x, lp.y, 8, ctx.res, 0xffffff);
    ctx.ui.addChild(this.label.text);
  }
  casters(): Caster[] {
    return [rectCaster(BESS[this.index], H.bess)];
  }
  update(s: Snap, t: number, dt: number, reduced: boolean): void {
    const b = BESS[this.index];
    const d = s.bess[this.index];
    const soc = finite(d.soc);
    const k = `${Math.round(soc)}|${d.state}`;
    if (k !== this.key) {
      this.key = k;
      const p = bessPanel(this.index);
      const x0 = p.x0 + 1.4;
      const w = p.x1 - p.x0 - 2.8;
      const top = (b.y + b.h) * COS - (p.z1 + 2) + 1.4;
      const hgt = p.z1 - p.z0 - 2.8;
      const col = d.state === 'FAULT' ? COLOR.island : soc < 15 ? COLOR.island : soc < 30 ? COLOR.warn : COLOR.grid;
      this.bar.clear();
      this.bar.rect(x0, top, w, hgt).fill(0x10151c);
      this.bar.rect(x0, top, Math.max(1.5, w * clamp(soc / 100)), hgt).fill(col);
      for (let q = 1; q < 10; q++) this.bar.rect(x0 + (w * q) / 10, top, 0.5, hgt).fill({ color: 0x05080d, alpha: 0.7 });
      const lamp = project(p.x1 + 6, b.y + b.h, 11.5);
      this.bar.circle(lamp.x, lamp.y, 1.6).fill(d.state === 'FAULT' ? COLOR.island : d.state === 'IDLE' || d.state === '' ? 0x59636f : COLOR.grid);
      this.label.set(`${Number.isFinite(soc) ? Math.round(soc) : '--'}%`);
    }
    const p = finite(d.kw);
    const mag = clamp(Math.abs(p) / d.rated);
    const on = Math.abs(p) > 0.8;
    this.fans.forEach((f) => f.spin(dt, reduced ? 0 : 1 + 24 * mag));
    this.glow.tint = p > 0 ? COLOR.bess : COLOR.bessCharge;
    const pulse = reduced ? 0.7 : p > 0 ? 0.65 + 0.35 * Math.sin(t * 5) : 0.7 + 0.3 * Math.sin(t * 1.8);
    this.glow.alpha = on ? (0.1 + 0.42 * mag) * pulse : 0;
  }
}

// --- genset -------------------------------------------------------------------------------------

export class GensetUnit {
  private readonly puffs: Sprite[] = [];
  private readonly ring = new Graphics();
  private readonly fuelBar = new Graphics();
  private readonly fan: Fan;
  readonly label: Label;
  readonly badge: Label;
  private readonly glow: Sprite;
  private fuelKey = '';
  constructor(ctx: Ctx) {
    const c = asset(ctx, GENSET.y + GENSET.h + 44);
    c.addChild(ctx.stat(buildGenset()));
    const r = genRadiator();
    this.fan = new Fan(ctx.tex.fan, r.x, r.y, r.z, r.r, true);
    c.addChild(this.fan.node);
    c.addChild(this.fuelBar, this.ring);
    for (let i = 0; i < 9; i++) {
      const p = new Sprite(ctx.tex.puff);
      p.anchor.set(0.5);
      p.tint = 0xb4bcc8;
      p.alpha = 0;
      c.addChild(p);
      this.puffs.push(p);
    }
    const pl = new Sprite(ctx.plate(['GENSET', '400 kW - diesel'], '#9aa7b8', 104));
    pl.anchor.set(0.5, 1);
    pl.position.set(GENSET.x + GENSET.w + 4, (GENSET.y + GENSET.h + 56) * COS);
    pl.scale.set(PLATE_S);
        c.addChild(pl);
    this.glow = new Sprite(ctx.tex.glow);
    this.glow.anchor.set(0.5);
    const cc = project(GENSET.x + GENSET.w / 2, GENSET.y + GENSET.h / 2, 14);
    this.glow.position.set(cc.x, cc.y);
    this.glow.width = GENSET.w * 1.9;
    this.glow.height = GENSET.h * 2.4;
    this.glow.blendMode = 'add';
    this.glow.tint = 0xffb04a;
    this.glow.alpha = 0;
    ctx.fx.addChild(this.glow);
    const lp = project(GENSET.x + 4, GENSET.y, GEN_Z + H.genset + 10);
    this.label = new Label('GENSET', lp.x, lp.y, 11, ctx.res, 0xb4bcc8, 0);
    const bp = project(GENSET.x + GENSET.w / 2 - 6, GENSET.y + GENSET.h, GEN_Z + 12);
    this.badge = new Label('', bp.x, bp.y, 12, ctx.res, COLOR.warn);
    this.badge.text.visible = false;
    ctx.ui.addChild(this.label.text, this.badge.text);
  }
  casters(): Caster[] {
    return [rectCaster(GENSET, H.genset + GEN_Z)];
  }
  update(s: Snap, t: number, dt: number, reduced: boolean): void {
    const st = s.gen.state;
    const running = st === 'RUNNING' || st === 'COOLDOWN';
    const starting = st === 'STARTING';
    this.fan.spin(dt, running && !reduced ? 22 : starting && !reduced ? 8 : 0);
    const stack = genStack();
    const sp = project(stack.x, stack.y, stack.z);
    this.ring.clear();
    if (starting || running) {
      const col = starting ? COLOR.warn : COLOR.grid;
      const a = starting ? 0.5 + 0.5 * Math.sin(t * 8) : 0.9;
      const top = GENSET.y * COS - GEN_Z - H.genset + 2;
      this.ring.roundRect(GENSET.x - 2, top - 2, GENSET.w + 4, (GENSET.y + GENSET.h) * COS - top + 4, 3).stroke({ color: col, width: 2.2, alpha: a });
    }
    this.glow.alpha = running ? 0.22 + 0.1 * Math.sin(t * 3) : starting ? 0.16 * (0.5 + 0.5 * Math.sin(t * 8)) : 0;
    this.badge.text.visible = starting || running;
    this.badge.set(starting ? `START ${Math.max(0, Math.ceil(finite(s.gen.countdown)))}s` : st === 'COOLDOWN' ? 'COOLDOWN' : `RUN ${Math.round(finite(s.gen.kw))} kW`);
    this.badge.text.style.fill = starting ? COLOR.warn : COLOR.grid;
    // fuel level stripe on the day tank
    const fuel = clamp(finite(s.gen.fuel, 100) / 100);
    const fk = `${Math.round(fuel * 50)}`;
    if (fk !== this.fuelKey) {
      this.fuelKey = fk;
      const col = fuel < 0.15 ? COLOR.island : fuel < 0.3 ? COLOR.warn : COLOR.grid;
      const y = FUEL.y * COS - 5 - FUEL.r * 0.62 - 0.6;
      this.fuelBar.clear();
      this.fuelBar.roundRect(FUEL.x + 5, y, FUEL.w - 10, 3, 1.5).fill(0x10151c);
      this.fuelBar.roundRect(FUEL.x + 5, y, Math.max(2, (FUEL.w - 10) * fuel), 3, 1.5).fill(col);
    }
    // exhaust: puffs rise from the stack top, drift with the wind, swell and fade
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (!running || reduced) {
        p.alpha = 0;
        continue;
      }
      const ph = (t * 0.55 + i / this.puffs.length) % 1;
      p.position.set(sp.x + ph * 22 + Math.sin(t * 2 + i) * 2, sp.y - 2 - ph * 46);
      const sc = 0.25 + ph * 0.7;
      p.scale.set(sc);
      p.alpha = (1 - ph) * 0.5 * Math.min(1, 0.4 + finite(s.gen.kw) / 250);
    }
  }
}

// --- EV lot -------------------------------------------------------------------------------------

const CAR_COLORS = [0xd9534f, 0x4f8fd9, 0xe8e8e8, 0x3d3d3d, 0xf0ad4e, 0x5cb85c, 0x9b6bd1, 0x2fb3b3, 0xc0c0c0, 0xe07a5f];

/** A parked car in the oblique view, drawn around its ground centre (0, 0): body, cabin, glass, lamps, wheels. `nose` is the end facing the camera (+1 south). */
function drawCar(g: Graphics, col: number, nose: 1 | -1): void {
  const dark = 0x0b0f16;
  g.ellipse(0, 3, 22, 18).fill({ color: 0x02050a, alpha: 0.3 });
  wall(g, -17, -11, 28, 0, 4, 0x111418);
  wall(g, 11, 17, 28, 0, 4, 0x111418);
  box(g, -17, -30, 34, 60, 1.5, 5.5, { top: col, front: col, edge: dark });
  // cabin sits towards the rear; its south face is the windscreen (nose south) or the rear glass (nose north)
  const cy0 = nose === 1 ? -14 : -4;
  box(g, -12, cy0, 24, 24, 7, 5, { top: shade(col, 1.15), front: 0x10151d, edge: dark, ao: 0 });
  wall(g, -10.5, 10.5, cy0 + 24, 7.6, 11.4, 0x1d2a3a);
  poly(g, [[-10.5, cy0 + 24, 9.6], [-5.5, cy0 + 24, 11.4], [-1, cy0 + 24, 11.4], [-6, cy0 + 24, 9.6]], 0x8fb4de, 0.45);
  slab(g, -12, cy0, 24, 24, 12, shade(col, 1.15));
  if (nose === 1) {
    wall(g, -15, -9, 30, 3.4, 5.2, 0xfff2c6);
    wall(g, 9, 15, 30, 3.4, 5.2, 0xfff2c6);
    wall(g, -6, 6, 30, 2.4, 3.4, 0x1a1f27);
  } else {
    wall(g, -15, -8, 30, 3.4, 5.2, 0xdc2626);
    wall(g, 8, 15, 30, 3.4, 5.2, 0xdc2626);
    wall(g, -5, 5, 30, 2.8, 3.8, 0xe5e7eb);
  }
  line(g, [[-17, 30, 4], [17, 30, 4]], 0x000000, 0.6, 0.35);
}

export class EvLot {
  private readonly cars: Container[] = [];
  private readonly rings: Graphics[] = [];
  private readonly cables: Graphics[] = [];
  private readonly level: number[] = Array(10).fill(0);
  private readonly keys: string[] = Array(10).fill('');
  private readonly state: string[] = Array(10).fill('');
  constructor(ctx: Ctx) {
    const root = asset(ctx, EV_LOT.y + EV_LOT.h + 8);
    root.sortableChildren = true;
    const roof = ctx.stat(buildEvRoof());
    roof.zIndex = 0;
    const ped = ctx.stat(buildEvCanopy());
    ped.zIndex = 1;
    root.addChild(roof, ped);
    for (let i = 0; i < 10; i++) {
      const b = bayRect(i);
      const p = pedestal(i);
      const ring = new Graphics();
      const rp = project(p.x, p.y + 4);
      ring.position.set(rp.x, rp.y);
      ring.scale.y = COS;
      ring.zIndex = 2;
      root.addChild(ring);
      this.rings.push(ring);
      const cable = new Graphics();
      cable.zIndex = 20;
      root.addChild(cable);
      this.cables.push(cable);
      const car = new Container();
      const g = new Graphics();
      drawCar(g, CAR_COLORS[i], i < 5 ? 1 : -1);
      car.addChild(g);
      car.visible = false;
      car.zIndex = 10 + b.y;
      root.addChild(car);
      this.cars.push(car);
    }
    const lp = project(EV_LOT.x + 4, EV_LOT.y - 12, CANOPY_Z + 6);
    const t = new Label('EV CHARGING', lp.x, lp.y, 11, ctx.res, COLOR.load, 0);
    ctx.ui.addChild(t.text);
    const pl = new Sprite(ctx.plate(['EV CHARGING', '10 x 22 kW - solar canopy'], '#60a5fa', 150));
    pl.anchor.set(0.5, 1);
    pl.position.set(EV_LOT.x + EV_LOT.w + 70, (EV_LOT.y + EV_LOT.h - 4) * COS);
    pl.scale.set(PLATE_S);
        root.addChild(pl);
  }
  /** Canopy roofs (always) and the cars that currently cast a shadow. */
  casters(): Caster[] {
    const out: Caster[] = canopyRects().map((r) => rectCaster(r, CANOPY_Z));
    this.level.forEach((l, i) => {
      if (l > 0.5) {
        const b = bayRect(i);
        out.push(rectCaster({ x: b.x + b.w / 2 - 17, y: b.y + b.h / 2 - 30 + (i < 5 ? 2 : -2), w: 34, h: 60 }, H.car));
      }
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
      const gy = base + (1 - lv) * (i < 5 ? 70 : -70);
      car.position.set(home.x + home.w / 2, gy * COS);
      // pedestal LED ring (SOC arc) and the cable to the car: redrawn only when the quantised value or state changes
      const soc = finite(e.soc);
      const k = `${e.state}|${present ? Math.round(soc / 3) : -1}|${lv >= 0.99 ? 1 : 0}`;
      if (k !== this.keys[i]) {
        this.keys[i] = k;
        this.state[i] = e.state;
        const r = this.rings[i];
        r.clear();
        const cb = this.cables[i];
        cb.clear();
        if (present) {
          const col = e.state === 'FAULT' ? COLOR.island : e.state === 'CURTAILED' ? COLOR.warn : COLOR.grid;
          r.circle(0, 0, 11).stroke({ color: 0x0b0f16, width: 4, alpha: 0.85 });
          r.circle(0, 0, 11).stroke({ color: 0x3a4250, width: 2.5 });
          const f = e.state === 'FAULT' ? 1 : clamp(soc / 100);
          if (f > 0.01) r.arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f).stroke({ color: col, width: 2.5, cap: 'round' });
          if (lv >= 0.99) {
            // droop from the holster to the car's charge port at the nose end
            const p = pedestal(i);
            const a = project(p.x + 3.5, p.y + 3, 7);
            const b = project(home.x + home.w / 2 - 8, base - 29, 7.4);
            const cx = (a.x + b.x) / 2 - 6;
            const cy = Math.max(a.y, b.y) + 4;
            cb.moveTo(a.x, a.y).quadraticCurveTo(cx, cy, b.x, b.y).stroke({ color: 0x0b0f16, width: 2.4, cap: 'round' });
            cb.moveTo(a.x, a.y).quadraticCurveTo(cx, cy, b.x, b.y).stroke({ color: e.state === 'CHARGING' ? 0x34d399 : 0x59636f, width: 0.9, cap: 'round', alpha: e.state === 'CHARGING' ? 0.95 : 0.8 });
          }
        }
      }
      this.rings[i].alpha = this.state[i] === 'FAULT' && !reduced ? 0.45 + 0.55 * Math.abs(Math.sin(t * 6)) : 1;
    }
  }
}

// --- buildings ----------------------------------------------------------------------------------

const LIT_TONE = [0xffd58a, 0xdff1ff, 0xffc874] as const;

export class BuildingActor {
  readonly lights = new Graphics();
  private readonly dim = new Graphics();
  readonly crit: Graphics;
  private key = '';
  private readonly order: number[];
  private readonly cells: ReturnType<typeof windowCells>;
  private readonly fans: Fan[] = [];
  readonly label: Label;
  private readonly critText: Label;
  constructor(readonly index: number, ctx: Ctx) {
    const b = BLDG[index];
    const c = asset(ctx, FACADE_Y(index) + (index === 2 ? 24 : 0));
    c.addChild(ctx.stat(buildBuilding(index)));
    for (const f of roofFans(index)) {
      const fan = new Fan(ctx.tex.fan, f.x, f.y, f.z, f.r, true);
      c.addChild(fan.node);
      this.fans.push(fan);
    }
    const bb = projBox({ x: b.x, y: b.y, w: b.w, h: b.h }, BLDG_TOP[index] + 2);
    this.dim.rect(bb.x, bb.y, bb.w, bb.h).fill({ color: 0x05080d, alpha: 0.5 });
    this.dim.visible = false;
    c.addChild(this.dim);
    ctx.fx.addChild(this.lights);
    // CRITICAL badge: on the lab's roof sign, on the roof edge of the others
    const bp = index === 1 ? { x: b.x + 100, y: (b.y + b.h - 8) * COS - 41 } : { x: b.x + b.w - 30, y: b.y * COS - BLDG_TOP[index] + 12 };
    this.crit = new Graphics();
    this.crit.roundRect(bp.x - 24, bp.y - 8, 48, 16, 8).fill({ color: 0xb91c1c, alpha: 0.95 }).stroke({ color: 0xfecaca, width: 1 });
    this.crit.visible = false;
    ctx.ui.addChild(this.crit);
    this.critText = new Label('CRITICAL', bp.x, bp.y, 9, ctx.res, 0xffffff);
    this.critText.text.visible = false;
    ctx.ui.addChild(this.critText.text);
    const sc = signCentre(index);
    this.label = new Label(['OFFICE', 'LAB', 'RESIDENCE'][index], sc.x, sc.y, index === 2 ? 8 : 9, ctx.res, 0xdbe4ee);
    ctx.ui.addChild(this.label.text);
    this.cells = windowCells(index);
    // floors light from the ground up as the building draws more power; within a floor the pattern is fixed
    const rank = (i: number) => this.cells[i].floor * 1000 + ((i * 7 + index * 5) % 13) * 10 + (i % 7);
    this.order = Array.from({ length: this.cells.length }, (_, i) => i).sort((p, q) => rank(p) - rank(q));
  }
  casters(): Caster[] {
    const b = BLDG[this.index];
    return [rectCaster(b, BLDG_TOP[this.index] - (this.index === 2 ? 4 : 0))];
  }
  update(s: Snap, night: number, dt: number, reduced: boolean): void {
    const b = BLDG[this.index];
    const d = s.bldg[this.index];
    this.dim.visible = d.shed;
    this.crit.visible = d.crit;
    this.critText.text.visible = d.crit;
    // roof fans spin with the HVAC share of the load
    const hv = clamp(finite(d.hvac) / 40);
    this.fans.forEach((f) => f.spin(dt, reduced ? 0 : 1.5 + 22 * hv));
    const f = d.shed ? 0 : clamp(0.25 + finite(d.kw) / 110);
    const n = this.cells.length;
    const lit = night > 0.12 ? Math.round(f * n) : 0;
    const key = `${lit}|${Math.round(night * 10)}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.lights;
    g.clear();
    if (lit === 0) return;
    const yF = b.y + b.h;
    const a = 0.95 * Math.min(1, night * 1.4);
    const tone = LIT_TONE[this.index];
    for (let k = 0; k < lit; k++) {
      const w = this.cells[this.order[k]];
      const p0 = project(w.x0, yF, w.z1);
      const p1 = project(w.x1, yF, w.z0);
      g.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y).fill({ color: tone, alpha: a });
      g.rect(p0.x - 1, p0.y - 1, p1.x - p0.x + 2, p1.y - p0.y + 2).fill({ color: tone, alpha: a * 0.12 });
    }
    // soft spill on the ground in front of the facade
    const sp = project(b.x, yF, 0);
    g.rect(sp.x, sp.y, b.w, 18).fill({ color: 0xffc46b, alpha: 0.1 * night * (lit / n) });
  }
}

// --- substation + utility link ------------------------------------------------------------------

const SW_X0 = FENCE_X + 14;
const SW_X1 = FENCE_X + 36;
const SW_Z = 16;
const PHASES = [-10, 0, 10] as const;

export class Substation {
  private readonly sw = new Graphics();
  private readonly arc = new Graphics();
  private readonly flash: Sprite;
  private flashT = 1;
  private flashColor: number = COLOR.island;
  private prevIsland: boolean | null = null;
  private arcT = 1;
  /** 0..1 black overlay (campus dips for a beat when the link snaps open). */
  dipLevel = 0;
  readonly label: Label;
  constructor(ctx: Ctx) {
    const S = SUBSTATION;
    const c = asset(ctx, S.y + S.h);
    c.addChild(ctx.stat(buildSubstation()));
    c.addChild(this.sw, this.arc);
    c.addChild(ctx.stat(buildSubstationFront()));
    // utility pole line along the east edge (the pole at the link is the tie-in)
    const pl = asset(ctx, TRUNK_Y + 4);
    pl.addChild(ctx.stat(buildPoleLine()));
    const plate = new Sprite(ctx.plate(['SUBSTATION', 'utility tie - 2 transformers'], '#34d399', 160));
    plate.anchor.set(0.5, 1);
    plate.position.set(S.x + 70, (S.y + S.h + 40) * COS);
    plate.scale.set(PLATE_S);
        c.addChild(plate);
    this.flash = new Sprite(ctx.tex.glow);
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;
    const fp = project((SW_X0 + SW_X1) / 2, TRUNK_Y, SW_Z + 4);
    this.flash.position.set(fp.x, fp.y);
    ctx.fx.addChild(this.flash);
    const lp = project(S.x + 4, S.y, 22);
    this.label = new Label('SUBSTATION', lp.x, lp.y, 11, ctx.res, 0xb4bcc8, 0);
    ctx.ui.addChild(this.label.text);
  }
  casters(): Caster[] {
    const out: Caster[] = transformers().map((t) => rectCaster({ x: t.x, y: t.y, w: 48, h: 26 }, H.sub));
    out.push(rectCaster({ x: SUBSTATION.x + 106, y: SUBSTATION.y + 70, w: 16, h: 9 }, 15));
    return out;
  }
  update(s: Snap, dt: number, reduced: boolean): void {
    if (this.prevIsland !== null && this.prevIsland !== s.island) {
      this.flashT = 0;
      this.flashColor = s.island ? COLOR.island : COLOR.grid;
      if (s.island) {
        this.dipLevel = 1;
        this.arcT = 0;
      }
    }
    this.prevIsland = s.island;
    this.flashT = Math.min(1, this.flashT + dt / 0.9);
    this.arcT = Math.min(1, this.arcT + dt / 0.45);
    this.dipLevel = Math.max(0, this.dipLevel - dt / 0.6);
    this.flash.tint = this.flashColor;
    this.flash.alpha = this.flashT < 1 ? (1 - this.flashT) * 0.95 : 0;
    this.flash.scale.set(0.35 + this.flashT * 1.1);
    const g = this.sw;
    g.clear();
    const live = !s.island;
    const wire = live ? 0xc7ced9 : 0x7b8696;
    const L = SW_X1 - SW_X0;
    for (const dy of PHASES) {
      const y = TRUNK_Y + dy;
      // gate conductor, insulator posts, blade, and the span to the pole crossarm
      line(g, [[FENCE_X - 4, y, 24], [(FENCE_X - 4 + SW_X0) / 2, y, 19.5], [SW_X0, y, SW_Z + 2]], wire, 1, 0.95);
      for (const x of [SW_X0, SW_X1]) {
        line(g, [[x, y, 0], [x, y, SW_Z]], 0x59636f, 2.2, 1);
        g.circle(x, y * COS - SW_Z, 1.6).fill(0xb1744a);
      }
      if (s.island) line(g, [[SW_X0, y, SW_Z + 1], [SW_X0 + Math.cos(1) * L, y, SW_Z + 1 + Math.sin(1) * L]], 0xe5e7eb, 2, 1);
      else line(g, [[SW_X0, y, SW_Z + 1], [SW_X1, y, SW_Z + 1]], 0xe5e7eb, 2, 1);
      const span: [number, number, number][] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        span.push([SW_X1 + (POLE_X + dy * 0.8 - SW_X1) * t, y + (TRUNK_Y - y) * t, SW_Z + 2 + (POLE_Z - SW_Z - 2) * t - 2.5 * Math.sin(Math.PI * t)]);
      }
      line(g, span, wire, 1, 0.95);
      if (live) line(g, span, COLOR.grid, 2.4, 0.22);
    }
    // breaker lamp in the yard
    const bl = project(SUBSTATION.x + 84 + 10, TRUNK_Y + 4, 3.5);
    g.circle(bl.x, bl.y, 1.7).fill(s.island ? COLOR.island : COLOR.grid);
    if (s.island) {
      const blink = reduced ? 1 : 0.55 + 0.45 * Math.sin(performance.now() / 180);
      for (const x of [SW_X0, SW_X1]) {
        const p = project(x, TRUNK_Y, SW_Z + 1);
        g.circle(p.x, p.y, 3.4).fill({ color: COLOR.island, alpha: x === SW_X1 ? blink : 1 });
      }
    }
    const pole = project(POLE_X + 6, TRUNK_Y, 21);
    g.circle(pole.x, pole.y, 2).fill(s.avail ? COLOR.grid : 0x59636f);
    // arc flash: jagged bolts between blade tip and the far terminal for a few frames
    const a = this.arc;
    a.clear();
    if (this.arcT < 1 && !reduced) {
      const k = 1 - this.arcT;
      const p0 = project(SW_X0 + 14, TRUNK_Y, SW_Z + 15);
      const p1 = project(SW_X1, TRUNK_Y, SW_Z + 1);
      for (let b = 0; b < 3; b++) {
        a.moveTo(p0.x, p0.y);
        for (let q = 1; q <= 5; q++) {
          const tt = q / 5;
          a.lineTo(p0.x + (p1.x - p0.x) * tt + (Math.random() - 0.5) * 9 * k, p0.y + (p1.y - p0.y) * tt + (Math.random() - 0.5) * 9 * k);
        }
        a.stroke({ color: b ? 0xfef3c7 : 0x93c5fd, width: b ? 1 : 2, alpha: 0.9 * k });
      }
      a.circle(p1.x, p1.y, 6 * k + 2).fill({ color: 0xffffff, alpha: 0.7 * k });
    }
  }
}

// --- street lights ------------------------------------------------------------------------------

export class StreetLights {
  private readonly pools: Sprite[] = [];
  private readonly cones: Sprite[] = [];
  constructor(ctx: Ctx, renderer: Renderer) {
    const lamp = lampTexture(renderer);
    for (const p of LIGHTS) {
      const foot = project(p.x, p.y + 4);
      const s = new Sprite(lamp.tex);
      s.anchor.set(lamp.ax, lamp.ay);
      s.position.set(foot.x, foot.y);
      s.zIndex = p.y + 4;
      ctx.world.addChild(s);
      const pool = new Sprite(ctx.tex.glow);
      pool.anchor.set(0.5);
      pool.position.set(foot.x + 3, foot.y + 2);
      pool.width = 124;
      pool.height = 124 * COS * 0.8;
      pool.tint = 0xffcf8a;
      pool.blendMode = 'add';
      pool.alpha = 0;
      ctx.fx.addChild(pool);
      this.pools.push(pool);
      const cone = new Sprite(ctx.tex.cone);
      cone.anchor.set(0.5, 0);
      cone.position.set(foot.x + LAMP_HEAD.x, foot.y + LAMP_HEAD.y);
      cone.width = 52;
      cone.height = 26;
      cone.tint = 0xffd9a0;
      cone.blendMode = 'add';
      cone.alpha = 0;
      ctx.fx.addChild(cone);
      this.cones.push(cone);
    }
  }
  update(night: number): void {
    const a = night > 0.08 ? Math.min(1, night * 1.3) : 0;
    for (let i = 0; i < this.pools.length; i++) {
      this.pools[i].alpha = 0.6 * a;
      this.pools[i].visible = a > 0;
      this.cones[i].alpha = 0.55 * a;
      this.cones[i].visible = a > 0;
    }
  }
}
