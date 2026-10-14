import { shallowRef } from 'vue';

// Camera presets and HUD requests: kept free of three.js so the HUD can import them without pulling the lazy 3D chunk.

export type V3 = [number, number, number];
export interface Preset {
  key: string;
  name: string;
  pos: V3;
  target: V3;
}

/** Keys 1-5. Hall centre is about (4, 0, 8). */
export const PRESETS: Preset[] = [
  { key: '1', name: 'Overview', pos: [-5, 15, 30], target: [3, 0.5, 7.6] },
  { key: '2', name: 'Cold aisle A/B', pos: [-0.2, 1.65, 3.2], target: [7, 1.35, 3.2] },
  { key: '3', name: 'Hot aisle', pos: [-0.2, 1.8, 5.7], target: [7, 1.7, 5.7] },
  { key: '4', name: 'Electrical room', pos: [-0.9, 6.4, 16.2], target: [-4.2, 0.6, 7.8] },
  { key: '5', name: 'Roof', pos: [22, 13.5, 20], target: [11, 5.5, 8] },
];

/** Index of the preset the camera last flew to (-1 after a fly-to or manual move). */
export const activePreset = shallowRef(0);

/** HUD buttons ask the scene to fly to a preset (a new object per request). */
export const presetRequest = shallowRef<{ i: number } | null>(null);
