import * as THREE from 'three';
import { CHILLERS, CRAHS, EQUIP, equipOf } from './geometry';
import type { Materials } from './materials';
import { S, powerState, refresh } from './sample';
import { Atlas } from './textures';

// Live status displays: one 1024 x 640 canvas atlas (17 screens), one merged emissive mesh, one bezel mesh. The canvas is
// repainted at most twice a second and only when a new data batch arrived.

export interface Slot {
  cell: number;
  x: number;
  y: number;
  z: number;
  /** Rotation about Y: the screen faces (sin yaw, cos yaw). */
  yaw: number;
  w: number;
  h: number;
}

// cell order: CRAH 1-4 (0-3), UPS A,B (4-5), PDU A1..B3 (6-11), ATS 12, generator 13, utility 14, chiller 1-2 (15-16)
export const CELL = { crah: 0, ups: 4, pdu: 6, ats: 12, gen: 13, util: 14, chiller: 15 } as const;
const PDU_IDS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];

export function displaySlots(): Slot[] {
  const out: Slot[] = [];
  for (const c of CRAHS) {
    const yaw = Math.atan2(c.nx, c.nz);
    if (c.n === 4) out.push({ cell: CELL.crah + 3, x: c.x + 0.55, y: c.y + 0.9, z: c.z + c.sz / 2 + 0.014, yaw, w: 0.42, h: 0.21 });
    else out.push({ cell: CELL.crah + c.n - 1, x: c.x + c.nx * (c.sx / 2 + 0.014), y: c.y + 1.0, z: c.z + 0.5, yaw, w: 0.42, h: 0.21 });
  }
  for (const [k, id] of (['A', 'B'] as const).entries()) {
    const e = equipOf('ups', id)!;
    out.push({ cell: CELL.ups + k, x: e.x + e.sx / 2 + 0.014, y: 1.62, z: e.z - 0.55, yaw: Math.PI / 2, w: 0.4, h: 0.2 });
  }
  PDU_IDS.forEach((id, k) => {
    const e = equipOf('pdu', id)!;
    out.push({ cell: CELL.pdu + k, x: e.x + e.sx / 2 + 0.014, y: 1.5, z: e.z, yaw: Math.PI / 2, w: 0.34, h: 0.17 });
  });
  const ats = equipOf('ats', '')!;
  out.push({ cell: CELL.ats, x: ats.x + ats.sx / 2 + 0.014, y: 1.45, z: ats.z, yaw: Math.PI / 2, w: 0.4, h: 0.2 });
  const gen = equipOf('generator', '')!;
  out.push({ cell: CELL.gen, x: gen.x + 0.55, y: 1.05, z: gen.z + gen.sz / 2 + 0.014, yaw: 0, w: 0.34, h: 0.17 });
  const ut = equipOf('utility', '')!;
  out.push({ cell: CELL.util, x: ut.x + ut.sx / 2 + 0.014, y: 1.35, z: ut.z + 0.3, yaw: Math.PI / 2, w: 0.46, h: 0.23 });
  for (const c of CHILLERS) out.push({ cell: CELL.chiller + c.n - 1, x: c.x - 1.35, y: c.y - c.sy / 2 + 0.85, z: c.z + c.sz / 2 + 0.014, yaw: 0, w: 0.42, h: 0.21 });
  return out;
}

const G = '#5df2a0';
const A = '#ffc23a';
const R = '#ff5d4d';
const C = '#6fdcff';
const DIM = '#7b8b9f';
const f1 = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '--');

type Ctx = CanvasRenderingContext2D;
function screen(g: Ctx, w: number, h: number, title: string, rows: [string, string, string?][], tint = C): void {
  g.fillStyle = '#04080e';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#0b1a2a';
  g.fillRect(0, 0, w, 26);
  g.fillStyle = tint;
  g.font = '700 20px ui-monospace, "JetBrains Mono", monospace';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(title, 8, 14);
  const lh = (h - 30) / rows.length;
  rows.forEach(([l, v, c], i) => {
    const y = 30 + lh * (i + 0.5);
    g.fillStyle = DIM;
    g.font = '600 19px ui-monospace, "JetBrains Mono", monospace';
    g.textAlign = 'left';
    g.fillText(l, 8, y);
    g.fillStyle = c ?? '#e6f1ff';
    g.font = '700 26px ui-monospace, "JetBrains Mono", monospace';
    g.textAlign = 'right';
    g.fillText(v, w - 8, y);
  });
  g.strokeStyle = '#1d3a55';
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
}

function dial(g: Ctx, w: number, h: number, kw: number, v: number, hz: number, ok: boolean): void {
  g.fillStyle = '#e9edf1';
  g.fillRect(0, 0, w, h);
  const cx = 64;
  const cy = h / 2;
  g.fillStyle = '#1b2430';
  g.beginPath();
  g.arc(cx, cy, 58, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f4f6f8';
  g.beginPath();
  g.arc(cx, cy, 52, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1b2430';
  g.lineWidth = 2;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (0.8 + (i / 10) * 1.4);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40);
    g.lineTo(cx + Math.cos(a) * 49, cy + Math.sin(a) * 49);
    g.stroke();
  }
  const frac = Number.isFinite(kw) ? Math.min(1, Math.max(0, kw / 1000)) : 0;
  const a = Math.PI * (0.8 + frac * 1.4);
  g.strokeStyle = ok ? '#c1121f' : '#7a838d';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44);
  g.stroke();
  g.fillStyle = '#1b2430';
  g.beginPath();
  g.arc(cx, cy, 4, 0, Math.PI * 2);
  g.fill();
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = '700 18px ui-sans-serif, system-ui, sans-serif';
  g.fillText('UTILITY kWh', 134, 22);
  g.font = '700 30px ui-monospace, monospace';
  g.fillText(`${f1(kw, 0)} kW`, 134, 56);
  g.font = '600 20px ui-monospace, monospace';
  g.fillStyle = '#41505f';
  g.fillText(`${f1(v, 0)} V`, 134, 88);
  g.fillText(`${f1(hz, 1)} Hz`, 134, 112);
}

export interface Displays {
  group: THREE.Group;
  update(nowMs: number): void;
}

export function createDisplays(m: Materials): Displays {
  const slots = displaySlots();
  const atlas = new Atlas(4, 5, 256, 128);
  const parts: THREE.BufferGeometry[] = [];
  const bezel: THREE.BufferGeometry[] = [];
  for (const s of slots) {
    const g = new THREE.PlaneGeometry(s.w, s.h);
    atlas.remap(g, s.cell);
    g.rotateY(s.yaw);
    g.translate(s.x, s.y, s.z);
    parts.push(g);
    const b = new THREE.BoxGeometry(s.w + 0.03, s.h + 0.03, 0.02);
    b.translate(0, 0, -0.011);
    b.rotateY(s.yaw);
    b.translate(s.x, s.y, s.z);
    bezel.push(b);
  }
  const merge = (list: THREE.BufferGeometry[]) => {
    let n = 0;
    for (const g of list) n += g.getAttribute('position').count;
    const mk = (name: string, size: number) => {
      const a = new Float32Array(n * size);
      let o = 0;
      for (const g of list) {
        a.set(g.getAttribute(name).array as Float32Array, o);
        o += g.getAttribute(name).array.length;
      }
      return new THREE.BufferAttribute(a, size);
    };
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', mk('position', 3));
    out.setAttribute('normal', mk('normal', 3));
    out.setAttribute('uv', mk('uv', 2));
    const idx: number[] = [];
    let off = 0;
    for (const g of list) {
      for (const k of g.index!.array) idx.push(k + off);
      off += g.getAttribute('position').count;
    }
    out.setIndex(idx);
    return out;
  };
  const screens = new THREE.Mesh(merge(parts), new THREE.MeshBasicMaterial({ map: atlas.texture, toneMapped: false }));
  screens.name = 'displays';
  const bezels = new THREE.Mesh(merge(bezel), m.rubber);
  bezels.name = 'display-bezels';
  const group = new THREE.Group();
  group.name = 'displays';
  group.add(screens, bezels);

  function paint(): void {
    const p = powerState();
    for (let i = 0; i < 4; i++) {
      const st = S.crahState[i];
      const fault = st === 'FAULT';
      atlas.draw(CELL.crah + i, (g, w, h) =>
        screen(g, w, h, `CRAH ${i + 1}${i === 3 ? ' ASSIST' : ''}`, [
          ['SUP', `${f1(S.crahSupply[i])} C`, C],
          ['RET', `${f1(S.crahReturn[i])} C`, A],
          [fault ? 'FAULT' : 'FAN', fault ? '0 %' : `${f1(S.fan[i], 0)} %`, fault ? R : G],
        ], fault ? R : C),
      );
    }
    ([p.upsA, p.upsB] as const).forEach((u, k) => {
      const st = u.state.value;
      atlas.draw(CELL.ups + k, (g, w, h) =>
        screen(g, w, h, `UPS ${k ? 'B' : 'A'} ${st || '--'}`, [
          ['LOAD', `${f1(u.loadPct.value, 0)} %`, u.loadPct.value >= 85 ? A : G],
          ['BATT', `${f1(u.soc.value, 0)} %`, u.soc.value < 50 ? A : G],
          ['RUN', `${f1(u.runtime.value, 0)} min`, C],
        ], st === 'ONLINE' ? G : st === 'BATTERY' ? A : R),
      );
    });
    PDU_IDS.forEach((id, k) => {
      const u = p.pdus[id[0] as 'A' | 'B'][Number(id[1]) - 1];
      const tr = u.tripped.value === true;
      atlas.draw(CELL.pdu + k, (g, w, h) =>
        screen(g, w, h, `PDU ${id}${tr ? ' TRIP' : ''}`, [
          ['LOAD', `${f1(u.loadKW.value, 0)} kW`, tr ? R : '#e6f1ff'],
          ['CAP', `${f1(u.loadPct.value, 0)} %`, u.loadPct.value >= 90 ? A : G],
        ], tr ? R : C),
      );
    });
    const ats = p.atsPos;
    atlas.draw(CELL.ats, (g, w, h) =>
      screen(g, w, h, 'ATS', [
        ['POS', ats || '--', ats === 'UTILITY' ? G : ats === 'GENERATOR' ? A : R],
        ['UTIL', p.utilityAvail ? 'OK' : 'LOST', p.utilityAvail ? G : R],
        ['GEN', p.genState || '--', p.genState === 'RUNNING' ? G : DIM],
      ]),
    );
    atlas.draw(CELL.gen, (g, w, h) =>
      screen(g, w, h, 'GENSET', [
        ['STATE', p.genState || '--', p.genState === 'RUNNING' ? G : p.genState === 'STARTING' ? A : DIM],
        ['OUT', `${f1(p.genKW, 0)} kW`, '#e6f1ff'],
        ['FUEL', `${f1(S.genFuel, 0)} %`, S.genFuel < 20 ? A : G],
      ], p.genState === 'RUNNING' ? G : C),
    );
    atlas.draw(CELL.util, (g, w, h) => dial(g, w, h, p.utilityKW, S.utilV, S.utilHz, p.utilityAvail));
    for (let i = 0; i < 2; i++) {
      const st = S.chillerState[i];
      const run = st === 'RUN' || st === 'RUNNING';
      atlas.draw(CELL.chiller + i, (g, w, h) =>
        screen(g, w, h, `CHILLER ${i + 1} ${st || '--'}`, [
          ['SUP', `${f1(S.chillerSupplyC)} C`, C],
          ['RET', `${f1(S.chillerReturnC)} C`, A],
          ['PWR', `${f1(S.chillerKW[i], 0)} kW`, run ? G : DIM],
        ], run ? G : st === 'STANDBY' ? A : DIM),
      );
    }
    atlas.texture.needsUpdate = true;
  }

  let seen = -2;
  let last = -1e9;
  function update(nowMs: number): void {
    refresh();
    if (seen === S.version || nowMs - last < 450) return;
    seen = S.version;
    last = nowMs;
    paint();
  }
  void EQUIP;
  paint();
  return { group, update };
}
