<script lang="ts">
  import { tagNum, tagStr } from '../live/store.svelte';
  import { num } from '../fmt';
  import { SRC_Y, SRC_H, invTone, healthTone, TONE } from './model';

  // Hover detail of one array: 2 inverters x 3 strings (S1-S3 on A, S4-S6 on B), string health and power.
  let { id, x }: { id: string; x: number } = $props();
  const W = 330;
  const fx = $derived(Math.min(Math.max(x - 10, 10), 1600 - W - 10));
  const Y = SRC_Y + SRC_H + 8;
  const INV = [
    { key: 'A', strings: [1, 2, 3] },
    { key: 'B', strings: [4, 5, 6] },
  ];
</script>

<g class="flyout" pointer-events="none">
  <rect class="fly-bg" x={fx} y={Y} width={W} height="170" rx="8" />
  <text class="title" x={fx + 12} y={Y + 20}>ARRAY {id} &middot; 2 INVERTERS &times; 6 STRINGS</text>
  {#each INV as inv, r (inv.key)}
    {@const st = tagStr(`PV/${id}/Inverter/${inv.key}/State`)}
    {@const oy = Y + 32 + r * 66}
    <text class="sm" x={fx + 12} y={oy + 12} fill={TONE[invTone(st)]}>INV {inv.key} {st || '—'}</text>
    <text class="sm" x={fx + W - 12} y={oy + 12} text-anchor="end">{num(tagNum(`PV/${id}/Inverter/${inv.key}/ACkW`), 1)} kW &middot; {num(tagNum(`PV/${id}/Inverter/${inv.key}/TempC`), 0)} &deg;C &middot; {num(tagNum(`PV/${id}/Inverter/${inv.key}/Efficiency`), 0)} %</text>
    {#each inv.strings as s, i (s)}
      {@const h = tagNum(`PV/${id}/String/S${s}/Health`)}
      {@const kw = tagNum(`PV/${id}/String/S${s}/DCkW`)}
      {@const sx = fx + 12 + i * 104}
      <rect class="tile" x={sx} y={oy + 20} width="98" height="38" rx="4" stroke={TONE[healthTone(h)]} />
      <text class="sm" x={sx + 6} y={oy + 34}>S{s}</text>
      <text class="sm" x={sx + 92} y={oy + 34} text-anchor="end" fill={TONE[healthTone(h)]}>{num(h, 0)} %</text>
      <text class="sm" x={sx + 6} y={oy + 51}>{num(kw, 1)} kW</text>
    {/each}
  {/each}
</g>
