<script setup lang="ts">
import { heatColor } from '../heat';
import { num } from '../fmt';
import { useTagNumber } from '../live/store';
import { ROWS } from '../layout';
import { rowStats } from './stats';

const hotAisle = useTagNumber('Hall/HotAisleAvgC');
const coldAisle = useTagNumber('Hall/ColdAisleAvgC');
const avgInlet = useTagNumber('Hall/HallAvgInletC');
const losses = useTagNumber('Hall/LossesKW');
const cooling = useTagNumber('Hall/CoolingKW');
const alarms = useTagNumber('Hall/ActiveAlarms');

const COL = 164;
const kpis = [
  { k: 'HOT AISLE AVG', v: () => `${num(hotAisle.value, 1)} °C` },
  { k: 'COLD AISLE AVG', v: () => `${num(coldAisle.value, 1)} °C` },
  { k: 'HALL AVG INLET', v: () => `${num(avgInlet.value, 1)} °C` },
  { k: 'ELECTRICAL LOSSES', v: () => `${num(losses.value, 0)} kW` },
  { k: 'COOLING POWER', v: () => `${num(cooling.value, 0)} kW` },
  { k: 'ACTIVE ALARMS', v: () => num(alarms.value, 0) },
];
</script>

<template>
  <g>
    <rect class="box" x="498" y="722" width="1010" height="104" rx="8" />
    <text class="t" x="510" y="740">ROW SUMMARY</text>
    <g v-for="(r, i) in ROWS" :key="r" :transform="`translate(${510 + i * COL} 748)`">
      <text class="row" x="0" y="14">ROW {{ r }}</text>
      <text class="k" x="156" y="14" text-anchor="end">PDU {{ ['A1/B1', 'A2/B2', 'A3/B3'][i >> 1] }}</text>
      <text class="big" x="0" y="38">{{ num(rowStats[i].kw.value, 1) }}<tspan class="u"> kW</tspan></text>
      <rect class="sw" x="0" y="48" width="8" height="8" rx="2" :style="{ fill: heatColor(rowStats[i].inletAvg.value) }" />
      <text class="v" x="13" y="56">IN {{ num(rowStats[i].inletAvg.value, 1) }}&deg; <tspan class="u">max {{ num(rowStats[i].inletMax.value, 1) }}&deg;</tspan></text>
      <text class="v out" x="13" y="70">OUT {{ num(rowStats[i].outletAvg.value, 1) }}&deg;</text>
    </g>

    <rect class="box" x="498" y="836" width="1010" height="90" rx="8" />
    <g v-for="(c, i) in kpis" :key="c.k" :transform="`translate(${510 + i * COL} 856)`">
      <text class="k" x="0" y="0">{{ c.k }}</text>
      <text class="kv" x="0" y="30">{{ c.v() }}</text>
    </g>
  </g>
</template>

<style scoped>
.box { fill: color-mix(in srgb, var(--bg-1) 86%, transparent); stroke: var(--line); stroke-width: 1.2; }
.t { font: 600 10.5px var(--font-mono); fill: var(--fg-2); letter-spacing: 0.1em; }
.row { font: 700 12px var(--font-mono); fill: var(--fg-0); letter-spacing: 0.06em; }
.k { font: 500 9.5px var(--font-mono); fill: var(--fg-2); letter-spacing: 0.06em; }
.big { font: 600 18px var(--font-mono); fill: var(--fg-0); }
.u { font-size: 9.5px; fill: var(--fg-2); font-weight: 400; }
.v { font: 500 10.5px var(--font-mono); fill: var(--fg-1); }
.v.out { fill: #ffb27a; }
.kv { font: 600 22px var(--font-mono); fill: var(--fg-0); }
</style>
