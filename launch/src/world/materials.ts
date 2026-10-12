import * as THREE from 'three';
import { concreteTextures, groundTexture, roadTexture } from './textures';

/** Shared PBR materials. Restrained palette: grey steel and concrete, emissive only where data lives. */

const [concreteMap, concreteRough] = concreteTextures(1);
const [slabMap, slabRough] = concreteTextures(0.1);
const ground = groundTexture(0.035);
const road = roadTexture();

export const M = {
  concrete: new THREE.MeshStandardMaterial({ color: '#d2d7de', map: slabMap, roughnessMap: slabRough, roughness: 1, metalness: 0 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: '#8b9199', map: concreteMap, roughnessMap: concreteRough, roughness: 1, metalness: 0 }),
  ground: new THREE.MeshStandardMaterial({ color: '#c3cad3', map: ground, roughness: 1, metalness: 0 }),
  road: new THREE.MeshStandardMaterial({ color: '#c8cdd5', map: road, roughness: 0.95, metalness: 0 }),
  concreteFlat: new THREE.MeshStandardMaterial({ color: '#6d727a', roughness: 0.95, metalness: 0 }),
  steel: new THREE.MeshStandardMaterial({ color: '#aab3be', roughness: 0.5, metalness: 0.65 }),
  steelDark: new THREE.MeshStandardMaterial({ color: '#39414c', roughness: 0.6, metalness: 0.6 }),
  paintRed: new THREE.MeshStandardMaterial({ color: '#b3402e', roughness: 0.55, metalness: 0.3 }),
  paintWhite: new THREE.MeshStandardMaterial({ color: '#dfe5ec', roughness: 0.5, metalness: 0.15 }),
  insulation: new THREE.MeshStandardMaterial({ color: '#aab5c2', roughness: 0.62, metalness: 0.1 }),
  pipe: new THREE.MeshStandardMaterial({ color: '#c8d0d9', roughness: 0.4, metalness: 0.7 }),
  stainless: new THREE.MeshStandardMaterial({ color: '#e6ebf1', roughness: 0.42, metalness: 0.72, envMapIntensity: 1.5 }),
  heatShield: new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.85, metalness: 0.1 }),
  engineBell: new THREE.MeshStandardMaterial({ color: '#4c5560', roughness: 0.45, metalness: 0.85, side: THREE.DoubleSide }),
  glassDim: new THREE.MeshStandardMaterial({ color: '#10161d', emissive: '#ffcf8a', emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.2 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.9, metalness: 0 }),
};

for (const m of [M.concrete, M.concreteDark, M.road, M.ground]) {
  m.envMapIntensity = 0.5;
}
