<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { reducedMotion } from '../anim';

// The WebGL scene (three, TresJS, camera controls) is a lazy chunk: it is requested after the first paint of the
// HUD, so the page is interactive (and live data is flowing) before any GPU work starts.
const HallCanvas = defineAsyncComponent(() => import('./HallCanvas.vue'));
const mounted = ref(false);
const failure = ref('');
let raf = 0;
let timer = 0;
onMounted(() => {
  raf = requestAnimationFrame(() => (timer = window.setTimeout(() => (mounted.value = true), 0)));
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  clearTimeout(timer);
});
</script>

<template>
  <div class="scene" role="img" aria-label="3D data hall: 60 racks in six rows with cold-aisle containment, four CRAH units, electrical room and roof chillers, colour-coded by live temperature and power">
    <HallCanvas v-if="mounted && !failure" @error="(m: string) => (failure = m)" />
    <div v-if="!mounted" class="note mono">Loading 3D hall&hellip;</div>
    <div v-else-if="failure" class="note mono" role="alert">3D view unavailable ({{ failure }}). Live values continue in the HUD and overlays.</div>
    <div v-if="reducedMotion" class="note rm mono">Reduced motion: static camera, no airflow particles</div>
  </div>
</template>

<style scoped>
.scene { position: absolute; inset: 0; }
.scene :deep(canvas) { display: block; outline: none; }
.note { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); color: var(--fg-2); font-size: var(--text-sm); letter-spacing: 0.06em; }
.note.rm { top: auto; bottom: 64px; transform: translateX(-50%); font-size: var(--text-xs); }
</style>
