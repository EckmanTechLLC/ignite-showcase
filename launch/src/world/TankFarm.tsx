import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bool, num } from '../live/store';
import { useSmoothed } from '../live/hooks';
import { motion } from '../motion';
import { M } from './materials';
import { boxAt, cylAt, merge } from './geo';
import { Emitter, Particles, useParticleSystem } from './particles';
import { puffTexture } from './textures';

/**
 * A cryogenic tank farm: two vertical insulated tanks with data-bound level gauge, liquid-line ring,
 * frost sleeve, vent stack with vapour plume (VentValveOpen / BoiloffKgS), pump skid and bund wall.
 */

export type Propellant = 'LOX' | 'CH4';

const TANK_R = 7;
const TANK_H = 22;
const LEG_H = 3.6;
const GAUGE_H = 16;

export const FARM_COLOR: Record<Propellant, string> = { LOX: '#4cc3ff', CH4: '#62f0b0' };

interface Props {
  kind: Propellant;
  position: [number, number, number];
}

export function TankFarm({ kind, position }: Props) {
  const color = FARM_COLOR[kind];
  const levelTag = `Launch/Propellant/${kind}/TankLevelPct` as const;
  const tempTag = `Launch/Propellant/${kind}/TempK` as const;
  const level = useSmoothed(levelTag, 1200);
  const temp = useSmoothed(tempTag, 2000);
  const fills = useRef<(THREE.Mesh | null)[]>([null, null]);
  const rings = useRef<(THREE.Mesh | null)[]>([null, null]);
  const frosts = useRef<(THREE.Mesh | null)[]>([null, null]);
  const gaugeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#06121a', emissive: color, emissiveIntensity: 2.2, roughness: 0.4, toneMapped: false }), [color]);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6), toneMapped: false }), [color]);
  const frostMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, transparent: true, opacity: 0 }), []);
  const puff = useMemo(() => puffTexture(kind === 'LOX' ? 2 : 9), [kind]);
  const vapour = useParticleSystem(() => ({
    max: motion.reduced ? 90 : 260,
    texture: puff,
    sizeStart: 2.2,
    sizeEnd: 20,
    colorStart: kind === 'LOX' ? new THREE.Color(0.9, 0.96, 1.1) : new THREE.Color(0.7, 0.9, 0.85),
    colorEnd: new THREE.Color(0.38, 0.46, 0.58),
    alpha: kind === 'LOX' ? 0.62 : 0.4,
    fadePow: 1.2,
    drag: 0.55,
    gravity: 0.12,
    windInfluence: 0.9,
  }));
  const em = useMemo(() => new Emitter(), []);

  const geo = useMemo(() => {
    const legs: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(boxAt(0.7, LEG_H, 0.7, sx * TANK_R * 0.62, LEG_H / 2, sz * TANK_R * 0.62));
    legs.push(cylAt(TANK_R * 0.75, TANK_R * 0.75, 0.3, 0, 0.15, 0, 20));
    const stack: THREE.BufferGeometry[] = [cylAt(0.28, 0.28, 5.5, 0, TANK_H + LEG_H + 4.2, 0, 8), cylAt(0.55, 0.55, 0.3, 0, TANK_H + LEG_H + 1.7, 0, 10)];
    const ladder: THREE.BufferGeometry[] = [];
    for (let y = LEG_H; y < LEG_H + TANK_H; y += 1.1) ladder.push(boxAt(0.9, 0.06, 0.06, -TANK_R * 0.99, y, 0));
    ladder.push(boxAt(0.06, TANK_H, 0.06, -TANK_R * 0.99, LEG_H + TANK_H / 2, 0.45), boxAt(0.06, TANK_H, 0.06, -TANK_R * 0.99, LEG_H + TANK_H / 2, -0.45));
    const ticks: THREE.BufferGeometry[] = [];
    for (let i = 0; i <= 10; i++) ticks.push(boxAt(0.12, 0.12, 1.6, TANK_R + 0.1, LEG_H + 3 + (GAUGE_H * i) / 10, 0));
    return { legs: merge(legs), stack: merge(stack), ladder: merge(ladder), ticks: merge(ticks) };
  }, []);

  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      gaugeMat.dispose();
      ringMat.dispose();
      frostMat.dispose();
      puff.dispose();
    },
    [geo, gaugeMat, ringMat, frostMat, puff],
  );

  const tanks: [number, number][] = [
    [-11.5, 0],
    [11.5, 0],
  ];

  useFrame((_, dt) => {
    const lv = THREE.MathUtils.clamp(level.v / 100, 0, 1);
    const cold = THREE.MathUtils.clamp((294 - temp.v) / 160, 0, 1);
    frostMat.opacity = 0.92 * cold;
    gaugeMat.emissiveIntensity = lv > 0.002 ? 1.6 + 1.4 * lv : 0.05;
    for (let i = 0; i < 2; i++) {
      const f = fills.current[i];
      if (f) {
        f.visible = lv > 0.002;
        f.scale.y = Math.max(0.001, lv * GAUGE_H);
        f.position.y = LEG_H + 3 + (lv * GAUGE_H) / 2;
      }
      const r = rings.current[i];
      if (r) {
        r.visible = lv > 0.01;
        r.position.y = LEG_H + 3 + lv * GAUGE_H;
      }
      const fr = frosts.current[i];
      if (fr) {
        fr.visible = cold > 0.02 && lv > 0.003;
        fr.scale.y = Math.max(0.001, lv * (TANK_H - 2));
        fr.position.y = LEG_H + 1 + fr.scale.y / 2;
      }
    }
    // vapour: vent valve gives a strong plume, boil-off a steady wisp
    const vent = bool(`Launch/Propellant/${kind}/VentValveOpen` as const);
    const boil = num(`Launch/Propellant/${kind}/BoiloffKgS` as const);
    const rate = (vent ? 55 : 0) + Math.min(boil, 40) * 0.9;
    em.tick(rate * (motion.reduced ? 0.4 : 1), dt, () => {
      const t = tanks[Math.random() < 0.5 ? 0 : 1];
      vapour.emit(
        position[0] + t[0] + (Math.random() - 0.5) * 0.6,
        position[1] + LEG_H + TANK_H + 6.8,
        position[2] + t[1] + (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 2,
        (vent ? 7 : 3) + Math.random() * 3,
        (Math.random() - 0.5) * 2,
        3.5 + Math.random() * 3,
        0.7 + Math.random() * 0.7,
      );
    });
  });

  return (
    <>
      <group position={position}>
        {tanks.map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <mesh geometry={geo.legs} material={M.steelDark} castShadow />
            {/* tank body: cylinder + two domes */}
            <mesh position={[0, LEG_H + TANK_H / 2, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[TANK_R, TANK_R, TANK_H, 48]} />
              <primitive object={M.insulation} attach="material" />
            </mesh>
            {[0, 1].map((cap) => (
              <mesh key={cap} position={[0, LEG_H + (cap ? TANK_H : 0), 0]} scale={[1, 0.42, 1]} castShadow>
                <sphereGeometry args={[TANK_R, 40, 16, 0, Math.PI * 2, cap ? 0 : Math.PI / 2, Math.PI / 2]} />
                <primitive object={M.insulation} attach="material" />
              </mesh>
            ))}
            {/* frost sleeve, grows with the liquid level */}
            <mesh
              ref={(m) => {
                frosts.current[i] = m;
              }}
              material={frostMat}
              scale={[1, 1, 1]}
            >
              <cylinderGeometry args={[TANK_R + 0.07, TANK_R + 0.07, 1, 40, 1, true]} />
            </mesh>
            {/* level gauge: dark window with an emissive bar, ticks every 10% */}
            <mesh position={[TANK_R + 0.05, LEG_H + 3 + GAUGE_H / 2, 0]}>
              <boxGeometry args={[0.3, GAUGE_H + 0.6, 1.5]} />
              <primitive object={M.heatShield} attach="material" />
            </mesh>
            <mesh
              ref={(m) => {
                fills.current[i] = m;
              }}
              material={gaugeMat}
              position={[TANK_R + 0.22, LEG_H + 3, 0]}
              visible={false}
            >
              <boxGeometry args={[0.18, 1, 1.0]} />
            </mesh>
            <mesh geometry={geo.ticks} material={M.steel} />
            {/* liquid-surface ring */}
            <mesh
              ref={(m) => {
                rings.current[i] = m;
              }}
              material={ringMat}
              rotation={[Math.PI / 2, 0, 0]}
              position={[0, LEG_H + 3, 0]}
              visible={false}
            >
              <torusGeometry args={[TANK_R + 0.12, 0.09, 6, 64]} />
            </mesh>
            <mesh geometry={geo.stack} material={M.pipe} castShadow />
            <mesh geometry={geo.ladder} material={M.steel} />
          </group>
        ))}
        {/* pump skid */}
        <mesh position={[24, 1.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[8, 3.2, 10]} />
          <primitive object={M.paintWhite} attach="material" />
        </mesh>
        <mesh position={[24, 3.5, 0]}>
          <boxGeometry args={[8.4, 0.4, 10.4]} />
          <primitive object={M.steelDark} attach="material" />
        </mesh>
        {/* bund wall */}
        {[
          [0, -17, 46, 0.8],
          [0, 17, 46, 0.8],
          [-23, 0, 0.8, 34],
          [23, 0, 0.8, 34],
        ].map(([x, z, w, d], i) => (
          <mesh key={i} position={[x, 0.7, z]} receiveShadow>
            <boxGeometry args={[w, 1.4, d]} />
            <primitive object={M.concreteFlat} attach="material" />
          </mesh>
        ))}
        {/* edge marker lamps */}
        {[
          [-23, -17],
          [23, -17],
          [-23, 17],
          [23, 17],
        ].map(([x, z], i) => (
          <mesh key={`l${i}`} position={[x, 1.9, z]}>
            <sphereGeometry args={[0.35, 10, 8]} />
            <meshBasicMaterial color={new THREE.Color('#ffb25c').multiplyScalar(2)} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <Particles sys={vapour} />
    </>
  );
}
