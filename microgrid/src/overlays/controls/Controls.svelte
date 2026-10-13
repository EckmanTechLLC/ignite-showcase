<script lang="ts">
  import Panel from '../Panel.svelte';
  import { perm } from '../../identity.svelte';
  import { tagBool, tagNum, tagStr } from '../../live/store.svelte';
  import { num } from '../../fmt';
  import { mg, refreshStatus, run } from './mg.svelte';

  const BESS_MODES = ['PEAK_SHAVE', 'SELF_CONSUME', 'BACKUP', 'IDLE'] as const;
  const SCENARIOS = ['normal', 'grid_outage', 'cloud_front_ev_rush', 'peak_shave_day', 'inverter_fault'] as const;
  const SPEEDS = [30, 60, 120, 240] as const;

  // Live state from the tags (every tier sees it); mg.status() adds the operator-only detail.
  const scenario = $derived(tagStr('_Sim_/Scenario'));
  const speed = $derived(tagNum('_Sim_/SpeedFactor'));
  const islanded = $derived(tagBool('Grid/Islanded'));
  const gridUp = $derived(tagBool('Grid/Available'));
  const cloudOverride = $derived(tagNum('_Sim_/Cloudiness'));
  const smartOn = $derived(tagBool('EV/C01/Smart'));
  const faulted = $derived(mg.status?.faults.inverters ?? []);

  let arr = $state(2);
  let inv = $state<'A' | 'B'>('B');
  let curtArr = $state(1);
  let curtKw = $state(75);
  let cloud = $state(0.3);
  let hour = $state(12);

  const wb = $derived(perm.writeBlock);
  const ab = $derived(perm.adminBlock);
  const off = $derived(!perm.write || mg.busy);

  $effect(() => {
    if (!perm.write) return;
    void refreshStatus();
    const id = window.setInterval(() => !document.hidden && void refreshStatus(), 10_000);
    return () => clearInterval(id);
  });
</script>

<Panel title="Controls" hotkey="C">
  {#snippet head()}<span class="chip">{scenario || '—'}</span><span class="chip">{Number.isFinite(speed) ? `${speed}×` : '—'}</span>{/snippet}

  {#if wb}<p class="gate" role="status">{wb}. The state below is live; the controls need the Operator tier.</p>{/if}

  <h3>Operator <small>{perm.write ? '' : wb}</small></h3>

  <section>
    <h4>BESS mode</h4>
    {#each ['B1', 'B2'] as b (b)}
      {@const cur = tagStr(`BESS/${b}/Mode`)}
      <div class="line">
        <b>{b}</b>
        <div class="seg">
          {#each BESS_MODES as m (m)}
            <button class:on={cur === m} disabled={off || cur === m || islanded} title={wb || (islanded ? 'Refused while islanded' : m)} onclick={() => run('set_mode', [b, m])}>{m.replace('_', ' ')}</button>
          {/each}
        </div>
      </div>
    {/each}
  </section>

  <section>
    <h4>Grid</h4>
    <div class="line">
      <span class="state" class:bad={!gridUp}>{islanded ? 'ISLANDED' : gridUp ? 'AVAILABLE' : 'LOST'}</span>
      <button class="danger" disabled={off || !gridUp} title={wb || 'Drop the utility intertie'} onclick={() => run('grid_outage')}>Grid outage</button>
      <button disabled={off || (gridUp && !islanded)} title={wb || 'Return the utility intertie'} onclick={() => run('grid_restore')}>Grid restore</button>
    </div>
  </section>

  <section>
    <h4>Inverter fault</h4>
    <div class="line">
      <select bind:value={arr} disabled={off} aria-label="Array">{#each [1, 2, 3, 4] as n (n)}<option value={n}>A{n}</option>{/each}</select>
      <select bind:value={inv} disabled={off} aria-label="Inverter">{#each ['A', 'B'] as n (n)}<option value={n}>{n}</option>{/each}</select>
      <button class="danger" disabled={off} title={wb || `Fault inverter A${arr}-${inv}`} onclick={() => run('inverter_fault', [arr, inv, true])}>Fault A{arr}-{inv}</button>
      <button disabled={off} title={wb || `Clear A${arr}-${inv}`} onclick={() => run('inverter_fault', [arr, inv, false])}>Clear</button>
    </div>
    {#if faulted.length}<div class="note">Faulted now: {faulted.join(', ')}</div>{/if}
  </section>

  <section>
    <h4>Curtail PV</h4>
    <div class="line">
      <select bind:value={curtArr} disabled={off} aria-label="Array">{#each [1, 2, 3, 4] as n (n)}<option value={n}>A{n}</option>{/each}</select>
      <input type="range" min="0" max="150" step="5" bind:value={curtKw} disabled={off} aria-label="AC limit, kW" />
      <span class="val">{curtKw} kW</span>
      <button disabled={off} title={wb || 'Apply the AC limit'} onclick={() => run('curtail_pv', [curtArr, curtKw])}>Apply</button>
      <button disabled={off} title={wb || 'Release the limit'} onclick={() => run('curtail_pv', [curtArr, null])}>Release</button>
    </div>
  </section>

  <section>
    <h4>EV smart charging</h4>
    <div class="line">
      <span class="state">{smartOn ? 'ON' : 'OFF'}</span>
      <button class:on={smartOn} disabled={off || smartOn} title={wb} onclick={() => run('ev_smart', [true])}>On</button>
      <button class:on={!smartOn} disabled={off || !smartOn} title={wb} onclick={() => run('ev_smart', [false])}>Off</button>
    </div>
  </section>

  <section>
    <h4>Cloudiness</h4>
    <div class="line">
      <span class="state">{cloudOverride >= 0 ? `HELD ${num(cloudOverride, 2)}` : 'AUTO'}</span>
      <input type="range" min="0" max="1" step="0.05" bind:value={cloud} disabled={off} aria-label="Cloudiness" onchange={() => run('set_cloudiness', [cloud])} />
      <span class="val">{num(cloud, 2)}</span>
      <button disabled={off || cloudOverride < 0} title={wb || 'Release to the random walk'} onclick={() => run('set_cloudiness', [null])}>Auto</button>
    </div>
  </section>

  <section>
    <h4>Jump to hour</h4>
    <div class="line">
      <input type="range" min="0" max="23.5" step="0.5" bind:value={hour} disabled={off} aria-label="Hour" />
      <span class="val">{String(Math.floor(hour)).padStart(2, '0')}:{hour % 1 ? '30' : '00'}</span>
      <button disabled={off} title={wb || "Jump the clock; today's totals restart"} onclick={() => run('set_hour', [hour])}>Go</button>
    </div>
  </section>

  <h3>Director <small>{perm.admin ? '' : ab}</small></h3>

  <section>
    <h4>Scenario</h4>
    <div class="seg wrap">
      {#each SCENARIOS as s (s)}
        <button class:on={scenario === s} disabled={!perm.admin || mg.busy || scenario === s} title={ab || s} onclick={() => run('set_scenario', [s])}>{s.replaceAll('_', ' ')}</button>
      {/each}
    </div>
  </section>

  <section>
    <h4>Speed <small>24 simulated hours in {num(1440 / (Number.isFinite(speed) && speed > 0 ? speed : 120), 0)} real minutes</small></h4>
    <div class="seg">
      {#each SPEEDS as f (f)}
        <button class:on={speed === f} disabled={!perm.admin || mg.busy || speed === f} title={ab || `${f}×`} onclick={() => run('set_speed', [f])}>{f}×</button>
      {/each}
    </div>
  </section>
</Panel>

<style>
  .chip { padding: 1px 8px; border-radius: 10px; background: var(--bg-3); color: var(--fg-1); font-size: var(--text-xs); letter-spacing: 0.04em; }
  .gate { margin: 0 0 var(--space-2); color: var(--warn); font-size: var(--text-xs); }
  h3 { margin: var(--space-4) 0 var(--space-2); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-0); }
  h3 small, h4 small { color: var(--fg-2); text-transform: none; letter-spacing: 0; margin-left: 6px; font-weight: 400; }
  h4 { margin: 0 0 4px; font-size: var(--text-xs); color: var(--fg-2); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 500; }
  section { margin-bottom: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--line); }
  .line { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-bottom: 4px; }
  .line b { color: var(--fg-0); width: 22px; }
  .seg { display: flex; gap: 4px; flex-wrap: wrap; }
  .state { color: var(--ok); font-weight: 600; min-width: 84px; font-size: var(--text-xs); letter-spacing: 0.06em; }
  .state.bad { color: var(--alarm); }
  .val { min-width: 48px; color: var(--fg-0); }
  .note { color: var(--warn); font-size: var(--text-xs); }
  input[type='range'] { flex: 1; min-width: 80px; accent-color: var(--accent); }
  select { font: 500 var(--text-sm) var(--font-mono); background: var(--bg-2); color: var(--fg-0); border: 1px solid var(--line-strong); border-radius: var(--radius-2); padding: 2px 4px; }
  button { font: 600 var(--text-xs) var(--font-mono); letter-spacing: 0.04em; color: var(--accent); background: var(--bg-2); border: 1px solid var(--accent); border-radius: var(--radius-2); padding: 4px 10px; cursor: pointer; }
  button:hover:not(:disabled) { background: var(--accent-dim); }
  button.on { background: var(--accent-dim); color: var(--fg-0); }
  button.danger { color: var(--alarm); border-color: var(--alarm); }
  button:disabled { color: var(--fg-2); border-color: var(--line-strong); cursor: not-allowed; }
  button.on:disabled { color: var(--fg-0); border-color: var(--accent); }
</style>
