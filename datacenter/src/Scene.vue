<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import Hall from './hall/Hall.vue';
import Legend from './hall/Legend.vue';
import RowSummary from './hall/RowSummary.vue';
import SelectionCard from './hall/SelectionCard.vue';
import PowerChain from './power/PowerChain.vue';
import CoolingLoop from './cooling/CoolingLoop.vue';
import { H, VIEW_Y, W } from './layout';
import { hover, pointer, select, selection, type Kind } from './selection';

defineProps<{ legend: boolean }>();

function targetOf(e: Event): { kind: Kind; id: string } | null {
  const el = (e.target as Element | null)?.closest?.('[data-kind]');
  if (!el) return null;
  return { kind: el.getAttribute('data-kind') as Kind, id: el.getAttribute('data-id') ?? '' };
}

// One set of delegated listeners for the whole scene instead of ~100 per-element handlers.
function onMove(e: PointerEvent): void {
  const t = targetOf(e);
  pointer.value = { x: e.clientX, y: e.clientY };
  const h = hover.value;
  if (!t) {
    if (h) hover.value = null;
  } else if (!h || h.kind !== t.kind || h.id !== t.id) {
    hover.value = t;
  }
}
function onLeave(): void {
  hover.value = null;
}
function onClick(e: MouseEvent): void {
  const t = targetOf(e);
  if (t) select(t);
  else selection.value = null;
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') selection.value = null;
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <svg
    class="scene"
    :viewBox="`0 ${VIEW_Y} ${W} ${H - VIEW_Y}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label="Data hall: power chain, 60 racks with live heat map, CRAH units and chilled-water loop"
    @pointermove="onMove"
    @pointerleave="onLeave"
    @click="onClick"
  >
    <defs>
      <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="rgb(20 26 36 / 0.7)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="rgb(140 160 185 / 0.55)" stroke-width="2" />
      </pattern>
    </defs>
    <PowerChain />
    <CoolingLoop />
    <Hall />
    <Legend v-show="legend" />
    <SelectionCard />
    <RowSummary />
  </svg>
</template>

<style scoped>
.scene { display: block; width: 100%; height: 100%; user-select: none; -webkit-user-select: none; }
</style>
