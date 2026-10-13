import { createEffect, on, onCleanup, onMount, createSignal, untrack } from 'solid-js';
import type { EChartsType } from 'echarts/core';
import { rawNum } from '../../live/store';
import { POINTS, fetchSeries, hourLabel, plausible, simAt, simClock, valueOf, windowHours, windowMs, type Point, type RefLine, type Signal, type WindowKey } from './history';
import { loadEcharts } from './echarts';

export interface ChartProps {
  title: string;
  signals: Signal[];
  win: WindowKey;
  axes?: string[];
  lines?: RefLine[];
  /** Series that are not historized: the chart says so and fills from live values only. */
  liveOnly?: string;
  /** Fixed y range for the left axis, e.g. [0, 100]. */
  yRange?: [number, number];
  tall?: boolean;
}

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const tickStep = (h: number) => (h <= 8 ? 1 : h <= 24 ? 4 : 6);

/** A line/area chart on a simulated-time axis: history once, then live values appended per bucket; redraws only when data changed (at most 4 per second). */
export default function Chart(p: ChartProps) {
  let el!: HTMLDivElement;
  const [note, setNote] = createSignal('');
  let chart: EChartsType | null = null;
  let data = new Map<string, Point[]>();
  let epoch = 0;
  let disposed = false;
  let timer = 0;
  let ro: ResizeObserver | undefined;
  const [ready, setReady] = createSignal(false);

  function option() {
    const fg2 = css('--fg-2', '#8294a9');
    const line = css('--line', '#243246');
    const c = simClock();
    const hours = windowHours(p.win);
    const ms = windowMs(hours, c.speed);
    const lo = simAt(c, c.nowMs - ms);
    const hi = simAt(c, c.nowMs);
    const step = tickStep(hours);
    const labelVals: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) labelVals.push(v);
    const axes = p.axes ?? [''];
    const marks = (p.lines ?? [])
      .map((l) => ({ l, v: rawNum(l.tag) }))
      .filter((x) => Number.isFinite(x.v))
      .map(({ l, v }) => ({
        yAxis: v,
        name: l.label,
        lineStyle: { color: l.color, type: 'dashed' as const, width: 1 },
        label: l.quiet ? { show: false } : { formatter: `${l.label} ${(+v.toFixed(2)).toString()}`, color: l.color, fontSize: 10, position: 'insideEndTop' as const },
      }));
    return {
      animation: false,
      backgroundColor: 'transparent',
      textStyle: { fontFamily: css('--font-mono', 'monospace') },
      grid: { left: 46, right: axes.length > 1 ? 46 : 14, top: 28, bottom: 22 },
      legend: { top: 0, right: 0, textStyle: { color: fg2, fontSize: 10 }, itemWidth: 12, itemHeight: 3, icon: 'rect', type: 'scroll' },
      tooltip: {
        trigger: 'axis',
        backgroundColor: css('--bg-2', '#111a26'),
        borderColor: line,
        textStyle: { color: css('--fg-0', '#e8eef6'), fontSize: 11 },
        axisPointer: { label: { formatter: (a: { value: number | string }) => hourLabel(Number(a.value), hours > 8, true) } },
        valueFormatter: (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : String(v)),
      },
      xAxis: {
        type: 'value',
        min: lo,
        max: hi,
        axisLabel: { color: fg2, fontSize: 10, customValues: labelVals, formatter: (v: number) => hourLabel(v, hours > 8) },
        axisTick: { customValues: labelVals },
        axisLine: { lineStyle: { color: line } },
        splitLine: { show: true, customValues: labelVals, lineStyle: { color: line, opacity: 0.35 } },
      },
      yAxis: axes.map((name, i) => ({
        type: 'value',
        scale: !(i === 0 && p.yRange),
        min: i === 0 && p.yRange ? p.yRange[0] : undefined,
        max: i === 0 && p.yRange ? p.yRange[1] : undefined,
        name,
        nameTextStyle: { color: fg2, fontSize: 10 },
        position: i === 0 ? 'left' : 'right',
        axisLabel: { color: fg2, fontSize: 10, formatter: (v: number) => String(+v.toFixed(2)) },
        splitLine: { show: i === 0, lineStyle: { color: line } },
      })),
      series: p.signals.map((s, i) => ({
        name: s.label,
        type: 'line',
        yAxisIndex: s.axis ?? 0,
        showSymbol: false,
        sampling: 'lttb',
        stack: s.stack,
        areaStyle: s.area ? { opacity: 0.55, color: s.color } : undefined,
        lineStyle: { width: s.width ?? 1.5, color: s.color, type: s.dashed ? 'dashed' : 'solid' },
        itemStyle: { color: s.color },
        data: (data.get(s.id) ?? []).map(([t, v]) => [simAt(c, t), v]),
        markLine: i === 0 && marks.length ? { silent: true, symbol: 'none', data: marks } : undefined,
      })),
    };
  }

  /** `replace` rebuilds the series set (window or signals changed); ticks merge so the legend selection survives. */
  const draw = (replace = false) => chart?.setOption(option(), { notMerge: replace });

  async function load(): Promise<void> {
    const mine = ++epoch;
    setNote('');
    const signals = p.signals;
    data = new Map(signals.map((s) => [s.id, [] as Point[]]));
    draw(true);
    try {
      const hist = await fetchSeries(signals, windowMs(windowHours(p.win)));
      if (mine !== epoch || disposed) return;
      for (const s of signals) {
        const h = hist.get(s.id) ?? [];
        const last = h.length ? h[h.length - 1][0] : 0;
        data.set(s.id, h.concat((data.get(s.id) ?? []).filter((q) => q[0] > last)));
      }
      if ([...data.values()].every((d) => d.length === 0)) setNote('No history yet; showing live values.');
      else if (p.liveOnly) setNote(p.liveOnly);
      draw(true);
    } catch (e) {
      if (mine === epoch) setNote(`History unavailable (${e instanceof Error ? e.message : 'error'}); showing live values.`);
    }
  }

  /** Append the live value once per history bucket and drop what left the window; redraw only when the data changed. */
  function tick(): void {
    const now = Date.now();
    const ms = windowMs(windowHours(p.win));
    const bucket = ms / POINTS;
    let changed = false;
    for (const s of p.signals) {
      const arr = data.get(s.id);
      if (!arr) continue;
      const v = valueOf(s, (t) => plausible(rawNum(t)));
      if (v !== null && (!arr.length || now - arr[arr.length - 1][0] >= bucket)) {
        arr.push([now, v]);
        changed = true;
      }
      while (arr.length && arr[0][0] < now - ms) {
        arr.shift();
        changed = true;
      }
    }
    if (changed) draw();
  }

  onMount(() => {
    void loadEcharts().then((ec) => {
      if (disposed) return;
      chart = ec.init(el);
      ro = new ResizeObserver(() => chart?.resize());
      ro.observe(el);
      setReady(true);
      timer = window.setInterval(() => !document.hidden && tick(), 250);
    });
  });
  onCleanup(() => {
    disposed = true;
    clearInterval(timer);
    ro?.disconnect();
    chart?.dispose();
    chart = null;
  });

  // Reload when the window or the signal set changes (selection switches the target chart set).
  createEffect(
    on([ready, () => p.win, () => p.signals.map((s) => s.id + ':' + s.tags.join('+')).join('|')], ([r]) => {
      if (r) untrack(() => void load());
    }),
  );

  return (
    <figure class="tc" classList={{ tall: p.tall }}>
      <figcaption>
        {p.title}
        {note() ? <small>{note()}</small> : null}
      </figcaption>
      <div ref={el} class="plot" />
    </figure>
  );
}
