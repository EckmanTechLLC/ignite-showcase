<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import Hud from './hud/Hud.vue';
import Scene from './Scene.vue';
import Tooltip from './Tooltip.vue';
import PerfReadout from './PerfReadout.vue';
import { startLive, stopLive } from './live/store';

const legend = ref(true);
startLive();
onBeforeUnmount(stopLive);
</script>

<template>
  <Hud v-model:legend="legend" />
  <main class="stage"><Scene :legend="legend" /></main>
  <Tooltip />
  <PerfReadout />
</template>
