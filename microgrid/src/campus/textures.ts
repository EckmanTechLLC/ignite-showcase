import { CanvasSource, Texture } from 'pixi.js';
import { COS, PV_ROW } from './model';

/** Procedural textures painted once on a 2D canvas: no image files are bundled. */
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) draw(ctx);
  return Texture.from(c);
}

/** Height in screen units of a tilted PV row: its depth foreshortened plus the tilt rise (the posts add `PV_LEG`). */
export const PV_RISE = 8;
export const PV_LEG = 5;
export const PV_FACE = PV_ROW.h * COS + PV_RISE;

export interface Textures {
  /** Soft round dot (energy particles). */
  dot: Texture;
  /** Wide radial glow (street lights, emissive halos, flashes). */
  glow: Texture;
  /** Exhaust / heat puff. */
  puff: Texture;
  /** One racking row (tilted panels, rail, posts); tinted per string brightness. */
  panels: Texture;
  /** Seamless ground tiles. */
  lawn: Texture;
  asphalt: Texture;
  gravel: Texture;
  /** Fan / radiator rotor (rotated by sprites). */
  fan: Texture;
  /** Light cone of a street lamp, apex at the top centre (additive, tinted). */
  cone: Texture;
  /** Diagonal sheen band (PV glint, additive). */
  sheen: Texture;
}

const rnd = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

export function makeTextures(): Textures {
  const radial = (size: number, stops: [number, string][]) =>
    canvasTex(size, size, (c) => {
      const r = size / 2;
      const g = c.createRadialGradient(r, r, 0, r, r, r);
      for (const [o, col] of stops) g.addColorStop(o, col);
      c.fillStyle = g;
      c.fillRect(0, 0, size, size);
    });
  const dot = radial(16, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]);
  const glow = radial(128, [[0, 'rgba(255,255,255,0.95)'], [0.25, 'rgba(255,255,255,0.45)'], [0.6, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
  const puff = radial(48, [[0, 'rgba(255,255,255,0.7)'], [0.5, 'rgba(255,255,255,0.28)'], [1, 'rgba(255,255,255,0)']]);

  // Tilted racking row, painted at 2x and tinted at draw time (white = full brightness): a trapezoid (the high edge is further away)
  // of 15 modules x 2 cell rows, an aluminium lower edge, a rail and three posts. Sprite is PV_ROW.w x (PV_FACE + PV_LEG) screen units.
  const k = 2;
  const W = PV_ROW.w;
  const panels = canvasTex(W * k, Math.ceil((PV_FACE + PV_LEG) * k), (c) => {
    c.scale(k, k);
    const F = PV_FACE;
    const inset = 5;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const xAt = (m: number, v: number) => lerp(inset + (m * (W - 2 * inset)) / 15, (m * W) / 15, v);
    // shadow beneath the panel + posts
    const sg = c.createLinearGradient(0, F, 0, F + PV_LEG);
    sg.addColorStop(0, 'rgba(0,0,0,0.5)');
    sg.addColorStop(1, 'rgba(0,0,0,0.05)');
    c.fillStyle = sg;
    c.fillRect(6, F - 1, W - 12, PV_LEG + 1);
    for (const px of [0.1, 0.5, 0.9]) {
      c.fillStyle = '#6b7482';
      c.fillRect(W * px - 1.4, F - 2, 2.8, PV_LEG + 1.5);
      c.fillStyle = '#2b323d';
      c.fillRect(W * px + 0.4, F - 2, 1, PV_LEG + 1.5);
    }
    c.fillStyle = '#4b5361';
    c.fillRect(4, F - 3.2, W - 8, 1.8); // rail
    for (let m = 0; m < 15; m++) {
      for (let r = 0; r < 2; r++) {
        const v0 = r / 2;
        const v1 = (r + 1) / 2;
        const gap = 0.55;
        const q = [
          [xAt(m, v0) + gap, v0 * F + gap],
          [xAt(m + 1, v0) - gap, v0 * F + gap],
          [xAt(m + 1, v1) - gap, v1 * F - gap],
          [xAt(m, v1) + gap, v1 * F - gap],
        ];
        const gr = c.createLinearGradient(0, v0 * F, 0, v1 * F);
        gr.addColorStop(0, '#a9c0f0');
        gr.addColorStop(1, '#5d7cc4');
        c.fillStyle = gr;
        c.beginPath();
        c.moveTo(q[0][0], q[0][1]);
        for (let i = 1; i < 4; i++) c.lineTo(q[i][0], q[i][1]);
        c.closePath();
        c.fill();
        c.strokeStyle = 'rgba(18,30,64,0.5)';
        c.lineWidth = 0.4;
        for (let i = 1; i < 4; i++) {
          const t = i / 4;
          c.beginPath();
          c.moveTo(lerp(q[0][0], q[1][0], t), q[0][1]);
          c.lineTo(lerp(q[3][0], q[2][0], t), q[2][1]);
          c.stroke();
        }
      }
    }
    // bright aluminium lower edge, dark top edge, soft glass sheen
    c.strokeStyle = '#d5dbe6';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(0.5, F - 0.7);
    c.lineTo(W - 0.5, F - 0.7);
    c.stroke();
    c.strokeStyle = 'rgba(8,14,28,0.85)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(inset, 0.5);
    c.lineTo(W - inset, 0.5);
    c.stroke();
    const sh = c.createLinearGradient(0, 0, W, F);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(0.4, 'rgba(255,255,255,0.16)');
    sh.addColorStop(0.55, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(255,255,255,0.05)');
    c.fillStyle = sh;
    c.fillRect(0, 0, W, F);
  });

  const tile = (size: number, base: string, n: number, cols: string[], len: number, seed: number, w = 1) =>
    canvasTex(size, size, (c) => {
      const r = rnd(seed);
      c.fillStyle = base;
      c.fillRect(0, 0, size, size);
      for (let i = 0; i < n; i++) {
        const x = r() * size;
        const y = r() * size;
        c.strokeStyle = cols[Math.floor(r() * cols.length)];
        c.lineWidth = w;
        const a = len > 0 ? -Math.PI / 2 + (r() - 0.5) * 1.1 : 0;
        for (const ox of [-size, 0, size])
          for (const oy of [-size, 0, size]) {
            c.beginPath();
            c.moveTo(x + ox, y + oy);
            c.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len + (len ? 0 : 0.6));
            c.stroke();
          }
      }
    });
  const lawn = tile(256, '#1f4128', 2600, ['rgba(70,130,70,0.35)', 'rgba(20,50,30,0.45)', 'rgba(110,160,80,0.22)', 'rgba(30,70,40,0.4)'], 3.2, 11, 0.9);
  const asphalt = tile(128, '#2a2f37', 1100, ['rgba(255,255,255,0.07)', 'rgba(0,0,0,0.22)', 'rgba(150,160,175,0.1)'], 0, 21, 1.1);
  const gravel = tile(128, '#4a4a40', 900, ['rgba(255,240,210,0.16)', 'rgba(0,0,0,0.26)', 'rgba(210,200,180,0.12)'], 0, 31, 1.6);

  const fan = canvasTex(64, 64, (c) => {
    c.translate(32, 32);
    c.fillStyle = 'rgba(10,14,20,0.9)';
    c.beginPath();
    c.arc(0, 0, 30, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#9aa5b4';
    c.lineWidth = 2.4;
    c.stroke();
    c.fillStyle = '#c8d0da';
    for (let i = 0; i < 5; i++) {
      c.save();
      c.rotate((i * Math.PI * 2) / 5);
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(14, -6, 25, 6);
      c.quadraticCurveTo(10, 8, 0, 4);
      c.fill();
      c.restore();
    }
    c.fillStyle = '#4b5563';
    c.beginPath();
    c.arc(0, 0, 5, 0, Math.PI * 2);
    c.fill();
  });
  const cone = canvasTex(64, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(30, 4);
    c.lineTo(34, 4);
    c.lineTo(62, 128);
    c.lineTo(2, 128);
    c.closePath();
    c.fill();
    const h = c.createRadialGradient(32, 5, 0, 32, 5, 9);
    h.addColorStop(0, 'rgba(255,255,255,1)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = h;
    c.fillRect(20, 0, 24, 16);
  });
  const sheen = canvasTex(64, 16, (c) => {
    const g = c.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 16);
  });
  return { dot, glow, puff, panels, lawn, asphalt, gravel, fan, cone, sheen };
}

/** Nameplate texture: a dark plate on two legs with an accent edge and one or two lines of text (painted once; no image files). Anchor at the bottom centre. */
export function plateTex(lines: string[], accent: string, w = 96, res = 3): Texture {
  const ph = lines.length > 1 ? 25 : 16;
  const legs = 8;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * res);
  c.height = Math.ceil((ph + legs) * res);
  const x = c.getContext('2d');
  if (x) {
    x.scale(res, res);
    x.fillStyle = '#6b7482';
    x.fillRect(10, ph - 1, 2.4, legs + 1);
    x.fillRect(w - 12.4, ph - 1, 2.4, legs + 1);
    x.fillStyle = 'rgba(8,12,18,0.94)';
    x.beginPath();
    x.roundRect(0.5, 0.5, w - 1, ph - 1, 2.5);
    x.fill();
    x.strokeStyle = 'rgba(170,184,204,0.75)';
    x.lineWidth = 0.8;
    x.stroke();
    x.fillStyle = accent;
    x.fillRect(2, 2, 2, ph - 4);
    x.textBaseline = 'middle';
    x.fillStyle = '#e6edf6';
    x.font = '700 9px "JetBrains Mono", monospace';
    x.fillText(lines[0], 8, lines.length > 1 ? 8 : ph / 2 + 0.3);
    if (lines[1]) {
      x.fillStyle = '#9fb0c4';
      x.font = '500 7px "JetBrains Mono", monospace';
      x.fillText(lines[1], 8, 18.2);
    }
  }
  return new Texture({ source: new CanvasSource({ resource: c, resolution: res }) });
}
