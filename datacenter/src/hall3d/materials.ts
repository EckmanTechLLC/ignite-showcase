import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { brushedTexture, floorTileTexture, hazardTexture, louvreTexture, perfTileTexture, wallTexture } from './textures';

/** Shared clock (seconds) for shader effects: blinking LEDs, busway pulses. */
export const clock = { value: 0 };

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);

/** The PBR palette every batch of static equipment draws with. */
export function createMaterials() {
  const brushed = brushedTexture();
  const louvre = louvreTexture();
  const wall = wallTexture();
  const tile = floorTileTexture();
  const perf = perfTileTexture();
  const hazard = hazardTexture();
  return {
    /** Powder-coated graphite (racks, dark cabinets). */
    paint: std({ color: '#2c343f', metalness: 0.55, roughness: 0.42 }),
    /** Powder-coated light grey (electrical cabinets, CRAH). */
    cab: std({ color: '#7d8997', metalness: 0.5, roughness: 0.46 }),
    /** Brushed stainless / aluminium. */
    steel: std({ color: '#b9c2cc', metalness: 1, roughness: 0.38, map: brushed, roughnessMap: brushed }),
    /** Galvanised steel (trays, ducts, supports). */
    galv: std({ color: '#8f99a4', metalness: 0.85, roughness: 0.5, map: brushed }),
    /** Pipe insulation / white cladding. */
    ins: std({ color: '#cfd6dd', metalness: 0.1, roughness: 0.62 }),
    rubber: std({ color: '#14171b', metalness: 0, roughness: 0.9 }),
    copper: std({ color: '#b87333', metalness: 1, roughness: 0.32 }),
    ceramic: std({ color: '#d9d2c2', metalness: 0, roughness: 0.28 }),
    yellow: std({ color: '#d9a508', metalness: 0.3, roughness: 0.5 }),
    red: std({ color: '#b3231c', metalness: 0.35, roughness: 0.45 }),
    orange: std({ color: '#c8531a', metalness: 0.35, roughness: 0.48 }),
    engine: std({ color: '#3b4c60', metalness: 0.6, roughness: 0.5 }),
    concrete: std({ color: '#3a424c', metalness: 0, roughness: 0.92 }),
    /** Emissive fixtures (never tone mapped, so they stay white). */
    light: new THREE.MeshBasicMaterial({ color: '#fff4dc', toneMapped: false }),
    /** Containment / cabinet glass: physical, no transmission pass (it would double the draw calls). */
    glass: new THREE.MeshPhysicalMaterial({ color: '#8fd3ff', metalness: 0, roughness: 0.08, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, ior: 1.5, side: THREE.DoubleSide, depthWrite: false }),
    glassCab: new THREE.MeshPhysicalMaterial({ color: '#cfe8f7', metalness: 0, roughness: 0.12, transparent: true, opacity: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide, depthWrite: false }),
    wall: std({ color: '#ffffff', map: wall, metalness: 0.15, roughness: 0.78 }),
    louvre: std({ color: '#ffffff', map: louvre, metalness: 0.7, roughness: 0.5 }),
    hazard: std({ color: '#ffffff', map: hazard, metalness: 0.1, roughness: 0.6 }),
    /** Glossy painted raised floor; slightly translucent so the under-floor air path shows through. */
    floor: std({ color: '#ffffff', map: tile, metalness: 0.25, roughness: 0.3, transparent: true, opacity: 0.86 }),
    /** Perforated cold-aisle tile (alpha holes). */
    perf: std({ color: '#ffffff', map: perf, alphaTest: 0.5, metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide }),
  };
}
export type Materials = ReturnType<typeof createMaterials>;

/** Image-based lighting from three's RoomEnvironment (no external HDR). */
export function createEnvironment(gl: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(gl);
  const env = new RoomEnvironment();
  const rt = pmrem.fromScene(env, 0.04);
  pmrem.dispose();
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    (m.material as THREE.Material | undefined)?.dispose?.();
  });
  return rt.texture;
}
