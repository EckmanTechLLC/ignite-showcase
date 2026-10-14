import * as THREE from 'three';
import { BUSWAY_Y, EQUIP, HALL_X0, PDU_X, RACKS_X1, ROOF_Y, UPS_X, ATS_X, coldZ, rackPos, rackX } from '../geometry';
import { Batch } from '../gfx';
import { waterRgb } from '../../heat';
import type { Materials } from '../materials';
import { S, powerState, refresh } from '../sample';
import { conductorMaterial, RunBuilder, type ConductorMaterial } from './conductors';
import { lerp, setRgb } from '../util';

// Power path and chilled-water loop. Every conductor is real hardware: busway = galvanised rectangular duct with flanged
// joints, hangers and tap-off boxes (static) plus a recessed light line that pulses along the live path (dynamic);
// pipework = insulated, jacketed pipe with flanges, supports and valves, with coloured flow bands that move while the
// loop runs. A path that carries no current stays dark.

const CYAN: [number, number, number] = [34, 211, 238]; // feed A
const VIOLET: [number, number, number] = [192, 132, 252]; // feed B
const GREEN: [number, number, number] = [56, 224, 138];
const AMBER: [number, number, number] = [255, 176, 40];
const ORANGE: [number, number, number] = [255, 120, 40];

export interface Power {
  group: THREE.Group;
  update(dt: number, t: number, animate: boolean): void;
}

interface Line {
  mat: ConductorMaterial;
  target: number;
}
type V3 = [number, number, number];

const PIPE_D = 0.14;
const PIPE_R = PIPE_D / 2;
const SUP_X = 9.4; // supply riser (outside the glazed east wall)
const RET_X = 9.9; // return header

const WALL_TOP = 3.4;

/** Axis-aligned duct housing along a polyline (box segments, ends extended so corners join). */
function housing(b: Batch, key: string, pts: V3[], w: number, h: number): void {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay, az] = pts[i - 1];
    const [bx, by, bz] = pts[i];
    const dx = Math.abs(bx - ax) > 1e-6;
    const dy = Math.abs(by - ay) > 1e-6;
    const e = w / 2;
    if (dy) b.box(key, ax - w / 2, ax + w / 2, Math.min(ay, by) - h / 2, Math.max(ay, by) + h / 2, az - w / 2, az + w / 2);
    else if (dx) b.box(key, Math.min(ax, bx) - e, Math.max(ax, bx) + e, ay - h / 2, ay + h / 2, az - w / 2, az + w / 2);
    else b.box(key, ax - w / 2, ax + w / 2, ay - h / 2, ay + h / 2, Math.min(az, bz) - e, Math.max(az, bz) + e);
  }
}

/** Flanged joints, hangers and bolts along a duct polyline. */
function ductDetail(b: Batch, pts: V3[], w: number, h: number): void {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const c = pts[i];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = Math.max(1, Math.round(len / 1.2));
    const dx = (c[0] - a[0]) / len;
    const dy = (c[1] - a[1]) / len;
    const dz = (c[2] - a[2]) / len;
    const vertical = Math.abs(dy) > 0.5;
    for (let k = 0; k <= n; k++) {
      const s = (k / n) * len;
      const x = a[0] + dx * s;
      const y = a[1] + dy * s;
      const z = a[2] + dz * s;
      if (vertical) b.box('steel', x - w / 2 - 0.012, x + w / 2 + 0.012, y - 0.02, y + 0.02, z - w / 2 - 0.012, z + w / 2 + 0.012);
      else if (Math.abs(dx) > 0.5) b.box('steel', x - 0.02, x + 0.02, y - h / 2 - 0.012, y + h / 2 + 0.012, z - w / 2 - 0.012, z + w / 2 + 0.012);
      else b.box('steel', x - w / 2 - 0.012, x + w / 2 + 0.012, y - h / 2 - 0.012, y + h / 2 + 0.012, z - 0.02, z + 0.02);
      if (!vertical && k < n && y < WALL_TOP - 0.15) b.cyl('galv', x + dx * (len / n) * 0.5, (y + WALL_TOP) / 2 - 0.02, z + dz * (len / n) * 0.5, 0.005, WALL_TOP - y - 0.04, 'y', 5); // hanger rod
    }
  }
}
/** Flanges (every ~1.6 m and at the ends), pipe stands and clamps along a pipe polyline. */
function pipeDetail(b: Batch, pts: V3[]): void {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const c = pts[i];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    if (len < 0.2) continue;
    const dx = (c[0] - a[0]) / len;
    const dy = (c[1] - a[1]) / len;
    const dz = (c[2] - a[2]) / len;
    const axis = Math.abs(dx) > 0.5 ? 'x' : Math.abs(dy) > 0.5 ? 'y' : 'z';
    const n = Math.max(1, Math.round(len / 1.6));
    for (let k = 0; k <= n; k++) {
      const s = (k / n) * len;
      const x = a[0] + dx * s;
      const y = a[1] + dy * s;
      const z = a[2] + dz * s;
      b.ring('steel', x, y, z, PIPE_R + 0.022, 0.014, axis, 24, 6);
      for (let q = 0; q < 8; q++) {
        const th = (q / 8) * Math.PI * 2;
        const ox = axis === 'x' ? 0 : Math.cos(th) * (PIPE_R + 0.022);
        const oy = axis === 'y' ? 0 : axis === 'x' ? Math.cos(th) * (PIPE_R + 0.022) : Math.sin(th) * (PIPE_R + 0.022);
        const oz = axis === 'z' ? 0 : Math.sin(th) * (PIPE_R + 0.022);
        b.ball('steel', x + ox, y + oy, z + oz, 0.008, 5);
      }
      if (axis !== 'y' && k < n) {
        const mx = x + dx * (len / n) * 0.5;
        const mz = z + dz * (len / n) * 0.5;
        const onDeck = mx > 10.0 && mx < 16.2;
        const base = onDeck ? ROOF_Y : 0;
        if (y - base < 3.2 && y > base + 0.08) {
          b.tube('galv', { x: mx, y: base, z: mz }, { x: mx, y: y - PIPE_R, z: mz }, 0.014, 6);
          b.box('galv', mx - 0.08, mx + 0.08, base, base + 0.015, mz - 0.08, mz + 0.08);
          b.ring('galv', mx, y, mz, PIPE_R + 0.012, 0.008, axis, 20, 4);
        }
      }
    }
  }
}

/** Butterfly valve on a pipe running along x at (x, y, z): flanged body, stem, gearbox and lever. */
function valve(b: Batch, x: number, y: number, z: number): void {
  b.cyl('steel', x, y, z, PIPE_R + 0.03, 0.1, 'x', 24);
  for (const s of [-1, 1]) b.ring('steel', x + s * 0.06, y, z, PIPE_R + 0.03, 0.014, 'x', 24, 6);
  b.cyl('steel', x, y + PIPE_R + 0.09, z, 0.014, 0.14, 'y', 8);
  b.box('cab', x - 0.05, x + 0.05, y + PIPE_R + 0.15, y + PIPE_R + 0.22, z - 0.04, z + 0.04);
  b.box('yellow', x - 0.01, x + 0.01, y + PIPE_R + 0.17, y + PIPE_R + 0.2, z - 0.01, z + 0.16);
  b.ball('yellow', x, y + PIPE_R + 0.185, z + 0.16, 0.018, 8);
}

export function createPower(m: Materials): Power {
  const group = new THREE.Group();
  group.name = 'power';
  const lines: Record<string, Line> = {};
  const statics = new Batch();
  const add = (key: string, geo: THREE.BufferGeometry, mode: 'line' | 'pipe' = 'line') => {
    const mat = conductorMaterial('#ffffff', mode);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
    lines[key] = { mat, target: 0 };
  };
  const equip = (kind: string, id = '') => EQUIP.find((e) => e.kind === kind && e.id === id)!;
  /** Duct (static housing + joints) and its light line; returns the run distance. */
  const duct = (key: string, pts: V3[], w: number, h: number) => {
    housing(statics, 'galv', pts, w, h);
    ductDetail(statics, pts, w, h);
    const r = new RunBuilder(0.05);
    r.path(pts, 0, 0.05, { w, h });
    add(key, r.build());
  };

  const ats = equip('ats');
  const util = equip('utility');
  const gen = equip('generator');
  const upsA = equip('ups', 'A');
  const upsB = equip('ups', 'B');

  // Utility bushing -> ATS, generator terminal box -> ATS, ATS -> UPS A / B (overhead ducts in the electrical room).
  duct('utility', [[util.x - 0.25, util.y + 0.05, util.z], [util.x - 0.25, 2.6, util.z], [ATS_X, 2.6, util.z], [ATS_X, 2.6, ats.z - 0.3], [ATS_X, ats.sy + 0.05, ats.z - 0.3]], 0.16, 0.12);
  duct('generator', [[gen.x - 0.8, 1.45, gen.z], [gen.x - 0.8, 2.45, gen.z], [gen.x - 0.8, 2.45, 12.0], [ATS_X, 2.45, 12.0], [ATS_X, 2.45, ats.z + 0.3], [ATS_X, ats.sy + 0.05, ats.z + 0.3]], 0.16, 0.12);
  duct('atsA', [[ATS_X + 0.2, ats.sy + 0.05, ats.z - 0.1], [ATS_X + 0.2, 2.75, ats.z - 0.1], [UPS_X, 2.75, ats.z - 0.1], [UPS_X, 2.75, upsA.z + 0.3], [UPS_X, upsA.sy + 0.05, upsA.z + 0.3]], 0.14, 0.1);
  duct('atsB', [[ATS_X + 0.2, ats.sy + 0.05, ats.z + 0.1], [ATS_X + 0.2, 2.9, ats.z + 0.1], [UPS_X + 0.15, 2.9, ats.z + 0.1], [UPS_X + 0.15, 2.9, upsB.z - 0.3], [UPS_X + 0.15, upsB.sy + 0.05, upsB.z - 0.3]], 0.14, 0.1);

  // UPS output buses to the PDUs (one duct per feed, stepping down onto each PDU).
  const pduTop = equip('pdu', 'A1').sy + 0.12;
  for (const f of ['A', 'B'] as const) {
    const ups = f === 'A' ? upsA : upsB;
    const y = f === 'A' ? 2.3 : 2.5;
    const busX = f === 'A' ? -2.5 : -2.3;
    const zs = [0, 1, 2].map((k) => equip('pdu', `${f}${k + 1}`).z);
    const zMin = Math.min(...zs, ups.z);
    const zMax = Math.max(...zs, ups.z);
    const z0 = ups.z + (f === 'A' ? -0.5 : 0.5);
    const slot = { w: 0.14, h: 0.1 };
    const lead: V3[] = [[ups.x - 0.1, ups.sy + 0.05, z0], [ups.x - 0.1, y, z0], [busX, y, z0]];
    const bus: V3[] = [[busX, y, zMin], [busX, y, zMax]];
    for (const pts of [lead, bus]) {
      housing(statics, 'galv', pts, slot.w, slot.h);
      ductDetail(statics, pts, slot.w, slot.h);
    }
    const r = new RunBuilder(0.05);
    const d = r.path(lead, 0, 0.05, slot);
    r.run([busX, y, z0], [busX, y, zMin], d, 0.05, slot);
    r.run([busX, y, z0], [busX, y, zMax], d, 0.05, slot);
    zs.forEach((z) => {
      const leg: V3[] = [[busX, y, z], [PDU_X, y, z], [PDU_X, pduTop, z]];
      housing(statics, 'galv', leg, 0.12, 0.09);
      ductDetail(statics, leg, 0.12, 0.09);
      r.path(leg, d + Math.abs(z - z0), 0.05, { w: 0.12, h: 0.09 });
    });
    add(`out${f}`, r.build());
  }

  // PDU -> overhead busway over the two rows of its pair; tap-off boxes and drops to every rack.
  for (const f of ['A', 'B'] as const) {
    for (let k = 0; k < 3; k++) {
      const pdu = equip('pdu', `${f}${k + 1}`);
      const yb = BUSWAY_Y + (f === 'A' ? 0 : 0.12);
      const hx = f === 'A' ? -0.3 : -0.18;
      const w = 0.1;
      const h = 0.08;
      const r = new RunBuilder(0.05);
      const riser: V3[] = [[pdu.x, pdu.sy + 0.15, pdu.z], [pdu.x, yb, pdu.z], [hx, yb, pdu.z]];
      housing(statics, 'galv', riser, w, h);
      ductDetail(statics, riser, w, h);
      const d = r.path(riser, 0, 0.05, { w, h });
      statics.box('steel', HALL_X0 - 0.02, HALL_X0 + 0.02, yb - 0.1, yb + 0.1, pdu.z - 0.1, pdu.z + 0.1); // wall penetration
      for (const row of [2 * k, 2 * k + 1]) {
        const rz = rackPos(row * 10 + 1).z + (f === 'A' ? -0.12 : 0.12);
        const leg: V3[] = [[hx, yb, pdu.z], [hx, yb, rz], [RACKS_X1 + 0.1, yb, rz]];
        housing(statics, 'galv', leg, w, h);
        ductDetail(statics, leg, w, h);
        const d1 = r.run(leg[0], leg[1], d, 0.05, { w, h });
        r.run(leg[1], leg[2], d1, 0.05, { w, h });
        // tap-off box and drop cable above every rack of the row
        for (let col = 0; col < 10; col++) {
          const x = rackX(col) + (f === 'A' ? -0.08 : 0.08);
          statics.boxC('cab', x, yb - h / 2 - 0.05, rz, 0.1, 0.09, 0.13);
          statics.box('yellow', x - 0.05, x + 0.05, yb - h / 2 - 0.012, yb - h / 2, rz - 0.065, rz + 0.065);
          statics.cyl('rubber', x, (yb - h / 2 - 0.1 + 2.14) / 2, rz, 0.011, yb - h / 2 - 0.1 - 2.14, 'y', 6);
        }
      }
      add(`bus${f}${k + 1}`, r.build());
    }
  }

  // Chilled water. Supply (chillers -> CRAH) low on the unit, return high; branches carry a flanged butterfly valve.
  const zc = [0, 1, 2].map(coldZ);
  const ch = [5.2, 11.2];
  const sy = ROOF_Y + 0.3;
  const ry = ROOF_Y + 0.55;
  const zStub = (z: number) => z + 0.35;
  const supply: V3[][] = [];
  ch.forEach((z) => supply.push([[10.95, sy, z], [10.6, sy, z]]));
  supply.push([[10.6, sy, ch[0]], [10.6, sy, 13.9], [SUP_X, sy, 13.9], [SUP_X, 0.3, 13.9], [SUP_X, 0.3, zc[0]], [SUP_X, 0.3, -0.9], [3.95, 0.3, -0.9], [3.95, 0.3, -0.82]]);
  zc.forEach((z) => supply.push([[SUP_X, 0.3, zStub(z)], [8.96, 0.3, zStub(z)]]));
  const ret: V3[][] = [];
  zc.forEach((z) => ret.push([[8.96, 2.05, zStub(z)], [RET_X, 2.05, zStub(z)]]));
  ret.push([[RET_X, 2.05, zStub(zc[0])], [RET_X, 2.05, 14.3], [RET_X, ry, 14.3], [10.9, ry, 14.3], [10.9, ry, ch[0]]]);
  ch.forEach((z) => ret.push([[10.9, ry, z], [10.95, ry, z]]));
  ret.push([[3.95, 1.85, -0.82], [3.95, 1.85, -1.3], [RET_X, 1.85, -1.3], [RET_X, 1.85, zStub(zc[0])], [RET_X, 2.05, zStub(zc[0])]]);
  const pipes = (key: string, list: V3[][]) => {
    const r = new RunBuilder(PIPE_D, true, 24);
    list.forEach((p) => {
      r.path(p, 0, PIPE_D);
      pipeDetail(statics, p);
    });
    add(key, r.build(), 'pipe');
  };
  pipes('supply', supply);
  pipes('return', ret);
  zc.forEach((z) => {
    valve(statics, 9.15, 0.3, zStub(z));
    valve(statics, 9.15, 2.05, zStub(z));
  });

  group.add(statics.build(m as unknown as Record<string, THREE.Material>, ['galv'], 'power-static'));

  const setLine = (key: string, rgb: [number, number, number], live: boolean, speed = 1.2) => {
    const l = lines[key];
    setRgb(l.mat.uniforms.uColor.value, rgb);
    l.target = live ? 1 : 0;
    l.mat.uniforms.uSpeed.value = speed;
  };

  function update(dt: number, _t: number, animate: boolean): void {
    refresh();
    const p = powerState();
    const onGen = p.atsPos === 'GENERATOR';
    setLine('utility', GREEN, p.utility);
    setLine('generator', AMBER, p.generator);
    setLine('atsA', onGen ? AMBER : GREEN, p.atsLive && p.upsA.inputLive.value);
    setLine('atsB', onGen ? AMBER : GREEN, p.atsLive && p.upsB.inputLive.value);
    const batt = (s: string) => s === 'BATTERY';
    setLine('outA', batt(p.upsA.state.value) ? ORANGE : CYAN, p.upsA.outputLive.value, 0.6 + p.upsA.loadKW.value * 0.004);
    setLine('outB', batt(p.upsB.state.value) ? ORANGE : VIOLET, p.upsB.outputLive.value, 0.6 + p.upsB.loadKW.value * 0.004);
    for (const f of ['A', 'B'] as const) {
      p.pdus[f].forEach((u, k) => setLine(`bus${f}${k + 1}`, f === 'A' ? CYAN : VIOLET, u.live.value, 0.6 + u.loadKW.value * 0.012));
    }
    const running = S.chillerState.some((s) => s === 'RUN' || s === 'RUNNING');
    const flow = Number.isFinite(S.flowLps) ? Math.max(0.3, Math.min(2.5, S.flowLps / 40)) : 1;
    setLine('supply', waterRgb(S.chillerSupplyC), running, flow);
    setLine('return', waterRgb(S.chillerReturnC), running, flow);
    for (const l of Object.values(lines)) {
      const u = l.mat.uniforms;
      u.uLive.value = animate ? lerp(u.uLive.value, l.target, Math.min(1, dt * 6)) : l.target;
      u.uPulse.value = animate ? 1 : 0;
    }
  }
  update(0, 0, false);
  return { group, update };
}
