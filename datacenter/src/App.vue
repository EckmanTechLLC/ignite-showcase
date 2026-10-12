<script setup lang="ts">
import { computed } from 'vue';
import Hud from './Hud.vue';
import { useTag } from './useTag';

const TAG = '[default]MyTag/Value';
const { value, state, env } = useTag(TAG);

const COLS = 10;
const ROWS = 6;
const racks = Array.from({ length: COLS * ROWS }, (_, i) => ({
  id: i,
  x: 40 + (i % COLS) * 90,
  y: 40 + Math.floor(i / COLS) * 120 + (Math.floor(i / COLS) % 2 ? 20 : 0),
  // each rack gets a small fixed phase offset so the grid reads as a heat map, not a flat colour
  bias: ((i * 37) % 21) - 10,
}));

// Unscaled placeholder mapping: the live value is treated as 0..100 and drives a cool-to-hot hue.
const level = computed(() => (typeof value.value === 'number' ? value.value : 0));
function fill(bias: number): string {
  const t = Math.max(0, Math.min(100, level.value + bias)) / 100;
  const hue = 200 - 200 * t; // cyan to red
  return `hsl(${hue} 70% ${28 + 22 * t}%)`;
}
</script>

<template>
  <div class="stage">
    <svg viewBox="0 0 940 780" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Data hall rack grid">
      <rect
        v-for="r in racks"
        :key="r.id"
        :x="r.x"
        :y="r.y"
        width="70"
        height="90"
        rx="4"
        :fill="fill(r.bias)"
        stroke="var(--line-strong)"
        style="transition: fill var(--dur-base) var(--ease-out)"
      />
    </svg>
  </div>
  <Hud :gateway-url="env.gatewayUrl" :site="env.site" :state="state" :path="TAG" :value="value" />
</template>
