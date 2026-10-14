<script lang="ts">
  import { live, dataAgeS, tagNum, tagStr } from '../live/store.svelte';
  import { ident } from '../identity.svelte';
  import { ui, togglePanel } from '../ui.svelte';
  import { pretty } from '../fmt';

  const mode = $derived(tagStr('KPI/Mode'));
  const scenario = $derived(tagStr('_Sim_/Scenario'));
  const speed = $derived(tagNum('_Sim_/SpeedFactor'));

  const MODE_TONE: Record<string, string> = { NORMAL: 'ok', STRESS: 'warn', CURTAILING: 'warn', ISLAND: 'alarm', GENSET: 'info' };
  const modeTone = $derived(MODE_TONE[mode] ?? 'off');
  const age = $derived(dataAgeS());
  const linkLabel = $derived(live.connection === 'closed' ? 'RECONNECTING' : live.connection === 'connecting' ? 'CONNECTING' : age > 10 ? 'STALE' : 'LIVE');
  const linkTone = $derived(live.connection === 'open' && age <= 10 ? 'ok' : live.connection === 'closed' ? 'alarm' : 'warn');
  const ageText = $derived(Number.isFinite(age) ? (age < 10 ? age.toFixed(1) : Math.round(age).toString()) + ' s' : '—');
  const idLabel = $derived(ident.method === 'web' ? `Gateway session · ${ident.user}` : ident.method === 'bearer' ? `${ident.tier} · ${ident.user}` : 'Anonymous · API key');
  const idTitle = $derived(ident.levels.length ? `Security levels: ${ident.levels.join(', ')}` : 'Identity as the gateway sees it (L to log in)');
</script>

<header class="hud mono mode-{modeTone}">
  <div class="brand">
    <svg viewBox="0 0 24 24" class="logo" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg>
    <div class="title">Campus Microgrid</div>
    <div class="sub">Ignite showcase</div>
  </div>

  <div class="spacer"></div>

  <div class="chips">
    <span class="chip" title="Sim scenario">{pretty(scenario)}</span>
    <span class="chip" title="Sim speed factor">{Number.isFinite(speed) ? `${speed}×` : '—'}</span>
  </div>

  <div class="chip link" title={live.history === 'unavailable' ? 'Trial expired — history/alarms paused' : live.trial}>
    <i class="dot {linkTone}"></i><b>{linkLabel}</b>
    <span>{live.tagCount ? `live · ${live.tagCount} tags · ` : ''}{ageText}</span>
    {#if live.history === 'unavailable'}<span class="note" role="status">Trial expired &mdash; history/alarms paused</span>{/if}
  </div>

  <button class="chip id" title={idTitle} onclick={() => togglePanel('identity')}>
    <span class:on={ident.method !== null}>{idLabel}</span>
  </button>

  <button class="help" aria-label="Help and about (?)" title="Help (?)" onclick={() => (ui.help = !ui.help)}>?</button>
</header>

<style>
  .hud {
    position: fixed; left: 0; right: 0; top: 0; height: var(--hud-h); z-index: 10;
    display: flex; align-items: center; gap: var(--space-3);
    padding: 0 var(--space-4);
    background: linear-gradient(to bottom, color-mix(in srgb, var(--bg-0) 88%, transparent), color-mix(in srgb, var(--bg-0) 55%, transparent));
    border-bottom: 2px solid var(--line);
    transition: border-color var(--dur-slow);
    color: var(--fg-1); font-size: var(--text-sm);
  }
  .hud.mode-ok { border-bottom-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .hud.mode-warn { border-bottom-color: var(--warn); }
  .hud.mode-info { border-bottom-color: var(--info); }
  .hud.mode-alarm { border-bottom-color: var(--alarm); }
  .brand { display: flex; align-items: center; gap: var(--space-3); }
  .logo { width: 24px; height: 24px; fill: none; stroke: var(--accent); stroke-width: 1.6; stroke-linecap: round; }
  .title { color: var(--accent); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; font-size: var(--text-md); white-space: nowrap; }
  .sub { color: var(--fg-2); font-size: var(--text-xs); letter-spacing: 0.04em; white-space: nowrap; }
  .spacer { flex: 1; }
  .chips { display: flex; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border-radius: 12px; background: color-mix(in srgb, var(--bg-3) 85%, transparent); border: 0; color: var(--fg-1); font: inherit; font-size: var(--text-xs); letter-spacing: 0.04em; white-space: nowrap; }
  .link b { color: var(--fg-0); letter-spacing: 0.06em; }
  .link .note { color: var(--warn); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--fg-2); }
  .dot.ok { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
  .dot.warn { background: var(--warn); }
  .dot.alarm { background: var(--alarm); }
  button.id { cursor: pointer; }
  button.id:hover { color: var(--accent); }
  .id .on { color: var(--fg-0); }
  .help { width: 28px; height: 28px; font: 700 var(--text-md) var(--font-mono); color: var(--fg-1); background: var(--bg-2); border: 1px solid var(--line-strong); border-radius: 50%; cursor: pointer; }
  .help:hover { background: var(--bg-3); color: var(--accent); border-color: var(--accent); }
  @media (max-width: 1100px) {
    .sub, .link span:not(.note) { display: none; }
  }
</style>
