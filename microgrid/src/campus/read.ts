import { tagBool, tagNum, tagStr } from '../live/store.svelte';
import { PV_ARRAYS, BESS_IDS, BLDG_IDS, CHARGERS } from './model';

/** One consistent read of every tag the scene draws, taken once per frame (plain object, no reactivity needed in the render loop). */
export interface Snap {
  hour: number;
  elev: number;
  cloud: number;
  irr: number;
  clear: number;
  island: boolean;
  avail: boolean;
  importKw: number;
  exportKw: number;
  pv: { ac: number; irr: number; rated: number; curtailed: boolean; inv: [string, string]; dc: number[]; health: number[] }[];
  bess: { kw: number; soc: number; state: string; rated: number }[];
  gen: { state: string; kw: number; countdown: number };
  ev: { state: string; kw: number; soc: number; target: number }[];
  evTotal: number;
  bldg: { kw: number; shed: boolean; crit: boolean }[];
  mode: string;
}

const S = [1, 2, 3, 4, 5, 6];

export function sample(): Snap {
  return {
    hour: tagNum('Time/HourOfDay'),
    elev: tagNum('Time/SunElevationDeg'),
    cloud: tagNum('Time/Cloudiness'),
    irr: tagNum('Time/IrradianceWm2'),
    clear: tagNum('Time/ClearSkyIrradianceWm2'),
    island: tagBool('Grid/Islanded'),
    avail: tagBool('Grid/Available'),
    importKw: tagNum('Grid/ImportkW'),
    exportKw: tagNum('Grid/ExportkW'),
    pv: PV_ARRAYS.map((id) => ({
      ac: tagNum(`PV/${id}/ACkW`),
      irr: tagNum(`PV/${id}/IrradianceWm2`),
      rated: tagNum(`PV/${id}/RatedACkW`) || 150,
      curtailed: tagBool(`PV/${id}/Curtailed`),
      inv: [tagStr(`PV/${id}/Inverter/A/State`), tagStr(`PV/${id}/Inverter/B/State`)],
      dc: S.map((s) => tagNum(`PV/${id}/String/S${s}/DCkW`)),
      health: S.map((s) => tagNum(`PV/${id}/String/S${s}/Health`)),
    })),
    bess: BESS_IDS.map((id) => ({ kw: tagNum(`BESS/${id}/kW`), soc: tagNum(`BESS/${id}/SOCPct`), state: tagStr(`BESS/${id}/State`), rated: tagNum(`BESS/${id}/RatedkW`) || 250 })),
    gen: { state: tagStr('Genset/State'), kw: tagNum('Genset/kW'), countdown: tagNum('Genset/StartCountdownS') },
    ev: CHARGERS.map((id) => ({ state: tagStr(`EV/${id}/State`), kw: tagNum(`EV/${id}/kW`), soc: tagNum(`EV/${id}/CarSOCPct`), target: tagNum(`EV/${id}/TargetSOCPct`) })),
    evTotal: tagNum('EV/TotalkW'),
    bldg: BLDG_IDS.map((id) => ({ kw: tagNum(`Loads/Bldg${id}/kW`), shed: tagBool(`Loads/Bldg${id}/Shed`), crit: tagBool(`Loads/Bldg${id}/Critical`) })),
    mode: tagStr('KPI/Mode'),
  };
}

export const finite = (v: number, d = 0): number => (Number.isFinite(v) ? v : d);
