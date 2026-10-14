import { For, Show, createMemo, createSignal } from 'solid-js';
import Panel from '../Panel';
import Chart from './Chart';
import Waterfall from './Waterfall';
import { OEE_CHART, UTILITY_CHARTS, cellarTempChart, chartsFor, fermentationChart, fermentingFvs, type ChartDef } from './defs';
import { WINDOW_LABEL, type WindowKey } from './history';
import { live, tagStr } from '../../live/store';
import { sel, selectedBatch, setSel } from '../../selection';
import { togglePanel } from '../../ui';
import { FVS } from '../../model';

export default function Trends() {
  const [win, setWin] = createSignal<WindowKey>('shift');
  const picked = createMemo(() => chartsFor(sel()));
  const fvs = createMemo(() => fermentingFvs(tagStr).join(','), '');
  const active = createMemo(() => FVS.filter((f) => tagStr(`Cellar/${f}/Phase`) !== 'EMPTY' && tagStr(`Cellar/${f}/BatchId`) !== '').join(','), '');
  const list = (s: string) => (s ? s.split(',') : []);
  const ferment = createMemo(() => fermentationChart(list(fvs())));
  const cellar = createMemo(() => cellarTempChart(list(active())));
  const Draw = (p: { c: ChartDef }) => <Chart title={p.c.title} signals={p.c.signals} win={win()} axes={p.c.axes} lines={p.c.lines} liveOnly={p.c.liveOnly} yRange={p.c.yRange} tall={p.c.tall} />;

  return (
    <Panel
      title="Trends"
      hotkey="T"
      head={
        <For each={Object.entries(WINDOW_LABEL)}>
          {([k, label]) => (
            <button class="pill" classList={{ on: win() === k }} onClick={() => setWin(k as WindowKey)}>{label}</button>
          )}
        </For>
      }
    >
      <Show when={live.history === 'unavailable'}>
        <p class="warn" role="status">Trial expired: history is paused. Charts fill from live values.</p>
      </Show>
      <p class="hint">X axis in simulated time (1 real minute = 1 simulated hour at 60×; D = sim day). History reads the 1 s tags, {240} points per window; live values are appended per bucket.</p>

      <Show when={picked()} fallback={<p class="hint">Click a vessel, machine or utility in the plant to chart it here.</p>}>
        {(pk) => (
          <>
            <h3>
              {pk().name} <small>selected in the plant · Esc clears</small>
              <Show when={selectedBatch()}>
                <button class="act sm" style={{ 'margin-left': '8px' }} onClick={() => togglePanel('batch')}>Open batch {selectedBatch()}</button>
              </Show>
            </h3>
            <For each={pk().charts}>{(c) => <Draw c={c} />}</For>
            <Show when={sel()}><button class="act sm" onClick={() => setSel(null)}>Clear selection</button></Show>
          </>
        )}
      </Show>

      <h3>Fermentation</h3>
      <Show when={list(fvs()).length} fallback={<p class="hint">No fermenter is fermenting right now.</p>}>
        <Draw c={ferment()} />
      </Show>
      <Draw c={cellar()} />

      <h3>Packaging line</h3>
      <Draw c={OEE_CHART} />
      <Waterfall />

      <h3>Utilities</h3>
      <For each={UTILITY_CHARTS}>{(c) => <Draw c={c} />}</For>
    </Panel>
  );
}
