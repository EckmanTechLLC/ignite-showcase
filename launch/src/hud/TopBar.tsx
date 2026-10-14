import { useMemo, useSyncExternalStore } from 'react';
import { getCameraState, setDirector, subscribeCamera } from '../cameras/store';
import { presetInfo } from '../cameras/presets';
import { motion } from '../motion';
import { useConnection, useTagNumber, useTagString } from '../live/hooks';
import { num } from '../live/store';
import { fmtClock, fmtDuration, fmtTShort, titleCase } from './format';
import { liveTMinus } from './clock';
import { LiveText } from './LiveText';

const PHASE_NOTE: Record<string, string> = {
  IDLE: 'Standing by',
  CHILLDOWN: 'Chilling feed lines and engines',
  LOADING: 'Loading propellant',
  HOLD: 'Count held',
  TERMINAL_COUNT: 'Terminal count',
  IGNITION: 'Engine start',
  LIFTOFF: 'Lift-off',
  ASCENT: 'Ascent',
  ORBIT: 'Orbit insertion',
  ABORT: 'Abort in progress',
  SAFING: 'Safing the pad',
  RECYCLE: 'Recycling',
};

function Phase() {
  const phase = useTagString('Launch/Clock/Phase', 'IDLE');
  const reason = useTagString('Launch/Clock/HoldReason');
  const running = useTagNumber('Launch/Clock/ClockRunning');
  return (
    <div className="phase-block">
      <span className={`phase phase-${phase}`}>
        <i className="pulse" />
        {titleCase(phase)}
      </span>
      <span className="phase-note">{phase === 'HOLD' || phase === 'ABORT' ? reason || PHASE_NOTE[phase] : PHASE_NOTE[phase] ?? ''}</span>
      <span className="phase-clock-state">{running ? 'clock running' : 'clock stopped'}</span>
    </div>
  );
}

const nextHold = (): string => {
  const at = num('Launch/Clock/NextHoldAtSeconds');
  if (at === 0) return 'none';
  const t = liveTMinus();
  const speed = Math.max(0.01, num('Launch/_Sim_/SpeedFactor', 1));
  const remaining = (at - t) / speed;
  return remaining <= 0 ? `${fmtTShort(at)} now` : `${fmtTShort(at)} in ${fmtDuration(remaining)}`;
};

/** Seconds without any SSE batch before an open stream is called stale (the sim publishes at >= 1 Hz). */
const STALE_AFTER_S = 10;

function Connection() {
  const c = useConnection();
  const text = useMemo(
    () => () => {
      if (c.state === 'connecting') return 'Connecting';
      if (c.state === 'closed') return 'Reconnecting';
      const ageS = c.lastEventAt === 0 ? Infinity : (Date.now() - c.lastEventAt) / 1000;
      const head = ageS > STALE_AFTER_S ? 'Stale' : c.tagCount > 0 ? `Live · ${c.tagCount} tags` : 'Live';
      return `${head} · data age ${Number.isFinite(ageS) ? ageS.toFixed(1) + ' s' : '--'}`;
    },
    [c.state, c.lastEventAt, c.tagCount],
  );
  return (
    <div className="stat conn" title={c.trial || undefined}>
      <span className="stat-l">Link</span>
      <span className="stat-v">
        <i className={`dot ${c.state}`} />
        <LiveText get={text} intervalMs={250} className="mono" />
      </span>
      {c.history === 'unavailable' && (
        <span className="stat-n" role="status">
          Trial expired &mdash; history/alarms paused
        </span>
      )}
    </div>
  );
}

function Director() {
  const cam = useSyncExternalStore(subscribeCamera, getCameraState);
  return (
    <div className="stat">
      <span className="stat-l">Director</span>
      <span className="stat-v">
        <button
          type="button"
          className={`toggle ${cam.director ? 'on' : ''}`}
          onClick={() => setDirector(!cam.director)}
          disabled={motion.reduced}
          title={motion.reduced ? 'Disabled: reduced motion is on' : 'Auto-director (D)'}
          aria-pressed={cam.director}
        >
          {motion.reduced ? 'Off (reduced motion)' : cam.director ? 'Auto' : 'Manual'}
        </button>
        <span className="muted"> {presetInfo(cam.preset).label}</span>
      </span>
    </div>
  );
}

export function TopBar() {
  const speed = useTagNumber('Launch/_Sim_/SpeedFactor', 1);
  const cycle = useTagNumber('Launch/Clock/CycleCount');
  const scenario = useTagString('Launch/_Sim_/Scenario', 'nominal');
  const get = useMemo(() => () => fmtClock(liveTMinus()), []);
  const holdGet = useMemo(() => nextHold, []);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <div>
          <div className="brand-t">Launch Operations</div>
          <div className="brand-s">Pad A · cycle {cycle}{scenario !== 'nominal' ? ` · ${scenario.replace(/_/g, ' ')}` : ''}</div>
        </div>
      </div>
      <div className="clock-block">
        <LiveText get={get} className="clock mono" intervalMs={50} />
        <Phase />
      </div>
      <div className="stats">
        <div className="stat">
          <span className="stat-l">Next hold</span>
          <span className="stat-v">
            <LiveText get={holdGet} className="mono" intervalMs={250} />
          </span>
        </div>
        <div className="stat">
          <span className="stat-l">Sim speed</span>
          <span className="stat-v mono">{speed}×</span>
        </div>
        <Connection />
        <Director />
      </div>
    </header>
  );
}
