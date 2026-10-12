import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { getConnection, getValue, subscribeConnection, subscribeTag } from './store';
import { createSmoothed, registerSmoothed, stepSmoothers, type Smoothed } from './smoothing';
import type { TagName } from './paths';

/** Live value of one tag for HUD text. Re-renders only when that tag's value changes (<= 1 Hz). */
export function useTagValue(name: TagName): unknown {
  return useSyncExternalStore(
    (cb) => subscribeTag(name, cb),
    () => getValue(name),
  );
}

export function useTagNumber(name: TagName, fallback = 0): number {
  const v = useTagValue(name);
  return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'boolean' ? (v ? 1 : 0) : fallback;
}

export function useTagString(name: TagName, fallback = ''): string {
  const v = useTagValue(name);
  return typeof v === 'string' ? v : v === undefined || v === null ? fallback : String(v);
}

export function useTagBool(name: TagName): boolean {
  const v = useTagValue(name);
  return v === true || (typeof v === 'number' && v !== 0);
}

/** Connection state, last-event time and loaded flag. Changes at most once per SSE batch (~1 Hz). */
export function useConnection() {
  return useSyncExternalStore(subscribeConnection, getConnection);
}

/**
 * Scene-side smoothed number. Returns a stable object whose `.v` is advanced every frame by the
 * LiveDriver; read it inside useFrame. Never causes a React render.
 */
export function useSmoothed(name: TagName, tauMs = 600): Smoothed {
  const entry = useMemo(() => createSmoothed(name, tauMs), [name, tauMs]);
  useEffect(() => registerSmoothed(entry), [entry]);
  return entry;
}

/** Mount once inside <Canvas>: steps every smoother before any other useFrame callback. */
export function LiveDriver() {
  useFrame((_, dt) => stepSmoothers(dt), -100);
  return null;
}
