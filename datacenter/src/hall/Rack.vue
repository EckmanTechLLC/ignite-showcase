<script setup lang="ts">
import { computed } from 'vue';
import { useTagBool, useTagNumber, useTagString } from '../live/store';
import { heatColor, T_ALLOWABLE, T_RECOMMENDED } from '../heat';
import { RACK_H, RACK_W, rackId, rackPos } from '../layout';
import { num } from '../fmt';
import { hover, selection } from '../selection';

const props = defineProps<{ n: number }>();
const id = rackId(props.n);
const pos = rackPos(props.n);
const p = `Racks/${id}/`;
const inlet = useTagNumber(p + 'InletTempC');
const kw = useTagNumber(p + 'PowerKW');
const util = useTagNumber(p + 'UtilPct');
const online = useTagBool(p + 'Online');
const workload = useTagString(p + 'Workload');

const MAX_KW = 18;
const offline = computed(() => online.value === false);
const fill = computed(() => (offline.value ? 'rgb(34 42 54)' : heatColor(inlet.value)));
const level = computed(() =>
  offline.value ? 'off' : inlet.value >= T_ALLOWABLE ? 'crit' : inlet.value >= T_RECOMMENDED ? 'warn' : 'ok',
);
const powerScale = computed(() => (Number.isFinite(kw.value) ? Math.min(1, kw.value / MAX_KW) : 0));
const utilX = computed(() => 6 + (Number.isFinite(util.value) ? Math.min(100, Math.max(0, util.value)) / 100 : 0) * 64);
const isSel = computed(() => selection.value?.kind === 'rack' && selection.value.id === id);
const isHover = computed(() => hover.value?.kind === 'rack' && hover.value.id === id);
</script>

<template>
  <g
    class="rack"
    :class="[`lv-${level}`, { sel: isSel, hov: isHover }]"
    :transform="`translate(${pos.x} ${pos.y})`"
    data-kind="rack"
    :data-id="id"
  >
    <rect class="body" :width="RACK_W" :height="RACK_H" rx="3" :style="{ fill }" />
    <rect v-if="offline" class="hatch" :width="RACK_W" :height="RACK_H" rx="3" fill="url(#hatch)" />
    <!-- inlet face marker: the side that breathes cold-aisle air -->
    <line class="inlet" x1="4" x2="72" :y1="pos.inletDown ? RACK_H - 0.5 : 0.5" :y2="pos.inletDown ? RACK_H - 0.5 : 0.5" />
    <text class="rid" x="6" y="13">{{ id }}</text>
    <text v-if="!offline" class="rkw" x="6" y="26">{{ num(kw, 1) }}<tspan class="u"> kW</tspan></text>
    <text v-else class="rkw off" x="6" y="26">OFFLINE</text>
    <!-- workload icon -->
    <g class="icon" transform="translate(58 3)">
      <template v-if="workload === 'web'">
        <circle cx="6" cy="6" r="5" />
        <ellipse cx="6" cy="6" rx="2.2" ry="5" />
        <line x1="1" x2="11" y1="6" y2="6" />
      </template>
      <template v-else-if="workload === 'batch'">
        <line x1="1" x2="11" y1="2" y2="2" />
        <line x1="1" x2="11" y1="6" y2="6" />
        <line x1="1" x2="11" y1="10" y2="10" />
      </template>
      <template v-else-if="workload === 'db'">
        <ellipse cx="6" cy="2.5" rx="5" ry="2" />
        <path d="M1 2.5v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7M1 6c0 1.1 2.2 2 5 2s5-.9 5-2" />
      </template>
      <template v-else-if="workload === 'ml'">
        <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
        <path d="M5 0v2.5M7 0v2.5M5 9.5V12M7 9.5V12M0 5h2.5M0 7h2.5M9.5 5H12M9.5 7H12" />
      </template>
      <template v-else-if="workload === 'idle'">
        <path d="M2 3h5L2 9h5M8 1h3l-3 4h3" />
      </template>
    </g>
    <!-- utilisation tick over its track, power bar below -->
    <rect class="trk" x="6" y="33" width="64" height="2" rx="1" />
    <rect v-if="!offline" class="tick" :x="utilX - 1" y="30.5" width="2" height="7" rx="1" style="transition: x var(--dur-slow) var(--ease-out)" />
    <rect class="trk" x="6" y="40" width="64" height="4" rx="1.5" />
    <rect v-if="!offline" class="pbar" x="6" y="40" width="64" height="4" rx="1.5" :style="{ transform: `scaleX(${powerScale})` }" />
    <rect class="ring" :width="RACK_W" :height="RACK_H" rx="3" />
  </g>
</template>

<style scoped>
.rack { cursor: pointer; }
.body { transition: fill var(--dur-slow) linear; stroke: rgb(0 0 0 / 0.45); stroke-width: 1; }
.hatch { opacity: 0.8; pointer-events: none; }
.inlet { stroke: rgb(255 255 255 / 0.55); stroke-width: 1; stroke-linecap: round; }
text { pointer-events: none; fill: #fff; paint-order: stroke; stroke: rgb(0 0 0 / 0.5); stroke-width: 2.4px; stroke-linejoin: round; }
.rid { font: 700 10px var(--font-mono); }
.rkw { font: 500 10px var(--font-mono); }
.rkw .u { font-size: 8px; }
.rkw.off { fill: var(--fg-1); }
.icon { fill: none; stroke: #fff; stroke-width: 1.1; stroke-linecap: round; stroke-linejoin: round; opacity: 0.95; pointer-events: none; }
.trk { fill: rgb(0 0 0 / 0.38); pointer-events: none; }
.pbar { fill: rgb(255 255 255 / 0.92); transform-box: fill-box; transform-origin: left center; transition: transform var(--dur-slow) var(--ease-out); pointer-events: none; }
.tick { fill: #fff; stroke: rgb(0 0 0 / 0.6); stroke-width: 0.8; pointer-events: none; }
.lv-off .icon { opacity: 0.35; }
.ring { fill: none; stroke: transparent; stroke-width: 1.5; pointer-events: none; transition: stroke var(--dur-fast); }
.lv-warn .ring { stroke: var(--warn); }
.lv-crit .ring { stroke: var(--alarm); stroke-width: 2.2; animation: crit 1s ease-in-out infinite; }
.hov .ring { stroke: #fff; stroke-width: 1.6; }
.sel .ring { stroke: var(--accent); stroke-width: 2.6; animation: none; }
.sel { filter: drop-shadow(0 0 6px var(--accent)); }
@keyframes crit { 50% { stroke-opacity: 0.25; } }
</style>
