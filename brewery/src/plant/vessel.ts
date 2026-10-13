import { Container, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { rawBool, rawNum, rawStr } from '../live/store';
import { recipeColorRaw } from '../model';
import { COPPER, STEEL, contrast, hex, mix, shade, tempColor } from './iso';

/** Static description of one tank. Positions are the ground point under the vessel in world pixels. */
export interface VesselSpec {
  id: string;
  title: string;
  /** Tag folder ("Cellar/FV03", "Brewhouse/Kettle"). */
  base: string;
  x: number;
  y: number;
  /** Half width in pixels (the top ellipse has half height rx / 2). */
  rx: number;
  /** Body height in pixels. */
  h: number;
  /** Legs: body bottom above the ground. */
  elev: number;
  /** Conical bottom depth (0 = flat). */
  cone: number;
  palette: 'steel' | 'copper';
  lid: 'flat' | 'dome' | 'chimney';
  /** Has Phase / BatchId tags (everything except the liquor tanks). */
  process: boolean;
  /** Fault / deviation can pulse red. */
  kind: 'brew' | 'fv' | 'bbt' | 'liquor';
}

export interface VesselCtx {
  bubble: Texture;
  textRes: number;
  /** Resolution of the cached body texture. */
  cacheRes: number;
}

const PHASE_SHORT: Record<string, string> = {
  IDLE: 'IDLE', EMPTY: 'EMPTY', FILLING: 'FILL', FERMENTING: 'FERM', DIACETYL_REST: 'DIAC', CRASH: 'CRASH', CONDITIONING: 'COND',
  TRANSFER: 'XFER', CIP: 'CIP', CARBONATING: 'CARB', READY: 'READY', PACKAGING: 'PACK', MILLING: 'MILL', MASH_IN: 'MASH-IN',
  MASH_REST: 'REST', MASH_OUT: 'MASH-OUT', WAIT_LAUTER: 'WAIT', VORLAUF: 'VORLAUF', RUNOFF: 'RUNOFF', WAIT_KETTLE: 'WAIT', HEAT: 'HEAT',
  BOIL: 'BOIL', WAIT_WHIRLPOOL: 'WAIT', REST: 'REST', WAIT_CHILLER: 'WAIT', KNOCKOUT: 'KNOCKOUT', PRECOOL: 'PRECOOL', FLUSH: 'FLUSH', FILL: 'FILL',
};
export const phaseShort = (p: string): string => PHASE_SHORT[p] ?? p.slice(0, 8);

const GLASS = 0x1b2838;
const CIP_LIQUID = 0xb7efd0;
const ACCENT = 0xd4874a;
const RED = 0xff4d4d;

/** Vertical bands across a cylinder between two flat-topped heights, bottom edge following the lower ellipse arc. */
export function bands(g: Graphics, rx: number, ry: number, yBottom: number, yTop: number, colour: number, f: number[] = [0.62, 0.95, 1.2, 0.8]): void {
  const edges = [-1, -0.45, 0.25, 0.65, 1];
  for (let i = 0; i < 4; i++) {
    const a = edges[i] * rx;
    const b = edges[i + 1] * rx;
    const pts: number[] = [];
    const steps = 5;
    for (let s = 0; s <= steps; s++) {
      const x = a + ((b - a) * s) / steps;
      pts.push(x, yBottom + ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)));
    }
    pts.push(b, yTop, a, yTop);
    g.poly(pts).fill(shade(colour, f[i]));
  }
}

/** A band of constant thickness t whose upper edge is the lower arc of the ellipse centred at y0. */
function ring(g: Graphics, rx: number, ry: number, y0: number, t: number, colour: number): void {
  const edges = [-1, -0.45, 0.25, 0.65, 1];
  const f = [0.6, 0.95, 1.25, 0.8];
  for (let i = 0; i < 4; i++) {
    const a = edges[i] * rx;
    const b = edges[i + 1] * rx;
    const top: number[] = [];
    const bot: number[] = [];
    for (let s = 0; s <= 5; s++) {
      const x = a + ((b - a) * s) / 5;
      const arc = ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
      top.push(x, y0 + arc);
      bot.push(x, y0 + arc + t);
    }
    const back: number[] = [];
    for (let k = bot.length - 2; k >= 0; k -= 2) back.push(bot[k], bot[k + 1]);
    g.poly([...top, ...back]).fill(shade(colour, f[i]));
  }
}

export class Vessel {
  readonly root = new Container();
  readonly rx: number;
  readonly ry: number;
  private readonly spec: VesselSpec;
  /** Everything that only changes now and then (body, liquid, tint, chip, labels) is drawn once into a cached texture. */
  private readonly art = new Container();
  private readonly fx = new Container();
  private dirty = true;
  private readonly glass = new Graphics();
  private readonly liquid = new Graphics();
  private readonly tint = new Graphics();
  private readonly halo = new Graphics();
  private readonly chip = new Container();
  private readonly chipBg = new Graphics();
  private readonly chipText: Text;
  private readonly nameText: Text;
  private readonly statusText: Text;
  private readonly bubbles: { s: Sprite; y: number; x: number; v: number }[] = [];
  private readonly boil: { s: Sprite; t: number; x: number; y: number }[] = [];
  private readonly foam = new Graphics();
  private key = '';
  private foamKey = -1;
  private tintKey = '';
  private haloKey = '';
  private chipKey = '';
  private selected = false;
  private hovered = false;
  private alert = false;
  // live values (updated by update())
  level = 0;
  temp = NaN;
  phase = '';
  batch = '';
  recipe = '';
  /** Puffs per second the scene should emit at steamPoint(). */
  steamRate = 0;

  constructor(spec: VesselSpec, ctx: VesselCtx) {
    this.spec = spec;
    this.rx = spec.rx;
    this.ry = spec.rx / 2;
    const { root } = this;
    root.position.set(spec.x, spec.y);
    root.zIndex = spec.y;
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.label = spec.id;
    const top = this.topY();
    root.hitArea = new Rectangle(-spec.rx - 6, top - 26, spec.rx * 2 + 12, -top + this.ry * 0.7 + 40);

    this.drawStatic();
    this.nameText = new Text({ text: spec.title, style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: '700', fill: 0xe8eef6, stroke: { color: 0x05080d, width: 3 } }, resolution: ctx.textRes });
    this.nameText.anchor.set(0.5, 0);
    this.nameText.position.set(0, this.ry * 0.62 + 4);
    this.statusText = new Text({ text: '', style: { fontFamily: 'JetBrains Mono', fontSize: 10.5, fontWeight: '500', fill: 0xaebccd, stroke: { color: 0x05080d, width: 3 } }, resolution: ctx.textRes });
    this.statusText.anchor.set(0.5, 0);
    this.statusText.position.set(0, this.ry * 0.62 + 18);
    this.chipText = new Text({ text: '', style: { fontFamily: 'JetBrains Mono', fontSize: 10.5, fontWeight: '700', fill: 0x0a1018 }, resolution: ctx.textRes });
    this.chipText.anchor.set(0.5, 0.5);
    this.chip.addChild(this.chipBg, this.chipText);
    this.chip.position.set(0, top - 16 - (spec.lid === 'chimney' ? 26 : 0));
    this.chip.visible = false;
    const { art, fx } = this;
    art.addChild(this.glass, this.liquid);
    this.drawRings();
    art.addChild(this.foam, this.tint);
    for (let i = 0; i < (spec.kind === 'fv' ? 5 : 0); i++) {
      const s = new Sprite(ctx.bubble);
      s.anchor.set(0.5);
      s.visible = false;
      this.bubbles.push({ s, y: 0, x: 0, v: 0 });
      fx.addChild(s);
    }
    if (spec.id === 'Kettle') {
      for (let i = 0; i < 12; i++) {
        const s = new Sprite(ctx.bubble);
        s.anchor.set(0.5);
        s.visible = false;
        this.boil.push({ s, t: Math.random(), x: 0, y: 0 });
        fx.addChild(s);
      }
    }
    art.addChild(this.chip, this.nameText, this.statusText);
    art.cacheAsTexture({ resolution: ctx.cacheRes, antialias: true });
    root.addChild(art, fx, this.halo);
  }

  /** y (local) of the top ellipse centre. */
  private topY(): number {
    return -(this.spec.elev + this.spec.h);
  }

  /** World position where steam leaves the vessel. */
  steamPoint(): { x: number; y: number } {
    const lift = this.spec.lid === 'chimney' ? 34 : this.spec.lid === 'dome' ? 12 : 2;
    return { x: this.spec.x, y: this.spec.y + this.topY() - lift };
  }

  /** World position of the vessel centre (tooltip anchor). */
  center(): { x: number; y: number } {
    return { x: this.spec.x, y: this.spec.y - this.spec.elev - this.spec.h / 2 };
  }

  private palette() {
    return this.spec.palette === 'copper' ? COPPER : STEEL;
  }

  private drawStatic(): void {
    const { rx, ry, spec } = this;
    const g = this.glass;
    const pal = this.palette();
    // ground shadow
    g.ellipse(0, 2, rx * 1.18, ry * 1.18).fill({ color: 0x000000, alpha: 0.4 });
    if (spec.elev > 0) {
      // legs
      for (const sx of [-0.78, 0.78]) {
        g.moveTo(sx * rx, -spec.elev + ry * 0.4).lineTo(sx * rx, ry * 0.5).stroke({ color: pal.dark, width: 3 });
      }
      g.moveTo(0, -spec.elev + spec.cone * 0.5).lineTo(0, ry * 0.62).stroke({ color: pal.base, width: 3 });
    }
    if (spec.cone > 0) {
      g.poly([-rx, -spec.elev, 0, -spec.elev + spec.cone, rx, -spec.elev]).fill(pal.dark);
      g.poly([-rx * 0.1, -spec.elev, 0, -spec.elev + spec.cone, rx, -spec.elev]).fill(pal.base);
    }
    // glass body (dark, translucent look)
    bands(g, rx, ry, -spec.elev, this.topY(), GLASS, [0.8, 1.05, 1.35, 0.95]);
  }

  /** Steel rings (top and bottom) and the lid, drawn above the liquid. */
  private drawRings(): void {
    const { rx, ry, spec } = this;
    const pal = this.palette();
    const g = new Graphics();
    const yb = -spec.elev;
    const yt = this.topY();
    ring(g, rx, ry, yb - 7, 7, pal.base);
    ring(g, rx, ry, yt, 7, pal.base);
    // lid
    g.ellipse(0, yt, rx, ry).fill(pal.light);
    g.ellipse(0, yt, rx * 0.78, ry * 0.78).fill(pal.top);
    if (spec.lid === 'dome') {
      const pts: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI - (Math.PI * i) / 12;
        pts.push(Math.cos(a) * rx * 0.8, yt - Math.sin(a) * ry * 1.7 + ry * 0.1);
      }
      g.poly(pts).fill(mix(pal.light, 0xffffff, 0.12));
      g.ellipse(0, yt - ry * 1.35, rx * 0.22, ry * 0.22).fill(pal.dark);
    } else if (spec.lid === 'chimney') {
      g.rect(-6, yt - 30, 12, 32).fill(pal.base);
      g.rect(-2, yt - 30, 8, 32).fill(pal.light);
      g.ellipse(0, yt - 30, 8, 3.5).fill(pal.top);
    } else {
      g.ellipse(0, yt, rx * 0.2, ry * 0.2).fill(pal.dark);
    }
    this.art.addChild(g);
  }

  private drawLiquid(colour: number, frac: number, cip: boolean): void {
    const { rx, spec } = this;
    const g = this.liquid;
    g.clear();
    if (frac < 0.004) return;
    const yb = -spec.elev - 6;
    const yt = this.topY() + 6;
    const ys = yb - (yb - yt) * Math.min(1, frac);
    const rxi = rx - 3;
    const ryi = rxi / 2;
    if (spec.cone > 0) g.poly([-rx, -spec.elev, 0, -spec.elev + spec.cone, rx, -spec.elev]).fill(shade(colour, 0.7));
    bands(g, rxi, ryi, yb, ys, colour);
    g.ellipse(0, ys, rxi, ryi).fill(shade(colour, cip ? 1.05 : 1.28));
    g.ellipse(0, ys, rxi, ryi).stroke({ color: shade(colour, 1.5), width: 1, alpha: 0.7 });
  }

  private drawTint(c: number): void {
    const { rx, ry, spec } = this;
    const g = this.tint;
    g.clear();
    const yb = -spec.elev - 6;
    const yt = this.topY() + 6;
    g.moveTo(-rx, yb).lineTo(-rx, yt).stroke({ color: c, width: 2.5, alpha: 0.9 });
    g.moveTo(rx, yb).lineTo(rx, yt).stroke({ color: c, width: 2.5, alpha: 0.9 });
    g.ellipse(0, yt - 0.5, rx - 1, ry - 0.5).stroke({ color: c, width: 2, alpha: 0.85 });
    g.ellipse(0, yb + 0.5, rx - 1, ry - 0.5).stroke({ color: c, width: 2, alpha: 0.6 });
  }

  private drawHalo(colour: number, wide: boolean): void {
    const g = this.halo;
    g.clear();
    if (colour < 0) return;
    const { rx, ry, spec } = this;
    const top = this.topY() - ry - (spec.lid === 'chimney' ? 34 : spec.lid === 'dome' ? 14 : 4);
    g.roundRect(-rx - 7, top, rx * 2 + 14, -top + ry * 0.7 + 4, 8).stroke({ color: colour, width: wide ? 3 : 2 });
  }

  setSelected(v: boolean): void {
    this.selected = v;
  }
  setHovered(v: boolean): void {
    this.hovered = v;
  }

  /** Read the tags, redraw what changed, advance the little animations. */
  update(t: number, dt: number, reduced: boolean): void {
    const { spec, base } = { spec: this.spec, base: this.spec.base };
    const level = rawNum(`${base}/LevelPct`);
    const temp = rawNum(`${base}/TempC`);
    const phase = spec.process ? rawStr(`${base}/Phase`) : '';
    const batch = spec.process ? rawStr(`${base}/BatchId`) : '';
    const recipe = spec.process ? rawStr(`${base}/Recipe`) : '';
    this.level = Number.isFinite(level) ? level : 0;
    this.temp = temp;
    this.phase = phase;
    this.batch = batch;
    this.recipe = recipe;

    // liquid
    const cip = phase === 'CIP';
    const colour = cip ? CIP_LIQUID : spec.kind === 'liquor' ? mix(0x4aa3d8, 0xff7a3d, spec.id === 'HLT' ? 0.55 : 0) : recipe ? hex(recipeColorRaw(recipe)) : 0x6b7f99;
    const lk = `${Math.round(this.level * 2)}|${colour}|${cip}`;
    if (lk !== this.key) {
      this.key = lk;
      this.dirty = true;
      this.drawLiquid(colour, this.level / 100, cip);
    }

    // temperature tint
    const tc = tempColor(temp);
    const tk = String(Math.round(Number.isFinite(temp) ? temp : -99));
    if (tk !== this.tintKey) {
      this.tintKey = tk;
      this.dirty = true;
      this.drawTint(tc);
    }

    // texts
    const ph = spec.process ? phaseShort(phase) : '';
    const st = `${ph}${ph && Number.isFinite(temp) ? ' ' : ''}${Number.isFinite(temp) ? temp.toFixed(1) + '°' : ''}`;
    const sf = spec.process && phase && !/^(IDLE|EMPTY)$/.test(phase) ? 0xd9e3ef : 0x8294a9;
    if (this.statusText.text !== st || this.statusText.style.fill !== sf) {
      this.statusText.text = st;
      this.statusText.style.fill = sf;
      this.dirty = true;
    }

    // batch chip
    const ck = `${batch}|${recipe}|${colour}`;
    if (ck !== this.chipKey) {
      this.chipKey = ck;
      this.dirty = true;
      if (batch) {
        const c = hex(recipeColorRaw(recipe));
        this.chipText.text = batch;
        this.chipText.style.fill = contrast(c);
        const w = this.chipText.width + 10;
        this.chipBg.clear().roundRect(-w / 2, -8, w, 16, 4).fill(c).stroke({ color: shade(c, 1.4), width: 1, alpha: 0.8 });
        this.chip.visible = true;
      } else this.chip.visible = false;
    }

    // alert state: fault flag or a process deviation
    let alert = spec.kind !== 'liquor' && rawBool(`${base}/Fault`);
    if (spec.kind === 'fv') {
      const sp = rawNum(`${base}/SetpointC`);
      if (Number.isFinite(sp) && Number.isFinite(temp) && phase !== 'EMPTY' && Math.abs(temp - sp) > 2.5) alert = true;
      if (rawNum(`${base}/PressurePSI`) > 15) alert = true;
    }
    if (spec.id === 'Kettle' && rawNum(`${base}/BoilOverRisk`) > 80) alert = true;
    this.alert = alert;
    const hk = alert ? 'a' : this.selected ? 's' : this.hovered ? 'h' : '';
    if (hk !== this.haloKey) {
      this.haloKey = hk;
      this.drawHalo(alert ? RED : this.selected ? ACCENT : this.hovered ? 0xe8eef6 : -1, this.selected);
    }
    if (this.alert) this.halo.alpha = reduced ? 1 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 7));
    else this.halo.alpha = 1;
    if (this.selected && !alert) this.halo.alpha = 1;

    // steam
    let steam = 0;
    if (Number.isFinite(temp) && this.level > 3) {
      if (spec.id === 'Kettle') steam = phase === 'BOIL' ? 16 : temp > 85 ? 7 : temp > 60 ? 2 : 0;
      else if (spec.id === 'HLT') steam = temp > 70 ? 2.2 : 0;
      else if (spec.kind === 'brew' && temp > 75) steam = 1.6;
    }
    this.steamRate = reduced ? 0 : steam;

    if (this.dirty) {
      this.dirty = false;
      this.art.updateCacheTexture();
    }

    // bubbles in a fermenting tank
    if (this.bubbles.length) this.animateBubbles(dt, reduced, phase);
    if (this.boil.length) this.animateBoil(dt, reduced, phase, colour);
  }

  private animateBubbles(dt: number, reduced: boolean, phase: string): void {
    const rate = reduced ? 0 : phase === 'FERMENTING' ? 5 : phase === 'DIACETYL_REST' ? 3 : phase === 'CRASH' || phase === 'CONDITIONING' || phase === 'FILLING' ? 1 : 0;
    const yb = -this.spec.elev - 10;
    const level = this.level / 100;
    const ytop = yb - (this.spec.h - 16) * level;
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      if (i >= rate || level < 0.04) {
        b.s.visible = false;
        b.y = 0;
        continue;
      }
      if (!b.s.visible || b.y === 0) {
        b.x = (Math.random() - 0.5) * this.rx * 1.4;
        b.y = yb - Math.random() * 6;
        b.v = 14 + Math.random() * 16;
        b.s.visible = true;
      }
      b.y -= b.v * dt;
      if (b.y <= ytop) {
        b.s.visible = false;
        b.y = 0;
        continue;
      }
      const f = (yb - b.y) / Math.max(1, yb - ytop);
      b.s.position.set(b.x + Math.sin(b.y * 0.12 + i) * 2, b.y);
      b.s.scale.set(0.5 + 0.35 * (i % 3) * 0.5 + f * 0.3);
      b.s.alpha = 0.75 * (1 - f * 0.5);
    }
  }

  private animateBoil(dt: number, reduced: boolean, phase: string, colour: number): void {
    const boiling = !reduced && phase === 'BOIL' && this.level > 5;
    const ys = -this.spec.elev - 6 - (this.spec.h - 12) * (this.level / 100);
    for (const b of this.boil) {
      if (!boiling) {
        b.s.visible = false;
        continue;
      }
      b.t += dt * (1.4 + Math.random() * 0.5);
      if (b.t >= 1 || !b.s.visible) {
        b.t = b.s.visible ? 0 : Math.random();
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 0.85;
        b.x = Math.cos(a) * r * (this.rx - 4);
        b.y = ys + Math.sin(a) * r * (this.ry - 2);
        b.s.visible = true;
      }
      b.s.position.set(b.x, b.y - Math.sin(b.t * Math.PI) * 3);
      b.s.scale.set(0.35 + 0.8 * Math.sin(b.t * Math.PI));
      b.s.alpha = 0.9 * Math.sin(b.t * Math.PI);
      b.s.tint = shade(colour, 1.6);
    }
    // foam cap rising with the foam level, spilling over the rim near boil-over
    const foam = phase === 'BOIL' ? rawNum(`${this.spec.base}/FoamLevelPct`) : 0;
    const fk = Math.round((Number.isFinite(foam) ? foam : 0) / 4);
    if (fk !== this.foamKey) {
      this.foamKey = fk;
      this.dirty = true;
      this.foam.clear();
      if (fk > 4) {
        const f = Math.min(1, fk / 25);
        const top = this.topY();
        this.foam.ellipse(0, top + 4 - f * 9, this.rx * (0.7 + 0.3 * f), this.ry * (0.7 + 0.3 * f)).fill({ color: 0xfff6e0, alpha: 0.85 });
        if (f > 0.8) this.foam.poly([-this.rx, top + 4, -this.rx - 3, top + 24, -this.rx + 7, top + 20, -this.rx + 7, top + 4]).fill({ color: 0xfff6e0, alpha: 0.8 });
      }
    }
  }
}
