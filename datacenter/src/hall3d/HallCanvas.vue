<script setup lang="ts">
import * as THREE from 'three';
import { TresCanvas } from '@tresjs/core';
import HallScene from './HallScene.vue';

const emit = defineEmits<{ error: [message: string] }>();
</script>

<template>
  <TresCanvas
    clear-color="#05080d"
    :tone-mapping="THREE.NoToneMapping"
    :antialias="true"
    :dpr="[1, 1.5]"
    power-preference="high-performance"
    @error="(e: Error) => emit('error', e.message)"
  >
    <HallScene />
  </TresCanvas>
</template>
