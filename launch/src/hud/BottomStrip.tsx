import { useTagBool, useTagNumber, useTagString, useTagValue } from '../live/hooks';
import type { TagName } from '../live/paths';
import { FARM_COLOR } from '../world/TankFarm';
import { fmtNum, titleCase, unitOf } from './format';
import { Val } from './Val';

function BigStat({ label, tag, digits }: { label: string; tag: TagName; digits: number }) {
  const v = useTagValue(tag);
  return (
    <div>
      <dt>{label}</dt>
      <dd className="big">
        <b className="mono">{fmtNum(v, digits)}</b>
        <i>{unitOf(tag)}</i>
      </dd>
    </div>
  );
}

function Meter({ value, max, color, warn }: { value: number; max: number; color: string; warn?: boolean }) {
  const k = Math.max(0, Math.min(1, value / max));
  return (
    <span className="meter" aria-hidden>
      <i style={{ width: `${k * 100}%`, background: warn ? 'var(--alarm)' : color }} />
    </span>
  );
}

function Propellant({ kind }: { kind: 'LOX' | 'CH4' }) {
  const p = `Launch/Propellant/${kind}` as const;
  const level = useTagNumber(`${p}/TankLevelPct` as const);
  const press = useTagNumber(`${p}/PressureBar` as const);
  const state = useTagString(`${p}/ChilldownState` as const, 'WARM');
  const vent = useTagBool(`${p}/VentValveOpen` as const);
  const fill = useTagBool(`${p}/FillValveOpen` as const);
  const color = FARM_COLOR[kind];
  return (
    <section className="card" style={{ ['--c' as string]: color }}>
      <h3>
        <span className="swatch" />
        {kind === 'LOX' ? 'Liquid oxygen' : 'Methane'}
        <em className={`chip chill-${state}`}>{state}</em>
      </h3>
      <div className="big">
        <b className="mono">{fmtNum(level, 1)}</b>
        <i>{unitOf(`${p}/TankLevelPct` as const)}</i>
      </div>
      <Meter value={level} max={100} color={color} />
      <dl>
        <div>
          <dt>Pressure</dt>
          <dd>
            <Val tag={`${p}/PressureBar` as const} digits={2} />
          </dd>
        </div>
        <div>
          <dt>Temp</dt>
          <dd>
            <Val tag={`${p}/TempK` as const} digits={1} />
          </dd>
        </div>
        <div>
          <dt>Flow</dt>
          <dd>
            <Val tag={`${p}/FlowKgS` as const} digits={0} />
          </dd>
        </div>
      </dl>
      <div className="flags">
        <span className={fill ? 'on' : ''}>fill</span>
        <span className={vent ? 'on warn' : ''}>vent</span>
        <span className={press > 3.5 ? 'on bad' : ''}>{press > 3.5 ? 'high P' : 'press ok'}</span>
      </div>
    </section>
  );
}

function Bus({ id }: { id: 'A' | 'B' }) {
  const volts = useTagNumber(`Launch/Pad/GSEPower/Bus${id}Volts` as const, 480);
  const state = volts < 455 ? 'bad' : volts < 470 ? 'warn' : 'ok';
  return (
    <div className="bus">
      <i className={`led ${state}`} />
      <span>Bus {id}</span>
      <Val tag={`Launch/Pad/GSEPower/Bus${id}Volts` as const} digits={0} />
      <Val tag={`Launch/Pad/GSEPower/Bus${id}Amps` as const} digits={0} />
    </div>
  );
}

function Power() {
  const deluge = useTagNumber('Launch/Pad/DelugeFlowLpm');
  const umbilical = useTagBool('Launch/Pad/UmbilicalConnected');
  const fts = useTagBool('Launch/Range/FTSArmed');
  return (
    <section className="card" style={{ ['--c' as string]: '#ffc247' }}>
      <h3>
        <span className="swatch" />
        GSE power
      </h3>
      <Bus id="A" />
      <Bus id="B" />
      <dl>
        <div>
          <dt>Water tower</dt>
          <dd>
            <Val tag="Launch/Pad/WaterTowerLevelPct" digits={1} />
          </dd>
        </div>
        <div>
          <dt>Deluge</dt>
          <dd>
            <Val tag="Launch/Pad/DelugeFlowLpm" digits={0} />
          </dd>
        </div>
      </dl>
      <div className="flags">
        <span className={deluge > 100 ? 'on' : ''}>deluge</span>
        <span className={umbilical ? 'on' : ''}>umbilical</span>
        <span className={fts ? 'on warn' : ''}>FTS</span>
      </div>
    </section>
  );
}

function Weather() {
  const lightning = useTagNumber('Launch/Weather/LightningDistanceKm', 70);
  const wind = useTagNumber('Launch/Weather/WindSpeedMS');
  const dir = useTagNumber('Launch/Weather/WindDirDeg');
  const goWx = useTagBool('Launch/Weather/GoForWeather');
  return (
    <section className="card" style={{ ['--c' as string]: '#8fb6ff' }}>
      <h3>
        <span className="swatch" />
        Weather
        <em className={`chip ${goWx ? 'ok' : 'bad'}`}>{goWx ? 'within LCC' : 'violation'}</em>
      </h3>
      <div className="big">
        <b className="mono">{fmtNum(wind, 1)}</b>
        <i>{unitOf('Launch/Weather/WindSpeedMS')}</i>
        <span className="compass" style={{ transform: `rotate(${dir + 180}deg)` }} title={`from ${Math.round(dir)} deg`} aria-hidden />
      </div>
      <Meter value={wind} max={16} color="#8fb6ff" warn={wind > 12} />
      <dl>
        <div>
          <dt>Gust</dt>
          <dd>
            <Val tag="Launch/Weather/GustMS" digits={1} />
          </dd>
        </div>
        <div>
          <dt>Wind from</dt>
          <dd>
            <Val tag="Launch/Weather/WindDirDeg" digits={0} unit="°" />
          </dd>
        </div>
        <div>
          <dt>Lightning</dt>
          <dd className={lightning < 10 ? 'bad' : lightning < 20 ? 'warnv' : ''}>
            <Val tag="Launch/Weather/LightningDistanceKm" digits={1} />
          </dd>
        </div>
      </dl>
    </section>
  );
}

const FLIGHT = new Set(['IGNITION', 'LIFTOFF', 'ASCENT', 'ORBIT']);

function Vehicle() {
  const phase = useTagString('Launch/Clock/Phase', 'IDLE');
  const alt = useTagValue('Launch/Vehicle/AltitudeM');
  const flight = FLIGHT.has(phase);
  const altKm = typeof alt === 'number' ? alt / 1000 : 0;
  const chill = useTagString('Launch/Vehicle/EngineChillState', 'WARM');
  const maxq = useTagBool('Launch/Vehicle/MaxQ');
  const meco = useTagBool('Launch/Vehicle/MECO');
  const sep = useTagBool('Launch/Vehicle/StageSep');
  const seco = useTagBool('Launch/Vehicle/SECO');
  const gimbal = useTagBool('Launch/Vehicle/GimbalCheckOK');
  const padClear = useTagBool('Launch/Pad/PadClear');
  const rangeClear = useTagBool('Launch/Range/RangeClear');
  return (
    <section className="card wide" style={{ ['--c' as string]: 'var(--accent)' }}>
      <h3>
        <span className="swatch" />
        Vehicle
        <em className={`chip eng-${chill}`}>engines {titleCase(chill)}</em>
      </h3>
      {flight ? (
        <>
          <dl className="flight">
            <div>
              <dt>Altitude</dt>
              <dd className="big">
                <b className="mono">{altKm >= 10 ? fmtNum(altKm, 1) : fmtNum(altKm * 1000, 0)}</b>
                <i>{altKm >= 10 ? 'km' : 'm'}</i>
              </dd>
            </div>
            <BigStat label="Velocity" tag="Launch/Vehicle/VelocityMS" digits={0} />
            <BigStat label="Accel" tag="Launch/Vehicle/AccelG" digits={2} />
            <BigStat label="Thrust" tag="Launch/Vehicle/ThrustPct" digits={0} />
          </dl>
          <div className="flags">
            <span className={maxq ? 'on' : ''}>max-q</span>
            <span className={meco ? 'on' : ''}>meco</span>
            <span className={sep ? 'on' : ''}>stage sep</span>
            <span className={seco ? 'on' : ''}>seco</span>
          </div>
        </>
      ) : (
        <>
          <dl className="grid4">
            <div>
              <dt>S1 LOX / CH4</dt>
              <dd>
                <Val tag="Launch/Vehicle/Stage1/LOXPressureBar" digits={2} unit="" />
                <span className="sep"> / </span>
                <Val tag="Launch/Vehicle/Stage1/CH4PressureBar" digits={2} />
              </dd>
            </div>
            <div>
              <dt>S2 LOX / CH4</dt>
              <dd>
                <Val tag="Launch/Vehicle/Stage2/LOXPressureBar" digits={2} unit="" />
                <span className="sep"> / </span>
                <Val tag="Launch/Vehicle/Stage2/CH4PressureBar" digits={2} />
              </dd>
            </div>
            <div>
              <dt>Battery</dt>
              <dd>
                <Val tag="Launch/Vehicle/BatteryVoltage" digits={1} />
                <span className="sep"> · </span>
                <Val tag="Launch/Vehicle/BatterySOCPct" digits={0} />
              </dd>
            </div>
            <div>
              <dt>Avionics</dt>
              <dd>
                <Val tag="Launch/Vehicle/AvionicsTempC" digits={1} />
              </dd>
            </div>
          </dl>
          <div className="flags">
            <span className={gimbal ? 'on' : ''}>gimbal check</span>
            <span className={padClear ? 'on' : ''}>pad clear</span>
            <span className={rangeClear ? 'on' : ''}>range clear</span>
          </div>
        </>
      )}
    </section>
  );
}

export function BottomStrip() {
  return (
    <footer className="strip">
      <Propellant kind="LOX" />
      <Propellant kind="CH4" />
      <Power />
      <Weather />
      <Vehicle />
    </footer>
  );
}
