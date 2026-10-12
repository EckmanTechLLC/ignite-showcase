import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bool, sinceChange } from '../live/store';
import { useSmoothed } from '../live/hooks';
import { motion } from '../motion';
import { ARM_Y, TOWER, VEH } from './layout';
import { M } from './materials';
import { beam, boxAt, latticeMast, merge } from './geo';

/**
 * Strongback tower with two umbilical arms. The arms swing away with Pad/StrongbackRetractPct;
 * the umbilical hoses stay on the vehicle until Pad/UmbilicalConnected goes false at lift-off, then
 * whip free and hang from the arm.
 */

const FACE_X = TOWER.x + TOWER.w / 2 - 0.6;
const PIVOT_Z = 4.2;
const REACH_X = -(VEH.r + 0.7) - FACE_X; // arm tip stops just short of the vehicle plate
const PHI0 = Math.atan2(PIVOT_Z, REACH_X); // arms point inward at rest
const ARM_LEN = Math.hypot(REACH_X, PIVOT_Z);
const PLATE = new THREE.Vector3(-VEH.r - 0.3, 0, 0);
const MAX_SWING = (52 * Math.PI) / 180;
const HOSE_SEGMENTS = 14;
const HOSE_REST = 15;

function armGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = 2.4;
  const w = 2.2;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (const sz of [-1, 1]) {
    parts.push(beam(v(0, 0, sz * w / 2), v(ARM_LEN, 0, sz * w / 2), 0.28));
    parts.push(beam(v(0, h, sz * w / 2), v(ARM_LEN, h, sz * w / 2), 0.28));
  }
  const bays = 6;
  for (let i = 0; i <= bays; i++) {
    const x = (ARM_LEN * i) / bays;
    for (const sz of [-1, 1]) parts.push(beam(v(x, 0, sz * w / 2), v(x, h, sz * w / 2), 0.18));
    parts.push(beam(v(x, 0, -w / 2), v(x, 0, w / 2), 0.18));
    parts.push(beam(v(x, h, -w / 2), v(x, h, w / 2), 0.18));
    if (i < bays) {
      const x1 = (ARM_LEN * (i + 1)) / bays;
      for (const sz of [-1, 1]) parts.push(beam(v(x, i % 2 ? h : 0, sz * w / 2), v(x1, i % 2 ? 0 : h, sz * w / 2), 0.14));
    }
  }
  parts.push(boxAt(1.2, 1.5, 2.6, ARM_LEN, h / 2, 0)); // umbilical carrier head
  parts.push(boxAt(1.4, 0.18, 2.8, ARM_LEN * 0.5, h + 0.12, 0)); // walkway
  return merge(parts);
}

function platformsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let y = 12; y < TOWER.h; y += 14) parts.push(boxAt(TOWER.w * 0.9, 0.35, TOWER.w * 0.9, 0, y, 0));
  // elevator shaft + service crane
  parts.push(boxAt(2.4, TOWER.h - 4, 2.4, TOWER.w / 2 + 1.4, (TOWER.h - 4) / 2 + 2, TOWER.w / 2 - 1));
  parts.push(boxAt(TOWER.w * 1.7, 0.9, 1.4, -2.5, TOWER.h + 1.2, 0));
  parts.push(boxAt(1.6, 3.2, 1.6, TOWER.w * 0.85, TOWER.h - 0.4, 0));
  return merge(parts);
}

export function Tower() {
  const mast = useMemo(() => latticeMast(TOWER.w * 0.52, TOWER.w * 0.34, TOWER.h, 0.55, 16), []);
  const platforms = useMemo(platformsGeometry, []);
  const arm = useMemo(armGeometry, []);
  const armRefs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const hoseRefs = [useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null)];
  const retract = useSmoothed('Launch/Pad/StrongbackRetractPct', 900);
  const hoseGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.2, 0.2, 1, 8);
    g.rotateX(Math.PI / 2); // axis along Z so lookAt-style orientation is simple
    return g;
  }, []);
  const hoseMat = M.rubber;

  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), e: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1), d: new THREE.Vector3() }),
    [],
  );

  useEffect(
    () => () => {
      mast.dispose();
      platforms.dispose();
      arm.dispose();
      hoseGeo.dispose();
    },
    [mast, platforms, arm, hoseGeo],
  );

  useFrame(({ clock }) => {
    const k = THREE.MathUtils.clamp(retract.v / 100, 0, 1);
    const connected = bool('Launch/Pad/UmbilicalConnected', true);
    const since = connected ? 0 : Math.min(sinceChange('Launch/Pad/UmbilicalConnected'), 30);
    ARM_Y.forEach((y, i) => {
      const dir = i === 0 ? 1 : -1;
      const swing = dir * (-PHI0 + k * (PHI0 + MAX_SWING));
      const g = armRefs[i].current;
      if (g) g.rotation.y = swing;
      const inst = hoseRefs[i].current;
      if (!inst) return;
      // arm tip in world space
      const pivotZ = -dir * PIVOT_Z;
      const tipX = FACE_X + Math.cos(swing) * ARM_LEN;
      const tipZ = pivotZ - Math.sin(swing) * ARM_LEN;
      const start = tmp.a.set(tipX, y + 1.2, tipZ);
      const plate = tmp.b.set(PLATE.x, y + 0.2, 0);
      const hang = tmp.c.set(tipX, y + 1.2 - HOSE_REST * 0.88, tipZ);
      // end point: plate while connected; after release it swings down to hang under the arm tip
      let end = plate;
      let sag = 0;
      if (!connected || since > 0) {
        const t = THREE.MathUtils.clamp(since / 1.1, 0, 1);
        const e = t * t * (3 - 2 * t);
        const swingOsc = motion.reduced ? 0 : Math.exp(-since * 0.35) * Math.sin(clock.elapsedTime * 2.1 + i) * 2.4 * e;
        end = tmp.e.copy(plate).lerp(hang, e);
        end.x += swingOsc;
        end.z += swingOsc * 0.5;
        sag = 0.3 * (1 - e);
      }
      const dist = start.distanceTo(end);
      const droop = connected ? Math.sqrt(Math.max(0, HOSE_REST * HOSE_REST - dist * dist)) * 0.5 : sag;
      const ctrlX = (start.x + end.x) / 2;
      const ctrlY = (start.y + end.y) / 2 - (connected ? droop : Math.max(0, HOSE_REST - dist) * 0.25);
      const ctrlZ = (start.z + end.z) / 2;
      let px = start.x;
      let py = start.y;
      let pz = start.z;
      for (let s = 1; s <= HOSE_SEGMENTS; s++) {
        const u = s / HOSE_SEGMENTS;
        const a0 = (1 - u) * (1 - u);
        const a1 = 2 * (1 - u) * u;
        const a2 = u * u;
        const nx = a0 * start.x + a1 * ctrlX + a2 * end.x;
        const ny = a0 * start.y + a1 * ctrlY + a2 * end.y;
        const nz = a0 * start.z + a1 * ctrlZ + a2 * end.z;
        tmp.d.set(nx - px, ny - py, nz - pz);
        const len = tmp.d.length() + 0.02;
        tmp.q.setFromUnitVectors(tmp.z, tmp.d.normalize());
        tmp.p.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
        tmp.s.set(1, 1, len);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        inst.setMatrixAt(s - 1, tmp.m);
        px = nx;
        py = ny;
        pz = nz;
      }
      inst.instanceMatrix.needsUpdate = true;
    });
  });

  return (
    <group>
      <group position={[TOWER.x, 0, TOWER.z]}>
        <mesh geometry={mast} material={M.paintRed} castShadow receiveShadow />
        <mesh geometry={platforms} material={M.steel} castShadow />
        {/* tip mast */}
        <mesh position={[0, TOWER.h + 6, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.3, 12, 8]} />
          <primitive object={M.steel} attach="material" />
        </mesh>
      </group>
      {ARM_Y.map((y, i) => (
        <group key={y} position={[FACE_X, y, i === 0 ? -PIVOT_Z : PIVOT_Z]}>
          <group ref={armRefs[i]}>
            <mesh geometry={arm} material={M.paintWhite} position={[0, -1.2, 0]} castShadow />
          </group>
        </group>
      ))}
      {ARM_Y.map((y, i) => (
        <instancedMesh key={`h${y}`} ref={hoseRefs[i]} args={[hoseGeo, hoseMat, HOSE_SEGMENTS]} frustumCulled={false} castShadow />
      ))}
    </group>
  );
}
