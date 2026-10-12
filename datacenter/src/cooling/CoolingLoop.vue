<script setup lang="ts">
import { computed } from 'vue';
import Badge from '../Badge.vue';
import Bar from '../Bar.vue';
import Flow from '../Flow.vue';
import { clamp01, num, type Tone } from '../fmt';
import { COOL_BOX, crahCy } from '../layout';
import { waterColor } from '../heat';
import { useTagNumber, useTagString } from '../live/store';
import { hover, selection } from '../selection';

const flow = useTagNumber('Cooling/Loop/FlowLps');
const dT = useTagNumber('Cooling/Loop/DeltaT');
const coolKW = useTagNumber('Hall/CoolingKW');

function chiller(n: number) {
  const p = `Cooling/Chiller/${n}/`;
  const state = useTagString(p + 'State');
  const supply = useTagNumber(p + 'SupplyC');
  const ret = useTagNumber(p + 'ReturnC');
  const kw = useTagNumber(p + 'KW');
  const cop = useTagNumber(p + 'COP');
  const tone = computed<Tone>(() => (state.value === 'RUN' ? 'ok' : state.value === 'STANDBY' ? 'info' : 'alarm'));
  return { n, state, supply, ret, kw, cop, tone, run: computed(() => state.value === 'RUN') };
}
const chillers = [chiller(1), chiller(2)];

function crah(n: number) {
  const p = `Cooling/CRAH/${n}/`;
  const state = useTagString(p + 'State');
  const fan = useTagNumber(p + 'FanPct');
  const supply = useTagNumber(p + 'SupplyC');
  const ret = useTagNumber(p + 'ReturnC');
  const kw = useTagNumber(p + 'KW');
  const zone = useTagString(p + 'Zone');
  const tone = computed<Tone>(() => (state.value === 'RUN' ? 'ok' : state.value === 'FAULT' ? 'alarm' : 'off'));
  return { n, state, fan, supply, ret, kw, zone, tone, cy: crahCy(n), h: n === 4 ? 60 : 84 };
}
const crahs = [1, 2, 3, 4].map(crah);

// Coolant colour drifts cold -> warm over time when the chillers stop making cold water.
const mean = (xs: number[]) => {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : Number.NaN;
};
const supplyC = computed(() => mean(chillers.map((c) => c.supply.value)));
const returnC = computed(() => mean(chillers.map((c) => c.ret.value)));
const supplyColor = computed(() => waterColor(supplyC.value));
const returnColor = computed(() => waterColor(returnC.value));
const loopLive = computed(() => flow.value > 0.5);
const loopSpeed = computed(() => (Number.isFinite(flow.value) ? 12 + flow.value * 3 : 0));

const SUP_X = 1520;
const RET_X = 1532;
const CX = [
  { sup: 1600, ret: 1680 },
  { sup: 1780, ret: 1860 },
];
const isSel = (kind: string, id: string) => selection.value?.kind === kind && selection.value.id === id;
const isHov = (kind: string, id: string) => hover.value?.kind === kind && hover.value.id === id;
</script>

<template>
  <g class="cooling">
    <rect class="panel" :x="COOL_BOX.x" :y="COOL_BOX.y" :width="COOL_BOX.w" :height="COOL_BOX.h" rx="8" />
    <text class="ptitle" :x="COOL_BOX.x + 14" :y="COOL_BOX.y + 15">COOLING LOOP &middot; CHILLED WATER</text>

    <!-- return side first, supply on top so the supply branches hop the return header -->
    <Flow :d="`M${RET_X},190 V722 H1860`" :color="returnColor" :speed="loopSpeed" :active="loopLive" :width="3.2" />
    <Flow v-for="c in crahs" :key="`r${c.n}`" :d="`M1500,${c.cy + 14} H${RET_X}`" :color="returnColor" :speed="loopSpeed * (c.state.value === 'RUN' ? 0.6 : 0)" :active="loopLive && c.state.value === 'RUN'" :width="2.6" />
    <Flow v-for="(c, i) in chillers" :key="`cr${c.n}`" :d="`M${CX[i].ret},722 V746`" :color="returnColor" :speed="loopSpeed * 0.7" :active="loopLive && c.run.value" :width="2.8" />

    <Flow :d="`M1780,710 H${SUP_X} V162`" :color="supplyColor" :speed="loopSpeed" :active="loopLive" :width="3.2" />
    <Flow v-for="c in crahs" :key="`s${c.n}`" :d="`M${SUP_X},${c.cy - 14} H1500`" :color="supplyColor" :speed="loopSpeed * (c.state.value === 'RUN' ? 0.6 : 0)" :active="loopLive && c.state.value === 'RUN'" :width="2.6" />
    <Flow v-for="(c, i) in chillers" :key="`cs${c.n}`" :d="`M${CX[i].sup},746 V710`" :color="supplyColor" :speed="loopSpeed * 0.7" :active="loopLive && c.run.value" :width="2.8" />

    <!-- loop summary -->
    <g transform="translate(1560 84)">
      <rect class="bg" width="340" height="38" rx="5" />
      <text class="k" x="10" y="15">FLOW</text><text class="v" x="10" y="31">{{ num(flow, 1) }} <tspan class="u">L/s</tspan></text>
      <text class="k" x="96" y="15">&Delta;T</text><text class="v" x="96" y="31">{{ num(dT, 1) }} <tspan class="u">K</tspan></text>
      <text class="k" x="168" y="15">SUPPLY</text><text class="v" x="168" y="31" :style="{ fill: supplyColor }">{{ num(supplyC, 1) }}&deg;</text>
      <text class="k" x="238" y="15">RETURN</text><text class="v" x="238" y="31" :style="{ fill: returnColor }">{{ num(returnC, 1) }}&deg;</text>
      <text class="k" x="300" y="15" text-anchor="middle">kW</text><text class="v" x="300" y="31" text-anchor="middle">{{ num(coolKW, 0) }}</text>
    </g>

    <!-- CRAH cards -->
    <g
      v-for="c in crahs"
      :key="c.n"
      class="card"
      :class="[c.tone.value, { sel: isSel('crah', String(c.n)), hov: isHov('crah', String(c.n)) }]"
      :transform="`translate(1560 ${c.cy - c.h / 2})`"
      data-kind="crah"
      :data-id="c.n"
    >
      <rect class="bg" width="340" :height="c.h" rx="5" />
      <text class="name" x="10" y="18">CRAH {{ c.n }}{{ c.n === 4 ? ' · N+1 ASSIST' : '' }}</text>
      <text class="k" x="200" y="18">{{ c.n === 4 ? 'ALL ZONES' : 'ZONE ' + c.zone.value.replace(/,/g, ' ') }}</text>
      <Badge :x="330" :y="5" :text="c.state.value || '—'" :tone="c.tone.value" anchor="end" :pulse="c.state.value === 'FAULT'" />
      <template v-if="c.n !== 4">
        <text class="k" x="10" y="42">FAN</text>
        <Bar :x="40" :y="36" :w="170" :h="6" :value="clamp01(c.fan.value / 100)" :color="c.state.value === 'RUN' ? 'var(--accent)' : 'var(--fg-2)'" />
        <text class="v" x="220" y="42">{{ num(c.fan.value, 0) }}%</text>
        <text class="v" x="330" y="42" text-anchor="end">{{ num(c.kw.value, 1) }} <tspan class="u">kW</tspan></text>
        <text class="k" x="10" y="66">SUPPLY</text><text class="v s" x="62" y="66">{{ num(c.supply.value, 1) }}&deg;C</text>
        <text class="k" x="150" y="66">RETURN</text><text class="v r" x="204" y="66">{{ num(c.ret.value, 1) }}&deg;C</text>
        <text class="k" x="290" y="66">&Delta;</text><text class="v" x="330" y="66" text-anchor="end">{{ num(c.ret.value - c.supply.value, 1) }} K</text>
      </template>
      <template v-else>
        <text class="v" x="10" y="42">{{ num(c.fan.value, 0) }}% <tspan class="u">fan</tspan></text>
        <text class="v s" x="100" y="42">S {{ num(c.supply.value, 1) }}&deg;</text>
        <text class="v r" x="180" y="42">R {{ num(c.ret.value, 1) }}&deg;</text>
        <text class="v" x="330" y="42" text-anchor="end">{{ num(c.kw.value, 1) }} <tspan class="u">kW</tspan></text>
        <Bar :x="10" :y="50" :w="320" :h="4" :value="clamp01(c.fan.value / 100)" :color="c.state.value === 'RUN' ? 'var(--accent)' : 'var(--fg-2)'" />
      </template>
    </g>

    <!-- Chillers -->
    <g
      v-for="(c, i) in chillers"
      :key="c.n"
      class="card"
      :class="[c.tone.value, { sel: isSel('chiller', String(c.n)), hov: isHov('chiller', String(c.n)) }]"
      :transform="`translate(${i === 0 ? 1560 : 1740} 746)`"
      data-kind="chiller"
      :data-id="c.n"
    >
      <rect class="bg" width="166" height="150" rx="5" />
      <text class="name" x="10" y="18">CHILLER {{ c.n }}</text>
      <Badge :x="156" :y="5" :text="c.state.value || '—'" :tone="c.tone.value" anchor="end" />
      <text class="k" x="10" y="44">SUPPLY</text><text class="v s" x="156" y="44" text-anchor="end">{{ num(c.supply.value, 1) }} &deg;C</text>
      <text class="k" x="10" y="64">RETURN</text><text class="v r" x="156" y="64" text-anchor="end">{{ num(c.ret.value, 1) }} &deg;C</text>
      <Bar :x="10" :y="72" :w="146" :h="4" :value="clamp01((c.ret.value - c.supply.value) / 10)" color="var(--info)" />
      <text class="k" x="10" y="100">POWER</text><text class="v" x="156" y="100" text-anchor="end">{{ num(c.kw.value, 0) }} kW</text>
      <text class="k" x="10" y="122">COP</text><text class="v" x="156" y="122" text-anchor="end">{{ num(c.cop.value, 2) }}</text>
      <text class="k" x="10" y="142">LIFT</text><text class="v" x="156" y="142" text-anchor="end">{{ num(c.ret.value - c.supply.value, 1) }} K</text>
    </g>
  </g>
</template>

<style scoped>
.panel { fill: color-mix(in srgb, var(--bg-1) 86%, transparent); stroke: var(--line); stroke-width: 1.2; }
.ptitle { font: 600 11px var(--font-mono); fill: var(--fg-2); letter-spacing: 0.1em; }
.card { cursor: pointer; }
.bg { fill: var(--bg-2); stroke: var(--line-strong); stroke-width: 1.2; transition: stroke var(--dur-base); }
.ok .bg { stroke: color-mix(in srgb, var(--ok) 45%, var(--line-strong)); }
.alarm .bg { stroke: var(--alarm); }
.hov .bg { stroke: #fff; }
.sel .bg { stroke: var(--accent); stroke-width: 2.4; }
.sel { filter: drop-shadow(0 0 6px var(--accent)); }
.name { font: 700 11px var(--font-mono); fill: var(--fg-0); letter-spacing: 0.06em; pointer-events: none; }
.k { font: 500 9.5px var(--font-mono); fill: var(--fg-2); letter-spacing: 0.06em; pointer-events: none; }
.v { font: 500 11.5px var(--font-mono); fill: var(--fg-0); pointer-events: none; }
.v .u { font-size: 9px; fill: var(--fg-2); }
.v.s { fill: #7cc4ff; }
.v.r { fill: #ffb27a; }
</style>
