<script setup lang="ts">
import { computed } from 'vue';
import { useTagNumber } from '../live/store';
import { num } from '../fmt';

// PUE gauge, 1.0 .. 2.0 across a half circle; the 1.6 alarm threshold (tag alarm PUEHigh) is marked.
const pue = useTagNumber('Hall/PUE');
const CX = 80;
const CY = 68;
const R = 58;
const V0 = 1;
const V1 = 2;
const ALARM = 1.6;

const ang = (v: number) => Math.PI * (1 - (Math.min(V1, Math.max(V0, v)) - V0) / (V1 - V0));
const pt = (v: number, r: number) => `${(CX + r * Math.cos(ang(v))).toFixed(2)},${(CY - r * Math.sin(ang(v))).toFixed(2)}`;
const arc = (a: number, b: number, r = R) => `M${pt(a, r)} A${r},${r} 0 0 1 ${pt(b, r)}`;

const deg = computed(() => (Number.isFinite(pue.value) ? (Math.min(V1, Math.max(V0, pue.value)) - V0) * 180 : 0));
const tone = computed(() => (!Number.isFinite(pue.value) ? 'off' : pue.value > ALARM ? 'alarm' : pue.value > 1.5 ? 'warn' : 'ok'));
</script>

<template>
  <svg class="gauge" viewBox="0 0 160 96" role="img" :aria-label="`PUE ${num(pue, 2)}`">
    <path class="seg" :d="arc(1, 1.5)" stroke="var(--ok)" />
    <path class="seg" :d="arc(1.5, ALARM)" stroke="var(--warn)" />
    <path class="seg" :d="arc(ALARM, 2)" stroke="var(--alarm)" />
    <line class="thr" :x1="pt(ALARM, R - 9).split(',')[0]" :y1="pt(ALARM, R - 9).split(',')[1]" :x2="pt(ALARM, R + 8).split(',')[0]" :y2="pt(ALARM, R + 8).split(',')[1]" />
    <text class="lbl" :x="pt(ALARM, R + 15).split(',')[0]" :y="pt(ALARM, R + 15).split(',')[1]" text-anchor="middle">1.6</text>
    <text class="lbl" :x="CX - R" :y="CY + 13" text-anchor="middle">1.0</text>
    <text class="lbl" :x="CX + R" :y="CY + 13" text-anchor="middle">2.0</text>
    <g class="needle" :style="{ transform: `rotate(${deg}deg)`, transformOrigin: `${CX}px ${CY}px` }">
      <line :x1="CX" :y1="CY" :x2="CX - R + 8" :y2="CY" />
    </g>
    <circle :cx="CX" :cy="CY" r="4" class="hub" />
    <text class="val" :class="tone" :x="CX" :y="CY + 22" text-anchor="middle">{{ num(pue, 2) }}</text>
  </svg>
</template>

<style scoped>
.gauge { width: 150px; height: 90px; display: block; }
.seg { fill: none; stroke-width: 7; opacity: 0.85; }
.thr { stroke: #fff; stroke-width: 2; stroke-linecap: round; }
.lbl { font: 500 9px var(--font-mono); fill: var(--fg-2); }
.needle line { stroke: var(--fg-0); stroke-width: 2.4; stroke-linecap: round; }
.needle { transition: transform 900ms var(--ease-out); }
.hub { fill: var(--bg-0); stroke: var(--fg-0); stroke-width: 2; }
.val { font: 700 20px var(--font-mono); fill: var(--fg-0); }
.val.warn { fill: var(--warn); } .val.alarm { fill: var(--alarm); }
</style>
