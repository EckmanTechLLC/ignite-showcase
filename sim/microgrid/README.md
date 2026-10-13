# sim/microgrid - Campus Microgrid simulation

Gateway-side simulation for demo 3 (ADR-005 Amendment A1): a campus single-line system with four PV arrays
(4 x 6 strings, 2 inverters each), two BESS containers, a genset, ten EV chargers, three buildings and the utility
intertie, on a compressed clock (24 simulated hours in 12 real minutes). It runs inside the Ignition gateway and is
steered through project-library functions called with `POST /script/library`. Loading and installing follow
`sim/README.md` (same scripts as `sim/launch`); the tags live under `[default]MG/`, which needs a site whose
`TagPathPatterns` allow `[default]MG/**` (the `microgrid` site).

```
sim/microgrid/
  tags.json                         405 tags under [default]MG/, system.tag.configure format
  project/
    timer/mg_sim/                   1000 ms timer: the whole model (one readBlocking, one writeBlocking)
    script-python/mg/code.py        library module "mg": the scenario/dispatch API
```

    export IGNITE_URL=http://<gateway>:8088/data/ignite IGNITE_SITE=microgrid IGNITE_USER=<operator> IGNITE_PASS=<secret>
    node sim/scripts/load-tags.mjs sim/microgrid/tags.json
    sim/scripts/install-project.sh <ssh-host> <data>/projects/<project>/ignition microgrid    # copies, restarts, waits

## Library API (`mg.<fn>`, operator tier)

Each returns `{ok, message, state}` (state is read before the timer reacts); `status()` returns the state dict only.

| Function | Effect |
|---|---|
| `status()` | mode, scenario/step, time, KPIs, grid, loads, BESS, genset, PV curtailment and inverter states, faults, tick count, last error |
| `set_scenario(name)` | `normal`, `grid_outage`, `cloud_front_ev_rush`, `peak_shave_day`, `inverter_fault` |
| `restore()` | clear every fault, release curtailment and the cloud override, smart charging on, BESS modes back to default (B1 `PEAK_SHAVE`, B2 `SELF_CONSUME`), scenario `normal` |
| `grid_outage()` / `grid_restore()` | drop / return the utility intertie |
| `set_mode(bess, mode)` | `bess` 1, 2, `"B1"`, `"B2"`; mode `PEAK_SHAVE`, `SELF_CONSUME`, `BACKUP`, `IDLE` (refused while islanded) |
| `set_cloudiness(x)` | hold cloud cover at 0-1; negative or `null` releases it |
| `set_hour(h)` | jump the clock to `h` in [0, 24); today's totals (kWh, costs, peaks, CO2) restart |
| `set_speed(f)` | 1 - 600 (default 120 = 24 h in 12 min) |
| `inverter_fault(array, inv, on)` | array 1-4, inverter `"A"`/`"B"`; `on` true faults it (and starts `inverter_fault` if the scenario is `normal`), false clears it |
| `curtail_pv(array, kw)` | AC limit for the array, 0-150 kW; `null` or 150 releases it |
| `ev_smart(on)` | smart curtailment accepted (true) or ignored (false) by all ten chargers |
| `charger_fault(n, on)` | extra: charger 1-10 into / out of `FAULT` |

Commands write `_Sim_/*` tags (plus `BESS/Bn/Mode`, `PV/An/CurtailSetpointkW` and `EV/Cnn/Smart`, which the operator
owns); the timer reacts on its next tick. `set_hour` goes through the request tag `_Sim_/SetHour` because the timer
rewrites `Time/HourOfDay` every second.

## Model (what the timer computes each tick)

State lives only in tags (`_Sim_/State/*` plus the process tags), so a gateway restart is harmless.
`ds = SpeedFactor x real seconds since the previous tick` (`_Sim_/State/LastEpochMs`) drives the slow processes
(clock, energy, SOC, temperatures, EV sessions, costs, 15-minute demand average). Cloud motion and the array
irradiance lag use real seconds. **Electrical transients are dramatised**: island and resync timers, the genset
start and the frequency/voltage recovery run on an electrical clock `real x clamp(SpeedFactor / 120, 0.25, 4)`, so at
the default 120x a 10 s genset start takes 10 real seconds (at a true 120x it would be 0.08 s, below one tick).

* **Clock and sun.** `Time/HourOfDay` advances `ds`; `DayIndex` counts days (day 0 is a Monday; days 5-6 of each week
  are the weekend), the day of year starts at 172 (`Season` SUMMER). Sun elevation from hour, declination and 37 N;
  clear-sky irradiance by the Haurwitz model (about 1000 W/m2 at noon, sunrise 04:45, sunset 19:15).
* **Clouds.** `Cloudiness` = mean-reverting random walk (`State/CloudBase`, about 0.22) plus the scheduled front in
  `cloud_front_ev_rush`, or the `_Sim_/Cloudiness` override; irradiance = clear sky x (1 - 0.8 cloud^1.2). Each array
  sees its own cloud term (random, lagged 1.5 s), so a front does not hit all four at once. Ambient = seasonal mean +
  diurnal swing + heat wave - cloud cooling.
* **PV.** String DC = irradiance x 30 kWp x (1 - 0.4 %/K x (module - 25)) x a fixed per-string soiling factor
  (0.94-1.00). Module temperature = ambient + 0.031 K per W/m2 (lag 240 s). An inverter takes three strings (S1-S3 on
  A, S4-S6 on B), converts at an efficiency that falls at light load, **clips at 75 kW**, derates 4 % per K above
  60 C heatsink temperature, and honours the array's `CurtailSetpointkW` (split over its healthy inverters). Night
  (array irradiance below 8 W/m2): `OFF`. A faulted inverter (`_Sim_/Fault/Inv/A<n><A|B>`) is `FAULT`, its strings
  float at open-circuit voltage with zero current. String voltage rises toward Voc when the string is clipped or
  curtailed. String `Health` = output relative to the array's mean string output, corrected for the better
  inverter's clip/curtail factor (curtailment alone never lowers it), lagged 3 electrical seconds.
* **BESS.** 2 x 500 kWh / 250 kW, 95 % each way (about 90 % round trip), cell temperature from ambient and
  |kW| (lag 15 min), charge/discharge limits derate from 40 C to zero at 50 C, trip to `FAULT` above 55 C (back
  below 45 C), charge taper above 90 % SOC, SOC floor 5 % (20 % reserve for the non-island modes, 100 % in `BACKUP`).
  Dispatch (power lags its setpoint with a 1.2 s time constant):
  * `PEAK_SHAVE` - absorbs PV surplus; in `OFFPEAK` charges from the grid (at most 100 kW per unit, never pushing
    import above 90 % of `Grid/DemandLimitkW`) up to `_Sim_/State/TargetSOCPct`, which is computed each tick from the
    **day-ahead functions** (the same ones that write `Forecast/*`): the energy the forecast load less forecast PV
    exceeds 65 % of the limit by over the five peak hours; discharges to hold import under 90 % of the limit
    and, in the `PEAK` band, spreads its usable energy over the remaining hours of the band.
  * `SELF_CONSUME` - covers net load, stores PV surplus (first claim on the surplus), never charges from the grid.
  * `BACKUP` - charges to 100 % (80 kW per unit) and holds; only discharges when islanded.
  * `IDLE` - 0 kW. `ISLAND` is set by the sim when the grid is lost and the previous mode restored on resync.
* **Grid.** Import/export balance with the lagged BESS power; export is limited to `Grid/ExportLimitkW` (300 kW),
  PV curtails above it. Bus voltage/frequency = nominal + load-dependent deviation + jitter. The 15-minute rolling
  demand (`DemandkW`) drives the demand alarm; the demand charge is 0.50 USD per kW of the peak 15-minute average
  inside the weekday 16-21 h window.
* **Island (`grid_outage`).** Grid lost -> `Available` false and `Islanded` true in the same tick; non-critical
  buildings (1 and 3) and the chargers are shed (chargers go `CURTAILED` at 0 kW), BESS become grid-forming
  (`ISLAND`). The frequency/voltage kick is -1.6 Hz / -38 V and recovers with 3.5 s / 4 s time constants, so
  `FrequencyLow`/`VoltageLow` alarm for a few ticks. After 3 electrical seconds the genset starts (`STARTING`,
  `StartCountdownS` 10 -> 0, then `RUNNING` with a further -0.5 Hz sync dip). PV supplies the load first and curtails
  so that load + at most 30 % of BESS charge capability = supply; a running genset has a 30 % (120 kW) minimum load
  and covers the rest, the BESS balances. On `grid_restore` the campus stays islanded for a 6 s resync delay, then
  `Islanded` clears, BESS modes return, the genset runs `COOLDOWN` for 20 s and stops.
* **EV.** Poisson arrivals with a weekday pattern (peaks 07-09 and 17-19, plus a midday bump; weekends flat),
  random car (30-80 kWh, 10-55 % SOC, target 80-100 %), charger rate 22 kW tapering above 80 % SOC. `Smart` chargers
  drop to 40 % while the demand window is open and `DemandkW` > 90 % of the limit (or import > 85 %).
  `State`: `CHARGING`, `CURTAILED` (smart limit or shed), `FAULT` (`_Sim_/Fault/Charger`), `IDLE`.
* **Loads.** Building 1 office (35-140 kW), 2 lab (critical, 85-125 kW), 3 residence/retail (morning and evening
  peaks); weekday/weekend profiles, +/-2 % noise, plus HVAC = 3.5-5 kW per K above 17 C (heating below 12 C) weighted by
  occupancy. `Loads/TotalkW` = served campus load (buildings + EV); `BuildingsTotalkW` is the buildings alone.
* **Tariff and costs.** Weekdays OFFPEAK 22-07 (0.09 USD/kWh), SHOULDER 07-16 and 21-22 (0.16), PEAK 16-21 (0.34);
  weekends OFFPEAK 22-08, otherwise SHOULDER (0.14). Export credit 0.06 USD/kWh. Grid CO2 intensity 290-530 g/kWh
  (lowest at midday, highest in the evening ramp). The **baseline** is computed in the same tick: the whole
  (unshed) load imported, no PV, no BESS, same tariff. `TodaySavingsUSD` = `BaselineCostUSD` - `TodayCostUSD`;
  `TodayCO2AvoidedKg` accumulates (baseline import - (import - export)) x intensity. Both baseline and actual
  accounts pause while islanded (the baseline has no grid then); genset fuel is not billed. Counters reset at
  midnight.
* **Forecast.** `Forecast/PVkW`, `LoadkW` and `PricePerkWh` are the day-ahead values for the *present hour*, written
  each tick from the clear-sky, building-profile and tariff functions with a climatological cloudiness of 0.15 and
  no noise, no scenario heat wave and the expected (not actual) EV demand. Forecast vs actual is therefore a plain
  two-series history chart; real clouds make PV lag the forecast.
* **KPIs.** `NetLoadkW` = load - PV; `PVFractionPct` = min(PV, load) / load; `SelfSufficiencyPct` = 1 - import / load;
  `ActiveAlarms` from `system.alarm.queryStatus` under `MG`. `Mode`: `GENSET` (genset starting/running) > `ISLAND` >
  `CURTAILING` (any array curtailed) > `STRESS` (grid stress or smart curtailment active) > `NORMAL`.

### Scenarios and `ScenarioStep`

* `grid_outage` (until `grid_restore()` / `restore()`): 1 island, BESS carrying; 2 genset `STARTING`; 3 genset
  `RUNNING`, PV curtailed; 4 grid back, resynchronising; 5 resynchronised (the scenario then returns to `normal`).
* `cloud_front_ev_rush`: moves to a weekday and jumps the clock to 16:00; a front ramps cloud cover to 0.95 between
  16:42 and 17:24, holds to 19:00 and clears by 19:48, while EV arrivals double from 16:30 to 19:30. Step 1 before
  17:00, 2 front overhead during the rush, 3 clearing; the scenario ends at 20:00.
* `peak_shave_day`: weekday, clock jumps to 05:00, +7 C heat wave the forecast does not know about, both BESS in
  `PEAK_SHAVE`. Step 1 before 16:00, 2 demand window, 3 after 21:00; ends at the next midnight (BESS modes back to
  the defaults, heat wave off). Compare `PeakImportkW` with `BaselinePeakkW` and the two costs.
* `inverter_fault`: faults A2B if no inverter is faulted yet. Step 1 faulted, 2 once a string is below 75 %
  health; when the last fault is cleared the step is 3 and the scenario returns to `normal`. Cascade: `InverterFault`
  (High) at once, the three strings of the inverter go to health 0 and `Underperforming` (Medium) a few ticks later,
  then the array `HealthLow` (Medium, array health 50 %); all clear after the fault is cleared.

## Tags

Units are on every numeric tag. Constants the model reads (`Critical`, `MaxkW`, `DemandLimitkW`, `ExportLimitkW`) can
be edited. `_Sim_/Fault/*` are the fault switches (the library covers them; `Fault/BESS/B1|B2` takes a container
`OFF` and is tag-only). Extra tags beyond the task's list: array `IrradianceWm2`, `ModuleTempC`, `TodaykWh`,
`RatedkWp`, `RatedACkW`; inverter `DCkW`, `LoadPct`, `RatedkW`; BESS `SOHPct`, `CapacitykWh`, `RatedkW`;
`Grid/DemandkW`, `DemandLimitkW`, `ExportLimitkW`; `Genset/RatedkW`, `CoolantTempC`; EV `CarCapacitykWh`,
`TargetSOCPct`, `MaxkW`, `CurtailedkW`; `Loads/Bldg*/Shed`, `BuildingsTotalkW`; `Time/IsWeekend`;
`_Sim_/SetHour` and 20 `_Sim_/State/*`.

`_Sim_/LastTickMs` is the **duration in milliseconds** of the last tick's read + compute (the write follows it and
is logged separately every 60 ticks: `mg_sim tick N: read+compute X ms, write Y ms (Z tags)`).
Measured on the lab gateway (about 590 keys read, 70-220 changed tags written per tick): read+compute 7-37 ms
(`LastTickMs` max 21 over 31 minutes), write 1-20 ms.

The noise generator is a small xorshift class inside the timer: a fresh `random.Random` per tick seeded with
consecutive integers produced correlated first draws on the gateway's Jython (bursts of simultaneous EV arrivals).

### History and the historian load

Provider `IgniteHistorian`. KPIs, grid, array/inverter AC and DC power, BESS, genset, EV totals, building loads
and the forecast tags are stored on change at a 1 s minimum with deadbands (69 tags); strings (`DCkW`, `Voltage`,
`Current`, `Health`), array health/module temperature/irradiance, inverter heatsink temperature, charger kW and
the genset coolant temperature at a 10 s minimum with a deadband (127 tags). At 120x nearly every 1 s tag changes
each tick, so expect about 70 points per second plus 13 per second for the 10 s tags.
The string-level history is for the click-for-detail view; the 24-hour (12 real minute) trends read the 1 s tags
with `returnSize` 144 (5 s buckets).

### Alarms

60 alarm definitions: inverter `State` = `FAULT` (High); string `Health` below 75 (Medium) and array `Health` below 70
(Medium) for the underperformance cascade; BESS `CellTempC` above 42 (High), `State` = `FAULT` (Critical) and `SOCPct`
below 20 while `Mode` is `BACKUP` or `ISLAND` (expression, High); `Grid/Available` false (High), `Islanded` true
(Medium), `VoltageV` outside 456-504 (Medium), `FrequencyHz` outside 59.5-60.5 (Medium), `DemandkW` above 500
(High); genset `FuelPct` below 20 (Medium); charger `State` = `FAULT` (High). The tag load itself produces one
zero-length "Cleared, Acknowledged" event per alarm; filter `/alarms/status` by `activeTime` when counting real events.

## Tag model

Generated from `tags.json` by `node sim/scripts/tag-table.mjs sim/microgrid/tags.json --write sim/microgrid/README.md`.

<!-- tag-table:start -->
405 tags, 196 with history, 60 alarms.

| Tag | Type | Unit | Initial | Alarms | History | Description |
|---|---|---|---|---|---|---|
| MG/Time/HourOfDay | Float8 | h | 6 |  |  | Simulated clock hour of day, 0-24 (advances SpeedFactor x real time; 120 = 24 h in 12 min). |
| MG/Time/DayIndex | Int4 | day | 0 |  |  | Simulated days since the sim started; day 0 is a Monday (days 5 and 6 of each week are the weekend). |
| MG/Time/Season | String |  | SUMMER |  |  | WINTER\|SPRING\|SUMMER\|AUTUMN from the day of year. |
| MG/Time/IsWeekend | Boolean |  | false |  |  | Weekend day: no PEAK tariff band, lower building loads and EV traffic. |
| MG/Time/SunElevationDeg | Float8 | ° | 0 |  | OnChange, deadband 0.1 | Sun elevation above the horizon (latitude 37 N, from hour and day of year). |
| MG/Time/ClearSkyIrradianceWm2 | Float8 | W/m² | 0 |  | OnChange, deadband 1 | Clear-sky global irradiance (Haurwitz model). |
| MG/Time/IrradianceWm2 | Float8 | W/m² | 0 |  | OnChange, deadband 1 | Site irradiance after cloud attenuation (pyranometer). |
| MG/Time/Cloudiness | Float8 | fraction | 0.2 |  | OnChange, deadband 0.01 | Effective cloud cover 0-1: random walk plus scheduled fronts, or the _Sim_/Cloudiness override. |
| MG/Time/AmbientTempC | Float8 | °C | 18 |  | OnChange, deadband 0.1 | Ambient temperature: seasonal mean, diurnal swing, cloud cooling. |
| MG/Time/TariffBand | String |  | OFFPEAK |  |  | OFFPEAK\|SHOULDER\|PEAK. Weekdays: OFFPEAK 22-07, SHOULDER 07-16 and 21-22, PEAK 16-21. Weekends: OFFPEAK 22-08, else SHOULDER. |
| MG/Time/TariffRate | Float8 | $/kWh | 0.09 |  | OnChange, deadband 0.001 | Energy price for the present band. |
| MG/Time/DemandWindow | Boolean |  | false |  |  | Weekday 16:00-21:00: the window in which grid stress management (smart EV curtailment, peak shaving) is active. |
| MG/Time/GridCO2gPerKWh | Float8 | g/kWh | 420 |  | OnChange, deadband 1 | Grid carbon intensity: lower at midday (solar on the grid), highest in the evening ramp. |
| MG/PV/A1/ACkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Array AC output (sum of its two inverters). |
| MG/PV/A1/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Array DC power delivered to the inverters. |
| MG/PV/A1/Health | Float8 | % | 100 | HealthLow: BelowValue 70, Medium ("PV array A1 health below 70 %") | OnChange, deadband 0.5 | Array health: mean string health (50 with one of the two inverters down). |
| MG/PV/A1/Curtailed | Boolean |  | false |  |  | True while any inverter of the array is held below what the sun allows (setpoint, export limit or island balancing). |
| MG/PV/A1/CurtailSetpointkW | Float8 | kW | 150 |  |  | Operator AC limit for the array (150 = no limit). |
| MG/PV/A1/ModuleTempC | Float8 | °C | 20 |  | OnChange, deadband 0.3 | Module temperature (ambient + 0.031 K per W/m²), lagged. |
| MG/PV/A1/IrradianceWm2 | Float8 | W/m² | 0 |  | OnChange, deadband 2 | Irradiance on the array: clear sky less the local cloud term (clouds cross the arrays at different times). |
| MG/PV/A1/TodaykWh | Float8 | kWh | 0 |  |  | AC energy produced today. |
| MG/PV/A1/RatedkWp | Float8 | kWp | 180 |  |  | DC nameplate (6 strings x 30 kWp). Constant. |
| MG/PV/A1/RatedACkW | Float8 | kW | 150 |  |  | AC rating (2 inverters x 75 kW). Constant. |
| MG/PV/A1/Inverter/A/State | String |  | OFF | InverterFault: OnCondition {[.]State} = "FAULT", High ("PV inverter A1A fault") |  | RUN\|CURTAILED\|FAULT\|OFF (OFF = night standby). |
| MG/PV/A1/Inverter/A/ACkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Inverter AC output (clipped at 75 kW, temperature derated). |
| MG/PV/A1/Inverter/A/DCkW | Float8 | kW | 0 |  |  | Inverter DC input. |
| MG/PV/A1/Inverter/A/TempC | Float8 | °C | 25 |  | OnChange, deadband 0.5 | Heatsink temperature; the inverter derates above 60 °C. |
| MG/PV/A1/Inverter/A/Efficiency | Float8 | % | 0 |  |  | Conversion efficiency at the present load (0 when not converting). |
| MG/PV/A1/Inverter/A/LoadPct | Float8 | % | 0 |  |  | AC output as percent of the 75 kW rating. |
| MG/PV/A1/Inverter/A/RatedkW | Float8 | kW | 75 |  |  | AC rating. Constant. |
| MG/PV/A1/Inverter/B/State | String |  | OFF | InverterFault: OnCondition {[.]State} = "FAULT", High ("PV inverter A1B fault") |  | RUN\|CURTAILED\|FAULT\|OFF (OFF = night standby). |
| MG/PV/A1/Inverter/B/ACkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Inverter AC output (clipped at 75 kW, temperature derated). |
| MG/PV/A1/Inverter/B/DCkW | Float8 | kW | 0 |  |  | Inverter DC input. |
| MG/PV/A1/Inverter/B/TempC | Float8 | °C | 25 |  | OnChange, deadband 0.5 | Heatsink temperature; the inverter derates above 60 °C. |
| MG/PV/A1/Inverter/B/Efficiency | Float8 | % | 0 |  |  | Conversion efficiency at the present load (0 when not converting). |
| MG/PV/A1/Inverter/B/LoadPct | Float8 | % | 0 |  |  | AC output as percent of the 75 kW rating. |
| MG/PV/A1/Inverter/B/RatedkW | Float8 | kW | 75 |  |  | AC rating. Constant. |
| MG/PV/A1/String/S1/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter A). |
| MG/PV/A1/String/S1/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A1/String/S1/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A1/String/S1/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A1S1 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A1/String/S2/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter A). |
| MG/PV/A1/String/S2/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A1/String/S2/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A1/String/S2/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A1S2 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A1/String/S3/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter A). |
| MG/PV/A1/String/S3/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A1/String/S3/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A1/String/S3/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A1S3 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A1/String/S4/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter B). |
| MG/PV/A1/String/S4/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A1/String/S4/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A1/String/S4/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A1S4 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A1/String/S5/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter B). |
| MG/PV/A1/String/S5/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A1/String/S5/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A1/String/S5/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A1S5 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A1/String/S6/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter B). |
| MG/PV/A1/String/S6/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A1/String/S6/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A1/String/S6/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A1S6 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A2/ACkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Array AC output (sum of its two inverters). |
| MG/PV/A2/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Array DC power delivered to the inverters. |
| MG/PV/A2/Health | Float8 | % | 100 | HealthLow: BelowValue 70, Medium ("PV array A2 health below 70 %") | OnChange, deadband 0.5 | Array health: mean string health (50 with one of the two inverters down). |
| MG/PV/A2/Curtailed | Boolean |  | false |  |  | True while any inverter of the array is held below what the sun allows (setpoint, export limit or island balancing). |
| MG/PV/A2/CurtailSetpointkW | Float8 | kW | 150 |  |  | Operator AC limit for the array (150 = no limit). |
| MG/PV/A2/ModuleTempC | Float8 | °C | 20 |  | OnChange, deadband 0.3 | Module temperature (ambient + 0.031 K per W/m²), lagged. |
| MG/PV/A2/IrradianceWm2 | Float8 | W/m² | 0 |  | OnChange, deadband 2 | Irradiance on the array: clear sky less the local cloud term (clouds cross the arrays at different times). |
| MG/PV/A2/TodaykWh | Float8 | kWh | 0 |  |  | AC energy produced today. |
| MG/PV/A2/RatedkWp | Float8 | kWp | 180 |  |  | DC nameplate (6 strings x 30 kWp). Constant. |
| MG/PV/A2/RatedACkW | Float8 | kW | 150 |  |  | AC rating (2 inverters x 75 kW). Constant. |
| MG/PV/A2/Inverter/A/State | String |  | OFF | InverterFault: OnCondition {[.]State} = "FAULT", High ("PV inverter A2A fault") |  | RUN\|CURTAILED\|FAULT\|OFF (OFF = night standby). |
| MG/PV/A2/Inverter/A/ACkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Inverter AC output (clipped at 75 kW, temperature derated). |
| MG/PV/A2/Inverter/A/DCkW | Float8 | kW | 0 |  |  | Inverter DC input. |
| MG/PV/A2/Inverter/A/TempC | Float8 | °C | 25 |  | OnChange, deadband 0.5 | Heatsink temperature; the inverter derates above 60 °C. |
| MG/PV/A2/Inverter/A/Efficiency | Float8 | % | 0 |  |  | Conversion efficiency at the present load (0 when not converting). |
| MG/PV/A2/Inverter/A/LoadPct | Float8 | % | 0 |  |  | AC output as percent of the 75 kW rating. |
| MG/PV/A2/Inverter/A/RatedkW | Float8 | kW | 75 |  |  | AC rating. Constant. |
| MG/PV/A2/Inverter/B/State | String |  | OFF | InverterFault: OnCondition {[.]State} = "FAULT", High ("PV inverter A2B fault") |  | RUN\|CURTAILED\|FAULT\|OFF (OFF = night standby). |
| MG/PV/A2/Inverter/B/ACkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Inverter AC output (clipped at 75 kW, temperature derated). |
| MG/PV/A2/Inverter/B/DCkW | Float8 | kW | 0 |  |  | Inverter DC input. |
| MG/PV/A2/Inverter/B/TempC | Float8 | °C | 25 |  | OnChange, deadband 0.5 | Heatsink temperature; the inverter derates above 60 °C. |
| MG/PV/A2/Inverter/B/Efficiency | Float8 | % | 0 |  |  | Conversion efficiency at the present load (0 when not converting). |
| MG/PV/A2/Inverter/B/LoadPct | Float8 | % | 0 |  |  | AC output as percent of the 75 kW rating. |
| MG/PV/A2/Inverter/B/RatedkW | Float8 | kW | 75 |  |  | AC rating. Constant. |
| MG/PV/A2/String/S1/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter A). |
| MG/PV/A2/String/S1/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A2/String/S1/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A2/String/S1/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A2S1 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A2/String/S2/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter A). |
| MG/PV/A2/String/S2/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A2/String/S2/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A2/String/S2/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A2S2 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A2/String/S3/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter A). |
| MG/PV/A2/String/S3/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A2/String/S3/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A2/String/S3/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A2S3 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A2/String/S4/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter B). |
| MG/PV/A2/String/S4/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A2/String/S4/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A2/String/S4/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A2S4 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A2/String/S5/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter B). |
| MG/PV/A2/String/S5/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A2/String/S5/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A2/String/S5/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A2S5 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A2/String/S6/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter B). |
| MG/PV/A2/String/S6/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A2/String/S6/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A2/String/S6/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A2S6 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A3/ACkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Array AC output (sum of its two inverters). |
| MG/PV/A3/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Array DC power delivered to the inverters. |
| MG/PV/A3/Health | Float8 | % | 100 | HealthLow: BelowValue 70, Medium ("PV array A3 health below 70 %") | OnChange, deadband 0.5 | Array health: mean string health (50 with one of the two inverters down). |
| MG/PV/A3/Curtailed | Boolean |  | false |  |  | True while any inverter of the array is held below what the sun allows (setpoint, export limit or island balancing). |
| MG/PV/A3/CurtailSetpointkW | Float8 | kW | 150 |  |  | Operator AC limit for the array (150 = no limit). |
| MG/PV/A3/ModuleTempC | Float8 | °C | 20 |  | OnChange, deadband 0.3 | Module temperature (ambient + 0.031 K per W/m²), lagged. |
| MG/PV/A3/IrradianceWm2 | Float8 | W/m² | 0 |  | OnChange, deadband 2 | Irradiance on the array: clear sky less the local cloud term (clouds cross the arrays at different times). |
| MG/PV/A3/TodaykWh | Float8 | kWh | 0 |  |  | AC energy produced today. |
| MG/PV/A3/RatedkWp | Float8 | kWp | 180 |  |  | DC nameplate (6 strings x 30 kWp). Constant. |
| MG/PV/A3/RatedACkW | Float8 | kW | 150 |  |  | AC rating (2 inverters x 75 kW). Constant. |
| MG/PV/A3/Inverter/A/State | String |  | OFF | InverterFault: OnCondition {[.]State} = "FAULT", High ("PV inverter A3A fault") |  | RUN\|CURTAILED\|FAULT\|OFF (OFF = night standby). |
| MG/PV/A3/Inverter/A/ACkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Inverter AC output (clipped at 75 kW, temperature derated). |
| MG/PV/A3/Inverter/A/DCkW | Float8 | kW | 0 |  |  | Inverter DC input. |
| MG/PV/A3/Inverter/A/TempC | Float8 | °C | 25 |  | OnChange, deadband 0.5 | Heatsink temperature; the inverter derates above 60 °C. |
| MG/PV/A3/Inverter/A/Efficiency | Float8 | % | 0 |  |  | Conversion efficiency at the present load (0 when not converting). |
| MG/PV/A3/Inverter/A/LoadPct | Float8 | % | 0 |  |  | AC output as percent of the 75 kW rating. |
| MG/PV/A3/Inverter/A/RatedkW | Float8 | kW | 75 |  |  | AC rating. Constant. |
| MG/PV/A3/Inverter/B/State | String |  | OFF | InverterFault: OnCondition {[.]State} = "FAULT", High ("PV inverter A3B fault") |  | RUN\|CURTAILED\|FAULT\|OFF (OFF = night standby). |
| MG/PV/A3/Inverter/B/ACkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Inverter AC output (clipped at 75 kW, temperature derated). |
| MG/PV/A3/Inverter/B/DCkW | Float8 | kW | 0 |  |  | Inverter DC input. |
| MG/PV/A3/Inverter/B/TempC | Float8 | °C | 25 |  | OnChange, deadband 0.5 | Heatsink temperature; the inverter derates above 60 °C. |
| MG/PV/A3/Inverter/B/Efficiency | Float8 | % | 0 |  |  | Conversion efficiency at the present load (0 when not converting). |
| MG/PV/A3/Inverter/B/LoadPct | Float8 | % | 0 |  |  | AC output as percent of the 75 kW rating. |
| MG/PV/A3/Inverter/B/RatedkW | Float8 | kW | 75 |  |  | AC rating. Constant. |
| MG/PV/A3/String/S1/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter A). |
| MG/PV/A3/String/S1/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A3/String/S1/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A3/String/S1/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A3S1 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A3/String/S2/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter A). |
| MG/PV/A3/String/S2/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A3/String/S2/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A3/String/S2/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A3S2 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A3/String/S3/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter A). |
| MG/PV/A3/String/S3/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A3/String/S3/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A3/String/S3/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A3S3 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A3/String/S4/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter B). |
| MG/PV/A3/String/S4/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A3/String/S4/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A3/String/S4/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A3S4 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A3/String/S5/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter B). |
| MG/PV/A3/String/S5/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A3/String/S5/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A3/String/S5/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A3S5 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A3/String/S6/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter B). |
| MG/PV/A3/String/S6/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A3/String/S6/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A3/String/S6/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A3S6 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A4/ACkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Array AC output (sum of its two inverters). |
| MG/PV/A4/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Array DC power delivered to the inverters. |
| MG/PV/A4/Health | Float8 | % | 100 | HealthLow: BelowValue 70, Medium ("PV array A4 health below 70 %") | OnChange, deadband 0.5 | Array health: mean string health (50 with one of the two inverters down). |
| MG/PV/A4/Curtailed | Boolean |  | false |  |  | True while any inverter of the array is held below what the sun allows (setpoint, export limit or island balancing). |
| MG/PV/A4/CurtailSetpointkW | Float8 | kW | 150 |  |  | Operator AC limit for the array (150 = no limit). |
| MG/PV/A4/ModuleTempC | Float8 | °C | 20 |  | OnChange, deadband 0.3 | Module temperature (ambient + 0.031 K per W/m²), lagged. |
| MG/PV/A4/IrradianceWm2 | Float8 | W/m² | 0 |  | OnChange, deadband 2 | Irradiance on the array: clear sky less the local cloud term (clouds cross the arrays at different times). |
| MG/PV/A4/TodaykWh | Float8 | kWh | 0 |  |  | AC energy produced today. |
| MG/PV/A4/RatedkWp | Float8 | kWp | 180 |  |  | DC nameplate (6 strings x 30 kWp). Constant. |
| MG/PV/A4/RatedACkW | Float8 | kW | 150 |  |  | AC rating (2 inverters x 75 kW). Constant. |
| MG/PV/A4/Inverter/A/State | String |  | OFF | InverterFault: OnCondition {[.]State} = "FAULT", High ("PV inverter A4A fault") |  | RUN\|CURTAILED\|FAULT\|OFF (OFF = night standby). |
| MG/PV/A4/Inverter/A/ACkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Inverter AC output (clipped at 75 kW, temperature derated). |
| MG/PV/A4/Inverter/A/DCkW | Float8 | kW | 0 |  |  | Inverter DC input. |
| MG/PV/A4/Inverter/A/TempC | Float8 | °C | 25 |  | OnChange, deadband 0.5 | Heatsink temperature; the inverter derates above 60 °C. |
| MG/PV/A4/Inverter/A/Efficiency | Float8 | % | 0 |  |  | Conversion efficiency at the present load (0 when not converting). |
| MG/PV/A4/Inverter/A/LoadPct | Float8 | % | 0 |  |  | AC output as percent of the 75 kW rating. |
| MG/PV/A4/Inverter/A/RatedkW | Float8 | kW | 75 |  |  | AC rating. Constant. |
| MG/PV/A4/Inverter/B/State | String |  | OFF | InverterFault: OnCondition {[.]State} = "FAULT", High ("PV inverter A4B fault") |  | RUN\|CURTAILED\|FAULT\|OFF (OFF = night standby). |
| MG/PV/A4/Inverter/B/ACkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | Inverter AC output (clipped at 75 kW, temperature derated). |
| MG/PV/A4/Inverter/B/DCkW | Float8 | kW | 0 |  |  | Inverter DC input. |
| MG/PV/A4/Inverter/B/TempC | Float8 | °C | 25 |  | OnChange, deadband 0.5 | Heatsink temperature; the inverter derates above 60 °C. |
| MG/PV/A4/Inverter/B/Efficiency | Float8 | % | 0 |  |  | Conversion efficiency at the present load (0 when not converting). |
| MG/PV/A4/Inverter/B/LoadPct | Float8 | % | 0 |  |  | AC output as percent of the 75 kW rating. |
| MG/PV/A4/Inverter/B/RatedkW | Float8 | kW | 75 |  |  | AC rating. Constant. |
| MG/PV/A4/String/S1/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter A). |
| MG/PV/A4/String/S1/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A4/String/S1/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A4/String/S1/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A4S1 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A4/String/S2/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter A). |
| MG/PV/A4/String/S2/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A4/String/S2/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A4/String/S2/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A4S2 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A4/String/S3/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter A). |
| MG/PV/A4/String/S3/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A4/String/S3/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A4/String/S3/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A4S3 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A4/String/S4/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter B). |
| MG/PV/A4/String/S4/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A4/String/S4/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A4/String/S4/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A4S4 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A4/String/S5/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter B). |
| MG/PV/A4/String/S5/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A4/String/S5/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A4/String/S5/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A4S5 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/PV/A4/String/S6/DCkW | Float8 | kW | 0 |  | OnChange, deadband 0.2 | String DC power (inverter B). |
| MG/PV/A4/String/S6/Voltage | Float8 | V | 0 |  | OnChange, deadband 5 | String voltage: MPP voltage, rising toward open circuit when clipped, curtailed or the inverter is down. |
| MG/PV/A4/String/S6/Current | Float8 | A | 0 |  | OnChange, deadband 0.5 | String current. |
| MG/PV/A4/String/S6/Health | Float8 | % | 100 | Underperforming: BelowValue 75, Medium ("PV string A4S6 underperforming vs siblings") | OnChange, deadband 1 | Output relative to the array's other strings, corrected for inverter state (curtailment does not lower it). |
| MG/BESS/B1/SOCPct | Float8 | % | 60 | SOCLowBackup: OnCondition {[.]SOCPct} < 20 && ({[.]Mode} = "BACKUP" \|\| {[.]Mode} = "ISLAND"), High ("BESS B1 SOC below 20 % while holding backup") | OnChange, deadband 0.05 | State of charge. |
| MG/BESS/B1/kW | Float8 | kW | 0 |  | OnChange, deadband 0.3 | Power: positive = discharging, negative = charging. |
| MG/BESS/B1/kWhAvailable | Float8 | kWh | 275 |  | OnChange, deadband 1 | Energy above the 5 % floor. |
| MG/BESS/B1/CellTempC | Float8 | °C | 27 | CellTempHigh: AboveValue 42, High ("BESS B1 cell temperature above 42 C") | OnChange, deadband 0.1 | Mean cell temperature. |
| MG/BESS/B1/Mode | String |  | PEAK_SHAVE |  |  | PEAK_SHAVE\|SELF_CONSUME\|BACKUP\|IDLE\|ISLAND (ISLAND is set by the sim while islanded and restored on resync). |
| MG/BESS/B1/State | String |  | ONLINE | BESSFault: OnCondition {[.]State} = "FAULT", Critical ("BESS B1 fault") |  | ONLINE\|FAULT\|OFF. FAULT above 55 C cell temperature (until it cools below 45); OFF via _Sim_/Fault/BESS. |
| MG/BESS/B1/ThroughputMWh | Float8 | MWh | 12 |  |  | Cumulative energy through the battery (degradation hint). |
| MG/BESS/B1/MaxChargekW | Float8 | kW | 250 |  |  | Present charge limit (temperature derate, taper above 90 % SOC). |
| MG/BESS/B1/MaxDischargekW | Float8 | kW | 250 |  |  | Present discharge limit (temperature derate, reserve floor). |
| MG/BESS/B1/SOHPct | Float8 | % | 97 |  |  | State of health: capacity fade with throughput. |
| MG/BESS/B1/CapacitykWh | Float8 | kWh | 500 |  |  | Nameplate energy. Constant. |
| MG/BESS/B1/RatedkW | Float8 | kW | 250 |  |  | Nameplate power. Constant. |
| MG/BESS/B2/SOCPct | Float8 | % | 55 | SOCLowBackup: OnCondition {[.]SOCPct} < 20 && ({[.]Mode} = "BACKUP" \|\| {[.]Mode} = "ISLAND"), High ("BESS B2 SOC below 20 % while holding backup") | OnChange, deadband 0.05 | State of charge. |
| MG/BESS/B2/kW | Float8 | kW | 0 |  | OnChange, deadband 0.3 | Power: positive = discharging, negative = charging. |
| MG/BESS/B2/kWhAvailable | Float8 | kWh | 275 |  | OnChange, deadband 1 | Energy above the 5 % floor. |
| MG/BESS/B2/CellTempC | Float8 | °C | 27 | CellTempHigh: AboveValue 42, High ("BESS B2 cell temperature above 42 C") | OnChange, deadband 0.1 | Mean cell temperature. |
| MG/BESS/B2/Mode | String |  | SELF_CONSUME |  |  | PEAK_SHAVE\|SELF_CONSUME\|BACKUP\|IDLE\|ISLAND (ISLAND is set by the sim while islanded and restored on resync). |
| MG/BESS/B2/State | String |  | ONLINE | BESSFault: OnCondition {[.]State} = "FAULT", Critical ("BESS B2 fault") |  | ONLINE\|FAULT\|OFF. FAULT above 55 C cell temperature (until it cools below 45); OFF via _Sim_/Fault/BESS. |
| MG/BESS/B2/ThroughputMWh | Float8 | MWh | 12 |  |  | Cumulative energy through the battery (degradation hint). |
| MG/BESS/B2/MaxChargekW | Float8 | kW | 250 |  |  | Present charge limit (temperature derate, taper above 90 % SOC). |
| MG/BESS/B2/MaxDischargekW | Float8 | kW | 250 |  |  | Present discharge limit (temperature derate, reserve floor). |
| MG/BESS/B2/SOHPct | Float8 | % | 97 |  |  | State of health: capacity fade with throughput. |
| MG/BESS/B2/CapacitykWh | Float8 | kWh | 500 |  |  | Nameplate energy. Constant. |
| MG/BESS/B2/RatedkW | Float8 | kW | 250 |  |  | Nameplate power. Constant. |
| MG/Grid/Available | Boolean |  | true | GridLost: OnCondition {[.]Available} = 0, High ("Utility grid lost") |  | Utility intertie healthy. False during the grid_outage scenario. |
| MG/Grid/Islanded | Boolean |  | false | Islanded: OnCondition {[.]Islanded} = 1, Medium ("Campus islanded") |  | Campus separated from the utility (stays true for the resync delay after the grid returns). |
| MG/Grid/ImportkW | Float8 | kW | 0 |  | OnChange, deadband 0.5 | Power imported from the utility. |
| MG/Grid/ExportkW | Float8 | kW | 0 |  | OnChange, deadband 0.5 | Power exported to the utility (limited to ExportLimitkW). |
| MG/Grid/VoltageV | Float8 | V | 480 | VoltageHigh: AboveValue 504, Medium ("Bus voltage above +5 %")<br>VoltageLow: BelowValue 456, Medium ("Bus voltage below -5 %") | OnChange, deadband 0.5 | Main switchboard line voltage. |
| MG/Grid/FrequencyHz | Float8 | Hz | 60 | FrequencyHigh: AboveValue 60.5, Medium ("Bus frequency above 60.5 Hz")<br>FrequencyLow: BelowValue 59.5, Medium ("Bus frequency below 59.5 Hz") | OnChange, deadband 0.01 | Bus frequency (droops in island mode). |
| MG/Grid/TodayImportkWh | Float8 | kWh | 0 |  | OnChange, deadband 0.5 | Energy imported today. |
| MG/Grid/TodayExportkWh | Float8 | kWh | 0 |  | OnChange, deadband 0.5 | Energy exported today. |
| MG/Grid/TodayCostUSD | Float8 | USD | 0 |  | OnChange, deadband 0.01 | Today's cost: import energy less export credit plus demand charge. |
| MG/Grid/BaselineCostUSD | Float8 | USD | 0 |  | OnChange, deadband 0.01 | Same-tick baseline without PV and BESS (the whole load imported). |
| MG/Grid/PeakImportkW | Float8 | kW | 0 |  | OnChange, deadband 0.5 | Highest 15-minute average import in today's demand window (16-21 weekdays; 0 before the window opens). |
| MG/Grid/BaselinePeakkW | Float8 | kW | 0 |  | OnChange, deadband 0.5 | Highest 15-minute average load in today's demand window without PV and BESS. |
| MG/Grid/DemandChargeUSD | Float8 | USD | 0 |  | OnChange, deadband 0.01 | Today's demand charge: PeakImportkW x 0.50 USD/kW-day. |
| MG/Grid/DemandkW | Float8 | kW | 0 | DemandHigh: AboveValue 500, High ("Demand above the 500 kW threshold") | OnChange, deadband 0.5 | 15-minute rolling average import (what the demand charge sees). |
| MG/Grid/DemandLimitkW | Float8 | kW | 500 |  |  | Demand threshold peak shaving works against. Constant. |
| MG/Grid/ExportLimitkW | Float8 | kW | 300 |  |  | Interconnection export limit; PV curtails above it. Constant. |
| MG/Genset/State | String |  | OFF |  |  | OFF\|STARTING\|RUNNING\|COOLDOWN. Only runs while islanded. |
| MG/Genset/kW | Float8 | kW | 0 |  | OnChange, deadband 0.5 | Electrical output. |
| MG/Genset/FuelPct | Float8 | % | 92 | FuelLow: BelowValue 20, Medium ("Genset fuel below 20 %") | OnChange, deadband 0.01 | Fuel tank level. |
| MG/Genset/RunHours | Float8 | h | 214 |  |  | Accumulated engine hours (simulated). |
| MG/Genset/StartCountdownS | Float8 | s | 0 |  |  | Seconds until RUNNING while STARTING. |
| MG/Genset/RatedkW | Float8 | kW | 400 |  |  | Rating. Constant. |
| MG/Genset/CoolantTempC | Float8 | °C | 30 |  | OnChange, deadband 0.5 | Coolant temperature. |
| MG/EV/C01/State | String |  | IDLE | ChargerFault: OnCondition {[.]State} = "FAULT", High ("EV charger C01 fault") |  | IDLE\|CHARGING\|CURTAILED\|FAULT (CURTAILED = smart limit or shed in island). |
| MG/EV/C01/kW | Float8 | kW | 0 |  | OnChange, deadband 0.3 | Charging power. |
| MG/EV/C01/SessionkWh | Float8 | kWh | 0 |  |  | Energy delivered in the present session. |
| MG/EV/C01/CarSOCPct | Float8 | % | 0 |  |  | State of charge of the connected car (0 = none). |
| MG/EV/C01/Smart | Boolean |  | true |  |  | Smart charging: the charger accepts curtailment on grid stress. |
| MG/EV/C01/CarCapacitykWh | Float8 | kWh | 0 |  |  | Battery size of the connected car. |
| MG/EV/C01/TargetSOCPct | Float8 | % | 0 |  |  | Session target SOC. |
| MG/EV/C01/MaxkW | Float8 | kW | 22 |  |  | Charger rating. Constant. |
| MG/EV/C02/State | String |  | IDLE | ChargerFault: OnCondition {[.]State} = "FAULT", High ("EV charger C02 fault") |  | IDLE\|CHARGING\|CURTAILED\|FAULT (CURTAILED = smart limit or shed in island). |
| MG/EV/C02/kW | Float8 | kW | 0 |  | OnChange, deadband 0.3 | Charging power. |
| MG/EV/C02/SessionkWh | Float8 | kWh | 0 |  |  | Energy delivered in the present session. |
| MG/EV/C02/CarSOCPct | Float8 | % | 0 |  |  | State of charge of the connected car (0 = none). |
| MG/EV/C02/Smart | Boolean |  | true |  |  | Smart charging: the charger accepts curtailment on grid stress. |
| MG/EV/C02/CarCapacitykWh | Float8 | kWh | 0 |  |  | Battery size of the connected car. |
| MG/EV/C02/TargetSOCPct | Float8 | % | 0 |  |  | Session target SOC. |
| MG/EV/C02/MaxkW | Float8 | kW | 22 |  |  | Charger rating. Constant. |
| MG/EV/C03/State | String |  | IDLE | ChargerFault: OnCondition {[.]State} = "FAULT", High ("EV charger C03 fault") |  | IDLE\|CHARGING\|CURTAILED\|FAULT (CURTAILED = smart limit or shed in island). |
| MG/EV/C03/kW | Float8 | kW | 0 |  | OnChange, deadband 0.3 | Charging power. |
| MG/EV/C03/SessionkWh | Float8 | kWh | 0 |  |  | Energy delivered in the present session. |
| MG/EV/C03/CarSOCPct | Float8 | % | 0 |  |  | State of charge of the connected car (0 = none). |
| MG/EV/C03/Smart | Boolean |  | true |  |  | Smart charging: the charger accepts curtailment on grid stress. |
| MG/EV/C03/CarCapacitykWh | Float8 | kWh | 0 |  |  | Battery size of the connected car. |
| MG/EV/C03/TargetSOCPct | Float8 | % | 0 |  |  | Session target SOC. |
| MG/EV/C03/MaxkW | Float8 | kW | 22 |  |  | Charger rating. Constant. |
| MG/EV/C04/State | String |  | IDLE | ChargerFault: OnCondition {[.]State} = "FAULT", High ("EV charger C04 fault") |  | IDLE\|CHARGING\|CURTAILED\|FAULT (CURTAILED = smart limit or shed in island). |
| MG/EV/C04/kW | Float8 | kW | 0 |  | OnChange, deadband 0.3 | Charging power. |
| MG/EV/C04/SessionkWh | Float8 | kWh | 0 |  |  | Energy delivered in the present session. |
| MG/EV/C04/CarSOCPct | Float8 | % | 0 |  |  | State of charge of the connected car (0 = none). |
| MG/EV/C04/Smart | Boolean |  | true |  |  | Smart charging: the charger accepts curtailment on grid stress. |
| MG/EV/C04/CarCapacitykWh | Float8 | kWh | 0 |  |  | Battery size of the connected car. |
| MG/EV/C04/TargetSOCPct | Float8 | % | 0 |  |  | Session target SOC. |
| MG/EV/C04/MaxkW | Float8 | kW | 22 |  |  | Charger rating. Constant. |
| MG/EV/C05/State | String |  | IDLE | ChargerFault: OnCondition {[.]State} = "FAULT", High ("EV charger C05 fault") |  | IDLE\|CHARGING\|CURTAILED\|FAULT (CURTAILED = smart limit or shed in island). |
| MG/EV/C05/kW | Float8 | kW | 0 |  | OnChange, deadband 0.3 | Charging power. |
| MG/EV/C05/SessionkWh | Float8 | kWh | 0 |  |  | Energy delivered in the present session. |
| MG/EV/C05/CarSOCPct | Float8 | % | 0 |  |  | State of charge of the connected car (0 = none). |
| MG/EV/C05/Smart | Boolean |  | true |  |  | Smart charging: the charger accepts curtailment on grid stress. |
| MG/EV/C05/CarCapacitykWh | Float8 | kWh | 0 |  |  | Battery size of the connected car. |
| MG/EV/C05/TargetSOCPct | Float8 | % | 0 |  |  | Session target SOC. |
| MG/EV/C05/MaxkW | Float8 | kW | 22 |  |  | Charger rating. Constant. |
| MG/EV/C06/State | String |  | IDLE | ChargerFault: OnCondition {[.]State} = "FAULT", High ("EV charger C06 fault") |  | IDLE\|CHARGING\|CURTAILED\|FAULT (CURTAILED = smart limit or shed in island). |
| MG/EV/C06/kW | Float8 | kW | 0 |  | OnChange, deadband 0.3 | Charging power. |
| MG/EV/C06/SessionkWh | Float8 | kWh | 0 |  |  | Energy delivered in the present session. |
| MG/EV/C06/CarSOCPct | Float8 | % | 0 |  |  | State of charge of the connected car (0 = none). |
| MG/EV/C06/Smart | Boolean |  | true |  |  | Smart charging: the charger accepts curtailment on grid stress. |
| MG/EV/C06/CarCapacitykWh | Float8 | kWh | 0 |  |  | Battery size of the connected car. |
| MG/EV/C06/TargetSOCPct | Float8 | % | 0 |  |  | Session target SOC. |
| MG/EV/C06/MaxkW | Float8 | kW | 22 |  |  | Charger rating. Constant. |
| MG/EV/C07/State | String |  | IDLE | ChargerFault: OnCondition {[.]State} = "FAULT", High ("EV charger C07 fault") |  | IDLE\|CHARGING\|CURTAILED\|FAULT (CURTAILED = smart limit or shed in island). |
| MG/EV/C07/kW | Float8 | kW | 0 |  | OnChange, deadband 0.3 | Charging power. |
| MG/EV/C07/SessionkWh | Float8 | kWh | 0 |  |  | Energy delivered in the present session. |
| MG/EV/C07/CarSOCPct | Float8 | % | 0 |  |  | State of charge of the connected car (0 = none). |
| MG/EV/C07/Smart | Boolean |  | true |  |  | Smart charging: the charger accepts curtailment on grid stress. |
| MG/EV/C07/CarCapacitykWh | Float8 | kWh | 0 |  |  | Battery size of the connected car. |
| MG/EV/C07/TargetSOCPct | Float8 | % | 0 |  |  | Session target SOC. |
| MG/EV/C07/MaxkW | Float8 | kW | 22 |  |  | Charger rating. Constant. |
| MG/EV/C08/State | String |  | IDLE | ChargerFault: OnCondition {[.]State} = "FAULT", High ("EV charger C08 fault") |  | IDLE\|CHARGING\|CURTAILED\|FAULT (CURTAILED = smart limit or shed in island). |
| MG/EV/C08/kW | Float8 | kW | 0 |  | OnChange, deadband 0.3 | Charging power. |
| MG/EV/C08/SessionkWh | Float8 | kWh | 0 |  |  | Energy delivered in the present session. |
| MG/EV/C08/CarSOCPct | Float8 | % | 0 |  |  | State of charge of the connected car (0 = none). |
| MG/EV/C08/Smart | Boolean |  | true |  |  | Smart charging: the charger accepts curtailment on grid stress. |
| MG/EV/C08/CarCapacitykWh | Float8 | kWh | 0 |  |  | Battery size of the connected car. |
| MG/EV/C08/TargetSOCPct | Float8 | % | 0 |  |  | Session target SOC. |
| MG/EV/C08/MaxkW | Float8 | kW | 22 |  |  | Charger rating. Constant. |
| MG/EV/C09/State | String |  | IDLE | ChargerFault: OnCondition {[.]State} = "FAULT", High ("EV charger C09 fault") |  | IDLE\|CHARGING\|CURTAILED\|FAULT (CURTAILED = smart limit or shed in island). |
| MG/EV/C09/kW | Float8 | kW | 0 |  | OnChange, deadband 0.3 | Charging power. |
| MG/EV/C09/SessionkWh | Float8 | kWh | 0 |  |  | Energy delivered in the present session. |
| MG/EV/C09/CarSOCPct | Float8 | % | 0 |  |  | State of charge of the connected car (0 = none). |
| MG/EV/C09/Smart | Boolean |  | true |  |  | Smart charging: the charger accepts curtailment on grid stress. |
| MG/EV/C09/CarCapacitykWh | Float8 | kWh | 0 |  |  | Battery size of the connected car. |
| MG/EV/C09/TargetSOCPct | Float8 | % | 0 |  |  | Session target SOC. |
| MG/EV/C09/MaxkW | Float8 | kW | 22 |  |  | Charger rating. Constant. |
| MG/EV/C10/State | String |  | IDLE | ChargerFault: OnCondition {[.]State} = "FAULT", High ("EV charger C10 fault") |  | IDLE\|CHARGING\|CURTAILED\|FAULT (CURTAILED = smart limit or shed in island). |
| MG/EV/C10/kW | Float8 | kW | 0 |  | OnChange, deadband 0.3 | Charging power. |
| MG/EV/C10/SessionkWh | Float8 | kWh | 0 |  |  | Energy delivered in the present session. |
| MG/EV/C10/CarSOCPct | Float8 | % | 0 |  |  | State of charge of the connected car (0 = none). |
| MG/EV/C10/Smart | Boolean |  | true |  |  | Smart charging: the charger accepts curtailment on grid stress. |
| MG/EV/C10/CarCapacitykWh | Float8 | kWh | 0 |  |  | Battery size of the connected car. |
| MG/EV/C10/TargetSOCPct | Float8 | % | 0 |  |  | Session target SOC. |
| MG/EV/C10/MaxkW | Float8 | kW | 22 |  |  | Charger rating. Constant. |
| MG/EV/TotalkW | Float8 | kW | 0 |  | OnChange, deadband 0.5 | Total charging power. |
| MG/EV/ActiveSessions | Int4 | sessions | 0 |  | OnChange, deadband 0 | Chargers with a car connected and charging or curtailed. |
| MG/EV/CurtailedkW | Float8 | kW | 0 |  | OnChange, deadband 0.5 | Power withheld by smart curtailment. |
| MG/Loads/Bldg1/kW | Float8 | kW | 100 |  | OnChange, deadband 0.3 | Building 1 (Office) load incl. HVAC; 0 while shed. |
| MG/Loads/Bldg1/HVACkW | Float8 | kW | 20 |  | OnChange, deadband 0.3 | HVAC part of the load (cooling above 17 C ambient, heating below 12 C). |
| MG/Loads/Bldg1/Critical | Boolean |  | false |  |  | Critical load: the only building served in island mode. Constant. |
| MG/Loads/Bldg1/Shed | Boolean |  | false |  |  | Shed (not served) while islanded. |
| MG/Loads/Bldg2/kW | Float8 | kW | 100 |  | OnChange, deadband 0.3 | Building 2 (Lab) load incl. HVAC; 0 while shed. |
| MG/Loads/Bldg2/HVACkW | Float8 | kW | 20 |  | OnChange, deadband 0.3 | HVAC part of the load (cooling above 17 C ambient, heating below 12 C). |
| MG/Loads/Bldg2/Critical | Boolean |  | true |  |  | Critical load: the only building served in island mode. Constant. |
| MG/Loads/Bldg2/Shed | Boolean |  | false |  |  | Shed (not served) while islanded. |
| MG/Loads/Bldg3/kW | Float8 | kW | 100 |  | OnChange, deadband 0.3 | Building 3 (Residence) load incl. HVAC; 0 while shed. |
| MG/Loads/Bldg3/HVACkW | Float8 | kW | 20 |  | OnChange, deadband 0.3 | HVAC part of the load (cooling above 17 C ambient, heating below 12 C). |
| MG/Loads/Bldg3/Critical | Boolean |  | false |  |  | Critical load: the only building served in island mode. Constant. |
| MG/Loads/Bldg3/Shed | Boolean |  | false |  |  | Shed (not served) while islanded. |
| MG/Loads/TotalkW | Float8 | kW | 300 |  | OnChange, deadband 0.5 | Served campus load: buildings plus EV charging. |
| MG/Loads/CriticalkW | Float8 | kW | 100 |  | OnChange, deadband 0.3 | Load of the critical buildings. |
| MG/Loads/BuildingsTotalkW | Float8 | kW | 280 |  | OnChange, deadband 0.5 | Served building load (without EV). |
| MG/KPI/NetLoadkW | Float8 | kW | 0 |  | OnChange, deadband 0.5 | Campus load minus PV output (negative = PV surplus). |
| MG/KPI/PVFractionPct | Float8 | % | 0 |  | OnChange, deadband 0.2 | Share of the served load covered by PV. |
| MG/KPI/SelfSufficiencyPct | Float8 | % | 0 |  | OnChange, deadband 0.2 | Share of the served load not imported from the utility. |
| MG/KPI/PVTotalkW | Float8 | kW | 0 |  | OnChange, deadband 0.5 | Total PV AC output. |
| MG/KPI/BESSTotalkW | Float8 | kW | 0 |  | OnChange, deadband 0.5 | Total BESS power (positive = discharging). |
| MG/KPI/TodayPVkWh | Float8 | kWh | 0 |  | OnChange, deadband 0.5 | PV energy today. |
| MG/KPI/TodaySavingsUSD | Float8 | USD | 0 |  | OnChange, deadband 0.01 | Baseline cost minus actual cost today. |
| MG/KPI/TodayCO2AvoidedKg | Float8 | kg | 0 |  | OnChange, deadband 0.01 | CO2 avoided today versus the no-PV/BESS baseline. |
| MG/KPI/ActiveAlarms | Int4 | alarms | 0 |  | OnChange, deadband 0 | Currently active alarms under MG (from the alarm system). |
| MG/KPI/Mode | String |  | NORMAL |  |  | NORMAL\|ISLAND\|GENSET\|CURTAILING\|STRESS. |
| MG/Forecast/PVkW | Float8 | kW | 0 |  | OnChange, deadband 0.5 | Day-ahead PV forecast for the present hour (clear sky, typical cloudiness, no noise). |
| MG/Forecast/LoadkW | Float8 | kW | 300 |  | OnChange, deadband 0.5 | Day-ahead campus load forecast for the present hour (profiles, forecast temperature, expected EV; no noise, no heat wave). |
| MG/Forecast/PricePerkWh | Float8 | $/kWh | 0.09 |  | OnChange, deadband 0.001 | Day-ahead tariff for the present hour. |
| MG/_Sim_/Enabled | Boolean |  | true |  |  | Master switch for the mg_sim timer. |
| MG/_Sim_/Scenario | String |  | normal |  |  | normal\|grid_outage\|cloud_front_ev_rush\|peak_shave_day\|inverter_fault. |
| MG/_Sim_/ScenarioStep | Int4 | step | 0 |  |  | Progress of the running scenario (see README). |
| MG/_Sim_/SpeedFactor | Float8 | x | 120 |  |  | Simulated seconds per real second (120 = 24 h in 12 min). Electrical transients scale with SpeedFactor/120 (0.25x-4x). |
| MG/_Sim_/Seed | Int4 | seed | 66 |  |  | Random seed for the noise. |
| MG/_Sim_/TickCount | Int8 | ticks | 0 |  |  | Timer ticks since the sim started. |
| MG/_Sim_/LastTickMs | Int4 | ms | 0 |  |  | Duration of the last tick's read + compute (the write follows and is logged every 60 ticks). |
| MG/_Sim_/Cloudiness | Float8 | fraction | -1 |  |  | Cloudiness override 0-1; negative = automatic (random walk + fronts). |
| MG/_Sim_/SetHour | Float8 | h | -1 |  |  | Hour-jump request consumed by the timer (negative = none); written by mg.set_hour. |
| MG/_Sim_/LastError | String |  | "" |  |  | Last timer error; cleared after 30 clean ticks. |
| MG/_Sim_/Fault/Inv/A1A | Boolean |  | false |  |  | Force inverter A1A into FAULT. |
| MG/_Sim_/Fault/Inv/A1B | Boolean |  | false |  |  | Force inverter A1B into FAULT. |
| MG/_Sim_/Fault/Inv/A2A | Boolean |  | false |  |  | Force inverter A2A into FAULT. |
| MG/_Sim_/Fault/Inv/A2B | Boolean |  | false |  |  | Force inverter A2B into FAULT. |
| MG/_Sim_/Fault/Inv/A3A | Boolean |  | false |  |  | Force inverter A3A into FAULT. |
| MG/_Sim_/Fault/Inv/A3B | Boolean |  | false |  |  | Force inverter A3B into FAULT. |
| MG/_Sim_/Fault/Inv/A4A | Boolean |  | false |  |  | Force inverter A4A into FAULT. |
| MG/_Sim_/Fault/Inv/A4B | Boolean |  | false |  |  | Force inverter A4B into FAULT. |
| MG/_Sim_/Fault/GridOut | Boolean |  | false |  |  | Utility intertie lost (grid_outage). |
| MG/_Sim_/Fault/Charger | Int4 | charger | 0 |  |  | Charger number 1-10 forced into FAULT, 0 = none. |
| MG/_Sim_/Fault/BESS/B1 | Boolean |  | false |  |  | Take BESS B1 offline (State OFF). |
| MG/_Sim_/Fault/BESS/B2 | Boolean |  | false |  |  | Take BESS B2 offline (State OFF). |
| MG/_Sim_/State/LastEpochMs | Int8 | ms | 0 |  |  | Epoch time of the previous tick (for dt). |
| MG/_Sim_/State/OkStreak | Int4 | ticks | 0 |  |  | Clean ticks since the last error. |
| MG/_Sim_/State/ScenarioApplied | String |  | normal |  |  | Scenario whose entry actions have been applied. |
| MG/_Sim_/State/ScenarioClock | Float8 | s | 0 |  |  | Simulated seconds since the scenario was applied. |
| MG/_Sim_/State/ScenarioStartDay | Int4 | day | 0 |  |  | DayIndex when the scenario started. |
| MG/_Sim_/State/DayOfYear | Int4 | day | 172 |  |  | Day of year 1-365 (sun declination, season, ambient mean). |
| MG/_Sim_/State/CloudBase | Float8 | fraction | 0.2 |  |  | Random-walk part of the cloudiness. |
| MG/_Sim_/State/HeatC | Float8 | °C | 0 |  |  | Heat-wave offset added to ambient (peak_shave_day). |
| MG/_Sim_/State/IslandClockS | Float8 | s | 0 |  |  | Electrical seconds since the campus islanded. |
| MG/_Sim_/State/ResyncClockS | Float8 | s | 0 |  |  | Electrical seconds the grid has been back while still islanded. |
| MG/_Sim_/State/GenRunS | Float8 | s | 0 |  |  | Electrical seconds the genset has been RUNNING. |
| MG/_Sim_/State/GenCooldownS | Float8 | s | 0 |  |  | Electrical seconds in COOLDOWN. |
| MG/_Sim_/State/FreqDevHz | Float8 | Hz | 0 |  |  | Island frequency deviation state. |
| MG/_Sim_/State/VoltDevV | Float8 | V | 0 |  |  | Island voltage deviation state. |
| MG/_Sim_/State/PrevMode/B1 | String |  | PEAK_SHAVE |  |  | B1 mode before islanding. |
| MG/_Sim_/State/PrevMode/B2 | String |  | SELF_CONSUME |  |  | B2 mode before islanding. |
| MG/_Sim_/State/BaselineDemandkW | Float8 | kW | 0 |  |  | 15-minute average of the baseline load. |
| MG/_Sim_/State/EnergyCostUSD | Float8 | USD | 0 |  |  | Net energy cost today (import less export credit). |
| MG/_Sim_/State/BaselineEnergyCostUSD | Float8 | USD | 0 |  |  | Baseline energy cost today. |
| MG/_Sim_/State/TargetSOCPct | Float8 | % | 60 |  |  | Pre-peak SOC target the PEAK_SHAVE units charge to in the off-peak band. |
<!-- tag-table:end -->
