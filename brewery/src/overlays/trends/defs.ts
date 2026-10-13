import type { RefLine, Signal } from './history';
import type { Selection } from '../../selection';
import { FVS, MACHINE_LABEL, recipeColorRaw } from '../../model';
import { rawStr } from '../../live/store';

export interface ChartDef {
  key: string;
  title: string;
  signals: Signal[];
  axes?: string[];
  lines?: RefLine[];
  liveOnly?: string;
  yRange?: [number, number];
  tall?: boolean;
}

const sig = (tag: string, label: string, color: string, extra: Partial<Signal> = {}): Signal => ({ id: tag, label, color, tags: [tag], ...extra });

const COPPER = '#d4874a';
const BLUE = '#60a5fa';
const RED = '#f87171';
const GREEN = '#34d399';
const GREY = '#94a3b8';
const AMBER = '#fbbf24';
const VIOLET = '#a78bfa';

/** Phases whose gravity is still moving or just settled: the "fermenting" set the fermentation chart overlays. */
export const FERMENTING_PHASES = ['FERMENTING', 'DIACETYL_REST', 'CRASH'];
export const fermentingFvs = (read: (name: string) => string = rawStr): string[] => FVS.filter((f) => FERMENTING_PHASES.includes(read(`Cellar/${f}/Phase`)));

/**
 * Gravity and temperature of every fermenting FV, overlaid. Colour = the batch's recipe; gravity solid on the left axis,
 * temperature dashed on the right. The recipes' target FG are the dashed horizontal lines.
 */
export function fermentationChart(fvs: string[]): ChartDef {
  const recipes = [...new Set(fvs.map((f) => rawStr(`Cellar/${f}/Recipe`)).filter(Boolean))];
  const col = (f: string) => recipeColorRaw(rawStr(`Cellar/${f}/Recipe`));
  const name = (f: string) => `${f} ${rawStr(`Cellar/${f}/BatchId`)} ${rawStr(`Cellar/${f}/Recipe`)}`.trim();
  return {
    key: 'ferment',
    title: 'Fermentation: gravity (°P, solid) and temperature (°C, dashed)',
    axes: ['°P', '°C'],
    tall: true,
    signals: [
      ...fvs.map((f) => sig(`Cellar/${f}/GravityP`, `${name(f)} °P`, col(f), { width: 2 })),
      ...fvs.map((f) => sig(`Cellar/${f}/TempC`, `${f} °C`, col(f), { axis: 1, dashed: true, width: 1 })),
    ],
    lines: recipes.map((r) => ({ tag: `Recipes/${r}/TargetFGP`, label: `FG ${r}`, color: recipeColorRaw(r) })),
  };
}

/** Cellar temperatures against their setpoints (the thin dashed lines are the current setpoints; setpoints are not historized). */
export function cellarTempChart(fvs: string[]): ChartDef {
  const col = (f: string) => recipeColorRaw(rawStr(`Cellar/${f}/Recipe`));
  return {
    key: 'cellar',
    title: 'Cellar temperatures vs setpoints (°C)',
    axes: ['°C'],
    signals: fvs.map((f) => sig(`Cellar/${f}/TempC`, `${f} ${rawStr(`Cellar/${f}/Recipe`)}`, col(f), { width: 1.6 })),
    lines: fvs.map((f) => ({ tag: `Cellar/${f}/SetpointC`, label: `${f} sp`, color: col(f), quiet: true })),
    liveOnly: fvs.length ? 'Dashed lines: current setpoints.' : undefined,
  };
}

/**
 * Where the shift goes, stacked to 100 %: OEE plus the availability, performance and quality losses it is made of
 * (OEE = A x P x Q; the losses are 1-A, A(1-P) and AP(1-Q)).
 */
export const OEE_CHART: ChartDef = {
  key: 'oee',
  title: 'Line OEE over the shift (stacked, % of planned time)',
  axes: ['%'],
  yRange: [0, 100],
  signals: [
    { id: 'oee', label: 'OEE', color: GREEN, tags: ['Packaging/OEE/Availability', 'Packaging/OEE/Performance', 'Packaging/OEE/Quality'], fn: ([a, p, q]) => a * p * q * 100, area: true, stack: 'oee', width: 1 },
    { id: 'qloss', label: 'Quality loss', color: VIOLET, tags: ['Packaging/OEE/Availability', 'Packaging/OEE/Performance', 'Packaging/OEE/Quality'], fn: ([a, p, q]) => a * p * (1 - q) * 100, area: true, stack: 'oee', width: 1 },
    { id: 'ploss', label: 'Performance loss', color: AMBER, tags: ['Packaging/OEE/Availability', 'Packaging/OEE/Performance'], fn: ([a, p]) => a * (1 - p) * 100, area: true, stack: 'oee', width: 1 },
    { id: 'aloss', label: 'Availability loss', color: RED, tags: ['Packaging/OEE/Availability'], fn: ([a]) => (1 - a) * 100, area: true, stack: 'oee', width: 1 },
  ],
};

export const UTILITY_CHARTS: ChartDef[] = [
  {
    key: 'glycol',
    title: 'Glycol: load (%) and supply temperature (°C)',
    axes: ['%', '°C'],
    signals: [sig('Utilities/Glycol/LoadPct', 'Load %', BLUE), sig('Utilities/Glycol/SupplyC', 'Supply °C', RED, { axis: 1 })],
  },
  {
    key: 'boiler-co2',
    title: 'Boiler pressure (bar) and CO₂ tank level (%)',
    axes: ['bar', '%'],
    signals: [sig('Utilities/Boiler/PressureBar', 'Boiler bar', COPPER), sig('Utilities/CO2/TankPct', 'CO₂ tank %', GREEN, { axis: 1 })],
  },
];

/** Click-to-trend: what a plant selection charts. null = nothing dedicated (the default charts stay). */
export function chartsFor(s: Selection | null): { name: string; charts: ChartDef[] } | null {
  if (!s || s.kind === 'batch') return null;
  const id = s.id;
  if (s.kind === 'vessel') {
    if (id.startsWith('FV')) {
      const p = `Cellar/${id}`;
      const c = recipeColorRaw(rawStr(`${p}/Recipe`));
      return {
        name: `Fermenter ${id}`,
        charts: [
          { key: `${p}-t`, title: `${id} temperature (°C) with setpoint`, axes: ['°C'], signals: [sig(`${p}/TempC`, 'Temp', c)], lines: [{ tag: `${p}/SetpointC`, label: 'setpoint', color: GREY }] },
          { key: `${p}-g`, title: `${id} gravity (°P) and ABV (%)`, axes: ['°P', '%'], signals: [sig(`${p}/GravityP`, 'Gravity', COPPER, { width: 2 }), sig(`${p}/ABVEst`, 'ABV', GREEN, { axis: 1 })] },
          { key: `${p}-l`, title: `${id} level (%) and pH`, axes: ['%', 'pH'], signals: [sig(`${p}/LevelPct`, 'Level', BLUE), sig(`${p}/pH`, 'pH', VIOLET, { axis: 1 })] },
          { key: `${p}-p`, title: `${id} head pressure (psi) and glycol valve (%)`, axes: ['psi', '%'], signals: [sig(`${p}/PressurePSI`, 'Pressure', RED), sig(`${p}/GlycolValvePct`, 'Valve %', GREY, { axis: 1 })] },
        ],
      };
    }
    if (id.startsWith('BBT')) {
      const p = `Cellar/${id}`;
      return {
        name: `Bright tank ${id}`,
        charts: [
          { key: `${p}-t`, title: `${id} level (%) and temperature (°C)`, axes: ['%', '°C'], signals: [sig(`${p}/LevelPct`, 'Level', BLUE), sig(`${p}/TempC`, 'Temp', RED, { axis: 1 })] },
          { key: `${p}-c`, title: `${id} carbonation (vol CO₂)`, axes: ['vol'], signals: [sig(`${p}/CO2Vol`, 'CO₂ vol', GREEN)] },
        ],
      };
    }
    const p = `Brewhouse/${id}`;
    if (id === 'HLT' || id === 'CLT') {
      return { name: id, charts: [{ key: `${p}-t`, title: `${id} level (%) and temperature (°C)`, axes: ['%', '°C'], signals: [sig(`${p}/LevelPct`, 'Level', BLUE), sig(`${p}/TempC`, 'Temp', RED, { axis: 1 })] }] };
    }
    const extra: Record<string, Signal[]> = {
      MashTun: [sig(`${p}/pH`, 'pH', VIOLET, { axis: 1 }), sig(`${p}/GravityP`, '°P', GREEN, { axis: 1 })],
      LauterTun: [sig(`${p}/RunoffLpm`, 'Run-off L/min', GREEN, { axis: 1 }), sig(`${p}/TurbidityNTU`, 'Turbidity NTU', AMBER, { axis: 1 })],
      Kettle: [sig(`${p}/BoilOverRisk`, 'Boil-over risk %', RED, { axis: 1 }), sig(`${p}/SteamKgph`, 'Steam kg/h', GREY, { axis: 1 })],
      Chiller: [sig(`${p}/WortOutC`, 'Wort out °C', GREEN)],
    };
    return {
      name: id,
      charts: [
        { key: `${p}-t`, title: `${id} temperature (°C) and level (%)`, axes: ['°C', '%'], signals: [sig(`${p}/TempC`, 'Temp', RED), sig(`${p}/LevelPct`, 'Level', BLUE, { axis: 1 })] },
        ...(extra[id] ? [{ key: `${p}-x`, title: `${id} process values`, axes: id === 'Chiller' ? ['°C'] : ['', ''], signals: extra[id] }] : []),
      ],
    };
  }
  if (s.kind === 'util') {
    return { name: id === 'CIP' ? 'CIP skid' : id, charts: UTILITY_FOR[id] ?? [] };
  }
  // line / machine
  const L = 'Packaging/Line';
  const line: ChartDef[] = [
    { key: 'line-speed', title: 'Line speed (cans/min)', axes: ['cpm'], signals: [sig(`${L}/SpeedCPM`, 'Speed', COPPER)] },
    { key: 'line-count', title: 'Good and rejected cans (shift)', axes: ['cans', 'cans'], signals: [sig(`${L}/GoodCount`, 'Good', GREEN), sig(`${L}/RejectCount`, 'Rejects', RED, { axis: 1 })] },
  ];
  if (id === 'Line') return { name: 'Packaging line', charts: line };
  const m = `Packaging/${id}`;
  return {
    name: MACHINE_LABEL[id] ?? id,
    charts: [
      { key: `${m}-c`, title: `${MACHINE_LABEL[id] ?? id} counts in / out (cans, shift)`, axes: ['cans'], liveOnly: 'Machine counts are not historized: live values only.', signals: [sig(`${m}/CountIn`, 'In', BLUE), sig(`${m}/CountOut`, 'Out', GREEN, { dashed: true })] },
      ...line,
    ],
  };
}

const UTILITY_EXTRA: ChartDef[] = [
  { key: 'air', title: 'Compressed air (bar)', axes: ['bar'], signals: [sig('Utilities/Air/PressureBar', 'Air bar', BLUE)] },
  { key: 'cip', title: 'CIP: conductivity (mS/cm) and temperature (°C)', axes: ['mS/cm', '°C'], signals: [sig('Utilities/CIP/ConductivitymS', 'Conductivity', AMBER), sig('Utilities/CIP/TempC', 'Temp', RED, { axis: 1 })] },
];
const UTILITY_FOR: Record<string, ChartDef[]> = {
  Glycol: [UTILITY_CHARTS[0]],
  Boiler: [{ key: 'boiler', title: 'Boiler pressure (bar) and steam (kg/h)', axes: ['bar', 'kg/h'], signals: [sig('Utilities/Boiler/PressureBar', 'Pressure', COPPER), sig('Utilities/Boiler/SteamKgph', 'Steam', GREY, { axis: 1 })] }],
  CO2: [{ key: 'co2', title: 'CO₂: tank level (%) and recovery (%)', axes: ['%'], signals: [sig('Utilities/CO2/TankPct', 'Tank', GREEN), sig('Utilities/CO2/RecoveredPct', 'Recovered', BLUE, { dashed: true })] }],
  Air: [UTILITY_EXTRA[0]],
  CIP: [UTILITY_EXTRA[1]],
};
