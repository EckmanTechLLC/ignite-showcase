<script setup lang="ts">
import { computed } from 'vue';

// Horizontal bar; the fill is a scaleX transform so it animates on the compositor-friendly path.
const props = withDefaults(defineProps<{ x: number; y: number; w: number; h?: number; value: number; color?: string }>(), {
  h: 5,
  color: 'var(--accent)',
});
const v = computed(() => (Number.isFinite(props.value) ? Math.min(1, Math.max(0, props.value)) : 0));
</script>

<template>
  <g>
    <rect :x="x" :y="y" :width="w" :height="h" rx="1.5" class="trk" />
    <rect :x="x" :y="y" :width="w" :height="h" rx="1.5" class="fill" :style="{ transform: `scaleX(${v})`, fill: color }" />
  </g>
</template>

<style scoped>
.trk { fill: var(--bg-3); }
.fill { transform-box: fill-box; transform-origin: left center; transition: transform var(--dur-slow) var(--ease-out), fill var(--dur-slow); }
</style>
