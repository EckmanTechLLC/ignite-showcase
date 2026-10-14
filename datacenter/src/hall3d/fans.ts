import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Fan disc facing +z (radius 0.5): dark backing, hub and eight blades, as one vertex-coloured geometry. */
export function fanGeometry(): THREE.BufferGeometry {
  const paint = (g: THREE.BufferGeometry, r: number, gr: number, b: number) => {
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([r, gr, b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const parts: THREE.BufferGeometry[] = [paint(new THREE.CircleGeometry(0.52, 28), 0.05, 0.06, 0.08)];
  const hub = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 14);
  hub.rotateX(Math.PI / 2);
  hub.translate(0, 0, 0.03);
  parts.push(paint(hub, 0.55, 0.62, 0.7));
  for (let i = 0; i < 8; i++) {
    const blade = new THREE.BoxGeometry(0.4, 0.11, 0.012);
    blade.rotateZ(0.0);
    blade.rotateX(0.5); // pitch
    blade.translate(0.27, 0, 0.03);
    blade.rotateZ((i / 8) * Math.PI * 2);
    parts.push(paint(blade, 0.78, 0.86, 0.95));
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

export const FAN_RUN = new THREE.Color(1, 1, 1);
export const FAN_FAULT = new THREE.Color(1.0, 0.18, 0.18);
export const FAN_OFF = new THREE.Color(0.35, 0.38, 0.42);
