import { Texture } from 'pixi.js';
import { PV_ROW } from './model';

/** Procedural textures painted once on a 2D canvas: no image files are bundled. */
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) draw(ctx);
  return Texture.from(c);
}

export interface Textures {
  /** Soft round dot (energy particles). */
  dot: Texture;
  /** Wide radial glow (street lights, emissive halos, flashes). */
  glow: Texture;
  /** Exhaust / heat puff. */
  puff: Texture;
  /** One string row of PV modules; tinted per string brightness. */
  panels: Texture;
}

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
  // 15 modules x 2 cell rows, painted at 2x and tinted at draw time (white = full brightness).
  const k = 2;
  const panels = canvasTex(PV_ROW.w * k, PV_ROW.h * k, (c) => {
    c.scale(k, k);
    const mw = PV_ROW.w / 15;
    for (let m = 0; m < 15; m++) {
      for (let r = 0; r < 2; r++) {
        const x = m * mw;
        const y = r * (PV_ROW.h / 2);
        const g = c.createLinearGradient(x, y, x + mw, y + PV_ROW.h / 2);
        g.addColorStop(0, '#9fb7e8');
        g.addColorStop(1, '#6f8fd0');
        c.fillStyle = g;
        c.fillRect(x + 0.6, y + 0.6, mw - 1.2, PV_ROW.h / 2 - 1.2);
        c.strokeStyle = 'rgba(20,32,60,0.55)';
        c.lineWidth = 0.5;
        for (let i = 1; i < 4; i++) {
          c.beginPath();
          c.moveTo(x + 0.6 + (i * (mw - 1.2)) / 4, y + 0.6);
          c.lineTo(x + 0.6 + (i * (mw - 1.2)) / 4, y + PV_ROW.h / 2 - 0.6);
          c.stroke();
        }
      }
    }
    c.strokeStyle = 'rgba(8,14,28,0.9)';
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, PV_ROW.w - 1, PV_ROW.h - 1);
  });
  return { dot, glow, puff, panels };
}
