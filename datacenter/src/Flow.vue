<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onFrame, reducedMotion } from './anim';

// A conductor / pipe: an underlay that cuts crossings, a dim track, and dashes that travel along the path.
// Dash speed (px/s) follows the load; inactive paths dim and stop.
const props = withDefaults(
  defineProps<{ d: string; color: string; speed: number; active: boolean; width?: number; dash?: string; reverse?: boolean }>(),
  { width: 2.5, dash: '6 10', reverse: false },
);
const el = ref<SVGPathElement | null>(null);
const period = props.dash.split(/\s+/).reduce((a, b) => a + Number(b), 0);
// One Web Animation per path (one cycle = one dash period per second); only its playbackRate follows the load, and
// it is touched only while the speed is easing or has changed, so a steady flow costs no per-frame script or style work.
let anim: Animation | null = null;
let cur = 0;
let rate = 0;
onMounted(() => {
  anim = el.value?.animate?.(
    [{ strokeDashoffset: '0px' }, { strokeDashoffset: `${props.reverse ? period : -period}px` }],
    { duration: 1000, iterations: Infinity, easing: 'linear' },
  ) ?? null;
  anim?.pause();
});
// Reduced motion: the frame loop stops calling back, so also freeze a flow that was already running.
watch(reducedMotion, (r) => {
  if (!r) return;
  anim?.pause();
  cur = 0;
  rate = 0;
});
const stop = onFrame((dt) => {
  const target = props.active ? props.speed : 0;
  if (cur === target) return;
  cur += (target - cur) * Math.min(1, dt * 2.5);
  if (Math.abs(target - cur) < 0.05) cur = target;
  const next = cur < 0.05 ? 0 : cur / period;
  if (next === rate || !anim) return;
  rate = next;
  if (rate === 0) anim.pause();
  else {
    anim.updatePlaybackRate(rate);
    if (anim.playState === 'paused') anim.play();
  }
});
onBeforeUnmount(() => {
  stop();
  anim?.cancel();
});
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
