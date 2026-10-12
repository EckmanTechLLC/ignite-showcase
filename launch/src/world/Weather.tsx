import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSmoothed } from '../live/hooks';
import { motion } from '../motion';
import { M } from './materials';
import { setWind, wind } from './wind';
import { sky } from './skyState';

/**
 * Weather: drives the shared wind from the tags, the wind sock, lightning bolts and the sky flash
 * when the nearest strike is closer than 15 km, and low ground haze.
 */

export function Weather() {
  const speed = useSmoothed('Launch/Weather/WindSpeedMS', 1500);
  const gust = useSmoothed('Launch/Weather/GustMS', 1200);
  const dir = useSmoothed('Launch/Weather/WindDirDeg', 2500);
  useFrame(({ clock }) => {
    const base = speed.v;
    const extra = Math.max(0, gust.v - base);
    const swell = Math.pow(0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.9 + Math.sin(clock.elapsedTime * 0.37) * 2), 3);
    setWind(base + extra * swell * (motion.reduced ? 0.3 : 1), dir.v);
  });
  return (
    <>
      <WindSock />
      <Lightning />
      <Haze />
    </>
  );
}

const SOCK_SEGMENTS = 5;

function WindSock() {
  const root = useRef<THREE.Group>(null);
  const segs = useRef<(THREE.Group | null)[]>([]);
  const mats = useMemo(
    () => [new THREE.MeshStandardMaterial({ color: '#ff7a2f', roughness: 0.8, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial({ color: '#f2f4f7', roughness: 0.8, side: THREE.DoubleSide })],
    [],
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame(({ clock }) => {
    const r = root.current;
    if (!r) return;
    const v = wind.vec;
    const s = wind.speed;
    // yaw so local +X points where the wind blows
    if (s > 0.05) r.rotation.y = Math.atan2(-v.z, v.x);
    const lift = THREE.MathUtils.clamp(s / 9, 0, 1); // a sock is fully extended at ~9 m/s
    const t = clock.elapsedTime;
    segs.current.forEach((g, i) => {
      if (!g) return;
      const droop = (1 - lift) * 0.62 + 0.05;
      const flutter = motion.reduced ? 0 : Math.sin(t * (5 + s * 0.6) + i * 0.9) * 0.05 * (0.3 + lift) * (i + 1) * 0.5;
      g.rotation.z = -droop + flutter * 0.4;
      g.rotation.y = motion.reduced ? 0 : Math.sin(t * 3.1 + i * 1.3) * 0.04 * lift * (i + 1);
    });
  });
  const segLen = 1.15;
  const nodes: JSX.Element[] = [];
  // nested chain: each segment is a child of the previous so the sock bends smoothly
  let inner: JSX.Element | null = null;
  for (let i = SOCK_SEGMENTS - 1; i >= 0; i--) {
    const r0 = 0.62 - i * 0.09;
    const r1 = 0.62 - (i + 1) * 0.09;
    const mesh = (
      <mesh position={[segLen / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <cylinderGeometry args={[r1, r0, segLen, 14, 1, true]} />
        <primitive object={mats[i % 2]} attach="material" />
      </mesh>
    );
    inner = (
      <group
        key={i}
        ref={(g) => {
          segs.current[i] = g;
        }}
        position={[i === 0 ? 0 : segLen, 0, 0]}
      >
        {mesh}
        {inner}
      </group>
    );
  }
  nodes.push(inner!);
  return (
    <group position={[52, 0, -36]}>
      <mesh position={[0, 5, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.16, 10, 8]} />
        <primitive object={M.steel} attach="material" />
      </mesh>
      <group ref={root} position={[0, 9.7, 0]}>
        <mesh rotation={[0, 0, 0]}>
          <torusGeometry args={[0.66, 0.05, 6, 20]} />
          <primitive object={M.steel} attach="material" />
        </mesh>
        {nodes}
      </group>
    </group>
  );
}

/** Distant lightning: jagged bolts and sky flashes when LightningDistanceKm < 15. */
function Lightning() {
  const dist = useSmoothed('Launch/Weather/LightningDistanceKm', 3000);
  const bolt = useRef<THREE.InstancedMesh>(null);
  const state = useMemo(() => ({ next: 6, t: -1, strokes: [] as number[], hasBolt: false, strength: 0 }), []);
  const BOLT_SEGS = 56;
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 7, 10), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), d: new THREE.Vector3() }), []);
  useEffect(() => {
    // Dev only: window.__strike() fires a flash on the next frame (needs LightningDistanceKm < 15).
    if (import.meta.env.DEV) (window as unknown as { __strike?: () => void }).__strike = () => (state.next = 0);
    return () => {
      geo.dispose();
      mat.dispose();
    };
  }, [geo, mat, state]);

  const strike = (km: number) => {
    const inst = bolt.current;
    if (!inst) return;
    const az = (Math.random() * 1.6 - 0.8) + (Math.random() < 0.5 ? 0 : Math.PI * 0.5); // spread over the sky
    const D = 700 + km * 190;
    const cx = Math.sin(az) * D;
    const cz = -Math.cos(az) * D;
    let x = cx;
    let y = 520 + Math.random() * 160;
    let z = cz;
    let i = 0;
    const per = y / (BOLT_SEGS * 0.75);
    while (i < BOLT_SEGS * 0.75) {
      const nx = x + (Math.random() - 0.5) * 38;
      const ny = Math.max(0, y - per * (0.6 + Math.random() * 0.8));
      const nz = z + (Math.random() - 0.5) * 38;
      put(inst, i++, x, y, z, nx, ny, nz, 3.2);
      x = nx;
      y = ny;
      z = nz;
      if (y <= 0) break;
    }
    // a branch
    let bx = cx;
    let by = 300 + Math.random() * 120;
    let bz = cz;
    const dirx = (Math.random() - 0.5) * 70;
    while (i < BOLT_SEGS) {
      const nx = bx + dirx * 0.2 + (Math.random() - 0.5) * 28;
      const ny = by - 14 - Math.random() * 14;
      const nz = bz + (Math.random() - 0.5) * 28;
      put(inst, i++, bx, by, bz, nx, ny, nz, 1.8);
      bx = nx;
      by = ny;
      bz = nz;
    }
    for (let k = i; k < BOLT_SEGS; k++) put(inst, k, 0, -9999, 0, 0, -9999, 0, 0);
    inst.instanceMatrix.needsUpdate = true;
    state.hasBolt = true;
  };

  const put = (inst: THREE.InstancedMesh, i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number) => {
    tmp.a.set(ax, ay, az);
    tmp.b.set(bx, by, bz);
    tmp.d.subVectors(tmp.b, tmp.a);
    const len = tmp.d.length() + 0.01;
    tmp.q.setFromUnitVectors(tmp.up, tmp.d.normalize());
    tmp.p.addVectors(tmp.a, tmp.b).multiplyScalar(0.5);
    tmp.s.set(w, len, w);
    tmp.m.compose(tmp.p, tmp.q, tmp.s);
    inst.setMatrixAt(i, tmp.m);
  };

  useFrame(({ clock }) => {
    const km = dist.v;
    const inst = bolt.current;
    const now = clock.elapsedTime;
    // flashes are skipped entirely under reduced motion
    const active = km < 15 && !motion.reduced;
    if (active && now > state.next && state.strokes.length === 0) {
      state.strength = THREE.MathUtils.lerp(1, 0.25, km / 15);
      strike(km);
      // a flash is a short run of return strokes
      const n = 1 + Math.floor(Math.random() * 3);
      state.strokes = [];
      let t = now;
      for (let i = 0; i < n; i++) {
        state.strokes.push(t);
        t += 0.07 + Math.random() * 0.09;
      }
      state.t = now;
      const interval = THREE.MathUtils.lerp(1.4, 11, km / 15);
      state.next = now + interval * (0.5 + Math.random());
    }
    let f = 0;
    for (const s of state.strokes) {
      const age = now - s;
      if (age >= 0 && age < 0.22) f = Math.max(f, Math.exp(-age * 22));
    }
    if (state.strokes.length && now - state.strokes[state.strokes.length - 1] > 0.3) state.strokes = [];
    sky.flash = f * state.strength * (active ? 1 : 0);
    if (inst) {
      inst.visible = state.hasBolt && f > 0.02;
      mat.opacity = Math.min(1, f * 1.5);
    }
  });
  return <instancedMesh ref={bolt} args={[geo, mat, BOLT_SEGS]} frustumCulled={false} renderOrder={-500} />;
}

const HAZE_VERT = /* glsl */ `
varying vec3 vW;
varying vec2 vXZ;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vXZ = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const HAZE_FRAG = /* glsl */ `
varying vec3 vW;
varying vec2 vXZ;
uniform float uTime;
uniform float uAmount;
uniform vec3 uColor;
uniform vec2 uDrift;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n(p); p *= 2.05; a *= 0.5; } return s; }
void main() {
  vec2 p = vXZ * 0.012 + uDrift * uTime * 0.02;
  float c = fbm(p) * 0.65 + fbm(p * 2.3 + 7.0) * 0.35;
  float radial = 1.0 - smoothstep(120.0, 420.0, length(vXZ));
  float a = smoothstep(0.35, 0.8, c) * radial * uAmount;
  gl_FragColor = vec4(uColor * a, a);
}
`;

function Haze() {
  const humidity = useSmoothed('Launch/Weather/HumidityPct', 3000);
  const trench = useSmoothed('Launch/Pad/FlameTrenchHumidityPct', 3000);
  const mats = useMemo(
    () =>
      [2.2, 7.5].map(
        () =>
          new THREE.ShaderMaterial({
            vertexShader: HAZE_VERT,
            fragmentShader: HAZE_FRAG,
            transparent: true,
            depthWrite: false,
            uniforms: { uTime: { value: 0 }, uAmount: { value: 0.1 }, uColor: { value: new THREE.Color(0.38, 0.46, 0.6) }, uDrift: { value: new THREE.Vector2() } },
          }),
      ),
    [],
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame(({ clock }) => {
    for (const m of mats) {
      m.uniforms.uTime.value = motion.reduced ? 0 : clock.elapsedTime;
      m.uniforms.uAmount.value = 0.07 + (humidity.v / 100) * 0.1 + Math.max(0, trench.v - 50) / 50 * 0.08;
      m.uniforms.uDrift.value.set(wind.vec.x, wind.vec.z);
    }
  });
  return (
    <group>
      {[2.2, 7.5].map((y, i) => (
        <mesh key={y} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats[i]} renderOrder={1}>
          <planeGeometry args={[900, 900]} />
        </mesh>
      ))}
    </group>
  );
}
