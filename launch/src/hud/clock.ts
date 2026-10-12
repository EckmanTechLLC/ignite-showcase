import { bool, clockAge, num } from '../live/store';

/**
 * Mission clock extrapolated between 1 Hz samples: the gateway reports TMinusExact once per tick, the HUD
 * keeps counting at SpeedFactor sim-seconds per second while ClockRunning. Never runs more than
 * 1.6 s ahead of the last sample, so stale data cannot make the clock run away.
 */
export function liveTMinus(): number {
  const exact = num('Launch/_Sim_/State/TMinusExact', num('Launch/Clock/TMinusSeconds'));
  if (!bool('Launch/Clock/ClockRunning')) return exact;
  const speed = num('Launch/_Sim_/SpeedFactor', 1);
  return exact + speed * Math.min(clockAge(), 1.6);
}
