<script setup lang="ts">
import { computed } from 'vue';
import { detailFor } from './detail';
import { hover, pointer } from './selection';

const d = computed(() => (hover.value ? detailFor(hover.value) : null));
// Keep the tooltip on screen: flip to the left / above near the right and bottom edges.
const style = computed(() => {
  const { x, y } = pointer.value;
  const left = x > window.innerWidth - 260;
  const up = y > window.innerHeight - 260;
  return { left: `${left ? x - 14 : x + 16}px`, top: `${up ? y - 12 : y + 16}px`, transform: `translate(${left ? '-100%' : '0'}, ${up ? '-100%' : '0'})` };
});
</script>

<template>
  <Transition name="tip">
    <div v-if="d" class="tip mono" :style="style" role="tooltip">
      <div class="h">{{ d.title }}</div>
      <div class="s">{{ d.sub }}</div>
      <dl>
        <template v-for="r in d.rows" :key="r.k">
          <dt>{{ r.k }}</dt>
          <dd :class="r.tone">{{ r.v }}</dd>
        </template>
      </dl>
    </div>
  </Transition>
</template>

<style scoped>
.tip { position: fixed; z-index: 20; min-width: 190px; padding: var(--space-3) var(--space-4); background: color-mix(in srgb, var(--bg-2) 94%, transparent); border: 1px solid var(--line-strong); border-radius: var(--radius-3); box-shadow: 0 8px 28px rgb(0 0 0 / 0.55); pointer-events: none; backdrop-filter: blur(6px); }
.h { font-weight: 700; color: var(--accent); letter-spacing: 0.04em; text-transform: uppercase; font-size: var(--text-sm); }
.s { color: var(--fg-2); font-size: var(--text-xs); margin-bottom: var(--space-2); }
dl { display: grid; grid-template-columns: auto 1fr; gap: 2px var(--space-4); margin: 0; font-size: var(--text-sm); }
dt { color: var(--fg-2); }
dd { margin: 0; text-align: right; color: var(--fg-0); }
dd.ok { color: var(--ok); } dd.warn { color: var(--warn); } dd.alarm { color: var(--alarm); }
.tip-enter-active, .tip-leave-active { transition: opacity var(--dur-fast) var(--ease-out); }
.tip-enter-from, .tip-leave-to { opacity: 0; }
</style>
