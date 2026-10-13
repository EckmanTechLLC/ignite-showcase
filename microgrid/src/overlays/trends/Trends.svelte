<script lang="ts">
  import Panel from '../Panel.svelte';
  import Chart from './Chart.svelte';
  import { DEFAULT_CHARTS, chartsFor } from './defs';
  import { WINDOWS, type WindowKey } from './history';
  import { live } from '../../live/store.svelte';
  import { sel } from '../../selection.svelte';

  let win = $state<WindowKey>('today');
  const picked = $derived(chartsFor(sel.target));
</script>

<Panel title="Trends" hotkey="T">
  {#snippet head()}
    {#each Object.entries(WINDOWS) as [k, w] (k)}
      <button class="pill" class:on={win === k} onclick={() => (win = k as WindowKey)}>{w.label}</button>
    {/each}
  {/snippet}

  {#if live.history === 'unavailable'}<p class="warn" role="status">History unavailable: the gateway trial may have expired. Charts fill from live values.</p>{/if}
  <p class="hint">X axis in simulated hours (24 h = 12 real minutes at 120×). History reads the 1 s tags, 144 points per window.</p>

  {#if picked}
    <h3>{picked.name} <small>selected in the diagram &middot; Esc clears</small></h3>
    {#each picked.charts as c (c.key)}
      <Chart title={c.title} signals={c.signals} {win} axes={c.axes} lines={c.lines} shade={c.shade} liveOnly={c.liveOnly} />
    {/each}
    <h3>Campus</h3>
  {:else}
    <p class="hint">Click an array, battery, charger or building in the diagram to chart it here.</p>
  {/if}
  {#each DEFAULT_CHARTS as c (c.key)}
    <Chart title={c.title} signals={c.signals} {win} axes={c.axes} lines={c.lines} shade={c.shade} liveOnly={c.liveOnly} />
  {/each}
</Panel>

<style>
  .pill { font: 500 var(--text-xs) var(--font-mono); color: var(--fg-1); background: var(--bg-2); border: 1px solid var(--line-strong); border-radius: 10px; padding: 1px 9px; cursor: pointer; }
  .pill.on { color: var(--accent); border-color: var(--accent); }
  h3 { margin: var(--space-3) 0 var(--space-2); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
  h3 small { color: var(--fg-2); text-transform: none; letter-spacing: 0; margin-left: 6px; }
  .hint { margin: 0 0 var(--space-2); color: var(--fg-2); font-size: var(--text-xs); }
  .warn { margin: 0 0 var(--space-2); color: var(--warn); font-size: var(--text-xs); }
</style>
