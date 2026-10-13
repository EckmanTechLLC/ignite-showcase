<script module lang="ts">
  export interface Signal {
    tag: string;
    label: string;
    color: string;
    dashed?: boolean;
    /** 0 = left axis, 1 = right axis */
    axis?: number;
  }
  /** Horizontal reference line whose value is a live tag (demand limit, baseline peak). */
  export interface RefLine {
    tag: string;
    label: string;
    color: string;
  }
</script>

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { EChartsType } from 'echarts/core';
  import { tagNum } from '../../live/store.svelte';
  import { WINDOWS, fetchSeries, hourLabel, plausible, simAt, simClock, tariffSegments, type Point, type WindowKey } from './history';
  import { loadEcharts } from './echarts';

  interface Props {
    title: string;
    signals: Signal[];
    win: WindowKey;
    axes?: string[];
    lines?: RefLine[];
    /** 'tariff' shades OFFPEAK / SHOULDER / PEAK, 'demand' the weekday 16-21 demand window. */
    shade?: 'tariff' | 'demand';
    /** Series that are not historized: the chart says so and fills from live values only. */
    liveOnly?: string;
  }
  let { title, signals, win, axes = [''], lines = [], shade, liveOnly = '' }: Props = $props();

  let el: HTMLDivElement;
  let note = $state('');
  let chart: EChartsType | null = null;
  let data = new Map<string, Point[]>();
  let epoch = 0;
  let disposed = false;
  let timer = 0;
  let ro: ResizeObserver | undefined;
  let ready = $state(false);

  const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const tone = (band: string) => (band === 'PEAK' ? css('--alarm', '#f87171') : band === 'SHOULDER' ? css('--warn', '#fbbf24') : css('--info', '#60a5fa'));
  const alpha = (band: string) => (band === 'PEAK' ? 0.14 : 0.05);

  function option() {
    const fg2 = css('--fg-2', '#8294a9');
    const line = css('--line', '#243246');
    const c = simClock();
    const w = WINDOWS[win];
    const lo = simAt(c, c.nowMs - w.ms);
    const hi = simAt(c, c.nowMs);
    const labelVals: number[] = [];
    for (let v = Math.ceil(lo / w.tickH) * w.tickH; v <= hi; v += w.tickH) labelVals.push(v);

    const areas =
      shade === 'tariff'
        ? tariffSegments(lo, hi).map((s) => [{ xAxis: s.from, itemStyle: { color: tone(s.band), opacity: alpha(s.band) } }, { xAxis: s.to }])
        : shade === 'demand'
          ? tariffSegments(lo, hi).filter((s) => s.band === 'PEAK').map((s) => [{ xAxis: s.from, name: 'demand window', itemStyle: { color: css('--accent', '#a3e635'), opacity: 0.12 } }, { xAxis: s.to }])
          : [];
    const marks = lines
      .map((l) => ({ l, v: tagNum(l.tag) }))
      .filter((x) => Number.isFinite(x.v))
      .map(({ l, v }) => ({ yAxis: v, name: l.label, lineStyle: { color: l.color, type: 'dashed' as const }, label: { formatter: `${l.label} ${Math.round(v)}`, color: l.color, fontSize: 10, position: 'insideEndTop' as const } }));

    return {
      animation: false,
      backgroundColor: 'transparent',
      textStyle: { fontFamily: css('--font-mono', 'monospace') },
      grid: { left: 46, right: axes.length > 1 ? 46 : 14, top: 28, bottom: 22 },
      legend: { top: 0, right: 0, textStyle: { color: fg2, fontSize: 10 }, itemWidth: 12, itemHeight: 3, icon: 'rect' },
      tooltip: {
        trigger: 'axis',
        backgroundColor: css('--bg-2', '#111a26'),
        borderColor: line,
        textStyle: { color: css('--fg-0', '#e8eef6'), fontSize: 11 },
        axisPointer: { label: { formatter: (p: { value: number | string }) => hourLabel(Number(p.value), win === '3d', true) } },
        valueFormatter: (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : String(v)),
      },
      xAxis: {
        type: 'value',
        min: lo,
        max: hi,
        axisLabel: { color: fg2, fontSize: 10, customValues: labelVals, formatter: (v: number) => hourLabel(v, win === '3d') },
        axisTick: { customValues: labelVals },
        axisLine: { lineStyle: { color: line } },
        splitLine: { show: true, customValues: labelVals, lineStyle: { color: line, opacity: 0.35 } },
      },
      yAxis: axes.map((name, i) => ({
        type: 'value',
        scale: true,
        name,
        nameTextStyle: { color: fg2, fontSize: 10 },
        position: i === 0 ? 'left' : 'right',
        axisLabel: { color: fg2, fontSize: 10, formatter: (v: number) => String(+v.toFixed(2)) },
        splitLine: { show: i === 0, lineStyle: { color: line } },
      })),
      series: signals.map((s, i) => ({
        name: s.label,
        type: 'line',
        yAxisIndex: s.axis ?? 0,
        showSymbol: false,
        sampling: 'lttb',
        lineStyle: { width: 1.5, color: s.color, type: s.dashed ? 'dashed' : 'solid' },
        itemStyle: { color: s.color },
        data: (data.get(s.tag) ?? []).map(([t, v]) => [simAt(c, t), v]),
        markArea: i === 0 && areas.length ? { silent: true, data: areas } : undefined,
        markLine: i === 0 && marks.length ? { silent: true, symbol: 'none', data: marks } : undefined,
      })),
    };
  }

  const draw = () => chart?.setOption(option(), { notMerge: false });

  async function load(): Promise<void> {
    const mine = ++epoch;
    note = '';
    data = new Map(signals.map((s) => [s.tag, [] as Point[]]));
    draw();
    try {
      const hist = await fetchSeries(signals.map((s) => s.tag), win);
      if (mine !== epoch || disposed) return;
      for (const s of signals) {
        const h = hist.get(s.tag) ?? [];
        const last = h.length ? h[h.length - 1][0] : 0;
        data.set(s.tag, h.concat((data.get(s.tag) ?? []).filter((p) => p[0] > last)));
      }
      if ([...data.values()].every((d) => d.length === 0)) note = 'No history yet; showing live values.';
      else if (liveOnly) note = liveOnly;
      draw();
    } catch (e) {
      if (mine === epoch) note = `History unavailable (${e instanceof Error ? e.message : 'error'}); showing live values.`;
    }
  }

  /** Append the live value once per history bucket, drop what left the window, redraw (2 Hz, well under the 4 Hz cap). */
  function tick(): void {
    const w = WINDOWS[win];
    const step = w.ms / w.points;
    const now = Date.now();
    for (const s of signals) {
      const arr = data.get(s.tag);
      const v = plausible(tagNum(s.tag));
      if (!arr) continue;
      if (v !== null && (!arr.length || now - arr[arr.length - 1][0] >= step)) arr.push([now, v]);
      while (arr.length && arr[0][0] < now - w.ms) arr.shift();
    }
    draw();
  }

  onMount(() => {
    void loadEcharts().then((ec) => {
      if (disposed) return;
      chart = ec.init(el);
      ro = new ResizeObserver(() => chart?.resize());
      ro.observe(el);
      ready = true;
      timer = window.setInterval(() => !document.hidden && tick(), 500);
    });
    return () => {
      disposed = true;
      clearInterval(timer);
      ro?.disconnect();
      chart?.dispose();
      chart = null;
    };
  });

  // Reload when the window or the signal set changes (selection switches the target chart set).
  $effect(() => {
    void win;
    void signals.map((s) => s.tag).join('|');
    if (ready) untrack(() => void load());
  });
</script>

<figure class="tc">
  <figcaption>{title}{#if note}<small>{note}</small>{/if}</figcaption>
  <div bind:this={el} class="plot"></div>
</figure>

<style>
  .tc { margin: 0 0 var(--space-3); }
  figcaption { font-size: var(--text-xs); letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-1); display: flex; gap: 8px; align-items: baseline; }
  figcaption small { color: var(--warn); text-transform: none; letter-spacing: 0; }
  .plot { height: 160px; width: 100%; background: var(--bg-2); border-radius: var(--radius-2); }
</style>
