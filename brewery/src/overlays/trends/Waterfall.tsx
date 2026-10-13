import { createSignal, onCleanup, onMount } from 'solid-js';
import type { EChartsType } from 'echarts/core';
import { rawNum } from '../../live/store';
import { loadEcharts } from './echarts';
import { bars, waterfall } from './waterfall';

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** OEE waterfall of the current shift: planned minutes down to good minutes, from the live OEE counters (redraws when they change). */
export default function Waterfall() {
  let el!: HTMLDivElement;
  let chart: EChartsType | null = null;
  let timer = 0;
  let last = '';
  let ro: ResizeObserver | undefined;
  const [cap, setCap] = createSignal('');

  function draw(): void {
    if (!chart) return;
    const wf = waterfall(rawNum('Packaging/OEE/PlannedMin'), rawNum('Packaging/OEE/RunMin'), rawNum('Packaging/OEE/DownMin'), rawNum('Packaging/OEE/Performance'), rawNum('Packaging/OEE/Quality'));
    const good = rawNum('Packaging/Line/GoodCount');
    const sig = wf ? wf.steps.map((s) => s.minutes.toFixed(1)).join('|') + `|${good}` : 'none';
    if (sig === last) return;
    last = sig;
    if (!wf) {
      setCap('Waiting for planned time in this shift.');
      chart.clear();
      return;
    }
    setCap(`Good time ${wf.goodMin.toFixed(1)} min · ${Number.isFinite(good) ? Math.round(good).toLocaleString('en-US') : '—'} good cans this shift`);
    const { base, value } = bars(wf);
    const fg2 = css('--fg-2', '#8294a9');
    const line = css('--line', '#243246');
    const color = (k: string) => (k === 'total' ? css('--info', '#60a5fa') : k === 'good' ? css('--ok', '#34d399') : css('--alarm', '#f87171'));
    chart.setOption(
      {
        animation: false,
        backgroundColor: 'transparent',
        textStyle: { fontFamily: css('--font-mono', 'monospace') },
        grid: { left: 46, right: 14, top: 14, bottom: 40 },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          backgroundColor: css('--bg-2', '#111a26'),
          borderColor: line,
          textStyle: { color: css('--fg-0', '#e8eef6'), fontSize: 11 },
          formatter: (p: unknown) => {
            const i = (p as { dataIndex: number }[])[0].dataIndex;
            return `${wf.steps[i].name}<br/>${wf.steps[i].kind === 'loss' ? '−' : ''}${wf.steps[i].minutes.toFixed(1)} min`;
          },
        },
        xAxis: { type: 'category', data: wf.steps.map((s) => s.name), axisLabel: { color: fg2, fontSize: 10, interval: 0 }, axisLine: { lineStyle: { color: line } } },
        yAxis: { type: 'value', name: 'min', nameTextStyle: { color: fg2, fontSize: 10 }, axisLabel: { color: fg2, fontSize: 10 }, splitLine: { lineStyle: { color: line } } },
        series: [
          { type: 'bar', stack: 'wf', silent: true, itemStyle: { color: 'transparent' }, data: base },
          {
            type: 'bar',
            stack: 'wf',
            barWidth: '58%',
            data: value.map((v, i) => ({ value: v, itemStyle: { color: color(wf.steps[i].kind) } })),
            label: { show: true, position: 'top', color: fg2, fontSize: 10, formatter: (p: { value: number }) => p.value.toFixed(0) },
          },
        ],
      },
      { notMerge: true },
    );
  }

  onMount(() => {
    let dead = false;
    void loadEcharts().then((ec) => {
      if (dead) return;
      chart = ec.init(el);
      ro = new ResizeObserver(() => chart?.resize());
      ro.observe(el);
      draw();
      timer = window.setInterval(() => !document.hidden && draw(), 1000);
    });
    onCleanup(() => {
      dead = true;
      clearInterval(timer);
      ro?.disconnect();
      chart?.dispose();
      chart = null;
    });
  });

  return (
    <figure class="tc">
      <figcaption>
        OEE waterfall (minutes, this shift)
        {cap() ? <small style={{ color: 'var(--fg-2)' }}>{cap()}</small> : null}
      </figcaption>
      <div ref={el} class="plot" />
    </figure>
  );
}
