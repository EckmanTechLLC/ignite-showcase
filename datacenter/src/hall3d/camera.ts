import * as THREE from 'three';
import type { BaseCameraControls } from '@tresjs/cientos';
import type { Bounds } from './geometry';
import { activePreset, PRESETS } from './presets';

const IDLE_ORBIT_AFTER_S = 8;
const IDLE_ORBIT_RAD_S = 0.045;

export interface CameraRig {
  go(i: number): void;
  reset(): void;
  flyTo(b: Bounds): void;
  update(dt: number, hasSelection: boolean): void;
  dispose(): void;
}

/** Presets, fly-to and the idle cinematic orbit on top of a cientos CameraControls instance. Reduced motion: jump cuts, no orbit. */
export function createCameraRig(ctrl: BaseCameraControls, camera: THREE.Camera, reduced: () => boolean): CameraRig {
  let idle = 0;
  const touch = () => (idle = 0);
  ctrl.addEventListener('controlstart', touch);
  ctrl.addEventListener('controlstart', () => (activePreset.value = -1));

  function go(i: number): void {
    const p = PRESETS[i];
    if (!p) return;
    idle = 0;
    activePreset.value = i;
    void ctrl.setLookAt(...p.pos, ...p.target, !reduced());
  }

  const tgt = new THREE.Vector3();
  const dir = new THREE.Vector3();
  function flyTo(b: Bounds): void {
    idle = 0;
    activePreset.value = -1;
    tgt.set(b.x, b.y, b.z);
    camera.getWorldPosition(dir).sub(ctrl.getTarget(new THREE.Vector3(), true));
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.5, 1);
    dir.normalize();
    dir.y = Math.max(dir.y, 0.35);
    dir.normalize();
    const dist = Math.min(14, Math.max(4, Math.max(b.sx, b.sy, b.sz) * 2.2 + 1.5));
    void ctrl.setLookAt(tgt.x + dir.x * dist, tgt.y + dir.y * dist, tgt.z + dir.z * dist, tgt.x, tgt.y, tgt.z, !reduced());
  }

  function update(dt: number, hasSelection: boolean): void {
    idle += dt;
    if (reduced() || hasSelection || activePreset.value !== 0 || idle < IDLE_ORBIT_AFTER_S) return;
    void ctrl.rotate(IDLE_ORBIT_RAD_S * dt, 0, false);
  }

  return { go, reset: () => go(0), flyTo, update, dispose: () => ctrl.removeEventListener('controlstart', touch) };
}
