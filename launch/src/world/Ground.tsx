import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSmoothed } from '../live/hooks';
import { M } from './materials';
import { CH4_FARM, GSE, LOX_FARM, TOWER, TRENCH, WATER } from './layout';
import { roadStrip } from './road';

/**
 * Terrain: a dark ground disc and a concrete pad slab, both with a rectangular hole over the flame
 * trench; trench walls, floor and the flame deflector; asphalt roads between the facilities.
 */

const tw = TRENCH.halfWidth;

function holedShape(outer: THREE.Shape): THREE.Shape {
  // After rotateX(-PI/2) shape +y maps to world -z. The trench spans world z in [zMin, zMax].
  const hole = new THREE.Path();
  hole.moveTo(-tw, -TRENCH.zMax);
  hole.lineTo(tw, -TRENCH.zMax);
  hole.lineTo(tw, -TRENCH.zMin);
  hole.lineTo(-tw, -TRENCH.zMin);
  hole.closePath();
  outer.holes.push(hole);
  return outer;
}

function discShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return holedShape(s);
}

function slabShape(hw: number, zMin: number, zMax: number): THREE.Shape {
  // zMin/zMax are world z; shape y = -z
  const s = new THREE.Shape();
  s.moveTo(-hw, -zMax);
  s.lineTo(hw, -zMax);
  s.lineTo(hw, -zMin);
  s.lineTo(-hw, -zMin);
  s.closePath();
  return holedShape(s);
}

export function Ground() {
  const groundGeo = useMemo(() => {
    const g = new THREE.ShapeGeometry(discShape(7000), 64);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const slabGeo = useMemo(() => {
    const g = new THREE.ShapeGeometry(slabShape(78, -78, 122));
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const deflectorGeo = useMemo(() => {
    // Wedge: high at the back (z = zMin), sloping down toward +z.
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(34, 0);
    s.lineTo(0, 7.5);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: tw * 2 - 0.6, bevelEnabled: false });
    // shape x -> world z, shape y -> world y; extrusion along x
    g.rotateY(-Math.PI / 2);
    g.translate(tw - 0.3, 0, 0);
    return g;
  }, []);

  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const temp = useSmoothed('Launch/Pad/FlameTrenchTempC', 1500);
  useFrame(() => {
    const m = glow.current;
    if (!m) return;
    const k = THREE.MathUtils.clamp((temp.v - 30) / 130, 0, 1);
    m.emissiveIntensity = k * k * 2.2;
  });

  const wallLen = TRENCH.zMax - TRENCH.zMin;
  const wallZ = (TRENCH.zMax + TRENCH.zMin) / 2;
  const floorY = -TRENCH.depth;

  return (
    <group>
      <mesh geometry={groundGeo} material={M.ground} position={[0, -0.05, 0]} receiveShadow />
      <mesh geometry={slabGeo} material={M.concrete} position={[0, 0.02, 0]} receiveShadow />

      {/* trench */}
      <mesh position={[0, floorY, wallZ]} receiveShadow>
        <boxGeometry args={[tw * 2 + 1.4, 0.6, wallLen + 1]} />
        <primitive object={M.concreteFlat} attach="material" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (tw + 0.35), floorY / 2, wallZ]} receiveShadow castShadow>
          <boxGeometry args={[0.7, TRENCH.depth + 0.5, wallLen + 1]} />
          <primitive object={M.concreteFlat} attach="material" />
        </mesh>
      ))}
      <mesh position={[0, floorY / 2, TRENCH.zMin - 0.4]} receiveShadow>
        <boxGeometry args={[tw * 2 + 1.4, TRENCH.depth + 0.5, 0.8]} />
        <primitive object={M.concreteFlat} attach="material" />
      </mesh>
      {/* flame deflector, glows with the trench temperature */}
      <mesh geometry={deflectorGeo} position={[0, floorY + 0.3, TRENCH.zMin + 3]} castShadow receiveShadow>
        <meshStandardMaterial ref={glow} color="#4a4038" roughness={0.8} metalness={0.3} emissive="#ff5a14" emissiveIntensity={0} />
      </mesh>
      {/* copper-coloured scorch plate on the deflector face */}
      {/* trench rim kerb */}
      {[-1, 1].map((s) => (
        <mesh key={`k${s}`} position={[s * (tw + 1.2), 0.25, wallZ]} receiveShadow>
          <boxGeometry args={[0.9, 0.5, wallLen + 2]} />
          <primitive object={M.steelDark} attach="material" />
        </mesh>
      ))}

      {/* roads */}
      <Roads />
    </group>
  );
}

function Roads() {
  const roads = useMemo(
    () => [
      roadStrip([[0, 124], [0, 210], [96, 210]], 11),
      roadStrip([[0, -80], [0, -150], [GSE.x - 20, -150], [GSE.x - 20, GSE.z + 18]], 9),
      roadStrip([[TOWER.x - 18, 0], [LOX_FARM.x + 36, 0], [LOX_FARM.x + 36, LOX_FARM.z + 6]], 8),
      roadStrip([[LOX_FARM.x + 36, 0], [CH4_FARM.x + 36, CH4_FARM.z - 6]], 8),
      roadStrip([[78, 30], [WATER.x - 20, 30], [WATER.x - 20, WATER.z]], 8),
    ],
    [],
  );
  return (
    <group>
      {roads.map((g, i) => (
        <mesh key={i} geometry={g} material={M.road} position={[0, 0.06, 0]} receiveShadow />
      ))}
    </group>
  );
}
