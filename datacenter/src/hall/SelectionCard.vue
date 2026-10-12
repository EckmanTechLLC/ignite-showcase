<script setup lang="ts">
import { computed } from 'vue';
import { detailFor } from '../detail';
import { selection } from '../selection';

const d = computed(() => (selection.value ? detailFor(selection.value) : null));
const cols = computed(() => {
  const rows = d.value?.rows ?? [];
  return [rows.slice(0, 4), rows.slice(4, 8)];
});
</script>

<template>
  <g>
    <rect class="box" :class="{ on: !!d }" x="8" y="836" width="484" height="90" rx="8" />
    <template v-if="d">
      <text class="h" x="20" y="856">{{ d.title }}</text>
      <text class="s" x="472" y="856" text-anchor="end">{{ d.sub }}</text>
      <g v-for="(col, ci) in cols" :key="ci" :transform="`translate(${20 + ci * 236} 874)`">
        <g v-for="(r, ri) in col" :key="r.k" :transform="`translate(0 ${ri * 13})`">
          <text class="k" x="0" y="0">{{ r.k }}</text>
          <text class="v" :class="r.tone" x="216" y="0" text-anchor="end">{{ r.v }}</text>
        </g>
      </g>
    </template>
    <template v-else>
      <text class="h dim" x="20" y="860">SELECTION</text>
      <text class="s" x="20" y="884">Click a rack, CRAH, chiller, UPS, PDU or source to pin its live values here.</text>
      <text class="s" x="20" y="900">Hover anything for a tooltip. Click empty space or press Esc to clear.</text>
    </template>
  </g>
</template>

<style scoped>
.box { fill: color-mix(in srgb, var(--bg-1) 86%, transparent); stroke: var(--line); stroke-width: 1.2; transition: stroke var(--dur-base); }
.box.on { stroke: var(--accent); }
.h { font: 700 13px var(--font-mono); fill: var(--accent); letter-spacing: 0.06em; text-transform: uppercase; }
.h.dim { fill: var(--fg-2); font-size: 10.5px; }
.s { font: 400 10px var(--font-mono); fill: var(--fg-2); }
.k { font: 500 10px var(--font-mono); fill: var(--fg-2); }
.v { font: 500 11px var(--font-mono); fill: var(--fg-0); }
.v.ok { fill: var(--ok); } .v.warn { fill: var(--warn); } .v.alarm { fill: var(--alarm); }
</style>
