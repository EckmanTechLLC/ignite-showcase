import * as THREE from 'three';
import { rng } from './gfx';

// Procedural canvas textures (no external assets): perforated doors, server fronts, louvres, floor tiles, hazard
// stripes, wall panels, brushed metal, and the atlases for nameplates, rack plates and the live status displays.

type Ctx = CanvasRenderingContext2D;
const canvas = (w: number, h: number): [HTMLCanvasElement, Ctx] => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
};
function tex(c: HTMLCanvasElement, opts: { srgb?: boolean; repeat?: boolean; aniso?: number } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = opts.aniso ?? 8;
  return t;
}

const hexPath = (g: Ctx, cx: number, cy: number, r: number) => {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
};

/** Perforated rack door (0.56 x 1.96 m): hex mesh punched out as alpha, solid frame and a vertical handle. */
export function perfDoorTexture(rear = false): THREE.CanvasTexture {
  const W = 256;
  const H = 896;
  const [c, g] = canvas(W, H);
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#9aa5b2');
  grad.addColorStop(0.5, '#c4ccd6');
  grad.addColorStop(1, '#8c97a4');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  const p = 11;
  const dy = p * 0.866;
  for (let row = 0, y = 26; y < H - 22; row++, y += dy) {
    for (let x = 22 + (row & 1) * (p / 2); x < W - 18; x += p) {
      // keep the handle strip and (rear) the two fan grills solid
      if (Math.abs(x - W * 0.86) < 14) continue;
      if (rear && ((x - 128) ** 2 + (y - 300) ** 2 < 100 ** 2 || (x - 128) ** 2 + (y - 620) ** 2 < 100 ** 2)) continue;
      hexPath(g, x, y, p * 0.46);
      g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  // fan grills on the rear door: concentric rings + spokes on a dark disc
  if (rear) {
    for (const cy of [300, 620]) {
      g.fillStyle = '#10151b';
      g.beginPath();
      g.arc(128, cy, 92, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#7e8997';
      g.lineWidth = 3;
      for (const r of [20, 44, 68, 88]) {
        g.beginPath();
        g.arc(128, cy, r, 0, Math.PI * 2);
        g.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath();
        g.moveTo(128 + Math.cos(a) * 14, cy + Math.sin(a) * 14);
        g.lineTo(128 + Math.cos(a) * 90, cy + Math.sin(a) * 90);
        g.stroke();
      }
    }
  }
  // frame and handle
  g.fillStyle = '#6f7a88';
  g.fillRect(0, 0, W, 14);
  g.fillRect(0, H - 14, W, 14);
  g.fillRect(0, 0, 12, H);
  g.fillRect(W - 12, 0, 12, H);
  g.fillStyle = '#2b323b';
  g.fillRect(W * 0.86 - 7, 380, 14, 150);
  g.fillStyle = '#d3dae3';
  g.fillRect(W * 0.86 - 3, 384, 4, 142);
  return tex(c, { aniso: 8 });
}

/** Server front bezel for 1U / 2U / 4U (0.48 m wide, 44.5 mm per U). */
export function serverFrontTexture(u: 1 | 2 | 4): THREE.CanvasTexture {
  const W = 1024;
  const H = 96 * u;
  const [c, g] = canvas(W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#454e5a');
  grad.addColorStop(0.08, '#2a313a');
  grad.addColorStop(1, '#1b2027');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // rack ears + screws
  g.fillStyle = '#58626f';
  g.fillRect(0, 0, 52, H);
  g.fillRect(W - 52, 0, 52, H);
  g.fillStyle = '#1a1e24';
  for (let k = 0; k < u; k++) for (const x of [26, W - 26]) for (const y of [20, 76]) {
    g.beginPath();
    g.arc(x, k * 96 + y, 7, 0, Math.PI * 2);
    g.fill();
  }
  const r = rng(u * 977);
  const bayRows = u === 1 ? 1 : u === 2 ? 2 : 3;
  const bays = u === 1 ? 4 : u === 2 ? 6 : 8;
  const bx0 = 90;
  const bw = (W - 2 * bx0 - 360) / bays;
  const bh = (H - 28) / bayRows;
  g.fillStyle = '#0c0f13';
  g.fillRect(bx0 - 6, 10, bays * bw + 12, H - 20);
  for (let rr = 0; rr < bayRows; rr++) {
    for (let b = 0; b < bays; b++) {
      const x = bx0 + b * bw + 4;
      const y = 14 + rr * bh + 4;
      g.fillStyle = '#39424e';
      g.fillRect(x, y, bw - 8, bh - 8);
      g.fillStyle = '#5b6674';
      g.fillRect(x + 6, y + (bh - 8) / 2 - 3, bw - 20, 6);
      g.fillStyle = r() > 0.2 ? '#1c8f50' : '#b7791f';
      g.fillRect(x + bw - 20, y + 5, 4, 4);
    }
  }
  // vent field (hex-ish slots) on the right, then a logo bar
  g.fillStyle = '#0a0d11';
  const vx = W - 52 - 340;
  for (let y = 16; y < H - 16; y += 14) for (let x = vx; x < W - 70; x += 18) g.fillRect(x + ((y / 14) & 1 ? 8 : 0), y, 11, 6);
  g.fillStyle = '#8a95a3';
  g.fillRect(bx0 + bays * bw + 20, H - 22, 90, 5);
  return tex(c, { aniso: 8 });
}

/** Top-of-rack switch front: 2 x 24 RJ45 ports plus 4 SFP cages (0.48 x 0.0445 m). */
export function torTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 96;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#20262e';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#58626f';
  g.fillRect(0, 0, 52, H);
  g.fillRect(W - 52, 0, 52, H);
  g.fillStyle = '#0a0d11';
  for (let row = 0; row < 2; row++) {
    for (let p = 0; p < 24; p++) {
      const x = 80 + p * 29 + (p >> 2) * 8;
      const y = 14 + row * 40;
      g.fillRect(x, y, 22, 30);
      g.fillStyle = '#7d8896';
      g.fillRect(x + 2, y + 2, 18, 3);
      g.fillStyle = '#0a0d11';
    }
  }
  for (let s = 0; s < 4; s++) {
    g.fillStyle = '#333c47';
    g.fillRect(830 + s * 40, 20, 32, 20);
    g.fillRect(830 + s * 40, 52, 32, 20);
    g.fillStyle = '#05070a';
    g.fillRect(834 + s * 40, 24, 24, 12);
    g.fillRect(834 + s * 40, 56, 24, 12);
  }
  return tex(c, { aniso: 8 });
}

/** Louvred filter grille (tileable). */
export function louvreTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#10151b';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    const grad = g.createLinearGradient(0, y, 0, y + 12);
    grad.addColorStop(0, '#aab4c0');
    grad.addColorStop(1, '#5b6572');
    g.fillStyle = grad;
    g.fillRect(0, y + 2, 256, 10);
    g.fillStyle = '#05070a';
    g.fillRect(0, y + 12, 256, 4);
  }
  return tex(c, { repeat: true });
}

/** Raised-floor tile (0.6 m, tileable): painted light grey with a bevelled edge. */
export function floorTileTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#6c7a8b';
  g.fillRect(0, 0, S, S);
  const r = rng(5);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.07)';
    g.fillRect(r() * S, r() * S, 2, 2);
  }
  g.fillStyle = '#4a5666';
  g.fillRect(0, 0, S, 6);
  g.fillRect(0, 0, 6, S);
  g.fillStyle = '#9bacbf';
  g.fillRect(6, 6, S - 6, 2);
  g.fillRect(6, 6, 2, S - 6);
  g.fillStyle = '#2b3542';
  for (const [x, y] of [[0, 0], [S - 8, 0], [0, S - 8], [S - 8, S - 8]]) g.fillRect(x, y, 8, 8);
  return tex(c, { repeat: true });
}

/** Perforated cold-aisle tile (0.6 m, tileable) with alpha holes: a 16 x 16 grid of round holes. */
export function perfTileTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#7d8a9a';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#4a5666';
  g.fillRect(0, 0, S, 6);
  g.fillRect(0, 0, 6, S);
  g.globalCompositeOperation = 'destination-out';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    g.beginPath();
    g.arc(8 + x * 16, 8 + y * 16, 5.2, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c, { repeat: true });
}

/** Yellow/black hazard stripes (tileable). */
export function hazardTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#16181b';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#e2b007';
  for (let k = -S; k < S * 2; k += 64) {
    g.beginPath();
    g.moveTo(k, S);
    g.lineTo(k + 32, S);
    g.lineTo(k + 32 + S, 0);
    g.lineTo(k + S, 0);
    g.fill();
  }
  return tex(c, { repeat: true });
}

/** Wall panel (1.2 x 1.7 m, tileable): seams, rivets and a skirting line. */
export function wallTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3d5068');
  grad.addColorStop(1, '#2f4157');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#1b2735';
  g.fillRect(0, 0, 3, 256);
  g.fillRect(0, 0, 256, 3);
  g.fillStyle = '#5a7088';
  g.fillRect(3, 3, 1, 253);
  g.fillRect(3, 3, 253, 1);
  g.fillStyle = '#516780';
  for (const y of [12, 244]) for (let x = 20; x < 256; x += 40) {
    g.beginPath();
    g.arc(x, y, 2.5, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c, { repeat: true });
}

/** Brushed steel: faint horizontal streaks (used as colour and roughness map). */
export function brushedTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#dcdcdc';
  g.fillRect(0, 0, 256, 256);
  const r = rng(11);
  for (let i = 0; i < 900; i++) {
    const v = 150 + r() * 105;
    g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.5)`;
    g.fillRect(r() * 256, r() * 256, 20 + r() * 120, 1);
  }
  return tex(c, { repeat: true, aniso: 4 });
}

/** Green "EXIT" sign face (emissive). */
export function exitTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 96);
  g.fillStyle = '#0c3a1e';
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#41ff8a';
  g.font = '800 62px ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('EXIT', 128, 52);
  g.strokeStyle = '#41ff8a';
  g.lineWidth = 4;
  g.strokeRect(5, 5, 246, 86);
  return tex(c);
}

/** Cell atlas: a grid of equal canvases drawn individually; uv rect per cell. */
export class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: Ctx;
  readonly texture: THREE.CanvasTexture;
  constructor(readonly cols: number, readonly rows: number, readonly cw: number, readonly ch: number) {
    [this.canvas, this.ctx] = canvas(cols * cw, rows * ch);
    this.texture = tex(this.canvas, { aniso: 8 });
  }
  /** Redraw one cell: `fn` draws in cell-local pixels (0..cw, 0..ch). */
  draw(i: number, fn: (g: Ctx, w: number, h: number) => void): void {
    const x = (i % this.cols) * this.cw;
    const y = Math.floor(i / this.cols) * this.ch;
    const g = this.ctx;
    g.save();
    g.beginPath();
    g.rect(x, y, this.cw, this.ch);
    g.clip();
    g.translate(x, y);
    g.clearRect(0, 0, this.cw, this.ch);
    fn(g, this.cw, this.ch);
    g.restore();
  }
  /** [u0, v0, u1, v1] of cell i (v up, three.js convention). */
  uv(i: number): [number, number, number, number] {
    const cx = i % this.cols;
    const cy = Math.floor(i / this.cols);
    return [cx / this.cols, 1 - (cy + 1) / this.rows, (cx + 1) / this.cols, 1 - cy / this.rows];
  }
  /** Remap a plane's 0..1 uv into cell i. */
  remap(g: THREE.BufferGeometry, i: number): THREE.BufferGeometry {
    const [u0, v0, u1, v1] = this.uv(i);
    const uv = g.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
    return g;
  }
}

/** Engraved-plate look for a nameplate cell: brushed light plate, dark text lines. */
export function drawPlate(g: Ctx, w: number, h: number, title: string, lines: string[]): void {
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#c3cad3');
  grad.addColorStop(1, '#939daa');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#59636f';
  g.lineWidth = 3;
  g.strokeRect(3, 3, w - 6, h - 6);
  g.fillStyle = '#4d5763';
  for (const [x, y] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]]) {
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#1a2028';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 30px ui-sans-serif, system-ui, sans-serif';
  g.fillText(title, w / 2, 28);
  g.font = '600 20px ui-monospace, "JetBrains Mono", monospace';
  const lh = (h - 56) / Math.max(1, lines.length);
  lines.forEach((l, i) => g.fillText(l, w / 2, 56 + lh * (i + 0.5)));
}
