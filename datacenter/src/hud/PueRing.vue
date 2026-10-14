<script setup lang="ts">
import { computed } from 'vue';
import { useTagNumber } from '../live/store';
import { num } from '../fmt';

// PUE ring, 1.0 .. 2.0 around a 270 degree arc; the 1.6 alarm threshold (tag alarm PUEHigh) is marked.
const pue = useTagNumber('Hall/PUE');
const C = 28;
const R = 22;
const V0 = 1;
const V1 = 2;
const ALARM = 1.6;
const START = 135; // degrees, clockwise from 3 o'clock
const SWEEP = 270;

const frac = (v: number) => (Math.min(V1, Math.max(V0, v)) - V0) / (V1 - V0);
const pt = (v: number, r: number) => {
  const a = ((START + frac(v) * SWEEP) * Math.PI) / 180;
  return `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`;
};
const arc = (a: number, b: number) => `M${pt(a, R)} A${R},${R} 0 ${(frac(b) - frac(a)) * SWEEP > 180 ? 1 : 0} 1 ${pt(b, R)}`;
const tone = computed(() => (!Number.isFinite(pue.value) ? 'off' : pue.value > ALARM ? 'alarm' : pue.value > 1.5 ? 'warn' : 'ok'));
</script>

<template>
  <svg class="ring" viewBox="0 0 56 56" role="img" :aria-label="`PUE ${num(pue, 2)}`">
    <path class="seg" :d="arc(1, 1.5)" stroke="var(--ok)" />
    <path class="seg" :d="arc(1.5, ALARM)" stroke="var(--warn)" />
    <path class="seg" :d="arc(ALARM, 2)" stroke="var(--alarm)" />
    <circle v-if="Number.isFinite(pue)" class="dot" :cx="pt(pue, R).split(',')[0]" :cy="pt(pue, R).split(',')[1]" r="3.6" />
    <text class="val" :class="tone" :x="C" :y="C + 2" text-anchor="middle">{{ num(pue, 2) }}</text>
    <text class="lbl" :x="C" :y="C + 12" text-anchor="middle">PUE</text>
  </svg>
</template>

<style scoped>
.ring { width: 52px; height: 52px; display: block; flex: none; }
.seg { fill: none; stroke-width: 4; opacity: 0.8; stroke-linecap: butt; }
.dot { fill: var(--bg-0); stroke: #fff; stroke-width: 1.6; transition: cx 900ms var(--ease-out), cy 900ms var(--ease-out); }
.val { font: 700 11.5px var(--font-mono); fill: var(--fg-0); }
.val.warn { fill: var(--warn); } .val.alarm { fill: var(--alarm); }
.lbl { font: 500 6.5px var(--font-mono); fill: var(--fg-2); letter-spacing: 0.1em; }
</style>
