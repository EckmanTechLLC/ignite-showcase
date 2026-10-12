import * as THREE from 'three';
import { vehicle } from '../world/vehicleState';
import { MOUNT_TOP, VEH } from '../world/layout';

export type PresetId = 'pad' | 'tank' | 'trench' | 'tower' | 'range' | 'chase' | 'padLow';

export interface PresetInfo {
  id: PresetId;
  label: string;
  /** Keyboard shortcut (1-6); the low pad angle is director-only. */
  key?: string;
  /** Whether the shot follows the vehicle. */
  follow?: boolean;
}

export const PRESETS: PresetInfo[] = [
  { id: 'pad', label: 'Pad', key: '1' },
  { id: 'tank', label: 'Tank farm', key: '2' },
  { id: 'trench', label: 'Flame trench', key: '3' },
  { id: 'tower', label: 'Tower', key: '4' },
  { id: 'range', label: 'Range', key: '5', follow: true },
  { id: 'chase', label: 'Chase', key: '6', follow: true },
  { id: 'padLow', label: 'Pad low', follow: false },
];

export function presetInfo(id: PresetId): PresetInfo {
  return PRESETS.find((p) => p.id === id)!;
}

export interface Shot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

/** Smoothed vehicle height used by the follow shots so a RECYCLE reset becomes a swoop, not a cut. */
export const follow = { y: 0, vel: 0 };

const MID = MOUNT_TOP + VEH.hover + 34; // roughly mid-height of the stack above the pad

/** Resolve a preset to a camera position, look-at point and field of view (dynamic for follow shots). */
export function resolveShot(id: PresetId, out: Shot): Shot {
  switch (id) {
    case 'pad':
      out.pos.set(94, 30, 132);
      out.target.set(0, 42, 0);
      out.fov = 42;
      break;
    case 'padLow':
      out.pos.set(46, 3.2, 76);
      out.target.set(0, 36, 0);
      out.fov = 52;
      break;
    case 'tank':
      out.pos.set(-34, 36, 8);
      out.target.set(-150, 12, -1);
      out.fov = 56;
      break;
    case 'trench':
      out.pos.set(7, 2.6, 121);
      out.target.set(0, 4, -2);
      out.fov = 52;
      break;
    case 'tower':
      out.pos.set(-88, 60, 88);
      out.target.set(-6, 48, 0);
      out.fov = 46;
      break;
    case 'range': {
      const vy = follow.y;
      out.pos.set(150, 78 + vy * 0.86, 350 + vy * 0.1);
      out.target.set(0, 58 + vy * 0.9, 0);
      out.fov = 44;
      break;
    }
    case 'chase': {
      const cy = vehicle.y + MID * 0.45 - 6;
      const spread = 1 + 0.9 * THREE.MathUtils.smoothstep(vehicle.altScene, 40, 700);
      const lean = Math.sin(vehicle.tilt) * 30;
      out.target.set(lean * 0.5, cy, 0);
      out.pos.set(58 * spread + lean, cy - 16 * spread, 104 * spread);
      out.fov = 46 + 6 * THREE.MathUtils.smoothstep(vehicle.altScene, 60, 400);
      break;
    }
  }
  return out;
}

/** Anchor whose movement is mirrored onto the camera when the user orbits during a follow shot. */
export function followAnchor(id: PresetId): number | null {
  if (id === 'chase') return vehicle.y;
  if (id === 'range') return follow.y;
  return null;
}

