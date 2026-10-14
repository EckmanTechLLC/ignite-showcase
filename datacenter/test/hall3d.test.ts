import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Batch, rng, wallPlane } from '../src/hall3d/gfx';
import { RunBuilder } from '../src/hall3d/flow/conductors';
import { CHILLERS, CRAHS, EQUIP, RACKS, RACK_D, boundsOf, coldZ, hotZ } from '../src/hall3d/geometry';
import { PRESETS } from '../src/hall3d/presets';
import { heatRgb, T_MAX, T_MIN } from '../src/heat';

describe('hall layout', () => {
  it('has 60 racks, 10 per row, six rows, unique ids and positions', () => {
    expect(RACKS).toHaveLength(60);
    expect(new Set(RACKS.map((r) => r.id)).size).toBe(60);
    expect(new Set(RACKS.map((r) => `${r.x}/${r.z}`)).size).toBe(60);
    for (let row = 0; row < 6; row++) expect(RACKS.filter((r) => r.row === row)).toHaveLength(10);
    expect(RACKS[0].id).toBe('R01');
    expect(RACKS[59].id).toBe('R60');
  });

  it('puts the inlet face of each pair on the shared cold aisle', () => {
    for (const r of RACKS) {
      const frontZ = r.z + r.face * (RACK_D / 2);
      expect(Math.abs(frontZ - coldZ(r.pair))).toBeCloseTo(0.7, 5);
      // The hot aisle is on the other side of the rack.
      expect(Math.abs(r.z - r.face * (RACK_D / 2) - hotZ(r.pair + r.side))).toBeCloseTo(0.7, 5);
    }
  });

  it('has 4 CRAHs, 2 chillers, UPS A/B, six PDUs, ATS, generator and utility, all selectable', () => {
    expect(CRAHS).toHaveLength(4);
    expect(CHILLERS).toHaveLength(2);
    expect(EQUIP.filter((e) => e.kind === 'pdu').map((e) => e.id)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
    expect(EQUIP.filter((e) => e.kind === 'ups').map((e) => e.id)).toEqual(['A', 'B']);
    for (const k of ['ats', 'generator', 'utility'] as const) expect(EQUIP.filter((e) => e.kind === k)).toHaveLength(1);
    expect(boundsOf('rack', 'R17')).not.toBeNull();
    expect(boundsOf('crah', '4')).not.toBeNull();
    expect(boundsOf('chiller', '2')).not.toBeNull();
    expect(boundsOf('ups', 'B')).not.toBeNull();
    expect(boundsOf('rack', 'R99')).toBeNull();
  });
});

describe('camera presets', () => {
  it('are keys 1-5 with distinct poses', () => {
    expect(PRESETS.map((p) => p.key)).toEqual(['1', '2', '3', '4', '5']);
    expect(new Set(PRESETS.map((p) => p.pos.join())).size).toBe(5);
  });
});

describe('heat scale', () => {
  it('maps temperatures to blue .. red and tolerates missing values', () => {
    expect(heatRgb(T_MIN)[2]).toBeGreaterThan(heatRgb(T_MIN)[0]);
    expect(heatRgb(T_MAX)[0]).toBeGreaterThan(200);
    expect(heatRgb(Number.NaN)).toHaveLength(3);
  });
});

describe('procedural geometry kit', () => {
  it('merges parts per material key and applies the local transform (yaw turns local +z towards +x)', () => {
    const b = new Batch();
    b.box('a', -0.5, 0.5, 0, 1, -0.5, 0.5);
    b.at(10, 20, Math.PI / 2, () => b.boxC('b', 0, 0.5, 1, 0.2, 0.2, 0.2));
    expect(b.keys().sort()).toEqual(['a', 'b']);
    const gb = b.geometry('b')!;
    gb.computeBoundingBox();
    const c = gb.boundingBox!.getCenter(new THREE.Vector3());
    expect(c.x).toBeCloseTo(11, 5);
    expect(c.z).toBeCloseTo(20, 5);
    expect(b.geometry('a')!.getIndex()!.count).toBe(36);
    expect(b.geometry('a')).toBeNull(); // merged once
  });

  it('seeded generator is deterministic and stays in [0, 1)', () => {
    const a = rng(7);
    const b = rng(7);
    for (let i = 0; i < 20; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('wall planes face the left of their direction (inward for a counter-clockwise outline)', () => {
    const g = wallPlane(0, 0, 4, 0, 0, 3); // north wall, hall at +z
    const n = g.getAttribute('normal');
    expect(n.getZ(0)).toBeCloseTo(1, 5);
    const w = wallPlane(4, 0, 4, 5, 0, 3); // east wall, hall at -x
    expect(w.getAttribute('normal').getX(0)).toBeCloseTo(-1, 5);
  });

  it('conductor runs carry distance along the path and light-line slots poke out of the duct', () => {
    const r = new RunBuilder(0.05);
    const d = r.path([[0, 0, 0], [3, 0, 0], [3, 0, 4]], 0, 0.05, { w: 0.1, h: 0.08 });
    expect(d).toBeCloseTo(7, 5);
    const g = r.build();
    const dist = g.getAttribute('aDist');
    let max = 0;
    for (let i = 0; i < dist.count; i++) max = Math.max(max, dist.getX(i));
    expect(max).toBeGreaterThan(6.9);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeCloseTo(0.046, 3); // (h + 0.012) / 2: proud of the duct face
  });
});
