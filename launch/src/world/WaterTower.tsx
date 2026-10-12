import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { str } from '../live/store';
import { useSmoothed } from '../live/hooks';
import { motion } from '../motion';
import { MOUNT_TOP, TRENCH, WATER } from './layout';
import { M } from './materials';
import { latticeMast, cylAt, merge } from './geo';
import { Emitter, Particles, useParticleSystem } from './particles';
import { dropTexture, puffTexture } from './textures';
import { FlowLine } from './FlowLine';

/**
 * Deluge water tower (level follows Pad/WaterTowerLevelPct), the pipe to the mount, and the deluge
 * nozzles: spray arcs and steam proportional to DelugeFlowLpm.
 */

const TANK_Y = 34;
const TANK_H = 15;
const TANK_R = 10.5;
const FULL_FLOW = 45000;
const WATER_COLOR = '#58b8ff';

const PIPE = [
  new THREE.Vector3(WATER.x, 1.8, WATER.z + 12),
  new THREE.Vector3(WATER.x, 1.8, 52),
  new THREE.Vector3(40, 1.8, 52),
  new THREE.Vector3(40, 1.8, 6),
  new THREE.Vector3(13.8, 1.8, 6),
  new THREE.Vector3(13.8, MOUNT_TOP + 0.5, 6),
  new THREE.Vector3(7.3, MOUNT_TOP + 0.5, 3.4),
];

export function WaterTower() {
  const legs = useMemo(() => latticeMast(9.5, 7.2, TANK_Y, 0.6, 5), []);
  const detail = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [cylAt(0.5, 0.5, 14, 0, TANK_Y / 2, 0, 8)];
    return merge(parts);
  }, []);
  const level = useSmoothed('Launch/Pad/WaterTowerLevelPct', 1500);
  const fill = useRef<THREE.Mesh>(null);
  const gauge = useMemo(() => new THREE.MeshStandardMaterial({ color: '#04111c', emissive: WATER_COLOR, emissiveIntensity: 2.4, toneMapped: false }), []);
  useEffect(
    () => () => {
      legs.dispose();
      detail.dispose();
      gauge.dispose();
    },
    [legs, detail, gauge],
  );
  useFrame(() => {
    const f = fill.current;
    if (!f) return;
    const lv = THREE.MathUtils.clamp(level.v / 100, 0, 1);
    f.visible = lv > 0.002;
    f.scale.y = Math.max(0.001, lv * (TANK_H - 2));
    f.position.y = TANK_Y + 1 + (lv * (TANK_H - 2)) / 2;
  });

  return (
    <group>
      <group position={[WATER.x, 0, WATER.z]}>
        <mesh geometry={legs} material={M.steel} castShadow />
        <mesh geometry={detail} material={M.pipe} />
        <mesh position={[0, TANK_Y + TANK_H / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[TANK_R, TANK_R, TANK_H, 48]} />
          <primitive object={M.paintWhite} attach="material" />
        </mesh>
        <mesh position={[0, TANK_Y + TANK_H + 2.6, 0]} castShadow>
          <coneGeometry args={[TANK_R + 0.4, 5.2, 48]} />
          <primitive object={M.steelDark} attach="material" />
        </mesh>
        <mesh position={[0, TANK_Y - 1.6, 0]} castShadow>
          <cylinderGeometry args={[TANK_R, 3, 3.2, 40]} />
          <primitive object={M.paintWhite} attach="material" />
        </mesh>
        {/* sight glass with the live level */}
        <mesh position={[-TANK_R - 0.05, TANK_Y + TANK_H / 2, 0]}>
          <boxGeometry args={[0.3, TANK_H - 1.2, 1.7]} />
          <primitive object={M.heatShield} attach="material" />
        </mesh>
        <mesh ref={fill} material={gauge} position={[-TANK_R - 0.2, TANK_Y + 1, 0]}>
          <boxGeometry args={[0.2, 1, 1.1]} />
        </mesh>
        {/* walkway ring */}
        <mesh position={[0, TANK_Y + TANK_H - 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[TANK_R + 0.9, 0.1, 6, 48]} />
          <primitive object={M.steel} attach="material" />
        </mesh>
      </group>
      <FlowLine points={PIPE} tag="Launch/Pad/DelugeFlowLpm" fullScale={FULL_FLOW} color={WATER_COLOR} radius={0.7} />
      <Deluge />
    </group>
  );
}

function Deluge() {
  const flow = useSmoothed('Launch/Pad/DelugeFlowLpm', 700);
  const hum = useSmoothed('Launch/Pad/FlameTrenchHumidityPct', 2500);
  const drop = useMemo(dropTexture, []);
  const puff = useMemo(() => puffTexture(17), []);
  const spray = useParticleSystem(() => ({
    max: motion.reduced ? 500 : 1500,
    texture: drop,
    additive: true,
    sizeStart: 0.55,
    sizeEnd: 0.9,
    colorStart: new THREE.Color(0.7, 1.1, 1.6),
    colorEnd: new THREE.Color(0.35, 0.6, 0.9),
    alpha: 0.9,
    fadePow: 0.6,
    drag: 0.05,
    gravity: 9.8,
    windInfluence: 0.1,
    spin: 0,
  }));
  const steam = useParticleSystem(() => ({
    max: motion.reduced ? 120 : 420,
    texture: puff,
    sizeStart: 5,
    sizeEnd: 30,
    colorStart: new THREE.Color(0.9, 0.93, 1),
    colorEnd: new THREE.Color(0.55, 0.6, 0.7),
    alpha: 0.4,
    fadePow: 1.3,
    drag: 0.5,
    gravity: -1.1,
    windInfluence: 0.8,
  }));
  const eSpray = useMemo(() => new Emitter(), []);
  const eSteam = useMemo(() => new Emitter(), []);
  const eMist = useMemo(() => new Emitter(), []);
  useEffect(
    () => () => {
      drop.dispose();
      puff.dispose();
    },
    [drop, puff],
  );
  useFrame((_, dt) => {
    const f = THREE.MathUtils.clamp(flow.v / FULL_FLOW, 0, 1.2);
    const k = motion.reduced ? 0.4 : 1;
    eSpray.tick(f * 900 * k, dt, () => {
      // nozzles on the mount ring, thrown outward and up, falling into the trench and on the table
      const a = Math.random() * Math.PI * 2;
      const r = 7.4;
      const sp = 7 + Math.random() * 7;
      const el = 0.5 + Math.random() * 0.9;
      spray.emit(Math.cos(a) * r, MOUNT_TOP + 0.6, Math.sin(a) * r, Math.cos(a) * sp * Math.cos(el), sp * Math.sin(el) + 4, Math.sin(a) * sp * Math.cos(el), 1.4 + Math.random() * 0.9, 0.7 + Math.random() * 0.8);
    }, 80);
    eSpray.tick(f * 380 * k, dt, () => {
      // wall-mounted monitors along the trench throwing across it
      const side = Math.random() < 0.5 ? -1 : 1;
      const z = TRENCH.zMin + 6 + Math.random() * 40;
      spray.emit(side * (TRENCH.halfWidth - 0.4), 0.3, z, -side * (5 + Math.random() * 5), 6 + Math.random() * 4, (Math.random() - 0.5) * 3, 1.6 + Math.random() * 0.6, 0.8 + Math.random() * 0.7);
    }, 40);
    // steam: the deluge flashes to steam on hot surfaces
    const heat = str('Launch/Clock/Phase') === 'IGNITION' || str('Launch/Clock/Phase') === 'LIFTOFF' ? 1 : 0.35;
    eSteam.tick(f * 38 * heat * k, dt, () => {
      steam.emit((Math.random() - 0.5) * 12, 1 + Math.random() * 4, 2 + Math.random() * 35, (Math.random() - 0.5) * 4, 3 + Math.random() * 3, 4 + Math.random() * 6, 5 + Math.random() * 4, 0.7 + Math.random() * 0.7);
    });
    // humid air in the trench (leak scenario drives the humidity proxy toward 95 %)
    const mist = THREE.MathUtils.clamp((hum.v - 55) / 40, 0, 1);
    eMist.tick(mist * 28 * k, dt, () => {
      steam.emit((Math.random() - 0.5) * 12, -7 + Math.random() * 2, TRENCH.zMin + Math.random() * 70, (Math.random() - 0.5) * 2, 0.6 + Math.random(), 1.5 + Math.random() * 2.5, 6 + Math.random() * 4, 0.6 + Math.random() * 0.6);
    });
  });
  return (
    <>
      <Particles sys={spray} />
      <Particles sys={steam} />
    </>
  );
}
