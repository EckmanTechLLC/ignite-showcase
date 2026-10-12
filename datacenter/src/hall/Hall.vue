<script setup lang="ts">
import { computed } from 'vue';
import Flow from '../Flow.vue';
import Rack from './Rack.vue';
import Crah from './Crah.vue';
import { hotAisleColor } from '../heat';
import { useTagNumber, useTagString } from '../live/store';
import {
  A_RISER,
  BAND_TOP,
  B_RISER,
  COLD_H,
  COLD_Y,
  HALL_BOX,
  HOT_H,
  HOT_Y,
  PDU_X,
  PDU_W,

  RACK_H,

  RACK_X0,
  RACK_X1,
  ROWS,
  ROW_Y,
  busY,
  coldCenter,

} from '../layout';
import { flowSpeed, pdus } from '../power/state';
import { rowStats } from './stats';

const racks = Array.from({ length: 60 }, (_, i) => i + 1);
const PDU_OUT = PDU_X + PDU_W;
const FEED_A = 'var(--feed-a)';
const FEED_B = 'var(--feed-b)';

// Hot-aisle tint follows the mean outlet temperature of the rows that border it.
const hotAisles = HOT_Y.map((y, i) => ({
  y,
  fill: computed(() => {
    const rows = i === 0 ? [0] : i === 3 ? [5] : [2 * i - 1, 2 * i];
    const vals = rows.map((r) => rowStats[r].outletAvg.value).filter(Number.isFinite);
    return hotAisleColor(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : Number.NaN);
  }),
}));

// Feed geometry per PDU pair k: a riser for each feed splits to the busways of its two rows.
const feeds = [0, 1, 2].map((k) => {
  const r1 = busY(2 * k);
  const r2 = busY(2 * k + 1);
  const yA = BAND_TOP[k] + 34;
  const yB = BAND_TOP[k] + 110;
  const a = pdus.A[k];
  const b = pdus.B[k];
  return {
    k,
    a: {
      color: FEED_A,
      live: a.live,
      spd: computed(() => flowSpeed(a.loadKW.value)),
      spdRow: computed(() => flowSpeed(a.loadKW.value / 2)),
      up: `M${PDU_OUT},${yA} H${A_RISER} V${r1.a}`,
      down: `M${A_RISER},${yA} V${r2.a}`,
      row1: `M${A_RISER},${r1.a} H${RACK_X1 - 4}`,
      row2: `M${A_RISER},${r2.a} H${RACK_X1 - 4}`,
    },
    b: {
      color: FEED_B,
      live: b.live,
      spd: computed(() => flowSpeed(b.loadKW.value)),
      spdRow: computed(() => flowSpeed(b.loadKW.value / 2)),
      up: `M${PDU_OUT},${yB} H${B_RISER} V${r1.b}`,
      down: `M${B_RISER},${yB} V${r2.b}`,
      row1: `M${B_RISER},${r1.b} H${RACK_X1 - 4}`,
      row2: `M${B_RISER},${r2.b} H${RACK_X1 - 4}`,
    },
  };
});

// Cold-air delivery per cold aisle: its own CRAH plus a share of the N+1 assist unit.
function crahEff(n: number) {
  const state = useTagString(`Cooling/CRAH/${n}/State`);
  const fan = useTagNumber(`Cooling/CRAH/${n}/FanPct`);
  return computed(() => (state.value === 'RUN' && Number.isFinite(fan.value) ? fan.value / 100 : 0));
}
const eff = [1, 2, 3, 4].map(crahEff);
const aisles = [0, 1, 2].map((k) => {
  const e = computed(() => Math.min(1, eff[k].value + eff[3].value * 0.3));
  return {
    k,
    cy: coldCenter(k),
    e,
    opacity: computed(() => (e.value > 0.02 ? 0.3 + 0.7 * e.value : 0)),
    spd: computed(() => 14 + e.value * 120),
    path: `M${RACK_X1 + 12},${coldCenter(k)} H${RACK_X0 + 14}`,
  };
});
const assistPath = `M1430,626 V${coldCenter(0)}`;
const assistOpacity = computed(() => (eff[3].value > 0.02 ? 0.25 + 0.75 * eff[3].value : 0));
const assistSpd = computed(() => 10 + eff[3].value * 90);
</script>

<template>
  <g class="hall">
    <rect class="box" :x="HALL_BOX.x" :y="HALL_BOX.y" :width="HALL_BOX.w" :height="HALL_BOX.h" rx="8" />
    <text class="title" :x="HALL_BOX.x + 12" :y="HALL_BOX.y + 15">DATA HALL 1 &middot; 60 RACKS &middot; 6 ROWS</text>

    <!-- hot aisles -->
    <g v-for="(h, i) in hotAisles" :key="`h${i}`">
      <rect class="hot" :x="RACK_X0 - 4" :y="h.y" :width="RACK_X1 - RACK_X0 + 8" :height="HOT_H" rx="3" :style="{ fill: h.fill.value }" />
      <text class="aisle" :x="(RACK_X0 + RACK_X1) / 2" :y="h.y + HOT_H / 2 + 3" text-anchor="middle">HOT AISLE</text>
    </g>

    <!-- contained cold aisles: roof panel, end doors, airflow from the CRAH -->
    <g v-for="a in aisles" :key="`c${a.k}`">
      <rect class="cold" :x="RACK_X0 - 4" :y="COLD_Y[a.k]" :width="RACK_X1 - RACK_X0 + 8" :height="COLD_H" rx="3" />
      <path class="door" :d="`M${RACK_X0 - 4},${COLD_Y[a.k] + 2} V${COLD_Y[a.k] + COLD_H - 2} M${RACK_X0 - 8},${COLD_Y[a.k] + 4} V${COLD_Y[a.k] + COLD_H - 4}`" />
      <text class="aisle cold-l" :x="RACK_X0 + 8" :y="COLD_Y[a.k] + 11">COLD AISLE &middot; CONTAINED</text>
      <g :style="{ opacity: a.opacity.value }" class="air">
        <Flow :d="a.path" color="#8fd8ff" :speed="a.spd.value" :active="a.e.value > 0.02" :width="2.2" dash="12 9" />
        <path class="head" :d="`M${RACK_X0 + 22},${a.cy - 5} L${RACK_X0 + 14},${a.cy} L${RACK_X0 + 22},${a.cy + 5}`" />
      </g>
    </g>
    <g class="air" :style="{ opacity: assistOpacity }">
      <Flow :d="assistPath" color="#8fd8ff" :speed="assistSpd" :active="eff[3].value > 0.02" :width="2" dash="8 8" />
    </g>

    <!-- row labels -->
    <text v-for="(r, i) in ROWS" :key="r" class="rowlbl" :x="570" :y="ROW_Y[i] + RACK_H / 2 + 8" text-anchor="middle">{{ r }}</text>

    <!-- A/B busways (power from the PDUs into every row) -->
    <g v-for="f in feeds" :key="`f${f.k}`" class="feeds">
      <template v-for="x in [f.b, f.a]" :key="x.color">
        <Flow :d="x.up" :color="x.color" :speed="x.spd.value" :active="x.live.value" :width="2" />
        <Flow :d="x.down" :color="x.color" :speed="x.spd.value" :active="x.live.value" :width="2" />
        <Flow :d="x.row1" :color="x.color" :speed="x.spdRow.value" :active="x.live.value" :width="1.6" dash="5 8" />
        <Flow :d="x.row2" :color="x.color" :speed="x.spdRow.value" :active="x.live.value" :width="1.6" dash="5 8" />
      </template>
    </g>

    <Rack v-for="n in racks" :key="n" :n="n" />
    <Crah v-for="n in 4" :key="n" :n="n" />
  </g>
</template>

<style scoped>
.box { fill: color-mix(in srgb, var(--bg-1) 90%, transparent); stroke: var(--line); stroke-width: 1.2; }
.title { font: 600 11px var(--font-mono); fill: var(--fg-2); letter-spacing: 0.1em; }
.hot { opacity: 0.2; }
.cold { fill: rgb(120 200 255 / 0.07); stroke: rgb(120 200 255 / 0.4); stroke-width: 1; stroke-dasharray: 3 3; }
.door { fill: none; stroke: rgb(150 215 255 / 0.55); stroke-width: 1.5; stroke-linecap: round; }
.aisle { font: 500 8.5px var(--font-mono); fill: var(--fg-2); letter-spacing: 0.14em; pointer-events: none; }
.cold-l { fill: rgb(150 215 255 / 0.55); }
.rowlbl { font: 700 24px var(--font-sans); fill: var(--fg-2); opacity: 0.8; pointer-events: none; }
.head { fill: none; stroke: #8fd8ff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.air { transition: opacity var(--dur-slow); }
</style>
