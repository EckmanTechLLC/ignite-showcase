import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CRAHS, ELEC_X0, HALL_X0, HALL_X1, HALL_Z0, HALL_Z1, RACKS, RACKS_X1, RACK_H, ROOF_Y, WALL_H, coldZ, hotZ } from './geometry';
import { Batch, flatPlane, wallPlane } from './gfx';
import type { Materials } from './materials';
import { exitTexture } from './textures';

/**
 * Procedural room shell and building services: glossy raised floor with perforated cold-aisle tiles over a pedestal
 * grid, panel walls (glazed on the plant side), cold-aisle containment (framed glass roof with strip lights, framed
 * glass end doors with handles, hazard stripes), ceiling grid with fixtures, return-air ducts into the CRAH tops, cable
 * trays over every row, columns, doors, exit signs, fire-suppression cabinet and the chiller roof deck.
 */

const XE = RACKS_X1 + 0.14; // east containment door plane
const XW = -0.05; // west containment door plane

function containment(b: Batch): void {
  for (let p = 0; p < 3; p++) {
    const zc = coldZ(p);
    const z0 = zc - 0.7;
    const z1 = zc + 0.7;
    const top = RACK_H + 0.1;
    // glass roof in 1.2 m bays, frame rails and cross bars
    for (let x = XW, k = 0; x < XE - 0.01; x += 1.2, k++) {
      const x1 = Math.min(x + 1.2, XE);
      b.box('glass', x + 0.02, x1 - 0.02, top - 0.012, top, z0 + 0.03, z1 - 0.03);
      b.box('steel', x, x + 0.04, top - 0.04, top + 0.02, z0, z1);
      b.box('light', x + 0.2, x1 - 0.2, top - 0.075, top - 0.055, zc - 0.32, zc - 0.26); // strip lights
      b.box('light', x + 0.2, x1 - 0.2, top - 0.075, top - 0.055, zc + 0.26, zc + 0.32);
      for (const z of [zc - 0.29, zc + 0.29]) b.box('steel', x + 0.15, x + 0.2, top - 0.06, top - 0.04, z - 0.04, z + 0.04); // light brackets
    }
    b.box('steel', XE - 0.04, XE, top - 0.04, top + 0.02, z0, z1);
    for (const z of [z0, z1 - 0.05]) b.box('steel', XW, XE, top - 0.05, top + 0.02, z, z + 0.05);
    // end doors (sliding, shown part open): header with track, jambs, two fixed glass panels and two sliding leaves
    // parked over them, so a 0.7 m opening stays clear; handles on the leaf edges, gaskets, hazard stripes
    for (const [x, dir] of [[XW, -1], [XE - 0.01, 1]] as const) {
      const t = 0.045;
      b.box('steel', x - t / 2, x + t / 2, RACK_H + 0.02, top, z0, z1);
      b.cyl('galv', x + dir * 0.03, RACK_H + 0.005, (z0 + z1) / 2, 0.008, z1 - z0 - 0.1, 'z', 6); // track
      b.box('steel', x - t / 2, x + t / 2, 0, 0.04, z0, z1);
      for (const [za, zb] of [[z0 + 0.05, z0 + 0.35], [z1 - 0.35, z1 - 0.05]] as const) {
        const lowSide = za < zc;
        if (lowSide) b.box('steel', x - t / 2, x + t / 2, 0.04, RACK_H + 0.02, z0, za); // outer jamb
        else b.box('steel', x - t / 2, x + t / 2, 0.04, RACK_H + 0.02, zb, z1);
        b.box('glass', x - 0.005, x + 0.005, 0.1, RACK_H, za, zb); // fixed panel
        const edge = lowSide ? zb : za;
        b.box('steel', x - t / 2, x + t / 2, 0.04, RACK_H + 0.02, edge - 0.01, edge + 0.01);
        // sliding leaf parked in front of the fixed panel
        const xl = x + dir * 0.035;
        b.box('glass', xl - 0.005, xl + 0.005, 0.1, RACK_H, za + 0.01, zb - 0.01);
        for (const y of [0.1, RACK_H]) b.box('galv', xl - 0.012, xl + 0.012, y - 0.02, y + 0.02, za, zb);
        for (const z of [za, zb]) b.box('galv', xl - 0.012, xl + 0.012, 0.1, RACK_H, z - 0.012, z + 0.012);
        const inner = edge; // edge facing the opening
        b.cyl('steel', xl + dir * 0.03, 1.15, inner, 0.012, 0.55, 'y', 10);
        for (const y of [0.9, 1.4]) b.box('steel', Math.min(xl, xl + dir * 0.03), Math.max(xl, xl + dir * 0.03), y - 0.01, y + 0.01, inner - 0.008, inner + 0.008);
        b.box('rubber', xl - 0.004, xl + 0.004, 0.1, RACK_H, inner - 0.006, inner + 0.006); // gasket
      }
      // hazard stripes on the floor in front of the door
      const xs = dir < 0 ? [x - 0.32, x - 0.17] : [x + 0.17, x + 0.32];
      b.add('hazard', flatPlane(xs[0], xs[1], z0, z1, 0.005, 0.3));
    }
  }
}

function ceiling(b: Batch): void {
  const y = WALL_H - 0.02;
  for (let z = HALL_Z0 + 0.6; z < HALL_Z1; z += 1.2) b.box('galv', ELEC_X0, HALL_X1, y, y + 0.03, z - 0.01, z + 0.01);
  for (let x = ELEC_X0 + 0.6; x < HALL_X1; x += 1.2) b.box('galv', x - 0.01, x + 0.01, y - 0.002, y + 0.028, HALL_Z0, HALL_Z1);
  const fixture = (x: number, z: number) => {
    b.box('steel', x - 0.17, x + 0.17, y - 0.04, y, z - 0.62, z + 0.62);
    b.box('light', x - 0.14, x + 0.14, y - 0.048, y - 0.04, z - 0.58, z + 0.58);
  };
  for (let k = 0; k < 4; k++) for (const dz of [-0.55, 0.55]) for (let x = 0.7; x < HALL_X1 - 0.3; x += 1.8) {
    const z = hotZ(k) + dz;
    if (z > 0.2 && z < HALL_Z1 - 0.2) {
      b.box('steel', x - 0.17, x + 0.17, y - 0.04, y, z - 0.03, z + 0.03);
      b.box('light', x - 0.14, x + 0.14, y - 0.048, y - 0.04, z - 0.025, z + 0.025);
    }
  }
  for (const x of [-6.4, -4.6, -2.8, -1.1]) for (const z of [2.6, 5.4, 8.2, 11.0, 13.8]) fixture(x, z);
}

function hvac(b: Batch): void {
  // return-air ducts over the hot aisles, grilles underneath, hangers, risers into the CRAH tops
  for (let k = 0; k < 4; k++) {
    const z = hotZ(k);
    b.box('duct', 0.3, 8.2, 2.89, 3.21, z - 0.45, z + 0.45);
    for (let x = 0.3; x <= 8.21; x += 1.2) {
      b.box('steel', x - 0.02, x + 0.02, 2.87, 3.23, z - 0.47, z + 0.47);
      for (const dz of [-0.4, 0.4]) b.cyl('galv', x, 3.32, z + dz, 0.006, 0.2, 'y', 6);
    }
    for (let x = 0.9; x < 8.0; x += 1.2) b.box('louvre', x - 0.3, x + 0.3, 2.885, 2.89, z - 0.3, z + 0.3);
  }
  for (let p = 0; p < 3; p++) {
    const zc = coldZ(p);
    b.box('duct', 7.9, 8.5, 2.89, 3.21, hotZ(p), hotZ(p + 1)); // cross duct
    b.box('duct', 7.75, 8.65, 2.4, 2.89, zc - 0.8, zc + 0.8); // riser plenum onto the CRAH
    b.box('steel', 7.73, 8.67, 2.86, 2.92, zc - 0.82, zc + 0.82);
    b.box('steel', 7.73, 8.67, 2.4, 2.44, zc - 0.82, zc + 0.82);
  }
  const c4 = CRAHS[3];
  b.box('duct', c4.x - 0.7, c4.x + 0.7, c4.y + 1.1, 2.89, c4.z - 0.4, c4.z + 0.4);
  b.box('steel', c4.x - 0.72, c4.x + 0.72, 2.86, 2.92, c4.z - 0.42, c4.z + 0.42);
}

function trays(b: Batch): void {
  const rows = new Set(RACKS.map((r) => r.row));
  for (const row of rows) {
    const r = RACKS.find((q) => q.row === row)!;
    const y = 2.4;
    for (const dz of [-0.2, 0.2]) b.box('galv', 0.05, RACKS_X1, y, y + 0.06, r.z + dz - 0.012, r.z + dz + 0.012);
    for (let x = 0.12; x < RACKS_X1; x += 0.3) b.box('galv', x - 0.01, x + 0.01, y, y + 0.015, r.z - 0.2, r.z + 0.2);
    for (let x = 0.35; x < RACKS_X1; x += 1.4) for (const dz of [-0.2, 0.2]) b.cyl('galv', x, y - 0.12, r.z + dz, 0.006, 0.24, 'y', 6); // hangers to the containment frame
    // a few cable bundles in the tray
    for (const dz of [-0.1, 0.1]) b.cyl('rubber', (0.05 + RACKS_X1) / 2, y + 0.03, r.z + dz, 0.025, RACKS_X1 - 0.3, 'x', 8);
  }
}

function columns(b: Batch): void {
  const pts: [number, number][] = [[ELEC_X0 + 0.2, HALL_Z0 + 0.2], [ELEC_X0 + 0.2, HALL_Z1 - 0.2], [-4, HALL_Z0 + 0.2], [-4, HALL_Z1 - 0.2], [HALL_X0 + 0.15, HALL_Z0 + 0.2], [HALL_X0 + 0.15, HALL_Z1 - 0.2], [HALL_X1 - 0.2, HALL_Z0 + 0.2], [HALL_X1 - 0.2, HALL_Z1 - 0.2]];
  for (const [x, z] of pts) {
    b.box('cab', x - 0.12, x + 0.12, 0.05, WALL_H - 0.05, z - 0.12, z + 0.12);
    b.box('steel', x - 0.2, x + 0.2, 0, 0.05, z - 0.2, z + 0.2); // base plate
    b.box('steel', x - 0.17, x + 0.17, WALL_H - 0.05, WALL_H, z - 0.17, z + 0.17); // cap
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) b.ball('steel', x + dx * 0.16, 0.06, z + dz * 0.16, 0.014, 8);
    b.box('yellow', x - 0.125, x + 0.125, 0.05, 0.3, z - 0.125, z + 0.125); // yellow collision guard
  }
}

function shell(b: Batch): void {
  // panel walls (inward-facing, so the near walls vanish from outside), glazed east and north hall walls
  const wall = (ax: number, az: number, bx: number, bz: number) => b.add('wall', wallPlane(ax, az, bx, bz, 0, WALL_H));
  wall(HALL_X1, HALL_Z1, HALL_X0, HALL_Z1); // hall south
  wall(HALL_X0, HALL_Z1, HALL_X0, HALL_Z0); // partition, hall side
  wall(HALL_X0, HALL_Z0, HALL_X0, HALL_Z1); // partition, electrical side
  wall(ELEC_X0, HALL_Z0, HALL_X0, HALL_Z0); // electrical north
  wall(HALL_X0, HALL_Z1, ELEC_X0, HALL_Z1); // electrical south
  wall(ELEC_X0, HALL_Z1, ELEC_X0, HALL_Z0); // electrical west
  const glaze = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / 1.2);
    const ux = (x1 - x0) / len;
    const uz = (z1 - z0) / len;
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * len;
      b.box('steel', x0 + ux * s - 0.03, x0 + ux * s + 0.03, 0, WALL_H, z0 + uz * s - 0.03, z0 + uz * s + 0.03); // mullion
    }
    b.box('steel', Math.min(x0, x1) - 0.03, Math.max(x0, x1) + 0.03, 0, 0.12, Math.min(z0, z1) - 0.03, Math.max(z0, z1) + 0.03);
    b.box('steel', Math.min(x0, x1) - 0.03, Math.max(x0, x1) + 0.03, WALL_H - 0.08, WALL_H, Math.min(z0, z1) - 0.03, Math.max(z0, z1) + 0.03);
    b.box('glass', Math.min(x0, x1) - 0.005, Math.max(x0, x1) + 0.005, 0.12, WALL_H - 0.08, Math.min(z0, z1) - 0.005, Math.max(z0, z1) + 0.005);
  };
  glaze(HALL_X1, HALL_Z0, HALL_X1, HALL_Z1);
  glaze(HALL_X0, HALL_Z0, HALL_X1, HALL_Z0);

  // doors: partition (hall hot aisle 3) and the electrical north wall, frames + leaves + push bars + vision panels
  const door = (x: number, z: number, axis: 'x' | 'z', dir: 1 | -1) => {
    const w = 0.5;
    const t = 0.05;
    if (axis === 'x') {
      b.box('steel', x - t, x + t, 0, 2.15, z - w - 0.06, z - w);
      b.box('steel', x - t, x + t, 0, 2.15, z + w, z + w + 0.06);
      b.box('steel', x - t, x + t, 2.1, 2.2, z - w - 0.06, z + w + 0.06);
      for (const side of [-1, 1]) {
        const xf = x + side * (t + 0.01);
        b.box('cab', xf - 0.02, xf + 0.02, 0, 2.06, z - w + 0.01, z + w - 0.01);
        b.box('glass', xf - 0.022, xf + 0.022, 1.35, 1.8, z - 0.15, z + 0.15);
        b.box('steel', xf + side * 0.02, xf + side * 0.05, 0.9, 1.0, z - 0.4, z + 0.4); // push bar
      }
    } else {
      b.box('steel', x - w - 0.06, x - w, 0, 2.15, z - t, z + t);
      b.box('steel', x + w, x + w + 0.06, 0, 2.15, z - t, z + t);
      b.box('steel', x - w - 0.06, x + w + 0.06, 2.1, 2.2, z - t, z + t);
      const zf = z + dir * (t + 0.01);
      b.box('cab', x - w + 0.01, x + w - 0.01, 0, 2.06, zf - 0.02, zf + 0.02);
      b.box('glass', x - 0.15, x + 0.15, 1.35, 1.8, zf - 0.022, zf + 0.022);
      b.box('steel', x - 0.4, x + 0.4, 0.9, 1.0, zf + dir * 0.02, zf + dir * 0.05);
    }
  };
  door(HALL_X0, hotZ(2), 'x', 1);
  door(-3.0, HALL_Z0, 'z', 1);

  // fire suppression: wall cabinet (hall) and agent cylinders (electrical room)
  b.box('red', HALL_X0, HALL_X0 + 0.2, 0.9, 1.75, hotZ(3) - 0.3, hotZ(3) + 0.3);
  b.box('rubber', HALL_X0 + 0.2, HALL_X0 + 0.205, 0.95, 1.7, hotZ(3) - 0.002, hotZ(3) + 0.002);
  b.cyl('steel', HALL_X0 + 0.22, 1.5, hotZ(3) - 0.15, 0.04, 0.02, 'x', 18); // pressure gauge
  b.box('steel', HALL_X0 + 0.2, HALL_X0 + 0.23, 1.0, 1.15, hotZ(3) + 0.1, hotZ(3) + 0.25); // pull handle
  b.box('hazard', HALL_X0 + 0.2, HALL_X0 + 0.205, 0.78, 0.88, hotZ(3) - 0.3, hotZ(3) + 0.3);
  for (const z of [7.6, 8.1, 8.6]) {
    b.cyl('red', ELEC_X0 + 0.3, 0.75, z, 0.15, 1.4, 'y', 24);
    b.cyl('steel', ELEC_X0 + 0.3, 1.52, z, 0.05, 0.14, 'y', 14);
    b.ball('red', ELEC_X0 + 0.3, 1.46, z, 0.15, 14);
  }
  b.box('galv', ELEC_X0 + 0.05, ELEC_X0 + 0.1, 0.4, 1.1, 7.4, 8.8);
  b.cyl('galv', ELEC_X0 + 0.45, 1.58, 8.1, 0.025, 1.4, 'z', 8); // manifold
  // generator intake louvre in the west wall
  b.box('louvre', ELEC_X0, ELEC_X0 + 0.015, 0.7, 2.3, 10.9, 12.5);
  b.box('steel', ELEC_X0, ELEC_X0 + 0.02, 0.66, 0.7, 10.86, 12.54);
  b.box('steel', ELEC_X0, ELEC_X0 + 0.02, 2.3, 2.34, 10.86, 12.54);
}

function floorAndDeck(b: Batch): void {
  // solid floor: full-width bands between the cold-aisle perforated strips, plus the ends of each strip row
  const x0 = ELEC_X0;
  const x1 = HALL_X1;
  const zs: number[] = [HALL_Z0];
  for (let p = 0; p < 3; p++) zs.push(coldZ(p) - 0.6, coldZ(p) + 0.6);
  zs.push(HALL_Z1);
  for (let i = 0; i < zs.length; i += 2) b.add('floor', flatPlane(x0, x1, zs[i], zs[i + 1], 0));
  for (let p = 0; p < 3; p++) {
    b.add('floor', flatPlane(x0, -0.1, coldZ(p) - 0.6, coldZ(p) + 0.6, 0));
    b.add('floor', flatPlane(7.1, x1, coldZ(p) - 0.6, coldZ(p) + 0.6, 0));
    b.add('perf', flatPlane(-0.1, 7.1, coldZ(p) - 0.6, coldZ(p) + 0.6, 0.002));
    // pedestal grid and stringers under the perforated tiles (seen through the holes)
    for (let k = 0; k <= 12; k++) for (const dz of [-0.6, 0, 0.6]) b.cyl('galv', -0.1 + k * 0.6, -0.225, coldZ(p) + dz, 0.022, 0.45, 'y', 8);
    for (const dz of [-0.6, 0, 0.6]) b.box('galv', -0.1, 7.1, -0.03, -0.01, coldZ(p) + dz - 0.012, coldZ(p) + dz + 0.012);
    for (let k = 0; k <= 12; k++) b.box('galv', -0.1 + k * 0.6 - 0.012, -0.1 + k * 0.6 + 0.012, -0.03, -0.01, coldZ(p) - 0.6, coldZ(p) + 0.6);
  }
  // chiller roof deck east of the hall: slab, parapet, columns, handrail
  b.box('concrete', 10.0, 16.2, ROOF_Y - 0.16, ROOF_Y, 1.6, 14.8);
  b.box('galv', 9.96, 16.24, ROOF_Y, ROOF_Y + 0.1, 1.56, 1.62);
  b.box('galv', 9.96, 16.24, ROOF_Y, ROOF_Y + 0.1, 14.78, 14.84);
  b.box('galv', 16.18, 16.24, ROOF_Y, ROOF_Y + 0.1, 1.56, 14.84);
  b.box('galv', 9.96, 10.02, ROOF_Y, ROOF_Y + 0.1, 1.56, 14.84);
  for (const [x, z] of [[10.4, 2.0], [15.8, 2.0], [10.4, 14.4], [15.8, 14.4], [13.1, 2.0], [13.1, 14.4]]) {
    b.box('concrete', x - 0.12, x + 0.12, -0.45, ROOF_Y - 0.16, z - 0.12, z + 0.12);
    b.box('steel', x - 0.2, x + 0.2, ROOF_Y - 0.26, ROOF_Y - 0.16, z - 0.2, z + 0.2);
  }
  for (let z = 1.9; z <= 14.6; z += 1.3) {
    b.cyl('yellow', 16.1, ROOF_Y + 0.5, z, 0.018, 1.0, 'y', 8);
    b.cyl('yellow', 10.1, ROOF_Y + 0.5, z, 0.018, 1.0, 'y', 8);
  }
  b.cyl('yellow', 16.1, ROOF_Y + 1.0, 8.2, 0.015, 12.8, 'z', 8);
  b.cyl('yellow', 16.1, ROOF_Y + 0.55, 8.2, 0.015, 12.8, 'z', 8);
  // roof drains and a grating strip along the front
  for (const z of [3.2, 8.2, 13.2]) b.cyl('steel', 15.4, ROOF_Y + 0.01, z, 0.12, 0.02, 'y', 18);
}

export function createRoom(m: Materials): THREE.Group {
  const root = new THREE.Group();
  root.name = 'room';

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 76).rotateX(-Math.PI / 2).translate(5, -0.7, 8), new THREE.MeshBasicMaterial({ color: '#04070b' }));
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(HALL_X1 - ELEC_X0, HALL_Z1 - HALL_Z0).rotateX(-Math.PI / 2).translate((ELEC_X0 + HALL_X1) / 2, -0.45, (HALL_Z0 + HALL_Z1) / 2), m.concrete);
  slab.receiveShadow = true;
  root.add(ground, slab);

  const b = new Batch();
  floorAndDeck(b);
  shell(b);
  containment(b);
  hvac(b);
  trays(b);
  columns(b);
  // the return ducts turn see-through when the camera looks in from above (so the hot aisles below stay readable)
  const ductMat = m.galv.clone();
  root.userData.ductMat = ductMat;
  root.add(b.build({ ...(m as unknown as Record<string, THREE.Material>), duct: ductMat }, ['steel', 'galv', 'cab', 'concrete', 'duct'], 'room-static'));

  // ceiling grid and fixtures: their own group, hidden when the camera looks in from above the cut-away
  const cb = new Batch();
  ceiling(cb);
  const ceilingGroup = cb.build(m as unknown as Record<string, THREE.Material>, [], 'ceiling');
  root.add(ceilingGroup);
  root.userData.ceiling = ceilingGroup;

  // exit signs (emissive, textured)
  const signs: THREE.BufferGeometry[] = [];
  const sign = (x: number, y: number, z: number, yaw: number) => {
    const g = new THREE.PlaneGeometry(0.34, 0.13);
    g.rotateY(yaw);
    g.translate(x, y, z);
    signs.push(g);
  };
  sign(HALL_X0 + 0.01, 2.38, hotZ(2), Math.PI / 2);
  sign(HALL_X0 - 0.01, 2.38, hotZ(2), -Math.PI / 2);
  sign(-3.0, 2.38, HALL_Z0 + 0.01, 0);
  const exit = new THREE.Mesh(mergeGeometries(signs)!, new THREE.MeshBasicMaterial({ map: exitTexture(), toneMapped: false }));
  exit.name = 'exit-signs';
  root.add(exit);
  return root;
}
