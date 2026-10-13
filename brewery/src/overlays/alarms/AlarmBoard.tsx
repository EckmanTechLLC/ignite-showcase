import { For, Show, createMemo, createSignal } from 'solid-js';
import Panel from '../Panel';
import { canWrite, writeBlock } from '../../identity';
import { tag, tagStr } from '../../live/store';
import { num, unitOf } from '../../fmt';
import { PRIORITY_RANK, acknowledge, activeRows, alarmError, alarmRows, cascadeOf, groupRank, type Row } from './store';

type Filter = 'active' | 'unacked' | 'all';

const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });
const since = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`;
};
/** "QA hold on batch slot B07" -> "QA hold on BR0007 (slot B07)" while the slot's id is known. */
const labelOf = (r: Row): string => r.label.replace(/slot (B\d\d)/, (m, slot: string) => {
  const id = tagStr(`Batches/${slot}/Id`);
  return id ? `${id} (slot ${slot})` : m;
});
function valueOf(t: string): string {
  const v = tag(t);
  if (v === null) return '—';
  return typeof v === 'number' ? `${num(v, Math.abs(v) >= 100 ? 0 : 1)} ${unitOf(t)}`.trim() : String(v);
}

export default function AlarmBoard() {
  const [filter, setFilter] = createSignal<Filter>('active');
  const [artefacts, setArtefacts] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const visible = createMemo(() => alarmRows().filter((r) => (artefacts() || !r.artefact) && (filter() === 'active' ? r.active : filter() === 'unacked' ? !r.acked : true)));
  const groups = createMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of visible()) (m.get(r.group) ?? m.set(r.group, []).get(r.group)!).push(r);
    return [...m.entries()]
      .sort((a, b) => groupRank(a[0]) - groupRank(b[0]))
      .map(([name, list]) => ({ name, list: [...list].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.activeMs - a.activeMs) }));
  });
  const needAck = (list: Row[]) => list.filter((r) => !r.acked).map((r) => r.id);
  const allNeeding = createMemo(() => needAck(visible()));
  const cascade = createMemo(() => cascadeOf(alarmRows()));
  const offset = (ms: number) => {
    const s = Math.round((ms - cascade()[0].row.activeMs) / 1000);
    return s <= 0 ? '+0:00' : `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  async function ack(ids: string[]): Promise<void> {
    setBusy(true);
    try {
      await acknowledge(ids);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Alarms"
      hotkey="A"
      head={
        <For each={['active', 'unacked', 'all'] as const}>
          {(f) => (
            <button class="pill" classList={{ on: filter() === f }} onClick={() => setFilter(f)}>
              {f === 'active' ? 'Active' : f === 'unacked' ? 'Needs ack' : 'All events'}
            </button>
          )}
        </For>
      }
    >
      <div class="casc">
        <div class="ch">
          <span>GLYCOL FAILURE CASCADE</span>
          <span class="count" classList={{ hot: activeRows().length > 0 }}>{activeRows().length} active</span>
        </div>
        <Show when={cascade().length > 1} fallback={<div class="empty">No glycol cascade on record. Director: set the glycol_failure scenario in Controls (C).</div>}>
          <ol>
            <For each={cascade()}>
              {(s) => (
                <li class={s.row.priority.toLowerCase()} classList={{ cleared: !s.row.active }}>
                  <span class="off">{offset(s.row.activeMs)}</span>
                  <b>{s.level}</b>
                  <span class="t">{hhmmss(s.row.activeMs)}</span>
                  <em>{labelOf(s.row)}</em>
                </li>
              )}
            </For>
          </ol>
          <div class="sub">glycol supply and load, then the fermenter temperature and pressure alarms, then the QA hold, in the order they raised</div>
        </Show>
      </div>

      <div class="abar">
        <Show when={alarmError()} fallback={<span>{visible().length} shown</span>}>
          <span class="err">{alarmError()}</span>
        </Show>
        <label class="hint" style={{ margin: 0, display: 'flex', gap: '5px', 'align-items': 'center' }} title="The tag load creates one zero-length Cleared event per alarm">
          <input type="checkbox" checked={artefacts()} onChange={(e) => setArtefacts(e.currentTarget.checked)} /> show load artefacts
        </label>
        <button class="act" disabled={!canWrite() || !allNeeding().length || busy()} title={writeBlock() || (allNeeding().length ? 'Acknowledge every visible alarm' : 'Nothing to acknowledge')} onClick={() => void ack(allNeeding())}>
          Acknowledge all visible ({allNeeding().length})
        </button>
      </div>
      <Show when={!canWrite()}>
        <p class="warn">{writeBlock()} — acknowledge needs the Operator tier.</p>
      </Show>

      <Show when={!groups().length}>
        <div class="empty">{filter() === 'active' ? 'No active alarms.' : 'Nothing to show.'}</div>
      </Show>
      <For each={groups()}>
        {(g) => (
          <section class="grp">
            <h3>
              {g.name} <i>{g.list.length}</i>
              <button class="act sm" disabled={!canWrite() || !needAck(g.list).length || busy()} title={writeBlock() || 'Acknowledge this group'} onClick={() => void ack(needAck(g.list))}>
                Ack group
              </button>
            </h3>
            <For each={g.list}>
              {(r) => (
                <div class={`arow ${r.priority.toLowerCase()}`} classList={{ cleared: !r.active }}>
                  <i class="pri" title={r.priority} />
                  <div class="main">
                    <b>{labelOf(r)}</b>
                    <small>{r.tag}</small>
                  </div>
                  <span class="state">{r.active ? (r.acked ? 'Active, acked' : 'Active') : r.acked ? 'Cleared, acked' : 'Cleared, unacked'}</span>
                  <span class="val">{valueOf(r.tag)}</span>
                  <span class="age" title={new Date(r.activeMs).toLocaleString()}>{since(r.activeMs)}</span>
                  <button class="act sm" disabled={!canWrite() || r.acked || busy()} title={writeBlock() || (r.acked ? 'Already acknowledged' : 'Acknowledge')} onClick={() => void ack([r.id])}>
                    Ack
                  </button>
                </div>
              )}
            </For>
          </section>
        )}
      </For>
    </Panel>
  );
}
