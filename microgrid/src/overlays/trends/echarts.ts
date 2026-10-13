import type { EChartsType } from 'echarts/core';

/** ECharts is loaded on first use so the scene bundle stays small (Vite splits this into its own chunk). */
export type Echarts = { init: (el: HTMLElement) => EChartsType };

let loading: Promise<Echarts> | null = null;

export function loadEcharts(): Promise<Echarts> {
  loading ??= (async () => {
    const [core, line, comps, canvas] = await Promise.all([
      import('echarts/core'),
      import('echarts/charts').then((m) => m.LineChart),
      import('echarts/components').then((m) => [m.GridComponent, m.TooltipComponent, m.MarkLineComponent, m.MarkAreaComponent, m.LegendComponent]),
      import('echarts/renderers').then((m) => m.CanvasRenderer),
    ]);
    core.use([line, ...comps, canvas]);
    return { init: (el) => core.init(el, undefined, { renderer: 'canvas' }) };
  })();
  return loading;
}
