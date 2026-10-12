import { useEffect, useRef } from 'react';
import { UNITS } from '../../live/units';
import type { TagName } from '../../live/paths';
import { echarts, GROUP } from './echarts';
import { onFrame, series } from './feed';
import { shortName } from './channels';

const css = (name: string, fallback: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** One strip chart. Updates itself from the shared ticker (no React state); `paused` freezes the display. */
export function ChartCell({ tag, windowMs, paused, version }: { tag: TagName; windowMs: number; paused: boolean; version: number }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ windowMs, paused });
  live.current = { windowMs, paused };
  const render = useRef<(force: boolean) => void>(() => {});

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const fg = css('--fg-2', '#6f8196');
    const line = css('--line', '#243246');
    const accent = css('--accent', '#ff7a2f');
    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    chart.group = GROUP;
    echarts.connect(GROUP);
    const unit = UNITS[tag];
    let end = Date.now();
    chart.setOption({
      animation: false,
      grid: { left: 44, right: 10, top: 26, bottom: 18 },
      title: { text: shortName(tag), textStyle: { color: fg, fontSize: 11, fontWeight: 500 }, left: 4, top: 2 },
      tooltip: { trigger: 'axis', confine: true, axisPointer: { type: 'line', snap: true }, backgroundColor: '#0a1018', borderColor: line, textStyle: { color: '#e8eef6', fontSize: 11 }, valueFormatter: (v: unknown) => `${typeof v === 'number' ? v.toFixed(2) : v} ${unit}` },
      xAxis: { type: 'time', axisLabel: { color: fg, fontSize: 10, hideOverlap: true }, axisLine: { lineStyle: { color: line } }, splitLine: { show: false } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: fg, fontSize: 10 }, splitLine: { lineStyle: { color: line, opacity: 0.5 } } },
      series: [{ type: 'line', showSymbol: false, sampling: 'lttb', lineStyle: { width: 1.5, color: accent }, itemStyle: { color: accent }, areaStyle: { color: accent, opacity: 0.08 }, data: [] }],
    });
    render.current = (force) => {
      const { windowMs: w, paused: p } = live.current;
      if (p && !force) return;
      if (!p) end = Date.now();
      const data = series(tag, w, end);
      const last = data.length ? data[data.length - 1][1] : NaN;
      chart.setOption({
        title: { text: `${shortName(tag)}   ${Number.isFinite(last) ? last.toFixed(2) : '--'} ${unit}` },
        xAxis: { min: end - w, max: end },
        series: [{ data }],
      });
    };
    render.current(true);
    const off = onFrame(() => render.current(false));
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      off();
      ro.disconnect();
      chart.dispose();
    };
  }, [tag]);

  // Window change or fresh history: redraw now, even when paused.
  useEffect(() => render.current(true), [windowMs, version]);

  return <div className="chart" ref={host} role="img" aria-label={`${shortName(tag)} trend`} />;
}
