import { motion } from '../motion';
import type { PresetId } from './presets';

/** Camera selection state. A plain module: the camera rig polls it inside useFrame, the HUD subscribes. */

export interface CameraState {
  preset: PresetId;
  /** Increments on every selection so re-selecting the same preset re-frames it. */
  nonce: number;
  source: 'user' | 'director' | 'init';
  director: boolean;
}

let state: CameraState = { preset: 'range', nonce: 0, source: 'init', director: !motion.reduced };
const listeners = new Set<() => void>();

function set(next: CameraState): void {
  state = next;
  for (const l of [...listeners]) l();
}

export function getCameraState(): CameraState {
  return state;
}

export function subscribeCamera(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function selectPreset(preset: PresetId, source: CameraState['source'] = 'user'): void {
  set({ ...state, preset, nonce: state.nonce + 1, source });
}

export function setDirector(on: boolean): void {
  // Reduced motion: the camera never moves by itself, so the director cannot be enabled.
  if (on && motion.reduced) return;
  set({ ...state, director: on });
}
