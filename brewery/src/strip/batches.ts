import { createMemo, createRoot } from 'solid-js';
import { simNowH, tagNum, tagStr } from '../live/store';
import { INACTIVE_STATES, SLOTS, groupIndex } from '../model';

export interface Seg {
  /** Index into PHASE_GROUPS. */
  group: number;
  phase: string;
  from: number;
  /** Absolute sim hour; NaN = still running (the strip ends it at "now"). */
  to: number;
}

export interface BatchRow {
  slot: string;
  id: string;
  recipe: string;
  state: string;
  phase: string;
  start: number;
  fv: string;
  bbt: string;
  hold: boolean;
  planned: boolean;
  segs: Seg[];
}

/** "MILLING@6.01,MASH@6.25" -> [["MILLING", 6.01], ["MASH", 6.25]]. */
export function parseTimeline(s: string): [string, number][] {
  if (!s) return [];
  const out: [string, number][] = [];
  for (const part of s.split(',')) {
    const i = part.indexOf('@');
    const h = Number(part.slice(i + 1));
    if (i > 0 && Number.isFinite(h)) out.push([part.slice(0, i), h]);
  }
  return out;
}

/** Timeline entries merged into display groups (several phases of one group become one segment). */
export function toSegs(tl: [string, number][]): Seg[] {
  const segs: Seg[] = [];
  for (let i = 0; i < tl.length; i++) {
    const [phase, from] = tl[i];
    if (phase === 'COMPLETE') break;
    const to = i + 1 < tl.length ? tl[i + 1][1] : Number.NaN;
    const group = groupIndex(phase);
    if (group < 0) continue;
    const last = segs[segs.length - 1];
    if (last && last.group === group) last.to = to;
    else segs.push({ group, phase, from, to });
  }
  return segs;
}

function readRow(slot: string): BatchRow {
  const p = `Batches/${slot}/`;
  const state = tagStr(`${p}State`);
  return {
    slot,
    id: tagStr(`${p}Id`),
    recipe: tagStr(`${p}Recipe`),
    state,
    phase: tagStr(`${p}Phase`),
    start: tagNum(`${p}StartHour`),
    fv: tagStr(`${p}FV`),
    bbt: tagStr(`${p}BBT`),
    hold: tagStr(`${p}QAStatus`) === 'HOLD',
    planned: state === 'PLANNED',
    segs: toSegs(parseTimeline(tagStr(`${p}Timeline`))),
  };
}

/** Active batches (oldest first) and the next planned brew. */
export const batchRows = createRoot(() => createMemo<{ active: BatchRow[]; next: BatchRow | null }>(
  () => {
    const all = SLOTS.map(readRow).filter((r) => r.id);
    const active = all.filter((r) => !INACTIVE_STATES.has(r.state)).sort((a, b) => a.start - b.start);
    const planned = all.filter((r) => r.planned).sort((a, b) => a.start - b.start);
    return { active, next: planned[0] ?? null };
  },
  { active: [], next: null },
  {
    equals: (a, b) =>
      a.next?.id === b.next?.id &&
      a.next?.start === b.next?.start &&
      a.active.length === b.active.length &&
      a.active.every((r, i) => {
        const o = b.active[i];
        return r.id === o.id && r.state === o.state && r.hold === o.hold && r.phase === o.phase && r.segs.length === o.segs.length && r.fv === o.fv && r.bbt === o.bbt;
      }),
  },
));

export { simNowH };
