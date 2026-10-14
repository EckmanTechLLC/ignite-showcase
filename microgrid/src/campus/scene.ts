import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture, type FederatedPointerEvent } from 'pixi.js';
import { BESS, BESS_IDS, BLDG, BLDG_IDS, BLDG_TOP, CHARGERS, COLOR, COS, EV_LOT, GENSET, LEADS, PV_ARRAYS, SUBSTATION, TREE_R, VIEW, WORLD, bayRect, makeTrees, treeClass, project, projBox, pvFieldRect, type Rect } from './model';
import { BessUnit, BuildingActor, EvLot, GensetUnit, PvField, StreetLights, Substation, type Ctx } from './actors';
import { buildGround, treeTexture } from './art';
import { makeCloudFilter } from './cloud';
import { Flows } from './flows';
import { sample } from './read';
import { clamp, gradeOf, packRgb, shadowPoly, sunOf, type Caster } from './sky';
import { makeTextures, plateTex } from './textures';
import type { Target } from '../selection.svelte';

/** What the scene needs from the page. */
export interface SceneHooks {
  onHover: (t: Target | null, x: number, y: number) => void;
  onSelect: (t: Target | null) => void;
  getSelection: () => Target | null;
  reduced: () => boolean;
  /** Screen area covered by the HUD (left rail, top band): the map is fitted to the rest. */
  insets: () => { left: number; top: number; right: number; bottom: number };
}

export interface ScenePerf {
  backend: string;
  fps: number;
  p50: number;
  p95: number;
  drawCalls: number;
  sprites: number;
  particles: number;
  objects: number;
}

export interface SceneHandle {
  destroy: () => void;
  resetCamera: () => void;
  perf: () => ScenePerf;
  backend: string;
}

interface Entity {
  target: Target;
  bounds: Rect;
  lead?: string;
}

const key = (t: Target | null): string => (t ? `${t.kind}:${t.id}` : '');

export async function createScene(host: HTMLElement, hooks: SceneHooks): Promise<SceneHandle> {
  try {
    await Promise.all([document.fonts.load('700 12px "JetBrains Mono"'), document.fonts.load('500 12px "JetBrains Mono"')]);
  } catch {
    /* fonts are cosmetic */
  }
  const qs = new URLSearchParams(location.search);
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const app = new Application();
  await app.init({
    resizeTo: host,
    background: 0x0b1410,
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
  const hasFilters = backend === 'webgl';
  const textRes = Math.min(3, Math.max(2, Math.ceil(dpr * 1.5)));
  const maxTex = (app.renderer as unknown as { texture?: { maxTextureSize?: number } }).texture?.maxTextureSize ?? 4096;
  const cacheRes = Math.max(1, Math.min(2, Math.floor(maxTex / (WORLD.w + 40)), dpr));
  const tex = makeTextures();

  // --- layers. cam: the world; camFx: additive lights above the colour grade; camUi: labels, halo and hit areas.
  const cam = new Container();
  const camFx = new Container();
  const camUi = new Container();
  const lawn = new Graphics().rect(-3000, -3000, 7600, 6900).fill(0x1c3a25);
  const ground = buildGround(tex);
  const flows = new Flows(tex.dot);
  const shadowG = new Graphics();
  const world = new Container(); // everything standing on the ground, depth-sorted by its south edge
  world.sortableChildren = true;
  cam.addChild(lawn, ground, shadowG, world);
  camFx.addChild(flows.layer); // streams stay vivid under the night grade
  // buried conductors disappear behind the tall assets standing over them (stencil mask, WebGL only)
  if (hasFilters) {
    const occ = new Graphics();
    for (const [i, b] of BLDG.entries()) {
      const r = projBox(b, BLDG_TOP[i] + 3);
      occ.rect(r.x, r.y, r.w, r.h);
    }
    for (const b of BESS) {
      const r = projBox(b, 30);
      occ.rect(r.x, r.y, r.w, r.h);
    }
    const g = projBox(GENSET, 34);
    occ.rect(g.x, g.y, g.w, g.h).fill(0xffffff);
    occ.alpha = 0.002; // a stencil mask ignores colour and alpha; it only has to stay in the scene graph so the camera moves it
    camFx.addChild(occ);
    flows.layer.setMask({ mask: occ, inverse: true });
  }
  ground.cacheAsTexture({ resolution: cacheRes, antialias: true });
  const stat = <T extends Container>(c: T): T => {
    c.cacheAsTexture({ resolution: cacheRes, antialias: true });
    return c;
  };
  const plates = new Map<string, Texture>();
  const ctx: Ctx = {
    tex,
    res: textRes,
    world,
    fx: camFx,
    ui: camUi,
    stat,
    plate: (lines, accent, w = 96) => {
      const k = `${lines.join('|')}|${accent}|${w}`;
      let t = plates.get(k);
      if (!t) {
        t = plateTex(lines, accent, w, textRes);
        plates.set(k, t);
      }
      return t;
    },
  };
  const trees = makeTrees();
  const treeTex = new Map<string, ReturnType<typeof treeTexture>>();
  const TONES = [0xffffff, 0xe3f1dc, 0xf1ecd6];
  for (const t of trees) {
    const cls = treeClass(t.r);
    const k = `${t.kind}-${cls}`;
    let tt = treeTex.get(k);
    if (!tt) {
      tt = treeTexture(app.renderer, t.kind, cls);
      treeTex.set(k, tt);
    }
    const sp = new Sprite(tt.tex);
    sp.anchor.set(tt.ax, tt.ay);
    const p = project(t.x, t.y);
    sp.position.set(p.x, p.y);
    sp.scale.set(t.r / TREE_R[cls]);
    sp.tint = TONES[t.tone];
    sp.zIndex = t.y;
    world.addChild(sp);
  }

  const grade = new Graphics().rect(0, 0, 10, 10).fill(0xffffff);
  grade.blendMode = 'multiply';
  const cloud = hasFilters ? makeCloudFilter() : null;
  const cloudSprite = new Sprite(Texture.WHITE);
  if (cloud) cloudSprite.filters = [cloud.filter];
  cloudSprite.visible = !!cloud;
  const dipG = new Graphics().rect(0, 0, 10, 10).fill(0x000000);
  dipG.alpha = 0;
  dipG.visible = false;
  app.stage.addChild(cam, grade, camFx, cloudSprite, dipG, camUi);

  // --- actors
  const pv = PV_ARRAYS.map((_, i) => new PvField(i, ctx));
  const bess = BESS_IDS.map((_, i) => new BessUnit(i, ctx));
  const gen = new GensetUnit(ctx);
  const ev = new EvLot(ctx);
  const blds = BLDG_IDS.map((_, i) => new BuildingActor(i, ctx));
  const sub = new Substation(ctx);
  const lights = new StreetLights(ctx, app.renderer);
  const staticCasters: Caster[] = [
    ...pv.flatMap((a) => a.casters()),
    ...bess.flatMap((a) => a.casters()),
    ...gen.casters(),
    ...blds.flatMap((a) => a.casters()),
    ...sub.casters(),
    ...trees.map((t): Caster => ({ kind: 'disc', x: t.x, y: t.y, r: t.r, h: t.r * 1.5 + 8 })),
  ];

  // --- hover kW tag (numbers on hover only)
  const kwTag = new Text({ text: '', style: { fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x05080d, width: 4 } }, resolution: textRes });
  kwTag.anchor.set(0.5);
  kwTag.visible = false;
  const halo = new Graphics();

  // --- entities (hit areas)
  const evb = projBox({ x: EV_LOT.x - 8, y: EV_LOT.y - 8, w: EV_LOT.w + 16, h: EV_LOT.h + 16 }, 30);
  const entities: Entity[] = [
    { target: { kind: 'evbank', id: '' }, bounds: evb, lead: 'EV' },
    ...PV_ARRAYS.map((id, i): Entity => ({ target: { kind: 'pv', id }, bounds: projBox(pvFieldRect(i), 14), lead: id })),
    ...BESS.map((b): Entity => ({ target: { kind: 'bess', id: b.id }, bounds: projBox(b, 30), lead: b.id })),
    { target: { kind: 'genset', id: '' }, bounds: projBox(GENSET, 34), lead: 'GEN' },
    ...BLDG.map((b, i): Entity => ({ target: { kind: 'bldg', id: b.id }, bounds: projBox(b, BLDG_TOP[i] + 3), lead: `L${b.id}` })),
    { target: { kind: 'grid', id: '' }, bounds: projBox({ x: SUBSTATION.x, y: SUBSTATION.y, w: SUBSTATION.w + 60, h: SUBSTATION.h }, 30), lead: 'LINK' },
    ...CHARGERS.map((id, i): Entity => ({ target: { kind: 'charger', id }, bounds: projBox(bayRect(i), 12), lead: 'EV' })),
  ];
  camUi.addChild(halo);
  let dragMoved = false;
  let dragging = false;
  let hoverKey = '';
  let hoverEnt: Entity | null = null;
  for (const ent of entities) {
    const c = new Container();
    c.hitArea = new Rectangle(ent.bounds.x, ent.bounds.y, ent.bounds.w, ent.bounds.h);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    const move = (e: FederatedPointerEvent) => {
      if (dragging) return;
      const r = canvas.getBoundingClientRect();
      hoverKey = key(ent.target);
      hoverEnt = ent;
      hooks.onHover(ent.target, r.left + e.global.x, r.top + e.global.y);
    };
    c.on('pointerover', move);
    c.on('pointermove', move);
    c.on('pointerout', () => {
      if (hoverKey === key(ent.target)) {
        hoverKey = '';
        hoverEnt = null;
        hooks.onHover(null, 0, 0);
      }
    });
    c.on('pointertap', () => {
      if (!dragMoved) hooks.onSelect(ent.target);
    });
    camUi.addChild(c);
  }
  camUi.addChild(kwTag);
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointertap', (e: FederatedPointerEvent) => {
    if (e.target === app.stage && !dragMoved) hooks.onSelect(null);
  });

  // --- camera
  const camState = { zoom: 1, panX: 0, panY: 0, lastInput: -1e9 };
  const placeCamera = (t: number): void => {
    const w = app.screen.width;
    const h = app.screen.height;
    const ins = hooks.insets();
    const aw = Math.max(200, w - ins.left - ins.right);
    const ah = Math.max(200, h - ins.top - ins.bottom);
    const fit = Math.min(aw / VIEW.w, ah / VIEW.h) * 0.98;
    const idle = !hooks.reduced() && t - camState.lastInput > 8;
    const ease = idle ? Math.min(1, (t - camState.lastInput - 8) / 4) : 0;
    const dx = Math.sin(t * 0.09) * 8 * ease;
    const dy = Math.cos(t * 0.07) * 5 * ease;
    const dz = 1 + Math.sin(t * 0.05) * 0.01 * ease;
    const s = fit * camState.zoom * dz;
    const ox = ins.left + aw / 2 - (VIEW.x + VIEW.w / 2) * s + camState.panX + dx;
    const oy = ins.top + ah / 2 - (VIEW.y + VIEW.h / 2) * s + camState.panY + dy;
    for (const c of [cam, camFx, camUi]) {
      c.scale.set(s);
      c.position.set(ox, oy);
    }
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
      hooks.onHover(null, 0, 0);
      canvas.style.cursor = 'grabbing';
    }
    if (dragMoved) {
      camState.panX += dx;
      camState.panY += dy;
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
    const z = Math.min(4, Math.max(0.6, camState.zoom * Math.exp(-e.deltaY * 0.0016)));
    const s2 = (s1 / camState.zoom) * z;
    // the fitted origin moves with the scale (it centres the view), so the pan has to absorb that too
    camState.panX += mx - wx * s2 - cam.x + (VIEW.x + VIEW.w / 2) * (s2 - s1);
    camState.panY += my - wy * s2 - cam.y + (VIEW.y + VIEW.h / 2) * (s2 - s1);
    camState.zoom = z;
    camState.lastInput = performance.now() / 1000;
  };
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // --- draw-call counting (WebGL only)
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

  // --- frame loop
  const frames: number[] = [];
  let lastNow = performance.now();
  let frameCount = 0;
  let lastDraw = 0;
  let lastFrameCount = 0;
  let clock = 0;
  let hovShown = '';
  let shadowHour = Number.NaN;
  let shadowMask = -1;
  let sizeKey = '';
  let lastDrift = 0;
  let snapReady = false;

  const redrawHalo = (): void => {
    const sel = hooks.getSelection();
    const sk = key(sel);
    const hk = hoverKey;
    const k = `${sk}|${hk}`;
    if (k === hovShown) return;
    hovShown = k;
    halo.clear();
    const draw = (t: Target | null, color: number, width: number, alpha: number) => {
      const ent = t ? entities.find((e) => key(e.target) === key(t)) : null;
      if (!ent) return;
      const b = ent.bounds;
      halo.roundRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8, 6).stroke({ color, width, alpha });
    };
    if (hk && hk !== sk) draw(entities.find((e) => key(e.target) === hk)?.target ?? null, 0xffffff, 1.5, 0.6);
    draw(sel, COLOR.accent, 3, 0.95);
  };

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
    const s = sample();
    snapReady = snapReady || Number.isFinite(s.hour);

    // sky: sun, grade, shadows
    const sun = sunOf(s.hour, s.elev, s.cloud);
    const g = gradeOf(Number.isFinite(s.elev) ? s.elev : 40);
    grade.tint = packRgb(g);
    grade.visible = g.r < 0.995 || g.g < 0.995 || g.b < 0.995; // full daylight: no grading pass at all
    const w = app.screen.width;
    const h = app.screen.height;
    const sk = `${w}x${h}`;
    if (sk !== sizeKey) {
      sizeKey = sk;
      grade.width = w;
      grade.height = h;
      dipG.width = w;
      dipG.height = h;
      cloudSprite.width = w;
      cloudSprite.height = h;
    }
    const step = reduced ? 0.5 : 0.012;
    const mask = ev.mask();
    if (snapReady && (!(Math.abs(s.hour - shadowHour) < step) || mask !== shadowMask)) {
      shadowHour = s.hour;
      shadowMask = mask;
      shadowG.clear();
      if (sun.elev > 0.5) {
        const all = [...staticCasters, ...ev.casters()];
        for (const c of all) {
          const pts = shadowPoly(c, sun);
          for (let i = 1; i < pts.length; i += 2) pts[i] *= COS; // ground plane -> screen
          shadowG.poly(pts).fill(0x03060b);
        }
      }
    }
    shadowG.alpha = sun.alpha;

    // actors
    pv.forEach((a) => a.update(s, clock, dt, sun));
    bess.forEach((a) => a.update(s, clock, dt, reduced));
    gen.update(s, clock, dt, reduced);
    ev.update(s, clock, dt, reduced);
    blds.forEach((a) => a.update(s, sun.night, dt, reduced));
    sub.update(s, dt, reduced);
    lights.update(sun.night);
    dipG.alpha = sub.dipLevel * 0.55;
    dipG.visible = dipG.alpha > 0.004;

    // flows
    flows.setTargets(s);
    flows.update(dt, reduced);

    // clouds: time freezes under reduced motion, coverage still follows Cloudiness
    if (cloud) {
      if (!reduced) lastDrift = clock;
      const day = Number.isFinite(s.elev) ? 1 - sun.night : 1;
      cloudSprite.visible = day > 0.03; // no cloud shadows at night: skip the pass
      cloud.set(cam.scale.x, cam.x, cam.y, lastDrift, w, h, Number.isFinite(s.cloud) ? s.cloud : 0, day, 9 + 14 * clamp(s.cloud), 3.5);
    }

    // hover kW label on the asset's conductor
    if (hoverEnt?.lead) {
      const lead = LEADS[hoverEnt.lead];
      const kw = flows.kw(hoverEnt.lead);
      const mid = lead ? lead[Math.floor((lead.length - 1) / 2)] : { x: SUBSTATION.x + SUBSTATION.w + 40, y: SUBSTATION.y + 55 };
      const nxt = lead ? lead[Math.floor((lead.length - 1) / 2) + 1] : mid;
      const kp = project((mid.x + nxt.x) / 2, (mid.y + nxt.y) / 2);
      kwTag.position.set(kp.x + (lead ? 26 : 0), kp.y);
      kwTag.text = `${Math.abs(kw).toFixed(0)} kW`;
      kwTag.visible = true;
    } else kwTag.visible = false;

    redrawHalo();
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
      walk(app.stage);
      return {
        backend,
        fps: sum > 0 ? (1000 * frames.length) / sum : 0,
        p50: sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0,
        p95: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0,
        drawCalls: gl ? Math.round(draws / fr) : -1,
        sprites,
        particles: flows.active,
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
