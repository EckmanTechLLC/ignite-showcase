<script lang="ts">
  import Roll from './Roll.svelte';
  import { live, dataAgeS, tagNum, tagStr } from '../live/store.svelte';
  import { ident } from '../identity.svelte';
  import { ui, togglePanel } from '../ui.svelte';
  import { hasCritical } from '../overlays/alarms/store.svelte';
  import { num, pretty } from '../fmt';

  const net = $derived(tagNum('KPI/NetLoadkW'));
  const pvFrac = $derived(tagNum('KPI/PVFractionPct'));
  const self = $derived(tagNum('KPI/SelfSufficiencyPct'));
  const pv = $derived(tagNum('KPI/PVTotalkW'));
  const load = $derived(tagNum('Loads/TotalkW'));
  const alarms = $derived(tagNum('KPI/ActiveAlarms'));
  const mode = $derived(tagStr('KPI/Mode'));
  const scenario = $derived(tagStr('_Sim_/Scenario'));
  const speed = $derived(tagNum('_Sim_/SpeedFactor'));
  const cost = $derived(tagNum('Grid/TodayCostUSD'));
  const base = $derived(tagNum('Grid/BaselineCostUSD'));
  const savings = $derived(tagNum('KPI/TodaySavingsUSD'));
  const co2 = $derived(tagNum('KPI/TodayCO2AvoidedKg'));
  const peak = $derived(tagNum('Grid/PeakImportkW'));
  const basePeak = $derived(tagNum('Grid/BaselinePeakkW'));

  const MODE_TONE: Record<string, string> = { NORMAL: 'ok', STRESS: 'warn', CURTAILING: 'warn', ISLAND: 'alarm', GENSET: 'info' };
  const modeTone = $derived(MODE_TONE[mode] ?? 'off');
  const age = $derived(dataAgeS());
  const linkLabel = $derived(live.connection === 'closed' ? 'RECONNECTING' : live.connection === 'connecting' ? 'CONNECTING' : age > 10 ? 'STALE' : 'LIVE');
  const linkTone = $derived(live.connection === 'open' && age <= 10 ? 'ok' : live.connection === 'closed' ? 'alarm' : 'warn');
  const ageText = $derived(Number.isFinite(age) ? (age < 10 ? age.toFixed(1) : Math.round(age).toString()) + ' s' : '—');
  const idLabel = $derived(ident.method === 'web' ? `Gateway session · ${ident.user}` : ident.method === 'bearer' ? `${ident.tier} · ${ident.user}` : 'Anonymous · API key');
  const idTitle = $derived(ident.levels.length ? `Security levels: ${ident.levels.join(', ')}` : 'Identity as the gateway sees it (L to log in)');
  const critical = $derived(hasCritical());
</script>

<header class="hud mono mode-{modeTone}">
  <div class="brand">
    <svg viewBox="0 0 24 24" class="logo" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg>
    <div>
      <div class="title">Campus Microgrid</div>
      <div class="sub">Ignite showcase</div>
    </div>
  </div>

  <div class="tile">
    <div class="k">NET LOAD</div>
    <div class="v">{num(net, 0)}<span class="u"> kW</span></div>
    <div class="s">load {num(load, 0)} &minus; PV {num(pv, 0)}</div>
  </div>
  <div class="tile">
    <div class="k">PV FRACTION</div>
    <div class="v">{num(pvFrac, 0)}<span class="u"> %</span></div>
    <div class="meter"><i style:transform={`scaleX(${Math.min(1, Math.max(0, (pvFrac || 0) / 100))})`}></i></div>
  </div>
  <div class="tile">
    <div class="k">SELF-<span class="lg">SUFFICIENCY</span><span class="sh">SUFF.</span></div>
    <div class="v">{num(self, 0)}<span class="u"> %</span></div>
    <div class="meter"><i style:transform={`scaleX(${Math.min(1, Math.max(0, (self || 0) / 100))})`}></i></div>
  </div>

  <div class="sep"></div>

  <div class="tile">
    <div class="k">COST TODAY</div>
    <div class="v"><Roll value={cost} digits={2} prefix="$" /></div>
    <div class="s">baseline <Roll value={base} digits={2} prefix="$" /></div>
  </div>
  <div class="tile">
    <div class="k">SAVINGS</div>
    <div class="v good"><Roll value={savings} digits={2} prefix="$" /></div>
    <div class="s">vs no PV / BESS</div>
  </div>
  <div class="tile">
    <div class="k">CO&#8322; AVOIDED</div>
    <div class="v"><Roll value={co2} digits={1} /><span class="u"> kg</span></div>
    <div class="s">today</div>
  </div>
  <div class="tile">
    <div class="k">PEAK IMPORT</div>
    <div class="v"><Roll value={peak} digits={0} /><span class="u"> kW</span></div>
    <div class="s">baseline <Roll value={basePeak} digits={0} /> kW</div>
  </div>

  <div class="spacer"></div>

  <button class="tile alarms" class:crit={alarms > 0} class:pulse={critical} title="Active alarms: open the alarm board (A)" onclick={() => togglePanel('alarms')}>
    <div class="k">ALARMS</div>
    <div class="v" class:hot={alarms > 0}>{num(alarms, 0)}</div>
    <div class="s">{critical ? 'CRITICAL' : 'active'}</div>
  </button>

  <div class="tile mode">
    <div class="k">MODE</div>
    <div class="badge {modeTone}" class:pulse={modeTone === 'alarm' || modeTone === 'warn'}>{pretty(mode)}</div>
    <div class="chips">
      <span class="chip" title="Sim scenario">{pretty(scenario)}</span>
      <span class="chip" title="Sim speed factor">{Number.isFinite(speed) ? `${speed}×` : '—'}</span>
    </div>
  </div>

  <div class="tile link" title={live.history === 'unavailable' ? 'History/alarms unavailable: the gateway trial may have expired' : ''}>
    <div class="k">SSE LINK</div>
    <div class="linkrow"><i class="dot {linkTone}"></i><b>{linkLabel}</b></div>
    <div class="s">{live.tagCount ? `live · ${live.tagCount} tags · ` : ''}{ageText}</div>
    {#if live.history === 'unavailable'}<div class="s note" role="status">History/alarms unavailable &mdash; gateway trial may have expired</div>{/if}
  </div>

  <button class="tile id" title={idTitle} onclick={() => togglePanel('identity')}>
    <div class="k">IDENTITY</div>
    <div class="idrow" class:on={ident.method !== null}>{idLabel}</div>
  </button>

  <button class="help" aria-label="Help and about (?)" title="Help (?)" onclick={() => (ui.help = !ui.help)}>?</button>
</header>

<style>
  .hud {
    position: fixed; left: 0; right: 0; top: 0; height: var(--hud-h); z-index: 10;
    display: flex; align-items: stretch; gap: var(--space-4);
    padding: 0 var(--space-4);
    background: linear-gradient(to bottom, var(--bg-1), color-mix(in srgb, var(--bg-0) 92%, transparent));
    border-bottom: 2px solid var(--line);
    transition: border-color var(--dur-slow);
    color: var(--fg-1); font-size: var(--text-sm);
  }
  .hud.mode-ok { border-bottom-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .hud.mode-warn { border-bottom-color: var(--warn); }
  .hud.mode-info { border-bottom-color: var(--info); }
  .hud.mode-alarm { border-bottom-color: var(--alarm); }
  .brand { display: flex; align-items: center; gap: var(--space-3); padding-right: var(--space-4); border-right: 1px solid var(--line); }
  .logo { width: 30px; height: 30px; fill: none; stroke: var(--accent); stroke-width: 1.6; stroke-linecap: round; }
  .title { color: var(--accent); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; font-size: var(--text-md); line-height: 1.1; white-space: nowrap; }
  .sub { color: var(--fg-2); font-size: var(--text-xs); letter-spacing: 0.04em; }
  .sep { width: 1px; background: var(--line); margin: 8px 0; }
  .tile { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 96px; }
  .k { color: var(--fg-2); font-size: var(--text-xs); letter-spacing: 0.1em; white-space: nowrap; }
  .v { color: var(--fg-0); font-size: var(--text-xl); font-weight: 600; line-height: 1.05; white-space: nowrap; }
  .v .u { color: var(--fg-2); font-size: var(--text-sm); font-weight: 400; }
  .v.good { color: var(--ok); }
  .v.hot { color: var(--alarm); }
  .s { color: var(--fg-2); font-size: var(--text-xs); white-space: nowrap; }
  .s.note { color: var(--warn); }
  .meter { height: 4px; border-radius: 2px; background: var(--bg-3); overflow: hidden; }
  .meter i { display: block; height: 100%; background: var(--accent); transform-origin: left; transition: transform var(--dur-slow) var(--ease-out); }
  .spacer { flex: 1; }
  button.tile { background: none; border: 0; padding: 0; margin: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
  button.tile:hover .k { color: var(--accent); }
  .tile.alarms { min-width: 70px; }
  .tile.alarms.pulse { animation: pulse 1s ease-in-out infinite; }
  .tile.alarms.crit .v, .tile.alarms.crit .s { color: var(--alarm); }
  .mode { min-width: 190px; gap: 4px; }
  .badge { align-self: flex-start; padding: 1px 12px; border-radius: var(--radius-2); font-weight: 700; letter-spacing: 0.08em; font-size: var(--text-md); border: 1px solid currentColor; }
  .badge.ok { color: var(--ok); background: color-mix(in srgb, var(--ok) 14%, transparent); }
  .badge.warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 16%, transparent); }
  .badge.info { color: var(--info); background: color-mix(in srgb, var(--info) 16%, transparent); }
  .badge.alarm { color: var(--alarm); background: color-mix(in srgb, var(--alarm) 16%, transparent); }
  .badge.off { color: var(--fg-2); }
  .badge.pulse { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.55; } }
  .chips { display: flex; gap: 6px; }
  .chip { padding: 1px 7px; border-radius: 10px; background: var(--bg-3); color: var(--fg-1); font-size: var(--text-xs); letter-spacing: 0.04em; white-space: nowrap; }
  .link { min-width: 150px; }
  .linkrow { display: flex; align-items: center; gap: var(--space-2); color: var(--fg-0); letter-spacing: 0.06em; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--fg-2); }
  .dot.ok { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
  .dot.warn { background: var(--warn); }
  .dot.alarm { background: var(--alarm); }
  .id { min-width: 120px; }
  .idrow { color: var(--fg-2); font-size: var(--text-sm); white-space: nowrap; }
  .idrow.on { color: var(--fg-0); }
  .help { align-self: center; width: 30px; height: 30px; font: 700 var(--text-md) var(--font-mono); color: var(--fg-1); background: var(--bg-2); border: 1px solid var(--line-strong); border-radius: 50%; cursor: pointer; }
  .help:hover { background: var(--bg-3); color: var(--accent); border-color: var(--accent); }
  .sh { display: none; }
  @media (max-width: 1700px) {
    .hud { gap: var(--space-3); padding: 0 var(--space-3); }
    .brand { padding-right: var(--space-3); }
    .brand .sub, .logo { display: none; }
    .title { font-size: var(--text-sm); }
    .tile, .mode, .link, .id { min-width: 0; }
    .v { font-size: var(--text-lg); }
    .v .u { font-size: var(--text-xs); }
    .spacer { flex: 0 0 0; }
    .badge { font-size: var(--text-sm); padding: 1px 8px; }
    .s.note { white-space: normal; max-width: 140px; }
    .id .idrow { font-size: var(--text-xs); }
  }
  @media (max-width: 1500px) {
    .brand .title { display: none; }
    .logo { display: block; }
    .brand { padding-right: var(--space-2); border-right: 0; }
    .tile:not(.link) .s { display: none; }
    .k { letter-spacing: 0.05em; }
    .lg { display: none; }
    .sh { display: inline; }
    .hud { gap: var(--space-2); }
    .sep { margin: 8px 2px; }
    .id .k { display: none; }
    .link { max-width: 200px; }
  }
</style>
