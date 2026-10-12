<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { onFrame } from '../anim';
import { useTagNumber, useTagString } from '../live/store';
import { CRAH_W, CRAH_X, crahBox, crahCy } from '../layout';
import { num } from '../fmt';
import { hover, selection } from '../selection';

const props = defineProps<{ n: number }>();
const id = String(props.n);
const p = `Cooling/CRAH/${props.n}/`;
const state = useTagString(p + 'State');
const fan = useTagNumber(p + 'FanPct');
const supply = useTagNumber(p + 'SupplyC');
const ret = useTagNumber(p + 'ReturnC');
const box = crahBox(props.n);
const assist = props.n === 4;
const cy = assist ? box.y + 30 : crahCy(props.n);
const r = assist ? 13 : 22;
const cx = CRAH_X + CRAH_W / 2;

const running = computed(() => state.value === 'RUN' || state.value === 'RUNNING');
const faulted = computed(() => state.value === 'FAULT');
const tone = computed(() => (faulted.value ? 'alarm' : running.value ? 'ok' : 'off'));
const isSel = computed(() => selection.value?.kind === 'crah' && selection.value.id === id);
const isHover = computed(() => hover.value?.kind === 'crah' && hover.value.id === id);

// Fan rotation is driven by the shared frame loop so speed changes never restart a CSS animation.
const rotor = ref<SVGGElement | null>(null);
let angle = 0;
let speed = 0;
const stop = onFrame((dt) => {
  const target = running.value && Number.isFinite(fan.value) ? fan.value * 5.4 : 0; // 100 % = 540 deg/s
  speed += (target - speed) * Math.min(1, dt * (target > speed ? 2 : 0.7));
  if (speed < 0.5) return;
  angle = (angle + speed * dt) % 360;
  rotor.value?.setAttribute('transform', `rotate(${angle.toFixed(1)})`);
});
onBeforeUnmount(stop);
</script>

<template>
  <g class="crah" :class="[tone, { sel: isSel, hov: isHover }]" data-kind="crah" :data-id="id">
    <rect class="box" :x="CRAH_X" :y="box.y" :width="CRAH_W" :height="box.h" rx="4" />
    <text class="lbl" :x="cx" :y="box.y + 13" text-anchor="middle">{{ assist ? 'CRAH 4+' : `CRAH ${n}` }}</text>
    <g :transform="`translate(${cx} ${cy})`">
      <circle class="housing" :r="r + 3" />
      <g ref="rotor" class="rotor">
        <ellipse v-for="i in 5" :key="i" class="blade" :cx="0" :cy="-r * 0.52" :rx="r * 0.24" :ry="r * 0.5" :transform="`rotate(${(i - 1) * 72})`" />
        <circle class="hub" :r="r * 0.18" />
      </g>
      <circle v-if="faulted" class="fault-ring" :r="r + 6" />
    </g>
    <text v-if="!assist" class="pct" :x="cx" :y="cy + r + 17" text-anchor="middle">{{ running ? num(fan, 0) + '%' : state || '—' }}</text>
    <text class="tmp s" :x="cx" :y="box.y + box.h - (assist ? 15 : 24)" text-anchor="middle">S {{ num(supply, 1) }}&deg;</text>
    <text class="tmp r" :x="cx" :y="box.y + box.h - (assist ? 5 : 10)" text-anchor="middle">R {{ num(ret, 1) }}&deg;</text>
  </g>
</template>

<style scoped>
.crah { cursor: pointer; }
.box { fill: var(--bg-2); stroke: var(--line-strong); stroke-width: 1.2; transition: stroke var(--dur-base); }
.ok .box { stroke: color-mix(in srgb, var(--ok) 55%, var(--line-strong)); }
.alarm .box { stroke: var(--alarm); }
.hov .box { stroke: #fff; }
.sel .box { stroke: var(--accent); stroke-width: 2.4; }
.sel { filter: drop-shadow(0 0 6px var(--accent)); }
.lbl { font: 700 9.5px var(--font-mono); fill: var(--fg-1); letter-spacing: 0.04em; pointer-events: none; }
.housing { fill: var(--bg-0); stroke: var(--line-strong); stroke-width: 1; }
.blade { fill: color-mix(in srgb, var(--accent) 70%, #fff 0%); opacity: 0.85; transition: fill var(--dur-base); }
.hub { fill: var(--bg-0); stroke: var(--accent); }
.off .blade { fill: var(--fg-2); opacity: 0.6; }
.alarm .blade { fill: var(--alarm); opacity: 0.55; }
.fault-ring { fill: none; stroke: var(--alarm); stroke-width: 2.4; animation: fault 0.9s ease-in-out infinite; }
.pct { font: 600 10px var(--font-mono); fill: var(--fg-0); pointer-events: none; }
.alarm .pct { fill: var(--alarm); }
.tmp { font: 500 9.5px var(--font-mono); pointer-events: none; }
.tmp.s { fill: #7cc4ff; }
.tmp.r { fill: #ffb27a; }
@keyframes fault { 50% { stroke-opacity: 0.2; } }
</style>
