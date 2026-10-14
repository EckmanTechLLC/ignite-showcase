import * as THREE from 'three';
import { heatRgb } from '../heat';
import { ROW_NAMES, RACKS, RACK_D, RACK_H, RACK_W, type RackPos } from './geometry';
import { Batch, blinkMaterial, instanceGlow, rng } from './gfx';
import { clock, type Materials } from './materials';
import { S, refresh } from './sample';
import { Atlas, drawPlate, perfDoorTexture, serverFrontTexture, torTexture } from './textures';
import { setRgb } from './util';

const MAX_KW = 18;
const U = 0.0445;
const Y0 = 0.09; // bottom of U1
const FRONT = 0.4; // z of the server front face (local, front = +z)
const SRV_D = 0.78;
const SRV_W = 0.48;
const TOR_Y = Y0 + 40 * U + U / 2;
type RGB = [number, number, number];
const OFF: RGB = [30, 37, 48];
const WHITE: RGB = [255, 255, 255];

const mix3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale3 = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

function zzTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9db0c6';
  g.font = '700 46px ui-monospace, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('zz', 64, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Racks {
  group: THREE.Group;
  /** Invisible box instances whose instanceId + 1 is the rack number (raycast target). */
  pick: THREE.InstancedMesh;
  update(): void;
}

interface Unit {
  u: 1 | 2 | 4;
  y: number; // centre height (local)
}

/** Server stack of a rack: unit sizes from a seeded sequence, bottom-up, up to U38 (U39-40 cable management, U41 switch, U42 patch panel). */
function stack(seed: number): Unit[] {
  const r = rng(seed * 7919 + 13);
  const out: Unit[] = [];
  let used = 0;
  while (used < 38) {
    const x = r();
    let u: 1 | 2 | 4 = x < 0.3 ? 1 : x < 0.8 ? 2 : 4;
    if (used + u > 38) u = (38 - used >= 2 ? 2 : 1) as 1 | 2;
    out.push({ u, y: Y0 + (used + u / 2) * U });
    used += u;
  }
  return out;
}

/** Merge vertex-coloured indexed geometries (position, normal, color). */
function mergeColoured(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nVert = 0;
  for (const g of list) nVert += g.getAttribute('position').count;
  const pos = new Float32Array(nVert * 3);
  const nor = new Float32Array(nVert * 3);
  const colr = new Float32Array(nVert * 3);
  const idx: number[] = [];
  let off = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    pos.set(p.array as Float32Array, off * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, off * 3);
    colr.set(g.getAttribute('color').array as Float32Array, off * 3);
    for (const k of g.index!.array) idx.push(k + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  out.setIndex(idx);
  return out;
}

/**
 * 60 racks, all instanced: cabinet frame (posts, plinth, side panels with ribs, door frames, hinges), a perforated front
 * door and a rear door with fan grills (both alpha-punched, glowing with the inlet / outlet temperature), 1U/2U/4U
 * server units stacked by the rack's load, status and blinking data LEDs, a top-of-rack switch with port LEDs, side
 * cable bundles, a nameplate and the live strips (inlet temperature, kW bar, offline "zz").
 */
export function createRacks(m: Materials): Racks {
  const group = new THREE.Group();
  group.name = 'racks';
  const n = RACKS.length;

  // --- local-space geometry (front = +z) ---
  const f = new Batch();
  const hw = RACK_W / 2;
  f.box('frame', -hw, hw, 0, 0.07, -0.54, 0.54); // plinth
  f.box('frame', -hw, hw, 2.05, RACK_H, -0.55, 0.55); // top cap
  for (const s of [-1, 1]) {
    f.box('frame', s * (hw - 0.012), s * (hw + 0.004), 0.07, 2.05, -0.53, 0.53); // side panel
    for (let i = 0; i < 6; i++) f.box('frame', s * (hw + 0.002), s * (hw + 0.008), 0.25 + i * 0.3, 0.29 + i * 0.3, -0.42, 0.42); // embossed ribs
    for (const z of [-0.5, 0.5]) f.box('frame', s * (hw - 0.03), s * (hw - 0.012), 0.07, 2.05, z - 0.015, z + 0.015); // door posts
  }
  for (const z of [-0.55, 0.55]) {
    f.box('frame', -hw, hw, 0.07, 0.1, z - 0.012, z + 0.012);
    f.box('frame', -hw, hw, 2.02, 2.05, z - 0.012, z + 0.012);
    for (const s of [-1, 1]) for (const y of [0.3, 1.05, 1.8]) f.cyl('frame', s * (hw - 0.002), y, z + (z > 0 ? 0.012 : -0.012), 0.011, 0.07, 'y', 10); // hinges
  }
  for (const x of [-hw + 0.02, hw - 0.02]) for (const z of [-0.45, 0.45]) f.ball('frame', x, 2.075, z, 0.012, 8); // lifting eyes
  for (const x of [-0.26, 0.26]) for (const z of [-0.5, 0.5]) f.cyl('frame', x, 0.015, z, 0.03, 0.03, 'y', 12); // casters
  const frameGeo = f.geometry('frame')!;

  const inner = new Batch();
  for (const x of [-0.245, 0.245]) {
    inner.box('inner', x - 0.01, x + 0.01, Y0, 2.0, FRONT - 0.02, FRONT); // front mounting rails
    inner.box('inner', x - 0.01, x + 0.01, Y0, 2.0, -0.4, -0.38); // rear rails
  }
  for (const s of [-1, 1]) {
    inner.box('inner', s * 0.255 - 0.02, s * 0.255 + 0.02, 0.12, 1.75, -0.42, -0.36); // rack PDU strips
    inner.box('inner', s * 0.27 - 0.012, s * 0.27 + 0.012, 0.1, 1.86, 0.28, 0.34); // vertical cable manager
    for (let i = 0; i < 9; i++) inner.cyl('inner', s * 0.255, 0.3 + i * 0.18, -0.39, 0.012, 0.03, 'z', 8); // PDU outlets
    inner.tube('inner', { x: s * 0.262, y: 1.86, z: 0.3 }, { x: s * 0.262, y: 0.12, z: 0.3 }, 0.018, 8); // cable bundle
  }
  inner.box('inner', -hw + 0.02, hw - 0.02, Y0 + 41 * U, Y0 + 42 * U, 0.3, FRONT); // patch panel
  inner.box('inner', -SRV_W / 2, SRV_W / 2, Y0, Y0 + 38 * U, FRONT - 0.012, FRONT - 0.004); // blanking plate behind the server fronts (shows where a slot is empty)
  const innerGeo = inner.geometry('inner')!;

  // coloured patch cables (vertex colours)
  const cableCols: RGB[] = [[0.1, 0.45, 1], [1, 0.8, 0.1], [1, 0.45, 0.1], [0.2, 0.9, 0.4], [0.9, 0.2, 0.2], [0.7, 0.4, 1]];
  const cableGeos = cableCols.map((c, i) => {
    const s = i % 2 ? 1 : -1;
    const len = 1.6 - i * 0.12;
    const g = new THREE.CylinderGeometry(0.0055, 0.0055, len, 6, 1);
    g.translate(s * (0.236 + 0.009 * (i >> 1)), 0.12 + len / 2 + i * 0.06, 0.36);
    const cnt = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Array.from({ length: cnt }, () => c).flat()), 3));
    return g;
  });

  // --- instanced meshes ---
  const sd = (mesh: THREE.InstancedMesh, cast = false) => {
    mesh.frustumCulled = false;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    return mesh;
  };
  const frame = sd(new THREE.InstancedMesh(frameGeo, m.paint, n), true);
  const innerMesh = sd(new THREE.InstancedMesh(innerGeo, m.rubber, n));
  const cables = sd(new THREE.InstancedMesh(mergeColoured(cableGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), n));

  const doorGeo = new THREE.PlaneGeometry(RACK_W - 0.04, 1.96).translate(0, 1.07, 0.552);
  const rearGeo = new THREE.PlaneGeometry(RACK_W - 0.04, 1.96).rotateY(Math.PI).translate(0, 1.07, -0.552);
  const doorMat = instanceGlow(new THREE.MeshStandardMaterial({ map: perfDoorTexture(false), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.4 }), 0.2);
  const rearMat = instanceGlow(new THREE.MeshStandardMaterial({ map: perfDoorTexture(true), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.4 }), 0.14);
  const door = sd(new THREE.InstancedMesh(doorGeo, doorMat, n));
  const rear = sd(new THREE.InstancedMesh(rearGeo, rearMat, n));

  const tor = sd(new THREE.InstancedMesh(new THREE.BoxGeometry(SRV_W, U * 0.96, 0.3).translate(0, TOR_Y, FRONT - 0.15), new THREE.MeshStandardMaterial({ map: torTexture(), metalness: 0.5, roughness: 0.5 }), n));

  const strip = sd(new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 1.84, 0.006).translate(-hw + 0.016, 1.07, 0.56), new THREE.MeshBasicMaterial({ toneMapped: false }), n));
  const kwBar = sd(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.016, 0.006), new THREE.MeshBasicMaterial({ toneMapped: false }), n));
  const zz = sd(new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshBasicMaterial({ map: zzTexture(), transparent: true, toneMapped: false, depthWrite: false }), n));
  zz.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  kwBar.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // servers: three classes, one instance per unit of every rack
  const stacks = RACKS.map((r) => stack(r.n));
  const classes = ([1, 2, 4] as const).map((u) => {
    const list: { rack: number; unit: number }[] = [];
    stacks.forEach((st, rk) => st.forEach((s, ui) => s.u === u && list.push({ rack: rk, unit: ui })));
    const mat = instanceGlow(new THREE.MeshStandardMaterial({ map: serverFrontTexture(u), metalness: 0.55, roughness: 0.5 }), 0.55, true);
    const mesh = sd(new THREE.InstancedMesh(new THREE.BoxGeometry(SRV_W, u * U * 0.97, SRV_D), mat, list.length));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return { u, list, mesh };
  });
  const unitSlot = stacks.map((st) => st.map(() => ({ cls: 0, idx: 0 })));
  classes.forEach((c, ci) => c.list.forEach((e, i) => (unitSlot[e.rack][e.unit] = { cls: ci, idx: i })));

  // LEDs: [rack status x n][switch ports x 8n][server status per unit][server data per unit]
  const PORTS = 8;
  const unitCount = stacks.reduce((a, s) => a + s.length, 0);
  const ledCount = n + PORTS * n + unitCount * 2;
  const ledMat = blinkMaterial(new THREE.MeshBasicMaterial({ toneMapped: false }), clock);
  const ledGeo = new THREE.PlaneGeometry(1, 1);
  const blink = new Float32Array(ledCount * 2);
  ledGeo.setAttribute('aBlink', new THREE.InstancedBufferAttribute(blink, 2));
  const leds = sd(new THREE.InstancedMesh(ledGeo, ledMat, ledCount));
  leds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const ledPort = (rk: number, p: number) => n + rk * PORTS + p;
  const unitBase: number[] = [];
  {
    let acc = n + PORTS * n;
    stacks.forEach((st) => {
      unitBase.push(acc);
      acc += st.length;
    });
  }
  const ledStatus = (rk: number, ui: number) => unitBase[rk] + ui;
  const ledData = (rk: number, ui: number) => unitBase[rk] + ui + unitCount;

  // pick proxies (invisible)
  const pick = new THREE.InstancedMesh(new THREE.BoxGeometry(RACK_W, RACK_H, RACK_D).translate(0, RACK_H / 2, 0), new THREE.MeshBasicMaterial(), n);
  pick.visible = false;
  pick.frustumCulled = false;

  // static placement
  const mm = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0.0001, 0.0001, 0.0001);
  const col = new THREE.Color();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  RACKS.forEach((r, i) => {
    q.setFromAxisAngle(yAxis, r.face === 1 ? 0 : Math.PI);
    mm.compose(pos.set(r.x, 0, r.z), q, one);
    for (const o of [frame, innerMesh, cables, door, rear, tor, strip, pick]) o.setMatrixAt(i, mm);
    door.setColorAt(i, col.setRGB(0.5, 0.5, 0.5));
    rear.setColorAt(i, col.setRGB(0.5, 0.5, 0.5));
    strip.setColorAt(i, col.setRGB(0.3, 0.3, 0.3));
    kwBar.setColorAt(i, col.setRGB(0.9, 1, 1));
  });
  for (const o of [frame, innerMesh, cables, door, rear, tor, strip, pick]) o.instanceMatrix.needsUpdate = true;

  // nameplates: one merged mesh over a plate atlas ("Rnn", row letter, rating)
  const plates = new Atlas(8, 8, 128, 48);
  RACKS.forEach((r, i) => plates.draw(i, (g, w, h) => drawPlate(g, w, h, `${r.id} ${ROW_NAMES[r.row]}`, ['20 kW MAX'])));
  const pb = new Batch();
  RACKS.forEach((r, i) => {
    pb.at(r.x, r.z, r.face === 1 ? 0 : Math.PI, () => {
      const g = new THREE.PlaneGeometry(0.2, 0.075);
      g.translate(-0.065, 1.985, 0.5575);
      plates.remap(g, i);
      pb.add('plate', g);
    });
  });
  const plateMesh = new THREE.Mesh(pb.geometry('plate')!, new THREE.MeshStandardMaterial({ map: plates.texture, metalness: 0.6, roughness: 0.4 }));
  plateMesh.name = 'rack-plates';

  group.add(frame, innerMesh, cables, door, rear, tor, strip, kwBar, zz, leds, plateMesh, pick, ...classes.map((c) => c.mesh));

  // --- dynamic state ---
  const sig = new Array<string>(n).fill('');
  const place = (target: THREE.InstancedMesh, i: number, r: RackPos, lx: number, ly: number, lz: number, sx: number, sy: number, turn = true) => {
    pos.set(r.x + lx * r.face, ly, r.z + lz * r.face);
    q.setFromAxisAngle(yAxis, turn && r.face === -1 ? Math.PI : 0);
    sc.set(sx, sy, 1);
    target.setMatrixAt(i, mm.compose(pos, q, sc));
  };
  const hide = (target: THREE.InstancedMesh, i: number) => target.setMatrixAt(i, mm.compose(pos.set(0, -50, 0), q.identity(), zero));
  const setBlink = (i: number, hz: number, ph: number) => {
    blink[i * 2] = hz;
    blink[i * 2 + 1] = ph;
  };
  const rnd = rng(99);
  const phases = Array.from({ length: ledCount }, () => rnd());

  let version = -1;
  function update(): void {
    refresh();
    if (version === S.version) return;
    version = S.version;
    let dirty = false;
    RACKS.forEach((r, i) => {
      const offline = S.online[i] === 0;
      const inlet = S.inlet[i];
      const kw = offline || !Number.isFinite(S.kw[i]) ? 0 : S.kw[i];
      const s = `${offline ? 1 : 0}|${Math.round(kw * 2)}|${Math.round(inlet * 5)}|${Math.round(S.outlet[i] * 5)}`;
      if (s === sig[i]) return;
      sig[i] = s;
      dirty = true;
      const heat = heatRgb(inlet);
      const heatOut = heatRgb(S.outlet[i]);
      door.setColorAt(i, setRgb(col, offline ? OFF : scale3(heat, 0.9)));
      rear.setColorAt(i, setRgb(col, offline ? OFF : scale3(heatOut, 0.8)));
      strip.setColorAt(i, setRgb(col, offline ? OFF : heat));
      const fr = offline ? 0 : Math.min(1, Math.max(0.03, kw / MAX_KW));
      const len = 0.46 * fr;
      place(kwBar, i, r, -0.23 + len / 2, 1.93, 0.557, Math.max(len, 0.0001), 1, false);
      q.setFromAxisAngle(yAxis, r.face === 1 ? 0 : Math.PI);
      pos.set(r.x, 1.0, r.z + r.face * (RACK_D / 2 + 0.016));
      sc.setScalar(offline ? 1 : 0.0001);
      zz.setMatrixAt(i, mm.compose(pos, q, sc));
      // servers: filled share of the stack ~ load
      const st = stacks[i];
      const fill = offline ? 0.6 : Math.min(1, Math.max(0.3, kw / MAX_KW));
      const filled = Math.max(2, Math.round(fill * st.length));
      const tint = offline ? OFF : mix3(WHITE, heat, 0.22);
      const hz = 0.6 + (kw / MAX_KW) * 7;
      const warn = !offline && Number.isFinite(inlet) && inlet >= 27;
      const crit = !offline && Number.isFinite(inlet) && inlet >= 32;
      st.forEach((un, ui) => {
        const { cls, idx } = unitSlot[i][ui];
        const mesh = classes[cls].mesh;
        const on = ui < filled;
        if (on) {
          q.setFromAxisAngle(yAxis, r.face === 1 ? 0 : Math.PI);
          pos.set(r.x, un.y, r.z + (FRONT - SRV_D / 2) * r.face);
          mesh.setMatrixAt(idx, mm.compose(pos, q, one));
          mesh.setColorAt(idx, setRgb(col, tint));
        } else hide(mesh, idx);
        const ls = ledStatus(i, ui);
        const ld = ledData(i, ui);
        if (on && !offline) {
          place(leds, ls, r, -0.222, un.y, FRONT + 0.003, 0.009, 0.009);
          leds.setColorAt(ls, crit ? col.setRGB(1, 0.15, 0.1) : warn ? col.setRGB(1, 0.65, 0.1) : col.setRGB(0.15, 1, 0.3));
          setBlink(ls, 0, 0);
          place(leds, ld, r, -0.203, un.y, FRONT + 0.003, 0.007, 0.007);
          leds.setColorAt(ld, col.setRGB(0.3, 0.75, 1));
          setBlink(ld, hz * (0.7 + 0.6 * phases[ld]), phases[ld]);
        } else {
          hide(leds, ls);
          hide(leds, ld);
        }
      });
      for (let p = 0; p < PORTS; p++) {
        const lp = ledPort(i, p);
        if (offline) hide(leds, lp);
        else {
          place(leds, lp, r, -0.2 + p * 0.047, TOR_Y + (p & 1 ? -0.006 : 0.006), FRONT + 0.003, 0.007, 0.007);
          leds.setColorAt(lp, p % 5 === 4 ? col.setRGB(1, 0.65, 0.1) : col.setRGB(0.2, 1, 0.35));
          setBlink(lp, hz * 1.3 * (0.5 + phases[lp]), phases[lp]);
        }
      }
      // rack status LED on the door header: green / amber / red (offline blinks red)
      place(leds, i, r, 0.23, 1.985, 0.558, 0.02, 0.02);
      leds.setColorAt(i, offline || crit ? col.setRGB(1, 0.1, 0.08) : warn ? col.setRGB(1, 0.65, 0.1) : col.setRGB(0.15, 1, 0.3));
      setBlink(i, offline ? 1.2 : 0, 0);
    });
    if (!dirty) return;
    door.instanceColor!.needsUpdate = true;
    rear.instanceColor!.needsUpdate = true;
    strip.instanceColor!.needsUpdate = true;
    kwBar.instanceMatrix.needsUpdate = true;
    zz.instanceMatrix.needsUpdate = true;
    for (const c of classes) {
      c.mesh.instanceMatrix.needsUpdate = true;
      if (c.mesh.instanceColor) c.mesh.instanceColor.needsUpdate = true;
    }
    leds.instanceMatrix.needsUpdate = true;
    leds.instanceColor!.needsUpdate = true;
    (leds.geometry.getAttribute('aBlink') as THREE.BufferAttribute).needsUpdate = true;
  }
  update();
  return { group, pick, update };
}
