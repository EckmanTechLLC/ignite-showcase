import { Application, Container, Graphics, Rectangle, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import { BREWHOUSE, CELLAR, L } from './layout';
import { EQUIP, Equip } from './equip';
import { Flows } from './flows';
import { Steam } from './fx';
import { PackLine } from './line';
import { makeTextures } from './textures';
import { Vessel } from './vessel';
import type { Hover, Selection } from '../selection';

/** What the scene needs from the page. */
export interface SceneHooks {
  onHover: (h: Hover | null) => void;
  onSelect: (s: Selection | null) => void;
  getSelection: () => Selection | null;
  reduced: () => boolean;
}

export interface ScenePerf {
  backend: string;
  fps: number;
  p50: number;
  p95: number;
  drawCalls: number;
  sprites: number;
  objects: number;
}

export interface SceneHandle {
  destroy: () => void;
  resetCamera: () => void;
  perf: () => ScenePerf;
  backend: string;
}

/** World rectangle the camera fits to (pixels of the design layout). */
const WORLD = { x: 20, y: 74, w: 1650, h: 640 };

interface Entity {
  id: string;
  kind: 'vessel' | 'line' | 'util';
  root: Container;
  setSelected: (v: boolean) => void;
  setHovered: (v: boolean) => void;
  center: () => { x: number; y: number };
}

function platform(g: Graphics, x: number, y: number, w: number, h: number): void {
  g.roundRect(x, y + 9, w, h, 14).fill(0x060b12);
  g.roundRect(x, y, w, h, 14).fill({ color: 0x0c1520, alpha: 0.96 }).stroke({ color: 0x1f2f45, width: 1.5 });
}

export async function createScene(host: HTMLElement, hooks: SceneHooks): Promise<SceneHandle> {
  try {
    await Promise.all([document.fonts.load('700 12px "JetBrains Mono"'), document.fonts.load('500 12px "JetBrains Mono"')]);
  } catch {
    /* fonts are cosmetic */
  }
  const qs = new URLSearchParams(location.search);
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const app = new Application();
  await app.init({
    resizeTo: host,
    backgroundAlpha: 0,
    antialias: qs.has('aa'),
    resolution: dpr,
    autoDensity: true,
    preference: qs.get('renderer') === 'canvas' ? ['canvas'] : ['webgl', 'canvas'],
  });
  if (import.meta.env.DEV) (window as unknown as { __app: Application }).__app = app;
  const canvas = app.canvas as HTMLCanvasElement;
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  host.appendChild(canvas);
  const backend = app.renderer.name ?? 'unknown';
  const textRes = Math.min(4, Math.max(2, Math.ceil(dpr * 1.5)));
  const maxCacheRes = Math.max(1, Math.floor(Math.min(8192, (app.renderer as unknown as { texture?: { maxTextureSize?: number } }).texture?.maxTextureSize ?? 4096) / WORLD.w));
  const tex = makeTextures();

  // --- layers (inside the camera container) ---
  const cam = new Container();
  // The big static art (floors, pipe tubes, zone titles) is drawn once into a cached texture; the main target needs no
  // multisampling because every cached texture is antialiased when it is made.
  const back = new Container();
  const floor = new Graphics();
  const ground = new Container();
  const dots = new Container();
  const things = new Container();
  things.sortableChildren = true;
  const steam = new Steam(tex.puff);
  back.addChild(floor);
  cam.addChild(back, ground, dots, things, steam.layer);
  app.stage.addChild(cam);

  // --- floors ---
  platform(floor, 30, 92, 1020, 188);
  platform(floor, 1065, 92, 525, 188);
  platform(floor, 40, 288, 1040, 198);
  platform(floor, 60, 497, 640, 160);
  const q = [L(-6, -9), L(73, -9), L(73, 22), L(-6, 22)];
  const flat = (pts: { x: number; y: number }[], dy = 0) => pts.flatMap((p) => [p.x, p.y + dy]);
  floor.poly(flat(q, 9)).fill(0x060b12);
  floor.poly(flat(q)).fill({ color: 0x0c1520, alpha: 0.96 }).stroke({ color: 0x1f2f45, width: 1.5 });
  // faint tile grid on the packaging floor
  for (let x = -6; x <= 73; x += 7) {
    const a = L(x, -9);
    const b = L(x, 22);
    floor.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0x1a2738, width: 1, alpha: 0.6 });
  }
  for (let y = -9; y <= 22; y += 6.2) {
    const a = L(-6, y);
    const b = L(73, y);
    floor.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0x1a2738, width: 1, alpha: 0.6 });
  }
  const zoneLabel = (text: string, x: number, y: number) => {
    const t = new Text({ text, style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: '700', fill: 0x5f738c, letterSpacing: 3 }, resolution: textRes });
    t.position.set(x, y);
    back.addChild(t);
  };
  zoneLabel('BREWHOUSE', 46, 100);
  zoneLabel('UTILITIES', 1490, 100);
  zoneLabel('CELLAR', 952, 440);
  zoneLabel('BRIGHT TANKS', 590, 575);
  const lp = L(46, 20);
  zoneLabel('PACKAGING', lp.x, lp.y);

  // --- flows (pipes below the vessels) ---
  const flows = new Flows(back, ground, dots, tex.dot);
  back.cacheAsTexture({ resolution: Math.min(maxCacheRes, 2), antialias: true });

  // --- entities ---
  const entities: Entity[] = [];
  const vessels: Vessel[] = [];
  for (const spec of [...BREWHOUSE, ...CELLAR]) {
    const v = new Vessel(spec, { bubble: tex.bubble, textRes, cacheRes: textRes });
    vessels.push(v);
    things.addChild(v.root);
    entities.push({ id: spec.id, kind: 'vessel', root: v.root, setSelected: (s) => v.setSelected(s), setHovered: (s) => v.setHovered(s), center: () => v.center() });
  }
  const vesselLabels = new Set(vessels.map((v) => v.root.label));
  const equips: Equip[] = [];
  for (const spec of EQUIP) {
    const e = new Equip(spec, { textRes, cacheRes: textRes });
    equips.push(e);
    things.addChild(e.root);
    entities.push({ id: spec.id, kind: spec.kind, root: e.root, setSelected: (s) => e.setSelected(s), setHovered: (s) => e.setHovered(s), center: () => e.center() });
  }
  const line = new PackLine({ can: tex.can, textRes, cacheRes: textRes });
  things.addChild(line.root);
  for (const m of line.machines) {
    entities.push({ id: m.id, kind: 'line', root: m.root, setSelected: (s) => m.setSelected(s), setHovered: (s) => m.setHovered(s), center: () => m.center() });
  }

  // --- pointer: hover, select ---
  let dragMoved = false;
  let dragging = false;
  let hoverKey = '';
  const toClient = (e: FederatedPointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + e.global.x, y: r.top + e.global.y };
  };
  for (const ent of entities) {
    const { root } = ent;
    const hv = (e: FederatedPointerEvent) => {
      if (dragging) return;
      const c = toClient(e);
      hoverKey = `${ent.kind}:${ent.id}`;
      hooks.onHover({ kind: ent.kind, id: ent.id, x: c.x, y: c.y });
    };
    root.on('pointerover', (e: FederatedPointerEvent) => {
      ent.setHovered(true);
      hv(e);
    });
    root.on('pointermove', hv);
    root.on('pointerout', () => {
      ent.setHovered(false);
      if (hoverKey === `${ent.kind}:${ent.id}`) {
        hoverKey = '';
        hooks.onHover(null);
      }
    });
    root.on('pointertap', () => {
      if (dragMoved) return;
      hooks.onSelect({ kind: ent.kind, id: ent.id } as Selection);
    });
  }
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointertap', (e: FederatedPointerEvent) => {
    if (e.target === app.stage && !dragMoved) hooks.onSelect(null);
  });

  // --- camera ---
  const camState = { zoom: 1, panX: 0, panY: 0, lastInput: -1e9 };
  let fit = 1;
  const placeCamera = (t: number): void => {
    const w = app.screen.width;
    const h = app.screen.height;
    fit = Math.min(w / WORLD.w, h / WORLD.h) * 0.97;
    const idle = !hooks.reduced() && t - camState.lastInput > 8;
    const ease = idle ? Math.min(1, (t - camState.lastInput - 8) / 4) : 0;
    const dx = Math.sin(t * 0.09) * 9 * ease;
    const dy = Math.cos(t * 0.07) * 5 * ease;
    const dz = 1 + Math.sin(t * 0.05) * 0.012 * ease;
    const s = fit * camState.zoom * dz;
    const cx = WORLD.x + WORLD.w / 2;
    const cy = WORLD.y + WORLD.h / 2;
    cam.scale.set(s);
    cam.position.set(w / 2 - cx * s + camState.panX + dx, h / 2 - cy * s + camState.panY + dy);
  };
  const resetCamera = (): void => {
    camState.zoom = 1;
    camState.panX = 0;
    camState.panY = 0;
    camState.lastInput = -1e9;
  };
  let downX = 0;
  let downY = 0;
  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    dragging = true;
    dragMoved = false;
    downX = e.clientX;
    downY = e.clientY;
  };
  const onMove = (e: PointerEvent): void => {
    if (!dragging) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (!dragMoved && Math.hypot(dx, dy) > 4) {
      dragMoved = true;
      hooks.onHover(null);
      canvas.style.cursor = 'grabbing';
    }
    if (dragMoved) {
      camState.panX += e.clientX - downX;
      camState.panY += e.clientY - downY;
      downX = e.clientX;
      downY = e.clientY;
      camState.lastInput = performance.now() / 1000;
    }
  };
  const onUp = (): void => {
    dragging = false;
    canvas.style.cursor = '';
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const s1 = cam.scale.x;
    const wx = (mx - cam.x) / s1;
    const wy = (my - cam.y) / s1;
    const z = Math.min(4, Math.max(0.7, camState.zoom * Math.exp(-e.deltaY * 0.0016)));
    const s2 = (s1 / camState.zoom) * z;
    // keep the world point under the cursor where it is
    camState.panX += mx - wx * s2 - cam.x;
    camState.panY += my - wy * s2 - cam.y;
    camState.zoom = z;
    camState.lastInput = performance.now() / 1000;
  };
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // --- draw-call counting (WebGL only) ---
  let drawCount = 0;
  const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext | WebGLRenderingContext }).gl;
  if (gl) {
    for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'] as const) {
      const orig = (gl as unknown as Record<string, (...a: unknown[]) => unknown>)[fn];
      if (typeof orig !== 'function') continue;
      (gl as unknown as Record<string, unknown>)[fn] = (...a: unknown[]) => {
        drawCount++;
        return orig.apply(gl, a);
      };
    }
  }

  // --- frame loop ---
  const frames: number[] = [];
  let lastNow = performance.now();
  let frameCount = 0;
  let lastDraw = 0;
  let lastFrameCount = 0;
  let clock = 0;
  let wasReduced = false;
  let selKey = '';
  app.ticker.add(() => {
    const now = performance.now();
    const ms = now - lastNow;
    lastNow = now;
    frames.push(ms);
    if (frames.length > 240) frames.shift();
    frameCount++;
    const dt = Math.min(0.1, ms / 1000);
    clock += dt;
    const reduced = hooks.reduced();
    if (reduced && !wasReduced) steam.clear();
    wasReduced = reduced;

    // selection highlight (a selected batch lights the vessel that holds it)
    const sel = hooks.getSelection();
    const sk = sel ? `${sel.kind}:${sel.id}` : '';
    if (sk !== selKey) {
      selKey = sk;
      for (const e of entities) if (!vesselLabels.has(e.id)) e.setSelected(`${e.kind}:${e.id}` === sk);
    }
    const batchSel = sel?.kind === 'batch' ? sel.id : '';

    for (const v of vessels) {
      v.setSelected(sk === `vessel:${v.root.label}` || (batchSel !== '' && v.batch === batchSel));
      v.update(clock, dt, reduced);
      if (v.steamRate > 0) {
        const p = v.steamPoint();
        steam.emit(v.root.label, p.x, p.y, v.steamRate, dt);
      }
    }
    for (const e of equips) e.update(clock, reduced);
    line.update(clock, dt, reduced);
    flows.update(dt, reduced);
    steam.update(dt);
    placeCamera(clock);
  });

  const onResize = (): void => {
    app.stage.hitArea = new Rectangle(0, 0, app.screen.width, app.screen.height);
  };
  app.renderer.on('resize', onResize);
  placeCamera(0);

  return {
    backend,
    resetCamera,
    perf: () => {
      const sorted = [...frames].sort((a, b) => a - b);
      const sum = frames.reduce((a, b) => a + b, 0);
      const draws = drawCount - lastDraw;
      const fr = Math.max(1, frameCount - lastFrameCount);
      lastDraw = drawCount;
      lastFrameCount = frameCount;
      let sprites = 0;
      let objects = 0;
      const walk = (c: Container): void => {
        for (const ch of c.children) {
          if (!ch.visible) continue;
          objects++;
          if (ch instanceof Sprite) sprites++;
          if (ch instanceof Container) walk(ch);
        }
      };
      walk(cam);
      return {
        backend,
        fps: sum > 0 ? (1000 * frames.length) / sum : 0,
        p50: sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0,
        p95: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0,
        drawCalls: gl ? Math.round(draws / fr) : -1,
        sprites,
        objects,
      };
    },
    destroy: () => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      app.renderer.off('resize', onResize);
      app.destroy(true, { children: true, texture: true });
    },
  };
}
