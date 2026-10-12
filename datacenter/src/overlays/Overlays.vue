<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, watch } from 'vue';
import AlarmBoard from './alarms/AlarmBoard.vue';
import ControlsPanel from './controls/ControlsPanel.vue';
import IdentityPanel from './identity/IdentityPanel.vue';
import { TIER_LABEL, startAuth, tier } from './identity/auth';
import { startAlarms, activeRows, hasCritical } from './alarms/store';
import { panel, togglePanel, toasts, type PanelKey } from './ui';
import { selection } from '../selection';

// The charting code (ECharts) only loads when the Trends panel is first opened.
const TrendsPanel = defineAsyncComponent(() => import('./trends/TrendsPanel.vue'));
const HelpPanel = defineAsyncComponent(() => import('./HelpPanel.vue'));

const DOCK: { key: PanelKey; hot: string; label: string }[] = [
  { key: 'alarms', hot: 'A', label: 'Alarms' },
  { key: 'trends', hot: 'T', label: 'Trends' },
  { key: 'controls', hot: 'C', label: 'Controls' },
  { key: 'identity', hot: 'L', label: 'Login' },
  { key: 'help', hot: '?', label: 'Help' },
];

function onKey(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  const k = e.key.toLowerCase();
  const hit = DOCK.find((d) => d.hot.toLowerCase() === k);
  if (hit) togglePanel(hit.key);
  else if (e.key === 'Escape' && panel.value && !selection.value) panel.value = null;
}
onMounted(() => {
  startAuth();
  if (new URLSearchParams(location.search).has('about')) panel.value = 'help';
  startAlarms();
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

// Click-to-trend: picking a chartable item opens Trends when no other panel is in the way.
watch(selection, (s) => {
  if (s && !panel.value && ['rack', 'crah', 'ups', 'pdu'].includes(s.kind)) panel.value = 'trends';
});
</script>

<template>
  <nav class="dock mono" aria-label="Overlays">
    <button
      v-for="d in DOCK" :key="d.key" :class="{ on: panel === d.key, crit: d.key === 'alarms' && hasCritical }"
      :aria-pressed="panel === d.key" :title="`${d.label} (${d.hot})`" @click="togglePanel(d.key)"
    >
      <b>{{ d.hot }}</b><span>{{ d.label }}</span>
      <i v-if="d.key === 'alarms' && activeRows.length" class="n">{{ activeRows.length }}</i>
    </button>
    <div class="tier" :class="tier" title="Session tier">{{ TIER_LABEL[tier] }}</div>
  </nav>

  <AlarmBoard v-if="panel === 'alarms'" />
  <TrendsPanel v-else-if="panel === 'trends'" />
  <ControlsPanel v-else-if="panel === 'controls'" />
  <IdentityPanel v-else-if="panel === 'identity'" />
  <HelpPanel v-else-if="panel === 'help'" />

  <div class="toasts mono" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.tone">{{ t.text }}</div>
  </div>
</template>

<style scoped>
.dock { position: fixed; z-index: 21; right: 0; top: calc(var(--hud-h) + var(--space-2)); width: 46px; display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
.dock button { position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 6px 0; background: var(--bg-1); border: 1px solid var(--line-strong); border-right: 0; border-radius: var(--radius-3) 0 0 var(--radius-3); color: var(--fg-1); cursor: pointer; }
.dock button b { font-size: var(--text-md); color: var(--accent); }
.dock button span { font-size: 9px; letter-spacing: 0.04em; }
.dock button.on { background: var(--bg-3); border-color: var(--accent); color: var(--fg-0); }
.dock button:hover { background: var(--bg-2); }
.dock button.crit { border-color: var(--alarm); animation: crit 1.2s ease-in-out infinite; }
.dock .n { position: absolute; top: -5px; left: -5px; min-width: 16px; height: 16px; border-radius: 8px; background: var(--alarm); color: #fff; font: 700 10px/16px var(--font-mono); font-style: normal; text-align: center; }
.tier { margin-top: 4px; font-size: 9px; text-align: center; letter-spacing: 0.06em; color: var(--fg-2); text-transform: uppercase; }
.tier.operator { color: var(--ok); } .tier.director { color: var(--feed-b); } .tier.viewer { color: var(--info); }
@keyframes crit { 50% { box-shadow: 0 0 12px var(--alarm); } }
.toasts { position: fixed; z-index: 30; left: 50%; bottom: var(--space-4); transform: translateX(-50%); display: grid; gap: 6px; justify-items: center; pointer-events: none; }
.toast { padding: 6px 14px; background: var(--bg-2); border: 1px solid var(--line-strong); border-left-width: 4px; border-radius: var(--radius-2); color: var(--fg-0); font-size: var(--text-sm); box-shadow: 0 6px 20px rgb(0 0 0 / 0.5); }
.toast.ok { border-left-color: var(--ok); } .toast.warn { border-left-color: var(--warn); } .toast.alarm { border-left-color: var(--alarm); } .toast.info { border-left-color: var(--info); }
</style>
