import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Small geometry builders used to merge many static parts into one draw call. */

export function boxAt(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

export function cylAt(rTop: number, rBot: number, h: number, x = 0, y = 0, z = 0, seg = 16): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, y, z);
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Square-section beam between two points. */
export function beam(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.BoxGeometry(t, len, t);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  g.applyQuaternion(q);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('mergeGeometries failed');
  return merged;
}

/**
 * Lattice mast: four tapered legs with ring braces and X bracing between them.
 * Returns one merged geometry with its base at y = 0.
 */
export function latticeMast(hBase: number, hTop: number, height: number, leg: number, levels: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const corner = (i: number, y: number) => {
    const half = hBase + ((hTop - hBase) * y) / height;
    const sx = i === 0 || i === 3 ? -1 : 1;
    const sz = i < 2 ? -1 : 1;
    return new THREE.Vector3(sx * half, y, sz * half);
  };
  for (let i = 0; i < 4; i++) parts.push(beam(corner(i, 0), corner(i, height), leg));
  for (let l = 0; l < levels; l++) {
    const y0 = (height * l) / levels;
    const y1 = (height * (l + 1)) / levels;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      parts.push(beam(corner(i, y1), corner(j, y1), leg * 0.7));
      parts.push(beam(corner(i, y0), corner(j, y1), leg * 0.45));
      parts.push(beam(corner(j, y0), corner(i, y1), leg * 0.45));
    }
  }
  return merge(parts);
}

export function catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number, n = 40): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const span = Math.hypot(b.x - a.x, b.z - a.z);
  // Catenary y = c*(cosh((u-0.5)*span/c) - cosh(0.5*span/c)) with c chosen so mid sag = `sag`.
  let c = (span * span) / (8 * sag);
  for (let k = 0; k < 6; k++) {
    // refine c so that c*(cosh(span/(2c)) - 1) = sag
    const f = c * (Math.cosh(span / (2 * c)) - 1) - sag;
    const df = Math.cosh(span / (2 * c)) - 1 - (span / (2 * c)) * Math.sinh(span / (2 * c));
    c -= f / df;
  }
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const drop = c * (Math.cosh(((u - 0.5) * span) / c) - Math.cosh(span / (2 * c)));
    pts.push(new THREE.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + drop, a.z + (b.z - a.z) * u));
  }
  return pts;
}
