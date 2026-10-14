import * as THREE from 'three';
import { CRAHS } from './geometry';
import { FAN_FAULT, FAN_OFF, FAN_RUN, fanGeometry } from './fans';
import { S, refresh } from './sample';
import { setRgb } from './util';

export interface Crahs {
  group: THREE.Group;
  /** instanceId + 1 is the CRAH number. */
  pick: THREE.InstancedMesh;
  update(dt: number, animate: boolean): void;
}

const BODY: [number, number, number] = [56, 72, 96];
const BODY_FAULT: [number, number, number] = [110, 30, 30];

/** 4 CRAH cabinets with spinning fan discs (speed = fan %); FAULT turns the unit red. */
export function createCrahs(): Crahs {
  const group = new THREE.Group();
  group.name = 'crahs';
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.5, roughness: 0.5 }), 4);
  const fans = new THREE.InstancedMesh(fanGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 }), 4);
  fans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  CRAHS.forEach((c, i) => {
    body.setMatrixAt(i, m.compose(new THREE.Vector3(c.x, c.y, c.z), new THREE.Quaternion(), new THREE.Vector3(c.sx, c.sy, c.sz)));
    body.setColorAt(i, setRgb(col, BODY));
    fans.setColorAt(i, FAN_RUN);
  });
  body.instanceMatrix.needsUpdate = true;
  group.add(body, fans);
  [body, fans].forEach((o) => (o.frustumCulled = false));

  const angle = [0, 0, 0, 0];
  const speed = [0, 0, 0, 0];
  const qY = new THREE.Quaternion();
  const qZ = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
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
      const r = c.n === 4 ? 0.85 : 1.3;
      pos.set(c.x + c.nx * (c.sx / 2 + 0.012), c.y + 0.15, c.z + c.nz * (c.sz / 2 + 0.012));
      qY.setFromAxisAngle(yAxis, Math.atan2(c.nx, c.nz));
      qZ.setFromAxisAngle(zAxis, angle[i]);
      sc.setScalar(r);
      fans.setMatrixAt(i, m.compose(pos, qY.clone().multiply(qZ), sc));
      if (recolour) {
        fans.setColorAt(i, st === 'FAULT' ? FAN_FAULT : run ? FAN_RUN : FAN_OFF);
        body.setColorAt(i, setRgb(col, st === 'FAULT' ? BODY_FAULT : BODY));
      }
    });
    fans.instanceMatrix.needsUpdate = true;
    if (recolour) {
      fans.instanceColor!.needsUpdate = true;
      body.instanceColor!.needsUpdate = true;
    }
  }
  update(0, false);
  return { group, pick: body, update };
}
