# Launch Operations simulation

Gateway-side model behind Demo 1 (ADR-005 section 3 and 6). Everything lives under `[default]Launch/`. A 1 s
gateway timer script (`launch_sim`) advances the model; a project library module (`launch`) is the command API.
State lives only in tags, so the Designer, the demos and a gateway restart all see the same truth.

## Time

`dt = SpeedFactor x real elapsed seconds` (default **4**, so one full cycle - T-40:00 to recycle - takes about
about 12.6 real minutes). Every duration below is in **simulated** seconds and scales with `SpeedFactor`. Each tick
is split into sub-steps of at most one simulated second so events (T-0:10, T-0:03, ...) are not skipped at high
speed. Random streams are `random.Random(Seed * 100003 + TickCount)` per tick: deterministic and stateless.

## Sequencer

| Phase | What happens |
|---|---|
| `IDLE` | Waits 30 s, then (if `AutoCycle` and `Enabled`) starts a count at `StartTMinus` (default -2400). `launch.start_count` starts immediately. |
| `HOLD` | Built-in hold at **T-40:00** (at count start), **T-10:00**, **T-0:40**. Clock frozen, 30 s dwell, then released if every console is GO. See holds below. |
| `CHILLDOWN` | After the first hold both tanks chill down (first-order approach to cryogenic temperature, `WARM -> CHILLING -> READY`). |
| `LOADING` | Fill valves open; flow-limited first-order approach to 100 % (full flow, then a tapered top-off). Tanks vent inside a pressure band. |
| `TERMINAL_COUNT` | From T-10:00. Strongback retract starts T-7:00 (100 % by T-1:00), stage tank pressurisation T-3:00, FTS armed T-1:00, deluge T-0:10. |
| `IGNITION` | T-0:03 to T0, thrust ramps 0 to 100 % while held down. |
| `LIFTOFF` / `ASCENT` | T0 to T+10 s / until SECO. Thrust, gravity, drag, throttle bucket through Max-Q, MECO at T+150 s, stage separation T+152 s, second stage burn T+155 s to SECO at T+480 s. |
| `ORBIT` | After SECO, 20 s, then `SAFING`. |
| `ABORT` | 60 s, vents open, fill stopped, deluge/strongback safed, then `SAFING`. |
| `SAFING` | Offloads the tanks (0.8 %/s), at least 30 s. |
| `RECYCLE` | Faults and scenario cleared, tanks warm up, vehicle reset (at least 30 s), then `IDLE`. |

`Clock/NextHoldAtSeconds` is the T-minus of the next built-in hold, `0` when none remain. Starting a count later
than a hold's T-minus skips that hold (`start_count(-1200)` skips T-40:00).

### Holds, go/no-go and cutoff

* Go/No-Go per console is computed every sub-step from the model (propellant pressure / level, GSE bus voltage,
  range, weather limits, vehicle battery / gimbal check); `LaunchDirector` is GO only if all five others are.
  `launch.set_go(console, True|False|None)` overrides a console (`None` = auto).
* A built-in hold releases after its dwell if all consoles are GO. If something is NO-GO at the end of the dwell the
  hold becomes a *NO-GO hold* (`HoldReason` = `NO-GO: <consoles>`) and releases once everything has been GO for 5 s.
* Any console NO-GO for 3 s during `CHILLDOWN`/`LOADING`/`TERMINAL_COUNT` puts the count in a NO-GO hold if the
  clock is at or before T-0:10. Inside T-0:10 the autosequence cutoff has passed: a NO-GO there is an `ABORT`.
* A NO-GO hold is resolved or escalated: a propellant NO-GO caused by a leak / low pressure that lasts 45 s becomes
  an `ABORT`; a weather NO-GO lasting 90 s becomes a scrub (`RECYCLE`, tanks offloaded).
* The `hold_t40s` scenario keeps the T-0:40 hold open until `launch.resume()` (auto-release after 600 s so an
  unattended sim cannot stall).
* `launch.hold` is possible in `CHILLDOWN`/`LOADING`/`TERMINAL_COUNT` up to T-0:10; `launch.abort` in any pre-liftoff
  phase (also from a hold); nothing can be aborted after T0.

## Scenarios (`_Sim_/Scenario`, set with `launch.set_scenario`)

| Scenario | Behaviour |
|---|---|
| `nominal` | Everything on schedule; weather inside limits. |
| `hold_t40s` | The T-0:40 hold does not auto-release; waits for `launch.resume()`. |
| `lox_leak_abort` | 15 s after loading is under way (LOX READY, level >= 20 %) `Fault/LOXLeak` turns on: 40 kg/s extra outflow, ullage pressure falls toward ambient, flame trench humidity proxy rises to ~95 %. LOX pressure crosses 1.8 bar -> `LowPressure` alarm and Propellant NO-GO -> automatic HOLD (next sequencer cutoff) -> `ABORT` after 45 s unresolved -> `SAFING` -> `RECYCLE`. |
| `weather_scrub` | When `TERMINAL_COUNT` reaches T-5:00 `Fault/WeatherScrub` turns on and the wind climbs 0.08 m/s per s. Past 12 m/s: `HighWind` alarm, Weather NO-GO, HOLD, scrub after 90 s -> `RECYCLE`. |

A scenario is one-shot: entering `RECYCLE` clears `Fault/*` and resets `Scenario` to `nominal`. To play one from the
start of a count call `set_scenario` then `start_count(t_minus)`; with the default AutoCycle the fault appears
once loading has begun (about T-37:00).

## Physics notes

* **Tanks (LOX, CH4).** Mass balance: fill flow (first-order lag, taper over the last 6 %), boil-off
  `k (T_ambient - T_sat) (0.25 + 0.75 level)`, leak. Ullage pressure integrates boil-off and fill compression, loses
  gas through the vent valve (opens at 3.0 bar, closes at 2.7 bar), seeps slowly to ambient; temperature follows the
  saturation temperature of the ullage pressure, so traces are correlated. Tanks idle at 1.5 bar nitrogen pad.
* **Pad.** Strongback / umbilical sequence, deluge (45 000 L/min, water tower 800 000 L), GSE buses sag with load
  (pumps, chill circuit, deluge, strongback), flame trench heats with pad thrust and is cooled by the deluge.
* **Weather.** Mean-reverting random walks (wind 5.5 m/s, gust spikes decaying over ~8 s, lightning 70 km, ...).
* **Vehicle.** 502 t at T0, 7.2 MN stage 1 (3.8 g limit, throttle bucket 62-93 s), 1.0 MN stage 2, thrust direction from
  a pitch table, `g(h)`, centrifugal relief, exponential atmosphere drag. Approximate results: Max-Q ~62 s (~37 kPa),
  MECO T+150 s at ~69 km / 2.4 km/s, SECO T+480 s at ~210 km / 7.8 km/s, ~1500 km downrange.
  `MaxQ`, `MECO`, `StageSep`, `SECO` are latched flags that stay true until `RECYCLE`.
* `Vehicle/EngineChillState` also takes `FIRING` and `SHUTDOWN` in flight. `Pad/FlameTrenchHumidityPct` is an extra
  tag (the leak's humidity proxy).

## Library API (`launch`, call with `POST /script/library {"project":"demo","path":"launch.<fn>","args":[...]}`)

`status()` returns the state dict itself (phase, t_minus, t_minus_label, clock_running, hold_reason, next_hold_at,
cycle, scenario, scenario_step, speed, enabled, auto_cycle, start_t_minus, go{}, no_go[], faults{}, levels, wind,
tick_count, last_error, command_pending, `can{}` = which commands are valid right now). Every other function
returns `{ok, message, state}`; `ok:false` carries the reason and changes nothing.

| Function | Effect |
|---|---|
| `start_count(t_minus=None)` | Phase must be `IDLE`; `t_minus` between -3600 and -30 (default `_Sim_/StartTMinus`). |
| `resume()` | Phase `HOLD` and no console NO-GO. |
| `hold(reason)` | `CHILLDOWN`/`LOADING`/`TERMINAL_COUNT` and clock at or before T-0:10. A manual hold only ends with `resume()`. |
| `abort(reason)` | Any pre-liftoff counting phase. |
| `recycle()` | From `HOLD` (scrub), `ABORT`, `SAFING`, `ORBIT`. |
| `set_scenario(name)` | `nominal`, `hold_t40s`, `lox_leak_abort`, `weather_scrub`. |
| `set_speed(factor)` | 0.25 to 20. |
| `set_go(console, value)` | console in Propellant, GSE, Range, Weather, Vehicle, LaunchDirector; value true / false / null (auto). |
| `inject_fault(name, on)` | `LOXLeak` or `WeatherScrub`, `on` true / false. |

Commands only write `_Sim_/*` tags (`_Sim_/Cmd/Pending` + `Cmd/Arg` for the sequencer commands); the timer executes
them on its next tick, so `state` in the reply is the state before the command is applied (`command_pending` is true).

## History and alarms

27 tags are trended into `IgniteHistorian` (on change, minimum 1 s, maximum 60 s so quiet signals still have a
value for `LastValue` back-fills, absolute deadband sized per signal). Alarm summary: LOX/CH4 `PressureBar` high
(3.5 bar, High) and low (1.8 bar, High, only while `ChilldownState` is READY - added for the leak scenario),
`TempK` high (LOX 110 K, CH4 135 K, Medium, only while READY), `WindSpeedMS` above 12 m/s (High, "Wind exceeds
launch commit criteria"), `LightningDistanceKm` below 10 (Critical), `BatteryVoltage` below 25.5 V (High),
`BusAVolts`/`BusBVolts` below 455 V (High), `FlameTrenchTempC` above 250 (Medium), `Clock/Phase` = `ABORT`
(Critical, "Launch abort"; an `OnCondition` alarm because Equality only accepts numeric setpoints).
Alarms are *manual-acknowledge*, so a cleared alarm stays in `/alarms/status` as `Cleared, Unacknowledged` until acknowledged.

### History caveats (measured on the lab, Internal Historian, `/tags/history`)

* `LastValue` resampling does not look back before `start`. For a tag with **no stored point inside the window** the
  column is `null`; for a tag that gets its first point later in the window, the rows before it come back as an
  uninitialised-looking constant (`1.899514037089523E-248` on a Float8, 12-18 digit integers on an Int4) in
  multi-tag queries. Back-fill only signals that change every second (pressures, flows, temperatures, wind, bus
  volts/amps, altitude/velocity) - the model keeps those moving - or discard implausible rows client-side.
  Levels at 100 %, the clock inside a hold, valves etc. are constant for minutes and will hit this.
* The 60 s maximum-time heartbeat configured on the trended tags did **not** produce stored points for unchanged
  values (a constant level gave no in-window point for 3.5 minutes).
* Boolean tags came back as `null` columns in the one query that included one (`ClockRunning`).
* The lab gateway runs on the 2-hour trial: when it expires the Core Historian answers `/tags/history` with
  "demo period has expired. No data will be returned" until the trial is reset on the gateway home page.

## Tag model

Generated from `tags.json` by `node sim/scripts/tag-table.mjs sim/launch/tags.json --write sim/launch/README.md`.

<!-- tag-table:start -->
110 tags, 27 with history, 13 alarms.

| Tag | Type | Unit | Initial | Alarms | History | Description |
|---|---|---|---|---|---|---|
| Launch/Clock/TMinusSeconds | Int4 | s | -2400 |  | OnChange | Countdown clock, negative before T0, positive after. Frozen during holds. |
| Launch/Clock/ClockRunning | Boolean |  | false |  |  | True while the count is advancing (false in holds, ABORT, IDLE). |
| Launch/Clock/Phase | String |  | IDLE | Abort: OnCondition {[.]Phase} = "ABORT", Critical ("Launch abort") |  | Sequencer phase: IDLE\|CHILLDOWN\|LOADING\|HOLD\|TERMINAL_COUNT\|IGNITION\|LIFTOFF\|ASCENT\|ORBIT\|ABORT\|SAFING\|RECYCLE. |
| Launch/Clock/HoldReason | String |  | "" |  |  | Why the count is held (or the abort reason); empty otherwise. |
| Launch/Clock/NextHoldAtSeconds | Int4 | s | -2400 |  |  | T-minus of the next built-in hold still to come; 0 when none remain. |
| Launch/Clock/CycleCount | Int4 | cycles | 0 |  |  | Number of countdowns started since the model was loaded. |
| Launch/Clock/GoNoGo/Propellant | Boolean |  | false |  |  | Go/No-Go poll result for the Propellant console (true = GO). Overridable through launch.set_go. |
| Launch/Clock/GoNoGo/GSE | Boolean |  | false |  |  | Go/No-Go poll result for the GSE console (true = GO). Overridable through launch.set_go. |
| Launch/Clock/GoNoGo/Range | Boolean |  | false |  |  | Go/No-Go poll result for the Range console (true = GO). Overridable through launch.set_go. |
| Launch/Clock/GoNoGo/Weather | Boolean |  | false |  |  | Go/No-Go poll result for the Weather console (true = GO). Overridable through launch.set_go. |
| Launch/Clock/GoNoGo/Vehicle | Boolean |  | false |  |  | Go/No-Go poll result for the Vehicle console (true = GO). Overridable through launch.set_go. |
| Launch/Clock/GoNoGo/LaunchDirector | Boolean |  | false |  |  | Go/No-Go poll result for the LaunchDirector console (true = GO). Overridable through launch.set_go. |
| Launch/Propellant/LOX/TankLevelPct | Float8 | % | 0 |  | OnChange, deadband 0.05 | LOX tank fill level. |
| Launch/Propellant/LOX/FlowKgS | Float8 | kg/s | 0 |  | OnChange, deadband 1 | LOX transfer flow (negative while offloading). |
| Launch/Propellant/LOX/TempK | Float8 | K | 294 | HighTemp: AboveValue 110, Medium when READY ("LOX temperature high") | OnChange, deadband 0.1 | LOX tank / line temperature. |
| Launch/Propellant/LOX/PressureBar | Float8 | bar | 1.5 | HighPressure: AboveValue 3.5, High ("LOX tank pressure high")<br>LowPressure: BelowValue 1.8, High when READY ("LOX tank pressure low (suspected leak)") | OnChange, deadband 0.005 | LOX tank ullage pressure (absolute). |
| Launch/Propellant/LOX/ChilldownState | String |  | WARM |  |  | LOX chilldown state: WARM\|CHILLING\|READY. |
| Launch/Propellant/LOX/FillValveOpen | Boolean |  | false |  |  | LOX fill / chill valve. |
| Launch/Propellant/LOX/VentValveOpen | Boolean |  | false |  |  | LOX ullage vent valve (opens above band, closes below). |
| Launch/Propellant/LOX/BoiloffKgS | Float8 | kg/s | 0 |  |  | LOX boil-off rate, proportional to (ambient - cryogen temperature). |
| Launch/Propellant/CH4/TankLevelPct | Float8 | % | 0 |  | OnChange, deadband 0.05 | CH4 tank fill level. |
| Launch/Propellant/CH4/FlowKgS | Float8 | kg/s | 0 |  | OnChange, deadband 1 | CH4 transfer flow (negative while offloading). |
| Launch/Propellant/CH4/TempK | Float8 | K | 294 | HighTemp: AboveValue 135, Medium when READY ("CH4 temperature high") | OnChange, deadband 0.1 | CH4 tank / line temperature. |
| Launch/Propellant/CH4/PressureBar | Float8 | bar | 1.5 | HighPressure: AboveValue 3.5, High ("CH4 tank pressure high")<br>LowPressure: BelowValue 1.8, High when READY ("CH4 tank pressure low (suspected leak)") | OnChange, deadband 0.005 | CH4 tank ullage pressure (absolute). |
| Launch/Propellant/CH4/ChilldownState | String |  | WARM |  |  | CH4 chilldown state: WARM\|CHILLING\|READY. |
| Launch/Propellant/CH4/FillValveOpen | Boolean |  | false |  |  | CH4 fill / chill valve. |
| Launch/Propellant/CH4/VentValveOpen | Boolean |  | false |  |  | CH4 ullage vent valve (opens above band, closes below). |
| Launch/Propellant/CH4/BoiloffKgS | Float8 | kg/s | 0 |  |  | CH4 boil-off rate, proportional to (ambient - cryogen temperature). |
| Launch/Vehicle/Stage1/LOXPressureBar | Float8 | bar | 1.2 |  | OnChange, deadband 0.01 | Stage 1 LOX tank pressure. |
| Launch/Vehicle/Stage1/CH4PressureBar | Float8 | bar | 1.2 |  | OnChange, deadband 0.01 | Stage 1 CH4 tank pressure. |
| Launch/Vehicle/Stage2/LOXPressureBar | Float8 | bar | 1.2 |  |  | Stage 2 LOX tank pressure. |
| Launch/Vehicle/Stage2/CH4PressureBar | Float8 | bar | 1.2 |  |  | Stage 2 CH4 tank pressure. |
| Launch/Vehicle/BatteryVoltage | Float8 | V | 27.7 | LowVoltage: BelowValue 25.5, High ("Vehicle battery voltage low") | OnChange, deadband 0.02 | Vehicle main bus voltage. |
| Launch/Vehicle/BatterySOCPct | Float8 | % | 90 |  |  | Vehicle battery state of charge. |
| Launch/Vehicle/AvionicsTempC | Float8 | degC | 24 |  | OnChange, deadband 0.1 | Avionics bay temperature. |
| Launch/Vehicle/EngineChillState | String |  | WARM |  |  | Engine chill state: WARM\|CHILLING\|READY\|FIRING\|SHUTDOWN. |
| Launch/Vehicle/GimbalCheckOK | Boolean |  | false |  |  | Engine gimbal check passed (runs at about T-24:00). |
| Launch/Vehicle/ThrustPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | Thrust of the burning stage, percent of its nominal. |
| Launch/Vehicle/AltitudeM | Float8 | m | 0 |  | OnChange, deadband 10 | Altitude above the pad. |
| Launch/Vehicle/VelocityMS | Float8 | m/s | 0 |  | OnChange, deadband 5 | Inertial speed. |
| Launch/Vehicle/DownrangeKm | Float8 | km | 0 |  |  | Downrange distance. |
| Launch/Vehicle/AccelG | Float8 | g | 1 |  | OnChange, deadband 0.02 | Sensed acceleration (1.0 on the pad, 0 in free fall). |
| Launch/Vehicle/MaxQ | Boolean |  | false |  |  | Latched true once the vehicle has passed maximum dynamic pressure. |
| Launch/Vehicle/MECO | Boolean |  | false |  |  | Latched true after main engine cutoff. |
| Launch/Vehicle/StageSep | Boolean |  | false |  |  | Latched true after stage separation. |
| Launch/Vehicle/SECO | Boolean |  | false |  |  | Latched true after second engine cutoff. |
| Launch/Pad/DelugeArmed | Boolean |  | false |  |  | Water deluge armed (from T-0:10). |
| Launch/Pad/DelugeFlowLpm | Float8 | L/min | 0 |  | OnChange, deadband 200 | Deluge water flow. |
| Launch/Pad/WaterTowerLevelPct | Float8 | % | 100 |  | OnChange, deadband 0.05 | Deluge water tower level. |
| Launch/Pad/GSEPower/BusAVolts | Float8 | V | 480 | LowVoltage: BelowValue 455, High ("GSE bus A voltage low") | OnChange, deadband 0.3 | GSE power bus A voltage. |
| Launch/Pad/GSEPower/BusBVolts | Float8 | V | 480 | LowVoltage: BelowValue 455, High ("GSE bus B voltage low") | OnChange, deadband 0.3 | GSE power bus B voltage. |
| Launch/Pad/GSEPower/BusAAmps | Float8 | A | 40 |  | OnChange, deadband 2 | GSE power bus A current. |
| Launch/Pad/GSEPower/BusBAmps | Float8 | A | 35 |  | OnChange, deadband 2 | GSE power bus B current. |
| Launch/Pad/UmbilicalConnected | Boolean |  | true |  |  | Vehicle umbilicals connected. |
| Launch/Pad/StrongbackRetractPct | Float8 | % | 0 |  |  | Strongback retraction (0 = against vehicle, 100 = fully retracted). |
| Launch/Pad/FlameTrenchTempC | Float8 | degC | 25 | HighTemp: AboveValue 250, Medium ("Flame trench temperature high") | OnChange, deadband 0.5 | Flame trench surface temperature. |
| Launch/Pad/FlameTrenchHumidityPct | Float8 | % | 40 |  |  | Flame trench humidity proxy (rises with a LOX leak and with deluge). |
| Launch/Pad/PadClear | Boolean |  | false |  |  | Pad cleared of personnel. |
| Launch/Weather/WindSpeedMS | Float8 | m/s | 5.5 | HighWind: AboveValue 12, High ("Wind exceeds launch commit criteria") | OnChange, deadband 0.05 | Mean wind speed at the pad. |
| Launch/Weather/WindDirDeg | Float8 | deg | 80 |  |  | Wind direction. |
| Launch/Weather/GustMS | Float8 | m/s | 7 |  | OnChange, deadband 0.1 | Peak gust. |
| Launch/Weather/TempC | Float8 | degC | 22 |  |  | Ambient temperature. |
| Launch/Weather/HumidityPct | Float8 | % | 60 |  |  | Relative humidity. |
| Launch/Weather/PressureHPa | Float8 | hPa | 1013 |  |  | Barometric pressure. |
| Launch/Weather/LightningDistanceKm | Float8 | km | 70 | LightningProximity: BelowValue 10, Critical ("Lightning within 10 km") | OnChange, deadband 0.2 | Distance to nearest lightning. |
| Launch/Weather/CeilingM | Float8 | m | 3000 |  |  | Cloud ceiling. |
| Launch/Weather/UpperWindsMS | Float8 | m/s | 22 |  |  | Upper-level winds (max over the ascent corridor). |
| Launch/Weather/GoForWeather | Boolean |  | true |  |  | Weather within launch commit criteria. |
| Launch/Range/RangeClear | Boolean |  | true |  |  | Range clear of vessels and aircraft. |
| Launch/Range/TrackingLock | Boolean |  | true |  |  | Range tracking lock on the vehicle. |
| Launch/Range/FTSArmed | Boolean |  | false |  |  | Flight termination system armed (from T-1:00). |
| Launch/_Sim_/Enabled | Boolean |  | true |  |  | Run the simulation. Writable. |
| Launch/_Sim_/Scenario | String |  | nominal |  |  | Scenario: nominal\|hold_t40s\|lox_leak_abort\|weather_scrub. Use launch.set_scenario. |
| Launch/_Sim_/ScenarioStep | Int4 | step | 0 |  |  | Scenario progress counter (0 = armed / not started). |
| Launch/_Sim_/SpeedFactor | Float8 | x | 4 |  |  | Sim seconds per real second (a full cycle takes about 12-13 real minutes at 4). |
| Launch/_Sim_/Seed | Int4 |  | 52 |  |  | Seed for the deterministic random streams. |
| Launch/_Sim_/TickCount | Int4 | ticks | 0 |  |  | Timer ticks executed. |
| Launch/_Sim_/LastTickMs | Int8 | ms | 0 |  |  | Epoch milliseconds of the last tick; dt = SpeedFactor x elapsed real time. |
| Launch/_Sim_/AutoCycle | Boolean |  | true |  |  | Restart the count automatically after RECYCLE. Writable. |
| Launch/_Sim_/StartTMinus | Int4 | s | -2400 |  |  | T-minus a new count starts at. Writable. |
| Launch/_Sim_/Fault/LOXLeak | Boolean |  | false |  |  | LOX leak active (extra outflow, falling pressure). |
| Launch/_Sim_/Fault/WeatherScrub | Boolean |  | false |  |  | Wind rising past the launch commit limit. |
| Launch/_Sim_/LastError | String |  | "" |  |  | Last exception caught by the timer script; empty when healthy. |
| Launch/_Sim_/Cmd/Pending | String |  | "" |  |  | Command queue slot written by the launch library: START\|RESUME\|HOLD\|ABORT\|RECYCLE. |
| Launch/_Sim_/Cmd/Arg | String |  | "" |  |  | Argument for the pending command (T-minus seconds or reason text). |
| Launch/_Sim_/GoOverride/Propellant | String |  | AUTO |  |  | Manual Go/No-Go override for Propellant: AUTO\|GO\|NOGO. |
| Launch/_Sim_/GoOverride/GSE | String |  | AUTO |  |  | Manual Go/No-Go override for GSE: AUTO\|GO\|NOGO. |
| Launch/_Sim_/GoOverride/Range | String |  | AUTO |  |  | Manual Go/No-Go override for Range: AUTO\|GO\|NOGO. |
| Launch/_Sim_/GoOverride/Weather | String |  | AUTO |  |  | Manual Go/No-Go override for Weather: AUTO\|GO\|NOGO. |
| Launch/_Sim_/GoOverride/Vehicle | String |  | AUTO |  |  | Manual Go/No-Go override for Vehicle: AUTO\|GO\|NOGO. |
| Launch/_Sim_/GoOverride/LaunchDirector | String |  | AUTO |  |  | Manual Go/No-Go override for LaunchDirector: AUTO\|GO\|NOGO. |
| Launch/_Sim_/State/TMinusExact | Float8 | s | -2400 |  |  | Unrounded T-minus. |
| Launch/_Sim_/State/PhaseTime | Float8 | s | 0 |  |  | Sim seconds spent in the current phase. |
| Launch/_Sim_/State/CountTime | Float8 | s | 0 |  |  | Sim seconds since the count started. |
| Launch/_Sim_/State/HoldsDone | Int4 |  | 0 |  |  | Bitmask of built-in holds already taken or skipped. |
| Launch/_Sim_/State/HoldKind | String |  | "" |  |  | Active hold kind: BUILTIN\|NOGO\|MANUAL\|SCENARIO. |
| Launch/_Sim_/State/HoldIndex | Int4 |  | -1 |  |  | Index of the active built-in hold (-1 none). |
| Launch/_Sim_/State/HoldTime | Float8 | s | 0 |  |  | Sim seconds spent in the active hold. |
| Launch/_Sim_/State/HoldDwellLeft | Float8 | s | 0 |  |  | Remaining dwell of a built-in hold. |
| Launch/_Sim_/State/GoStableTime | Float8 | s | 0 |  |  | Sim seconds all consoles have been GO during a hold. |
| Launch/_Sim_/State/NoGoTime | Float8 | s | 0 |  |  | Sim seconds a console has been NO-GO while counting. |
| Launch/_Sim_/State/ScenarioApplied | String |  | nominal |  |  | Scenario the state machine last synchronised to. |
| Launch/_Sim_/State/ScenarioClock | Float8 | s | 0 |  |  | Scenario trigger timer. |
| Launch/_Sim_/State/FlightTime | Float8 | s | 0 |  |  | Seconds since T0. |
| Launch/_Sim_/State/MassKg | Float8 | kg | 0 |  |  | Vehicle mass in flight. |
| Launch/_Sim_/State/VxMS | Float8 | m/s | 0 |  |  | Horizontal velocity. |
| Launch/_Sim_/State/VyMS | Float8 | m/s | 0 |  |  | Vertical velocity. |
| Launch/_Sim_/State/QMaxPa | Float8 | Pa | 0 |  |  | Peak dynamic pressure seen this flight. |
| Launch/_Sim_/State/GustBoost | Float8 | m/s | 0 |  |  | Decaying gust spike on top of the mean wind. |
| Launch/_Sim_/State/OkStreak | Int4 | ticks | 0 |  |  | Consecutive error-free ticks. |
<!-- tag-table:end -->
