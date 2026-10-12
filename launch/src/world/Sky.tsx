import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSmoothed } from '../live/hooks';
import { MOON_DIR } from './layout';
import { sky } from './skyState';

/**
 * Night sky dome: procedural stars, faint Milky Way, moon, horizon glow, and a horizon that dips with
 * altitude (limb of the Earth). Lightning flashes brighten it through `sky.flash`.
 */

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.9999; // always behind everything
}
`;

const FRAG = /* glsl */ `
varying vec3 vDir;
uniform float uDip;
uniform float uFlash;
uniform float uTime;
uniform vec3 uMoon;
uniform float uHaze;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  return vec3(hash13(p), hash13(p + 17.1), hash13(p + 41.7));
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1,0,0));
  float n010 = hash13(i + vec3(0,1,0));
  float n110 = hash13(i + vec3(1,1,0));
  float n001 = hash13(i + vec3(0,0,1));
  float n101 = hash13(i + vec3(1,0,1));
  float n011 = hash13(i + vec3(0,1,1));
  float n111 = hash13(i + vec3(1,1,1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
float starLayer(vec3 d, float scale, float density, float size) {
  vec3 p = d * scale;
  vec3 id = floor(p);
  vec3 h = hash33(id);
  if (h.x < density) return 0.0;
  vec3 center = (hash33(id + 7.7) * 0.7 + 0.15);
  float dist = length(fract(p) - center);
  float br = 0.35 + 0.65 * h.y;
  return smoothstep(size, 0.0, dist) * br * br;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y + uDip; // elevation relative to the (dipped) horizon
  float up = max(h, 0.0);

  vec3 zenith = vec3(0.004, 0.008, 0.02);
  vec3 mid = vec3(0.008, 0.015, 0.035);
  vec3 horizon = vec3(0.022, 0.032, 0.058);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, up));
  col = mix(col, zenith, smoothstep(0.12, 0.9, up));
  // warm light-pollution glow toward the south (+Z), where the trench opens
  float glowAz = pow(max(d.z * 0.5 + 0.5, 0.0), 3.0);
  col += vec3(0.07, 0.04, 0.03) * glowAz * exp(-up * 9.0) * uHaze;

  // stars, fading out near the horizon and under the moon
  float vis = smoothstep(0.02, 0.3, up);
  float st = starLayer(d, 120.0, 0.985, 0.10) * 1.8 + starLayer(d, 260.0, 0.992, 0.12) * 0.9;
  float tw = 0.85 + 0.15 * sin(uTime * 2.0 + dot(d, vec3(91.0, 53.0, 17.0)) * 40.0);
  vec3 starCol = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.88, 0.7), hash13(floor(d * 120.0)));
  col += starCol * st * tw * vis;

  // Milky Way band
  vec3 bandN = normalize(vec3(0.35, 0.55, -0.4));
  float band = exp(-pow(dot(d, bandN) * 3.2, 2.0));
  float dust = fbm(d * 7.0 + 3.0);
  col += vec3(0.05, 0.06, 0.09) * band * (0.35 + dust) * vis * 0.9;

  // moon
  float md = dot(d, normalize(uMoon));
  col += vec3(1.0, 0.97, 0.9) * smoothstep(0.99965, 0.99985, md) * 2.4;
  col += vec3(0.5, 0.6, 0.8) * pow(max(md, 0.0), 180.0) * 0.5 * vis;
  col += vec3(0.12, 0.16, 0.26) * pow(max(md, 0.0), 12.0) * 0.12;

  // below the horizon: dark Earth with a bright atmospheric limb
  float limb = exp(-abs(h) * 70.0);
  if (h < 0.0) {
    vec3 earth = vec3(0.006, 0.01, 0.018) + vec3(0.012, 0.018, 0.03) * fbm(d * 18.0 + vec3(0.0, uTime * 0.002, 0.0));
    col = mix(earth, horizon, exp(-(-h) * 14.0));
  }
  float atm = smoothstep(0.0, 0.03, uDip);
  col += vec3(0.1, 0.25, 0.6) * limb * 1.1 * atm;
  col += vec3(0.03, 0.09, 0.26) * exp(-max(h, 0.0) * 22.0) * atm * 0.8;

  col += vec3(0.4, 0.5, 0.9) * uFlash * (0.2 + 0.8 * exp(-up * 3.0)) * 0.6;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function Sky() {
  const mesh = useRef<THREE.Mesh>(null);
  const alt = useSmoothed('Launch/Vehicle/AltitudeM', 800);
  const hum = useSmoothed('Launch/Weather/HumidityPct', 2000);
  const uniforms = useMemo(
    () => ({
      uDip: { value: 0 },
      uFlash: { value: 0 },
      uTime: { value: 0 },
      uMoon: { value: new THREE.Vector3(...MOON_DIR) },
      uHaze: { value: 1 },
    }),
    [],
  );
  useFrame(({ camera, clock }) => {
    const m = mesh.current;
    if (!m) return;
    m.position.copy(camera.position);
    const altKm = Math.max(0, alt.v) / 1000;
    uniforms.uDip.value = Math.acos(6371 / (6371 + altKm));
    uniforms.uFlash.value = sky.flash;
    uniforms.uTime.value = clock.elapsedTime;
    uniforms.uHaze.value = 0.6 + hum.v / 100;
  });
  return (
    <mesh ref={mesh} frustumCulled={false} renderOrder={-1000}>
      <sphereGeometry args={[9000, 48, 24]} />
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
      />
    </mesh>
  );
}
