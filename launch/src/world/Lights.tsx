import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { str } from '../live/store';
import { motion } from '../motion';
import { FLOOD_RING, MAST_H, MAST_POS, MOON_DIR, TOWER } from './layout';
import { M } from './materials';
import { boxAt, cylAt, merge } from './geo';
import { sky } from './skyState';
import { glowTexture } from './textures';

/**
 * Night lighting: cool moon key with shadows around the pad, procedural environment (reflections for
 * the stainless vehicle), pad floodlights with spots aimed at the stack, and abort strobes.
 */

export function Lighting() {
  const hemi = useRef<THREE.HemisphereLight>(null);
  const moon = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const h = hemi.current;
    if (h) h.intensity = 0.55 + sky.flash * 1.1;
    const m = moon.current;
    if (m) m.intensity = 1.3 + sky.flash * 1.6;
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={['#5b79b5', '#1a1d26', 0.55]} />
      <directionalLight
        ref={moon}
        color="#9db6e8"
        intensity={0.95}
        position={[MOON_DIR[0] * 220, MOON_DIR[1] * 220, MOON_DIR[2] * 220]}
        target={target}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-85}
        shadow-camera-right={85}
        shadow-camera-top={95}
        shadow-camera-bottom={-70}
        shadow-camera-near={20}
        shadow-camera-far={520}
        shadow-bias={-0.0004}
        shadow-normalBias={0.35}
      />
      <primitive object={target} position={[0, 20, 0]} />
      <ProceduralEnvironment />
    </>
  );
}

/**
 * Reflection environment built from a few emissive panels (cool sky, warm floodlight, ground bounce)
 * and prefiltered once with PMREM. Replaces any HDR file: nothing is downloaded.
 */
function ProceduralEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const env = new THREE.Scene();
    env.background = new THREE.Color(0.012, 0.016, 0.03);
    const panel = (w: number, h: number, color: [number, number, number], pos: [number, number, number], look: [number, number, number]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), side: THREE.DoubleSide, toneMapped: false }));
      m.position.set(...pos);
      m.lookAt(...look);
      env.add(m);
    };
    panel(12, 7, [0.9, 1.2, 2.4], [-8, 5, 6], [0, 0, 0]); // cool key from the sky side
    panel(9, 6, [2.2, 1.7, 1.1], [9, 4, -4], [0, 0, 0]); // warm floodlight
    panel(14, 14, [0.5, 0.65, 1.1], [0, 11, 0], [0, 0, 0]); // overhead skylight
    panel(24, 24, [0.12, 0.13, 0.15], [0, -6, 0], [0, 0, 0]); // ground bounce
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(env, 0.03);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
    env.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    return () => {
      scene.environment = null;
      rt.dispose();
    };
  }, [gl, scene]);
  return null;
}

function FloodSpot({ position, aim }: { position: [number, number, number]; aim: [number, number, number] }) {
  const target = useMemo(() => {
    const t = new THREE.Object3D();
    t.position.set(...aim);
    return t;
  }, [aim]);
  return (
    <>
      <spotLight position={position} target={target} color="#fff0d8" intensity={20000} angle={0.3} penumbra={0.75} decay={2} distance={0} />
      <primitive object={target} />
    </>
  );
}

const POLE_H = 34;

export function Floodlights() {
  const tex = useMemo(glowTexture, []);
  const poles = useMemo(() => {
    const out: { x: number; z: number; a: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      out.push({ x: Math.cos(a) * FLOOD_RING, z: Math.sin(a) * FLOOD_RING, a });
    }
    return out;
  }, []);
  const poleGeo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [cylAt(0.25, 0.55, POLE_H, 0, POLE_H / 2, 0, 10), boxAt(5.2, 0.5, 1.4, 0, POLE_H + 0.4, 0)];
    return merge(parts);
  }, []);
  const lampGeo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) parts.push(boxAt(1.0, 0.7, 0.2, -1.95 + i * 1.3, POLE_H + 0.45, 0.8));
    return merge(parts);
  }, []);
  useEffect(
    () => () => {
      tex.dispose();
      poleGeo.dispose();
      lampGeo.dispose();
    },
    [tex, poleGeo, lampGeo],
  );
  return (
    <group>
      {poles.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          {/* heads face the pad: rotate so +Z (lamp side) points at the origin */}
          <group rotation={[0, Math.atan2(-p.x, -p.z), 0]}>
            <mesh geometry={poleGeo} material={M.steelDark} castShadow />
            <mesh geometry={lampGeo}>
              <meshBasicMaterial color={new THREE.Color(3.2, 3, 2.5)} toneMapped={false} />
            </mesh>
            <sprite position={[0, POLE_H + 0.6, 1.4]} scale={[5.5, 5.5, 1]}>
              <spriteMaterial map={tex} color={new THREE.Color(1.3, 1.2, 1)} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} opacity={0.4} />
            </sprite>
          </group>
          {i % 2 === 0 && <FloodSpot position={[0, POLE_H + 0.5, 0]} aim={[-p.x + 0, 24, -p.z]} />}
        </group>
      ))}
    </group>
  );
}

/** Red strobes on the tower, the pad corners and the masts during Phase=ABORT. */
export function AbortBeacons() {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.0, 0.0), toneMapped: false }), []);
  const light = useRef<THREE.PointLight>(null);
  const spots: [number, number, number][] = useMemo(
    () => [
      [TOWER.x, TOWER.h + 14, TOWER.z],
      [-62, 4, -62],
      [62, 4, -62],
      [62, 4, 110],
      [-62, 4, 110],
      ...MAST_POS.map(([x, z]) => [x, MAST_H + 12, z] as [number, number, number]),
    ],
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(({ clock }) => {
    const abort = str('Launch/Clock/Phase') === 'ABORT';
    // strobing is a photosensitivity risk: reduced motion gets a steady red glow instead
    const on = abort ? (motion.reduced ? 1 : Math.sin(clock.elapsedTime * 8) > 0.15 ? 1 : 0) : 0;
    mat.color.setRGB(0.06 + 5 * on, 0.0, 0.0);
    if (light.current) light.current.intensity = on * (motion.reduced ? 5000 : 30000);
  });
  return (
    <group>
      {spots.map((p, i) => (
        <mesh key={i} position={p} material={mat}>
          <sphereGeometry args={[i === 0 ? 0.9 : 0.6, 12, 10]} />
        </mesh>
      ))}
      <pointLight ref={light} position={[0, 30, 20]} color="#ff2a1a" intensity={0} decay={2} />
    </group>
  );
}
