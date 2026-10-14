import * as THREE from 'three';
import { EQUIP } from './geometry';
import type { Equip } from './geometry';
import { powerState } from './sample';
import { setRgb } from './util';
import type { Target } from '../selection';

type RGB = [number, number, number];
const NEUTRAL: RGB = [50, 64, 86];
const OK: RGB = [30, 96, 76];
const WARN: RGB = [96, 62, 14];
const BAD: RGB = [110, 26, 26];
const SRC: RGB = [38, 84, 120];
const GEN: RGB = [92, 80, 38];

export interface Electrical {
  group: THREE.Group;
  pick: THREE.InstancedMesh;
  /** Target for an instance of `pick`. */
  targetOf(i: number): Target;
  update(dt: number, t: number, animate: boolean): void;
}

const socColor = (pct: number): RGB => (pct > 50 ? [60, 220, 130] : pct > 20 ? [255, 190, 60] : [255, 70, 60]);
const loadColor = (pct: number): RGB => (pct >= 100 ? [255, 70, 60] : pct >= 85 ? [255, 190, 60] : [40, 200, 235]);

/** Electrical room: utility transformer, generator, ATS, UPS A/B (battery gauge), six PDUs (load bar, breaker). */
export function createElectrical(): Electrical {
  const group = new THREE.Group();
  group.name = 'electrical';
  const n = EQUIP.length;
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.45, roughness: 0.55 }), n);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  const idx = (k: Equip['kind'], id = '') => EQUIP.findIndex((e) => e.kind === k && e.id === id);
  EQUIP.forEach((e, i) => {
    body.setMatrixAt(i, m.compose(new THREE.Vector3(e.x, e.y, e.z), new THREE.Quaternion(), new THREE.Vector3(e.sx, e.sy, e.sz)));
    body.setColorAt(i, setRgb(col, NEUTRAL));
  });
  body.instanceMatrix.needsUpdate = true;

  // Indicator bars: [battery A, battery B, PDU A1..B3 load, ATS lever, generator lamp, utility lamp]
  const barGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), 2 + 6 + 3);
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bars.count * 3), 3);
  group.add(body, bars);
  [body, bars].forEach((o) => (o.frustumCulled = false));

  const upsI = [idx('ups', 'A'), idx('ups', 'B')];
  const pduIds = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];
  const pduI = pduIds.map((id) => idx('pdu', id));
  const atsI = idx('ats');
  const genI = idx('generator');
  const utilI = idx('utility');
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const qx = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(1, 0, 0);
  let lever = 0;

  const bodyColor = (i: number, c: RGB) => body.setColorAt(i, setRgb(col, c));

  function update(dt: number, t: number, animate: boolean): void {
    const p = powerState();
    q.identity();
    // UPS: body tint by state, battery gauge by SOC.
    [p.upsA, p.upsB].forEach((u, k) => {
      const st = u.state.value;
      bodyColor(upsI[k], st === 'ONLINE' ? OK : st === 'BATTERY' ? WARN : st === '' ? NEUTRAL : BAD);
      const e = EQUIP[upsI[k]];
      const soc = Number.isFinite(u.soc.value) ? Math.min(100, Math.max(0, u.soc.value)) : 0;
      pos.set(e.x + e.sx / 2 + 0.03, 0.2, e.z - 0.45);
      sc.set(0.05, Math.max(0.02, 1.5 * (soc / 100)), 0.3);
      bars.setMatrixAt(k, m.compose(pos, q, sc));
      bars.setColorAt(k, setRgb(col, socColor(soc)));
    });
    // PDUs: breaker state tints the cabinet; bar = load %.
    pduIds.forEach((id, j) => {
      const feed = id[0] as 'A' | 'B';
      const u = p.pdus[feed][Number(id[1]) - 1];
      const tripped = u.tripped.value === true;
      bodyColor(pduI[j], tripped ? BAD : NEUTRAL);
      const e = EQUIP[pduI[j]];
      const pct = tripped ? 100 : Number.isFinite(u.loadPct.value) ? u.loadPct.value : 0;
      pos.set(e.x + e.sx / 2 + 0.03, 0.2, e.z - 0.28);
      sc.set(0.05, Math.max(0.02, 1.35 * Math.min(1, pct / 100)), 0.14);
      bars.setMatrixAt(2 + j, m.compose(pos, q, sc));
      bars.setColorAt(2 + j, setRgb(col, tripped && animate && Math.floor(t * 3) % 2 ? [90, 20, 20] : loadColor(pct)));
    });
    // ATS lever swings to the closed source; centred when OPEN.
    const target = p.atsPos === 'UTILITY' ? -0.6 : p.atsPos === 'GENERATOR' ? 0.6 : 0;
    lever += (target - lever) * (animate ? Math.min(1, dt * 5) : 1);
    const ats = EQUIP[atsI];
    pos.set(ats.x, ats.sy, ats.z);
    qx.setFromAxisAngle(xAxis, lever);
    sc.set(0.09, 0.8, 0.09);
    bars.setMatrixAt(8, m.compose(pos, qx, sc));
    bars.setColorAt(8, setRgb(col, p.atsPos === 'UTILITY' ? [40, 220, 150] : p.atsPos === 'GENERATOR' ? [255, 190, 60] : [255, 70, 60]));
    bodyColor(atsI, NEUTRAL);
    // Generator running state: lamp (pulses while starting) and body tint.
    const g = EQUIP[genI];
    const gs = p.genState;
    pos.set(g.x, g.sy, g.z);
    sc.set(0.3, 0.22, 0.3);
    q.identity();
    bars.setMatrixAt(9, m.compose(pos, q, sc));
    const gl: RGB = gs === 'RUNNING' ? [60, 230, 130] : gs === 'STARTING' ? (animate && Math.floor(t * 4) % 2 ? [255, 190, 60] : [90, 62, 16]) : gs === 'COOLDOWN' ? [90, 150, 200] : [40, 50, 62];
    bars.setColorAt(9, setRgb(col, gl));
    bodyColor(genI, gs === 'RUNNING' ? GEN : NEUTRAL);
    // Utility lamp.
    const u = EQUIP[utilI];
    pos.set(u.x, u.sy, u.z);
    bars.setMatrixAt(10, m.compose(pos, q, sc));
    bars.setColorAt(10, setRgb(col, p.utilityAvail ? [60, 230, 130] : [255, 70, 60]));
    bodyColor(utilI, p.utilityAvail ? SRC : BAD);
    body.instanceColor!.needsUpdate = true;
    bars.instanceMatrix.needsUpdate = true;
    bars.instanceColor!.needsUpdate = true;
  }
  update(0, 0, false);
  return { group, pick: body, targetOf: (i) => ({ kind: EQUIP[i].kind, id: EQUIP[i].id }), update };
}
