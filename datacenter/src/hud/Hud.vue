<script setup lang="ts">
import { computed } from 'vue';
import PueRing from './PueRing.vue';
import Legend from './Legend.vue';
import SelectionCard from './SelectionCard.vue';
import { heatColor } from '../heat';
import { num } from '../fmt';
import { hasCritical } from '../overlays/alarms/store';
import { TIER_LABEL, method, tier, user } from '../overlays/identity/auth';
import { panel, togglePanel } from '../overlays/ui';
import { connection, dataAgeS, historyHealth, tagCount, trialText, useTagNumber, useTagString } from '../live/store';
import { PRESETS, activePreset, presetRequest } from '../hall3d/presets';

defineProps<{ legend: boolean }>();
defineEmits<{ 'update:legend': [value: boolean] }>();

const it = useTagNumber('Hall/ITLoadKW');
const total = useTagNumber('Hall/TotalFacilityKW');
const cap = useTagNumber('Hall/CapacityKW');
const maxIn = useTagNumber('Hall/HallMaxInletC');
const alarms = useTagNumber('Hall/ActiveAlarms');
const mode = useTagString('Hall/Mode');
const scenario = useTagString('_Sim_/Scenario');
const speed = useTagNumber('_Sim_/SpeedFactor');
const profile = useTagString('_Sim_/WorkloadProfile');

const MODE_TONE: Record<string, string> = { NORMAL: 'ok', ON_BATTERY: 'warn', ON_GENERATOR: 'info', THERMAL_EVENT: 'alarm', MIGRATION: 'violet' };
const modeTone = computed(() => MODE_TONE[mode.value] ?? 'off');
const itFrac = computed(() => (cap.value > 0 ? Math.min(1, it.value / cap.value) : 0));
const pretty = (s: string) => (s ? s.replace(/_/g, ' ').toUpperCase() : '—');

const linkLabel = computed(() => {
  if (connection.value === 'closed') return 'RECONNECTING';
  if (connection.value === 'connecting') return 'CONNECTING';
  return dataAgeS.value > 10 ? 'STALE' : 'LIVE';
});
const linkTone = computed(() => (connection.value === 'open' && dataAgeS.value <= 10 ? 'ok' : connection.value === 'closed' ? 'alarm' : 'warn'));
const age = computed(() => (Number.isFinite(dataAgeS.value) ? (dataAgeS.value < 10 ? dataAgeS.value.toFixed(1) : Math.round(dataAgeS.value).toString()) + ' s' : '—'));
const who = computed(() => (user.value ? `${TIER_LABEL[tier.value]} · ${user.value}` : TIER_LABEL[tier.value]));
</script>

<template>
  <header class="hud mono" :class="`mode-${modeTone}`">
    <div class="strip tl">
      <div class="brand">
        <div class="title">Data Center</div>
        <div class="sub">Hall 1</div>
      </div>
      <PueRing />
      <div class="kw">
        <div class="k">IT</div>
        <div class="v">{{ num(it, 0) }}<span class="u"> kW</span></div>
        <div class="meter" :title="`${num(it, 0)} of ${num(cap, 0)} kW design`"><i :style="{ transform: `scaleX(${itFrac})` }" /></div>
      </div>
      <div class="kw">
        <div class="k">FACILITY</div>
        <div class="v">{{ num(total, 0) }}<span class="u"> kW</span></div>
      </div>
    </div>

    <div class="strip tr">
      <span class="badge" :class="[modeTone, { pulse: modeTone === 'alarm' || modeTone === 'warn' }]" title="Hall mode">{{ pretty(mode) }}</span>
      <span class="chip" title="Sim scenario">{{ pretty(scenario) }}</span>
      <span class="chip" title="Sim speed factor">{{ num(speed, 2).replace(/\.?0+$/, '') }}&times;</span>
      <span class="chip prof" title="Workload profile">{{ pretty(profile) }}</span>
      <i class="sep" />
      <button class="chip btn alarms" :class="{ crit: hasCritical, hot: alarms > 0 }" title="Alarm board (A)" @click="togglePanel('alarms')">
        <span class="lab">ALARMS</span> {{ num(alarms, 0) }}
      </button>
      <span class="chip" title="Hall max inlet temperature"><i class="swatch" :style="{ background: heatColor(maxIn) }" />MAX IN {{ num(maxIn, 1) }}&deg;</span>
      <span class="chip link" :title="historyHealth === 'unavailable' ? 'Trial expired — history/alarms paused' : trialText">
        <i class="dot" :class="linkTone" /><b>{{ linkLabel }}</b>
        <span class="lab">{{ tagCount ? `live · ${tagCount} tags · ` : '' }}{{ age }}</span>
      </span>
      <span v-if="historyHealth === 'unavailable'" class="chip note" role="status">Trial expired &mdash; history/alarms paused</span>
      <button class="chip btn" :title="method === 'web' ? `Gateway session: ${user}` : 'Identity (L)'" @click="panel = 'identity'">{{ who }}</button>
      <button class="chip btn toggle" :class="{ on: legend }" :aria-pressed="legend" @click="$emit('update:legend', !legend)">LEGEND</button>
    </div>

    <div class="strip bl">
      <SelectionCard />
      <Legend v-if="legend" />
    </div>

    <nav class="strip cam" aria-label="Camera presets">
      <button v-for="(p, i) in PRESETS" :key="p.key" class="chip btn" :class="{ on: activePreset === i }" :aria-pressed="activePreset === i" :title="`${p.name} (${p.key})`" @click="presetRequest = { i }">
        <b>{{ p.key }}</b> {{ p.name }}
      </button>
      <button class="chip btn" title="Reset camera (R)" @click="presetRequest = { i: 0 }"><b>R</b> Reset</button>
    </nav>
  </header>
</template>

<style scoped>
.hud { position: fixed; inset: 0; z-index: 10; pointer-events: none; color: var(--fg-1); font-size: var(--text-sm); }
.strip { position: absolute; display: flex; align-items: center; gap: var(--space-3); pointer-events: auto; }
.tl { left: var(--space-3); top: var(--space-2); padding: 4px var(--space-4) 4px var(--space-3); background: linear-gradient(to right, color-mix(in srgb, var(--bg-1) 92%, transparent), color-mix(in srgb, var(--bg-1) 55%, transparent)); border: 1px solid var(--line); border-radius: var(--radius-3); backdrop-filter: blur(6px); }
.hud.mode-ok .tl { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
.hud.mode-warn .tl { border-color: var(--warn); }
.hud.mode-info .tl { border-color: var(--info); }
.hud.mode-alarm .tl { border-color: var(--alarm); }
.hud.mode-violet .tl { border-color: var(--feed-b); }
.tr { right: 62px; top: var(--space-2); flex-wrap: wrap; justify-content: flex-end; gap: 6px; max-width: calc(100vw - 510px); min-width: 0; padding: 4px 0; }
.bl { left: var(--space-3); bottom: var(--space-3); flex-direction: column; align-items: flex-start; }
.cam { left: 50%; bottom: var(--space-3); transform: translateX(-50%); gap: 6px; }
.brand { padding-right: var(--space-3); border-right: 1px solid var(--line); }
.title { color: var(--accent); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; font-size: var(--text-md); line-height: 1.1; white-space: nowrap; }
.sub { color: var(--fg-2); font-size: var(--text-xs); letter-spacing: 0.04em; }
.kw { min-width: 78px; }
.k { color: var(--fg-2); font-size: var(--text-xs); letter-spacing: 0.1em; }
.v { color: var(--fg-0); font-size: var(--text-lg); font-weight: 600; line-height: 1.1; white-space: nowrap; }
.v .u { color: var(--fg-2); font-size: var(--text-xs); font-weight: 400; }
.meter { height: 3px; margin-top: 2px; border-radius: 2px; background: var(--bg-3); overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--accent); transform-origin: left; transition: transform var(--dur-slow) var(--ease-out); }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 12px; background: color-mix(in srgb, var(--bg-2) 88%, transparent); border: 1px solid var(--line); color: var(--fg-1); font: 500 var(--text-xs) var(--font-mono); letter-spacing: 0.04em; white-space: nowrap; backdrop-filter: blur(6px); }
.chip .lab { color: var(--fg-2); }
.chip.btn { cursor: pointer; }
.chip.btn:hover { background: var(--bg-3); }
.chip.btn b { color: var(--accent); }
.chip.on, .chip.toggle.on { color: var(--accent); border-color: var(--accent); }
.chip.alarms.hot { color: var(--alarm); border-color: var(--alarm); }
.chip.alarms.hot .lab { color: var(--alarm); }
.chip.alarms.crit { animation: pulse 1s ease-in-out infinite; font-weight: 700; }
.chip.note { color: var(--warn); border-color: var(--warn); white-space: normal; }
.chip.link b { color: var(--fg-0); letter-spacing: 0.06em; }
.swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; transition: background var(--dur-scene) linear; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--fg-2); }
.dot.ok { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
.dot.warn { background: var(--warn); }
.dot.alarm { background: var(--alarm); }
.sep { width: 1px; height: 16px; background: var(--line-strong); margin: 0 2px; }
.badge { padding: 2px 11px; border-radius: var(--radius-2); font-weight: 700; letter-spacing: 0.08em; font-size: var(--text-sm); border: 1px solid currentColor; backdrop-filter: blur(6px); }
.badge.ok { color: var(--ok); background: color-mix(in srgb, var(--ok) 14%, var(--bg-1)); }
.badge.warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 16%, var(--bg-1)); }
.badge.info { color: var(--info); background: color-mix(in srgb, var(--info) 16%, var(--bg-1)); }
.badge.alarm { color: var(--alarm); background: color-mix(in srgb, var(--alarm) 16%, var(--bg-1)); }
.badge.violet { color: var(--feed-b); background: color-mix(in srgb, var(--feed-b) 16%, var(--bg-1)); }
.badge.off { color: var(--fg-2); background: var(--bg-1); }
.badge.pulse { animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.55; } }
@media (max-width: 1500px) {
  .chip.prof { display: none; }
  .tr { max-width: calc(100vw - 500px); }
  .brand .sub { display: none; }
  .chip { padding: 2px 7px; }
}
</style>
