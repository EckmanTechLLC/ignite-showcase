import * as THREE from 'three';
import { RACKS, RACK_D } from '../geometry';
import { S, refresh } from '../sample';
import { clamp01 } from '../util';

// GPU airflow: one Points object, every particle's position is computed in the vertex shader from a per-particle seed
// and a per-zone phase. Path per particle (its rack decides the zone, the side and the column):
//   CRAH -> under the floor -> up through the cold-aisle tile -> through the rack -> up the hot aisle -> ceiling return -> CRAH.
// Emission rate of a zone = share of particles that are alive (aRand < rate), rate ~ the CRAH fan %; a stalled CRAH
// starves its zone. Colour: cold air takes the rack inlet colour, passing through a rack shifts it to the rack's outlet.

export const PER_RACK = 100;
export const PARTICLES = PER_RACK * 60;

const VERT = /* glsl */ `
attribute float aRack;
attribute float aSeed;
attribute float aRand;
attribute vec3 aJit;
uniform float uRate[3];
uniform float uPhase[3];
uniform vec2 uRack[60];
uniform float uSize;
uniform float uViewH;
varying vec3 vCol;
varying float vAlpha;

const float PITCH = 0.7;
vec3 temp(float t) {
  vec3 c = vec3(0.16, 0.38, 0.84);
  c = mix(c, vec3(0.13, 0.63, 0.72), clamp((t - 18.0) / 3.0, 0.0, 1.0));
  c = mix(c, vec3(0.59, 0.75, 0.27), clamp((t - 21.0) / 3.0, 0.0, 1.0));
  c = mix(c, vec3(0.96, 0.65, 0.14), clamp((t - 24.0) / 3.0, 0.0, 1.0));
  c = mix(c, vec3(0.94, 0.39, 0.16), clamp((t - 27.0) / 3.0, 0.0, 1.0));
  c = mix(c, vec3(0.91, 0.20, 0.20), clamp((t - 30.0) / 2.0, 0.0, 1.0));
  c = mix(c, vec3(1.00, 0.16, 0.38), clamp((t - 32.0) / 4.0, 0.0, 1.0));
  return c;
}

void main() {
  int r = int(aRack + 0.5);
  int row = r / 10;
  int col = r - row * 10;
  int pair = row / 2;
  int side = row - pair * 2;
  vec2 rk = uRack[r];
  float rate = uRate[pair];
  if (aRand >= rate || rk.y < 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vCol = vec3(0.0);
    vAlpha = 0.0;
    return;
  }
  float xc = float(col) * PITCH + 0.35 + 0.05 + aJit.x * 0.18;
  float zc = 3.2 + 5.0 * float(pair) + aJit.z * 0.35;
  float s = side == 0 ? -1.0 : 1.0;                       // direction of travel across the rack
  float zFront = 3.2 + 5.0 * float(pair) + s * 0.7;      // rack inlet face (cold-aisle edge)
  float zRear = zFront + s * ${RACK_D.toFixed(2)};
  float zh = 0.7 + 5.0 * float(pair + side) + aJit.z * 0.4;  // hot aisle centre
  float yr = 0.35 + 1.55 * (0.5 + 0.5 * aJit.y);

  vec3 W[8];
  W[0] = vec3(8.0, -0.25 + aJit.y * 0.1, zc);               // CRAH outlet (under the floor)
  W[1] = vec3(xc, -0.25 + aJit.y * 0.1, zc);
  W[2] = vec3(xc, yr, zc);
  W[3] = vec3(xc, yr, zFront);
  W[4] = vec3(xc, yr, zRear);
  W[5] = vec3(xc, 2.65 + aJit.y * 0.1, zh);
  W[6] = vec3(7.7, 2.65 + aJit.y * 0.1, zh);
  W[7] = vec3(8.1, 2.5, 3.2 + 5.0 * float(pair));           // CRAH return intake

  float seg[7];
  float L = 0.0;
  for (int i = 0; i < 7; i++) { seg[i] = length(W[i + 1] - W[i]); L += seg[i]; }
  float d = mod(aSeed * L + uPhase[pair], L);
  vec3 pos = W[0];
  int stage = 0;
  float acc = 0.0;
  for (int i = 0; i < 7; i++) {
    if (d >= acc && d < acc + seg[i]) {
      pos = mix(W[i], W[i + 1], (d - acc) / max(seg[i], 0.0001));
      stage = i;
    }
    acc += seg[i];
  }
  float u = d / L;

  vec3 cold = temp(rk.x);
  vec3 hot = temp(rk.x + (rk.y - rk.x) * 0.85);
  float through = stage == 3 ? (d - (seg[0] + seg[1] + seg[2])) / max(seg[3], 0.0001) : (stage > 3 ? 1.0 : 0.0);
  vCol = mix(cold, hot, smoothstep(0.0, 1.0, through)) * 1.25;
  float fade = smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.94, 1.0, u));
  vAlpha = fade * (pos.y < 0.0 ? 0.5 : 0.95);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * projectionMatrix[1][1] * uViewH * 0.5 / -mv.z, 1.5, 12.0);
}`;

const FRAG = /* glsl */ `
varying vec3 vCol;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.05, length(c));
  if (a * vAlpha < 0.01) discard;
  gl_FragColor = vec4(vCol, a * vAlpha);
  #include <colorspace_fragment>
}`;

export interface Airflow {
  points: THREE.Points;
  /** Live (drawn) particle count, from the zone rates. */
  alive(): number;
  update(dt: number, animate: boolean, viewH: number): void;
}

const SPEED = 1.5; // m/s at a 100 % fan

export function createAirflow(): Airflow {
  const g = new THREE.BufferGeometry();
  const rack = new Float32Array(PARTICLES);
  const seed = new Float32Array(PARTICLES);
  const rand = new Float32Array(PARTICLES);
  const jit = new Float32Array(PARTICLES * 3);
  // Deterministic pseudo-random sequence so every load looks the same.
  let s = 1234567;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < PARTICLES; i++) {
    rack[i] = Math.floor(i / PER_RACK);
    seed[i] = rnd();
    rand[i] = rnd();
    jit[i * 3] = rnd() * 2 - 1;
    jit[i * 3 + 1] = rnd() * 2 - 1;
    jit[i * 3 + 2] = rnd() * 2 - 1;
  }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3));
  g.setAttribute('aRack', new THREE.BufferAttribute(rack, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
  g.setAttribute('aJit', new THREE.BufferAttribute(jit, 3));
  const uniforms = {
    uRate: { value: [0, 0, 0] },
    uPhase: { value: [0, 0, 0] },
    uRack: { value: Array.from({ length: 60 }, () => new THREE.Vector2(22, 32)) },
    uSize: { value: 0.07 },
    uViewH: { value: 800 },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 2;
  points.name = 'airflow';

  let version = -1;
  let aliveCount = 0;
  const rate = [0, 0, 0];
  function update(dt: number, animate: boolean, viewH: number): void {
    refresh();
    uniforms.uViewH.value = viewH;
    if (version !== S.version) {
      version = S.version;
      // Zone rate = own CRAH fan plus 15 % of the shared assist unit; a stalled CRAH keeps only the assist share.
      for (let p = 0; p < 3; p++) rate[p] = clamp01((S.fan[p] + 0.15 * S.fan[3]) / 100);
      uniforms.uRate.value = [...rate];
      let alive = 0;
      RACKS.forEach((r, i) => {
        const o = S.outlet[i];
        uniforms.uRack.value[i].set(Number.isFinite(S.inlet[i]) ? S.inlet[i] : 22, S.online[i] === 0 || !Number.isFinite(o) ? -1 : o);
        if (S.online[i] !== 0) alive += PER_RACK * rate[r.pair];
      });
      aliveCount = Math.round(alive);
    }
    if (animate) for (let p = 0; p < 3; p++) uniforms.uPhase.value[p] += dt * SPEED * (0.25 + 0.75 * rate[p]);
  }
  update(0, false, 800);
  return { points, alive: () => aliveCount, update };
}
