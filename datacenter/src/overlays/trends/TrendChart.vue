<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { EChartsType } from 'echarts/core';
import { tagRef } from '../../live/store';
import { WINDOWS, fetchSeries, plausible, type Point, type WindowKey } from './history';
import { loadEcharts } from './echarts';

export interface Signal {
  tag: string;
  label: string;
  color: string;
  /** 0 = left axis, 1 = right axis */
  axis?: number;
}
const props = defineProps<{
  title: string;
  signals: Signal[];
  win: WindowKey;
  axes?: string[];
  mark?: { y: number; label: string; color: string };
}>();

const el = ref<HTMLDivElement>();
const note = ref('');
let chart: EChartsType | null = null;
let data = new Map<string, Point[]>();
let dirty = false;
let epoch = 0;
let disposed = false;
let timer = 0;
let ro: ResizeObserver | undefined;

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

function option() {
  const fg2 = css('--fg-2', '#6f8196');
  const line = css('--line', '#243246');
  const axes = props.axes?.length ? props.axes : [''];
  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: css('--font-mono', 'monospace') },
    grid: { left: 44, right: axes.length > 1 ? 44 : 14, top: 28, bottom: 22 },
    legend: { top: 0, right: 0, textStyle: { color: fg2, fontSize: 10 }, itemWidth: 12, itemHeight: 3, icon: 'rect' },
    tooltip: { trigger: 'axis', backgroundColor: css('--bg-2', '#111a26'), borderColor: line, textStyle: { color: css('--fg-0', '#e8eef6'), fontSize: 11 }, valueFormatter: (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : String(v)) },
    xAxis: { type: 'time', axisLabel: { color: fg2, fontSize: 10 }, axisLine: { lineStyle: { color: line } }, splitLine: { show: false } },
    yAxis: axes.map((name, i) => ({
      type: 'value', scale: true, name, ...(i === 0 && props.mark ? { max: (v: { max: number }) => Math.max(Math.ceil(v.max * 20) / 20, props.mark!.y * 1.02) } : {}), nameTextStyle: { color: fg2, fontSize: 10 }, position: i === 0 ? 'left' : 'right',
      axisLabel: { color: fg2, fontSize: 10, formatter: (v: number) => String(+v.toFixed(2)) }, splitLine: { show: i === 0, lineStyle: { color: line } },
    })),
    series: props.signals.map((s, i) => ({
      name: s.label, type: 'line', yAxisIndex: s.axis ?? 0, showSymbol: false, sampling: 'lttb',
      lineStyle: { width: 1.5, color: s.color }, itemStyle: { color: s.color }, data: data.get(s.tag) ?? [],
      markLine: i === 0 && props.mark ? { silent: true, symbol: 'none', label: { formatter: props.mark.label, color: props.mark.color, fontSize: 10, position: 'insideEndTop' }, lineStyle: { color: props.mark.color, type: 'dashed' }, data: [{ yAxis: props.mark.y }] } : undefined,
    })),
  };
}

function draw(full = false): void {
  if (!chart) return;
  if (full) chart.setOption(option(), true);
  else chart.setOption({ series: props.signals.map((s) => ({ data: data.get(s.tag) ?? [] })) });
  dirty = false;
}

async function load(): Promise<void> {
  const mine = ++epoch;
  note.value = '';
  data = new Map(props.signals.map((s) => [s.tag, [] as Point[]]));
  draw(true);
  try {
    const hist = await fetchSeries(props.signals.map((s) => s.tag), props.win);
    if (mine !== epoch || disposed) return;
    for (const s of props.signals) {
      const h = hist.get(s.tag) ?? [];
      const last = h.length ? h[h.length - 1][0] : 0;
      data.set(s.tag, h.concat((data.get(s.tag) ?? []).filter((p) => p[0] > last)));
    }
    if ([...data.values()].every((d) => d.length === 0)) note.value = 'No history yet; showing live values.';
    draw(true);
  } catch (e) {
    if (mine === epoch) note.value = `History unavailable (${e instanceof Error ? e.message : 'error'}); showing live values.`;
  }
}

// Live append from the store: sample every 500 ms (2 Hz redraw cap), keep one point per live step.
function tick(): void {
  const w = WINDOWS[props.win];
  const step = w.ms / 720;
  const now = Date.now();
  for (const s of props.signals) {
    const arr = data.get(s.tag);
    const v = plausible(tagRef(s.tag).value);
    if (!arr || v === null) continue;
    if (!arr.length || now - arr[arr.length - 1][0] >= step) {
      arr.push([now, v]);
      dirty = true;
    }
    while (arr.length && arr[0][0] < now - w.ms) {
      arr.shift();
      dirty = true;
    }
  }
  if (dirty) draw();
}

onMounted(async () => {
  const ec = await loadEcharts();
  if (disposed || !el.value) return;
  chart = ec.init(el.value);
  ro = new ResizeObserver(() => chart?.resize());
  ro.observe(el.value);
  void load();
  timer = window.setInterval(() => !document.hidden && tick(), 500);
});
watch(() => [props.win, props.signals.map((s) => s.tag).join('|')], () => void load());
onBeforeUnmount(() => {
  disposed = true;
  clearInterval(timer);
  ro?.disconnect();
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <figure class="tc">
    <figcaption>{{ title }}<small v-if="note">{{ note }}</small></figcaption>
    <div ref="el" class="plot" />
  </figure>
</template>

<style scoped>
.tc { margin: 0 0 var(--space-3); }
figcaption { font-size: var(--text-xs); letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-1); display: flex; gap: 8px; align-items: baseline; }
figcaption small { color: var(--warn); text-transform: none; letter-spacing: 0; }
.plot { height: 150px; width: 100%; background: var(--bg-2); border-radius: var(--radius-2); }
</style>
