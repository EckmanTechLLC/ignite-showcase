import { stats, tagRef } from '../live/store';
import { atsPosition, genKW, genState, upsA, upsB, pdus, atsLive, utilityAvailable, utilityKW, utilityPathLive, genPathLive } from '../power/state';
import { RACKS } from './geometry';

// One plain-object snapshot of every tag the 3D scene draws. The render loop reads these arrays each frame;
// they are refreshed only when a new SSE batch has been applied, so there is no per-tag Vue reactivity in the loop.

const num = (name: string): number => {
  const v = tagRef(name).value;
  return typeof v === 'number' ? v : Number.NaN;
};
const str = (name: string): string => {
  const v = tagRef(name).value;
  return v == null ? '' : String(v);
};

export const S = {
  inlet: new Float32Array(60).fill(Number.NaN),
  outlet: new Float32Array(60).fill(Number.NaN),
  kw: new Float32Array(60),
  online: new Uint8Array(60).fill(1),
  /** Fan % per CRAH 1..4 (0 when not running). */
  fan: new Float32Array(4),
  crahState: ['', '', '', ''] as string[],
  chillerState: ['', ''] as string[],
  chillerKW: new Float32Array(2),
  chillerSupplyC: Number.NaN,
  chillerReturnC: Number.NaN,
  flowLps: Number.NaN,
  /** Mean outlet temperature of the racks beside each hot aisle (4 aisles). */
  hotAisle: new Float32Array(4).fill(Number.NaN),
  version: 0,
};

let seen = -1;
/** Re-read the tags when a new batch has arrived since the last call. Cheap enough to call from every consumer. */
export function refresh(): void {
  if (seen === stats.batches) return;
  seen = stats.batches;
  S.version++;
  const rowSum = new Float32Array(6);
  const rowN = new Uint8Array(6);
  for (const r of RACKS) {
    const i = r.n - 1;
    const p = `Racks/${r.id}/`;
    S.inlet[i] = num(p + 'InletTempC');
    S.outlet[i] = num(p + 'OutletTempC');
    S.kw[i] = num(p + 'PowerKW');
    S.online[i] = tagRef(p + 'Online').value === false ? 0 : 1;
    if (Number.isFinite(S.outlet[i])) {
      rowSum[r.row] += S.outlet[i];
      rowN[r.row]++;
    }
  }
  const row = (r: number) => (rowN[r] ? rowSum[r] / rowN[r] : Number.NaN);
  const avg2 = (a: number, b: number) => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : (a + b) / 2);
  S.hotAisle[0] = row(0);
  S.hotAisle[1] = avg2(row(1), row(2));
  S.hotAisle[2] = avg2(row(3), row(4));
  S.hotAisle[3] = row(5);
  for (let n = 1; n <= 4; n++) {
    const st = str(`Cooling/CRAH/${n}/State`);
    S.crahState[n - 1] = st;
    const f = num(`Cooling/CRAH/${n}/FanPct`);
    S.fan[n - 1] = (st === 'RUN' || st === 'RUNNING') && Number.isFinite(f) ? f : 0;
  }
  for (let n = 1; n <= 2; n++) {
    S.chillerState[n - 1] = str(`Cooling/Chiller/${n}/State`);
    const k = num(`Cooling/Chiller/${n}/KW`);
    S.chillerKW[n - 1] = Number.isFinite(k) ? k : 0;
  }
  const sup = [1, 2].map((n) => num(`Cooling/Chiller/${n}/SupplyC`)).filter(Number.isFinite);
  const ret = [1, 2].map((n) => num(`Cooling/Chiller/${n}/ReturnC`)).filter(Number.isFinite);
  S.chillerSupplyC = sup.length ? sup.reduce((a, b) => a + b, 0) / sup.length : Number.NaN;
  S.chillerReturnC = ret.length ? ret.reduce((a, b) => a + b, 0) / ret.length : Number.NaN;
  S.flowLps = num('Cooling/Loop/FlowLps');
}

/** Power-path state for the conductors, from the shared derived state (power/state.ts). */
export function powerState() {
  return {
    utility: utilityPathLive.value,
    generator: genPathLive.value,
    atsPos: atsPosition.value,
    atsLive: atsLive.value,
    utilityAvail: utilityAvailable.value === true,
    utilityKW: utilityKW.value,
    genState: genState.value,
    genKW: genKW.value,
    upsA,
    upsB,
    pdus,
  };
}
