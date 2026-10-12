import { num } from './store';
import type { TagName } from './paths';

/**
 * Critically damped interpolation toward the latest sample of a tag. Entries are stepped once per
 * frame by stepSmoothers() (called from the single LiveDriver useFrame); consumers read `.v` inside
 * their own useFrame. Nothing here touches React state.
 */
export interface Smoothed {
  /** Current smoothed value (read inside useFrame). */
  v: number;
  /** Jump straight to the latest sample (e.g. when the vehicle resets to the mount). */
  snap(): void;
}

interface Entry extends Smoothed {
  name: TagName;
  tau: number; // seconds
  vel: number;
  primed: boolean;
}

const entries = new Set<Entry>();

export function createSmoothed(name: TagName, tauMs: number): Entry {
  const e: Entry = {
    name,
    tau: Math.max(0.001, tauMs / 1000),
    vel: 0,
    primed: false,
    v: num(name),
    snap() {
      e.v = num(name);
      e.vel = 0;
    },
  };
  return e;
}

export function registerSmoothed(e: Entry): () => void {
  entries.add(e);
  return () => entries.delete(e);
}

/** Unity-style SmoothDamp: critically damped spring, no overshoot, frame-rate independent. */
export function smoothDamp(current: number, target: number, vel: number, tau: number, dt: number): [number, number] {
  const omega = 2 / tau;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (vel + omega * change) * dt;
  return [target + (change + temp) * exp, (vel - omega * temp) * exp];
}

export function stepSmoothers(dtRaw: number): void {
  const dt = Math.min(dtRaw, 0.1);
  if (dt <= 0) return;
  for (const e of entries) {
    const target = num(e.name);
    if (!e.primed) {
      e.v = target;
      e.vel = 0;
      e.primed = true;
      continue;
    }
    // SmoothDamp inlined: no per-frame allocation for the ~40 live smoothers.
    const omega = 2 / e.tau;
    const x = omega * dt;
    const k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = e.v - target;
    const temp = (e.vel + omega * change) * dt;
    e.vel = (e.vel - omega * temp) * k;
    e.v = target + (change + temp) * k;
  }
}
