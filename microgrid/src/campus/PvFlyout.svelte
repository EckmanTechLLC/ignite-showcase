<script lang="ts">
  import { tagNum, tagStr } from '../live/store.svelte';
  import { sel } from '../selection.svelte';
  import { num } from '../fmt';

  // Hover detail of one array (the PV flyout contract): 2 inverters x 3 strings (S1-S3 on A, S4-S6 on B), string health and power.
  let { id }: { id: string } = $props();
  const INV = [
    { key: 'A', strings: [1, 2, 3] },
    { key: 'B', strings: [4, 5, 6] },
  ];
  const invTone = (s: string) => (s === 'RUN' ? 'ok' : s === 'CURTAILED' ? 'warn' : s === 'FAULT' ? 'alarm' : 'off');
  const healthTone = (h: number) => (!Number.isFinite(h) ? 'off' : h >= 90 ? 'ok' : h >= 75 ? 'warn' : 'alarm');
  const style = $derived.by(() => {
    const left = sel.x > window.innerWidth - 400;
    const up = sel.y > window.innerHeight - 300;
    return `left:${left ? sel.x - 14 : sel.x + 16}px;top:${up ? sel.y - 12 : sel.y + 16}px;transform:translate(${left ? '-100%' : '0'},${up ? '-100%' : '0'})`;
  });
</script>

<div class="fly mono" {style} role="tooltip">
  <div class="h">Array {id} <span>2 inverters &times; 6 strings</span></div>
  {#each INV as inv (inv.key)}
    {@const st = tagStr(`PV/${id}/Inverter/${inv.key}/State`)}
    <div class="inv">
      <b class={invTone(st)}>INV {inv.key} {st || '—'}</b>
      <span>{num(tagNum(`PV/${id}/Inverter/${inv.key}/ACkW`), 1)} kW &middot; {num(tagNum(`PV/${id}/Inverter/${inv.key}/TempC`), 0)} &deg;C &middot; {num(tagNum(`PV/${id}/Inverter/${inv.key}/Efficiency`), 0)} %</span>
    </div>
    <div class="strs">
      {#each inv.strings as s (s)}
        {@const hl = tagNum(`PV/${id}/String/S${s}/Health`)}
        <div class="s {healthTone(hl)}"><span>S{s}</span><b>{num(hl, 0)} %</b><i>{num(tagNum(`PV/${id}/String/S${s}/DCkW`), 1)} kW</i></div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .fly { position: fixed; z-index: 20; width: 340px; padding: var(--space-3); background: color-mix(in srgb, var(--bg-2) 94%, transparent); border: 1px solid var(--accent); border-radius: var(--radius-3); box-shadow: 0 8px 28px rgb(0 0 0 / 0.55); pointer-events: none; font-size: var(--text-xs); color: var(--fg-1); }
  .h { color: var(--accent); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; font-size: var(--text-sm); margin-bottom: var(--space-2); }
  .h span { color: var(--fg-2); font-weight: 400; font-size: var(--text-xs); letter-spacing: 0; text-transform: none; margin-left: 6px; }
  .inv { display: flex; justify-content: space-between; margin: 6px 0 4px; }
  .strs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .s { display: grid; grid-template-columns: 1fr auto; padding: 3px 6px; background: var(--bg-1); border: 1px solid var(--line-strong); border-radius: var(--radius-2); }
  .s i { grid-column: 1 / 3; font-style: normal; color: var(--fg-1); }
  .s.ok { border-color: var(--ok); } .s.warn { border-color: var(--warn); } .s.alarm { border-color: var(--alarm); }
  .s.ok b, b.ok { color: var(--ok); } .s.warn b, b.warn { color: var(--warn); } .s.alarm b, b.alarm { color: var(--alarm); } b.off { color: var(--fg-2); }
</style>
