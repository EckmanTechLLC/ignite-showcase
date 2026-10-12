import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { motion } from '../motion';
import { MAST_H, MAST_POS } from './layout';
import { M } from './materials';
import { catenary, latticeMast } from './geo';
import { glowTexture } from './textures';

/** Four lightning masts at the corners of the complex, joined by catenary shield wires. */

export function Masts() {
  const mast = useMemo(() => latticeMast(3.2, 0.9, MAST_H, 0.32, 14), []);
  const wires = useMemo(() => {
    const tops = MAST_POS.map(([x, z]) => new THREE.Vector3(x, MAST_H - 1, z));
    const out: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const pts = catenary(tops[i], tops[(i + 1) % 4], 7 + (i % 2) * 2.5, 48);
      out.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.14, 5, false));
    }
    return out;
  }, []);
  const tex = useMemo(glowTexture, []);
  const lights = useRef<(THREE.Sprite | null)[]>([]);
  useEffect(
    () => () => {
      mast.dispose();
      wires.forEach((w) => w.dispose());
      tex.dispose();
    },
    [mast, wires, tex],
  );
  // aircraft-warning beacons: slow red pulse (steady under reduced motion)
  useFrame(({ clock }) => {
    lights.current.forEach((s, i) => {
      if (!s) return;
      const pulse = motion.reduced ? 0.8 : 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.4 + i * 0.7), 3);
      (s.material as THREE.SpriteMaterial).opacity = pulse;
    });
  });
  return (
    <group>
      {MAST_POS.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh geometry={mast} material={M.steel} />
          <mesh position={[0, MAST_H + 3, 0]}>
            <cylinderGeometry args={[0.08, 0.2, 7, 6]} />
            <primitive object={M.steel} attach="material" />
          </mesh>
          <mesh position={[0, MAST_H + 6.6, 0]}>
            <sphereGeometry args={[0.45, 10, 8]} />
            <meshBasicMaterial color={new THREE.Color(3, 0.25, 0.2)} toneMapped={false} />
          </mesh>
          <sprite
            ref={(s) => {
              lights.current[i] = s;
            }}
            position={[0, MAST_H + 6.6, 0]}
            scale={[6, 6, 1]}
          >
            <spriteMaterial map={tex} color={new THREE.Color(2, 0.2, 0.15)} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
          </sprite>
        </group>
      ))}
      {wires.map((g, i) => (
        <mesh key={i} geometry={g} material={M.steelDark} />
      ))}
    </group>
  );
}
