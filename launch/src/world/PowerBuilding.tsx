import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSmoothed } from '../live/hooks';
import type { TagName } from '../live/paths';
import { GSE } from './layout';
import { M } from './materials';
import { beam, boxAt, merge } from './geo';
import { glowTexture } from './textures';

/**
 * GSE power building with two bus status stacks. Each stack shows the bus voltage as a lamp (green
 * above 470 V, amber to 455 V, red below the alarm limit) and the load current as a bar.
 */

const OK = new THREE.Color('#38e08a');
const WARN = new THREE.Color('#ffc247');
const BAD = new THREE.Color('#ff4a3d');
const col = new THREE.Color();

function BusStack({ z, volts, amps }: { z: number; volts: TagName; amps: TagName }) {
  const v = useSmoothed(volts, 700);
  const a = useSmoothed(amps, 700);
  const lamp = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.SpriteMaterial>(null);
  const bar = useRef<THREE.Mesh>(null);
  const tex = useMemo(glowTexture, []);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(() => {
    const volt = v.v;
    // blend through amber so a sag reads as a gradual change
    if (volt >= 470) col.copy(OK);
    else if (volt >= 455) col.copy(OK).lerp(WARN, (470 - volt) / 15);
    else col.copy(WARN).lerp(BAD, Math.min(1, (455 - volt) / 15));
    if (lamp.current) lamp.current.color.copy(col).multiplyScalar(2.4);
    if (halo.current) halo.current.color.copy(col).multiplyScalar(1.8);
    if (bar.current) {
      const k = THREE.MathUtils.clamp(a.v / 120, 0.02, 1);
      bar.current.scale.y = k * 5;
      bar.current.position.y = 1.4 + (k * 5) / 2;
      ((bar.current.material as THREE.MeshBasicMaterial).color as THREE.Color).copy(col).multiplyScalar(1.6);
    }
  });
  return (
    <group position={[-17.2, 0, z]}>
      <mesh position={[-0.2, 5.5, 0]}>
        <boxGeometry args={[0.5, 10, 3.4]} />
        <primitive object={M.steelDark} attach="material" />
      </mesh>
      <mesh position={[-0.55, 7.7, 0]}>
        <sphereGeometry args={[0.7, 20, 14]} />
        <meshBasicMaterial ref={lamp} color="#38e08a" toneMapped={false} />
      </mesh>
      <sprite position={[-0.9, 7.7, 0]} scale={[5, 5, 1]}>
        <spriteMaterial ref={halo} map={tex} color="#38e08a" blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} opacity={0.55} />
      </sprite>
      <mesh ref={bar} position={[-0.55, 4, 0]}>
        <boxGeometry args={[0.2, 1, 0.9]} />
        <meshBasicMaterial color="#38e08a" toneMapped={false} />
      </mesh>
    </group>
  );
}

export function PowerBuilding() {
  const roof = useMemo(() => {
    const p: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) p.push(boxAt(4.2, 1.8, 3.2, -10 + i * 6.4, 10.1, i % 2 ? 3 : -3));
    for (let i = 0; i < 6; i++) p.push(boxAt(0.15, 3, 0.15, -12 + i * 4.8, 11, 6.5));
    return merge(p);
  }, []);
  const windows = useMemo(() => {
    const p: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) p.push(boxAt(2.2, 1.5, 0.15, -13.5 + i * 4.5, 6.2, 8.1));
    return merge(p);
  }, []);
  const yard = useMemo(() => {
    const p: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      p.push(boxAt(4.2, 4.4, 3.4, 26, 2.2, -10 + i * 9));
      for (let f = -3; f <= 3; f++) p.push(boxAt(0.15, 3.6, 3.8, 23.6, 2.4, -10 + i * 9 + f * 0.45));
      p.push(boxAt(0.5, 1.6, 0.5, 26, 5.2, -10 + i * 9));
    }
    return merge(p);
  }, []);
  const tray = useMemo(() => {
    const pts = [
      new THREE.Vector3(GSE.x - 17.6, 0.5, GSE.z + 6),
      new THREE.Vector3(36, 0.5, GSE.z + 6),
      new THREE.Vector3(36, 0.5, -26),
      new THREE.Vector3(12, 0.5, -26),
    ];
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < pts.length - 1; i++) parts.push(beam(pts[i], pts[i + 1], 1.1));
    return merge(parts);
  }, []);
  useEffect(
    () => () => {
      roof.dispose();
      windows.dispose();
      yard.dispose();
      tray.dispose();
    },
    [roof, windows, yard, tray],
  );
  return (
    <group>
      <group position={[GSE.x, 0, GSE.z]}>
        <mesh position={[0, 4.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[35, 9, 17]} />
          <primitive object={M.paintWhite} attach="material" />
        </mesh>
        <mesh position={[0, 9.15, 0]} castShadow>
          <boxGeometry args={[35.6, 0.35, 17.6]} />
          <primitive object={M.steelDark} attach="material" />
        </mesh>
        <mesh geometry={roof} material={M.steel} castShadow />
        <mesh geometry={windows} material={M.glassDim} />
        <mesh geometry={yard} material={M.steel} castShadow />
        <BusStack z={-4} volts="Launch/Pad/GSEPower/BusAVolts" amps="Launch/Pad/GSEPower/BusAAmps" />
        <BusStack z={4} volts="Launch/Pad/GSEPower/BusBVolts" amps="Launch/Pad/GSEPower/BusBAmps" />
      </group>
      <mesh geometry={tray} material={M.steelDark} />
    </group>
  );
}
