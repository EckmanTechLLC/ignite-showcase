<script setup lang="ts">
import { computed, ref } from 'vue';
import Panel from '../Panel.vue';
import TrendChart, { type Signal } from './TrendChart.vue';
import { WINDOWS, type WindowKey } from './history';
import { selection, type Target } from '../../selection';
import { unitOf } from '../../fmt';

const win = ref<WindowKey>('1h');

const CYAN = '#22d3ee';
const PURPLE = '#c084fc';
const AMBER = '#fbbf24';
const GREEN = '#34d399';
const RED = '#f87171';

const FIXED: { title: string; signals: Signal[]; axes?: string[]; mark?: { y: number; label: string; color: string } }[] = [
  { title: 'PUE', signals: [{ tag: 'Hall/PUE', label: 'PUE', color: CYAN }], mark: { y: 1.6, label: 'alarm 1.6', color: RED } },
  { title: 'IT load and facility power', axes: ['kW'], signals: [{ tag: 'Hall/ITLoadKW', label: 'IT kW', color: CYAN }, { tag: 'Hall/TotalFacilityKW', label: 'Facility kW', color: AMBER }] },
  { title: 'Hall inlet temperature', axes: ['°C'], signals: [{ tag: 'Hall/HallMaxInletC', label: 'Max inlet', color: RED }, { tag: 'Hall/HallAvgInletC', label: 'Avg inlet', color: GREEN }], mark: { y: 27, label: 'ASHRAE 27', color: AMBER } },
  { title: 'UPS load', axes: ['%'], signals: [{ tag: 'Power/UPS/A/LoadPct', label: 'UPS A', color: CYAN }, { tag: 'Power/UPS/B/LoadPct', label: 'UPS B', color: PURPLE }] },
];

/** Key signals per selectable item (click-to-trend). */
function tagsFor(t: Target | null): { title: string; tags: string[] } | null {
  if (!t) return null;
  switch (t.kind) {
    case 'rack': return { title: `Rack ${t.id}`, tags: [`Racks/${t.id}/InletTempC`, `Racks/${t.id}/PowerKW`] };
    case 'crah': return { title: `CRAH ${t.id}`, tags: [`Cooling/CRAH/${t.id}/SupplyC`, `Cooling/CRAH/${t.id}/ReturnC`, `Cooling/CRAH/${t.id}/FanPct`] };
    case 'ups': return { title: `UPS ${t.id}`, tags: [`Power/UPS/${t.id}/LoadPct`, `Power/UPS/${t.id}/BatterySOCPct`] };
    case 'pdu': return { title: `PDU ${t.id}`, tags: [`Power/PDU/${t.id}/LoadPct`] };
    default: return null;
  }
}
const COLORS = [CYAN, AMBER, PURPLE];
const sel = computed(() => {
  const f = tagsFor(selection.value);
  if (!f) return null;
  const units: string[] = [];
  const signals: Signal[] = f.tags.map((tag, i) => {
    const u = unitOf(tag);
    if (!units.includes(u)) units.push(u);
    return { tag, label: tag.split('/').pop() ?? tag, color: COLORS[i % COLORS.length], axis: Math.min(1, units.indexOf(u)) };
  });
  return { title: `Selected: ${f.title}`, signals, axes: units.slice(0, 2) };
});
</script>

<template>
  <Panel title="Trends" hotkey="T">
    <template #head>
      <button v-for="(w, k) in WINDOWS" :key="k" class="pill" :class="{ on: win === k }" @click="win = k as WindowKey">{{ w.label }}</button>
    </template>
    <div v-if="sel">
      <TrendChart :title="sel.title" :signals="sel.signals" :axes="sel.axes" :win="win" />
    </div>
    <p v-else class="hint">Click a rack, CRAH, UPS or PDU in the scene to chart its key signals here.</p>
    <TrendChart v-for="c in FIXED" :key="c.title" :title="c.title" :signals="c.signals" :axes="c.axes" :mark="c.mark" :win="win" />
  </Panel>
</template>

<style scoped>
.pill { font: 500 var(--text-xs) var(--font-mono); color: var(--fg-1); background: var(--bg-2); border: 1px solid var(--line-strong); border-radius: 10px; padding: 1px 9px; cursor: pointer; }
.pill.on { color: var(--accent); border-color: var(--accent); }
.hint { margin: 0 0 var(--space-3); padding: var(--space-2) var(--space-3); border: 1px dashed var(--line-strong); border-radius: var(--radius-2); color: var(--fg-2); font-size: var(--text-xs); }
</style>
