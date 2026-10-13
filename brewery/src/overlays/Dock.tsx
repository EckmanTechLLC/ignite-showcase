import { For, Show } from 'solid-js';
import { panel, togglePanel, type PanelKey } from '../ui';
import { identity } from '../identity';
import { activeRows, hasSevere } from './alarms/store';

const DOCK: { key: PanelKey; hot: string; label: string }[] = [
  { key: 'batch', hot: 'B', label: 'Batch' },
  { key: 'trends', hot: 'T', label: 'Trends' },
  { key: 'alarms', hot: 'A', label: 'Alarms' },
  { key: 'controls', hot: 'C', label: 'Controls' },
  { key: 'identity', hot: 'L', label: 'Login' },
];

export default function Dock() {
  return (
    <nav class="dock mono" aria-label="Overlays">
      <For each={DOCK}>
        {(d) => (
          <button classList={{ on: panel() === d.key, crit: d.key === 'alarms' && hasSevere() }} aria-pressed={panel() === d.key} title={`${d.label} (${d.hot})`} onClick={() => togglePanel(d.key)}>
            <b>{d.hot}</b>
            <span>{d.label}</span>
            <Show when={d.key === 'alarms' && activeRows().length > 0}>
              <i class="n">{activeRows().length}</i>
            </Show>
          </button>
        )}
      </For>
      <div class={`tier ${identity().tier.toLowerCase()}`} title={identity().method === 'web' ? `Gateway session: ${identity().user}` : 'Session tier'}>
        {identity().method === 'web' ? 'Gateway ' : ''}{identity().tier}
      </div>
    </nav>
  );
}
