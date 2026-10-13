<script lang="ts">
  import Flow from './Flow.svelte';
  import { hit } from './hit';
  import { sel, same } from '../selection.svelte';
  import { tagBool, tagNum, tagStr } from '../live/store.svelte';
  import { num } from '../fmt';
  import { BUS_Y, LOAD_Y, CHARGERS, speedOf, TONE, type Tone } from './model';

  const X = 930;
  const W = 640;
  const H = 240;
  const cx = X + 320;
  const total = $derived(tagNum('EV/TotalkW'));
  const sessions = $derived(tagNum('EV/ActiveSessions'));
  const curtailed = $derived(tagNum('EV/CurtailedkW'));
  const island = $derived(tagBool('Grid/Islanded'));
  const selBank = $derived(same(sel.target, { kind: 'evbank', id: '' }));
  const stateTone = (s: string): Tone => (s === 'CHARGING' ? 'ok' : s === 'CURTAILED' ? 'warn' : s === 'FAULT' ? 'alarm' : 'off');
</script>

<Flow d={`M${cx} ${BUS_Y + 4} V${LOAD_Y}`} color={island ? 'var(--island)' : 'var(--load)'} speed={speedOf(total)} active={total >= 0.5} />
<text class="lbl" x={cx + 8} y={430}>{num(total, 0)} kW</text>

<g class="bank">
  <g use:hit={{ kind: 'evbank', id: '' }} aria-label="EV charging bank" class:selected={selBank}>
    <rect class="card" x={X} y={LOAD_Y} width={W} height={H} rx="6" />
    <text class="title" x={X + 12} y={LOAD_Y + 22}>EV CHARGING &middot; 10 &times; 22 kW</text>
    <text class="mid" x={X + W - 12} y={LOAD_Y + 22} text-anchor="end">{num(total, 0)} kW &middot; {num(sessions, 0)} sessions{curtailed > 0.5 ? ` · ${num(curtailed, 0)} kW curtailed` : ''}</text>
  </g>
  {#each CHARGERS as c, i (c)}
    {@const col = i % 5}
    {@const row = Math.floor(i / 5)}
    {@const tx = X + 12 + col * 125}
    {@const ty = LOAD_Y + 38 + row * 98}
    {@const st = tagStr(`EV/${c}/State`)}
    {@const kw = tagNum(`EV/${c}/kW`)}
    {@const soc = tagNum(`EV/${c}/CarSOCPct`)}
    <g use:hit={{ kind: 'charger', id: c }} aria-label={`Charger ${c} ${st}`} class:selected={same(sel.target, { kind: 'charger', id: c })} class:fault={st === 'FAULT'}>
      <rect class="tile" x={tx} y={ty} width="116" height="90" rx="5" stroke={st === 'FAULT' ? 'var(--alarm)' : 'var(--line)'} />
      <circle cx={tx + 12} cy={ty + 14} r="5" fill={TONE[stateTone(st)]} />
      <text class="sm" x={tx + 24} y={ty + 18}>{c}</text>
      <text class="sm" x={tx + 108} y={ty + 18} text-anchor="end" fill={TONE[stateTone(st)]}>{st === 'CURTAILED' ? 'CURT' : st === 'CHARGING' ? 'CHG' : st || '—'}</text>
      <text class="mid" x={tx + 10} y={ty + 48}>{num(kw, 1)}<tspan class="unit"> kW</tspan></text>
      <rect class="bar-bg" x={tx + 10} y={ty + 60} width="96" height="6" rx="3" />
      <rect class="bar" x={tx + 10} y={ty + 60} width={96 * (Math.min(100, Math.max(0, soc)) / 100 || 0)} height="6" rx="3" fill="var(--bat)" />
      <text class="sm" x={tx + 10} y={ty + 82}>car {st === 'IDLE' || !(soc > 0) ? '—' : `${num(soc, 0)} %`}</text>
    </g>
  {/each}
</g>
