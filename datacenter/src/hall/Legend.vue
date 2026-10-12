<script setup lang="ts">
import { heatColor, heatPos, T_ALLOWABLE, T_MAX, T_MIN, T_RECOMMENDED } from '../heat';

const X0 = 20;
const W = 450;
const stops = Array.from({ length: 37 }, (_, i) => {
  const t = T_MIN + (i * (T_MAX - T_MIN)) / 36;
  return { o: `${(heatPos(t) * 100).toFixed(1)}%`, c: heatColor(t) };
});
const ticks = [18, 21, 24, 27, 30, 33, 36];
const at = (t: number) => X0 + heatPos(t) * W;
</script>

<template>
  <g class="legend">
    <rect class="box" x="8" y="722" width="484" height="104" rx="8" />
    <text class="t" x="20" y="740">HEAT SCALE &middot; RACK INLET TEMPERATURE</text>
    <defs>
      <linearGradient id="heatGrad" x1="0" x2="1" y1="0" y2="0">
        <stop v-for="s in stops" :key="s.o" :offset="s.o" :stop-color="s.c" />
      </linearGradient>
    </defs>
    <rect :x="X0" y="750" :width="W" height="12" rx="3" fill="url(#heatGrad)" />
    <g v-for="t in [T_RECOMMENDED, T_ALLOWABLE]" :key="t">
      <line class="mark" :x1="at(t)" :x2="at(t)" y1="746" y2="766" />
    </g>
    <text v-for="t in ticks" :key="t" class="tick" :x="at(t)" y="777" text-anchor="middle">{{ t }}&deg;</text>
    <text class="ashrae" :x="at(T_RECOMMENDED)" y="791" text-anchor="middle">27&deg;C ASHRAE RECOMMENDED MAX</text>
    <text class="ashrae" :x="at(T_ALLOWABLE)" y="803" text-anchor="middle">32&deg;C A1 ALLOWABLE</text>

    <g transform="translate(20 813)" class="key">
      <line x1="0" x2="16" y1="0" y2="0" stroke="var(--feed-a)" stroke-width="2.4" /><text x="21" y="3.5">FEED A</text>
      <line x1="72" x2="88" y1="0" y2="0" stroke="var(--feed-b)" stroke-width="2.4" /><text x="93" y="3.5">FEED B</text>
      <rect x="146" y="-5" width="12" height="10" rx="2" fill="url(#hatch)" stroke="var(--line-strong)" /><text x="163" y="3.5">OFFLINE</text>
      <rect x="222" y="-1" width="14" height="3" rx="1" fill="var(--fg-0)" /><text x="241" y="3.5">kW</text>
      <rect x="268" y="-4" width="2" height="8" fill="var(--fg-0)" /><text x="275" y="3.5">UTIL</text>
      <line x1="318" x2="334" y1="0" y2="0" stroke="var(--line-strong)" stroke-width="2.4" /><text x="339" y="3.5">DEAD PATH</text>
    </g>
  </g>
</template>

<style scoped>
.box { fill: color-mix(in srgb, var(--bg-1) 86%, transparent); stroke: var(--line); stroke-width: 1.2; }
.t { font: 600 10.5px var(--font-mono); fill: var(--fg-2); letter-spacing: 0.1em; }
.tick { font: 500 9px var(--font-mono); fill: var(--fg-1); }
.mark { stroke: #fff; stroke-width: 2; stroke-linecap: round; }
.ashrae { font: 600 8.5px var(--font-mono); fill: var(--fg-0); letter-spacing: 0.04em; }
.key text { font: 500 9px var(--font-mono); fill: var(--fg-1); letter-spacing: 0.05em; }
</style>
