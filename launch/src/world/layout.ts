/**
 * Scene layout. Units are metres, +Y up, the launch mount at the origin, the flame trench runs
 * toward +Z, north is -Z, east is +X. Everything that is placed by hand lives here so cameras,
 * lights and geometry agree.
 */

export const MOUNT_TOP = 9; // y of the launch table top
export const TRENCH = { halfWidth: 8, zMin: -12, zMax: 96, depth: 9 };

/** Vehicle local layout (y = 0 at the engine exit plane). */
export const VEH = {
  r: 4.5,
  bellH: 3.2,
  skirtTop: 5.4,
  s1Top: 41.4,
  interTop: 44.4,
  s2Top: 62.4,
  noseTop: 74.4,
  /** Gap between the mount and the engine exit plane. */
  hover: 1.4,
};

export const TOWER = { x: -19, z: 0, h: 96, w: 10 };
export const ARM_Y = [31, 53];

export const LOX_FARM = { x: -150, z: -62 };
export const CH4_FARM = { x: -150, z: 58 };
export const GSE = { x: 96, z: -78 };
export const WATER = { x: 118, z: 46 };
export const MAST_POS: [number, number][] = [
  [-310, -270],
  [310, -270],
  [310, 270],
  [-310, 270],
];
export const MAST_H = 104;
export const FLOOD_RING = 66;

/** Moonlight direction (from the scene toward the moon). */
export const MOON_DIR: [number, number, number] = [-0.45, 0.62, 0.64];

/**
 * Compress real altitude into scene metres: 1:1 up to 150 m so the lift-off reads at true scale,
 * then logarithmic so SECO (~210 km) lands about 1.3 km above the pad.
 */
export function sceneAltitude(altM: number): number {
  const a = Math.max(0, altM);
  if (a <= 150) return a;
  return 150 + 160 * Math.log(1 + (a - 150) / 160);
}
