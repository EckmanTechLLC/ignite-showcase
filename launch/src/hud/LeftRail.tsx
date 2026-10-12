import { useTagBool, useTagNumber, useTagString } from '../live/hooks';
import type { TagName } from '../live/paths';
import { fmtTShort } from './format';

const CONSOLES: { label: string; tag: TagName }[] = [
  { label: 'Propellant', tag: 'Launch/Clock/GoNoGo/Propellant' },
  { label: 'GSE', tag: 'Launch/Clock/GoNoGo/GSE' },
  { label: 'Range', tag: 'Launch/Clock/GoNoGo/Range' },
  { label: 'Weather', tag: 'Launch/Clock/GoNoGo/Weather' },
  { label: 'Vehicle', tag: 'Launch/Clock/GoNoGo/Vehicle' },
  { label: 'Launch Director', tag: 'Launch/Clock/GoNoGo/LaunchDirector' },
];

function Console({ label, tag }: { label: string; tag: TagName }) {
  const go = useTagBool(tag);
  return (
    <li className={go ? 'go' : 'nogo'}>
      <span>{label}</span>
      <b>{go ? 'GO' : 'NO-GO'}</b>
    </li>
  );
}

interface Milestone {
  label: string;
  /** Seconds relative to T0 for count events. */
  at?: number;
  /** Latched flag tag for flight events. */
  flag?: TagName;
}

const MILESTONES: Milestone[] = [
  { label: 'Strongback retract', at: -420 },
  { label: 'Tank pressurise', at: -180 },
  { label: 'FTS armed', at: -60 },
  { label: 'Deluge on', at: -10 },
  { label: 'Ignition', at: -3 },
  { label: 'Lift-off', at: 0 },
  { label: 'Max-Q', flag: 'Launch/Vehicle/MaxQ' },
  { label: 'MECO', flag: 'Launch/Vehicle/MECO' },
  { label: 'Stage separation', flag: 'Launch/Vehicle/StageSep' },
  { label: 'SECO', flag: 'Launch/Vehicle/SECO' },
];

function Timeline() {
  const t = useTagNumber('Launch/Clock/TMinusSeconds', -2400);
  const phase = useTagString('Launch/Clock/Phase', 'IDLE');
  const maxq = useTagBool('Launch/Vehicle/MaxQ');
  const meco = useTagBool('Launch/Vehicle/MECO');
  const sep = useTagBool('Launch/Vehicle/StageSep');
  const seco = useTagBool('Launch/Vehicle/SECO');
  const flags: Record<string, boolean> = {
    'Launch/Vehicle/MaxQ': maxq,
    'Launch/Vehicle/MECO': meco,
    'Launch/Vehicle/StageSep': sep,
    'Launch/Vehicle/SECO': seco,
  };
  // The count only means anything between the start of a count and a safing/abort.
  const counting = !['IDLE', 'RECYCLE', 'SAFING'].includes(phase);
  const done = MILESTONES.map((m) => (!counting ? false : m.flag ? flags[m.flag] : t >= (m.at as number) && phase !== 'CHILLDOWN' && phase !== 'LOADING'));
  const next = done.indexOf(false);
  return (
    <ol className="timeline">
      {MILESTONES.map((m, i) => (
        <li key={m.label} className={done[i] ? 'done' : i === next ? 'next' : ''}>
          <i />
          <span>{m.label}</span>
          <em className="mono">{m.at !== undefined ? fmtTShort(m.at) : ''}</em>
        </li>
      ))}
    </ol>
  );
}

export function LeftRail() {
  return (
    <aside className="rail">
      <section className="panel">
        <h2>Go / No-Go poll</h2>
        <ul className="gonogo">
          {CONSOLES.map((c) => (
            <Console key={c.tag} {...c} />
          ))}
        </ul>
      </section>
      <section className="panel timeline-panel">
        <h2>Sequence</h2>
        <Timeline />
      </section>
    </aside>
  );
}
