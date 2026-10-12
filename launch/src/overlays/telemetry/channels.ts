import { TRENDED } from '../../live/trended';
import type { TagName } from '../../live/paths';

/** Default channels: pad systems before ignition, flight channels from IGNITION to ORBIT. */
export const PAD_CHANNELS: TagName[] = [
  'Launch/Propellant/LOX/PressureBar',
  'Launch/Propellant/CH4/PressureBar',
  'Launch/Propellant/LOX/TankLevelPct',
  'Launch/Propellant/CH4/TankLevelPct',
  'Launch/Pad/GSEPower/BusAVolts',
  'Launch/Weather/WindSpeedMS',
];
export const FLIGHT_CHANNELS: TagName[] = ['Launch/Vehicle/AltitudeM', 'Launch/Vehicle/VelocityMS', 'Launch/Vehicle/AccelG', 'Launch/Vehicle/ThrustPct'];
const FLIGHT_PHASES = new Set(['IGNITION', 'LIFTOFF', 'ASCENT', 'ORBIT']);

export const defaultChannels = (phase: string): TagName[] => (FLIGHT_PHASES.has(phase) ? FLIGHT_CHANNELS : PAD_CHANNELS);

/** Every numeric tag the tag model trends (generated from tags.json), for the picker. */
export const PICKABLE: readonly TagName[] = TRENDED;
export const MAX_CHANNELS = 8;

export const WINDOWS = [
  { label: '1 min', ms: 60_000 },
  { label: '5 min', ms: 300_000 },
  { label: '15 min', ms: 900_000 },
] as const;

/** 'Launch/Propellant/LOX/PressureBar' -> 'LOX PressureBar'. */
export const shortName = (t: TagName): string => t.split('/').slice(-2).join(' ');
