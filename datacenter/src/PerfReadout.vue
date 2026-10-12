<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { onFrameTime } from './anim';
import { stats } from './live/store';

// Readout: always available in dev; in a build it is enabled by ?perf (shown at once). "p" toggles.
const startOpen = new URLSearchParams(location.search).has('perf');
const open = ref(startOpen);
const fps = ref(0);
const avg = ref(0);
const p50 = ref(0);
const p95 = ref(0);
const max = ref(0);
const nodes = ref(0);
const batchesPerS = ref(0);
const updatesPerS = ref(0);

const WINDOW = 180;
const frames: number[] = [];
let stopFrame = () => {};
let timer = 0;
let lastB = 0;
let lastU = 0;

function sample(): void {
  if (!frames.length) return;
  const sorted = [...frames].sort((a, b) => a - b);
  const sum = frames.reduce((a, b) => a + b, 0);
  avg.value = sum / frames.length;
  fps.value = 1000 / avg.value;
  p50.value = sorted[Math.floor(sorted.length * 0.5)];
  p95.value = sorted[Math.floor(sorted.length * 0.95)];
  max.value = sorted[sorted.length - 1];
  nodes.value = document.getElementsByTagName('*').length;
  batchesPerS.value = stats.batches - lastB;
  updatesPerS.value = stats.updates - lastU;
  lastB = stats.batches;
  lastU = stats.updates;
}
function onKey(e: KeyboardEvent): void {
  if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) open.value = !open.value;
}
onMounted(() => {
  const enabled = import.meta.env.DEV || new URLSearchParams(location.search).has('perf');
  if (!enabled) return;
  window.addEventListener('keydown', onKey);
  stopFrame = onFrameTime((ms) => {
    frames.push(ms);
    if (frames.length > WINDOW) frames.shift();
  });
  timer = window.setInterval(sample, 1000);
  // Exposed for scripted measurement (headless runs).
  (window as unknown as { __perf: () => unknown }).__perf = () => ({
    fps: fps.value, avg: avg.value, p50: p50.value, p95: p95.value, max: max.value, nodes: nodes.value,
    batchesPerS: batchesPerS.value, updatesPerS: updatesPerS.value,
  });
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  stopFrame();
  clearInterval(timer);
});
</script>

<template>
  <div v-if="open" class="perf mono" aria-hidden="true">
    <div><b>{{ fps.toFixed(0) }}</b> fps &middot; {{ avg.toFixed(1) }} ms avg</div>
    <div>p50 {{ p50.toFixed(1) }} ms &middot; p95 {{ p95.toFixed(1) }} ms &middot; max {{ max.toFixed(1) }} ms</div>
    <div>{{ nodes }} DOM nodes</div>
    <div>{{ batchesPerS }} batches/s &middot; {{ updatesPerS }} updates/s</div>
  </div>
</template>

<style scoped>
.perf { position: fixed; right: 12px; bottom: 12px; z-index: 30; padding: 8px 12px; background: rgb(0 0 0 / 0.82); border: 1px solid var(--accent); border-radius: var(--radius-2); font-size: var(--text-xs); color: var(--fg-1); pointer-events: none; }
.perf b { color: var(--accent); font-size: var(--text-md); }
</style>
