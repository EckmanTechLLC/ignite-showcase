import { For, Show } from 'solid-js';
import { help, setHelp } from './ui';

const KEYS: [string, string][] = [
  ['?', 'This panel (also ?about in the URL)'],
  ['R', 'Reset the camera (fit to the window)'],
  ['Drag / wheel', 'Pan / zoom the plant'],
  ['Click', 'Select a vessel, machine, utility or batch (Esc clears)'],
  ['Esc', 'Close this panel, then clear the selection'],
  ['P', 'Performance readout (when the URL has ?perf)'],
  ['T A C B L', 'Trends, alarms, controls, batch, login: arrive with the overlays'],
];
const PITCH = [
  'A craft brewery drawn as a live isometric plant: brewhouse, 12 fermenters, 4 bright tanks, a canning line and the utilities.',
  'Every number comes from Ignition through the Ignite REST API; the page is served by the gateway itself.',
  'One SSE connection carries all 908 tags (folder patterns on [default]BR); the first message is a snapshot.',
  'Vessels show level, temperature and phase; each carries its batch tag in the recipe colour. Pipes carry wort, beer, glycol and steam only while they flow.',
  'The strip on top is a live ISA-88 Gantt: every batch across mash, lauter, boil, whirlpool, knock-out, fermentation, conditioning and packaging.',
  'The tile on the right is the line OEE: availability x performance x quality, with the current downtime reason.',
  'Time is compressed: 1 real minute = 1 simulated hour, and fermentation runs 8 times faster again (a batch takes about 50 real minutes).',
  'Procedural art only; no other host is contacted. Try the filler_jam scenario through the script route and watch the line.',
];

export default function Help() {
  return (
    <Show when={help()}>
      <div class="scrim" role="presentation" onClick={() => setHelp(false)} />
      <div class="help-panel" role="dialog" aria-modal="true" aria-label="About this page">
        <div class="head">
          <h2>About this page</h2>
          <button aria-label="Close" onClick={() => setHelp(false)}>×</button>
        </div>
        <ol class="pitch">
          <For each={PITCH}>{(l) => <li>{l}</li>}</For>
        </ol>
        <h3>Keyboard and mouse</h3>
        <dl class="keys">
          <For each={KEYS}>
            {([k, d]) => (
              <div>
                <dt><kbd>{k}</kbd></dt>
                <dd>{d}</dd>
              </div>
            )}
          </For>
        </dl>
      </div>
    </Show>
  );
}
