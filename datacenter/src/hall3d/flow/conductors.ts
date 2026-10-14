import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clock } from '../materials';

// Lit conductors. Busways are real rectangular ducts (static housings, see power.ts) with a recessed light line; pipes
// are insulated, jacketed tubes. Both light lines/bands are PBR materials patched with a per-vertex run distance
// (aDist): a pulse travels along that distance while the run is live, a dead run stays dark. All share one clock.

export { clock };

export interface ConductorMaterial extends THREE.MeshStandardMaterial {
  uniforms: {
    uColor: { value: THREE.Color };
    uLive: { value: number };
    uTime: { value: number } | typeof clock;
    uSpeed: { value: number };
    uPulse: { value: number };
  };
}

/** `line`: dark lens that glows with travelling pulses; `pipe`: insulated jacket with moving coloured flow bands. */
export function conductorMaterial(color: THREE.ColorRepresentation, mode: 'line' | 'pipe' = 'line'): ConductorMaterial {
  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uLive: { value: 0 },
    uTime: clock,
    uSpeed: { value: 1.2 },
    uPulse: { value: 1 },
  };
  const mat = new THREE.MeshStandardMaterial(
    mode === 'line' ? { color: '#0d1117', roughness: 0.35, metalness: 0.2 } : { color: '#c9d1d9', roughness: 0.55, metalness: 0.35 },
  ) as ConductorMaterial;
  mat.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDist;\nvarying float vD;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvD = aDist;');
    const emit =
      mode === 'line'
        ? `float p = 0.5 + 0.5 * sin((vD - uTime * uSpeed) * 5.0);
float pulse = mix(0.75, 0.35 + 1.15 * p * p, uPulse);
totalEmissiveRadiance += uColor * pulse * uLive * 1.5;`
        : `float ph = fract((vD - uTime * uSpeed * 0.35) * 0.9);
float band = smoothstep(0.78, 0.9, ph) * (1.0 - smoothstep(0.93, 1.0, ph));
float lit = mix(0.55, band, uPulse);
totalEmissiveRadiance += uColor * (0.08 + 1.1 * lit) * uLive;`;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uColor;\nuniform float uLive;\nuniform float uTime;\nuniform float uSpeed;\nuniform float uPulse;\nvarying float vD;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emit}`);
    if (mode === 'pipe') sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uColor * 0.55 + vec3(0.12), uLive * 0.3);');
  };
  mat.customProgramCacheKey = () => `conductor-${mode}`;
  return mat;
}

type V3 = [number, number, number];

/** Collects axis-aligned runs (round pipes, or slotted light lines for a duct) with the distance along the run. */
export class RunBuilder {
  private parts: THREE.BufferGeometry[] = [];
  constructor(private size = 0.08, private round = false, private seg = 16) {}

  /**
   * Add a straight run; `dist` is the distance already travelled at `from`. Returns the distance at `to`.
   * With `slot` the run is a light line in a duct of cross-section w x h (the line shows on the duct's faces).
   */
  run(from: V3, to: V3, dist = 0, size = this.size, slot?: { w: number; h: number }): number {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-6) return dist;
    dir.normalize();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    let g: THREE.BufferGeometry;
    if (this.round) {
      g = new THREE.CylinderGeometry(size / 2, size / 2, len + size * 0.5, this.seg, 1, false);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    } else if (slot) {
      const { w, h } = slot;
      const ax = Math.abs(dir.x) > 0.5;
      const ay = Math.abs(dir.y) > 0.5;
      const e = 0.012;
      // across the duct: the line is a third of the width and pokes out of both big faces
      g = ay ? new THREE.BoxGeometry(w + e, len + w, w * 0.34) : ax ? new THREE.BoxGeometry(len + w, h + e, w * 0.34) : new THREE.BoxGeometry(w * 0.34, h + e, len + w);
    } else {
      const ax = Math.abs(dir.x) > 0.5;
      const ay = Math.abs(dir.y) > 0.5;
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
  path(points: V3[], dist = 0, size = this.size, slot?: { w: number; h: number }): number {
    for (let i = 1; i < points.length; i++) dist = this.run(points[i - 1], points[i], dist, size, slot);
    return dist;
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    return g;
  }
}
