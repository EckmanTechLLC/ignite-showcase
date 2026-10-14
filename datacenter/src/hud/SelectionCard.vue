<script setup lang="ts">
import { computed } from 'vue';
import { detailFor } from '../detail';
import { selection } from '../selection';

const d = computed(() => (selection.value ? detailFor(selection.value) : null));
</script>

<template>
  <section v-if="d" class="card mono" aria-label="Selected item" aria-live="polite">
    <header><b>{{ d.title }}</b><span>{{ d.sub }}</span></header>
    <dl>
      <template v-for="r in d.rows" :key="r.k"><dt>{{ r.k }}</dt><dd :class="r.tone">{{ r.v }}</dd></template>
    </dl>
    <p>Esc or click empty space to clear</p>
  </section>
</template>

<style scoped>
.card { width: 292px; padding: var(--space-3) var(--space-4); background: color-mix(in srgb, var(--bg-1) 90%, transparent); border: 1px solid var(--accent); border-radius: var(--radius-3); backdrop-filter: blur(6px); font-size: var(--text-xs); }
header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 6px; }
header b { color: var(--accent); font-size: var(--text-sm); letter-spacing: 0.06em; text-transform: uppercase; }
header span { color: var(--fg-2); text-align: right; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 1px var(--space-4); margin: 0; }
dt { color: var(--fg-2); }
dd { margin: 0; text-align: right; color: var(--fg-0); }
dd.ok { color: var(--ok); } dd.warn { color: var(--warn); } dd.alarm { color: var(--alarm); }
p { margin: 6px 0 0; color: var(--fg-2); font-size: 9px; }
</style>
