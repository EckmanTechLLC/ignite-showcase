import { useMemo, useState } from 'react';
import { useSession } from '../identity/session';
import { Panel } from '../Panel';
import { acknowledge, useAlarms, useCascade, type LaunchAlarm } from './store';

const FILTERS = ['All', 'Active', 'Unacked'] as const;
type Filter = (typeof FILTERS)[number];

const hhmmss = (iso?: string): string => (iso ? new Date(iso).toLocaleTimeString([], { hour12: false }) : '--');

function stateLabel(a: LaunchAlarm): string {
  return `${a.active ? 'Active' : 'Cleared'} · ${a.isAcked ? 'Acked' : 'Unacked'}`;
}

function Cascade() {
  const c = useCascade();
  if (!c.lowPressure && !c.noGoHold && !c.abort) return null;
  const steps = [
    { on: c.lowPressure, label: 'Low pressure alarm' },
    { on: c.noGoHold, label: 'NO-GO hold' },
    { on: c.abort, label: 'ABORT' },
  ];
  return (
    <ol className="cascade" aria-label="Abort cascade">
      {steps.map((s) => (
        <li key={s.label} className={s.on ? 'on' : ''}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

export function AlarmBoard() {
  const snap = useAlarms();
  const session = useSession();
  const [filter, setFilter] = useState<Filter>('All');
  const rows = useMemo(
    () => snap.alarms.filter((a) => (filter === 'Active' ? a.active : filter === 'Unacked' ? !a.isAcked : true)),
    [snap.alarms, filter],
  );
  const unacked = rows.filter((a) => !a.isAcked && a.id);
  const why = session.canWrite ? undefined : 'Log in as Operator or Director to acknowledge';
  return (
    <Panel id="alarms" title="Alarms" hint="A">
      <div className="ovl-bar">
        <div className="seg" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f} type="button" className={f === filter ? 'on' : ''} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <span title={why}>
          <button type="button" className="btn" disabled={!session.canWrite || unacked.length === 0} onClick={() => void acknowledge(unacked.map((a) => a.id as string))}>
            Ack all visible ({unacked.length})
          </button>
        </span>
      </div>
      <Cascade />
      {snap.error && <p className="note bad">Alarm feed: {snap.error}</p>}
      <ul className="alarm-list">
        {rows.length === 0 && <li className="empty">No alarms{filter === 'All' ? '' : ` (${filter.toLowerCase()})`}.</li>}
        {rows.map((a) => (
          <li key={a.id ?? a.source ?? a.name} className={`alarm pr-${a.priority ?? 'Low'} ${a.active ? 'act' : 'clr'} ${a.isAcked ? 'ack' : 'unack'}`}>
            <i className="pri" title={a.priority ?? ''} />
            <div className="alarm-m">
              <b>{a.label ?? a.name}</b>
              <span className="muted">
                {a.priority} · {stateLabel(a)}
              </span>
              <span className="muted mono">
                {a.tag ?? a.displayPath} · {a.value} · {hhmmss(a.activeTime)}
              </span>
            </div>
            <span title={why}>
              <button type="button" className="btn sm" disabled={!session.canWrite || a.isAcked || !a.id} onClick={() => void acknowledge([a.id as string])}>
                Ack
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
