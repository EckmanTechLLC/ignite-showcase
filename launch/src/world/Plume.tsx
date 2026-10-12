import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bool, str } from '../live/store';
import { useSmoothed } from '../live/hooks';
import { motion } from '../motion';
import { glowTexture, puffTexture } from './textures';
import { Emitter, Particles, useParticleSystem } from './particles';

/**
 * Engine exhaust: two additive, shader-animated cones (hot core, orange sheath), a glow sprite for
 * the bloom pass, a point light that lights the pad, the flame along the trench, and the ground
 * cloud thrown out of the trench at lift-off. Everything is driven from smoothed tags in useFrame.
 */

const CONE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const CONE_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
uniform float uTime;
uniform float uInt;
uniform float uVac;
uniform float uSeed;
uniform vec3 uHot;
uniform vec3 uCool;
uniform float uGain;
void main() {
  float along = 1.0 - vUv.y;
  float rim = abs(dot(normalize(vN), normalize(vV)));
  float body = pow(rim, 0.65);
  float ang = vUv.x * 6.2831853;
  float flick = 0.72 + 0.28 * sin(along * 24.0 - uTime * 34.0 + sin(ang * 3.0 + uTime * 9.0 + uSeed) * 2.2);
  flick *= 0.85 + 0.15 * sin(along * 61.0 - uTime * 52.0 + ang * 5.0);
  float diamonds = 1.0 + 0.7 * pow(0.5 + 0.5 * cos(along * 38.0 + uSeed), 4.0) * (1.0 - along) * (1.0 - uVac) * smoothstep(0.0, 0.06, along);
  float fade = pow(max(1.0 - along, 0.0), 1.5 + uVac * 0.6);
  float a = body * fade * flick * diamonds * uInt;
  vec3 col = mix(uHot, uCool, pow(along, 0.55));
  gl_FragColor = vec4(col * a * uGain, a);
}
`;

function coneGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1.95, 1, 40, 14, true);
  g.translate(0, -0.5, 0);
  return g;
}

function coneMaterial(hot: THREE.ColorRepresentation, cool: THREE.ColorRepresentation, gain: number, seed: number) {
  return new THREE.ShaderMaterial({
    vertexShader: CONE_VERT,
    fragmentShader: CONE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uInt: { value: 0 },
      uVac: { value: 0 },
      uSeed: { value: seed },
      uHot: { value: new THREE.Color(hot) },
      uCool: { value: new THREE.Color(cool) },
      uGain: { value: gain },
    },
  });
}

const S2_ENGINE_Y = 42.2; // exit plane of the stage 2 vacuum engine, vehicle-local

interface PlumeProps {
  /** Receives true while the plume is visible enough to matter (used by pad effects). */
  onGround?: boolean;
}

export function EnginePlume(_props: PlumeProps) {
  const group = useRef<THREE.Group>(null);
  const coneGeo = useMemo(coneGeometry, []);
  const core = useMemo(() => coneMaterial('#fff4e0', '#ff9a40', 2.4, 1.3), []);
  const sheath = useMemo(() => coneMaterial('#ffb060', '#c8421a', 1.5, 4.1), []);
  const coreMesh = useRef<THREE.Mesh>(null);
  const sheathMesh = useRef<THREE.Mesh>(null);
  const sprite = useRef<THREE.Sprite>(null);
  const light = useRef<THREE.PointLight>(null);
  const glowTex = useMemo(glowTexture, []);
  const thrust = useSmoothed('Launch/Vehicle/ThrustPct', 350);
  const alt = useSmoothed('Launch/Vehicle/AltitudeM', 500);
  const gate = useRef(0);

  useEffect(
    () => () => {
      coneGeo.dispose();
      core.dispose();
      sheath.dispose();
      glowTex.dispose();
    },
    [coneGeo, core, sheath, glowTex],
  );

  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g) return;
    const firing = str('Launch/Vehicle/EngineChillState') === 'FIRING';
    gate.current += ((firing ? 1 : 0) - gate.current) * Math.min(1, dt * 7);
    const stage2 = bool('Launch/Vehicle/StageSep');
    const t = THREE.MathUtils.clamp(thrust.v / 100, 0, 1.05) * gate.current;
    const altM = Math.max(0, alt.v);
    const vac = THREE.MathUtils.clamp(altM / 70000, 0, 1);
    const flicker = motion.reduced ? 1 : 0.94 + 0.06 * Math.sin(clock.elapsedTime * 41) * Math.sin(clock.elapsedTime * 17.3);

    g.position.y = stage2 ? S2_ENGINE_Y : 0;
    const width = (stage2 ? 2.1 : 4.7) * (0.8 + 0.2 * t) * (1 + 2.8 * vac);
    const length = (stage2 ? 16 + 34 * t : 20 + 62 * t) * (1 + 0.6 * vac);
    const visible = t > 0.01;
    for (const m of [coreMesh.current, sheathMesh.current]) if (m) m.visible = visible;
    if (visible) {
      coreMesh.current!.scale.set(width * 0.72, length * 0.8, width * 0.72);
      sheathMesh.current!.scale.set(width * 1.08, length, width * 1.08);
      for (const m of [core, sheath]) {
        m.uniforms.uTime.value = clock.elapsedTime;
        m.uniforms.uInt.value = t * flicker * (1 - 0.35 * vac);
        m.uniforms.uVac.value = vac;
      }
      // vacuum plumes shift toward blue-white and dim
      core.uniforms.uCool.value.setRGB(1, 0.6 + 0.2 * vac, 0.25 + 0.7 * vac);
    }
    const sp = sprite.current;
    if (sp) {
      sp.visible = visible;
      const s = (stage2 ? 9 : 26) * (0.5 + 0.7 * t) * (1 + 0.5 * vac);
      sp.scale.set(s, s, 1);
      (sp.material as THREE.SpriteMaterial).opacity = Math.min(1, t * 1.2) * flicker;
    }
    const l = light.current;
    if (l) {
      const near = 1 - THREE.MathUtils.smoothstep(altM, 20, 700);
      l.intensity = visible ? 70000 * t * (0.2 + 0.8 * near) * flicker * (stage2 ? 0.2 : 1) : 0;
    }
  });

  return (
    <group ref={group}>
      <mesh ref={coreMesh} geometry={coneGeo} material={core} renderOrder={5} frustumCulled={false} />
      <mesh ref={sheathMesh} geometry={coneGeo} material={sheath} renderOrder={4} frustumCulled={false} />
      <sprite ref={sprite} position={[0, -2, 0]} renderOrder={6}>
        <spriteMaterial map={glowTex} color={new THREE.Color(2.4, 1.3, 0.55)} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
      </sprite>
      <pointLight ref={light} position={[0, -6, 0]} color="#ff9a4a" intensity={0} distance={0} decay={2} />
    </group>
  );
}

/**
 * Flame spreading along the trench and the ground cloud, in world space (not attached to the
 * vehicle). Intensity follows thrust while the vehicle is still close to the pad.
 */
export function PadExhaust() {
  const coneGeo = useMemo(coneGeometry, []);
  const flame = useMemo(() => coneMaterial('#ffe2b0', '#ff6a24', 0.9, 7.7), []);
  const mesh = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const puff = useMemo(() => puffTexture(11), []);
  const smoke = useParticleSystem(() => ({
    max: motion.reduced ? 160 : 420,
    texture: puff,
    sizeStart: 9,
    sizeEnd: 38,
    colorStart: new THREE.Color(1.7, 0.95, 0.5),
    colorEnd: new THREE.Color(0.1, 0.12, 0.16),
    alpha: 0.55,
    fadePow: 1.1,
    drag: 0.4,
    gravity: -0.5,
    windInfluence: 0.55,
    spin: 0.8,
  }));
  const em1 = useMemo(() => new Emitter(), []);
  const em2 = useMemo(() => new Emitter(), []);
  const thrust = useSmoothed('Launch/Vehicle/ThrustPct', 400);
  const alt = useSmoothed('Launch/Vehicle/AltitudeM', 500);
  const heat = useRef(0);

  useEffect(
    () => () => {
      coneGeo.dispose();
      flame.dispose();
      puff.dispose();
    },
    [coneGeo, flame, puff],
  );

  useFrame(({ clock }, dt) => {
    const firing = str('Launch/Vehicle/EngineChillState') === 'FIRING' && !bool('Launch/Vehicle/StageSep');
    const t = firing ? THREE.MathUtils.clamp(thrust.v / 100, 0, 1) : 0;
    const altM = Math.max(0, alt.v);
    const low = 1 - THREE.MathUtils.smoothstep(altM, 30, 380);
    const k = t * low;
    heat.current += (k - heat.current) * Math.min(1, dt * 3);
    const m = mesh.current;
    if (m) {
      m.visible = heat.current > 0.01;
      flame.uniforms.uTime.value = clock.elapsedTime;
      flame.uniforms.uInt.value = heat.current;
      // lay the cone along +Z, inside the trench, widening away from the deflector
      m.scale.set(6.5, 66 * (0.5 + 0.5 * heat.current), 6.5);
    }
    const l = light.current;
    if (l) l.intensity = 26000 * heat.current;

    const rate = k * (motion.reduced ? 40 : 130);
    em1.tick(rate, dt, () => {
      const x = (Math.random() - 0.5) * 12;
      smoke.emit(x, 1 + Math.random() * 5, 42 + Math.random() * 25, (Math.random() - 0.5) * 8, 3 + Math.random() * 5, 20 + Math.random() * 28, 6 + Math.random() * 5, 0.8 + Math.random() * 0.8);
    });
    em2.tick(rate * 0.8, dt, () => {
      const a = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 6;
      smoke.emit(Math.cos(a) * r, 1.5 + Math.random() * 3, Math.sin(a) * r, Math.cos(a) * (10 + Math.random() * 16), 2 + Math.random() * 5, Math.sin(a) * (10 + Math.random() * 16), 6 + Math.random() * 5, 0.8 + Math.random() * 0.9);
    });
  });

  return (
    <group>
      {/* flame laid down the trench: cone axis points along +Z */}
      <mesh ref={mesh} geometry={coneGeo} material={flame} position={[0, -5.2, -4]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3} frustumCulled={false} />
      <pointLight ref={light} position={[0, -3, 14]} color="#ff8a3a" intensity={0} decay={2} />
      <Particles sys={smoke} />
    </group>
  );
}
