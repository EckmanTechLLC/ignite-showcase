import * as THREE from 'three';
import { EQUIP, equipOf } from './geometry';
import type { Equip } from './geometry';
import { FAN_OFF, FAN_RUN, fanGeometry } from './fans';
import { Batch, instanceGlow } from './gfx';
import type { Materials } from './materials';
import { S, powerState, refresh } from './sample';
import { Atlas, drawPlate } from './textures';
import { setRgb } from './util';
import type { Target } from '../selection';

type RGB = [number, number, number];

export interface Electrical {
  group: THREE.Group;
  /** Invisible box instances over every EQUIP entry (raycast target). */
  pick: THREE.InstancedMesh;
  /** Target for an instance of `pick`. */
  targetOf(i: number): Target;
  /** World position of the generator exhaust stack outlet. */
  stackTop: THREE.Vector3;
  update(dt: number, t: number, animate: boolean): void;
}

const socColor = (pct: number): RGB => (pct > 50 ? [60, 220, 130] : pct > 20 ? [255, 190, 60] : [255, 70, 60]);
const loadColor = (pct: number): RGB => (pct >= 100 ? [255, 70, 60] : pct >= 85 ? [255, 190, 60] : [40, 200, 235]);
const PDU_IDS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];
const FRONT_X = Math.PI / 2; // yaw of equipment whose front looks towards +x
const BR_COLS = 2;
const BR_ROWS = 11;
const CELLS_PER_UPS = 70;

/** UPS lineup (local: front +z; local x = -world z): rectifier/inverter | battery cabinet behind glass | bypass. */
function buildUps(b: Batch, e: Equip): void {
  const W = e.sz;
  const D = e.sx;
  const H = e.sy;
  b.box('rubber', -W / 2 + 0.03, W / 2 - 0.03, 0, 0.08, -D / 2 + 0.03, D / 2 - 0.03);
  b.box('cab', -W / 2, W / 2, 0.08, H - 0.1, -D / 2, D / 2 - 0.28); // core
  b.box('cab', 0.3, W / 2, 0.08, H - 0.1, D / 2 - 0.28, D / 2); // rectifier / inverter section
  b.box('cab', -W / 2, -0.3, 0.08, H - 0.1, D / 2 - 0.28, D / 2); // bypass section
  b.box('steel', -W / 2 - 0.005, W / 2 + 0.005, H - 0.1, H, -D / 2 - 0.005, D / 2 + 0.005); // top cap
  for (const s of [-1, 1]) b.box('cab', s * 0.3 - 0.015, s * 0.3 + 0.015, 0.08, H - 0.1, D / 2 - 0.28, D / 2 - 0.02); // battery cabinet side frames
  b.box('cab', -0.3, 0.3, H - 0.2, H - 0.1, D / 2 - 0.28, D / 2); // battery cabinet header
  b.box('cab', -0.3, 0.3, 0.08, 0.14, D / 2 - 0.28, D / 2); // battery cabinet kick plate
  for (let k = 0; k < 5; k++) b.box('steel', -0.285, 0.285, 0.26 + k * 0.34 - 0.01, 0.26 + k * 0.34 + 0.01, D / 2 - 0.29, D / 2 - 0.04); // battery shelves
  b.box('glassCab', -0.285, 0.285, 0.14, H - 0.2, D / 2 - 0.022, D / 2 - 0.018); // glass door
  b.box('steel', -0.012, 0.012, 0.14, H - 0.2, D / 2 - 0.03, D / 2 - 0.005); // door mullion
  b.cyl('steel', 0.2, 1.0, D / 2 + 0.01, 0.012, 0.3, 'y', 8); // glass door handle
  // rectifier section: louvre vents, door seam, handle, lamps panel
  b.box('louvre', 0.36, W / 2 - 0.06, 0.5, 0.85, D / 2, D / 2 + 0.012);
  b.box('rubber', 0.36, W / 2 - 0.06, 0.9, 0.92, D / 2, D / 2 + 0.006);
  b.box('steel', W / 2 - 0.1, W / 2 - 0.08, 0.9, 1.3, D / 2, D / 2 + 0.03);
  b.box('rubber', 0.42, 0.78, 1.38, 1.76, D / 2, D / 2 + 0.006); // control panel recess behind the display
  for (let i = 0; i < 3; i++) b.cyl('rubber', 0.4 + i * 0.1, 1.2, D / 2 + 0.01, 0.022, 0.02, 'z', 12); // push buttons
  b.cyl('red', 0.7, 1.2, D / 2 + 0.012, 0.032, 0.024, 'z', 14); // emergency off
  // bypass section: maintenance bypass breakers and key switch
  for (let i = 0; i < 3; i++) {
    const x = -0.62 + i * 0.16;
    b.box('rubber', x - 0.06, x + 0.06, 0.9, 1.5, D / 2, D / 2 + 0.01);
    b.cyl('red', x, 1.2, D / 2 + 0.03, 0.026, 0.06, 'z', 10);
    b.box('steel', x - 0.022, x + 0.022, 1.2 - 0.01, 1.2 + 0.05, D / 2 + 0.05, D / 2 + 0.07);
  }
  b.cyl('steel', -0.62, 0.55, D / 2 + 0.02, 0.03, 0.04, 'z', 14); // key switch
  b.box('louvre', -W / 2 + 0.06, -0.36, 0.2, 0.7, D / 2, D / 2 + 0.012);
  // roof vents (fans behind grills) and corner bolts
  for (const x of [-0.5, 0.5]) {
    b.ring('steel', x, H + 0.004, 0, 0.17, 0.012, 'y', 32, 6);
    b.cyl('rubber', x, H + 0.002, 0, 0.165, 0.006, 'y', 32);
  }
  for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) for (const z of [-D / 2 + 0.04, D / 2 - 0.04]) b.ball('steel', x, H + 0.015, z, 0.015, 8);
}

/** PDU: cabinet with a breaker panel, side louvres and a feeder gland. */
function buildPdu(b: Batch, e: Equip): void {
  const W = e.sz;
  const D = e.sx;
  const H = e.sy;
  b.box('rubber', -W / 2 + 0.03, W / 2 - 0.03, 0, 0.08, -D / 2 + 0.03, D / 2 - 0.03);
  b.box('cab', -W / 2, W / 2, 0.08, H - 0.06, -D / 2, D / 2);
  b.box('steel', -W / 2 - 0.004, W / 2 + 0.004, H - 0.06, H, -D / 2 - 0.004, D / 2 + 0.004);
  b.box('paint', -0.34, 0.34, 0.3, 1.35, D / 2, D / 2 + 0.012); // breaker panel
  for (let c = 0; c < BR_COLS; c++) {
    for (let r = 0; r < BR_ROWS; r++) {
      const x = (c ? 1 : -1) * 0.15;
      const y = 0.38 + r * 0.08;
      b.box('rubber', x - 0.07, x + 0.07, y - 0.03, y + 0.03, D / 2 + 0.012, D / 2 + 0.02);
      b.box('steel', x - 0.062, x + 0.062, y + 0.034, y + 0.037, D / 2 + 0.012, D / 2 + 0.018);
    }
  }
  b.box('rubber', -0.12, 0.12, 1.2, 1.3, D / 2 + 0.012, D / 2 + 0.024); // main breaker housing
  for (const s of [-1, 1]) b.box('louvre', s * (W / 2), s * (W / 2 + 0.012), 0.3, 1.0, -D / 2 + 0.12, D / 2 - 0.12);
  b.box('cab', -0.12, 0.12, H, H + 0.1, -0.12, 0.12); // feeder gland
  b.cyl('galv', 0, H + 0.1, 0, 0.07, 0.06, 'y', 16);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.ball('steel', x * (W / 2 - 0.04), H + 0.012, z * (D / 2 - 0.04), 0.014, 8);
}

/** ATS: cabinet with a window onto the two contactors, copper bus, an operating mechanism plate. */
function buildAts(b: Batch, e: Equip): void {
  const W = e.sz;
  const D = e.sx;
  const H = e.sy;
  b.box('rubber', -W / 2 + 0.03, W / 2 - 0.03, 0, 0.08, -D / 2 + 0.03, D / 2 - 0.03);
  b.box('cab', -W / 2, W / 2, 0.08, H - 0.06, -D / 2, D / 2 - 0.2); // core
  b.box('cab', -W / 2, W / 2, 0.08, 0.34, D / 2 - 0.2, D / 2); // lower front
  b.box('cab', -W / 2, W / 2, 1.36, H - 0.06, D / 2 - 0.2, D / 2); // upper front (display)
  for (const s of [-1, 1]) b.box('cab', s * (W / 2 - 0.075) - 0.075, s * (W / 2 - 0.075) + 0.075, 0.34, 1.36, D / 2 - 0.2, D / 2); // window jambs
  b.box('steel', -W / 2 - 0.004, W / 2 + 0.004, H - 0.06, H, -D / 2 - 0.004, D / 2 + 0.004);
  // inside: back plate, two contactors, copper bus and a link bar
  b.box('paint', -0.52, 0.52, 0.4, 1.3, D / 2 - 0.205, D / 2 - 0.19);
  for (const x of [-0.3, 0.3]) {
    b.box('engine', x - 0.15, x + 0.15, 0.55, 1.15, D / 2 - 0.19, D / 2 - 0.05); // contactor body
    b.box('rubber', x - 0.12, x + 0.12, 0.85, 0.98, D / 2 - 0.05, D / 2 - 0.035);
    for (const dx of [-0.1, 0, 0.1]) {
      b.box('copper', x + dx - 0.015, x + dx + 0.015, 0.4, 0.55, D / 2 - 0.15, D / 2 - 0.12); // lower terminals
      b.box('copper', x + dx - 0.015, x + dx + 0.015, 1.15, 1.3, D / 2 - 0.15, D / 2 - 0.12); // upper terminals
    }
  }
  b.box('copper', -0.3, 0.3, 1.28, 1.31, D / 2 - 0.15, D / 2 - 0.12); // load bus
  b.box('glassCab', -0.5, 0.5, 0.34, 1.36, D / 2 - 0.006, D / 2 - 0.002); // window
  // operating mechanism: arc plate with the three positions
  b.box('paint', -0.3, 0.3, 0.08, 0.34, D / 2, D / 2 + 0.01);
  b.cyl('steel', 0, 0.26, D / 2 + 0.02, 0.035, 0.03, 'z', 16);
  b.ring('steel', 0, 0.26, D / 2 + 0.012, 0.19, 0.006, 'z', 40, 5);
  b.box('steel', W / 2 - 0.1, W / 2 - 0.08, 0.5, 1.1, D / 2, D / 2 + 0.03); // door handle
  for (const x of [-0.5, 0.5]) for (const y of [0.4, 1.3]) b.ball('steel', x, y, D / 2 + 0.008, 0.012, 8); // door screws
}

/** Utility entry / main switchgear: cabinet, three ceramic bushings with skirts, conduits, meter and hazard plate. */
function buildUtility(b: Batch, e: Equip): void {
  const W = e.sz;
  const D = e.sx;
  const top = 1.5;
  b.box('rubber', -W / 2 + 0.03, W / 2 - 0.03, 0, 0.08, -D / 2 + 0.03, D / 2 - 0.03);
  b.box('cab', -W / 2, W / 2, 0.08, top, -D / 2, D / 2);
  b.box('steel', -W / 2 - 0.004, W / 2 + 0.004, top, top + 0.04, -D / 2 - 0.004, D / 2 + 0.004);
  for (const x of [-0.45, 0, 0.45]) {
    const z = -0.25;
    b.cyl('ceramic', x, top + 0.2, z, 0.045, 0.32, 'y', 14);
    for (let k = 0; k < 6; k++) b.cyl('ceramic', x, top + 0.1 + k * 0.045, z, 0.1 - k * 0.006, 0.02, 'y', 18);
    b.cyl('steel', x, top + 0.38, z, 0.06, 0.04, 'y', 14);
    b.cyl('copper', x, top + 0.43, z, 0.025, 0.1, 'y', 10);
    b.cyl('galv', x, top + 0.05, z, 0.12, 0.04, 'y', 18); // flange
  }
  b.box('cab', -0.6, 0.6, top + 0.04, top + 0.5, -D / 2 + 0.03, -D / 2 + 0.12); // rear cable riser box
  // front: meter bezel plate (screen comes from the display atlas), louvres, handle, hazard sign
  b.box('rubber', -0.55, -0.05, 1.12, 1.44, D / 2, D / 2 + 0.01);
  b.box('louvre', 0.05, W / 2 - 0.08, 0.2, 0.7, D / 2, D / 2 + 0.012);
  b.box('rubber', 0.05, W / 2 - 0.08, 0.7, 0.72, D / 2, D / 2 + 0.006);
  b.box('steel', W / 2 - 0.12, W / 2 - 0.1, 0.5, 1.1, D / 2, D / 2 + 0.03);
  b.box('hazard', -0.5, -0.1, 0.22, 0.42, D / 2, D / 2 + 0.006);
  b.cyl('steel', 0.55, 1.25, D / 2 + 0.02, 0.025, 0.035, 'z', 12); // padlock hasp
  // three conduits through the wall behind
  for (const x of [-0.4, 0, 0.4]) b.cyl('galv', x, 1.0, -D / 2 - 0.15, 0.05, 0.3, 'z', 12);
}

export function createElectrical(m: Materials): Electrical {
  const group = new THREE.Group();
  group.name = 'electrical';
  const n = EQUIP.length;

  const plates = new Atlas(4, 3, 256, 128);
  const plateOf: Record<string, number> = {};
  const plateText: Record<string, [string, string[]]> = {
    'utility/': ['UTILITY ENTRY', ['1500 kVA  480 V 3PH', '12.47 kV / 480 V  60 Hz']],
    'generator/': ['GENSET', ['1000 kW  1250 kVA', '480 V  60 Hz  DIESEL']],
    'ats/': ['ATS', ['1200 A  480 V 3PH', 'CLOSED TRANSITION']],
    'ups/A': ['UPS A', ['500 kVA / 500 kW', '480 V  66 kWh VRLA']],
    'ups/B': ['UPS B', ['500 kVA / 500 kW', '480 V  66 kWh VRLA']],
    'pdu/A1': ['PDU A1', ['120 kW  480/208 V', '400 A  3PH 4W']],
    'pdu/A2': ['PDU A2', ['120 kW  480/208 V', '400 A  3PH 4W']],
    'pdu/A3': ['PDU A3', ['120 kW  480/208 V', '400 A  3PH 4W']],
    'pdu/B1': ['PDU B1', ['120 kW  480/208 V', '400 A  3PH 4W']],
    'pdu/B2': ['PDU B2', ['120 kW  480/208 V', '400 A  3PH 4W']],
    'pdu/B3': ['PDU B3', ['120 kW  480/208 V', '400 A  3PH 4W']],
  };
  Object.keys(plateText).forEach((k, i) => {
    plateOf[k] = i;
    plates.draw(i, (g, w, h) => drawPlate(g, w, h, plateText[k][0], plateText[k][1]));
  });
  // PDU plates are 12 cells (4 x 3): utility, gen, ats, ups x2, pdu x6 = 11

  const b = new Batch();
  const placePlate = (key: string, x: number, y: number, z: number, yaw: number, w: number, h: number) => {
    const g = new THREE.PlaneGeometry(w, h);
    plates.remap(g, plateOf[key]);
    g.rotateY(yaw);
    g.translate(x, y, z);
    b.m.identity();
    b.add('plate', g);
  };
  const upsE = (['A', 'B'] as const).map((id) => equipOf('ups', id)!);
  const pduE = PDU_IDS.map((id) => equipOf('pdu', id)!);
  const atsE = equipOf('ats', '')!;
  const genE = equipOf('generator', '')!;
  const utilE = equipOf('utility', '')!;
  for (const e of upsE) b.at(e.x, e.z, FRONT_X, () => buildUps(b, e));
  for (const e of pduE) b.at(e.x, e.z, FRONT_X, () => buildPdu(b, e));
  b.at(atsE.x, atsE.z, FRONT_X, () => buildAts(b, atsE));
  b.at(utilE.x, utilE.z, FRONT_X, () => buildUtility(b, utilE));
  upsE.forEach((e) => placePlate(`ups/${e.id}`, e.x + e.sx / 2 + 0.006, 0.3, e.z - 0.55, FRONT_X, 0.4, 0.2));
  pduE.forEach((e) => placePlate(`pdu/${e.id}`, e.x + e.sx / 2 + 0.006, 0.18, e.z, FRONT_X, 0.4, 0.2));
  placePlate('ats/', atsE.x + atsE.sx / 2 + 0.006, 1.64, atsE.z, FRONT_X, 0.3, 0.14);
  placePlate('utility/', utilE.x + utilE.sx / 2 + 0.006, 0.95, utilE.z - 0.32, FRONT_X, 0.36, 0.18);

  // --- generator (open frame, world axes, front +z) ---
  const gx = genE.x;
  const gz = genE.z;
  b.at(gx, gz, 0, () => {
    b.box('paint', -1.3, 1.3, 0, 0.1, -0.6, 0.6); // skid
    b.box('engine', -1.28, 1.28, 0.1, 0.45, -0.58, 0.58); // fuel tank base
    for (const x of [-1.0, -0.2, 0.6]) b.box('steel', x - 0.02, x + 0.02, 0.1, 0.45, -0.585, 0.585); // tank straps
    // alternator
    b.cyl('orange', -0.85, 0.85, 0, 0.34, 0.75, 'x', 32);
    for (let k = 0; k < 6; k++) b.ring('steel', -1.1 + k * 0.1, 0.85, 0, 0.34, 0.01, 'x', 32, 5);
    b.cyl('orange', -1.3, 0.85, 0, 0.3, 0.12, 'x', 28, 0.25);
    b.box('steel', -0.95, -0.65, 1.19, 1.38, -0.15, 0.15); // terminal box
    b.box('paint', -0.96, -0.64, 1.38, 1.4, -0.16, 0.16);
    // engine block, heads, valve covers
    b.box('engine', -0.45, 0.55, 0.45, 1.1, -0.38, 0.38);
    b.box('engine', -0.43, 0.53, 1.1, 1.18, -0.3, 0.3);
    for (let k = 0; k < 6; k++) b.box('orange', -0.4 + k * 0.155, -0.4 + k * 0.155 + 0.12, 1.18, 1.26, -0.28, 0.28);
    b.cyl('galv', 0.05, 1.34, 0.2, 0.05, 1.0, 'x', 14); // intake manifold
    for (let k = 0; k < 6; k++) b.cyl('galv', -0.34 + k * 0.155, 1.3, 0.2, 0.025, 0.12, 'y', 8);
    b.cyl('orange', 0.15, 0.7, 0.44, 0.06, 0.2, 'z', 14); // oil filter
    b.cyl('orange', 0.32, 0.7, 0.44, 0.06, 0.2, 'z', 14); // fuel filter
    b.cyl('rubber', -0.05, 0.85, 0.4, 0.14, 0.04, 'z', 18); // crank pulley guard
    b.cyl('steel', 0.4, 1.32, -0.2, 0.1, 0.16, 'y', 18); // turbocharger
    b.cyl('steel', 0.4, 1.2, -0.2, 0.07, 0.1, 'x', 14);
    // radiator with fan shroud and guard (the wheel itself is an instanced, spinning mesh)
    b.box('rubber', 0.62, 0.9, 0.42, 1.48, -0.52, 0.52);
    b.box('louvre', 0.9, 0.915, 0.46, 1.44, -0.5, 0.5);
    b.ring('steel', 0.97, 0.95, 0, 0.55, 0.03, 'x', 36, 8);
    b.cyl('steel', 0.93, 0.95, 0, 0.55, 0.08, 'x', 36);
    for (const r of [0.15, 0.3, 0.45, 0.6].map((k) => k * 0.9)) b.ring('galv', 1.03, 0.95, 0, r, 0.007, 'x', 40, 5);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      b.tube('galv', { x: 1.03, y: 0.95 + Math.sin(a) * 0.06, z: Math.cos(a) * 0.06 }, { x: 1.03, y: 0.95 + Math.sin(a) * 0.54, z: Math.cos(a) * 0.54 }, 0.005, 5);
    }
    // exhaust: flex, muffler, lagged stack with rain cap
    b.tube('galv', { x: 0.4, y: 1.4, z: -0.2 }, { x: 0.3, y: 1.6, z: -0.05 }, 0.05, 12);
    b.cyl('steel', 0.1, 1.68, 0, 0.19, 0.7, 'x', 28);
    b.cyl('galv', -0.27, 1.68, 0, 0.14, 0.04, 'x', 20);
    b.cyl('steel', -0.05, 2.65, 0, 0.07, 1.9, 'y', 20);
    b.cyl('ins', -0.05, 2.0, 0, 0.09, 0.8, 'y', 20);
    b.ring('galv', -0.05, 2.38, 0, 0.09, 0.012, 'y', 24, 5);
    b.cyl('steel', -0.05, 3.66, 0, 0.13, 0.08, 'y', 20, 0.02); // rain cap
    b.ring('galv', -0.05, 3.5, 0, 0.075, 0.012, 'y', 24, 5);
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.tube('galv', { x: x * 0.2 - 0.05, y: 2.0 + (z > 0 ? 0.4 : -0.3), z: z * 0.2 }, { x: -0.05, y: 2.0 + (z > 0 ? 0.4 : -0.3), z: 0 }, 0.004, 4);
    // control panel on a stand + battery box + lifting eye
    b.box('cab', 0.3, 0.8, 0.7, 1.5, 0.5, 0.6);
    b.box('steel', 0.3, 0.8, 1.5, 1.52, 0.49, 0.61);
    b.box('rubber', 0.34, 0.76, 0.72, 1.0, 0.6, 0.605);
    b.box('rubber', -1.1, -0.7, 0.1, 0.35, 0.48, 0.58); // battery box
    for (const x of [-0.95, -0.85]) b.cyl('copper', x, 0.37, 0.53, 0.018, 0.04, 'y', 10);
    b.ring('steel', -0.1, 1.2, 0, 0.07, 0.012, 'x', 20, 6); // lifting eye
    // level gauge tube + frame on the tank front (the liquid is a dynamic bar)
    b.box('steel', -0.545, -0.495, 0.1, 0.45, 0.58, 0.592);
    b.box('glassCab', -0.53, -0.51, 0.13, 0.43, 0.592, 0.6);
    for (let k = 0; k <= 4; k++) b.box('rubber', -0.49, -0.46, 0.14 + k * 0.07, 0.145 + k * 0.07, 0.585, 0.595);
    // nameplate backing
    b.box('steel', 0.3, 0.74, 0.13, 0.35, 0.58, 0.585);
  });
  placePlate('generator/', gx + 0.52, 0.24, gz + 0.5885, 0, 0.42, 0.21);

  const mats = { ...m, plate: new THREE.MeshStandardMaterial({ map: plates.texture, metalness: 0.6, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) } as unknown as Record<string, THREE.Material>;
  const statics = b.build(mats, ['cab', 'steel', 'paint', 'engine', 'orange'], 'electrical-static');
  group.add(statics);

  // --- dynamic parts ---
  const mm = new THREE.Matrix4();
  const col = new THREE.Color();
  const pick = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), n);
  pick.visible = false;
  pick.frustumCulled = false;
  EQUIP.forEach((e, i) => pick.setMatrixAt(i, mm.compose(new THREE.Vector3(e.x, e.y, e.z), new THREE.Quaternion(), new THREE.Vector3(e.sx, e.sy, e.sz))));
  pick.instanceMatrix.needsUpdate = true;

  // indicator bars: [0,1 battery gauge][2..7 PDU load][8 ATS lever][9 gen beacon][10 utility beacon][11..13 ATS lamps][14 fuel]
  const barGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), 15);
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bars.count * 3), 3);

  // breaker toggles: per PDU 22 branch + 1 main
  const PER = BR_COLS * BR_ROWS + 1;
  const toggles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.012, 0.03).translate(0.02, 0, 0), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 }), PER * 6);
  toggles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  toggles.castShadow = false;

  // UPS battery cells (glow = state of charge)
  const cellMat = instanceGlow(new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2, color: '#ffffff' }), 0.7);
  const cells = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.2, 0.08), cellMat, CELLS_PER_UPS * 2);
  cells.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cells.count * 3), 3);
  const cellPos: THREE.Vector3[][] = upsE.map((e) => {
    const out: THREE.Vector3[] = [];
    for (let k = 0; k < 5; k++) for (let j = 0; j < 7; j++) for (let d = 0; d < 2; d++) {
      // local (x, y, z) with front +z, local x = -world z
      const lx = -0.255 + j * 0.085;
      const ly = 0.26 + k * 0.34 + 0.11;
      const lz = e.sx / 2 - 0.2 + d * 0.1;
      out.push(new THREE.Vector3(e.x + lz, ly, e.z - lx));
    }
    return out;
  });
  cellPos.forEach((list, u) => list.forEach((p, i) => cells.setMatrixAt(u * CELLS_PER_UPS + i, mm.makeTranslation(p.x, p.y, p.z))));
  cells.instanceMatrix.needsUpdate = true;

  // generator radiator fan
  const genFan = new THREE.InstancedMesh(fanGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 }), 1);
  genFan.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  genFan.setColorAt(0, FAN_RUN);
  const stackTop = new THREE.Vector3(gx - 0.05, 3.7, gz);

  group.add(bars, toggles, cells, genFan, pick);
  [bars, toggles, cells, genFan].forEach((o) => (o.frustumCulled = false));

  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const qx = new THREE.Quaternion();
  const qz = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const one = new THREE.Vector3(1, 1, 1);
  let lever = 0;
  let fanAngle = 0;
  let fanSpeed = 0;
  let tripSig = '';
  let socSig = '';

  function update(dt: number, t: number, animate: boolean): void {
    refresh();
    const p = powerState();
    q.identity();
    // UPS battery gauge (edge strip) and cells by SOC.
    const socs: number[] = [];
    [p.upsA, p.upsB].forEach((u, k) => {
      const e = upsE[k];
      const soc = Number.isFinite(u.soc.value) ? Math.min(100, Math.max(0, u.soc.value)) : 0;
      socs.push(soc);
      pos.set(e.x + e.sx / 2 + 0.012, 0.22, e.z - 0.3);
      sc.set(0.012, Math.max(0.02, 1.5 * (soc / 100)), 0.03);
      bars.setMatrixAt(k, mm.compose(pos, q, sc));
      bars.setColorAt(k, setRgb(col, socColor(soc)));
    });
    const sSig = socs.map((s) => Math.round(s / 2)).join();
    if (sSig !== socSig) {
      socSig = sSig;
      socs.forEach((soc, u) => {
        const c = socColor(soc);
        for (let i = 0; i < CELLS_PER_UPS; i++) {
          const lit = (i + 0.5) / CELLS_PER_UPS <= soc / 100;
          cells.setColorAt(u * CELLS_PER_UPS + i, lit ? setRgb(col, [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55]) : setRgb(col, [14, 28, 58]));
        }
      });
      cells.instanceColor!.needsUpdate = true;
    }
    // PDUs: load bar and breaker toggles (closed = up, open/tripped = down and red).
    let tSig = '';
    PDU_IDS.forEach((id, j) => {
      const u = p.pdus[id[0] as 'A' | 'B'][Number(id[1]) - 1];
      const tripped = u.tripped.value === true;
      tSig += tripped ? '1' : '0';
      const e = pduE[j];
      const pct = tripped ? 100 : Number.isFinite(u.loadPct.value) ? u.loadPct.value : 0;
      pos.set(e.x + e.sx / 2 + 0.012, 0.3, e.z + 0.37);
      sc.set(0.012, Math.max(0.02, 1.0 * Math.min(1, pct / 100)), 0.025);
      bars.setMatrixAt(2 + j, mm.compose(pos, q, sc));
      bars.setColorAt(2 + j, setRgb(col, tripped && animate && Math.floor(t * 3) % 2 ? [90, 20, 20] : loadColor(pct)));
    });
    if (tSig !== tripSig) {
      tripSig = tSig;
      PDU_IDS.forEach((_, j) => {
        const e = pduE[j];
        const tripped = tSig[j] === '1';
        for (let c = 0; c < BR_COLS; c++) {
          for (let r = 0; r < BR_ROWS; r++) {
            const i = j * PER + c * BR_ROWS + r;
            pos.set(e.x + e.sx / 2 + 0.02, 0.38 + r * 0.08, e.z + (c ? 1 : -1) * -0.15);
            qz.setFromAxisAngle(zAxis, tripped ? -0.5 : 0.5);
            toggles.setMatrixAt(i, mm.compose(pos, qz, one));
            toggles.setColorAt(i, tripped ? col.setRGB(1, 0.2, 0.18) : col.setRGB(0.8, 0.85, 0.9));
          }
        }
        const i = j * PER + BR_COLS * BR_ROWS;
        pos.set(e.x + e.sx / 2 + 0.024, 1.25, e.z);
        qz.setFromAxisAngle(zAxis, tripped ? -0.55 : 0.55);
        toggles.setMatrixAt(i, mm.compose(pos, qz, new THREE.Vector3(1.6, 2.2, 2.6)));
        toggles.setColorAt(i, tripped ? col.setRGB(1, 0.15, 0.12) : col.setRGB(0.2, 0.9, 0.45));
      });
      toggles.instanceMatrix.needsUpdate = true;
      toggles.instanceColor!.needsUpdate = true;
    }
    // ATS lever swings to the closed source (centred when OPEN); three lamps show the position.
    const target = p.atsPos === 'UTILITY' ? -0.6 : p.atsPos === 'GENERATOR' ? 0.6 : 0;
    lever += (target - lever) * (animate ? Math.min(1, dt * 5) : 1);
    pos.set(atsE.x + atsE.sx / 2 + 0.03, 0.26, atsE.z);
    qx.setFromAxisAngle(xAxis, lever);
    sc.set(0.05, 0.2, 0.05);
    bars.setMatrixAt(8, mm.compose(pos, qx, sc));
    bars.setColorAt(8, setRgb(col, p.atsPos === 'UTILITY' ? [40, 220, 150] : p.atsPos === 'GENERATOR' ? [255, 190, 60] : [255, 70, 60]));
    [[-0.25, p.atsPos === 'UTILITY', [60, 230, 130]], [0, p.atsPos !== 'UTILITY' && p.atsPos !== 'GENERATOR', [255, 70, 60]], [0.25, p.atsPos === 'GENERATOR', [255, 190, 60]]].forEach(([dz, on, c], k) => {
      pos.set(atsE.x + atsE.sx / 2 + 0.012, 0.5, atsE.z + (dz as number));
      sc.set(0.012, 0.035, 0.035);
      bars.setMatrixAt(11 + k, mm.compose(pos, q, sc));
      const cc = c as RGB;
      bars.setColorAt(11 + k, setRgb(col, on ? cc : [cc[0] * 0.12, cc[1] * 0.12, cc[2] * 0.12]));
    });
    // Generator: beacon on the control panel (pulses while starting), radiator fan, fuel gauge.
    const gs = p.genState;
    pos.set(gx + 0.55, 1.52, gz + 0.55);
    sc.set(0.1, 0.1, 0.1);
    bars.setMatrixAt(9, mm.compose(pos, q, sc));
    const gl: RGB = gs === 'RUNNING' ? [60, 230, 130] : gs === 'STARTING' ? (animate && Math.floor(t * 4) % 2 ? [255, 190, 60] : [90, 62, 16]) : gs === 'COOLDOWN' ? [90, 150, 200] : [40, 50, 62];
    bars.setColorAt(9, setRgb(col, gl));
    const u = utilE;
    pos.set(u.x + 0.5, 1.58, u.z + 0.5);
    bars.setMatrixAt(10, mm.compose(pos, q, sc));
    bars.setColorAt(10, setRgb(col, p.utilityAvail ? [60, 230, 130] : [255, 70, 60]));
    const fuel = Number.isFinite(S.genFuel) ? Math.min(100, Math.max(0, S.genFuel)) : 0;
    pos.set(gx - 0.52, 0.14, gz + 0.597);
    sc.set(0.02, Math.max(0.01, 0.28 * (fuel / 100)), 0.006);
    bars.setMatrixAt(14, mm.compose(pos, q, sc));
    bars.setColorAt(14, setRgb(col, fuel < 20 ? [255, 190, 60] : [60, 200, 255]));
    const run = gs === 'RUNNING' || gs === 'STARTING' || gs === 'COOLDOWN';
    const tgt = gs === 'RUNNING' ? 20 : gs === 'STARTING' || gs === 'COOLDOWN' ? 9 : 0;
    fanSpeed += (tgt - fanSpeed) * Math.min(1, dt * 1.2);
    if (animate && fanSpeed > 0.01) fanAngle = (fanAngle + fanSpeed * dt) % (Math.PI * 2);
    pos.set(gx + 0.955, 0.95, gz);
    q.setFromAxisAngle(yAxis, Math.PI / 2);
    qz.setFromAxisAngle(zAxis, fanAngle);
    genFan.setMatrixAt(0, mm.compose(pos, q.clone().multiply(qz), sc.set(1.0, 1.0, 1.0)));
    genFan.setColorAt(0, run ? FAN_RUN : FAN_OFF);
    genFan.instanceMatrix.needsUpdate = true;
    genFan.instanceColor!.needsUpdate = true;
    bars.instanceMatrix.needsUpdate = true;
    bars.instanceColor!.needsUpdate = true;
  }
  update(0, 0, false);
  return { group, pick, targetOf: (i) => ({ kind: EQUIP[i].kind, id: EQUIP[i].id }), stackTop, update };
}
