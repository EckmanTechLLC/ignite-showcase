import * as THREE from 'three';
import { HALL_Z1, RACKS_X1, hotZ } from '../geometry';
import { S, refresh } from '../sample';
import { clamp01 } from '../util';

// Heat shimmer: a translucent plane above each hot aisle; moving noise bands, strength from the mean outlet temperature
// of the racks that blow into it (28 C calm .. 44 C hot).

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */ `
uniform float uTime;
uniform float uHeat;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vec2(vUv.x * 14.0 - uTime * 0.6, vUv.y * 3.0 + uTime * 0.25);
  float a = n(p) * 0.65 + n(p * 2.3 + 7.0) * 0.35;
  float edge = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
  vec3 col = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.25, 0.15), uHeat);
  float alpha = (a * a) * edge * (0.12 + 0.5 * uHeat);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

export interface Shimmer {
  group: THREE.Group;
  update(t: number, animate: boolean): void;
}

export function createShimmer(): Shimmer {
  const group = new THREE.Group();
  group.name = 'shimmer';
  const geo = new THREE.PlaneGeometry(RACKS_X1 + 0.2, 1.3);
  geo.rotateX(-Math.PI / 2);
  const mats: THREE.ShaderMaterial[] = [];
  for (let k = 0; k < 4; k++) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uHeat: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((RACKS_X1 + 0.2) / 2 - 0.1, 2.5, Math.min(hotZ(k), HALL_Z1));
    mesh.renderOrder = 1;
    group.add(mesh);
    mats.push(mat);
  }
  function update(t: number, animate: boolean): void {
    refresh();
    mats.forEach((m, k) => {
      m.uniforms.uTime.value = animate ? t : 0;
      m.uniforms.uHeat.value = clamp01((S.hotAisle[k] - 28) / 16);
    });
  }
  return { group, update };
}
