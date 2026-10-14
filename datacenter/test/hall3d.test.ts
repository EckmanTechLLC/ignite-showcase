import { describe, expect, it } from 'vitest';
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
