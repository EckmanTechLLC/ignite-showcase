<script lang="ts">
  import { onMount } from 'svelte';
  import Hud from './hud/Hud.svelte';
  import DayStrip from './strip/DayStrip.svelte';
  import Diagram from './diagram/Diagram.svelte';
  import Tooltip from './Tooltip.svelte';
  import Help from './Help.svelte';
  import PerfReadout from './PerfReadout.svelte';
  import { startLive, stopLive } from './live/store.svelte';
  import { startIdentity } from './identity.svelte';
  import { sel } from './selection.svelte';
  import { ui } from './ui.svelte';

  onMount(() => {
    startLive();
    startIdentity();
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === '?') ui.help = !ui.help;
      else if (e.key === 'Escape') {
        if (ui.help) ui.help = false;
        else sel.target = null;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stopLive();
    };
  });
</script>

<Hud />
<DayStrip />
<main class="stage"><Diagram /></main>
<Tooltip />
<Help />
<PerfReadout />
