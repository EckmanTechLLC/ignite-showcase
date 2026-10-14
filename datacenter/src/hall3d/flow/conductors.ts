import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Lit conductors: busways, feeders and pipes are merged tube geometries with a per-vertex distance along the run
// (aDist). A small shader draws pulses travelling along that distance, so a live path shows current flowing and a
// dead path is dark. All conductor materials share one clock uniform.

export const clock = { value: 0 };

const VERT = /* glsl */ `
attribute float aDist;
varying float vD;
varying vec3 vN;
void main() {
  vD = aDist;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uLive;
uniform float uTime;
uniform float uSpeed;
uniform float uPulse;
varying float vD;
varying vec3 vN;
void main() {
  float lit = 0.55 + 0.45 * dot(normalize(vN), normalize(vec3(0.3, 0.8, 0.5)));
  float p = 0.5 + 0.5 * sin((vD - uTime * uSpeed) * 5.0);
  float pulse = mix(0.75, 0.35 + 1.15 * p * p, uPulse);
  vec3 dead = vec3(0.07, 0.085, 0.11) * lit;
  vec3 live = uColor * pulse * (0.7 + 0.5 * lit);
  gl_FragColor = vec4(mix(dead, live, uLive), 1.0);
  #include <colorspace_fragment>
}`;

export interface ConductorMaterial extends THREE.ShaderMaterial {
  uniforms: {
    uColor: { value: THREE.Color };
    uLive: { value: number };
    uTime: { value: number };
    uSpeed: { value: number };
    uPulse: { value: number };
  };
}

export function conductorMaterial(color: THREE.ColorRepresentation): ConductorMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uLive: { value: 0 },
      uTime: clock,
      uSpeed: { value: 1.2 },
      uPulse: { value: 1 },
    },
    toneMapped: false,
  }) as ConductorMaterial;
}

type V3 = [number, number, number];

/** Collects axis-aligned runs (boxes or round pipes) and merges them into one geometry with run distance. */
export class RunBuilder {
  private parts: THREE.BufferGeometry[] = [];
  constructor(private size = 0.08, private round = false) {}

  /** Add a straight run; `dist` is the distance already travelled at `from`. Returns the distance at `to`. */
  run(from: V3, to: V3, dist = 0, size = this.size): number {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-6) return dist;
    dir.normalize();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    let g: THREE.BufferGeometry;
    if (this.round) {
      g = new THREE.CylinderGeometry(size / 2, size / 2, len + size * 0.5, 10, 1, false);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    } else {
      const ax = Math.abs(dir.x) > 0.5, ay = Math.abs(dir.y) > 0.5;
      g = new THREE.BoxGeometry(ax ? len + size : size, ay ? len + size : size, !ax && !ay ? len + size : size);
    }
    g.translate(mid.x, mid.y, mid.z);
    const pos = g.getAttribute('position');
    const d = new Float32Array(pos.count);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) d[i] = dist + v.fromBufferAttribute(pos, i).sub(a).dot(dir);
    g.setAttribute('aDist', new THREE.BufferAttribute(d, 1));
    this.parts.push(g);
    return dist + len;
  }

  /** Polyline of runs. */
  path(points: V3[], dist = 0, size = this.size): number {
    for (let i = 1; i < points.length; i++) dist = this.run(points[i - 1], points[i], dist, size);
    return dist;
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    return g;
  }
}
