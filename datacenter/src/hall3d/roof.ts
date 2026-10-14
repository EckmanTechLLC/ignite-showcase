import * as THREE from 'three';
import { CHILLERS, ROOF_Y, type ChillerPos } from './geometry';
import { FAN_FAULT, FAN_OFF, FAN_RUN, fanGeometry } from './fans';
import { Batch } from './gfx';
import type { Materials } from './materials';
import { S, refresh } from './sample';
import { Atlas, drawPlate } from './textures';

export interface Roof {
  group: THREE.Group;
  /** Invisible box instances whose instanceId + 1 is the chiller number (raycast target). */
  pick: THREE.InstancedMesh;
  update(dt: number, animate: boolean): void;
}

const FAN_XZ: [number, number][] = [[0.42, -0.5], [1.32, -0.5], [0.42, 0.5], [1.32, 0.5]];
const FAN_Y = 1.12;
const FAN_R = 0.46;
const BAND_RUN = new THREE.Color(0.2, 1, 0.45);
const BAND_IDLE = new THREE.Color(1, 0.7, 0.2);
const BAND_OFF = new THREE.Color(0.35, 0.4, 0.46);

/** Air-cooled screw chiller (local: length along x, front +z, origin at the deck centre). */
function buildChiller(b: Batch): void {
  b.box('paint', -1.8, 1.8, 0, 0.12, -1.0, 1.0); // skid
  for (const x of [-1.6, -0.6, 0.4, 1.4]) b.box('galv', x - 0.04, x + 0.04, 0.12, 0.2, -1.0, 1.0); // cross members
  // --- machine section ---
  b.cyl('ins', -0.9, 0.5, -0.4, 0.28, 1.7, 'x', 32); // evaporator barrel (insulated)
  for (const x of [-1.76, -0.04]) b.cyl('steel', x, 0.5, -0.4, 0.285, 0.04, 'x', 32);
  for (const x of [-1.4, -0.4]) b.cyl('galv', x, 0.8, -0.4, 0.045, 0.3, 'y', 12); // refrigerant nozzles
  b.cyl('engine', -1.15, 1.0, 0.08, 0.24, 0.8, 'x', 28); // motor
  for (let k = 0; k < 8; k++) b.ring('steel', -1.5 + k * 0.1, 1.0, 0.08, 0.24, 0.008, 'x', 28, 5);
  b.box('steel', -0.72, -0.1, 0.75, 1.25, -0.12, 0.3); // compressor casing
  b.box('galv', -0.7, -0.12, 1.25, 1.3, -0.1, 0.28);
  b.cyl('steel', -0.4, 0.62, 0.62, 0.16, 0.6, 'y', 24); // oil separator
  b.cyl('galv', -0.4, 0.94, 0.62, 0.165, 0.02, 'y', 24);
  b.tube('galv', { x: -0.4, y: 0.95, z: 0.62 }, { x: -0.05, y: 1.1, z: 0.62 }, 0.04, 12); // discharge line
  b.tube('galv', { x: -0.1, y: 1.1, z: 0.62 }, { x: -0.05, y: 1.15, z: 0.3 }, 0.04, 12);
  b.box('paint', -1.8, -0.05, 1.45, 1.5, -1.0, 1.0); // machine-room roof
  // control cabinet on the front
  b.box('cab', -1.65, -1.05, 0.12, 1.42, 0.7, 1.0);
  b.box('steel', -1.66, -1.04, 1.42, 1.45, 0.69, 1.01);
  b.box('steel', -1.1, -1.08, 0.5, 1.0, 1.0, 1.03);
  b.box('rubber', -1.6, -1.1, 0.55, 0.6, 1.0, 1.006); // door seam
  b.box('louvre', -1.58, -1.12, 0.12 + 0.02, 0.25, 1.0, 1.012);
  // water nozzles on the west end (supply low, return high), with flanges
  for (const y of [0.3, 0.55]) {
    b.cyl('ins', -1.9, y, 0, 0.07, 0.2, 'x', 18);
    b.cyl('steel', -1.99, y, 0, 0.11, 0.025, 'x', 22);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.ball('steel', -2.0, y + Math.sin(a) * 0.085, Math.cos(a) * 0.085, 0.009, 6);
    }
  }
  b.cyl('ins', -1.8, 0.3, -0.1, 0.05, 0.3, 'z', 12);
  // --- coil section ---
  b.box('rubber', -0.05, 1.8, 0.12, 1.0, -0.98, 0.98);
  b.box('louvre', 0.0, 1.76, 0.18, 0.96, 0.98, 1.0);
  b.box('louvre', 0.0, 1.76, 0.18, 0.96, -1.0, -0.98);
  b.box('louvre', 1.8, 1.82, 0.18, 0.96, -0.94, 0.94);
  for (const z of [-1, 1]) {
    b.box('galv', -0.06, 1.82, 0.12, 0.18, z * 0.98 - 0.02, z * 0.98 + 0.02);
    b.box('galv', -0.06, 1.82, 0.96, 1.0, z * 0.98 - 0.02, z * 0.98 + 0.02);
  }
  b.box('steel', -0.05, 1.82, 1.0, 1.04, -1.0, 1.0); // coil top deck
  // fan bank: shroud rings, struts, guards
  for (const [x, z] of FAN_XZ) {
    b.ring('steel', x, 1.04, z, FAN_R + 0.02, 0.025, 'y', 40, 8);
    b.ring('steel', x, 1.2, z, FAN_R + 0.02, 0.02, 'y', 40, 8);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.tube('galv', { x: x + Math.cos(a) * (FAN_R + 0.02), y: 1.04, z: z + Math.sin(a) * (FAN_R + 0.02) }, { x: x + Math.cos(a) * (FAN_R + 0.02), y: 1.2, z: z + Math.sin(a) * (FAN_R + 0.02) }, 0.008, 5);
    }
    for (const r of [0.25, 0.5, 0.75, 1.0].map((k) => k * (FAN_R + 0.02))) b.ring('galv', x, 1.2, z, r, 0.006, 'y', 40, 5);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.tube('galv', { x: x + Math.cos(a) * 0.04, y: 1.2, z: z + Math.sin(a) * 0.04 }, { x: x + Math.cos(a) * (FAN_R + 0.02), y: 1.2, z: z + Math.sin(a) * (FAN_R + 0.02) }, 0.005, 5);
    }
    b.cyl('steel', x, 1.215, z, 0.04, 0.03, 'y', 14);
  }
  // refrigerant headers between barrel and coils; service ladder on the end
  b.tube('galv', { x: -0.05, y: 0.4, z: 0.62 }, { x: 0.3, y: 0.4, z: 0.62 }, 0.035, 10);
  for (const z of [-0.2, 0.2]) b.box('galv', 1.82, 1.86, 0.15, 1.0, z - 0.012, z + 0.012);
  for (let k = 0; k < 7; k++) b.box('galv', 1.82, 1.86, 0.2 + k * 0.11, 0.215 + k * 0.11, -0.2, 0.2);
}

export function createRoof(m: Materials): Roof {
  const group = new THREE.Group();
  group.name = 'roof';

  const plates = new Atlas(2, 1, 256, 128);
  const b = new Batch();
  CHILLERS.forEach((c: ChillerPos, i) => {
    b.at(c.x, c.z, 0, () => {
      buildChiller(b);
      const pl = new THREE.PlaneGeometry(0.42, 0.2);
      pl.translate(-1.35, 0.33, 1.0 + 0.0075);
      plates.remap(pl, i);
      b.add('plate', pl);
    }, ROOF_Y);
    plates.draw(i, (g, w, h) => drawPlate(g, w, h, `CHILLER ${c.n}`, ['350 kW  R-134a', 'AIR-COOLED SCREW']));
  });
  const mats = { ...m, plate: new THREE.MeshStandardMaterial({ map: plates.texture, metalness: 0.6, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) } as unknown as Record<string, THREE.Material>;
  group.add(b.build(mats, ['cab', 'steel', 'paint', 'ins', 'engine'], 'chiller-static'));

  const nFans = CHILLERS.length * FAN_XZ.length;
  const fans = new THREE.InstancedMesh(fanGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 }), nFans);
  fans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.03, 0.01), new THREE.MeshBasicMaterial({ toneMapped: false }), CHILLERS.length);
  const pick = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), CHILLERS.length);
  pick.visible = false;
  const mm = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  CHILLERS.forEach((c, i) => {
    bands.setMatrixAt(i, mm.compose(new THREE.Vector3(c.x - 1.35, ROOF_Y + 1.25, c.z + 1.0 + 0.012), q0, one));
    bands.setColorAt(i, BAND_IDLE);
    pick.setMatrixAt(i, mm.compose(new THREE.Vector3(c.x, c.y, c.z), q0, new THREE.Vector3(c.sx, c.sy, c.sz)));
  });
  for (let i = 0; i < nFans; i++) fans.setColorAt(i, FAN_RUN);
  bands.instanceMatrix.needsUpdate = true;
  group.add(fans, bands, pick);
  [fans, bands, pick].forEach((o) => (o.frustumCulled = false));

  const angle = new Array<number>(nFans).fill(0);
  const speed = [0, 0];
  const qUp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const qZ = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3(0.88, 0.88, 0.88);
  let version = -1;

  function update(dt: number, animate: boolean): void {
    refresh();
    const recolour = version !== S.version;
    version = S.version;
    CHILLERS.forEach((c, i) => {
      const st = S.chillerState[i];
      const run = st === 'RUN' || st === 'RUNNING';
      const target = run ? Math.max(0.3, S.chillerKW[i] / 350) * 6 : 0;
      speed[i] += (target - speed[i]) * Math.min(1, dt * 1.5);
      FAN_XZ.forEach(([fx, fz], k) => {
        const j = i * FAN_XZ.length + k;
        if (animate && speed[i] > 0.01) angle[j] = (angle[j] + speed[i] * dt * (k & 1 ? -1 : 1)) % (Math.PI * 2);
        pos.set(c.x + fx, ROOF_Y + FAN_Y, c.z + fz);
        qZ.setFromAxisAngle(zAxis, angle[j]);
        fans.setMatrixAt(j, mm.compose(pos, qUp.clone().multiply(qZ), sc));
        if (recolour) fans.setColorAt(j, run ? FAN_RUN : st === '' || st === 'STANDBY' || st === 'OFF' ? FAN_OFF : FAN_FAULT);
      });
      if (recolour) bands.setColorAt(i, run ? BAND_RUN : st === 'STANDBY' ? BAND_IDLE : BAND_OFF);
    });
    fans.instanceMatrix.needsUpdate = true;
    if (recolour) {
      fans.instanceColor!.needsUpdate = true;
      bands.instanceColor!.needsUpdate = true;
    }
  }
  update(0, false);
  return { group, pick, update };
}
