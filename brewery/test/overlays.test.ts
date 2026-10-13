import { describe, expect, it, vi } from 'vitest';

// Modules that reach ui.ts / identity.ts read location and window at import time.
vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.location = { search: '' };
  g.window = { __IGNITE_ENV__: {}, setTimeout, addEventListener() {} };
  g.document = { addEventListener() {} };
});

import { cascadeOf, groupOf, groupRank, toRow, type Row } from '../src/overlays/alarms/store';
import { atRisk, genealogy, phaseRows, qaPoints, recipeHours, type Batch, type Recipe } from '../src/overlays/batch/model';
import { bars, waterfall } from '../src/overlays/trends/waterfall';
import { hourLabel, plausible, valueOf, windowMs, type Signal } from '../src/overlays/trends/history';
import { parseAudit, groupByActor } from '../src/overlays/identity/audit';

const row = (o: Partial<Row>): Row => ({ id: 'x', group: 'Other', tag: '', name: '', label: '', priority: 'High', state: '', active: true, acked: false, activeMs: 0, clearMs: Number.NaN, artefact: false, ...o });

describe('alarm areas', () => {
  it('groups by area with one group per fermenter', () => {
    expect(groupOf('Brewhouse/Kettle/BoilOverRisk')).toBe('Brewhouse');
    expect(groupOf('Cellar/FV03/TempC')).toBe('Cellar FV03');
    expect(groupOf('Cellar/OccupancyPct')).toBe('Cellar');
    expect(groupOf('KPI/RejectPct')).toBe('Packaging');
    expect(groupOf('Packaging/Filler/Fault')).toBe('Packaging');
    expect(groupOf('Utilities/Glycol/SupplyC')).toBe('Utilities');
    expect(groupOf('Batches/B07/QAStatus')).toBe('Quality');
    expect(['Quality', 'Utilities', 'Cellar FV02', 'Packaging', 'Cellar FV10', 'Brewhouse', 'Cellar'].sort((a, b) => groupRank(a) - groupRank(b))).toEqual(['Brewhouse', 'Cellar', 'Cellar FV02', 'Cellar FV10', 'Packaging', 'Utilities', 'Quality']);
  });
  it('maps a gateway alarm to a row and marks the zero-length load event', () => {
    const base = { id: 'a1', source: '', displayPath: 'BR/Cellar/FV02/TempC/TempDeviation', name: 'TempDeviation', label: 'FV02 temperature deviates', priority: 'High', state: 'Active, Unacknowledged', isAcked: false, isCleared: false, isShelved: false, activeTime: '2026-10-13T17:00:00Z' };
    const r = toRow(base)!;
    expect(r.tag).toBe('Cellar/FV02/TempC');
    expect(r.group).toBe('Cellar FV02');
    expect(r.active).toBe(true);
    expect(toRow({ ...base, isCleared: true, clearTime: base.activeTime })!.artefact).toBe(true);
    expect(toRow({ ...base, displayPath: 'MG/PV/A1/Health/X' })).toBeNull();
  });
});

describe('glycol cascade', () => {
  const t = (s: number) => Date.parse('2026-10-13T17:09:00Z') + s * 1000;
  it('orders glycol, fermenter and QA alarms of the latest failure and ignores the rest', () => {
    const rows = [
      row({ id: 'qa', group: 'Quality', tag: 'Batches/B07/QAStatus', activeMs: t(60) }),
      row({ id: 'fv', group: 'Cellar FV04', tag: 'Cellar/FV04/TempC', activeMs: t(7) }),
      row({ id: 'gs', group: 'Utilities', tag: 'Utilities/Glycol/SupplyC', activeMs: t(0) }),
      row({ id: 'gl', group: 'Utilities', tag: 'Utilities/Glycol/LoadPct', activeMs: t(1) }),
      row({ id: 'old', group: 'Cellar FV01', tag: 'Cellar/FV01/TempC', activeMs: t(-3600) }),
      row({ id: 'pkg', group: 'Packaging', tag: 'Packaging/Filler/Fault', activeMs: t(3) }),
      row({ id: 'art', group: 'Utilities', tag: 'Utilities/Glycol/SupplyC', activeMs: t(2), artefact: true }),
    ];
    const c = cascadeOf(rows);
    expect(c.map((s) => s.row.id)).toEqual(['gs', 'gl', 'fv', 'qa']);
    expect(c.map((s) => s.level)).toEqual(['Glycol', 'Glycol', 'Fermenters', 'QA risk']);
  });
  it('is empty without a glycol alarm', () => {
    expect(cascadeOf([row({ group: 'Cellar FV01', tag: 'Cellar/FV01/TempC' })])).toEqual([]);
  });
});

const recipe: Recipe = { name: 'IPA', mashTemp: 66, mashMin: 60, boilMin: 60, og: 15, fg: 3.6, fermTemp: 19, fermDays: 5, condDays: 4, yeast: 'US-05 Ale', ibu: 65, format: 'CAN' };
const batch = (o: Partial<Batch>): Batch => ({ slot: 'B02', id: 'BR0002', recipe: 'IPA', state: 'FERMENTING', phase: 'FERMENTATION', start: 11, fv: 'FV02', bbt: '', hl: 6, og: 15, fg: 0, abv: 0, ph: 0, ibu: 64, dO: 0, qa: 'PENDING', cans: 0, pallets: 0, yieldPct: 0, timeline: [], ...o });

describe('batch model', () => {
  it('derives recipe phase hours from the sim model', () => {
    expect(recipeHours('MASH', recipe, 8)).toBeCloseTo(80 / 60);
    expect(recipeHours('BOIL', recipe, 8)).toBeCloseTo(85 / 60);
    expect(recipeHours('FERMENTATION', recipe, 8)).toBeCloseTo(15);
    expect(recipeHours('CONDITIONING', recipe, 8)).toBeCloseTo(12);
    expect(recipeHours('PACKAGING', recipe, 8)).toBeUndefined();
  });
  it('sets actual against recipe per phase', () => {
    const tl: [string, number][] = [['MILLING', 11], ['MASH', 11.25], ['LAUTER', 12.62]];
    const rows = phaseRows(tl, recipe, 8, 13);
    expect(rows[0]).toMatchObject({ phase: 'MILLING', status: 'done' });
    expect(rows[1].actual).toBeCloseTo(1.37);
    expect(rows[2]).toMatchObject({ phase: 'LAUTER', status: 'cur' });
    expect(rows[2].actual).toBeCloseTo(0.38);
    expect(rows[5].status).toBe('todo');
    expect(Number.isNaN(rows[5].actual)).toBe(true);
  });
  it('takes the fermentation verdict from the record and the others from the recipe', () => {
    const early = qaPoints(batch({}), recipe);
    expect(early.map((q) => q.verdict)).toEqual(['PASS', 'PENDING', 'PENDING']);
    const held = qaPoints(batch({ fg: 5.2, abv: 5, ph: 4.1, qa: 'HOLD', dO: 140 }), recipe);
    expect(held[1]).toMatchObject({ verdict: 'HOLD', basis: 'record' });
    expect(held[2].verdict).toBe('HOLD');
    expect(qaPoints(batch({ og: 17.2 }), recipe)[0].verdict).toBe('HOLD');
    expect(qaPoints(batch({ fg: 3.7, qa: 'PASS', dO: 30 }), recipe).map((q) => q.verdict)).toEqual(['PASS', 'PASS', 'PASS']);
  });
  it('shows where a batch is in the genealogy chain', () => {
    const g = genealogy(batch({ timeline: [['MILLING', 11], ['MASH', 11.25], ['LAUTER', 12.6], ['BOIL', 14.4], ['WHIRLPOOL', 15.8], ['KNOCKOUT', 16.5], ['FERMENTATION', 17.3]] }));
    expect(g.map((n) => n.status)).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'cur', 'todo', 'todo', 'todo']);
    expect(g[6].title).toBe('FV02');
  });
  it('finds the batches exposed to a contaminated one', () => {
    const src = batch({ id: 'BR0007', fv: 'FV03', start: 60, recipe: 'IPA', qa: 'HOLD' });
    const ring = [
      src,
      batch({ id: 'BR0008', fv: 'FV04', start: 62, recipe: 'IPA' }),
      batch({ id: 'BR0009', fv: 'FV05', start: 63, recipe: 'Stout' }),
      batch({ id: 'BR0006', fv: 'FV06', start: 40, recipe: 'IPA' }),
      batch({ id: 'BR0005', fv: 'FV07', start: 62, recipe: 'Pilsner', bbt: '', state: 'COMPLETE' }),
    ];
    const risk = atRisk(src, ring, (r) => ({ IPA: 'US-05 Ale', Stout: 'London Ale III', Pilsner: 'W-34/70 Lager' })[r] ?? '');
    expect(risk.map((r) => r.id)).toEqual(['BR0008']);
  });
});

describe('OEE waterfall', () => {
  it('walks planned minutes down to good minutes', () => {
    const wf = waterfall(480, 400, 80, 0.95, 0.98)!;
    expect(wf.steps.map((s) => s.name)).toEqual(['Planned', 'Availability loss', 'Performance loss', 'Quality loss', 'Good time']);
    expect(wf.goodMin).toBeCloseTo(400 * 0.95 * 0.98);
    const sum = wf.steps[1].minutes + wf.steps[2].minutes + wf.steps[3].minutes + wf.goodMin;
    expect(sum).toBeCloseTo(480);
    const b = bars(wf);
    expect(b.base[0]).toBe(0);
    expect(b.base[1] + b.value[1]).toBeCloseTo(480);
    expect(b.base[3]).toBeCloseTo(wf.goodMin);
  });
  it('is null before the shift has planned time or while a tag is missing', () => {
    expect(waterfall(0, 0, 0, 1, 1)).toBeNull();
    expect(waterfall(480, Number.NaN, 0, 1, 1)).toBeNull();
  });
});

describe('trend helpers', () => {
  it('drops nulls and the historian garbage constant', () => {
    expect(plausible('1.9E-248')).toBeNull();
    expect(plausible(null)).toBeNull();
    expect(plausible('4.5')).toBe(4.5);
    expect(plausible(0)).toBe(0);
  });
  it('turns a simulated hour into an axis label', () => {
    expect(hourLabel(3 * 24 + 14, true)).toBe('D3 14:00');
    expect(hourLabel(14.6, false, true)).toBe('14:36');
  });
  it('computes derived signals row-wise and skips rows with a missing input', () => {
    const s: Signal = { id: 'q', label: '', color: '', tags: ['a', 'b'], fn: ([a, b]) => a * b };
    expect(valueOf(s, (t) => (t === 'a' ? 2 : 3))).toBe(6);
    expect(valueOf(s, (t) => (t === 'a' ? 2 : null))).toBeNull();
  });
  it('maps a simulated window to real time at the sim speed', () => {
    expect(windowMs(8, 60)).toBe(8 * 60_000);
    expect(windowMs(30, 120)).toBe(15 * 60_000);
  });
});

describe('audit', () => {
  it('parses Ignition audit rows (any key casing) and groups them by actor, newest first', () => {
    const rows = parseAudit({ result: [
      { Actor: 'ign-operator', Action: 'POST', 'Action Target': '/script/library', 'Action Value': 'brew.hold_line', Timestamp: 1000, 'Result Code': 0 },
      { actor: 'ign-admin', action: 'POST', actionTarget: '/auth/login', timestamp: 3000 },
      { Actor: 'ign-operator', Action: 'POST', 'Action Target': '/alarms/acknowledge', Timestamp: 2000, 'Result Code': 1 },
    ] });
    expect(rows.map((r) => r.time)).toEqual([3000, 2000, 1000]);
    const g = groupByActor(rows);
    expect(g.map(([a]) => a)).toEqual(['ign-admin', 'ign-operator']);
    expect(g[1][1][0].ok).toBe(false);
    expect(parseAudit(null)).toEqual([]);
  });
});

describe('identity states', () => {
  it('maps a session to anonymous, viewer, operator, director', async () => {
    const { toIdentity } = await import('../src/identity');
    const s = (authMethod: 'bearer' | 'web' | 'apiKey' | null, user: string | null, canWrite: boolean, canAdmin: boolean) => ({
      authenticated: !!user, user, authMethod, canLogout: authMethod === 'bearer', securityLevels: ['x'], permissions: { canWrite, canAdmin, canAdminGateway: false }, site: 'brewery',
    });
    expect(toIdentity(null).tier).toBe('Anonymous');
    expect(toIdentity(s('apiKey', 'api-key:brewery', true, true)).tier).toBe('Anonymous');
    expect(toIdentity(s('bearer', 'ign-viewer', false, false))).toMatchObject({ method: 'bearer', tier: 'Viewer', canLogout: true });
    expect(toIdentity(s('bearer', 'ign-operator', true, false)).tier).toBe('Operator');
    expect(toIdentity(s('bearer', 'ign-admin', true, true)).tier).toBe('Director');
    expect(toIdentity(s('web', 'etl', true, true))).toMatchObject({ method: 'web', user: 'etl', tier: 'Director', canLogout: false });
  });
});
