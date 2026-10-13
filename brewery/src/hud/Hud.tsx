import { Show } from 'solid-js';
import Roll from './Roll';
import { dataAgeS, live, tagNum, tagStr } from '../live/store';
import { identity } from '../identity';
import { help, setHelp } from '../ui';
import { MODE_TONE } from '../model';
import { hhmm, num, pretty } from '../fmt';

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export default function Hud() {
  const mode = () => tagStr('KPI/Mode');
  const modeTone = () => MODE_TONE[mode()] ?? 'off';
  const alarms = () => tagNum('KPI/ActiveAlarms');
  const speed = () => tagNum('_Sim_/SpeedFactor');
  const accel = () => tagNum('_Sim_/FermentAccel');
  const occ = () => tagNum('KPI/CellarOccupancyPct');
  const oee = () => tagNum('KPI/LineOEE') * 100;
  const age = () => dataAgeS();
  const linkLabel = () => (live.connection === 'closed' ? 'RECONNECTING' : live.connection === 'connecting' ? 'CONNECTING' : age() > 10 ? 'STALE' : 'LIVE');
  const linkTone = () => (live.connection === 'open' && age() <= 10 ? 'ok' : live.connection === 'closed' ? 'alarm' : 'warn');
  const ageText = () => (Number.isFinite(age()) ? (age() < 10 ? age().toFixed(1) : Math.round(age()).toString()) + ' s' : '—');
  const idLabel = () => {
    const i = identity();
    return i.method === 'web' ? `Gateway session · ${i.user}` : i.method === 'bearer' ? `Bearer · ${i.user}` : 'Anonymous · API key';
  };
  const idTitle = () => (identity().levels.length ? `Security levels: ${identity().levels.join(', ')}` : 'Identity as the gateway sees it');
  const clock = () => {
    const h = tagNum('Time/HourOfDay');
    return Number.isFinite(h) ? `Day ${tagNum('Time/DayIndex')} · ${hhmm(h)}` : '—';
  };

  return (
    <header class={`hud mono mode-${modeTone()}`}>
      <div class="brand">
        <svg viewBox="0 0 24 24" class="logo" aria-hidden="true">
          <path d="M6 7h10v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zM16 9h2a2 2 0 0 1 0 6h-2M8 4c0-1 1-1 1-2M12 4c0-1 1-1 1-2" />
        </svg>
        <div>
          <div class="title">Craft Brewery</div>
          <div class="sub">Ignite showcase</div>
        </div>
      </div>

      <div class="tile">
        <div class="k">IN PROGRESS</div>
        <div class="v"><Roll value={tagNum('KPI/BatchesInProgress')} /></div>
        <div class="s">batches</div>
      </div>
      <div class="tile">
        <div class="k">BREWS TODAY</div>
        <div class="v"><Roll value={tagNum('KPI/BrewsToday')} /></div>
        <div class="s">{clock()}</div>
      </div>
      <div class="tile">
        <div class="k">HL TODAY</div>
        <div class="v"><Roll value={tagNum('KPI/HlToday')} digits={1} /></div>
        <div class="s">brewed</div>
      </div>
      <div class="tile">
        <div class="k">CELLAR</div>
        <div class="v"><Roll value={occ()} /><span class="u"> %</span></div>
        <div class="meter"><i style={{ transform: `scaleX(${clamp01(occ() / 100)})` }} /></div>
      </div>

      <div class="sep" />

      <div class="tile">
        <div class="k">LINE OEE</div>
        <div class="v"><Roll value={oee()} /><span class="u"> %</span></div>
        <div class="meter"><i style={{ transform: `scaleX(${clamp01(oee() / 100)})` }} /></div>
      </div>
      <div class="tile">
        <div class="k">GOOD CANS</div>
        <div class="v"><Roll value={tagNum('KPI/GoodCansToday')} group /></div>
        <div class="s">reject {num(tagNum('KPI/RejectPct'), 2)} %</div>
      </div>

      <div class="spacer" />

      <div class="tile alarms" classList={{ crit: alarms() > 0 }} title="Active alarms (alarm board arrives with the overlays)">
        <div class="k">ALARMS</div>
        <div class="v" classList={{ hot: alarms() > 0 }}>{num(alarms(), 0)}</div>
        <div class="s">active</div>
      </div>

      <div class="tile mode">
        <div class="k">MODE</div>
        <div class={`badge ${modeTone()}`} classList={{ pulse: modeTone() === 'alarm' || modeTone() === 'warn' }}>{pretty(mode())}</div>
        <div class="chips">
          <span class="chip" title="Sim scenario">{pretty(tagStr('_Sim_/Scenario'))}</span>
          <span class="chip" title="Sim speed factor (1 real minute = this many simulated minutes) and fermentation acceleration">
            {Number.isFinite(speed()) ? `${speed()}×` : '—'}
            {Number.isFinite(accel()) ? ` / ferm ${accel()}×` : ''}
          </span>
        </div>
      </div>

      <div class="tile link" title={live.history === 'unavailable' ? 'History/alarms unavailable: the gateway trial may have expired' : ''}>
        <div class="k">SSE LINK</div>
        <div class="linkrow"><i class={`dot ${linkTone()}`} /><b>{linkLabel()}</b></div>
        <div class="s">{live.tagCount ? `live · ${live.tagCount} tags · ` : ''}{ageText()}</div>
        <Show when={live.history === 'unavailable'}>
          <div class="s note" role="status">History/alarms unavailable — gateway trial may have expired</div>
        </Show>
      </div>

      <div class="tile id" title={idTitle()}>
        <div class="k">IDENTITY</div>
        <div class="idrow" classList={{ on: identity().method !== null }}>{idLabel()}</div>
      </div>

      <button class="help" aria-label="Help and about (?)" title="Help (?)" onClick={() => setHelp(!help())}>?</button>
    </header>
  );
}
