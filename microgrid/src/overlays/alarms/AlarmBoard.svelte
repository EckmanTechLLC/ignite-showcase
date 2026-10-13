<script lang="ts">
  import Panel from '../Panel.svelte';
  import { perm } from '../../identity.svelte';
  import { tag } from '../../live/store.svelte';
  import { unitOf, num } from '../../fmt';
  import { GROUP_ORDER, PRIORITY_RANK, acknowledge, activeRows, alarms, cascadeOf, type Row } from './store.svelte';

  type Filter = 'active' | 'unacked' | 'all';
  let filter = $state<Filter>('active');
  let busy = $state(false);

  const visible = $derived(alarms.rows.filter((r) => (filter === 'active' ? r.active : filter === 'unacked' ? !r.acked : true)));
  const groups = $derived.by(() => {
    const m = new Map<string, Row[]>();
    for (const r of visible) (m.get(r.group) ?? m.set(r.group, []).get(r.group)!).push(r);
    return [...m.entries()]
      .sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]))
      .map(([name, list]) => ({ name, list: [...list].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.activeMs - a.activeMs) }));
  });
  const needAck = (list: Row[]) => list.filter((r) => !r.acked).map((r) => r.id);
  const allNeeding = $derived(needAck(visible));
  const cascade = $derived(cascadeOf(alarms.rows));
  const nActive = $derived(activeRows().length);

  async function ack(ids: string[]): Promise<void> {
    busy = true;
    try {
      await acknowledge(ids);
    } finally {
      busy = false;
    }
  }

  const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });
  const since = (ms: number) => {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`;
  };
  function valueOf(t: string): string {
    const v = tag(t);
    if (v === null) return '—';
    return typeof v === 'number' ? `${num(v, Math.abs(v) >= 100 ? 0 : 1)} ${unitOf(t)}`.trim() : String(v);
  }
  const offset = (ms: number) => {
    const s = Math.round((ms - cascade[0].row.activeMs) / 1000);
    return s <= 0 ? '+0:00' : `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
</script>

<Panel title="Alarms" hotkey="A">
  {#snippet head()}
    {#each ['active', 'unacked', 'all'] as const as f (f)}
      <button class="pill" class:on={filter === f} onclick={() => (filter = f)}>{f === 'active' ? 'Active' : f === 'unacked' ? 'Needs ack' : 'All events'}</button>
    {/each}
  {/snippet}

  <div class="casc">
    <div class="ch"><span>PV FAULT CASCADE</span><span class="count" class:hot={nActive > 0}>{nActive} active</span></div>
    {#if cascade.length > 1}
      <ol>
        {#each cascade as s (s.row.id)}
          <li class={s.row.priority.toLowerCase()} class:cleared={!s.row.active}>
            <span class="off">{offset(s.row.activeMs)}</span><b>{s.level}</b><span class="t">{hhmmss(s.row.activeMs)}</span><em>{s.row.label}</em>
          </li>
        {/each}
      </ol>
      <div class="sub">inverter fault, then its strings, then array health, in the order they raised</div>
    {:else}
      <div class="empty">No inverter fault cascade on record. Try Inverter fault A2-B in Controls (C).</div>
    {/if}
  </div>

  <div class="bar">
    {#if alarms.error}<span class="err">{alarms.error}</span>{:else}<span>{visible.length} shown</span>{/if}
    <button class="act" disabled={!perm.write || !allNeeding.length || busy} title={perm.writeBlock || (allNeeding.length ? 'Acknowledge every visible alarm' : 'Nothing to acknowledge')} onclick={() => ack(allNeeding)}>
      Acknowledge all visible ({allNeeding.length})
    </button>
  </div>
  {#if !perm.write}<p class="hint">{perm.writeBlock} &mdash; acknowledge needs the Operator tier.</p>{/if}

  {#if !groups.length}<div class="empty">{filter === 'active' ? 'No active alarms.' : 'Nothing to show.'}</div>{/if}
  {#each groups as g (g.name)}
    <section class="grp">
      <h3>
        {g.name} <i>{g.list.length}</i>
        <button class="act sm" disabled={!perm.write || !needAck(g.list).length || busy} title={perm.writeBlock || 'Acknowledge this group'} onclick={() => ack(needAck(g.list))}>Ack group</button>
      </h3>
      {#each g.list as r (r.id)}
        <div class="row {r.priority.toLowerCase()}" class:cleared={!r.active}>
          <i class="pri" title={r.priority}></i>
          <div class="main"><b>{r.label}</b><small>{r.tag}</small></div>
          <span class="state">{r.active ? (r.acked ? 'Active, acked' : 'Active') : 'Cleared, unacked'}</span>
          <span class="val">{valueOf(r.tag)}</span>
          <span class="age" title={new Date(r.activeMs).toLocaleString()}>{since(r.activeMs)}</span>
          <button class="act sm" disabled={!perm.write || r.acked || busy} title={perm.writeBlock || (r.acked ? 'Already acknowledged' : 'Acknowledge')} onclick={() => ack([r.id])}>Ack</button>
        </div>
      {/each}
    </section>
  {/each}
</Panel>

<style>
  .pill { font: 500 var(--text-xs) var(--font-mono); color: var(--fg-1); background: var(--bg-2); border: 1px solid var(--line-strong); border-radius: 10px; padding: 1px 9px; cursor: pointer; }
  .pill.on { color: var(--accent); border-color: var(--accent); }
  .casc { border: 1px solid var(--line); border-radius: var(--radius-3); padding: var(--space-2) var(--space-3); background: var(--bg-2); margin-bottom: var(--space-3); }
  .ch { display: flex; justify-content: space-between; color: var(--fg-2); font-size: var(--text-xs); letter-spacing: 0.1em; margin-bottom: 4px; }
  .count.hot { color: var(--alarm); font-weight: 700; }
  ol { list-style: none; margin: 0 0 4px; padding: 0; display: grid; gap: 3px; }
  li { display: grid; grid-template-columns: 44px 62px 64px 1fr; gap: 6px; align-items: center; border-left: 3px solid var(--fg-2); padding-left: 6px; }
  li.high { border-left-color: var(--warn); }
  li.critical { border-left-color: var(--alarm); }
  li.medium { border-left-color: var(--info); }
  li.cleared { opacity: 0.6; }
  li .off { color: var(--accent); }
  li b { color: var(--fg-0); font-weight: 500; }
  li .t { color: var(--fg-2); }
  li em { font-style: normal; color: var(--fg-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: var(--text-xs); color: var(--fg-2); }
  .bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2); }
  .err { color: var(--alarm); }
  .hint { margin: 0 0 var(--space-2); color: var(--warn); font-size: var(--text-xs); }
  .empty { color: var(--fg-2); padding: var(--space-2) 0; }
  .act { font: 600 var(--text-xs) var(--font-mono); letter-spacing: 0.04em; color: var(--accent); background: var(--bg-2); border: 1px solid var(--accent); border-radius: var(--radius-2); padding: 3px 10px; cursor: pointer; }
  .act.sm { padding: 1px 8px; }
  .act:hover:not(:disabled) { background: var(--accent-dim); }
  .act:disabled { color: var(--fg-2); border-color: var(--line-strong); cursor: not-allowed; }
  .grp h3 { margin: var(--space-3) 0 4px; font-size: var(--text-xs); letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-0); display: flex; align-items: center; gap: 8px; }
  .grp h3 i { font-style: normal; color: var(--fg-2); flex: 1; }
  .row { display: grid; grid-template-columns: 6px 1fr 96px 74px 34px auto; gap: 8px; align-items: center; padding: 4px 0; border-top: 1px solid var(--line); }
  .row.cleared { opacity: 0.65; }
  .pri { width: 6px; height: 26px; border-radius: 2px; background: var(--fg-2); }
  .critical .pri { background: var(--alarm); box-shadow: 0 0 8px var(--alarm); }
  .high .pri { background: var(--warn); }
  .medium .pri { background: var(--info); }
  .main { min-width: 0; display: flex; flex-direction: column; }
  .main b { color: var(--fg-0); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .main small { color: var(--fg-2); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .state { font-size: 10px; color: var(--fg-2); }
  .val { text-align: right; color: var(--fg-0); }
  .age { color: var(--fg-2); text-align: right; }
</style>
