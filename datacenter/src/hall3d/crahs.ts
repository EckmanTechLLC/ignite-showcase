import * as THREE from 'three';
import { CRAHS, type CrahPos } from './geometry';
import { FAN_FAULT, FAN_OFF, FAN_RUN, fanGeometry } from './fans';
import { Batch } from './gfx';
import type { Materials } from './materials';
import { S, refresh } from './sample';
import { Atlas, drawPlate } from './textures';

export interface Crahs {
  group: THREE.Group;
  /** Invisible box instances whose instanceId + 1 is the CRAH number (raycast target). */
  pick: THREE.InstancedMesh;
  /** Static equipment (cabinet, plenum, grille, guard, nameplate). */
  statics: THREE.Group;
  update(dt: number, animate: boolean): void;
}

const BAND_RUN = new THREE.Color(0.2, 1, 0.45);
const BAND_OFF = new THREE.Color(1, 0.7, 0.2);
const BAND_FAULT = new THREE.Color(1, 0.12, 0.1);

const fanScale = (c: CrahPos) => (c.n === 4 ? 0.85 : 1.3);

/** Local-space (front = +z, origin at the unit centre on the floor) CRAH: cabinet, plenum, filter louvres, wheel guard. */
function buildCrah(b: Batch, c: CrahPos): void {
  const W = Math.max(c.sx, c.sz);
  const D = Math.min(c.sx, c.sz);
  const H = c.sy;
  const fy = c.y + 0.15;
  const R = 0.52 * fanScale(c);
  b.box('rubber', -W / 2 + 0.03, W / 2 - 0.03, 0, 0.08, -D / 2 + 0.03, D / 2 - 0.03); // plinth
  b.box('cab', -W / 2, W / 2, 0.08, H - 0.3, -D / 2, D / 2); // cabinet
  b.box('cab', -W / 2 + 0.15, W / 2 - 0.15, H - 0.3, H, -D / 2 + 0.1, D / 2 - 0.1); // supply plenum
  b.box('louvre', -W / 2 + 0.25, W / 2 - 0.25, H - 0.26, H - 0.06, D / 2 - 0.095, D / 2 - 0.08); // plenum grille
  b.box('steel', -W / 2 + 0.12, W / 2 - 0.12, H - 0.012, H + 0.008, -D / 2 + 0.08, D / 2 - 0.08); // plenum top plate
  b.box('louvre', -W / 2 + 0.15, W / 2 - 0.15, 0.2, 0.62, D / 2 + 0.002, D / 2 + 0.03); // filter grille
  b.box('rubber', -W / 2 + 0.14, W / 2 - 0.14, 0.18, 0.2, D / 2, D / 2 + 0.034); // grille frame bottom / top
  b.box('rubber', -W / 2 + 0.14, W / 2 - 0.14, 0.62, 0.64, D / 2, D / 2 + 0.034);
  for (const s of [-1, 1]) {
    b.box('rubber', s * (W / 2 - 0.12) - 0.004, s * (W / 2 - 0.12) + 0.004, 0.1, H - 0.32, D / 2, D / 2 + 0.004); // door seams
    b.box('steel', s * (W / 2 - 0.2) - 0.012, s * (W / 2 - 0.2) + 0.012, 0.9, 1.2, D / 2, D / 2 + 0.035); // handles
  }
  // fan opening: bezel ring, guard (rings + spokes)
  b.ring('steel', 0, fy, D / 2 + 0.01, R + 0.02, 0.025, 'z', 48, 8);
  for (const r of [0.2, 0.4, 0.6, 0.8, 1.0].map((k) => k * R)) b.ring('galv', 0, fy, D / 2 + 0.06, r, 0.007, 'z', 48, 5);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.tube('galv', { x: Math.cos(a) * R * 0.08, y: fy + Math.sin(a) * R * 0.08, z: D / 2 + 0.06 }, { x: Math.cos(a) * R, y: fy + Math.sin(a) * R, z: D / 2 + 0.06 }, 0.005, 5);
  }
  b.cyl('steel', 0, fy, D / 2 + 0.075, R * 0.1, 0.04, 'z', 16); // guard hub cap
  // rear water connections (stubs with flanges)
  for (const y of [0.3, H - 0.35]) {
    b.cyl('ins', 0.35, y, -D / 2 - 0.12, 0.07, 0.24, 'z', 20);
    b.cyl('steel', 0.35, y, -D / 2 - 0.25, 0.1, 0.03, 'z', 20);
  }
  // beacon base + vent slots on top
  b.cyl('rubber', -W / 2 + 0.3, H + 0.02, 0, 0.07, 0.04, 'y', 14);
}

export function createCrahs(m: Materials): Crahs {
  const group = new THREE.Group();
  group.name = 'crahs';

  // static equipment, merged per material
  const b = new Batch();
  const plates = new Atlas(2, 2, 256, 96);
  CRAHS.forEach((c, i) => {
    const yaw = Math.atan2(c.nx, c.nz);
    const D = Math.min(c.sx, c.sz);
    b.at(c.x, c.z, yaw, () => {
      buildCrah(b, c);
      const pl = new THREE.PlaneGeometry(0.3, 0.11);
      pl.translate(-0.45, 0.78, D / 2 + 0.004);
      plates.remap(pl, i);
      b.add('plate', pl);
    });
    plates.draw(i, (g, w, h) => drawPlate(g, w, h, `CRAH ${c.n}${c.n === 4 ? ' ASSIST' : ''}`, [c.n === 4 ? '40 kW  CHW' : '220 kW  CHW']));
  });
  const mats = { ...m, plate: new THREE.MeshStandardMaterial({ map: plates.texture, metalness: 0.6, roughness: 0.4 }) } as unknown as Record<string, THREE.Material>;
  const statics = b.build(mats, ['cab', 'steel'], 'crah-static');
  group.add(statics);

  // dynamic: spinning wheels, status bands, beacons
  const fans = new THREE.InstancedMesh(fanGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 }), 4);
  fans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.035, 0.01), new THREE.MeshBasicMaterial({ toneMapped: false }), 4);
  const beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), 4);
  const pick = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 4);
  pick.visible = false;
  const mm = new THREE.Matrix4();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const qY = new THREE.Quaternion();
  const q0 = new THREE.Quaternion();
  CRAHS.forEach((c, i) => {
    const yaw = Math.atan2(c.nx, c.nz);
    qY.setFromAxisAngle(yAxis, yaw);
    const D = Math.min(c.sx, c.sz);
    const H = c.sy;
    // band: local (-0.45, H-0.2, D/2+0.012)
    const loc = new THREE.Vector3(-0.45, H - 0.2, D / 2 + 0.012).applyQuaternion(qY).add(new THREE.Vector3(c.x, 0, c.z));
    bands.setMatrixAt(i, mm.compose(loc, qY, new THREE.Vector3(1, 1, 1)));
    const bl = new THREE.Vector3(-Math.max(c.sx, c.sz) / 2 + 0.3, H + 0.06, 0).applyQuaternion(qY).add(new THREE.Vector3(c.x, 0, c.z));
    beacons.setMatrixAt(i, mm.compose(bl, q0, new THREE.Vector3(1, 1, 1)));
    pick.setMatrixAt(i, mm.compose(new THREE.Vector3(c.x, c.y, c.z), q0, new THREE.Vector3(c.sx, c.sy, c.sz)));
    fans.setColorAt(i, FAN_RUN);
    bands.setColorAt(i, BAND_RUN);
    beacons.setColorAt(i, BAND_RUN);
  });
  bands.instanceMatrix.needsUpdate = true;
  beacons.instanceMatrix.needsUpdate = true;
  group.add(fans, bands, beacons, pick);
  [fans, bands, beacons, pick].forEach((o) => (o.frustumCulled = false));

  const angle = [0, 0, 0, 0];
  const speed = [0, 0, 0, 0];
  const qZ = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let version = -1;

  function update(dt: number, animate: boolean): void {
    refresh();
    const recolour = version !== S.version;
    version = S.version;
    CRAHS.forEach((c, i) => {
      const st = S.crahState[i];
      const run = S.fan[i] > 0;
      const target = run ? S.fan[i] * 0.075 * Math.PI * 2 : 0; // 100 % = 7.5 rev/s
      speed[i] += (target - speed[i]) * Math.min(1, dt * (target > speed[i] ? 2 : 0.8));
      if (animate && speed[i] > 0.01) angle[i] = (angle[i] + speed[i] * dt) % (Math.PI * 2);
      pos.set(c.x + c.nx * (c.sx / 2 + 0.012), c.y + 0.15, c.z + c.nz * (c.sz / 2 + 0.012));
      qY.setFromAxisAngle(yAxis, Math.atan2(c.nx, c.nz));
      qZ.setFromAxisAngle(zAxis, angle[i]);
      sc.setScalar(fanScale(c));
      fans.setMatrixAt(i, mm.compose(pos, qY.clone().multiply(qZ), sc));
      if (recolour) {
        fans.setColorAt(i, st === 'FAULT' ? FAN_FAULT : run ? FAN_RUN : FAN_OFF);
        const bc = st === 'FAULT' ? BAND_FAULT : run ? BAND_RUN : BAND_OFF;
        bands.setColorAt(i, bc);
        beacons.setColorAt(i, bc);
      }
    });
    fans.instanceMatrix.needsUpdate = true;
    if (recolour) {
      fans.instanceColor!.needsUpdate = true;
      bands.instanceColor!.needsUpdate = true;
      beacons.instanceColor!.needsUpdate = true;
    }
  }
  update(0, false);
  return { group, pick, statics, update };
}

