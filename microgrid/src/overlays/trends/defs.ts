import type { RefLine, Signal } from './Chart.svelte';
import type { Target } from '../../selection.svelte';

export interface ChartDef {
  key: string;
  title: string;
  signals: Signal[];
  axes?: string[];
  lines?: RefLine[];
  shade?: 'tariff' | 'demand';
  liveOnly?: string;
}

const PV = '#facc15';
const LOAD = '#60a5fa';
const FC = '#a3a3a3';
const BAT = '#38bdf8';
const GRID = '#fbbf24';

/** The default story: forecast vs actual, import against the demand limit, SOC against the tariff, cost against the baseline. */
export const DEFAULT_CHARTS: ChartDef[] = [
  {
    key: 'fc-pv',
    title: 'Forecast vs actual PV (kW)',
    axes: ['kW'],
    signals: [
      { tag: 'Forecast/PVkW', label: 'Forecast', color: FC, dashed: true },
      { tag: 'KPI/PVTotalkW', label: 'Actual', color: PV },
    ],
  },
  {
    key: 'fc-load',
    title: 'Forecast vs actual load (kW)',
    axes: ['kW'],
    signals: [
      { tag: 'Forecast/LoadkW', label: 'Forecast', color: FC, dashed: true },
      { tag: 'Loads/TotalkW', label: 'Actual', color: LOAD },
    ],
  },
  {
    key: 'import',
    title: 'Grid import vs baseline (kW)',
    axes: ['kW'],
    shade: 'demand',
    signals: [{ tag: 'Grid/ImportkW', label: 'Import', color: GRID }],
    lines: [
      { tag: 'Grid/DemandLimitkW', label: 'demand limit', color: '#f87171' },
      { tag: 'Grid/BaselinePeakkW', label: 'baseline peak', color: '#94a3b8' },
    ],
  },
  {
    key: 'soc',
    title: 'BESS state of charge (%) with tariff bands',
    axes: ['%'],
    shade: 'tariff',
    signals: [
      { tag: 'BESS/B1/SOCPct', label: 'B1', color: BAT },
      { tag: 'BESS/B2/SOCPct', label: 'B2', color: '#a78bfa' },
    ],
  },
  {
    key: 'cost',
    title: 'Cost today vs baseline (USD, cumulative)',
    axes: ['USD'],
    signals: [
      { tag: 'Grid/BaselineCostUSD', label: 'Baseline (no PV, no BESS)', color: FC, dashed: true },
      { tag: 'Grid/TodayCostUSD', label: 'Actual', color: '#34d399' },
    ],
  },
];

/** Click-to-trend: what a diagram selection charts. null = nothing dedicated (the default charts stay). */
export function chartsFor(t: Target | null): { name: string; charts: ChartDef[] } | null {
  if (!t) return null;
  const id = t.id;
  switch (t.kind) {
    case 'pv': {
      const p = `PV/${id}`;
      const strings = [1, 2, 3, 4, 5, 6].map((n, i) => ({ tag: `${p}/String/S${n}/DCkW`, label: `S${n}`, color: ['#facc15', '#fb923c', '#f87171', '#a3e635', '#34d399', '#38bdf8'][i] }));
      return {
        name: `PV array ${id}`,
        charts: [
          { key: `${p}-ac`, title: `Array ${id} AC / DC (kW)`, axes: ['kW'], signals: [{ tag: `${p}/ACkW`, label: 'AC', color: PV }, { tag: `${p}/DCkW`, label: 'DC', color: FC, dashed: true }] },
          { key: `${p}-inv`, title: `Array ${id} inverters AC (kW)`, axes: ['kW'], signals: [{ tag: `${p}/Inverter/A/ACkW`, label: `${id}A`, color: PV }, { tag: `${p}/Inverter/B/ACkW`, label: `${id}B`, color: '#fb923c' }] },
          { key: `${p}-str`, title: `Array ${id} strings DC (kW)`, axes: ['kW'], signals: strings },
        ],
      };
    }
    case 'bess': {
      const p = `BESS/${id}`;
      return {
        name: `BESS ${id}`,
        charts: [
          { key: `${p}-soc`, title: `${id} state of charge (%)`, axes: ['%'], shade: 'tariff', signals: [{ tag: `${p}/SOCPct`, label: 'SOC', color: BAT }] },
          { key: `${p}-kw`, title: `${id} power (kW, + discharge)`, axes: ['kW'], signals: [{ tag: `${p}/kW`, label: 'kW', color: BAT }] },
          { key: `${p}-t`, title: `${id} cell temperature (°C)`, axes: ['°C'], signals: [{ tag: `${p}/CellTempC`, label: 'Cell', color: '#f87171' }] },
        ],
      };
    }
    case 'charger': {
      const p = `EV/${id}`;
      return {
        name: `Charger ${id}`,
        charts: [{ key: `${p}-kw`, title: `${id} power (kW) and car SOC (%)`, axes: ['kW', '%'], liveOnly: 'Car SOC is not historized: live values only.', signals: [{ tag: `${p}/kW`, label: 'kW', color: '#34d399' }, { tag: `${p}/CarSOCPct`, label: 'Car SOC', color: BAT, axis: 1 }] }],
      };
    }
    case 'evbank':
      return { name: 'EV bank', charts: [{ key: 'ev', title: 'EV charging (kW) and curtailed (kW)', axes: ['kW'], shade: 'demand', signals: [{ tag: 'EV/TotalkW', label: 'Charging', color: '#34d399' }, { tag: 'EV/CurtailedkW', label: 'Curtailed', color: '#f87171', dashed: true }] }] };
    case 'bldg': {
      const p = `Loads/Bldg${id}`;
      return { name: `Building ${id}`, charts: [{ key: `${p}-kw`, title: `Building ${id} power and HVAC (kW)`, axes: ['kW'], signals: [{ tag: `${p}/kW`, label: 'Total', color: LOAD }, { tag: `${p}/HVACkW`, label: 'HVAC', color: '#fb923c' }] }] };
    }
    case 'genset':
      return { name: 'Genset', charts: [{ key: 'gen', title: 'Genset power (kW) and fuel (%)', axes: ['kW', '%'], signals: [{ tag: 'Genset/kW', label: 'kW', color: '#94a3b8' }, { tag: 'Genset/FuelPct', label: 'Fuel', color: GRID, axis: 1 }] }] };
    case 'grid':
      return { name: 'Utility', charts: [{ key: 'ie', title: 'Utility import / export (kW)', axes: ['kW'], shade: 'demand', signals: [{ tag: 'Grid/ImportkW', label: 'Import', color: GRID }, { tag: 'Grid/ExportkW', label: 'Export', color: '#34d399' }] }] };
    default:
      return null;
  }
}
