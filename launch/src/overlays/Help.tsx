import { PRESETS } from '../cameras/presets';
import { Panel } from './Panel';

const KEYS: [string, string][] = [
  [PRESETS.filter((p) => p.key).map((p) => p.key).join(' '), 'Camera presets'],
  ['D', 'Auto-director'],
  ['T', 'Telemetry charts'],
  ['A', 'Alarm board'],
  ['C', 'Sequencer controls'],
  ['L', 'Login, session, audit'],
  ['?', 'This panel (also ?about in the URL)'],
  ['Esc', 'Close panels'],
  ['P', 'Performance readout (when the URL has ?perf)'],
];

/** Shortcut list and a short description of what the page does with Ignite. */
export default function Help() {
  return (
    <Panel id="help" title="About this page" hint="?">
      <p>
        A launch-operations screen built on any-stack web tech and served by the Ignition gateway itself. Every number, alarm and
        command comes from Ignition through the Ignite REST API.
      </p>
      <ul className="help-list">
        <li>One SSE connection (<code>/sse</code>, folder subscription) feeds the 3D scene and HUD.</li>
        <li><code>/tags/history</code> back-fills Telemetry; <code>/alarms/status</code> and <code>/alarms/acknowledge</code> drive the alarm board.</li>
        <li><code>/script/library</code> runs the sequencer commands; the sim lives in gateway timer scripts.</li>
        <li><code>/auth/login</code> and <code>/auth/session</code> set the tier; <code>/audit/logs</code> shows the trail.</li>
        <li>Auth tiers: Viewer (site read key) sees everything, Operator acknowledges and commands, Director adds scenarios and audit.</li>
        <li>The gateway enforces every tier; the page only hides what a tier cannot do.</li>
        <li>No other host is contacted: fonts, geometry and textures are bundled or generated in code.</li>
      </ul>
      <h3>Keyboard</h3>
      <dl className="help-keys">
        {KEYS.map(([k, d]) => (
          <div key={k}>
            <dt><kbd>{k}</kbd></dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
