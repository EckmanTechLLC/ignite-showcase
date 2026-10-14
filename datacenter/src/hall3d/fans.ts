import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Fan wheel facing +z (radius 0.52): dark backing disc, hub with cone, rim ring and eleven twisted, swept blades
 * as one vertex-coloured geometry (so one InstancedMesh can spin and tint every wheel in the hall).
 */
export function fanGeometry(blades = 11): THREE.BufferGeometry {
  const paint = (g: THREE.BufferGeometry, r: number, gr: number, b: number) => {
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([r, gr, b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  };
  const parts: THREE.BufferGeometry[] = [paint(new THREE.CircleGeometry(0.52, 40), 0.05, 0.06, 0.08)];
  const hub = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 24);
  hub.rotateX(Math.PI / 2);
  hub.translate(0, 0, 0.04);
  parts.push(paint(hub, 0.5, 0.56, 0.64));
  const cone = new THREE.ConeGeometry(0.1, 0.1, 24);
  cone.rotateX(Math.PI / 2);
  cone.translate(0, 0, 0.12);
  parts.push(paint(cone, 0.62, 0.68, 0.76));
  const rim = new THREE.TorusGeometry(0.5, 0.02, 8, 48);
  rim.translate(0, 0, 0.05);
  parts.push(paint(rim, 0.3, 0.34, 0.4));
  for (let i = 0; i < blades; i++) {
    const blade = new THREE.PlaneGeometry(0.4, 0.15, 10, 2);
    const p = blade.getAttribute('position');
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k); // -0.2..0.2 along the radius
      const y = p.getY(k);
      const t = (x + 0.2) / 0.4;
      const tw = 0.9 - 0.7 * t; // blade pitch falls towards the tip
      const sweep = 0.12 * t * t; // swept back
      p.setXYZ(k, x + 0.31, y * Math.cos(tw) + sweep, y * Math.sin(tw) * 0.9 + 0.05);
    }
    blade.computeVertexNormals();
    blade.rotateZ((i / blades) * Math.PI * 2);
    parts.push(paint(blade, 0.78, 0.85, 0.94));
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

export const FAN_RUN = new THREE.Color(1, 1, 1);
export const FAN_FAULT = new THREE.Color(1.0, 0.18, 0.18);
export const FAN_OFF = new THREE.Color(0.35, 0.38, 0.42);
