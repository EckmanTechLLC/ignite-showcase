<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import Hud from './hud/Hud.vue';
import Scene from './hall3d/Scene.vue';
import Tooltip from './Tooltip.vue';
import PerfReadout from './PerfReadout.vue';
import Overlays from './overlays/Overlays.vue';
import { startLive, stopLive } from './live/store';

const legend = ref(window.innerWidth >= 1500);
startLive();
onBeforeUnmount(stopLive);
</script>

<template>
  <Hud v-model:legend="legend" />
  <main class="stage"><Scene /></main>
  <Tooltip />
  <Overlays />
  <PerfReadout />
</template>
