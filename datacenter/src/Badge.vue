<script setup lang="ts">
import { computed } from 'vue';
import { TONE_COLOR, type Tone } from './fmt';

const props = withDefaults(defineProps<{ x: number; y: number; text: string; tone: Tone; anchor?: 'start' | 'end'; pulse?: boolean }>(), {
  anchor: 'start',
  pulse: false,
});
const w = computed(() => props.text.length * 6.6 + 12);
const rx = computed(() => (props.anchor === 'end' ? props.x - w.value : props.x));
</script>

<template>
  <g class="badge" :class="{ pulse }" :style="{ '--tone': TONE_COLOR[tone] }">
    <rect :x="rx" :y="y" :width="w" height="16" rx="3" />
    <text :x="rx + w / 2" :y="y + 11.5" text-anchor="middle">{{ text }}</text>
  </g>
</template>

<style scoped>
rect { fill: color-mix(in srgb, var(--tone) 18%, var(--bg-1)); stroke: var(--tone); stroke-width: 1; transition: fill var(--dur-base), stroke var(--dur-base); }
text { fill: var(--tone); font: 600 10px var(--font-mono); letter-spacing: 0.04em; transition: fill var(--dur-base); }
.pulse rect { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { fill: color-mix(in srgb, var(--tone) 42%, var(--bg-1)); } }
</style>
