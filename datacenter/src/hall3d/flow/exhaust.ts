import * as THREE from 'three';
import { powerState } from '../sample';

// Generator exhaust: a small pool of soft smoke sprites that rise from the stack outlet and drift with the wind while the
// set runs (full rate RUNNING, half while STARTING / COOLDOWN), plus a warm heat-shimmer plane over the stack.

const N = 320;

const VERT = /* glsl */ `
attribute float aSeed;
attribute float aRand;
attribute vec3 aJit;
uniform float uT;
uniform float uRate;
uniform vec3 uOrigin;
uniform float uViewH;
varying float vAlpha;
void main() {
  if (aRand >= uRate) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
  float age = fract(aSeed + uT * 0.22);
  vec3 p = uOrigin;
  p.y += age * 3.2;
  p.x += age * age * 1.6 + aJit.x * 0.08 * (1.0 + age * 4.0) + sin(uT * 1.3 + aSeed * 30.0) * 0.1 * age;
  p.z += aJit.z * 0.08 * (1.0 + age * 4.0) + cos(uT * 1.1 + aSeed * 20.0) * 0.1 * age;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = 0.22 + 0.85 * age;
  gl_PointSize = clamp(size * projectionMatrix[1][1] * uViewH * 0.5 / -mv.z, 1.0, 90.0);
  vAlpha = smoothstep(0.0, 0.08, age) * (1.0 - age) * 0.5;
}`;

const FRAG = /* glsl */ `
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c)) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(0.42, 0.4, 0.38), a);
  #include <colorspace_fragment>
}`;

const SH_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SH_FRAG = /* glsl */ `
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
  float r = length(vUv - 0.5) * 2.0;
  float a = n(vUv * 6.0 - vec2(0.0, uTime * 0.8)) * 0.7 + n(vUv * 13.0 + 3.0) * 0.3;
  float alpha = a * a * (1.0 - smoothstep(0.3, 1.0, r)) * 0.4 * uHeat;
  gl_FragColor = vec4(1.0, 0.62, 0.3, alpha);
  #include <colorspace_fragment>
}`;

export interface Exhaust {
  group: THREE.Group;
  update(t: number, animate: boolean, viewH: number): void;
}

export function createExhaust(stack: THREE.Vector3): Exhaust {
  const g = new THREE.BufferGeometry();
  const seed = new Float32Array(N);
  const rand = new Float32Array(N);
  const jit = new Float32Array(N * 3);
  let s = 424242;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < N; i++) {
    seed[i] = rnd();
    rand[i] = rnd();
    jit.set([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1], i * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
  g.setAttribute('aJit', new THREE.BufferAttribute(jit, 3));
  const uniforms = { uT: { value: 0 }, uRate: { value: 0 }, uOrigin: { value: stack.clone() }, uViewH: { value: 800 } };
  const points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, toneMapped: false }));
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.name = 'exhaust';

  const shU = { uTime: { value: 0 }, uHeat: { value: 0 } };
  const shimmer = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ vertexShader: SH_VERT, fragmentShader: SH_FRAG, uniforms: shU, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  shimmer.position.set(stack.x + 0.4, stack.y + 0.7, stack.z);
  shimmer.renderOrder = 3;
  const group = new THREE.Group();
  group.name = 'exhaust';
  group.add(points, shimmer);
  group.visible = false;

  let time = 0;
  function update(t: number, animate: boolean, viewH: number): void {
    const gs = powerState().genState;
    const rate = gs === 'RUNNING' ? 1 : gs === 'STARTING' || gs === 'COOLDOWN' ? 0.45 : 0;
    group.visible = rate > 0 && animate;
    if (!group.visible) return;
    time = t;
    uniforms.uT.value = time;
    uniforms.uRate.value = rate;
    uniforms.uViewH.value = viewH;
    shU.uTime.value = time;
    shU.uHeat.value = rate;
  }
  return { group, update };
}
