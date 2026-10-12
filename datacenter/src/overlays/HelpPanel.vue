<script setup lang="ts">
import Panel from './Panel.vue';

const KEYS: [string, string][] = [
  ['A', 'Alarm board'],
  ['T', 'Trends'],
  ['C', 'Scenario controls'],
  ['L', 'Login, session, audit'],
  ['?', 'This panel (also ?about in the URL)'],
  ['Esc', 'Close panel or selection'],
  ['P', 'Performance readout (when the URL has ?perf)'],
];
</script>

<template>
  <Panel title="About this page" hotkey="?">
    <p>
      A data-center operations screen built on any-stack web tech and served by the Ignition gateway itself. Every value,
      alarm and command comes from Ignition through the Ignite REST API.
    </p>
    <ul class="list">
      <li>One SSE connection (<code>/sse</code>, folder subscription) feeds the animated SVG hall.</li>
      <li><code>/tags/history</code> drives Trends; <code>/alarms/status</code> and <code>/alarms/acknowledge</code> drive the alarm board.</li>
      <li><code>/script/library</code> runs the scenario controls; the sim lives in gateway timer scripts.</li>
      <li><code>/auth/login</code> and <code>/auth/session</code> set the tier; <code>/audit/logs</code> shows the trail.</li>
      <li>Auth tiers: Viewer (site read key) sees everything, Operator acknowledges and runs scenarios, Director adds speed and audit.</li>
      <li>The gateway enforces every tier; the page only hides what a tier cannot do.</li>
      <li>No other host is contacted: fonts are bundled and the hall is drawn in SVG.</li>
    </ul>
    <h3>Keyboard</h3>
    <dl class="keys">
      <div v-for="[k, d] in KEYS" :key="k"><dt><kbd>{{ k }}</kbd></dt><dd>{{ d }}</dd></div>
    </dl>
  </Panel>
</template>

<style scoped>
p { margin: 0 0 var(--space-3); }
.list { margin: 0; padding-left: 1.1em; display: flex; flex-direction: column; gap: 6px; }
code { color: var(--fg-0); }
h3 { margin: var(--space-3) 0 var(--space-2); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-2); }
.keys { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px var(--space-3); }
.keys > div { display: contents; }
dt { text-align: right; }
dd { margin: 0; color: var(--fg-1); }
kbd { font: 500 var(--text-xs) var(--font-mono); color: var(--fg-1); border: 1px solid var(--line-strong); border-radius: var(--radius-2); padding: 0 5px; }
</style>
