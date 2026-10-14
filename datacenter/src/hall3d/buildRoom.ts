import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AISLE_W, ELEC_X0, HALL_X0, HALL_X1, HALL_Z0, HALL_Z1, RACKS_X1, RACK_H, ROOF_Y, WALL_H, coldZ } from './geometry';

/** Procedural room shell: ground, raised floor, translucent cut-away walls, cold-aisle containment, roof deck. */

function floorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1a2431';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#30415a';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 125, 125);
  g.fillStyle = '#212e3f';
  g.fillRect(8, 8, 112, 112);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const plane = (x0: number, x1: number, z0: number, z1: number, y: number) => {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return g;
};
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
};

export function createRoom(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'room';

  // Ground and plenum slab.
  const ground = new THREE.Mesh(plane(-40, 50, -30, 46, -0.7), new THREE.MeshBasicMaterial({ color: '#04070b' }));
  const slab = new THREE.Mesh(plane(ELEC_X0, HALL_X1, HALL_Z0, HALL_Z1, -0.45), new THREE.MeshStandardMaterial({ color: '#0c131c', roughness: 0.9 }));
  root.add(ground, slab);

  // Raised floor: translucent so the under-floor air path stays visible.
  const tex = floorTexture();
  tex.repeat.set((HALL_X1 - ELEC_X0) / 0.6, (HALL_Z1 - HALL_Z0) / 0.6);
  const floor = new THREE.Mesh(
    plane(ELEC_X0, HALL_X1, HALL_Z0, HALL_Z1, 0),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.66, roughness: 0.55, metalness: 0.2, depthWrite: false }),
  );
  floor.renderOrder = 0;
  root.add(floor);

  // Perforated tile strips in the cold aisles.
  const strips = mergeGeometries([0, 1, 2].map((p) => plane(0, RACKS_X1 + 0.1, coldZ(p) - 0.45, coldZ(p) + 0.45, 0.01)))!;
  const stripMesh = new THREE.Mesh(strips, new THREE.MeshBasicMaterial({ color: '#2d86ff', transparent: true, opacity: 0.22, depthWrite: false }));
  root.add(stripMesh);

  // Cut-away walls: back faces only, so the near walls vanish from outside and the far ones frame the view.
  const hall = new THREE.BoxGeometry(HALL_X1 - HALL_X0, WALL_H, HALL_Z1 - HALL_Z0).translate((HALL_X0 + HALL_X1) / 2, WALL_H / 2, (HALL_Z0 + HALL_Z1) / 2);
  const elec = new THREE.BoxGeometry(HALL_X0 - ELEC_X0, WALL_H, HALL_Z1 - HALL_Z0).translate((ELEC_X0 + HALL_X0) / 2, WALL_H / 2, (HALL_Z0 + HALL_Z1) / 2);
  const walls = new THREE.Mesh(
    mergeGeometries([hall, elec])!,
    new THREE.MeshStandardMaterial({ color: '#27384d', transparent: true, opacity: 0.34, side: THREE.BackSide, depthWrite: false, roughness: 0.8 }),
  );
  walls.renderOrder = 0;
  root.add(walls);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(walls.geometry), new THREE.LineBasicMaterial({ color: '#4b6a8a', transparent: true, opacity: 0.55 }));
  root.add(edges);

  // Cold-aisle containment: roof panel over each aisle and a door at each end (translucent).
  const glass: THREE.BufferGeometry[] = [];
  const frame: THREE.BufferGeometry[] = [];
  for (let p = 0; p < 3; p++) {
    const z0 = coldZ(p) - AISLE_W / 2;
    glass.push(box(-0.05, RACKS_X1 + 0.15, RACK_H + 0.08, RACK_H + 0.1, z0, z0 + AISLE_W));
    glass.push(box(-0.06, -0.04, 0, RACK_H + 0.08, z0, z0 + AISLE_W));
    glass.push(box(RACKS_X1 + 0.13, RACKS_X1 + 0.15, 0, RACK_H + 0.08, z0, z0 + AISLE_W));
    frame.push(box(-0.05, RACKS_X1 + 0.15, RACK_H + 0.08, RACK_H + 0.1, z0, z0 + AISLE_W));
  }
  const glassGeo = mergeGeometries(glass.map((g) => g.toNonIndexed()))!;
  const containment = new THREE.Mesh(glassGeo, new THREE.MeshBasicMaterial({ color: '#58c8ff', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  containment.renderOrder = 3;
  root.add(containment);
  const cEdges = new THREE.LineSegments(new THREE.EdgesGeometry(glassGeo, 20), new THREE.LineBasicMaterial({ color: '#58c8ff', transparent: true, opacity: 0.45 }));
  cEdges.renderOrder = 3;
  root.add(cEdges);

  // Roof deck east of the hall, on columns (chillers stand on it; the cooling pipes rise to it).
  const deck: THREE.BufferGeometry[] = [box(10.0, 16.2, ROOF_Y - 0.16, ROOF_Y, 1.6, 14.8)];
  for (const [x, z] of [[10.4, 2.0], [15.8, 2.0], [10.4, 14.4], [15.8, 14.4]]) deck.push(box(x - 0.1, x + 0.1, -0.45, ROOF_Y - 0.16, z - 0.1, z + 0.1));
  const roof = new THREE.Mesh(mergeGeometries(deck.map((g) => g.toNonIndexed()))!, new THREE.MeshStandardMaterial({ color: '#2c3b50', roughness: 0.75, metalness: 0.2 }));
  root.add(roof);
  return root;
}
