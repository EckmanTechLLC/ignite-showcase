// Tree-shaken ECharts: only what the strip charts use. This module is imported only from the lazy telemetry chunk.
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, TitleComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, GridComponent, TooltipComponent, TitleComponent, CanvasRenderer]);

export { echarts };
export const GROUP = 'launch-telemetry';
