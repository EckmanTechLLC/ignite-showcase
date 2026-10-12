import * as THREE from 'three';

/** Procedural textures drawn on canvases at start-up. No image files, no network. */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = 1, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  return t;
}

/** Concrete slab: mottled grey with panel seams. Returns [colour map, roughness map]. */
export function concreteTextures(repeat: number): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const size = 512;
  const r = rng(7);
  const [c, g] = canvas(size);
  const [rc, rg] = canvas(size);
  g.fillStyle = '#7b8088';
  g.fillRect(0, 0, size, size);
  rg.fillStyle = '#b4b4b4';
  rg.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const x = r() * size;
    const y = r() * size;
    const s = 1 + r() * 5;
    const v = Math.floor(100 + r() * 60);
    g.fillStyle = `rgba(${v},${v + 2},${v + 8},${0.05 + r() * 0.12})`;
    g.fillRect(x, y, s, s);
    const rv = Math.floor(150 + r() * 90);
    rg.fillStyle = `rgba(${rv},${rv},${rv},0.1)`;
    rg.fillRect(x, y, s, s);
  }
  // large stains
  for (let i = 0; i < 14; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 30 + r() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(20,22,28,0.18)');
    gr.addColorStop(1, 'rgba(20,22,28,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // seams
  g.strokeStyle = 'rgba(25,28,34,0.75)';
  g.lineWidth = 2;
  rg.strokeStyle = 'rgba(255,255,255,0.9)';
  rg.lineWidth = 3;
  for (const p of [0, size / 2]) {
    for (const ctx of [g, rg]) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
  }
  return [tex(c, repeat), tex(rc, repeat, false)];
}

/** Rough dark ground (gravel / soil). */
export function groundTexture(repeat: number): THREE.CanvasTexture {
  const size = 512;
  const r = rng(21);
  const [c, g] = canvas(size);
  g.fillStyle = '#3a414a';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 16000; i++) {
    const v = Math.floor(30 + r() * 50);
    g.fillStyle = `rgba(${v},${v + 3},${v + 6},${0.1 + r() * 0.3})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 3, 1 + r() * 3);
  }
  return tex(c, repeat);
}

/** Asphalt strip with a dashed centre line (u along the strip). */
export function roadTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  g.fillStyle = '#23272e';
  g.fillRect(0, 0, 256, 256);
  const r = rng(5);
  for (let i = 0; i < 4000; i++) {
    const v = Math.floor(30 + r() * 30);
    g.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  g.fillStyle = '#c9b45a';
  g.fillRect(0, 124, 120, 8);
  g.fillStyle = '#6d727b';
  g.fillRect(0, 0, 256, 6);
  g.fillRect(0, 250, 256, 6);
  const t = tex(c, 1);
  return t;
}

/** Soft round sprite: white core fading to transparent. */
export function glowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.7)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Cloudy puff used by smoke / vapour particles (sum of random soft blobs). */
export function puffTexture(seed = 3): THREE.CanvasTexture {
  const size = 128;
  const r = rng(seed);
  const [c, g] = canvas(size);
  g.clearRect(0, 0, size, size);
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 26;
    const x = 64 + Math.cos(a) * d;
    const y = 64 + Math.sin(a) * d;
    const rad = 14 + r() * 24;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255,255,255,${0.12 + r() * 0.12})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
  }
  // edge falloff so sprites never show a square
  const fall = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  fall.addColorStop(0, 'rgba(0,0,0,0)');
  fall.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = fall;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Thin water streak for deluge droplets. */
export function dropTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(32);
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
