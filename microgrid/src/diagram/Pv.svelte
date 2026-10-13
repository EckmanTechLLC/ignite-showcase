<script lang="ts">
  import Flow from './Flow.svelte';
  import { hit } from './hit';
  import { sel, same } from '../selection.svelte';
  import { tagBool, tagNum, tagStr } from '../live/store.svelte';
  import { num } from '../fmt';
  import { SRC_H, SRC_Y, BUS_Y, speedOf, invTone, healthTone, TONE } from './model';

  let { id, x }: { id: string; x: number } = $props();
  const W = 200;
  const cx = $derived(x + W / 2);
  const n = (s: string) => tagNum(`PV/${id}/${s}`);
  const ac = $derived(n('ACkW'));
  const rated = $derived(n('RatedACkW') || 150);
  const limit = $derived(n('CurtailSetpointkW'));
  const curtailed = $derived(tagBool(`PV/${id}/Curtailed`));
  const health = $derived(n('Health'));
  const stA = $derived(tagStr(`PV/${id}/Inverter/A/State`));
  const stB = $derived(tagStr(`PV/${id}/Inverter/B/State`));
  const fault = $derived(stA === 'FAULT' || stB === 'FAULT');
  const island = $derived(tagBool('Grid/Islanded'));
  const selected = $derived(same(sel.target, { kind: 'pv', id }));
  const frac = $derived(Math.min(1, Math.max(0, ac / rated)) || 0);
  const limFrac = $derived(Number.isFinite(limit) && limit < rated ? limit / rated : 1);
  const short = (s: string) => (s === 'CURTAILED' ? 'CURT' : s || '\u2014');
  const hint = $derived(`PV array ${id}: ${num(ac, 0)} kW`);
</script>

<Flow d={`M${cx} ${SRC_Y + SRC_H} V${BUS_Y - 4}`} color={island ? 'var(--island)' : 'var(--solar)'} speed={speedOf(ac)} active={ac >= 0.5} />
<text class="lbl" x={cx + 8} y={300}>{num(ac, 0)} kW</text>

<g use:hit={{ kind: 'pv', id }} aria-label={hint} class:selected class:fault>
  <rect class="card" {x} y={SRC_Y} width={W} height={SRC_H} rx="6" />
  <text class="title" x={x + 12} y={SRC_Y + 22}>PV ARRAY {id}</text>
  {#if curtailed}<g><rect class="badge warn" x={x + W - 78} y={SRC_Y + 8} width="68" height="18" rx="9" /><text class="bt warn" x={x + W - 44} y={SRC_Y + 21} text-anchor="middle">CURTAIL</text></g>{/if}
  <text class="big" x={x + 12} y={SRC_Y + 58}>{num(ac, 0)}<tspan class="unit"> kW</tspan></text>
  <rect class="bar-bg" x={x + 12} y={SRC_Y + 68} width="176" height="8" rx="4" />
  <rect class="bar" x={x + 12} y={SRC_Y + 68} width={176 * frac} height="8" rx="4" fill={curtailed ? 'var(--warn)' : 'var(--solar)'} />
  {#if limFrac < 1}<rect x={x + 12 + 176 * limFrac - 1} y={SRC_Y + 63} width="2" height="18" fill="var(--warn)" />{/if}
  <text class="sm" x={x + 12} y={SRC_Y + 100}>{num(n('IrradianceWm2'), 0)} W/m&sup2; &middot; module {num(n('ModuleTempC'), 0)} &deg;C</text>
  <text class="sm" x={x + 12} y={SRC_Y + 118}>today {num(n('TodaykWh'), 0)} kWh</text>
  <text class="sm" x={x + 12} y={SRC_Y + 136} fill={TONE[healthTone(health)]}>health {num(health, 0)} %</text>
  <g>
    <rect class="chip" x={x + 12} y={SRC_Y + 146} width="84" height="20" rx="4" stroke={TONE[invTone(stA)]} />
    <text class="ct" x={x + 54} y={SRC_Y + 160} text-anchor="middle" fill={TONE[invTone(stA)]}>A {short(stA)}</text>
    <rect class="chip" x={x + 104} y={SRC_Y + 146} width="84" height="20" rx="4" stroke={TONE[invTone(stB)]} />
    <text class="ct" x={x + 146} y={SRC_Y + 160} text-anchor="middle" fill={TONE[invTone(stB)]}>B {short(stB)}</text>
  </g>
</g>
