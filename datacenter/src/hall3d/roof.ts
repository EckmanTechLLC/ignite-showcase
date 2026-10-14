import * as THREE from 'three';
import { CHILLERS } from './geometry';
import { FAN_FAULT, FAN_OFF, FAN_RUN, fanGeometry } from './fans';
import { S, refresh } from './sample';
import { setRgb } from './util';

export interface Roof {
  group: THREE.Group;
  /** instanceId + 1 is the chiller number. */
  pick: THREE.InstancedMesh;
  update(dt: number, animate: boolean): void;
}

const RUN: [number, number, number] = [48, 80, 112];
const OFF: [number, number, number] = [96, 28, 28];
const IDLE: [number, number, number] = [56, 64, 78];

/** Roof chillers: cabinet tinted by compressor state, two condenser fans each (speed ~ kW). */
export function createRoof(): Roof {
  const group = new THREE.Group();
  group.name = 'roof';
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.45, roughness: 0.5 }), CHILLERS.length);
  const fans = new THREE.InstancedMesh(fanGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 }), CHILLERS.length * 2);
  fans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  CHILLERS.forEach((c, i) => {
    body.setMatrixAt(i, m.compose(new THREE.Vector3(c.x, c.y, c.z), new THREE.Quaternion(), new THREE.Vector3(c.sx, c.sy, c.sz)));
    body.setColorAt(i, setRgb(col, IDLE));
  });
  for (let i = 0; i < fans.count; i++) fans.setColorAt(i, FAN_RUN);
  body.instanceMatrix.needsUpdate = true;
  group.add(body, fans);
  [body, fans].forEach((o) => (o.frustumCulled = false));

  const angle = [0, 0, 0, 0];
  const speed = [0, 0];
  const qUp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const qZ = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3(1.5, 1.5, 1.5);
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
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        if (animate && speed[i] > 0.01) angle[j] = (angle[j] + speed[i] * dt * (k ? -1 : 1)) % (Math.PI * 2);
        pos.set(c.x + (k ? 0.9 : -0.9), c.y + c.sy / 2 + 0.01, c.z);
        qZ.setFromAxisAngle(zAxis, angle[j]);
        fans.setMatrixAt(j, m.compose(pos, qUp.clone().multiply(qZ), sc));
        if (recolour) fans.setColorAt(j, run ? FAN_RUN : st === '' ? FAN_OFF : FAN_FAULT);
      }
      if (recolour) body.setColorAt(i, setRgb(col, run ? RUN : st === '' ? IDLE : OFF));
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
