<script lang="ts">
  import { ui } from './ui.svelte';

  const KEYS: [string, string][] = [
    ['?', 'This panel (also ?about in the URL)'],
    ['T', 'Trends: forecast vs actual, import vs baseline, SOC, cost'],
    ['A', 'Alarm board with acknowledge'],
    ['C', 'Controls: dispatch and scenarios by tier'],
    ['L', 'Login, identity and audit'],
    ['Esc', 'Close this panel, then clear the selection, then the open overlay'],
    ['P', 'Performance readout (when the URL has ?perf)'],
    ['Tab / Enter', 'Move between elements / select one'],
  ];
  const PITCH = [
    'A campus microgrid, drawn as a live single-line diagram: utility, switchboard, PV, batteries, genset, EV chargers, buildings.',
    'Every number comes from Ignition through the Ignite REST API; the page is served by the gateway itself.',
    'One SSE connection on a folder pattern (/sse, [default]MG/**) carries all 405 tags; the first message is a snapshot.',
    'Conductor dashes run in the direction of power and speed up with kW; dead paths stop.',
    'The day is compressed: 24 simulated hours in 12 real minutes. The strip on top shows sun, cloud and tariff.',
    'The cost and CO₂ ticker compares today with a no-PV, no-battery baseline computed in the same tick.',
    'Try the grid_outage scenario: the campus islands, the genset starts, PV curtails to balance.',
    'No other host is contacted: fonts are bundled and the diagram is plain SVG.',
  ];
</script>

{#if ui.help}
  <div class="scrim" role="presentation" onclick={() => (ui.help = false)}></div>
  <div class="panel" role="dialog" aria-modal="true" aria-label="About this page">
    <header>
      <h2>About this page</h2>
      <button aria-label="Close" onclick={() => (ui.help = false)}>&times;</button>
    </header>
    <ol class="pitch">{#each PITCH as l (l)}<li>{l}</li>{/each}</ol>
    <h3>Keyboard</h3>
    <dl class="keys">
      {#each KEYS as [k, d] (k)}<div><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>{/each}
    </dl>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 39; background: rgb(0 0 0 / 0.45); }
  .panel { position: fixed; z-index: 40; right: var(--space-5); top: calc(var(--hud-h) + var(--space-4)); width: min(520px, calc(100vw - 2 * var(--space-5))); max-height: calc(100vh - var(--hud-h) - 2 * var(--space-5)); overflow: auto; padding: var(--space-4) var(--space-5); background: var(--bg-2); border: 1px solid var(--line-strong); border-radius: var(--radius-3); box-shadow: 0 16px 48px rgb(0 0 0 / 0.6); color: var(--fg-1); font-size: var(--text-sm); }
  header { display: flex; justify-content: space-between; align-items: center; }
  h2 { margin: 0; color: var(--accent); font-size: var(--text-md); letter-spacing: 0.08em; text-transform: uppercase; }
  button { font: 700 var(--text-lg) var(--font-mono); color: var(--fg-1); background: none; border: 0; cursor: pointer; }
  .pitch { margin: var(--space-3) 0; padding-left: 1.4em; display: flex; flex-direction: column; gap: 6px; }
  h3 { margin: var(--space-3) 0 var(--space-2); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-2); }
  .keys { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px var(--space-3); }
  .keys > div { display: contents; }
  dt { text-align: right; }
  dd { margin: 0; color: var(--fg-1); }
  kbd { font: 500 var(--text-xs) var(--font-mono); color: var(--fg-1); border: 1px solid var(--line-strong); border-radius: var(--radius-2); padding: 0 5px; }
</style>
