import { useMemo } from 'react';
import * as THREE from 'three';
import { M } from './materials';
import { MOUNT_TOP, TRENCH } from './layout';
import { beam, boxAt, cylAt, merge } from './geo';

/**
 * The launch mount: a ring-shaped launch table on eight legs above the flame trench, hold-down
 * clamps, water-cooled ring header, a small service stand and cable runs.
 */

export function LaunchMount() {
  const table = useMemo(() => {
    const outer = new THREE.Shape();
    const R = 12.5;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R;
      if (i === 0) outer.moveTo(x, y);
      else outer.lineTo(x, y);
    }
    outer.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, 5.6, 0, Math.PI * 2, true);
    outer.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(outer, { depth: 2.6, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2, curveSegments: 24 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, MOUNT_TOP - 2.6, 0);
    return g;
  }, []);

  const legs = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const hy = (MOUNT_TOP - 2.6) / 2;
    for (const sx of [-1, 1]) {
      for (const z of [-9.5, -3.2, 3.2, 9.5]) {
        parts.push(boxAt(1.8, MOUNT_TOP - 2.6, 1.8, sx * (TRENCH.halfWidth + 2.2), hy, z));
      }
    }
    // cross girders
    for (const sx of [-1, 1]) {
      parts.push(beam(new THREE.Vector3(sx * (TRENCH.halfWidth + 2.2), 0.4, -9.5), new THREE.Vector3(sx * (TRENCH.halfWidth + 2.2), MOUNT_TOP - 2.8, -3.2), 0.5));
      parts.push(beam(new THREE.Vector3(sx * (TRENCH.halfWidth + 2.2), MOUNT_TOP - 2.8, 3.2), new THREE.Vector3(sx * (TRENCH.halfWidth + 2.2), 0.4, 9.5), 0.5));
    }
    return merge(parts);
  }, []);

  const clamps = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.cos(a) * 6.3;
      const z = Math.sin(a) * 6.3;
      const c = boxAt(1.1, 1.6, 1.1, x, MOUNT_TOP + 0.8, z);
      c.rotateY(0);
      parts.push(c);
      parts.push(cylAt(0.28, 0.28, 0.9, x * 0.9, MOUNT_TOP + 1.7, z * 0.9, 10));
    }
    return merge(parts);
  }, []);

  const ring = useMemo(() => new THREE.TorusGeometry(7.4, 0.32, 10, 48), []);

  return (
    <group>
      <mesh geometry={table} material={M.concreteDark} castShadow receiveShadow />
      <mesh geometry={legs} material={M.steel} castShadow receiveShadow />
      <mesh geometry={clamps} material={M.steelDark} castShadow />
      <mesh geometry={ring} material={M.pipe} position={[0, MOUNT_TOP + 0.35, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow />
      {/* hazard stripe ring */}
      <mesh position={[0, MOUNT_TOP + 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.7, 6.0, 48]} />
        <meshStandardMaterial color="#d9a21b" roughness={0.7} />
      </mesh>
      {/* service stand and cable run */}
      <mesh position={[11.5, 2.2, -14]} castShadow receiveShadow>
        <boxGeometry args={[5, 4.4, 4]} />
        <primitive object={M.paintWhite} attach="material" />
      </mesh>
      <mesh position={[11.5, 4.6, -14]} castShadow>
        <boxGeometry args={[5.4, 0.4, 4.4]} />
        <primitive object={M.steelDark} attach="material" />
      </mesh>
    </group>
  );
}
