<script setup lang="ts">
import { computed } from 'vue';
import PueGauge from './PueGauge.vue';
import { heatColor } from '../heat';
import { num } from '../fmt';
import { chunkStates, connection, dataAgeS, openChunks } from '../live/store';
import { useTagNumber, useTagString } from '../live/store';

defineProps<{ legend: boolean }>();
defineEmits<{ 'update:legend': [value: boolean] }>();

const it = useTagNumber('Hall/ITLoadKW');
const total = useTagNumber('Hall/TotalFacilityKW');
const cooling = useTagNumber('Hall/CoolingKW');
const losses = useTagNumber('Hall/LossesKW');
const cap = useTagNumber('Hall/CapacityKW');
const headroom = useTagNumber('Hall/HeadroomPct');
const outT = useTagNumber('Hall/OutdoorTempC');
const outH = useTagNumber('Hall/OutdoorHumidityPct');
const maxIn = useTagNumber('Hall/HallMaxInletC');
const avgIn = useTagNumber('Hall/HallAvgInletC');
const alarms = useTagNumber('Hall/ActiveAlarms');
const mode = useTagString('Hall/Mode');
const scenario = useTagString('_Sim_/Scenario');
const speed = useTagNumber('_Sim_/SpeedFactor');
const profile = useTagString('_Sim_/WorkloadProfile');

const MODE_TONE: Record<string, string> = {
  NORMAL: 'ok',
  ON_BATTERY: 'warn',
  ON_GENERATOR: 'info',
  THERMAL_EVENT: 'alarm',
  MIGRATION: 'violet',
};
const modeTone = computed(() => MODE_TONE[mode.value] ?? 'off');
const itFrac = computed(() => (cap.value > 0 ? Math.min(1, it.value / cap.value) : 0));
const pretty = (s: string) => (s ? s.replace(/_/g, ' ').toUpperCase() : '—');

const linkLabel = computed(() => {
  if (connection.value === 'closed') return 'OFFLINE';
  if (connection.value === 'connecting') return 'CONNECTING';
  return dataAgeS.value > 10 ? 'STALE' : 'LIVE';
});
const linkTone = computed(() => (connection.value === 'open' && dataAgeS.value <= 10 ? 'ok' : connection.value === 'closed' ? 'alarm' : 'warn'));
const age = computed(() => (Number.isFinite(dataAgeS.value) ? (dataAgeS.value < 10 ? dataAgeS.value.toFixed(1) : Math.round(dataAgeS.value).toString()) + ' s' : '—'));
</script>

<template>
  <header class="hud mono" :class="`mode-${modeTone}`">
    <div class="brand">
      <svg viewBox="0 0 24 24" class="logo" aria-hidden="true"><rect x="3" y="3" width="18" height="5" rx="1" /><rect x="3" y="10" width="18" height="5" rx="1" /><rect x="3" y="17" width="18" height="4" rx="1" /></svg>
      <div>
        <div class="title">Data Center</div>
        <div class="sub">Hall 1 &middot; Ignite showcase</div>
      </div>
    </div>

    <div class="tile">
      <div class="k">IT LOAD</div>
      <div class="v">{{ num(it, 0) }}<span class="u"> kW</span></div>
      <div class="meter"><i :style="{ transform: `scaleX(${itFrac})` }" /></div>
      <div class="s">of {{ num(cap, 0) }} kW design</div>
    </div>
    <div class="tile">
      <div class="k">FACILITY</div>
      <div class="v">{{ num(total, 0) }}<span class="u"> kW</span></div>
      <div class="s">cooling {{ num(cooling, 0) }} &middot; losses {{ num(losses, 0) }}</div>
    </div>
    <div class="tile gauge-tile">
      <div class="k">PUE <span class="thr">alarm 1.6</span></div>
      <PueGauge />
    </div>
    <div class="tile">
      <div class="k">HEADROOM</div>
      <div class="v">{{ num(headroom, 0) }}<span class="u"> %</span></div>
      <div class="s">capacity left</div>
    </div>
    <div class="tile">
      <div class="k">OUTDOOR</div>
      <div class="v">{{ num(outT, 1) }}<span class="u"> &deg;C</span></div>
      <div class="s">{{ num(outH, 0) }} % RH</div>
    </div>
    <div class="tile">
      <div class="k">HALL MAX INLET</div>
      <div class="v"><i class="swatch" :style="{ background: heatColor(maxIn) }" />{{ num(maxIn, 1) }}<span class="u"> &deg;C</span></div>
      <div class="s">avg {{ num(avgIn, 1) }} &deg;C</div>
    </div>
    <div class="tile">
      <div class="k">ALARMS</div>
      <div class="v" :class="{ hot: alarms > 0 }">{{ num(alarms, 0) }}</div>
      <div class="s">active</div>
    </div>

    <div class="spacer" />

    <div class="tile mode">
      <div class="k">HALL MODE</div>
      <div class="badge" :class="[modeTone, { pulse: modeTone === 'alarm' || modeTone === 'warn' }]">{{ pretty(mode) }}</div>
      <div class="chips">
        <span class="chip" title="Sim scenario">{{ pretty(scenario) }}</span>
        <span class="chip" title="Sim speed factor">{{ num(speed, 2).replace(/\.?0+$/, '') }}&times;</span>
        <span class="chip" title="Workload profile">{{ pretty(profile) }}</span>
      </div>
    </div>

    <div class="tile link" :title="chunkStates.join(', ')">
      <div class="k">SSE LINK</div>
      <div class="linkrow"><i class="dot" :class="linkTone" /><b>{{ linkLabel }}</b></div>
      <div class="s">{{ openChunks }}/{{ chunkStates.length }} streams &middot; {{ age }}</div>
    </div>

    <button class="toggle" :class="{ on: legend }" :aria-pressed="legend" @click="$emit('update:legend', !legend)">LEGEND</button>
  </header>
</template>

<style scoped>
.hud {
  position: fixed; left: 0; right: 0; top: 0; height: var(--hud-h); z-index: 10;
  display: flex; align-items: stretch; gap: var(--space-4);
  padding: 0 var(--space-4);
  background: linear-gradient(to bottom, var(--bg-1), color-mix(in srgb, var(--bg-0) 92%, transparent));
  border-bottom: 2px solid var(--line);
  transition: border-color var(--dur-slow);
  color: var(--fg-1); font-size: var(--text-sm);
}
.hud.mode-ok { border-bottom-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
.hud.mode-warn { border-bottom-color: var(--warn); }
.hud.mode-info { border-bottom-color: var(--info); }
.hud.mode-alarm { border-bottom-color: var(--alarm); }
.hud.mode-violet { border-bottom-color: var(--feed-b); }
.brand { display: flex; align-items: center; gap: var(--space-3); padding-right: var(--space-4); border-right: 1px solid var(--line); }
.logo { width: 30px; height: 30px; fill: none; stroke: var(--accent); stroke-width: 1.6; }
.title { color: var(--accent); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; font-size: var(--text-md); line-height: 1.1; }
.sub { color: var(--fg-2); font-size: var(--text-xs); letter-spacing: 0.04em; }
.tile { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 96px; }
.k { color: var(--fg-2); font-size: var(--text-xs); letter-spacing: 0.1em; }
.k .thr { color: var(--alarm); margin-left: 4px; letter-spacing: 0.04em; }
.v { color: var(--fg-0); font-size: var(--text-xl); font-weight: 600; line-height: 1.05; white-space: nowrap; }
.v .u { color: var(--fg-2); font-size: var(--text-sm); font-weight: 400; }
.v.hot { color: var(--alarm); }
.s { color: var(--fg-2); font-size: var(--text-xs); white-space: nowrap; }
.meter { height: 4px; border-radius: 2px; background: var(--bg-3); overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--accent); transform-origin: left; transition: transform var(--dur-slow) var(--ease-out); }
.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 8px; vertical-align: 1px; transition: background var(--dur-scene) linear; }
.gauge-tile { min-width: 150px; justify-content: flex-start; padding-top: 6px; }
.gauge-tile .k { margin-bottom: -4px; }
.spacer { flex: 1; }
.mode { min-width: 230px; gap: 5px; }
.badge { align-self: flex-start; padding: 2px 12px; border-radius: var(--radius-2); font-weight: 700; letter-spacing: 0.08em; font-size: var(--text-md); border: 1px solid currentColor; }
.badge.ok { color: var(--ok); background: color-mix(in srgb, var(--ok) 14%, transparent); }
.badge.warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 16%, transparent); }
.badge.info { color: var(--info); background: color-mix(in srgb, var(--info) 16%, transparent); }
.badge.alarm { color: var(--alarm); background: color-mix(in srgb, var(--alarm) 16%, transparent); }
.badge.violet { color: var(--feed-b); background: color-mix(in srgb, var(--feed-b) 16%, transparent); }
.badge.off { color: var(--fg-2); }
.badge.pulse { animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.55; } }
.chips { display: flex; gap: 6px; }
.chip { padding: 1px 7px; border-radius: 10px; background: var(--bg-3); color: var(--fg-1); font-size: var(--text-xs); letter-spacing: 0.04em; white-space: nowrap; }
.link { min-width: 150px; }
.linkrow { display: flex; align-items: center; gap: var(--space-2); color: var(--fg-0); letter-spacing: 0.06em; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--fg-2); }
.dot.ok { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
.dot.warn { background: var(--warn); }
.dot.alarm { background: var(--alarm); }
.toggle { align-self: center; font: 600 var(--text-xs) var(--font-mono); letter-spacing: 0.1em; color: var(--fg-1); background: var(--bg-2); border: 1px solid var(--line-strong); border-radius: var(--radius-2); padding: 6px 12px; cursor: pointer; }
.toggle.on { color: var(--accent); border-color: var(--accent); }
.toggle:hover { background: var(--bg-3); }
</style>
