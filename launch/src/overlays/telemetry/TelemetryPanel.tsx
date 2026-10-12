import { useEffect, useState } from 'react';
import { useTagString } from '../../live/hooks';
import type { TagName } from '../../live/paths';
import { Panel } from '../Panel';
import { ChartCell } from './ChartCell';
import { defaultChannels, MAX_CHANNELS, PICKABLE, shortName, WINDOWS } from './channels';
import { historyVersion, loadHistory, startSampler } from './feed';

/** Slide-in telemetry strip charts (key T). Default channel set follows the phase until the user picks channels. */
export default function TelemetryPanel() {
  const phase = useTagString('Launch/Clock/Phase', 'IDLE');
  const [picked, setPicked] = useState<TagName[] | null>(null);
  const [windowMs, setWindowMs] = useState<number>(WINDOWS[0].ms);
  const [paused, setPaused] = useState(false);
  const [version, setVersion] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const channels = picked ?? defaultChannels(phase);
  const key = channels.join('|');

  useEffect(() => startSampler(), []);

  // Back-fill 60 points whenever the window or the channel set changes.
  useEffect(() => {
    let stale = false;
    void loadHistory(channels, windowMs).then(() => !stale && setVersion(historyVersion()));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, windowMs]);

  const toggle = (t: TagName) => {
    const cur = picked ?? channels;
    setPicked(cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < MAX_CHANNELS ? [...cur, t] : cur);
  };

  return (
    <Panel id="telemetry" title="Telemetry" hint="T" wide>
      <div className="ovl-bar">
        <div className="seg" role="group" aria-label="Window">
          {WINDOWS.map((w) => (
            <button key={w.ms} type="button" className={w.ms === windowMs ? 'on' : ''} onClick={() => setWindowMs(w.ms)}>
              {w.label}
            </button>
          ))}
        </div>
        <button type="button" className={`btn ${paused ? 'primary' : ''}`} onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="btn" onClick={() => setPickerOpen((o) => !o)} aria-expanded={pickerOpen}>
          Channels ({channels.length})
        </button>
        {picked && (
          <button type="button" className="btn ghost" onClick={() => setPicked(null)} title="Follow the phase again">
            Auto
          </button>
        )}
      </div>
      {pickerOpen && (
        <ul className="picker" aria-label="Channel picker">
          {PICKABLE.map((t) => (
            <li key={t}>
              <label>
                <input type="checkbox" checked={channels.includes(t)} onChange={() => toggle(t)} disabled={!channels.includes(t) && channels.length >= MAX_CHANNELS} />
                {shortName(t)}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="charts">
        {channels.map((t) => (
          <ChartCell key={t} tag={t} windowMs={windowMs} paused={paused} version={version} />
        ))}
      </div>
    </Panel>
  );
}
