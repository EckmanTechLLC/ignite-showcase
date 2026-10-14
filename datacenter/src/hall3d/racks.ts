import * as THREE from 'three';
import { heatRgb } from '../heat';
import { RACKS, RACK_D, RACK_H, RACK_W } from './geometry';
import { S, refresh } from './sample';
import { setRgb } from './util';

const MAX_KW = 18;
const OFF: [number, number, number] = [30, 37, 48];

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
  /** Mesh whose instanceId + 1 is the rack number. */
  pick: THREE.InstancedMesh;
  update(): void;
}

/** 60 racks as four InstancedMeshes: frame, inlet face (colour = inlet temperature), kW LED strip, "zz" for offline. */
export function createRacks(): Racks {
  const group = new THREE.Group();
  group.name = 'racks';
  const n = RACKS.length;

  const bodyGeo = new THREE.BoxGeometry(RACK_W, RACK_H, RACK_D).translate(0, RACK_H / 2, 0);
  const body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: '#2c394b', metalness: 0.5, roughness: 0.5 }), n);
  const face = new THREE.InstancedMesh(new THREE.PlaneGeometry(RACK_W - 0.08, 1.72), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
  const led = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, 0.02), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
  const zz = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.34, 0.17),
    new THREE.MeshBasicMaterial({ map: zzTexture(), transparent: true, toneMapped: false, depthWrite: false }),
    n,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();
  RACKS.forEach((r, i) => {
    body.setMatrixAt(i, m.makeTranslation(r.x, 0, r.z));
    body.setColorAt(i, col.set('#ffffff'));
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.face === 1 ? 0 : Math.PI);
    face.setMatrixAt(i, m.compose(new THREE.Vector3(r.x, 0.12 + 0.86, r.z + r.face * (RACK_D / 2 + 0.006)), q, one));
    face.setColorAt(i, col.setRGB(0.1, 0.1, 0.1));
  });
  body.instanceMatrix.needsUpdate = true;
  face.instanceMatrix.needsUpdate = true;
  led.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  zz.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  led.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(body, face, led, zz);
  [body, face, led, zz].forEach((o) => (o.frustumCulled = false));
  body.computeBoundingSphere();

  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let version = -1;
  const ledOn = new THREE.Color('#e9fbff');
  function update(): void {
    refresh();
    if (version === S.version) return;
    version = S.version;
    RACKS.forEach((r, i) => {
      const offline = S.online[i] === 0;
      setRgb(col, offline ? OFF : (heatRgb(S.inlet[i]).map((v) => v * 0.9) as [number, number, number]));
      face.setColorAt(i, col);
      const f = offline || !Number.isFinite(S.kw[i]) ? 0 : Math.min(1, Math.max(0.03, S.kw[i] / MAX_KW));
      const len = 0.48 * f;
      pos.set(r.x - 0.24 + len / 2, 2.0, r.z + r.face * (RACK_D / 2 + 0.012));
      sc.set(Math.max(len, 0.0001), 1, 1);
      led.setMatrixAt(i, m.compose(pos, q.identity(), sc));
      led.setColorAt(i, ledOn);
      pos.set(r.x, 1.0, r.z + r.face * (RACK_D / 2 + 0.014));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.face === 1 ? 0 : Math.PI);
      sc.setScalar(offline ? 1 : 0.0001);
      zz.setMatrixAt(i, m.compose(pos, q, sc));
    });
    face.instanceColor!.needsUpdate = true;
    led.instanceMatrix.needsUpdate = true;
    led.instanceColor!.needsUpdate = true;
    zz.instanceMatrix.needsUpdate = true;
  }
  update();
  return { group, pick: body, update };
}
