import * as THREE from 'three';

/** Shared wind state: written once per frame by <Weather>, read by particle systems and the wind sock. */
export const wind = {
  /** Velocity of the air (m/s, scene axes: +X east, -Z north). */
  vec: new THREE.Vector3(),
  speed: 0,
  /** Meteorological direction the wind blows FROM, degrees clockwise from north. */
  fromDeg: 80,
};

export function setWind(speed: number, fromDeg: number): void {
  wind.speed = speed;
  wind.fromDeg = fromDeg;
  const to = ((fromDeg + 180) * Math.PI) / 180;
  // north = -Z, east = +X: a wind blowing toward compass bearing `to`.
  wind.vec.set(Math.sin(to) * speed, 0, -Math.cos(to) * speed);
}
