<script lang="ts">
  import Flow from './Flow.svelte';
  import { hit } from './hit';
  import { sel, same } from '../selection.svelte';
  import { tagNum, tagStr } from '../live/store.svelte';
  import { num } from '../fmt';
  import { SRC_H, SRC_Y, BUS_Y, speedOf, TONE, type Tone } from './model';

  let { x }: { x: number } = $props();
  const W = 150;
  const cx = $derived(x + W / 2);
  const kw = $derived(tagNum('Genset/kW'));
  const state = $derived(tagStr('Genset/State'));
  const fuel = $derived(tagNum('Genset/FuelPct'));
  const count = $derived(tagNum('Genset/StartCountdownS'));
  const hours = $derived(tagNum('Genset/RunHours'));
  const rated = $derived(tagNum('Genset/RatedkW') || 400);
  const selected = $derived(same(sel.target, { kind: 'genset', id: '' }));
  const tone = $derived<Tone>(state === 'RUNNING' ? 'ok' : state === 'STARTING' ? 'warn' : state === 'COOLDOWN' ? 'info' : 'off');
  const fuelTone = $derived<Tone>(!Number.isFinite(fuel) ? 'off' : fuel < 20 ? 'alarm' : fuel < 40 ? 'warn' : 'ok');
</script>

<Flow d={`M${cx} ${SRC_Y + SRC_H} V${BUS_Y - 4}`} color="var(--genset)" speed={speedOf(kw)} active={kw >= 0.5} />
<text class="lbl" x={cx + 8} y={300}>{num(kw, 0)} kW</text>

<g use:hit={{ kind: 'genset', id: '' }} aria-label={`Genset ${state}`} class:selected class:starting={state === 'STARTING'}>
  <rect class="card" {x} y={SRC_Y} width={W} height={SRC_H} rx="6" />
  <text class="title" x={x + 12} y={SRC_Y + 22}>GENSET</text>
  <text class="big" x={x + 12} y={SRC_Y + 56}>{num(kw, 0)}<tspan class="unit"> kW</tspan></text>
  <rect class="bar-bg" x={x + 12} y={SRC_Y + 64} width="126" height="8" rx="4" />
  <rect class="bar" x={x + 12} y={SRC_Y + 64} width={126 * (Math.min(1, Math.max(0, kw / rated)) || 0)} height="8" rx="4" fill="var(--genset)" />
  <rect class="chip" x={x + 12} y={SRC_Y + 84} width="126" height="22" rx="4" stroke={TONE[tone]} />
  <text class="ct" x={x + 75} y={SRC_Y + 99} text-anchor="middle" fill={TONE[tone]}>
    {state === 'STARTING' ? `STARTING ${num(count, 0)} s` : state || '—'}
  </text>
  <text class="sm" x={x + 12} y={SRC_Y + 126}>fuel {num(fuel, 0)} %</text>
  <rect class="bar-bg" x={x + 12} y={SRC_Y + 132} width="126" height="6" rx="3" />
  <rect class="bar" x={x + 12} y={SRC_Y + 132} width={126 * (Math.min(100, Math.max(0, fuel)) / 100 || 0)} height="6" rx="3" fill={TONE[fuelTone]} />
  <text class="sm" x={x + 12} y={SRC_Y + 160}>{num(hours, 0)} run h &middot; {num(rated, 0)} kW</text>
</g>
