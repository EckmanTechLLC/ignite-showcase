<script lang="ts">
  import Panel from '../Panel.svelte';
  import { auditProfile, doLogin, doLogout, ident, perm } from '../../identity.svelte';
  import { fetchAudit, type AuditRow } from './audit.svelte';

  let name = $state('');
  let pass = $state('');
  let err = $state('');
  let working = $state(false);
  let formOpen = $state(false);
  const tierTitle = $derived(`Tier from permissions. Security levels: ${ident.levels.length ? ident.levels.join(', ') : 'none'}`);

  async function submit(e: Event): Promise<void> {
    e.preventDefault();
    if (working || !name || !pass) return;
    working = true;
    err = '';
    try {
      await doLogin(name.trim(), pass);
      pass = '';
      formOpen = false;
    } catch (x) {
      err = x instanceof Error ? x.message : 'Login failed.';
    } finally {
      working = false;
    }
  }

  // Audit view: Director tier, last 30 min, every 10 s while the panel is open and the tab visible.
  let audit = $state<AuditRow[]>([]);
  let auditErr = $state('');
  const showAudit = $derived(!!auditProfile && perm.admin);

  $effect(() => {
    if (!showAudit) return;
    let stop = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const rows = await fetchAudit();
        if (!stop) {
          audit = rows;
          auditErr = '';
        }
      } catch (x) {
        if (!stop) auditErr = x instanceof Error ? x.message : 'audit failed';
      }
    };
    void load();
    const id = window.setInterval(load, 10_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  });

  const byActor = $derived.by(() => {
    const m = new Map<string, AuditRow[]>();
    for (const r of audit) (m.get(r.actor) ?? m.set(r.actor, []).get(r.actor)!).push(r);
    return [...m.entries()].sort((a, b) => b[1][0].time - a[1][0].time);
  });
  const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });
</script>

<Panel title="Identity" hotkey="L">
  {#snippet head()}<span class="chip {ident.tier.toLowerCase()}" title={tierTitle}>{ident.method === 'web' ? `Gateway session · ${ident.user} · ` : ''}{ident.tier}</span>{/snippet}

  {#if ident.method === 'bearer'}
    <div class="who">
      <div><b>{ident.user}</b><small title={tierTitle}>{ident.tier} session</small></div>
      <div class="acts">
        <button onclick={() => doLogout()}>Log out</button>
        <details><summary>More</summary><button onclick={() => doLogout(true)}>Log out everywhere</button></details>
      </div>
    </div>
  {:else if ident.method === 'web'}
    <div class="who web">
      <div>
        <small>Gateway session</small><b>{ident.user}</b><small title={tierTitle}>{ident.tier}</small>
        <p class="note">You are identified by your Ignition gateway login. Tiers come from that account's roles.</p>
      </div>
      {#if !formOpen}<button onclick={() => (formOpen = true)}>Log in as a different user</button>{/if}
    </div>
  {/if}
  {#if ident.method === null || (ident.method === 'web' && formOpen)}
    <form class="login" onsubmit={submit}>
      {#if ident.method === null}<p class="note">Viewer (API key), read-only until you log in. Operator can acknowledge and run dispatch and scenario actions; Director also sets the raw scenario and speed and sees the audit view.</p>{/if}
      <label>User<input bind:value={name} autocomplete="username" spellcheck="false" /></label>
      <label>Password<input bind:value={pass} type="password" autocomplete="current-password" /></label>
      {#if err}<p class="err" role="alert">{err}</p>{/if}
      <button type="submit" disabled={working || !name || !pass}>{working ? 'Signing in…' : 'Log in'}</button>
      {#if ident.method === 'web'}<button type="button" onclick={() => (formOpen = false)}>Cancel</button>{/if}
    </form>
  {/if}

  {#if auditProfile}
    <h3>Audit <small>last 30 min &middot; every 10 s</small></h3>
    {#if !perm.admin}
      <p class="note">{perm.adminBlock}.</p>
    {:else}
      {#if auditErr}<p class="err">{auditErr}</p>
      {:else if !audit.length}<p class="note">No audit entries in the last 30 minutes.</p>{/if}
      {#each byActor as [actor, list] (actor)}
        <section class="actor">
          <h4>{actor} <i>{list.length}</i></h4>
          {#each list as r, i (i)}
            <div class="line" class:bad={!r.ok}><span>{hhmmss(r.time)}</span><b>{r.action}</b><em>{r.target}</em><span class="val">{r.value}</span></div>
          {/each}
        </section>
      {/each}
    {/if}
  {/if}
</Panel>

<style>
  .chip { padding: 1px 10px; border-radius: 10px; background: var(--bg-3); color: var(--fg-1); font-size: var(--text-xs); letter-spacing: 0.06em; }
  .chip.operator { color: var(--ok); }
  .chip.director { color: var(--accent); }
  .chip.viewer { color: var(--info); }
  .who { display: flex; justify-content: space-between; align-items: center; padding: var(--space-2) var(--space-3); background: var(--bg-2); border-radius: var(--radius-3); margin-bottom: var(--space-2); }
  .who b { color: var(--fg-0); display: block; }
  .who small { color: var(--fg-2); }
  .who.web { display: grid; gap: var(--space-2); }
  .acts { display: grid; gap: 4px; justify-items: end; }
  .acts summary { color: var(--fg-2); font-size: var(--text-xs); cursor: pointer; }
  .login { display: grid; gap: var(--space-2); }
  label { display: grid; gap: 2px; color: var(--fg-2); font-size: var(--text-xs); letter-spacing: 0.06em; }
  input { font: 500 var(--text-sm) var(--font-mono); background: var(--bg-2); color: var(--fg-0); border: 1px solid var(--line-strong); border-radius: var(--radius-2); padding: 6px 8px; }
  input:focus { outline: 1px solid var(--accent); }
  button { font: 600 var(--text-xs) var(--font-mono); letter-spacing: 0.04em; color: var(--accent); background: var(--bg-2); border: 1px solid var(--accent); border-radius: var(--radius-2); padding: 6px 14px; cursor: pointer; justify-self: start; }
  button:hover:not(:disabled) { background: var(--accent-dim); }
  button:disabled { color: var(--fg-2); border-color: var(--line-strong); cursor: not-allowed; }
  .note { margin: 0; color: var(--fg-2); font-size: var(--text-xs); }
  .err { margin: 0; color: var(--alarm); }
  h3 { margin: var(--space-5) 0 var(--space-2); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-0); }
  h3 small { color: var(--fg-2); text-transform: none; letter-spacing: 0; margin-left: 6px; }
  h4 { margin: var(--space-3) 0 2px; color: var(--accent); font-size: var(--text-sm); }
  h4 i { font-style: normal; color: var(--fg-2); font-size: var(--text-xs); }
  .line { display: grid; grid-template-columns: 64px 110px 1fr auto; gap: 8px; font-size: 11px; padding: 2px 0; border-top: 1px solid var(--line); }
  .line b { color: var(--fg-0); font-weight: 500; }
  .line em { font-style: normal; color: var(--fg-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .line .val { color: var(--fg-2); }
  .line.bad .val { color: var(--alarm); }
</style>
