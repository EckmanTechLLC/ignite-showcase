<script lang="ts">
  import Utility from './Utility.svelte';
  import Pv from './Pv.svelte';
  import PvFlyout from './PvFlyout.svelte';
  import Bess from './Bess.svelte';
  import Genset from './Genset.svelte';
  import Bldg from './Bldg.svelte';
  import Bank from './Bank.svelte';
  import { sel, select } from '../selection.svelte';
  import { tagBool, tagNum, tagStr } from '../live/store.svelte';
  import { num } from '../fmt';
  import { BUS_Y, PV_ARRAYS, PV_X, BESS_IDS, BLDG_IDS } from './model';

  const island = $derived(tagBool('Grid/Islanded'));
  const mode = $derived(tagStr('KPI/Mode'));
  const hz = $derived(tagNum('Grid/FrequencyHz'));
  const volts = $derived(tagNum('Grid/VoltageV'));
  const flyId = $derived(sel.hover?.kind === 'pv' ? sel.hover.id : null);
  const flyX = $derived(flyId ? PV_X[PV_ARRAYS.indexOf(flyId as (typeof PV_ARRAYS)[number])] : 0);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
<svg viewBox="0 0 1600 780" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Campus single-line diagram" class:island onclick={() => select(null)}>
  <!-- main switchboard -->
  <rect class="bus" x="230" y={BUS_Y - 6} width="1345" height="12" rx="3" />
  <text class="bus-label" x="840" y={BUS_Y + 30}>MAIN SWITCHBOARD &middot; {num(volts, 0)} V &middot; {num(hz, 2)} Hz</text>
  {#if island}<text class="island-banner" x="1565" y={BUS_Y + 30} text-anchor="end">ISLANDED &middot; {mode}</text>{/if}

  <Utility />
  {#each PV_ARRAYS as id, i (id)}<Pv {id} x={PV_X[i]} />{/each}
  <Genset x={1122} />
  {#each BESS_IDS as id, i (id)}<Bess {id} x={1284 + i * 142} />{/each}
  {#each BLDG_IDS as id, i (id)}<Bldg {id} x={250 + i * 220} />{/each}
  <Bank />
  {#if flyId}<PvFlyout id={flyId} x={flyX} />{/if}
</svg>
