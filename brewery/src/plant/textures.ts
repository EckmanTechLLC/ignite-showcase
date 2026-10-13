import { Texture } from 'pixi.js';

/** Procedural textures drawn once on a 2D canvas: no image files are bundled. */
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) draw(ctx);
  return Texture.from(c);
}

export interface Textures {
  dot: Texture;
  bubble: Texture;
  can: Texture;
  puff: Texture;
}

export function makeTextures(): Textures {
  const dot = canvasTex(16, 16, (c) => {
    const g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 16, 16);
  });
  const bubble = canvasTex(16, 16, (c) => {
    c.beginPath();
    c.arc(8, 8, 6, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.fill();
    c.lineWidth = 1.6;
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.stroke();
    c.beginPath();
    c.arc(6, 6, 1.6, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,1)';
    c.fill();
  });
  const can = canvasTex(10, 14, (c) => {
    c.fillStyle = '#e8eef6';
    c.beginPath();
    c.roundRect(1, 1, 8, 12, 2);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(6, 1, 3, 12);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillRect(2, 2, 1.6, 10);
  });
  const puff = canvasTex(48, 48, (c) => {
    const g = c.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 48, 48);
  });
  return { dot, bubble, can, puff };
}
