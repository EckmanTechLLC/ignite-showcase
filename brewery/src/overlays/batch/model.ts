import { tagNum, tagStr } from '../../live/store';
import { SLOTS } from '../../model';
import { parseTimeline } from '../../strip/batches';

/** One record of the 24-slot ring. */
export interface Batch {
  slot: string;
  id: string;
  recipe: string;
  state: string;
  phase: string;
  start: number;
  fv: string;
  bbt: string;
  hl: number;
  og: number;
  fg: number;
  abv: number;
  ph: number;
  ibu: number;
  dO: number;
  qa: string;
  cans: number;
  pallets: number;
  yieldPct: number;
  timeline: [string, number][];
}

/** Read one ring slot from the live tags (call inside a memo or component to track it). */
export function readBatch(slot: string): Batch {
  const p = `Batches/${slot}/`;
  return {
    slot,
    id: tagStr(`${p}Id`),
    recipe: tagStr(`${p}Recipe`),
    state: tagStr(`${p}State`),
    phase: tagStr(`${p}Phase`),
    start: tagNum(`${p}StartHour`),
    fv: tagStr(`${p}FV`),
    bbt: tagStr(`${p}BBT`),
    hl: tagNum(`${p}Hl`),
    og: tagNum(`${p}OG`),
    fg: tagNum(`${p}FG`),
    abv: tagNum(`${p}ABV`),
    ph: tagNum(`${p}pH`),
    ibu: tagNum(`${p}IBU`),
    dO: tagNum(`${p}DO`),
    qa: tagStr(`${p}QAStatus`),
    cans: tagNum(`${p}Cans`),
    pallets: tagNum(`${p}Pallets`),
    yieldPct: tagNum(`${p}Yield`),
    timeline: parseTimeline(tagStr(`${p}Timeline`)),
  };
}

export const readRing = (): Batch[] => SLOTS.map(readBatch).filter((b) => b.id);

export interface Recipe {
  name: string;
  mashTemp: number;
  mashMin: number;
  boilMin: number;
  og: number;
  fg: number;
  fermTemp: number;
  fermDays: number;
  condDays: number;
  yeast: string;
  ibu: number;
  format: string;
}
export function readRecipe(name: string): Recipe {
  const p = `Recipes/${name}/`;
  return {
    name,
    mashTemp: tagNum(`${p}MashTempC`),
    mashMin: tagNum(`${p}MashMin`),
    boilMin: tagNum(`${p}BoilMin`),
    og: tagNum(`${p}TargetOGP`),
    fg: tagNum(`${p}TargetFGP`),
    fermTemp: tagNum(`${p}FermentTempC`),
    fermDays: tagNum(`${p}FermentDays`),
    condDays: tagNum(`${p}ConditionDays`),
    yeast: tagStr(`${p}Yeast`),
    ibu: tagNum(`${p}IBU`),
    format: tagStr(`${p}Format`),
  };
}

// --- ISA-88 phase timeline: actual vs recipe -----------------------------------------------

export const PHASE_LABEL: Record<string, string> = {
  MILLING: 'Milling', MASH: 'Mash', LAUTER: 'Lauter', BOIL: 'Boil', WHIRLPOOL: 'Whirlpool', KNOCKOUT: 'Knock-out',
  FERMENTATION: 'Fermentation', DIACETYL_REST: 'Diacetyl rest', CRASH: 'Crash', CONDITIONING: 'Conditioning',
  TRANSFER: 'Transfer', CARBONATING: 'Carbonating', READY: 'Ready (wait)', PACKAGING: 'Packaging',
};
export const PHASE_ORDER = Object.keys(PHASE_LABEL);

/**
 * Recipe duration of a phase in simulated hours, from the sim model (sim/brewery/README.md): the fixed unit-phase
 * minutes plus the recipe's rest and boil times; biology (fermentation, conditioning, carbonation) runs `accel` times
 * faster than the clock. Undefined for the waiting and packaging phases, which have no recipe time.
 */
export function recipeHours(phase: string, r: Recipe, accel: number): number | undefined {
  const a = Number.isFinite(accel) && accel > 0 ? accel : 8;
  switch (phase) {
    case 'MILLING': return 15 / 60;
    case 'MASH': return (10 + r.mashMin + 10) / 60;
    case 'LAUTER': return (15 + 90) / 60;
    case 'BOIL': return (25 + r.boilMin) / 60;
    case 'WHIRLPOOL': return (10 + 30) / 60;
    case 'KNOCKOUT': return (5 + 40) / 60;
    case 'FERMENTATION': return (r.fermDays * 24) / a;
    case 'DIACETYL_REST': return 24 / a;
    case 'CRASH': return 24 / a;
    case 'CONDITIONING': return (r.condDays * 24) / a;
    case 'TRANSFER': return 0.5;
    case 'CARBONATING': return (0.8 * 24) / a;
    default: return undefined;
  }
}

export interface PhaseRow {
  phase: string;
  /** done = has an end, cur = the open one, todo = not reached. */
  status: 'done' | 'cur' | 'todo';
  /** Actual simulated hours (NaN for todo). */
  actual: number;
  recipe: number | undefined;
  from: number;
}

/** One row per phase: actual hours from the batch timeline (the open phase counts up to `nowH`), recipe hours beside it. */
export function phaseRows(timeline: [string, number][], r: Recipe, accel: number, nowH: number): PhaseRow[] {
  const at = new Map<string, number>();
  const end = new Map<string, number>();
  timeline.forEach(([p, h], i) => {
    at.set(p, h);
    if (i + 1 < timeline.length) end.set(p, timeline[i + 1][1]);
  });
  return PHASE_ORDER.map((phase) => {
    const from = at.get(phase);
    const rec = recipeHours(phase, r, accel);
    if (from === undefined) return { phase, status: 'todo', actual: Number.NaN, recipe: rec, from: Number.NaN };
    const to = end.get(phase);
    return to === undefined
      ? { phase, status: 'cur', actual: Math.max(0, nowH - from), recipe: rec, from }
      : { phase, status: 'done', actual: to - from, recipe: rec, from };
  });
}

// --- QA sample points ------------------------------------------------------------------------

export type Verdict = 'PASS' | 'HOLD' | 'FAIL' | 'PENDING';
export interface QaPoint {
  point: string;
  /** Measured values, formatted by the panel. */
  values: { label: string; text: string }[];
  verdict: Verdict;
  /** Where the verdict comes from: the batch record (authoritative) or a display check against the recipe. */
  basis: 'record' | 'recipe';
}

const f = (v: number, d: number) => (Number.isFinite(v) && v !== 0 ? v.toFixed(d) : '—');

/**
 * Three lab sample points. The fermentation sample decides the batch's `QAStatus` in the sim (PASS | HOLD | FAIL), so its
 * verdict is the record's. The wort and pre-package samples have no verdict in the sim; the panel checks them against the
 * recipe (OG within 1.0 °P, IBU within 20 %; dissolved oxygen at most 100 ppb) and says so.
 */
export function qaPoints(b: Batch, r: Recipe): QaPoint[] {
  const hasWort = b.og > 0;
  const wortOk = hasWort && Math.abs(b.og - r.og) <= 1.0 && (!(b.ibu > 0) || Math.abs(b.ibu - r.ibu) <= 0.2 * r.ibu);
  const hasFerm = b.fg > 0;
  const recordVerdict: Verdict = b.qa === 'HOLD' || b.qa === 'FAIL' ? b.qa : b.qa === 'PASS' ? 'PASS' : 'PENDING';
  const hasDo = b.dO > 0;
  return [
    {
      point: 'End of boil (wort)',
      values: [{ label: 'OG', text: `${f(b.og, 1)} °P (target ${f(r.og, 1)})` }, { label: 'IBU', text: `${f(b.ibu, 0)} (target ${f(r.ibu, 0)})` }],
      verdict: !hasWort ? 'PENDING' : wortOk ? 'PASS' : 'HOLD',
      basis: 'recipe',
    },
    {
      point: 'End of fermentation',
      values: [{ label: 'FG', text: `${f(b.fg, 2)} °P (target ${f(r.fg, 1)})` }, { label: 'ABV', text: `${f(b.abv, 2)} %` }, { label: 'pH', text: f(b.ph, 2) }],
      verdict: !hasFerm ? (b.qa === 'FAIL' || b.qa === 'HOLD' ? b.qa : 'PENDING') : recordVerdict,
      basis: 'record',
    },
    {
      point: 'Before packaging',
      values: [{ label: 'DO', text: `${f(b.dO, 1)} ppb` }],
      verdict: !hasDo ? 'PENDING' : b.dO <= 100 ? 'PASS' : 'HOLD',
      basis: 'recipe',
    },
  ];
}

// --- genealogy and contamination risk -------------------------------------------------------

export interface GenNode {
  key: string;
  title: string;
  /** Second line: the unit, tank or run. */
  detail: string;
  status: 'done' | 'cur' | 'todo';
}

/** Brewhouse units -> fermenter -> bright tank -> packaging run -> pallets, with where the batch is now. */
export function genealogy(b: Batch): GenNode[] {
  const reached = new Set(b.timeline.map(([p]) => p));
  const open = b.timeline.length ? b.timeline[b.timeline.length - 1][0] : '';
  const node = (key: string, title: string, detail: string, phases: string[]): GenNode => {
    const any = phases.some((p) => reached.has(p));
    const cur = phases.includes(open) && b.state !== 'COMPLETE';
    return { key, title, detail, status: cur ? 'cur' : any ? 'done' : 'todo' };
  };
  const done = b.state === 'COMPLETE';
  return [
    node('mill', 'Mill', 'grist', ['MILLING']),
    node('mash', 'Mash tun', 'mash', ['MASH']),
    node('lauter', 'Lauter tun', 'run-off', ['LAUTER']),
    node('kettle', 'Kettle', 'boil', ['BOIL']),
    node('whirl', 'Whirlpool', 'rest', ['WHIRLPOOL']),
    node('chill', 'Chiller', 'knock-out', ['KNOCKOUT']),
    node('fv', b.fv || 'Fermenter', 'ferment, condition', ['FERMENTATION', 'DIACETYL_REST', 'CRASH', 'CONDITIONING', 'TRANSFER']),
    node('bbt', b.bbt || 'Bright tank', 'carbonate, ready', ['CARBONATING', 'READY']),
    node('pack', 'Packaging run', b.cans > 0 ? `${Math.round(b.cans).toLocaleString('en-US')} packages` : 'line', ['PACKAGING']),
    { key: 'pallets', title: 'Pallets', detail: b.pallets > 0 ? `${b.pallets} built` : done ? 'none' : 'to build', status: done ? 'done' : b.pallets > 0 ? 'cur' : 'todo' },
  ];
}

export interface RiskRow {
  id: string;
  reason: string;
}

/**
 * Batches that can share a contamination with `source` (the batch on QA HOLD while the contamination scenario runs):
 * the same fermenter or bright tank, the same yeast strain pitched at or after the source (repitched yeast), or the same
 * packaging run. Terminal and planned batches are left out.
 */
export function atRisk(source: Batch, ring: Batch[], yeastOf: (recipe: string) => string): RiskRow[] {
  const out: RiskRow[] = [];
  const strain = yeastOf(source.recipe);
  for (const b of ring) {
    if (b.id === source.id || ['PLANNED', 'COMPLETE', 'DUMPED'].includes(b.state)) continue;
    const reasons: string[] = [];
    if (source.fv && b.fv === source.fv) reasons.push(`same fermenter ${b.fv}`);
    if (source.bbt && b.bbt === source.bbt) reasons.push(`same bright tank ${b.bbt}`);
    if (strain && yeastOf(b.recipe) === strain && b.start >= source.start) reasons.push(`repitched ${strain} yeast`);
    if (reasons.length) out.push({ id: b.id, reason: reasons.join(', ') });
  }
  return out;
}
