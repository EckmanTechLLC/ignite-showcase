import { computed } from 'vue';
import { tagRef } from '../live/store';
import { ROWS, rackId } from '../layout';

const numOf = (name: string) => {
  const v = tagRef(name).value;
  return typeof v === 'number' ? v : Number.NaN;
};

function over(r: number, tag: string): number[] {
  const out: number[] = [];
  for (let i = 1; i <= 10; i++) {
    const v = numOf(`Racks/${rackId(r * 10 + i)}/${tag}`);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}
const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : Number.NaN);

/** Per-row aggregates over the ten racks of each row (reactive through the tag refs). */
export const rowStats = ROWS.map((_, r) => ({
  inletAvg: computed(() => avg(over(r, 'InletTempC'))),
  inletMax: computed(() => (over(r, 'InletTempC').length ? Math.max(...over(r, 'InletTempC')) : Number.NaN)),
  outletAvg: computed(() => avg(over(r, 'OutletTempC'))),
  kw: computed(() => over(r, 'PowerKW').reduce((s, v) => s + v, 0)),
}));
