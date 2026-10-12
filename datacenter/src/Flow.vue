<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { onFrame } from './anim';

// A conductor / pipe: an underlay that cuts crossings, a dim track, and dashes that travel along the path.
// Dash speed (px/s) follows the load; inactive paths dim and stop.
const props = withDefaults(
  defineProps<{ d: string; color: string; speed: number; active: boolean; width?: number; dash?: string; reverse?: boolean }>(),
  { width: 2.5, dash: '6 10', reverse: false },
);
const el = ref<SVGPathElement | null>(null);
const period = props.dash.split(/\s+/).reduce((a, b) => a + Number(b), 0);
let cur = 0;
let off = 0;
const stop = onFrame((dt) => {
  const target = props.active ? props.speed : 0;
  cur += (target - cur) * Math.min(1, dt * 2.5);
  if (cur < 0.05) return;
  off = (off - cur * dt * (props.reverse ? -1 : 1)) % period;
  if (el.value) el.value.style.strokeDashoffset = off.toFixed(2);
});
onBeforeUnmount(stop);
</script>

<template>
  <g class="flow" :class="{ dead: !active }">
    <path :d="d" class="under" :stroke-width="width + 5" />
    <path :d="d" class="track" :stroke="active ? color : 'var(--line-strong)'" :stroke-width="width" />
    <path ref="el" :d="d" class="dash" :stroke="color" :stroke-width="width" :stroke-dasharray="dash" />
  </g>
</template>

<style scoped>
path { fill: none; stroke-linejoin: round; }
.under { stroke: var(--bg-1); }
.track { opacity: 0.28; transition: stroke var(--dur-slow) var(--ease-out), opacity var(--dur-slow); }
.dead .track { opacity: 0.45; }
.dash { opacity: 0.95; transition: stroke 4s linear, opacity var(--dur-slow); }
.dead .dash { opacity: 0; }
</style>
