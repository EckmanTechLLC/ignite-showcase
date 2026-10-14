<script lang="ts">
  import Roll from './Roll.svelte';
  import { tagNum, tagStr } from '../live/store.svelte';
  import { togglePanel } from '../ui.svelte';
  import { hasCritical } from '../overlays/alarms/store.svelte';
  import { num, pretty } from '../fmt';

  const net = $derived(tagNum('KPI/NetLoadkW'));
  const pvFrac = $derived(tagNum('KPI/PVFractionPct'));
  const self = $derived(tagNum('KPI/SelfSufficiencyPct'));
  const pv = $derived(tagNum('KPI/PVTotalkW'));
  const load = $derived(tagNum('Loads/TotalkW'));
  const alarms = $derived(tagNum('KPI/ActiveAlarms'));
  const mode = $derived(tagStr('KPI/Mode'));
  const cost = $derived(tagNum('Grid/TodayCostUSD'));
  const base = $derived(tagNum('Grid/BaselineCostUSD'));
  const savings = $derived(tagNum('KPI/TodaySavingsUSD'));
  const co2 = $derived(tagNum('KPI/TodayCO2AvoidedKg'));
  const peak = $derived(tagNum('Grid/PeakImportkW'));
  const basePeak = $derived(tagNum('Grid/BaselinePeakkW'));
  const MODE_TONE: Record<string, string> = { NORMAL: 'ok', STRESS: 'warn', CURTAILING: 'warn', ISLAND: 'alarm', GENSET: 'info' };
  const modeTone = $derived(MODE_TONE[mode] ?? 'off');
  const critical = $derived(hasCritical());
  const frac = (v: number) => Math.min(1, Math.max(0, (v || 0) / 100));
</script>

<aside class="rail mono" aria-label="Key figures">
  <div class="badge {modeTone}" class:pulse={modeTone === 'alarm' || modeTone === 'warn'} title="Operating mode">{pretty(mode)}</div>
  <button class="t alarms" class:crit={alarms > 0} class:pulse={critical} title="Active alarms: open the alarm board (A)" onclick={() => togglePanel('alarms')}>
    <span class="k">ALARMS</span><span class="v" class:hot={alarms > 0}>{num(alarms, 0)}<small>{critical ? ' CRITICAL' : ''}</small></span>
  </button>
  <div class="t"><span class="k">NET LOAD</span><span class="v">{num(net, 0)}<small> kW</small></span><span class="s">load {num(load, 0)} &minus; PV {num(pv, 0)}</span></div>
  <div class="t"><span class="k">PV FRACTION</span><span class="v">{num(pvFrac, 0)}<small> %</small></span><span class="meter"><i style:transform={`scaleX(${frac(pvFrac)})`}></i></span></div>
  <div class="t"><span class="k">SELF-SUFFICIENCY</span><span class="v">{num(self, 0)}<small> %</small></span><span class="meter"><i style:transform={`scaleX(${frac(self)})`}></i></span></div>
  <div class="t"><span class="k">COST TODAY</span><span class="v"><Roll value={cost} digits={2} prefix="$" /></span><span class="s">baseline <Roll value={base} digits={2} prefix="$" /></span></div>
  <div class="t"><span class="k">SAVINGS</span><span class="v good"><Roll value={savings} digits={2} prefix="$" /></span><span class="s">vs no PV / BESS</span></div>
  <div class="t"><span class="k">CO&#8322; AVOIDED</span><span class="v"><Roll value={co2} digits={1} /><small> kg</small></span></div>
  <div class="t"><span class="k">PEAK IMPORT</span><span class="v"><Roll value={peak} digits={0} /><small> kW</small></span><span class="s">baseline <Roll value={basePeak} digits={0} /> kW</span></div>
</aside>

<style>
  .rail { position: fixed; z-index: 8; left: var(--space-2); top: calc(var(--hud-h) + var(--strip-h) + var(--space-2)); width: 148px; display: flex; flex-direction: column; gap: 3px; padding: 6px; border-radius: var(--radius-3); background: color-mix(in srgb, var(--bg-1) 72%, transparent); border: 1px solid color-mix(in srgb, var(--line-strong) 70%, transparent); color: var(--fg-1); font-size: var(--text-xs); }
  .t { display: flex; flex-direction: column; gap: 1px; padding: 3px 4px; background: none; border: 0; font: inherit; color: inherit; text-align: left; border-radius: var(--radius-2); }
  button.t { cursor: pointer; flex-direction: row; justify-content: space-between; align-items: baseline; }
  button.t:hover .k { color: var(--accent); }
  .k { color: var(--fg-2); font-size: 10px; letter-spacing: 0.08em; white-space: nowrap; }
  .v { color: var(--fg-0); font-size: var(--text-lg); font-weight: 600; line-height: 1.05; white-space: nowrap; }
  .v small { color: var(--fg-2); font-size: var(--text-xs); font-weight: 400; }
  .v.good { color: var(--ok); }
  .v.hot, .alarms.crit .v { color: var(--alarm); }
  .s { color: var(--fg-2); font-size: 10px; white-space: nowrap; }
  .meter { display: block; height: 3px; border-radius: 2px; background: var(--bg-3); overflow: hidden; }
  .meter i { display: block; height: 100%; background: var(--accent); transform-origin: left; transition: transform var(--dur-slow) var(--ease-out); }
  .alarms { border-bottom: 1px solid var(--line); border-radius: 0; margin-bottom: 2px; }
  .alarms.pulse { animation: pulse 1s ease-in-out infinite; }
  .badge { padding: 2px 8px; border-radius: var(--radius-2); font-weight: 700; letter-spacing: 0.08em; font-size: var(--text-sm); border: 1px solid currentColor; text-align: center; }
  .badge.ok { color: var(--ok); background: color-mix(in srgb, var(--ok) 14%, transparent); }
  .badge.warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 16%, transparent); }
  .badge.info { color: var(--info); background: color-mix(in srgb, var(--info) 16%, transparent); }
  .badge.alarm { color: var(--alarm); background: color-mix(in srgb, var(--alarm) 16%, transparent); }
  .badge.off { color: var(--fg-2); }
  .badge.pulse { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.55; } }
  @media (max-height: 700px) { .s { display: none; } .rail { gap: 1px; } }
</style>
