<script lang="ts">
  import Flow from './Flow.svelte';
  import { hit } from './hit';
  import { sel, same } from '../selection.svelte';
  import { tagBool, tagNum, tagStr } from '../live/store.svelte';
  import { num, pretty } from '../fmt';
  import { SRC_H, SRC_Y, BUS_Y, speedOf, TONE, type Tone } from './model';

  let { id, x }: { id: string; x: number } = $props();
  const W = 130;
  const cx = $derived(x + W / 2);
  const n = (s: string) => tagNum(`BESS/${id}/${s}`);
  const kw = $derived(n('kW')); // + discharging, - charging
  const soc = $derived(n('SOCPct'));
  const temp = $derived(n('CellTempC'));
  const mode = $derived(tagStr(`BESS/${id}/Mode`));
  const state = $derived(tagStr(`BESS/${id}/State`));
  const fault = $derived(state === 'FAULT');
  const island = $derived(tagBool('Grid/Islanded'));
  const selected = $derived(same(sel.target, { kind: 'bess', id }));
  const socTone = $derived<Tone>(!Number.isFinite(soc) ? 'off' : soc < 20 ? 'alarm' : soc < 35 ? 'warn' : 'ok');
  const modeTone = $derived<Tone>(mode === 'ISLAND' ? 'alarm' : mode === 'BACKUP' ? 'warn' : mode === 'IDLE' ? 'off' : 'info');
  const dir = $derived(kw > 0.5 ? 'DISCHARGE' : kw < -0.5 ? 'CHARGE' : 'IDLE');
</script>

<!-- Drawn card to bus: discharging flows forward (up the feeder), charging reverses. -->
<Flow
  d={`M${cx} ${SRC_Y + SRC_H} V${BUS_Y - 4}`}
  color={island ? 'var(--island)' : 'var(--bat)'}
  speed={speedOf(kw)}
  active={Math.abs(kw) >= 0.5}
  reverse={kw < 0}
/>
<text class="lbl" x={cx + 8} y={300}>{num(Math.abs(kw), 0)} kW</text>

<g use:hit={{ kind: 'bess', id }} aria-label={`BESS ${id}: SOC ${num(soc, 0)} percent`} class:selected class:fault>
  <rect class="card" {x} y={SRC_Y} width={W} height={SRC_H} rx="6" />
  <text class="title" x={x + 10} y={SRC_Y + 22}>BESS {id}</text>
  <text class="big" x={x + 10} y={SRC_Y + 56}>{num(soc, 0)}<tspan class="unit"> % SOC</tspan></text>
  <rect class="bar-bg" x={x + 10} y={SRC_Y + 64} width="110" height="10" rx="3" />
  <rect class="bar" x={x + 10} y={SRC_Y + 64} width={110 * (Math.min(100, Math.max(0, soc)) / 100 || 0)} height="10" rx="3" fill={TONE[socTone]} />
  <!-- direction arrow: up = discharging into the bus, down = charging from it -->
  {#if kw > 0.5}<polygon points={`${x + 18},${SRC_Y + 104} ${x + 28},${SRC_Y + 90} ${x + 38},${SRC_Y + 104}`} fill="var(--bat)" />
  {:else if kw < -0.5}<polygon points={`${x + 18},${SRC_Y + 90} ${x + 28},${SRC_Y + 104} ${x + 38},${SRC_Y + 90}`} fill="var(--bat)" />
  {:else}<rect x={x + 18} y={SRC_Y + 95} width="20" height="3" fill="var(--fg-2)" />{/if}
  <text class="mid" x={x + 46} y={SRC_Y + 102}>{num(Math.abs(kw), 0)} kW</text>
  <text class="sm" x={x + 10} y={SRC_Y + 120}>{dir.toLowerCase()} &middot; {num(temp, 0)} &deg;C</text>
  <rect class="chip" x={x + 10} y={SRC_Y + 130} width="110" height="20" rx="4" stroke={TONE[modeTone]} />
  <text class="ct" x={x + 65} y={SRC_Y + 144} text-anchor="middle" fill={TONE[modeTone]}>{pretty(mode)}</text>
  <text class="sm" x={x + 10} y={SRC_Y + 166} fill={fault ? 'var(--alarm)' : 'var(--fg-2)'}>{state || '—'}</text>
</g>
