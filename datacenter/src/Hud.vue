<script setup lang="ts">
import type { ConnectionState } from '@ignite/client';

defineProps<{
  gatewayUrl: string;
  site: string;
  state: ConnectionState;
  path: string;
  value: unknown;
}>();
</script>

<template>
  <header class="hud mono">
    <span class="title">Data Center</span>
    <span>gateway <b>{{ gatewayUrl || 'same-origin' }}</b></span>
    <span>site <b>{{ site || '-' }}</b></span>
    <span><i :class="['dot', state]" />sse <b>{{ state }}</b></span>
    <span>{{ path }} <b class="value">{{ value === null || value === undefined ? '-' : String(value) }}</b></span>
  </header>
</template>
