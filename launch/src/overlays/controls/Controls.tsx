import { useEffect, useState } from 'react';
import { useTagNumber, useTagString } from '../../live/hooks';
import type { TagName } from '../../live/paths';
import { useSession } from '../identity/session';
import { Panel } from '../Panel';
import { beginRestart, cancelRestart, command, refreshStatus, useLaunchState, useRestarting } from './api';

const CONSOLES: { id: string; label: string; override: TagName }[] = [
  { id: 'Propellant', label: 'Propellant', override: 'Launch/_Sim_/GoOverride/Propellant' },
  { id: 'GSE', label: 'GSE', override: 'Launch/_Sim_/GoOverride/GSE' },
  { id: 'Range', label: 'Range', override: 'Launch/_Sim_/GoOverride/Range' },
  { id: 'Weather', label: 'Weather', override: 'Launch/_Sim_/GoOverride/Weather' },
  { id: 'Vehicle', label: 'Vehicle', override: 'Launch/_Sim_/GoOverride/Vehicle' },
  { id: 'LaunchDirector', label: 'Launch Director', override: 'Launch/_Sim_/GoOverride/LaunchDirector' },
];
const SCENARIOS = ['nominal', 'hold_t40s', 'lox_leak_abort', 'weather_scrub'];
const SPEEDS = [1, 2, 4, 8];
const FAULTS = [
  { id: 'LOXLeak', label: 'LOX leak' },
  { id: 'WeatherScrub', label: 'Weather scrub' },
  { id: 'Lightning', label: 'Lightning (60 s)' },
];

/** Why a command is unavailable right now (state), mirroring the sim's refusals. */
function stateReason(fn: 'start_count' | 'resume' | 'hold' | 'abort' | 'recycle', phase: string, recycleLeft: number): string {
  if (phase === 'RECYCLE') return `Recycling... about ${Math.ceil(recycleLeft)} s left`;
  switch (fn) {
    case 'start_count':
      return `Needs IDLE (now ${phase})`;
    case 'resume':
      return phase === 'HOLD' ? 'A console is NO-GO' : `Needs a HOLD (now ${phase})`;
    case 'hold':
      return 'Needs CHILLDOWN, LOADING or TERMINAL_COUNT, before T-0:10';
    case 'abort':
      return 'Only before lift-off';
    case 'recycle':
      return 'Only from HOLD, ABORT, SAFING or ORBIT';
  }
}

function Confirm({ label, disabled, title, danger, onYes }: { label: string; disabled: boolean; title?: string; danger?: boolean; onYes: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  if (armed && !disabled)
    return (
      <span className="confirm">
        <button type="button" className={`btn ${danger ? 'danger' : ''}`} onClick={() => (setArmed(false), onYes())}>
          Confirm {label}
        </button>
        <button type="button" className="btn ghost" onClick={() => setArmed(false)}>
          Cancel
        </button>
      </span>
    );
  return (
    <span title={title}>
      <button type="button" className={`btn ${danger ? 'danger-o' : ''}`} disabled={disabled} onClick={() => setArmed(true)}>
        {label}
      </button>
    </span>
  );
}

export function Controls() {
  const session = useSession();
  const st = useLaunchState();
  const restarting = useRestarting();
  const phaseTag = useTagString('Launch/Clock/Phase', 'IDLE');
  const speedTag = useTagNumber('Launch/_Sim_/SpeedFactor', 1);
  const phaseTime = useTagNumber('Launch/_Sim_/State/PhaseTime');
  const [reason, setReason] = useState('Operator hold');
  const phase = st?.phase ?? phaseTag;
  const op = session.canWrite;
  const dir = session.canAdmin;
  // The library exposes recycle_remaining_s; fall back to the 30 s minimum of simulated time otherwise.
  const recycleLeft = st?.recycle_remaining_s ?? Math.max(0, 30 - phaseTime) / Math.max(0.25, speedTag);

  useEffect(() => {
    if (op) void refreshStatus();
  }, [op]);

  const gate = (fn: 'start_count' | 'resume' | 'hold' | 'abort' | 'recycle'): { disabled: boolean; title?: string } => {
    if (!op) return { disabled: true, title: 'Log in as Operator to operate' };
    if (!st) return { disabled: true, title: 'Reading sequencer state...' };
    if (restarting) return { disabled: true, title: 'Restart in progress' };
    if (st.command_pending) return { disabled: true, title: 'Previous command still pending' };
    return st.can[fn] ? { disabled: false } : { disabled: true, title: stateReason(fn, phase, recycleLeft) };
  };
  const dirTitle = dir ? undefined : op ? 'Director tier required' : 'Log in as Director to use';
  const dirOff = !dir || restarting;

  const start = gate('start_count');
  const hold = gate('hold');
  const resume = gate('resume');
  const abort = gate('abort');
  const recycle = gate('recycle');

  return (
    <Panel id="controls" title="Sequencer" hint="C">
      {!op && <p className="note">Read-only. <b>Log in to operate</b> (press L).</p>}
      <p className="phaseline">
        Phase <b className={`ph phase-${phase}`}>{phase}</b>
        {phase === 'RECYCLE' && <span className="muted"> recycling... about {Math.ceil(recycleLeft)} s left</span>}
        {st?.command_pending && <span className="muted"> command pending</span>}
      </p>

      <div className="ctl-row">
        <span title={start.title}>
          <button type="button" className="btn primary" disabled={start.disabled} onClick={() => void command('start_count')}>
            Start count
          </button>
        </span>
        <span title={resume.title}>
          <button type="button" className="btn" disabled={resume.disabled} onClick={() => void command('resume')}>
            Resume
          </button>
        </span>
        <Confirm label="Abort" danger disabled={abort.disabled} title={abort.title} onYes={() => void command('abort', ['Operator abort'])} />
        <Confirm label="Recycle" disabled={recycle.disabled} title={recycle.title} onYes={() => void command('recycle')} />
      </div>

      <div className="ctl-row">
        <input
          className="inp"
          value={reason}
          maxLength={80}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Hold reason"
          placeholder="Hold reason"
          disabled={hold.disabled}
        />
        <span title={hold.title}>
          <button type="button" className="btn" disabled={hold.disabled} onClick={() => void command('hold', [reason.trim() || 'Operator hold'])}>
            Hold
          </button>
        </span>
      </div>

      <div className="ctl-row">
        {restarting ? (
          <>
            <span className="muted">Restarting: abort, recycle, start...</span>
            <button type="button" className="btn ghost" onClick={cancelRestart}>
              Stop
            </button>
          </>
        ) : (
          <Confirm
            label="Restart count"
            danger
            disabled={!op || !st || (!st.can.abort && !st.can.recycle && !st.can.start_count)}
            title={!op ? 'Log in as Operator to operate' : phase === 'RECYCLE' ? stateReason('start_count', phase, recycleLeft) : 'Aborts and recycles the vehicle, then starts a new count'}
            onYes={beginRestart}
          />
        )}
      </div>

      <h3>Go / No-Go consoles</h3>
      <ul className="go-list">
        {CONSOLES.map((c) => (
          <GoRow key={c.id} {...c} go={st?.go[c.id]} disabled={!op} />
        ))}
      </ul>

      <h3>Director</h3>
      <div className="ctl-group" title={dirTitle}>
        <span className="lbl">Scenario</span>
        <div className="seg">
          {SCENARIOS.map((s) => (
            <button key={s} type="button" className={(st?.scenario ?? '') === s ? 'on' : ''} disabled={dirOff} onClick={() => void command('set_scenario', [s])}>
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>
      <div className="ctl-group" title={dirTitle}>
        <span className="lbl">Speed</span>
        <div className="seg">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={Math.abs((st?.speed ?? speedTag) - s) < 1e-6 ? 'on' : ''} disabled={dirOff} onClick={() => void command('set_speed', [s])}>
              {s}x
            </button>
          ))}
        </div>
      </div>
      <div className="ctl-group" title={dirTitle}>
        <span className="lbl">Faults</span>
        <div className="seg">
          {FAULTS.map((f) => {
            const on = st?.faults?.[f.id] === true;
            return (
              <button key={f.id} type="button" className={on ? 'on bad' : ''} disabled={dirOff} onClick={() => void command('inject_fault', [f.id, !on])}>
                {f.label} {on ? 'on' : 'off'}
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function GoRow({ id, label, override, go, disabled }: { id: string; label: string; override: TagName; go?: boolean; disabled: boolean }) {
  const ov = useTagString(override, 'AUTO');
  const set = (v: boolean | null) => void command('set_go', [id, v]);
  return (
    <li>
      <span className={`dot2 ${go === undefined ? '' : go ? 'go' : 'nogo'}`} />
      <span className="gname">{label}</span>
      <div className="seg sm" title={disabled ? 'Log in as Operator to operate' : undefined}>
        <button type="button" disabled={disabled} className={ov === 'AUTO' ? 'on' : ''} onClick={() => set(null)}>
          Auto
        </button>
        <button type="button" disabled={disabled} className={ov === 'GO' ? 'on' : ''} onClick={() => set(true)}>
          Go
        </button>
        <button type="button" disabled={disabled} className={ov === 'NOGO' ? 'on bad' : ''} onClick={() => set(false)}>
          No-Go
        </button>
      </div>
    </li>
  );
}
