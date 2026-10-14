import * as THREE from 'three';
import { BUSWAY_Y, EQUIP, PDU_X, RACKS_X1, ROOF_Y, UPS_X, ATS_X, coldZ, rackPos } from '../geometry';
import { waterRgb } from '../../heat';
import { S, powerState, refresh } from '../sample';
import { clock, conductorMaterial, RunBuilder, type ConductorMaterial } from './conductors';
import { lerp, setRgb } from '../util';

// Live power path (utility / generator / UPS on battery) and the chilled-water loop as lit conductors.
// A path is lit (pulses travelling along it) only while it carries current; a dead path stays dark.

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

export function createPower(): Power {
  const group = new THREE.Group();
  group.name = 'power';
  const lines: Record<string, Line> = {};
  const add = (key: string, geo: THREE.BufferGeometry) => {
    const mat = conductorMaterial('#ffffff');
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
    lines[key] = { mat, target: 0 };
  };
  const equip = (kind: string, id = '') => EQUIP.find((e) => e.kind === kind && e.id === id)!;

  // Utility -> ATS, generator -> ATS, ATS -> UPS A / B.
  const ats = equip('ats');
  const util = equip('utility');
  const gen = equip('generator');
  const upsA = equip('ups', 'A');
  const upsB = equip('ups', 'B');
  const r = new RunBuilder(0.1);
  r.path([[util.x + util.sx / 2, 0.35, util.z], [ATS_X, 0.35, util.z], [ATS_X, 0.35, ats.z - ats.sz / 2]]);
  add('utility', r.build());
  const rg = new RunBuilder(0.1);
  rg.path([[gen.x + gen.sx / 2, 0.35, gen.z], [ATS_X, 0.35, gen.z], [ATS_X, 0.35, ats.z + ats.sz / 2]]);
  add('generator', rg.build());
  const ra = new RunBuilder(0.1);
  ra.path([[ats.x + ats.sx / 2, 0.9, ats.z - 0.2], [UPS_X, 0.9, ats.z - 0.2], [UPS_X, 0.9, upsA.z + upsA.sz / 2]]);
  add('atsA', ra.build());
  const rb = new RunBuilder(0.1);
  rb.path([[ats.x + ats.sx / 2, 0.9, ats.z + 0.2], [UPS_X, 0.9, ats.z + 0.2], [UPS_X, 0.9, upsB.z - upsB.sz / 2]]);
  add('atsB', rb.build());

  // UPS output buses to the PDUs.
  for (const f of ['A', 'B'] as const) {
    const ups = f === 'A' ? upsA : upsB;
    const y = f === 'A' ? 0.5 : 0.65;
    const busX = f === 'A' ? -2.5 : -2.3;
    const zs = [0, 1, 2].map((k) => equip('pdu', `${f}${k + 1}`).z);
    const b = new RunBuilder(0.1);
    const d = b.path([[ups.x + ups.sx / 2, y, ups.z], [busX, y, ups.z]]);
    const zMin = Math.min(...zs, ups.z);
    const zMax = Math.max(...zs, ups.z);
    b.run([busX, y, ups.z], [busX, y, zMin], d);
    b.run([busX, y, ups.z], [busX, y, zMax], d);
    zs.forEach((z) => b.run([busX, y, z], [PDU_X - 0.4, y, z], d + Math.abs(z - ups.z)));
    add(`out${f}`, b.build());
  }

  // PDU -> overhead busway above the two rows of its pair.
  for (const f of ['A', 'B'] as const) {
    for (let k = 0; k < 3; k++) {
      const pdu = equip('pdu', `${f}${k + 1}`);
      const yb = BUSWAY_Y + (f === 'A' ? 0 : 0.12);
      const hx = f === 'A' ? -0.3 : -0.18;
      const b = new RunBuilder(0.07);
      const d = b.path([[pdu.x, pdu.sy, pdu.z], [pdu.x, yb, pdu.z], [hx, yb, pdu.z]]);
      for (const row of [2 * k, 2 * k + 1]) {
        const rz = rackPos(row * 10 + 1).z + (f === 'A' ? -0.12 : 0.12);
        const d1 = b.run([hx, yb, pdu.z], [hx, yb, rz], d);
        b.run([hx, yb, rz], [RACKS_X1 + 0.1, yb, rz], d1);
      }
      add(`bus${f}${k + 1}`, b.build());
    }
  }

  // Chilled water: supply (chillers -> CRAH) and return (CRAH -> chillers), outside the east wall and up to the roof.
  const zc = [0, 1, 2].map(coldZ);
  const ch = [5.2, 11.2];
  const pipeSupply = new RunBuilder(0.14, true);
  const sy = ROOF_Y + 0.3;
  ch.forEach((z) => pipeSupply.path([[11.2, sy, z], [10.6, sy, z]]));
  pipeSupply.path([[10.6, sy, ch[0]], [10.6, sy, 13.9], [9.0, sy, 13.9], [9.0, 0.3, 13.9], [9.0, 0.3, zc[0]]]);
  zc.forEach((z) => pipeSupply.path([[9.0, 0.3, z], [8.7, 0.3, z]]));
  add('supply', pipeSupply.build());
  const pipeReturn = new RunBuilder(0.14, true);
  const ry = ROOF_Y + 0.55;
  zc.forEach((z) => pipeReturn.path([[8.7, 2.7, z], [9.35, 2.7, z]]));
  pipeReturn.path([[9.35, 2.7, zc[0]], [9.35, 2.7, 14.3], [9.35, ry, 14.3], [10.9, ry, 14.3], [10.9, ry, ch[0]]]);
  ch.forEach((z) => pipeReturn.path([[10.9, ry, z], [11.2, ry, z]]));
  add('return', pipeReturn.build());

  const setLine = (key: string, rgb: [number, number, number], live: boolean, speed = 1.2) => {
    const l = lines[key];
    setRgb(l.mat.uniforms.uColor.value, rgb);
    l.target = live ? 1 : 0;
    l.mat.uniforms.uSpeed.value = speed;
  };

  function update(dt: number, t: number, animate: boolean): void {
    refresh();
    clock.value = t;
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
