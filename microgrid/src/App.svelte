<script lang="ts">
  import { onMount } from 'svelte';
  import Hud from './hud/Hud.svelte';
  import DayStrip from './strip/DayStrip.svelte';
  import Diagram from './diagram/Diagram.svelte';
  import Tooltip from './Tooltip.svelte';
  import Help from './Help.svelte';
  import PerfReadout from './PerfReadout.svelte';
  import Dock from './overlays/Dock.svelte';
  import Toasts from './overlays/Toasts.svelte';
  import AlarmBoard from './overlays/alarms/AlarmBoard.svelte';
  import Trends from './overlays/trends/Trends.svelte';
  import Controls from './overlays/controls/Controls.svelte';
  import Identity from './overlays/identity/Identity.svelte';
  import { startAlarms } from './overlays/alarms/store.svelte';
  import { startLive, stopLive } from './live/store.svelte';
  import { startIdentity } from './identity.svelte';
  import { sel } from './selection.svelte';
  import { ui, togglePanel, type PanelKey } from './ui.svelte';

  const KEYS: Record<string, PanelKey> = { t: 'trends', a: 'alarms', c: 'controls', l: 'identity' };

  onMount(() => {
    startLive();
    startIdentity();
    startAlarms();
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const panel = KEYS[e.key.toLowerCase()];
      if (e.key === '?') ui.help = !ui.help;
      else if (panel) togglePanel(panel);
      else if (e.key === 'Escape') {
        if (ui.help) ui.help = false;
        else if (sel.target) sel.target = null;
        else ui.panel = null;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stopLive();
    };
  });

  // Click-to-trend: picking an element opens Trends unless another panel is already open.
  $effect(() => {
    if (sel.target && !ui.panel) ui.panel = 'trends';
  });
</script>

<Hud />
<DayStrip />
<main class="stage"><Diagram /></main>
<Tooltip />
<Dock />
{#if ui.panel === 'trends'}<Trends />{:else if ui.panel === 'alarms'}<AlarmBoard />{:else if ui.panel === 'controls'}<Controls />{:else if ui.panel === 'identity'}<Identity />{/if}
<Help />
<Toasts />
<PerfReadout />
