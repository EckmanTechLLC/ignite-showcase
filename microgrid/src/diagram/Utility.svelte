<script lang="ts">
  import Flow from './Flow.svelte';
  import { hit } from './hit';
  import { sel, same } from '../selection.svelte';
  import { tagBool, tagNum } from '../live/store.svelte';
  import { num } from '../fmt';
  import { BUS_Y, speedOf, TONE, type Tone } from './model';

  const X = 14;
  const W = 150;
  const Y = BUS_Y - 90;
  const H = 180;
  const avail = $derived(tagBool('Grid/Available'));
  const island = $derived(tagBool('Grid/Islanded'));
  const imp = $derived(tagNum('Grid/ImportkW'));
  const exp = $derived(tagNum('Grid/ExportkW'));
  const net = $derived((Number.isFinite(imp) ? imp : 0) - (Number.isFinite(exp) ? exp : 0));
  const volts = $derived(tagNum('Grid/VoltageV'));
  const hz = $derived(tagNum('Grid/FrequencyHz'));
  const closed = $derived(avail && !island);
  const label = $derived(!avail ? 'GRID LOST' : island ? 'ISLANDED' : 'AVAILABLE');
  const tone = $derived<Tone>(!avail ? 'alarm' : island ? 'warn' : 'ok');
  const dirColor = $derived(net >= 0 ? 'var(--grid-import)' : 'var(--grid-export)');
  const selected = $derived(same(sel.target, { kind: 'grid', id: '' }));
  const hzTone = $derived<Tone>(Number.isFinite(hz) && Math.abs(hz - 60) > 0.5 ? 'alarm' : 'off');
</script>

<Flow d={`M${X + W} ${BUS_Y} H228`} color={dirColor} speed={speedOf(net)} active={closed && Math.abs(net) >= 0.5} reverse={net < 0} width={4} />
<!-- breaker: closed square when connected, open gap with a slanted blade when islanded -->
<g class="brk" aria-hidden="true">
  {#if closed}<rect x={X + W + 22} y={BUS_Y - 7} width="14" height="14" fill="var(--bg-2)" stroke={TONE.ok} stroke-width="2" />
  {:else}<rect x={X + W + 22} y={BUS_Y - 7} width="14" height="14" fill="var(--bg-0)" stroke={TONE.alarm} stroke-width="2" /><line x1={X + W + 22} y1={BUS_Y + 7} x2={X + W + 36} y2={BUS_Y - 7} stroke={TONE.alarm} stroke-width="2" />{/if}
</g>
<text class="lbl" x={X + W + 6} y={BUS_Y - 14}>{closed ? `${net >= 0 ? 'import' : 'export'} ${num(Math.abs(net), 0)} kW` : 'open'}</text>

<g use:hit={{ kind: 'grid', id: '' }} aria-label={`Utility intertie ${label}`} class:selected class:fault={!avail}>
  <rect class="card" x={X} y={Y} width={W} height={H} rx="6" />
  <text class="title" x={X + 12} y={Y + 22}>UTILITY</text>
  <!-- transmission-tower glyph -->
  <path d={`M${X + 118} ${Y + 12} l8 22 M${X + 134} ${Y + 12} l-8 22 M${X + 120} ${Y + 20} h12 M${X + 122} ${Y + 28} h8`} stroke="var(--fg-2)" stroke-width="1.5" fill="none" />
  <rect class="chip" x={X + 12} y={Y + 36} width="126" height="22" rx="4" stroke={TONE[tone]} />
  <text class="ct" x={X + 75} y={Y + 51} text-anchor="middle" fill={TONE[tone]}>{label}</text>
  <text class="big" x={X + 12} y={Y + 94}>{num(Math.abs(net), 0)}<tspan class="unit"> kW</tspan></text>
  <text class="sm" x={X + 12} y={Y + 112} fill={closed ? dirColor : 'var(--fg-2)'}>{closed ? (net >= 0 ? 'importing' : 'exporting') : 'disconnected'}</text>
  <text class="sm" x={X + 12} y={Y + 140}>{num(volts, 0)} V</text>
  <text class="sm" x={X + 12} y={Y + 158} fill={TONE[hzTone]}>{num(hz, 2)} Hz</text>
</g>
