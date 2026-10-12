import { useMemo } from 'react';
import * as THREE from 'three';
import { LiveDriver } from '../live/hooks';
import { Sky } from './Sky';
import { Floodlights, AbortBeacons, Lighting } from './Lights';
import { Ground } from './Ground';
import { LaunchMount } from './Pad';
import { Tower } from './Tower';
import { Vehicle } from './Vehicle';
import { PadExhaust } from './Plume';
import { FARM_COLOR, TankFarm } from './TankFarm';
import { FlowLine } from './FlowLine';
import { WaterTower } from './WaterTower';
import { PowerBuilding } from './PowerBuilding';
import { Masts } from './Masts';
import { Weather } from './Weather';
import { CH4_FARM, LOX_FARM, TOWER, ARM_Y } from './layout';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const RISER_X = TOWER.x - TOWER.w / 2 - 1.2;
const ARM_ROOT_X = TOWER.x + TOWER.w / 2 - 0.6;

/** Propellant transfer lines: tank farm manifold -> tower base -> riser -> arm. */
const LOX_LINE = [
  v(LOX_FARM.x + 22, 1.8, LOX_FARM.z),
  v(-75, 1.8, LOX_FARM.z),
  v(-75, 1.8, -3),
  v(RISER_X, 1.8, -3),
  v(RISER_X, ARM_Y[0] + 2.4, -3),
  v(ARM_ROOT_X, ARM_Y[0] + 2.4, -3),
];
const CH4_LINE = [
  v(CH4_FARM.x + 22, 1.4, CH4_FARM.z),
  v(-62, 1.4, CH4_FARM.z),
  v(-62, 1.4, 3),
  v(RISER_X, 1.4, 3),
  v(RISER_X, ARM_Y[1] + 2.4, 3),
  v(ARM_ROOT_X, ARM_Y[1] + 2.4, 3),
];

/** Everything in the 3D world, bound to live tags. */
export function World() {
  const fog = useMemo(() => new THREE.FogExp2('#283142', 0.00055), []);
  return (
    <>
      <color attach="background" args={['#05080d']} />
      <primitive object={fog} attach="fog" />
      <LiveDriver />
      <Sky />
      <Lighting />
      <Floodlights />
      <Ground />
      <LaunchMount />
      <Tower />
      <Vehicle />
      <PadExhaust />
      <TankFarm kind="LOX" position={[LOX_FARM.x, 0, LOX_FARM.z]} />
      <TankFarm kind="CH4" position={[CH4_FARM.x, 0, CH4_FARM.z]} />
      <FlowLine points={LOX_LINE} tag="Launch/Propellant/LOX/FlowKgS" fullScale={210} color={FARM_COLOR.LOX} radius={0.55} />
      <FlowLine points={CH4_LINE} tag="Launch/Propellant/CH4/FlowKgS" fullScale={75} color={FARM_COLOR.CH4} radius={0.45} />
      <WaterTower />
      <PowerBuilding />
      <Masts />
      <AbortBeacons />
      <Weather />
    </>
  );
}
