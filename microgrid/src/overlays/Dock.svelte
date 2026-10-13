<script lang="ts">
  import { ui, togglePanel, type PanelKey } from '../ui.svelte';
  import { ident } from '../identity.svelte';
  import { hasCritical, activeRows } from './alarms/store.svelte';

  const DOCK: { key: PanelKey; hot: string; label: string }[] = [
    { key: 'trends', hot: 'T', label: 'Trends' },
    { key: 'alarms', hot: 'A', label: 'Alarms' },
    { key: 'controls', hot: 'C', label: 'Controls' },
    { key: 'identity', hot: 'L', label: 'Login' },
  ];
  const n = $derived(activeRows().length);
</script>

<nav class="dock mono" aria-label="Overlays">
  {#each DOCK as d (d.key)}
    <button class:on={ui.panel === d.key} class:crit={d.key === 'alarms' && hasCritical()} aria-pressed={ui.panel === d.key} title="{d.label} ({d.hot})" onclick={() => togglePanel(d.key)}>
      <b>{d.hot}</b><span>{d.label}</span>
      {#if d.key === 'alarms' && n}<i class="n">{n}</i>{/if}
    </button>
  {/each}
  <div class="tier {ident.tier.toLowerCase()}" title={ident.method === 'web' ? `Gateway session: ${ident.user}` : 'Session tier'}>{ident.method === 'web' ? 'Gateway ' : ''}{ident.tier}</div>
</nav>

<style>
  .dock { position: fixed; z-index: 21; right: 0; top: calc(var(--hud-h) + var(--space-2)); width: 56px; display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
  button { position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 6px 0; background: var(--bg-1); border: 1px solid var(--line-strong); border-right: 0; border-radius: var(--radius-3) 0 0 var(--radius-3); color: var(--fg-1); cursor: pointer; font-family: inherit; }
  button b { font-size: var(--text-md); color: var(--accent); }
  button span { font-size: 9px; letter-spacing: 0.04em; }
  button.on { background: var(--bg-3); border-color: var(--accent); color: var(--fg-0); }
  button:hover { background: var(--bg-2); }
  button.crit { border-color: var(--alarm); animation: crit 1.2s ease-in-out infinite; }
  .n { position: absolute; top: -5px; left: -5px; min-width: 16px; height: 16px; border-radius: 8px; background: var(--alarm); color: #fff; font: 700 10px/16px var(--font-mono); font-style: normal; text-align: center; }
  .tier { margin-top: 4px; font-size: 9px; text-align: center; letter-spacing: 0.06em; color: var(--fg-2); text-transform: uppercase; }
  .tier.operator { color: var(--ok); }
  .tier.director { color: var(--accent); }
  .tier.viewer { color: var(--info); }
  @keyframes crit { 50% { box-shadow: 0 0 12px var(--alarm); } }
</style>
