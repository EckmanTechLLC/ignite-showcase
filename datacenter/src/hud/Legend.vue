<script setup lang="ts">
import { heatColor, heatPos, T_ALLOWABLE, T_MAX, T_MIN, T_RECOMMENDED } from '../heat';
import { num } from '../fmt';
import { ROW_NAMES } from '../hall3d/geometry';
import { rowStats } from './stats';

const stops = Array.from({ length: 19 }, (_, i) => `${heatColor(T_MIN + (i * (T_MAX - T_MIN)) / 18)} ${((i / 18) * 100).toFixed(1)}%`).join(', ');
const ticks = [18, 21, 24, 27, 30, 33, 36];
const pct = (t: number) => `${(heatPos(t) * 100).toFixed(1)}%`;
</script>

<template>
  <section class="legend mono" aria-label="Legend: row summary and heat scale">
    <h2>Heat scale &middot; rack inlet</h2>
    <div class="bar" :style="{ background: `linear-gradient(to right, ${stops})` }">
      <i v-for="t in [T_RECOMMENDED, T_ALLOWABLE]" :key="t" class="mark" :style="{ left: pct(t) }" />
    </div>
    <div class="ticks"><span v-for="t in ticks" :key="t" :style="{ left: pct(t) }">{{ t }}&deg;</span></div>
    <div class="ashrae"><span :style="{ left: pct(T_RECOMMENDED) }">27&deg; ASHRAE rec. max</span><span class="b" :style="{ left: pct(T_ALLOWABLE) }">32&deg; A1 allowable</span></div>
    <h2 class="rows">Rows</h2>
    <table>
      <thead><tr><th><span class="vh">Row</span></th><th>kW</th><th>IN avg</th><th>IN max</th><th>OUT</th></tr></thead>
      <tbody>
        <tr v-for="(r, i) in ROW_NAMES" :key="r">
          <th scope="row">{{ r }}</th>
          <td>{{ num(rowStats[i].kw.value, 1) }}</td>
          <td><i class="sw" :style="{ background: heatColor(rowStats[i].inletAvg.value) }" />{{ num(rowStats[i].inletAvg.value, 1) }}&deg;</td>
          <td>{{ num(rowStats[i].inletMax.value, 1) }}&deg;</td>
          <td class="out">{{ num(rowStats[i].outletAvg.value, 1) }}&deg;</td>
        </tr>
      </tbody>
    </table>
    <p class="key"><b class="a">&#9644;</b> feed A <b class="b2">&#9644;</b> feed B <b class="g">&#9644;</b> utility <b class="y">&#9644;</b> generator <b class="o">&#9644;</b> battery <b class="d">&#9644;</b> dead path</p>
  </section>
</template>

<style scoped>
.legend { width: 292px; padding: var(--space-3) var(--space-4); background: color-mix(in srgb, var(--bg-1) 88%, transparent); border: 1px solid var(--line); border-radius: var(--radius-3); backdrop-filter: blur(6px); font-size: var(--text-xs); color: var(--fg-1); }
h2 { margin: 0 0 6px; font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-2); }
h2.rows { margin-top: 10px; }
.bar { position: relative; height: 10px; border-radius: 3px; }
.mark { position: absolute; top: -3px; bottom: -3px; width: 2px; background: #fff; transform: translateX(-1px); }
.ticks, .ashrae { position: relative; height: 12px; margin-top: 3px; }
.ticks span, .ashrae span { position: absolute; transform: translateX(-50%); white-space: nowrap; font-size: 9px; }
.ashrae span { color: var(--fg-0); font-size: 8.5px; }
.ashrae span.b { top: 11px; }
.ashrae { height: 24px; }
table { width: 100%; border-collapse: collapse; }
th { color: var(--fg-2); font-weight: 500; text-align: right; padding: 1px 0; }
.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
tbody th { text-align: left; color: var(--fg-0); font-weight: 700; }
td { text-align: right; padding: 1px 0; color: var(--fg-0); }
td.out { color: #ffb27a; }
.sw { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }
.key { margin: 8px 0 0; color: var(--fg-2); font-size: 9px; line-height: 1.5; }
.key b { font-size: 11px; }
.key .a { color: var(--feed-a); } .key .b2 { color: var(--feed-b); } .key .g { color: #38e08a; } .key .y { color: #ffb028; } .key .o { color: #ff7828; } .key .d { color: var(--fg-2); }
</style>
