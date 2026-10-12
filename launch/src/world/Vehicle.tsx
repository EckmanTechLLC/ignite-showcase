import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bool, num, sinceChange, str } from '../live/store';
import { useSmoothed } from '../live/hooks';
import { motion } from '../motion';
import { ARM_Y, MOUNT_TOP, VEH, sceneAltitude } from './layout';
import { M } from './materials';
import { boxAt, cylAt, merge } from './geo';
import { EnginePlume } from './Plume';
import { vehicle } from './vehicleState';
import { puffTexture } from './textures';
import { Emitter, Particles, useParticleSystem } from './particles';

/**
 * Two-stage methane/LOX vehicle, built from primitives: nine engine bells, stainless tank stack,
 * black interstage, grid fins, aft flaps, heat-shield side, ogive nose. The root group's height
 * follows the (scaled) AltitudeM; stage 1 drifts away on StageSep; RECYCLE sets the vehicle back on
 * the mount with a short settle.
 */

const R = VEH.r;
const BASE_Y = MOUNT_TOP + VEH.hover;

function ogive(h: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector2(Math.max(0.001, R * Math.pow(1 - Math.pow(t, 1.9), 0.62)), t * h));
  }
  return new THREE.LatheGeometry(pts, 48);
}

export function Vehicle() {
  const root = useRef<THREE.Group>(null);
  const s1 = useRef<THREE.Group>(null);
  const bellMat = useMemo(() => M.engineBell.clone(), []);
  const alt = useSmoothed('Launch/Vehicle/AltitudeM', 650);
  const tilt = useRef(0);
  const spawn = useRef(99); // seconds since the vehicle was set back on the mount
  const frost = useRef(0);
  const chillEmitter = useMemo(() => new Emitter(), []);
  const puff = useMemo(() => puffTexture(5), []);
  const mist = useParticleSystem(() => ({
    max: motion.reduced ? 80 : 240,
    texture: puff,
    sizeStart: 1.2,
    sizeEnd: 7,
    colorStart: new THREE.Color(0.9, 0.95, 1.05),
    colorEnd: new THREE.Color(0.5, 0.58, 0.7),
    alpha: 0.5,
    fadePow: 1.3,
    drag: 0.9,
    gravity: -0.15,
    windInfluence: 0.9,
  }));

  const geo = useMemo(() => {
    const bells: THREE.BufferGeometry[] = [];
    const bellAt = (x: number, z: number, scale = 1) => {
      const g = new THREE.CylinderGeometry(0.42 * scale, 0.98 * scale, VEH.bellH, 24, 1, true);
      g.translate(x, VEH.bellH / 2, z);
      bells.push(g);
    };
    bellAt(0, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      bellAt(Math.cos(a) * 2.95, Math.sin(a) * 2.95);
    }
    const welds: THREE.BufferGeometry[] = [];
    for (let y = VEH.skirtTop + 3.2; y < VEH.s1Top - 1; y += 3.6) welds.push(cylAt(R + 0.03, R + 0.03, 0.08, 0, y, 0, 48));
    for (let y = VEH.interTop + 3; y < VEH.s2Top - 1; y += 3) welds.push(cylAt(R + 0.03, R + 0.03, 0.08, 0, y, 0, 48));
    const fins: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const aft = boxAt(0.35, 6.4, 3.2, R + 1.25, 9, 0);
      aft.rotateY(-a);
      fins.push(aft);
      const grid = boxAt(2.4, 0.3, 3.1, R + 1.05, VEH.s1Top - 2.2, 0);
      grid.rotateY(-a - Math.PI / 4 + Math.PI / 4);
      fins.push(grid);
    }
    const plates: THREE.BufferGeometry[] = [];
    for (const wy of ARM_Y) plates.push(boxAt(0.7, 2.2, 3.2, -R - 0.25, wy - BASE_Y, 0));
    return {
      bells: merge(bells),
      welds: merge(welds),
      fins: merge(fins),
      plates: merge(plates),
      nose: ogive(VEH.noseTop - VEH.s2Top),
    };
  }, []);

  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      bellMat.dispose();
      puff.dispose();
    },
    [geo, bellMat, puff],
  );

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    // Reset to the mount: a big drop of the tag means RECYCLE; jump instead of flying down.
    const target = num('Launch/Vehicle/AltitudeM');
    if (alt.v - target > 3000 && target < 200) {
      alt.snap();
      spawn.current = 0;
    }
    spawn.current += dt;
    const a = Math.max(0, alt.v);
    const sceneY = sceneAltitude(a);
    // settle: lowered onto the clamps with a damped bounce
    let settle = 0;
    if (spawn.current < 2.6 && !motion.reduced) {
      const p = spawn.current / 2.6;
      settle = 5 * Math.pow(1 - p, 2) * Math.cos(p * 9) * (1 - p);
    }
    g.position.y = BASE_Y + sceneY + settle;
    // gravity turn: lean downrange (east, +X) as the vehicle climbs
    const lean = THREE.MathUtils.smoothstep(a, 1200, 90000) * 1.25;
    tilt.current += (lean - tilt.current) * Math.min(1, dt * 2);
    g.rotation.z = -tilt.current;
    vehicle.y = g.position.y;
    vehicle.altScene = sceneY;
    vehicle.tilt = tilt.current;

    // stage 1 falls away after separation
    const s = s1.current;
    if (s) {
      const sep = bool('Launch/Vehicle/StageSep');
      const t = sep ? sinceChange('Launch/Vehicle/StageSep') : 0;
      if (!sep || t > 40) {
        s.visible = !sep;
        s.position.set(0, 0, 0);
        s.rotation.set(0, 0, 0);
      } else {
        s.visible = true;
        s.position.set(2 * t, -(3 * t + 1.6 * t * t), 0.6 * t);
        s.rotation.set(0.09 * t * t * 0.5, 0, 0.04 * t);
      }
    }

    // engine chill frost on the bells (WARM 0 -> READY 1), burned clean while firing
    const st = str('Launch/Vehicle/EngineChillState');
    const wantFrost = st === 'READY' ? 1 : st === 'CHILLING' ? 0.55 : 0;
    frost.current += (wantFrost - frost.current) * Math.min(1, dt * 0.8);
    bellMat.color.setRGB(0.3 + 0.55 * frost.current, 0.34 + 0.58 * frost.current, 0.38 + 0.6 * frost.current);
    bellMat.roughness = 0.45 + 0.4 * frost.current;

    // vapour venting from the engine bay while chilling, and boil-off wisps near the nose when cold
    const chilling = st === 'CHILLING';
    const boil = num('Launch/Propellant/LOX/BoiloffKgS');
    const onPad = a < 5 && !sepDone();
    const rate = onPad ? (chilling ? 24 : 0) + Math.min(boil, 30) * 0.5 + (str('Launch/Clock/Phase') === 'ABORT' ? 60 : 0) : 0;
    chillEmitter.tick(rate * (motion.reduced ? 0.4 : 1), dt, () => {
      const ang = Math.random() * Math.PI * 2;
      mist.emit(Math.cos(ang) * 3.2, BASE_Y + 1 + Math.random(), Math.sin(ang) * 3.2, Math.cos(ang) * 3, 1.5 + Math.random() * 2, Math.sin(ang) * 3, 3 + Math.random() * 2, 0.7 + Math.random());
    });
  });

  return (
    <>
      <group ref={root} position={[0, BASE_Y, 0]}>
        {/* ---- stage 1 ---- */}
        <group ref={s1}>
          <mesh geometry={geo.bells} material={bellMat} castShadow />
          <mesh position={[0, (VEH.bellH + VEH.skirtTop) / 2 - 0.2, 0]} castShadow>
            <cylinderGeometry args={[R + 0.05, R + 0.05, VEH.skirtTop - VEH.bellH + 0.4, 48]} />
            <primitive object={M.steelDark} attach="material" />
          </mesh>
          <mesh position={[0, (VEH.skirtTop + VEH.s1Top) / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[R, R, VEH.s1Top - VEH.skirtTop, 64]} />
            <primitive object={M.stainless} attach="material" />
          </mesh>
          <mesh geometry={geo.welds} castShadow>
            <meshStandardMaterial color="#59616c" roughness={0.5} metalness={0.8} />
          </mesh>
          {/* accent band */}
          <mesh position={[0, VEH.s1Top - 5.6, 0]}>
            <cylinderGeometry args={[R + 0.04, R + 0.04, 0.9, 64]} />
            <meshStandardMaterial color="#ff7a2f" roughness={0.45} metalness={0.4} emissive="#ff5a10" emissiveIntensity={0.12} />
          </mesh>
          <mesh position={[0, (VEH.s1Top + VEH.interTop) / 2, 0]} castShadow>
            <cylinderGeometry args={[R + 0.02, R + 0.02, VEH.interTop - VEH.s1Top, 64]} />
            <primitive object={M.heatShield} attach="material" />
          </mesh>
          <mesh geometry={geo.fins} castShadow>
            <primitive object={M.steelDark} attach="material" />
          </mesh>
          <mesh geometry={geo.plates} castShadow>
            <primitive object={M.steelDark} attach="material" />
          </mesh>
        </group>

        {/* ---- stage 2 ---- */}
        <group>
          <mesh position={[0, (VEH.interTop + VEH.s2Top) / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[R, R, VEH.s2Top - VEH.interTop, 64]} />
            <primitive object={M.stainless} attach="material" />
          </mesh>
          {/* black heat-shield side */}
          <mesh position={[0, (VEH.interTop + VEH.s2Top) / 2, 0]}>
            <cylinderGeometry args={[R + 0.035, R + 0.035, VEH.s2Top - VEH.interTop, 40, 1, true, Math.PI * 0.62, Math.PI * 0.76]} />
            <meshStandardMaterial color="#14161a" roughness={0.9} metalness={0.05} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={geo.nose} position={[0, VEH.s2Top, 0]} castShadow>
            <primitive object={M.stainless} attach="material" />
          </mesh>
          <mesh position={[0, VEH.s2Top + 0.1, 0]}>
            <cylinderGeometry args={[R + 0.05, R + 0.05, 0.25, 64]} />
            <primitive object={M.heatShield} attach="material" />
          </mesh>
          {/* stage 2 vacuum engine bell (exposed after separation) */}
          <mesh position={[0, 42.2 + 1.6, 0]} castShadow>
            <cylinderGeometry args={[0.7, 1.9, 3.2, 28, 1, true]} />
            <primitive object={M.engineBell} attach="material" />
          </mesh>
        </group>
        <EnginePlume />
      </group>
      <Particles sys={mist} />
    </>
  );
}

function sepDone(): boolean {
  return bool('Launch/Vehicle/StageSep');
}
