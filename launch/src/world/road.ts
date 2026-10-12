import * as THREE from 'three';

/** Flat ribbon along a polyline of [x, z] points; UV.x runs along the road, UV.y across. */
export function roadStrip(points: [number, number][], width: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let dist = 0;
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    if (i > 0) dist += Math.hypot(x - points[i - 1][0], z - points[i - 1][1]);
    const nx = -dz * (width / 2);
    const nz = dx * (width / 2);
    pos.push(x + nx, 0, z + nz, x - nx, 0, z - nz);
    const u = dist / 12;
    uv.push(u, 0, u, 1);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // computeVertexNormals may point down depending on winding; force up
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
