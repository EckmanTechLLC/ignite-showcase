<script lang="ts">
  import Flow from './Flow.svelte';
  import { hit } from './hit';
  import { sel, same } from '../selection.svelte';
  import { tagBool, tagNum } from '../live/store.svelte';
  import { num } from '../fmt';
  import { BUS_Y, LOAD_Y, BLDG_NAME, speedOf } from './model';

  let { id, x }: { id: string; x: number } = $props();
  const W = 200;
  const H = 150;
  const cx = $derived(x + W / 2);
  const n = (s: string) => tagNum(`Loads/Bldg${id}/${s}`);
  const kw = $derived(n('kW'));
  const hvac = $derived(n('HVACkW'));
  const critical = $derived(tagBool(`Loads/Bldg${id}/Critical`));
  const shed = $derived(tagBool(`Loads/Bldg${id}/Shed`));
  const island = $derived(tagBool('Grid/Islanded'));
  const frac = $derived(kw > 0 ? Math.min(1, Math.max(0, hvac / kw)) : 0);
  const selected = $derived(same(sel.target, { kind: 'bldg', id }));
</script>

<!-- bus to load: always forward (down). Shed loads draw nothing, so the feeder dies. -->
<Flow d={`M${cx} ${BUS_Y + 4} V${LOAD_Y}`} color={island ? 'var(--island)' : 'var(--load)'} speed={speedOf(kw)} active={kw >= 0.5 && !shed} />
<text class="lbl" x={cx + 8} y={430}>{shed ? 'shed' : `${num(kw, 0)} kW`}</text>

<g use:hit={{ kind: 'bldg', id }} aria-label={`Building ${id} ${BLDG_NAME[id]}`} class:selected class:shed>
  <rect class="card" {x} y={LOAD_Y} width={W} height={H} rx="6" />
  <text class="title" x={x + 12} y={LOAD_Y + 22}>BLDG {id} &middot; {BLDG_NAME[id]}</text>
  {#if critical}<g><rect class="badge ok" x={x + W - 74} y={LOAD_Y + 34} width="62" height="18" rx="9" /><text class="bt ok" x={x + W - 43} y={LOAD_Y + 47} text-anchor="middle">CRITICAL</text></g>{/if}
  <text class="big" x={x + 12} y={LOAD_Y + 62}>{num(kw, 0)}<tspan class="unit"> kW</tspan></text>
  <text class="sm" x={x + 12} y={LOAD_Y + 90}>HVAC {num(hvac, 0)} kW &middot; {num(frac * 100, 0)} %</text>
  <rect class="bar-bg" x={x + 12} y={LOAD_Y + 98} width="176" height="8" rx="4" />
  <rect class="bar" x={x + 12} y={LOAD_Y + 98} width={176 * frac} height="8" rx="4" fill="var(--info)" />
  <text class="sm" x={x + 12} y={LOAD_Y + 128} fill={shed ? 'var(--warn)' : 'var(--fg-2)'}>{shed ? 'SHED (islanded)' : critical ? 'served in island mode' : 'dropped if islanded'}</text>
</g>
