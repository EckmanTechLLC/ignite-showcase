<script setup lang="ts">
import { computed } from 'vue';
import Badge from '../Badge.vue';
import Bar from '../Bar.vue';
import Flow from '../Flow.vue';
import { clamp01, clock, num, type Tone } from '../fmt';
import { PDU_W, PDU_X, POWER_BOX, BAND_TOP, pduY } from '../layout';
import { useTagNumber, useTagString } from '../live/store';
import { hover, selection } from '../selection';
import { atsLive, atsPosition, flowSpeed, genKW, genPathLive, genState, pdus, upsA, upsB, utilityAvailable, utilityKW, utilityPathLive } from './state';

const SRC = '#a9c7ff';
const GEN = '#fbbf24';
const FEED_A = 'var(--feed-a)';
const FEED_B = 'var(--feed-b)';

const volts = useTagNumber('Power/Utility/VoltageV');
const hz = useTagNumber('Power/Utility/FrequencyHz');
const fuel = useTagNumber('Power/Generator/FuelPct');
const hours = useTagNumber('Power/Generator/RunHours');
const countdown = useTagNumber('Power/Generator/StartCountdownS');
const feedLabel = (f: 'A' | 'B', n: number) => useTagString(`Power/PDU/${f}${n}/Feed`);

const utilOk = computed(() => utilityAvailable.value === true);
const genTone = computed<Tone>(() => (genState.value === 'RUNNING' ? 'ok' : genState.value === 'STARTING' ? 'warn' : genState.value === 'COOLDOWN' ? 'info' : 'off'));
const atsTone = computed<Tone>(() => (atsPosition.value === 'UTILITY' ? 'ok' : atsPosition.value === 'GENERATOR' ? 'warn' : 'alarm'));
const lever = computed(() => (atsPosition.value === 'UTILITY' ? -24 : atsPosition.value === 'GENERATOR' ? 24 : 0));
const trunkColor = computed(() => (atsPosition.value === 'GENERATOR' ? GEN : SRC));
const trunkKW = computed(() => (upsA.loadKW.value || 0) + (upsB.loadKW.value || 0));
const upsTone = (s: string): Tone => (s === 'ONLINE' ? 'ok' : s === 'BATTERY' ? 'warn' : s === 'BYPASS' ? 'info' : 'alarm');
const socColor = (v: number) => (v < 20 ? 'var(--alarm)' : v < 50 ? 'var(--warn)' : 'var(--ok)');
const loadColor = (v: number) => (v >= 100 ? 'var(--alarm)' : v >= 90 ? 'var(--warn)' : 'var(--accent)');

const ups = [
  { id: 'A' as const, u: upsA, x: 246, y: 190, cy: 260, color: FEED_A },
  { id: 'B' as const, u: upsB, x: 246, y: 380, cy: 450, color: FEED_B },
];
const pduCards = (['A', 'B'] as const).flatMap((f) =>
  [1, 2, 3].map((n) => ({ id: `${f}${n}`, f, n, k: n - 1, p: pdus[f][n - 1], y: pduY(f, n - 1), feed: feedLabel(f, n) })),
);
const yOut = (f: 'A' | 'B', k: number) => BAND_TOP[k] + (f === 'A' ? 34 : 110);

const isSel = (kind: string, id: string) => selection.value?.kind === kind && selection.value.id === id;
const isHov = (kind: string, id: string) => hover.value?.kind === kind && hover.value.id === id;
</script>

<template>
  <g class="power">
    <rect class="panel" :x="POWER_BOX.x" :y="POWER_BOX.y" :width="POWER_BOX.w" :height="POWER_BOX.h" rx="8" />
    <text class="ptitle" x="20" y="79">POWER CHAIN &middot; A / B</text>

    <!-- conductors (drawn first; later ones hop over earlier ones) -->
    <Flow d="M128,160 H186 V280" :color="SRC" :speed="flowSpeed(utilityKW)" :active="utilityPathLive" :width="3" />
    <Flow d="M128,494 H186 V370" :color="GEN" :speed="flowSpeed(genKW)" :active="genPathLive" :width="3" />
    <Flow d="M226,325 H236" :color="trunkColor" :speed="flowSpeed(trunkKW)" :active="atsLive" :width="3" />
    <Flow d="M236,325 V260 H246" :color="trunkColor" :speed="flowSpeed(upsA.loadKW.value)" :active="upsA.inputLive.value" :width="3" />
    <Flow d="M236,325 V450 H246" :color="trunkColor" :speed="flowSpeed(upsB.loadKW.value)" :active="upsB.inputLive.value" :width="3" />
    <!-- UPS outputs and PDU drops: B first so the A conductors hop over it -->
    <Flow d="M350,450 H366 V214" :color="FEED_B" :speed="flowSpeed(upsB.loadKW.value)" :active="upsB.outputLive.value" :width="3" />
    <Flow d="M366,450 V570" :color="FEED_B" :speed="flowSpeed(upsB.loadKW.value)" :active="upsB.outputLive.value" :width="3" />
    <Flow v-for="n in 3" :key="`bd${n}`" :d="`M366,${yOut('B', n - 1)} H${PDU_X}`" :color="FEED_B" :speed="flowSpeed(pdus.B[n - 1].loadKW.value)" :active="pdus.B[n - 1].live.value" :width="2.4" dash="4 6" />
    <Flow d="M350,260 H354 V138" :color="FEED_A" :speed="flowSpeed(upsA.loadKW.value)" :active="upsA.outputLive.value" :width="3" />
    <Flow d="M354,260 V494" :color="FEED_A" :speed="flowSpeed(upsA.loadKW.value)" :active="upsA.outputLive.value" :width="3" />
    <Flow v-for="n in 3" :key="`ad${n}`" :d="`M354,${yOut('A', n - 1)} H${PDU_X}`" :color="FEED_A" :speed="flowSpeed(pdus.A[n - 1].loadKW.value)" :active="pdus.A[n - 1].live.value" :width="2.4" dash="4 6" />

    <!-- Utility -->
    <g class="card" :class="[utilOk ? 'ok' : 'alarm', { sel: isSel('utility', ''), hov: isHov('utility', '') }]" transform="translate(16 104)" data-kind="utility" data-id="">
      <rect class="bg" width="112" height="112" rx="5" />
      <text class="name" x="8" y="17">UTILITY</text>
      <Badge :x="8" :y="24" :text="utilOk ? 'AVAILABLE' : 'LOST'" :tone="utilOk ? 'ok' : 'alarm'" :pulse="!utilOk && utilityAvailable !== null" />
      <text class="k" x="8" y="60">VOLT</text><text class="v" x="104" y="60" text-anchor="end">{{ num(volts, 0) }} V</text>
      <text class="k" x="8" y="78">FREQ</text><text class="v" x="104" y="78" text-anchor="end">{{ num(hz, 2) }} Hz</text>
      <text class="k" x="8" y="96">LOAD</text><text class="v" x="104" y="96" text-anchor="end">{{ num(utilityKW, 0) }} kW</text>
    </g>

    <!-- Generator -->
    <g class="card" :class="[genState === 'RUNNING' ? 'ok' : genState === 'STARTING' ? 'warn' : '', { sel: isSel('generator', ''), hov: isHov('generator', '') }]" transform="translate(16 430)" data-kind="generator" data-id="">
      <rect class="bg" width="112" height="128" rx="5" />
      <text class="name" x="8" y="17">GENERATOR</text>
      <Badge :x="8" :y="24" :text="genState || '—'" :tone="genTone" :pulse="genState === 'STARTING'" />
      <text class="k" x="8" y="60">FUEL</text><text class="v" x="104" y="60" text-anchor="end">{{ num(fuel, 0) }} %</text>
      <Bar :x="8" :y="65" :w="96" :value="fuel / 100" :color="fuel < 20 ? 'var(--alarm)' : 'var(--accent)'" />
      <text class="k" x="8" y="88">OUTPUT</text><text class="v" x="104" y="88" text-anchor="end">{{ num(genKW, 0) }} kW</text>
      <text class="k" x="8" y="106">{{ genState === 'STARTING' ? 'START IN' : 'RUN HRS' }}</text>
      <text class="v" :class="{ hot: genState === 'STARTING' }" x="104" y="106" text-anchor="end">{{ genState === 'STARTING' ? clock(countdown) : num(hours, 0) }}</text>
    </g>

    <!-- Switchgear / ATS -->
    <g class="card" :class="[atsTone, { sel: isSel('ats', ''), hov: isHov('ats', '') }]" transform="translate(146 280)" data-kind="ats" data-id="">
      <rect class="bg" width="80" height="90" rx="5" />
      <text class="name" x="8" y="15">ATS</text>
      <g class="sw">
        <circle cx="12" cy="30" r="3" class="contact" :class="{ on: atsPosition === 'UTILITY' }" />
        <circle cx="12" cy="62" r="3" class="contact" :class="{ on: atsPosition === 'GENERATOR' }" />
        <g transform="translate(64 46)">
          <g class="lever" :style="{ transform: `rotate(${lever}deg)` }"><line x1="0" y1="0" x2="-48" y2="0" /></g>
          <circle r="4" class="pivot" />
        </g>
      </g>
      <text class="k" x="16" y="34">U</text><text class="k" x="16" y="66">G</text>
      <text class="pos" x="40" y="83" text-anchor="middle" :class="atsTone">{{ atsPosition || '—' }}</text>
    </g>

    <!-- UPS A / B -->
    <g v-for="c in ups" :key="c.id" class="card" :class="[c.u.state.value === 'ONLINE' ? 'ok' : c.u.state.value === 'BATTERY' ? 'warn' : c.u.state.value ? 'alarm' : '', { sel: isSel('ups', c.id), hov: isHov('ups', c.id) }]" :transform="`translate(${c.x} ${c.y})`" data-kind="ups" :data-id="c.id">
      <rect class="bg" width="104" :height="c.id === 'A' ? 140 : 140" rx="5" />
      <rect class="stripe" width="4" height="140" rx="2" :style="{ fill: c.color }" />
      <text class="name" x="12" y="17">UPS {{ c.id }}</text>
      <Badge :x="12" :y="24" :text="c.u.state.value || '—'" :tone="upsTone(c.u.state.value)" :pulse="c.u.state.value === 'BATTERY'" />
      <text class="k" x="12" y="60">LOAD</text><text class="v" x="98" y="60" text-anchor="end">{{ num(c.u.loadKW.value, 0) }} kW</text>
      <Bar :x="12" :y="65" :w="86" :value="clamp01(c.u.loadPct.value / 100)" :color="loadColor(c.u.loadPct.value)" />
      <text class="k" x="12" y="88">BATT</text><text class="v" x="98" y="88" text-anchor="end">{{ num(c.u.soc.value, 0) }} %</text>
      <Bar :x="12" :y="93" :w="86" :value="clamp01(c.u.soc.value / 100)" :color="socColor(c.u.soc.value)" />
      <text class="k" x="12" y="116">RUN</text>
      <text class="v" :class="{ hot: c.u.state.value === 'BATTERY' }" x="98" y="116" text-anchor="end">{{ num(c.u.runtime.value, 1) }} min</text>
      <text class="k" x="12" y="132">LOAD %</text><text class="v" x="98" y="132" text-anchor="end">{{ num(c.u.loadPct.value, 0) }} %</text>
    </g>

    <!-- PDUs -->
    <g v-for="c in pduCards" :key="c.id" class="card" :class="[c.p.tripped.value ? 'alarm' : c.p.loadPct.value >= 90 ? 'warn' : '', { sel: isSel('pdu', c.id), hov: isHov('pdu', c.id) }]" :transform="`translate(${PDU_X} ${c.y})`" data-kind="pdu" :data-id="c.id">
      <rect class="bg" :width="PDU_W" height="68" rx="5" />
      <rect class="stripe" width="4" height="68" rx="2" :style="{ fill: c.f === 'A' ? FEED_A : FEED_B }" />
      <text class="name" x="12" y="16">PDU {{ c.id }}</text>
      <text class="k" x="112" y="16" text-anchor="end">{{ c.feed.value }}</text>
      <text class="v big" x="12" y="38">{{ num(c.p.loadKW.value, 0) }}<tspan class="u"> kW</tspan></text>
      <text class="v" x="112" y="38" text-anchor="end" :class="{ hot: c.p.loadPct.value >= 90 }">{{ num(c.p.loadPct.value, 0) }}%</text>
      <Bar :x="12" :y="44" :w="100" :value="clamp01(c.p.loadPct.value / 100)" :color="loadColor(c.p.loadPct.value)" />
      <g :class="c.p.tripped.value ? 'brk trip' : 'brk'" transform="translate(12 57)">
        <circle r="2.6" cx="2" cy="0" class="led" />
        <text x="9" y="3.5">{{ c.p.tripped.value ? 'BREAKER TRIPPED' : 'BREAKER CLOSED' }}</text>
      </g>
    </g>
  </g>
</template>

<style scoped>
.panel { fill: color-mix(in srgb, var(--bg-1) 86%, transparent); stroke: var(--line); stroke-width: 1.2; }
.ptitle { font: 600 11px var(--font-mono); fill: var(--fg-2); letter-spacing: 0.1em; }
.card { cursor: pointer; }
.bg { fill: var(--bg-2); stroke: var(--line-strong); stroke-width: 1.2; transition: stroke var(--dur-base); }
.ok .bg { stroke: color-mix(in srgb, var(--ok) 45%, var(--line-strong)); }
.warn .bg { stroke: var(--warn); }
.alarm .bg { stroke: var(--alarm); }
.hov .bg { stroke: #fff; }
.sel .bg { stroke: var(--accent); stroke-width: 2.4; }
.sel { filter: drop-shadow(0 0 6px var(--accent)); }
.stripe { opacity: 0.9; }
.name { font: 700 11px var(--font-mono); fill: var(--fg-0); letter-spacing: 0.06em; pointer-events: none; }
.k { font: 500 9.5px var(--font-mono); fill: var(--fg-2); letter-spacing: 0.06em; pointer-events: none; }
.v { font: 500 11px var(--font-mono); fill: var(--fg-0); pointer-events: none; }
.v.big { font-size: 15px; font-weight: 600; }
.v .u { font-size: 9px; fill: var(--fg-2); }
.v.hot { fill: var(--warn); }
.sw .contact { fill: var(--bg-3); stroke: var(--line-strong); transition: fill var(--dur-base); }
.sw .contact.on { fill: var(--ok); stroke: var(--ok); }
.lever { transition: transform var(--dur-slow) var(--ease-in-out); }
.lever line { stroke: var(--fg-0); stroke-width: 3; stroke-linecap: round; }
.pivot { fill: var(--bg-0); stroke: var(--fg-0); stroke-width: 2; }
.pos { font: 700 10px var(--font-mono); letter-spacing: 0.06em; }
.pos.ok { fill: var(--ok); } .pos.warn { fill: var(--warn); } .pos.alarm { fill: var(--alarm); }
.brk { font: 500 8.5px var(--font-mono); fill: var(--fg-2); }
.brk .led { fill: var(--ok); }
.brk.trip { fill: var(--alarm); }
.brk.trip .led { fill: var(--alarm); animation: blink 0.8s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0.2; } }
</style>
