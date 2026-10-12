# sim/datacenter - Data Center Infrastructure simulation

Gateway-side simulation for demo 2 (ADR-005 section 4/6): one data hall, 60 racks in 6 rows, a dual power chain
(utility, generator, ATS, UPS A/B, PDU A1-A3 / B1-B3), a cooling loop (2 chillers, 4 CRAH units) and hall KPIs
including a live PUE. It runs inside the Ignition gateway and is steered through project-library functions called
with `POST /script/library`. Loading and installing follow `sim/README.md` (same scripts as `sim/launch`).

```
sim/datacenter/
  tags.json                         675 tags under [default]DC/, system.tag.configure format
  project/
    timer/dc_sim/                   1000 ms timer: the whole model (one readBlocking, one writeBlocking)
    script-python/dc/code.py        library module "dc": the scenario/control API
```

    export IGNITE_URL=http://<gateway>:8088/data/ignite IGNITE_SITE=<site> IGNITE_USER=<operator> IGNITE_PASS=<secret>
    node sim/scripts/load-tags.mjs sim/datacenter/tags.json
    sim/scripts/install-project.sh <ssh-host> <data>/projects/<project>/ignition datacenter    # copies, restarts, waits

## Library API (`dc.<fn>`, operator tier)

Each returns `{ok, message, state}` (state is read before the timer reacts); `status()` returns the state dict only.

| Function | Effect |
|---|---|
| `status()` | mode, scenario, KPIs, UPS/ATS/generator, CRAH states, faults, tick count, last error |
| `set_scenario(name)` | `normal`, `utility_loss`, `crah_failure` (CRAH 2 unless `Fault/CRAH` is set), `rack_migration` |
| `restore()` | clear all faults, reset tripped PDU breakers, scenario `normal` |
| `fail_crah(n)` / `restore_crah(n)` | CRAH unit 1-4 into / out of `FAULT` |
| `utility_loss()` / `utility_restore()` | drop / return the utility feed |
| `start_migration()` | start `rack_migration` |
| `set_workload_profile(name)` | `diurnal`, `flat`, `bursty` |
| `set_speed(factor)` | 0.25 - 60; every time constant scales with it |
| `acknowledge_all()` | no-op placeholder returning the active alarm count; acknowledge through `/alarms/acknowledge` |

The library writes `_Sim_/*` (and, in `restore()`, the PDU `BreakerTripped` flags). Scenario changes are picked up by the timer on its next tick
(`_Sim_/State/ScenarioApplied` tracks what was applied); `normal` clears the faults.

## Model (what the timer computes each tick)

State lives only in tags (`_Sim_/State/*` plus the process tags themselves), so a gateway restart is harmless.
`dt = SpeedFactor x real seconds since the previous tick` (`_Sim_/State/LastEpochMs`), and every lag, delay and
scenario duration is in simulated seconds.

* **Rack power** = nameplate(workload) x per-rack jitter x (0.32 + 0.68 x utilisation) x row scale. Utilisation follows
  the workload profile: `diurnal` uses the gateway clock (web/db peak at 15:00, batch runs at night, ml/idle are flat),
  `flat` is constant, `bursty` adds per-rack bursts and more noise; utilisation is lagged (3 s) so power is smooth.
  Workloads (`web|batch|db|ml|idle`) are the `Workload` tags. Each rack is dual-fed; the load splits 50/50 between its
  A and B PDU, and moves entirely to the surviving feed if the other PDU is tripped or its UPS is off.
* **PDU / UPS**: PDU load = its racks' share; UPS load = its three PDUs. UPS losses = 500 kW x (0.012 + 0.015x + 0.02x^2)
  (x = load fraction), so efficiency is about 95 % at 40 % load. Battery 66 kWh per UPS (about 18 min at 210 kW):
  `BATTERY` drains SOC by (load + loss), `RuntimeMin` = remaining energy / present draw; ONLINE recharges at 0.05 %/s
  (8 kW charger draw, counted in `LossesKW`). A PDU breaker trips above 125 % (stays tripped until `restore()`).
* **Sources**: utility out for 2 s starts the generator (`STARTING`, `StartCountdownS` from 12 s) then `RUNNING`;
  2 s later the ATS goes `OPEN` -> `GENERATOR` (it opens the moment the utility is lost). After the utility has been
  back for 30 s the ATS re-transfers (closed transition, UPS stays ONLINE), the generator cools down for 60 s then
  stops. Fuel burns at 0.27 L/kWh from a 2000 L tank; run hours accumulate.
* **Cooling**: CRAH 1-3 are duty units (zones from the `Zone` tags: A,B / C,D / E,F, 220 kW each); CRAH 4 is the shared
  N+1 assist unit (40 kW). A zone's coverage = own CRAH delivery (fan % x rating) + its share of the assist unit and 30 %
  of the other duty units' spare capacity. The shortfall (1 - coverage) drives a **recirculation term** on rack inlets
  (up to 26 K at zero coverage, worse towards the row end). Rack inlet = zone supply air + row/position offset + hot-rack
  term + recirculation, lagged with a 150 s time constant; outlet = inlet + P / (rho cp V) with the airflow falling with
  coverage. Neighbour CRAHs and the assist unit ramp their fans (lag 15 s) when a zone is short. Hot/cold aisle values are
  the mean outlet and a mid-aisle value between CRAH supply and mean inlet; CRAH return follows its zone's hot aisle (45 s).
  CRAH fans ride through a utility loss on UPS-backed supply (their power is not in the UPS load figure).
* **Chillers**: stage by heat load (second unit above 80 % of one 350 kW chiller). COP = (5.8 - 0.11 x (outdoor - 12))
  with a part-load factor, floor 2.2, so it falls as the outdoor temperature rises (outdoor: diurnal curve, 8-26 C). They
  trip with the mechanical bus and restart 20 s after power returns; chilled-water supply then drifts towards 14 C and
  CRAH supply air follows (supply = chilled water + 11 K).
* **KPIs**: `LossesKW` = UPS losses + 1.2 % distribution + 4 kW lighting/misc + charging; `TotalFacilityKW` = IT + cooling +
  losses; `PUE` = total / IT (about 1.35-1.40 in `normal`). `HeadroomPct` is against the 1200 kW design capacity.
  `ActiveAlarms` is read from the alarm system (`system.alarm.queryStatus`, active acked + unacked under `DC`).
  `Mode`: ON_BATTERY > ON_GENERATOR > THERMAL_EVENT (CRAH fault or any inlet above 27 C) > MIGRATION > NORMAL.

### Scenarios and `ScenarioStep`

* `utility_loss`: 1 outage/generator starting, 2 generator running (ATS still open), 3 on generator, 4 utility back
  (waiting for the re-transfer), 5 re-transferred (generator cooling down). Sequence at 1x: battery at +1 s, generator
  STARTING at +2 s, RUNNING at +14 s, ATS GENERATOR and UPS ONLINE at +16 s.
* `crah_failure`: 1 unit failed, 2 any inlet above 27 C (rack High alarms), 3 any inlet above 32 C (Critical). With CRAH 2
  down rows C-D warm over minutes (High after about 40 s, Critical after about 2.5 min); `restore_crah(2)` cools them below 27 C in
  about 3.5 minutes. The Critical level is reached on the end-of-row racks first.
* `rack_migration` (300 simulated seconds): rows A-B drain to 35 %, rows E-F take the load with a transient overshoot
  (source and target are both busy during a copy) and settle at about 1.28x. PDU A3/B3 peak at about 97 % of 120 kW
  (High `LoadHigh` alarm, measured at 14-15 h; the overshoot is sized for the daytime load, at night the peak is lower)
  and then settle near 81 %. Step 1 while moving, 2 when settled.

## Tags

Units are on every numeric tag. Rack `Row`, `FeedA`, `FeedB`, PDU `Feed`/`CapacityKW` and the hall `CapacityKW` are
constants the model reads (zones, feeds and ratings come from tags, the electrical and thermal constants above are in the
script). Extra tags beyond the task's list: `_Sim_/State/*` (the model's own state: `LastEpochMs`, `OkStreak`,
`ScenarioApplied`, `ScenarioClock`, `RowScale/A..F`, `UtilityLostS`, `UtilityStableS`, `GenRunS`, `CooldownS`,
`MechPowerS`).

`_Sim_/LastTickMs` is the **duration in milliseconds** of the last tick's read + compute (the write follows it and is
logged separately every 60 ticks: `dc_sim tick N: read+compute X ms, write Y ms (Z tags)`).

### History and the historian load

Provider `IgniteHistorian`. All numeric `Hall/*` KPIs (not the constant `CapacityKW`, not `Mode`), `ActiveAlarms`, utility,
generator, UPS, PDU, chiller, CRAH and loop numerics are stored on change at a 1 s minimum with deadbands; that is
72 tags. Of the 540 rack tags only `InletTempC` and `PowerKW` are trended, with a 10 s minimum time and a 0.2
deadband: 60 racks x 2 at 1 s would be up to 120 points per second for tags that move by hundredths, whereas at 10 s
the rack trends are bounded to 12 points per second and the deadband keeps the typical rate well below that. The hall
KPIs carry the dashboard's 24-hour trends, the rack trends feed the click-for-detail view.

### Alarms

Rack `InletTempC` above 27 (High, "ASHRAE recommended exceeded") and above 32 (Critical); UPS `State` = `BATTERY`
(High, expression alarm) and `RuntimeMin` below 10 (Critical); PDU `LoadPct` above 90 (High) and `BreakerTripped`
(Critical); CRAH `State` = `FAULT` (High); `Hall/PUE` above 1.6 (Medium); utility `Available` false (High); generator
`FuelPct` below 20 (Medium). The tag load itself produces one zero-length "Cleared, Acknowledged" event per alarm
(active/ack/clear stamped in the same millisecond); filter `/alarms/status` by `activeTime` when counting real events.

## Tag model

Generated from `tags.json` by `node sim/scripts/tag-table.mjs sim/datacenter/tags.json --write sim/datacenter/README.md`.

<!-- tag-table:start -->
675 tags, 192 with history, 143 alarms.

| Tag | Type | Unit | Initial | Alarms | History | Description |
|---|---|---|---|---|---|---|
| DC/Hall/ITLoadKW | Float8 | kW | 440 |  | OnChange, deadband 0.1 | Total IT load: sum of all rack power. |
| DC/Hall/TotalFacilityKW | Float8 | kW | 600 |  | OnChange, deadband 0.1 | IT + cooling + electrical losses (what the utility/generator supplies). |
| DC/Hall/PUE | Float8 | ratio | 1.36 | PUEHigh: AboveValue 1.6, Medium ("PUE above 1.6") | OnChange, deadband 0.002 | Power usage effectiveness = TotalFacilityKW / ITLoadKW. |
| DC/Hall/CoolingKW | Float8 | kW | 120 |  | OnChange, deadband 0.1 | Chillers + CRAH fans + pumps. |
| DC/Hall/LossesKW | Float8 | kW | 40 |  | OnChange, deadband 0.1 | UPS conversion losses, distribution losses, battery charging and lighting/misc. |
| DC/Hall/CapacityKW | Float8 | kW | 1200 |  |  | Design IT capacity of the hall (constant). |
| DC/Hall/HeadroomPct | Float8 | % | 63 |  | OnChange, deadband 0.1 | Remaining IT capacity: (CapacityKW - ITLoadKW) / CapacityKW. |
| DC/Hall/OutdoorTempC | Float8 | °C | 20 |  | OnChange, deadband 0.05 | Outdoor dry-bulb temperature (diurnal curve from the gateway clock). |
| DC/Hall/OutdoorHumidityPct | Float8 | % | 55 |  | OnChange, deadband 0.2 | Outdoor relative humidity. |
| DC/Hall/HallAvgInletC | Float8 | °C | 21.5 |  | OnChange, deadband 0.05 | Average rack inlet temperature. |
| DC/Hall/HallMaxInletC | Float8 | °C | 24 |  | OnChange, deadband 0.05 | Hottest rack inlet temperature. |
| DC/Hall/HotAisleAvgC | Float8 | °C | 31 |  | OnChange, deadband 0.05 | Average rack outlet (hot aisle) temperature. |
| DC/Hall/ColdAisleAvgC | Float8 | °C | 20 |  | OnChange, deadband 0.05 | Cold aisle mid-aisle temperature (between CRAH supply and rack inlet). |
| DC/Hall/ActiveAlarms | Int4 | alarms | 0 |  | OnChange | Number of currently active alarms under DC (from the alarm system). |
| DC/Hall/Mode | String |  | NORMAL |  |  | NORMAL\|ON_BATTERY\|ON_GENERATOR\|THERMAL_EVENT\|MIGRATION. |
| DC/Power/Utility/Available | Boolean |  | true | UtilityLost: OnCondition {[.]Available} = 0, High ("Utility power lost") |  | Utility feed healthy. False during the utility_loss scenario. |
| DC/Power/Utility/VoltageV | Float8 | V | 480 |  | OnChange, deadband 1 | Utility line voltage. |
| DC/Power/Utility/FrequencyHz | Float8 | Hz | 60 |  | OnChange, deadband 0.02 | Utility frequency. |
| DC/Power/Utility/KW | Float8 | kW | 600 |  | OnChange, deadband 0.5 | Power drawn from the utility (zero while the ATS is not on utility). |
| DC/Power/Generator/State | String |  | OFF |  |  | OFF\|STARTING\|RUNNING\|COOLDOWN. |
| DC/Power/Generator/FuelPct | Float8 | % | 92 | FuelLow: BelowValue 20, Medium ("Generator fuel below 20 %") | OnChange, deadband 0.01 | Fuel tank level. |
| DC/Power/Generator/KW | Float8 | kW | 0 |  | OnChange, deadband 0.5 | Generator electrical output. |
| DC/Power/Generator/RunHours | Float8 | h | 412 |  |  | Accumulated engine run hours. |
| DC/Power/Generator/StartCountdownS | Float8 | s | 0 |  |  | Seconds until the generator reaches RUNNING while STARTING; 0 otherwise. |
| DC/Power/Switchgear/ATSPosition | String |  | UTILITY |  |  | UTILITY\|GENERATOR\|OPEN (open = break between sources). |
| DC/Power/UPS/A/State | String |  | ONLINE | OnBattery: OnCondition {[.]State} = "BATTERY", High ("UPS A on battery") |  | ONLINE\|BATTERY\|BYPASS\|OFF. |
| DC/Power/UPS/A/LoadKW | Float8 | kW | 220 |  | OnChange, deadband 0.5 | Load carried by UPS A. |
| DC/Power/UPS/A/LoadPct | Float8 | % | 44 |  | OnChange, deadband 0.2 | Load as percent of the 500 kW rating. |
| DC/Power/UPS/A/BatterySOCPct | Float8 | % | 100 |  | OnChange, deadband 0.05 | Battery state of charge. |
| DC/Power/UPS/A/RuntimeMin | Float8 | min | 18 | RuntimeLow: BelowValue 10, Critical ("UPS A runtime below 10 min") | OnChange, deadband 0.2 | Estimated battery runtime at the present load. |
| DC/Power/UPS/A/InputV | Float8 | V | 480 |  | OnChange, deadband 1 | UPS input voltage (0 when no source). |
| DC/Power/UPS/A/OutputV | Float8 | V | 480 |  | OnChange, deadband 0.5 | UPS output voltage. |
| DC/Power/UPS/A/TempC | Float8 | °C | 33 |  | OnChange, deadband 0.1 | UPS cabinet temperature. |
| DC/Power/UPS/A/Efficiency | Float8 | % | 95 |  | OnChange, deadband 0.05 | Conversion efficiency at the present load. |
| DC/Power/UPS/B/State | String |  | ONLINE | OnBattery: OnCondition {[.]State} = "BATTERY", High ("UPS B on battery") |  | ONLINE\|BATTERY\|BYPASS\|OFF. |
| DC/Power/UPS/B/LoadKW | Float8 | kW | 220 |  | OnChange, deadband 0.5 | Load carried by UPS B. |
| DC/Power/UPS/B/LoadPct | Float8 | % | 44 |  | OnChange, deadband 0.2 | Load as percent of the 500 kW rating. |
| DC/Power/UPS/B/BatterySOCPct | Float8 | % | 100 |  | OnChange, deadband 0.05 | Battery state of charge. |
| DC/Power/UPS/B/RuntimeMin | Float8 | min | 18 | RuntimeLow: BelowValue 10, Critical ("UPS B runtime below 10 min") | OnChange, deadband 0.2 | Estimated battery runtime at the present load. |
| DC/Power/UPS/B/InputV | Float8 | V | 480 |  | OnChange, deadband 1 | UPS input voltage (0 when no source). |
| DC/Power/UPS/B/OutputV | Float8 | V | 480 |  | OnChange, deadband 0.5 | UPS output voltage. |
| DC/Power/UPS/B/TempC | Float8 | °C | 33 |  | OnChange, deadband 0.1 | UPS cabinet temperature. |
| DC/Power/UPS/B/Efficiency | Float8 | % | 95 |  | OnChange, deadband 0.05 | Conversion efficiency at the present load. |
| DC/Power/PDU/A1/LoadKW | Float8 | kW | 73 |  | OnChange, deadband 0.3 | Load on PDU A1. |
| DC/Power/PDU/A1/LoadPct | Float8 | % | 61 | LoadHigh: AboveValue 90, High ("PDU A1 above 90 % load") | OnChange, deadband 0.3 | Load as percent of CapacityKW. |
| DC/Power/PDU/A1/CapacityKW | Float8 | kW | 120 |  |  | PDU rating (constant). |
| DC/Power/PDU/A1/BreakerTripped | Boolean |  | false | BreakerTrip: OnCondition {[.]BreakerTripped} = 1, Critical ("PDU A1 breaker tripped") |  | Main breaker tripped (load above 125 % of rating). |
| DC/Power/PDU/A1/Feed | String |  | UPS A |  |  | Upstream UPS. |
| DC/Power/PDU/A2/LoadKW | Float8 | kW | 73 |  | OnChange, deadband 0.3 | Load on PDU A2. |
| DC/Power/PDU/A2/LoadPct | Float8 | % | 61 | LoadHigh: AboveValue 90, High ("PDU A2 above 90 % load") | OnChange, deadband 0.3 | Load as percent of CapacityKW. |
| DC/Power/PDU/A2/CapacityKW | Float8 | kW | 120 |  |  | PDU rating (constant). |
| DC/Power/PDU/A2/BreakerTripped | Boolean |  | false | BreakerTrip: OnCondition {[.]BreakerTripped} = 1, Critical ("PDU A2 breaker tripped") |  | Main breaker tripped (load above 125 % of rating). |
| DC/Power/PDU/A2/Feed | String |  | UPS A |  |  | Upstream UPS. |
| DC/Power/PDU/A3/LoadKW | Float8 | kW | 73 |  | OnChange, deadband 0.3 | Load on PDU A3. |
| DC/Power/PDU/A3/LoadPct | Float8 | % | 61 | LoadHigh: AboveValue 90, High ("PDU A3 above 90 % load") | OnChange, deadband 0.3 | Load as percent of CapacityKW. |
| DC/Power/PDU/A3/CapacityKW | Float8 | kW | 120 |  |  | PDU rating (constant). |
| DC/Power/PDU/A3/BreakerTripped | Boolean |  | false | BreakerTrip: OnCondition {[.]BreakerTripped} = 1, Critical ("PDU A3 breaker tripped") |  | Main breaker tripped (load above 125 % of rating). |
| DC/Power/PDU/A3/Feed | String |  | UPS A |  |  | Upstream UPS. |
| DC/Power/PDU/B1/LoadKW | Float8 | kW | 73 |  | OnChange, deadband 0.3 | Load on PDU B1. |
| DC/Power/PDU/B1/LoadPct | Float8 | % | 61 | LoadHigh: AboveValue 90, High ("PDU B1 above 90 % load") | OnChange, deadband 0.3 | Load as percent of CapacityKW. |
| DC/Power/PDU/B1/CapacityKW | Float8 | kW | 120 |  |  | PDU rating (constant). |
| DC/Power/PDU/B1/BreakerTripped | Boolean |  | false | BreakerTrip: OnCondition {[.]BreakerTripped} = 1, Critical ("PDU B1 breaker tripped") |  | Main breaker tripped (load above 125 % of rating). |
| DC/Power/PDU/B1/Feed | String |  | UPS B |  |  | Upstream UPS. |
| DC/Power/PDU/B2/LoadKW | Float8 | kW | 73 |  | OnChange, deadband 0.3 | Load on PDU B2. |
| DC/Power/PDU/B2/LoadPct | Float8 | % | 61 | LoadHigh: AboveValue 90, High ("PDU B2 above 90 % load") | OnChange, deadband 0.3 | Load as percent of CapacityKW. |
| DC/Power/PDU/B2/CapacityKW | Float8 | kW | 120 |  |  | PDU rating (constant). |
| DC/Power/PDU/B2/BreakerTripped | Boolean |  | false | BreakerTrip: OnCondition {[.]BreakerTripped} = 1, Critical ("PDU B2 breaker tripped") |  | Main breaker tripped (load above 125 % of rating). |
| DC/Power/PDU/B2/Feed | String |  | UPS B |  |  | Upstream UPS. |
| DC/Power/PDU/B3/LoadKW | Float8 | kW | 73 |  | OnChange, deadband 0.3 | Load on PDU B3. |
| DC/Power/PDU/B3/LoadPct | Float8 | % | 61 | LoadHigh: AboveValue 90, High ("PDU B3 above 90 % load") | OnChange, deadband 0.3 | Load as percent of CapacityKW. |
| DC/Power/PDU/B3/CapacityKW | Float8 | kW | 120 |  |  | PDU rating (constant). |
| DC/Power/PDU/B3/BreakerTripped | Boolean |  | false | BreakerTrip: OnCondition {[.]BreakerTripped} = 1, Critical ("PDU B3 breaker tripped") |  | Main breaker tripped (load above 125 % of rating). |
| DC/Power/PDU/B3/Feed | String |  | UPS B |  |  | Upstream UPS. |
| DC/Racks/R01/Row | String |  | A |  |  | Row letter A-F (constant). |
| DC/Racks/R01/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R01/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R01/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R01/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R01/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R01/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R01/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R01/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R02/Row | String |  | A |  |  | Row letter A-F (constant). |
| DC/Racks/R02/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R02/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R02/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R02/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R02/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R02/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R02/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R02/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R03/Row | String |  | A |  |  | Row letter A-F (constant). |
| DC/Racks/R03/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R03/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R03/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R03/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R03/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R03/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R03/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R03/Workload | String |  | db |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R04/Row | String |  | A |  |  | Row letter A-F (constant). |
| DC/Racks/R04/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R04/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R04/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R04/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R04/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R04/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R04/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R04/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R05/Row | String |  | A |  |  | Row letter A-F (constant). |
| DC/Racks/R05/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R05/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R05/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R05/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R05/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R05/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R05/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R05/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R06/Row | String |  | A |  |  | Row letter A-F (constant). |
| DC/Racks/R06/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R06/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R06/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R06/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R06/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R06/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R06/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R06/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R07/Row | String |  | A |  |  | Row letter A-F (constant). |
| DC/Racks/R07/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R07/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R07/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R07/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R07/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R07/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R07/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R07/Workload | String |  | db |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R08/Row | String |  | A |  |  | Row letter A-F (constant). |
| DC/Racks/R08/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R08/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R08/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R08/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R08/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R08/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R08/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R08/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R09/Row | String |  | A |  |  | Row letter A-F (constant). |
| DC/Racks/R09/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R09/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R09/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R09/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R09/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R09/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R09/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R09/Workload | String |  | idle |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R10/Row | String |  | A |  |  | Row letter A-F (constant). |
| DC/Racks/R10/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R10/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R10/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R10/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R10/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R10/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R10/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R10/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R11/Row | String |  | B |  |  | Row letter A-F (constant). |
| DC/Racks/R11/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R11/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R11/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R11/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R11/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R11/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R11/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R11/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R12/Row | String |  | B |  |  | Row letter A-F (constant). |
| DC/Racks/R12/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R12/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R12/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R12/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R12/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R12/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R12/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R12/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R13/Row | String |  | B |  |  | Row letter A-F (constant). |
| DC/Racks/R13/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R13/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R13/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R13/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R13/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R13/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R13/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R13/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R14/Row | String |  | B |  |  | Row letter A-F (constant). |
| DC/Racks/R14/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R14/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R14/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R14/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R14/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R14/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R14/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R14/Workload | String |  | db |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R15/Row | String |  | B |  |  | Row letter A-F (constant). |
| DC/Racks/R15/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R15/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R15/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R15/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R15/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R15/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R15/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R15/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R16/Row | String |  | B |  |  | Row letter A-F (constant). |
| DC/Racks/R16/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R16/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R16/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R16/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R16/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R16/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R16/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R16/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R17/Row | String |  | B |  |  | Row letter A-F (constant). |
| DC/Racks/R17/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R17/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R17/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R17/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R17/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R17/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R17/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R17/Workload | String |  | db |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R18/Row | String |  | B |  |  | Row letter A-F (constant). |
| DC/Racks/R18/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R18/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R18/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R18/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R18/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R18/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R18/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R18/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R19/Row | String |  | B |  |  | Row letter A-F (constant). |
| DC/Racks/R19/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R19/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R19/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R19/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R19/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R19/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R19/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R19/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R20/Row | String |  | B |  |  | Row letter A-F (constant). |
| DC/Racks/R20/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R20/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R20/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R20/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R20/FeedA | String |  | A1 |  |  | A-side PDU (constant). |
| DC/Racks/R20/FeedB | String |  | B1 |  |  | B-side PDU (constant). |
| DC/Racks/R20/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R20/Workload | String |  | idle |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R21/Row | String |  | C |  |  | Row letter A-F (constant). |
| DC/Racks/R21/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R21/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R21/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R21/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R21/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R21/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R21/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R21/Workload | String |  | db |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R22/Row | String |  | C |  |  | Row letter A-F (constant). |
| DC/Racks/R22/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R22/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R22/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R22/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R22/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R22/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R22/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R22/Workload | String |  | db |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R23/Row | String |  | C |  |  | Row letter A-F (constant). |
| DC/Racks/R23/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R23/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R23/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R23/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R23/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R23/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R23/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R23/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R24/Row | String |  | C |  |  | Row letter A-F (constant). |
| DC/Racks/R24/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R24/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R24/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R24/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R24/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R24/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R24/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R24/Workload | String |  | db |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R25/Row | String |  | C |  |  | Row letter A-F (constant). |
| DC/Racks/R25/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R25/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R25/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R25/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R25/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R25/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R25/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R25/Workload | String |  | batch |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R26/Row | String |  | C |  |  | Row letter A-F (constant). |
| DC/Racks/R26/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R26/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R26/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R26/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R26/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R26/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R26/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R26/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R27/Row | String |  | C |  |  | Row letter A-F (constant). |
| DC/Racks/R27/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R27/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R27/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R27/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R27/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R27/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R27/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R27/Workload | String |  | db |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R28/Row | String |  | C |  |  | Row letter A-F (constant). |
| DC/Racks/R28/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R28/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R28/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R28/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R28/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R28/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R28/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R28/Workload | String |  | batch |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R29/Row | String |  | C |  |  | Row letter A-F (constant). |
| DC/Racks/R29/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R29/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R29/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R29/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R29/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R29/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R29/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R29/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R30/Row | String |  | C |  |  | Row letter A-F (constant). |
| DC/Racks/R30/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R30/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R30/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R30/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R30/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R30/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R30/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R30/Workload | String |  | db |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R31/Row | String |  | D |  |  | Row letter A-F (constant). |
| DC/Racks/R31/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R31/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R31/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R31/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R31/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R31/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R31/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R31/Workload | String |  | batch |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R32/Row | String |  | D |  |  | Row letter A-F (constant). |
| DC/Racks/R32/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R32/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R32/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R32/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R32/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R32/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R32/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R32/Workload | String |  | batch |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R33/Row | String |  | D |  |  | Row letter A-F (constant). |
| DC/Racks/R33/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R33/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R33/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R33/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R33/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R33/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R33/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R33/Workload | String |  | ml |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R34/Row | String |  | D |  |  | Row letter A-F (constant). |
| DC/Racks/R34/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R34/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R34/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R34/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R34/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R34/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R34/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R34/Workload | String |  | batch |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R35/Row | String |  | D |  |  | Row letter A-F (constant). |
| DC/Racks/R35/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R35/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R35/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R35/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R35/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R35/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R35/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R35/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R36/Row | String |  | D |  |  | Row letter A-F (constant). |
| DC/Racks/R36/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R36/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R36/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R36/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R36/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R36/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R36/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R36/Workload | String |  | batch |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R37/Row | String |  | D |  |  | Row letter A-F (constant). |
| DC/Racks/R37/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R37/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R37/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R37/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R37/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R37/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R37/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R37/Workload | String |  | ml |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R38/Row | String |  | D |  |  | Row letter A-F (constant). |
| DC/Racks/R38/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R38/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R38/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R38/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R38/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R38/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R38/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R38/Workload | String |  | batch |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R39/Row | String |  | D |  |  | Row letter A-F (constant). |
| DC/Racks/R39/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R39/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R39/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R39/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R39/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R39/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R39/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R39/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R40/Row | String |  | D |  |  | Row letter A-F (constant). |
| DC/Racks/R40/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R40/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R40/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R40/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R40/FeedA | String |  | A2 |  |  | A-side PDU (constant). |
| DC/Racks/R40/FeedB | String |  | B2 |  |  | B-side PDU (constant). |
| DC/Racks/R40/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R40/Workload | String |  | batch |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R41/Row | String |  | E |  |  | Row letter A-F (constant). |
| DC/Racks/R41/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R41/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R41/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R41/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R41/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R41/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R41/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R41/Workload | String |  | ml |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R42/Row | String |  | E |  |  | Row letter A-F (constant). |
| DC/Racks/R42/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R42/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R42/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R42/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R42/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R42/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R42/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R42/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R43/Row | String |  | E |  |  | Row letter A-F (constant). |
| DC/Racks/R43/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R43/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R43/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R43/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R43/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R43/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R43/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R43/Workload | String |  | ml |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R44/Row | String |  | E |  |  | Row letter A-F (constant). |
| DC/Racks/R44/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R44/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R44/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R44/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R44/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R44/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R44/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R44/Workload | String |  | batch |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R45/Row | String |  | E |  |  | Row letter A-F (constant). |
| DC/Racks/R45/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R45/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R45/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R45/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R45/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R45/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R45/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R45/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R46/Row | String |  | E |  |  | Row letter A-F (constant). |
| DC/Racks/R46/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R46/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R46/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R46/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R46/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R46/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R46/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R46/Workload | String |  | ml |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R47/Row | String |  | E |  |  | Row letter A-F (constant). |
| DC/Racks/R47/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R47/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R47/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R47/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R47/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R47/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R47/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R47/Workload | String |  | batch |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R48/Row | String |  | E |  |  | Row letter A-F (constant). |
| DC/Racks/R48/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R48/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R48/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R48/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R48/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R48/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R48/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R48/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R49/Row | String |  | E |  |  | Row letter A-F (constant). |
| DC/Racks/R49/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R49/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R49/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R49/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R49/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R49/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R49/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R49/Workload | String |  | batch |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R50/Row | String |  | E |  |  | Row letter A-F (constant). |
| DC/Racks/R50/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R50/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R50/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R50/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R50/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R50/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R50/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R50/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R51/Row | String |  | F |  |  | Row letter A-F (constant). |
| DC/Racks/R51/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R51/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R51/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R51/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R51/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R51/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R51/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R51/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R52/Row | String |  | F |  |  | Row letter A-F (constant). |
| DC/Racks/R52/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R52/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R52/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R52/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R52/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R52/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R52/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R52/Workload | String |  | db |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R53/Row | String |  | F |  |  | Row letter A-F (constant). |
| DC/Racks/R53/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R53/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R53/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R53/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R53/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R53/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R53/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R53/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R54/Row | String |  | F |  |  | Row letter A-F (constant). |
| DC/Racks/R54/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R54/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R54/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R54/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R54/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R54/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R54/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R54/Workload | String |  | db |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R55/Row | String |  | F |  |  | Row letter A-F (constant). |
| DC/Racks/R55/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R55/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R55/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R55/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R55/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R55/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R55/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R55/Workload | String |  | batch |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R56/Row | String |  | F |  |  | Row letter A-F (constant). |
| DC/Racks/R56/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R56/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R56/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R56/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R56/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R56/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R56/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R56/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R57/Row | String |  | F |  |  | Row letter A-F (constant). |
| DC/Racks/R57/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R57/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R57/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R57/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R57/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R57/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R57/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R57/Workload | String |  | idle |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R58/Row | String |  | F |  |  | Row letter A-F (constant). |
| DC/Racks/R58/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R58/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R58/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R58/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R58/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R58/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R58/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R58/Workload | String |  | db |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R59/Row | String |  | F |  |  | Row letter A-F (constant). |
| DC/Racks/R59/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R59/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R59/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R59/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R59/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R59/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R59/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R59/Workload | String |  | web |  |  | web\|batch\|db\|ml\|idle. |
| DC/Racks/R60/Row | String |  | F |  |  | Row letter A-F (constant). |
| DC/Racks/R60/PowerKW | Float8 | kW | 6 |  | OnChange, deadband 0.2 | Rack IT power draw. |
| DC/Racks/R60/InletTempC | Float8 | °C | 21.5 | InletHigh: AboveValue 27, High ("ASHRAE recommended exceeded")<br>InletCritical: AboveValue 32, Critical ("Rack inlet above 32 C (ASHRAE A1 allowable)") | OnChange, deadband 0.2 | Server inlet (cold aisle) temperature. |
| DC/Racks/R60/OutletTempC | Float8 | °C | 31 |  |  | Server exhaust (hot aisle) temperature. |
| DC/Racks/R60/UtilPct | Float8 | % | 55 |  |  | Compute utilisation. |
| DC/Racks/R60/FeedA | String |  | A3 |  |  | A-side PDU (constant). |
| DC/Racks/R60/FeedB | String |  | B3 |  |  | B-side PDU (constant). |
| DC/Racks/R60/Online | Boolean |  | true |  |  | Rack has power from at least one feed. |
| DC/Racks/R60/Workload | String |  | batch |  |  | web\|batch\|db\|ml\|idle. |
| DC/Cooling/Chiller/1/State | String |  | RUN |  |  | RUN\|STANDBY\|OFF. |
| DC/Cooling/Chiller/1/SupplyC | Float8 | °C | 7 |  | OnChange, deadband 0.05 | Chilled water supply temperature. |
| DC/Cooling/Chiller/1/ReturnC | Float8 | °C | 12 |  | OnChange, deadband 0.05 | Chilled water return temperature. |
| DC/Cooling/Chiller/1/KW | Float8 | kW | 50 |  | OnChange, deadband 0.3 | Electrical power of the chiller including its pump. |
| DC/Cooling/Chiller/1/COP | Float8 | ratio | 5 |  | OnChange, deadband 0.02 | Coefficient of performance (falls as outdoor temperature rises). |
| DC/Cooling/Chiller/2/State | String |  | RUN |  |  | RUN\|STANDBY\|OFF. |
| DC/Cooling/Chiller/2/SupplyC | Float8 | °C | 7 |  | OnChange, deadband 0.05 | Chilled water supply temperature. |
| DC/Cooling/Chiller/2/ReturnC | Float8 | °C | 12 |  | OnChange, deadband 0.05 | Chilled water return temperature. |
| DC/Cooling/Chiller/2/KW | Float8 | kW | 50 |  | OnChange, deadband 0.3 | Electrical power of the chiller including its pump. |
| DC/Cooling/Chiller/2/COP | Float8 | ratio | 5 |  | OnChange, deadband 0.02 | Coefficient of performance (falls as outdoor temperature rises). |
| DC/Cooling/CRAH/1/State | String |  | RUN | Fault: OnCondition {[.]State} = "FAULT", High ("CRAH 1 fault") |  | RUN\|FAULT\|OFF. |
| DC/Cooling/CRAH/1/FanPct | Float8 | % | 75 |  | OnChange, deadband 0.5 | Fan speed. |
| DC/Cooling/CRAH/1/SupplyC | Float8 | °C | 18 |  | OnChange, deadband 0.05 | Supply air temperature. |
| DC/Cooling/CRAH/1/ReturnC | Float8 | °C | 30 |  | OnChange, deadband 0.05 | Return air temperature. |
| DC/Cooling/CRAH/1/KW | Float8 | kW | 8 |  | OnChange, deadband 0.1 | Fan electrical power. |
| DC/Cooling/CRAH/1/Zone | String |  | A,B |  |  | Rows served. CRAH 4 is the shared N+1 assist unit (all rows). |
| DC/Cooling/CRAH/2/State | String |  | RUN | Fault: OnCondition {[.]State} = "FAULT", High ("CRAH 2 fault") |  | RUN\|FAULT\|OFF. |
| DC/Cooling/CRAH/2/FanPct | Float8 | % | 75 |  | OnChange, deadband 0.5 | Fan speed. |
| DC/Cooling/CRAH/2/SupplyC | Float8 | °C | 18 |  | OnChange, deadband 0.05 | Supply air temperature. |
| DC/Cooling/CRAH/2/ReturnC | Float8 | °C | 30 |  | OnChange, deadband 0.05 | Return air temperature. |
| DC/Cooling/CRAH/2/KW | Float8 | kW | 8 |  | OnChange, deadband 0.1 | Fan electrical power. |
| DC/Cooling/CRAH/2/Zone | String |  | C,D |  |  | Rows served. CRAH 4 is the shared N+1 assist unit (all rows). |
| DC/Cooling/CRAH/3/State | String |  | RUN | Fault: OnCondition {[.]State} = "FAULT", High ("CRAH 3 fault") |  | RUN\|FAULT\|OFF. |
| DC/Cooling/CRAH/3/FanPct | Float8 | % | 75 |  | OnChange, deadband 0.5 | Fan speed. |
| DC/Cooling/CRAH/3/SupplyC | Float8 | °C | 18 |  | OnChange, deadband 0.05 | Supply air temperature. |
| DC/Cooling/CRAH/3/ReturnC | Float8 | °C | 30 |  | OnChange, deadband 0.05 | Return air temperature. |
| DC/Cooling/CRAH/3/KW | Float8 | kW | 8 |  | OnChange, deadband 0.1 | Fan electrical power. |
| DC/Cooling/CRAH/3/Zone | String |  | E,F |  |  | Rows served. CRAH 4 is the shared N+1 assist unit (all rows). |
| DC/Cooling/CRAH/4/State | String |  | RUN | Fault: OnCondition {[.]State} = "FAULT", High ("CRAH 4 fault") |  | RUN\|FAULT\|OFF. |
| DC/Cooling/CRAH/4/FanPct | Float8 | % | 30 |  | OnChange, deadband 0.5 | Fan speed. |
| DC/Cooling/CRAH/4/SupplyC | Float8 | °C | 18 |  | OnChange, deadband 0.05 | Supply air temperature. |
| DC/Cooling/CRAH/4/ReturnC | Float8 | °C | 30 |  | OnChange, deadband 0.05 | Return air temperature. |
| DC/Cooling/CRAH/4/KW | Float8 | kW | 8 |  | OnChange, deadband 0.1 | Fan electrical power. |
| DC/Cooling/CRAH/4/Zone | String |  | A,B,C,D,E,F |  |  | Rows served. CRAH 4 is the shared N+1 assist unit (all rows). |
| DC/Cooling/Loop/FlowLps | Float8 | L/s | 22 |  | OnChange, deadband 0.1 | Chilled water loop flow. |
| DC/Cooling/Loop/DeltaT | Float8 | K | 5 |  | OnChange, deadband 0.05 | Chilled water loop temperature rise. |
| DC/_Sim_/Enabled | Boolean |  | true |  |  | Master switch for the dc_sim timer. |
| DC/_Sim_/Scenario | String |  | normal |  |  | normal\|utility_loss\|crah_failure\|rack_migration. |
| DC/_Sim_/ScenarioStep | Int4 | step | 0 |  |  | Progress marker of the running scenario (see README). |
| DC/_Sim_/SpeedFactor | Float8 | x | 1 |  |  | Simulated seconds per real second; all time constants scale with it. |
| DC/_Sim_/Seed | Int4 | seed | 53 |  |  | Random seed for the noise. |
| DC/_Sim_/TickCount | Int4 | ticks | 0 |  |  | Ticks executed. |
| DC/_Sim_/LastTickMs | Int4 | ms | 0 |  |  | Duration of the last tick's read + compute (the write follows; see README). |
| DC/_Sim_/WorkloadProfile | String |  | diurnal |  |  | diurnal\|flat\|bursty. |
| DC/_Sim_/Fault/CRAH | Int4 | unit | 0 |  |  | CRAH unit (1-4) forced into FAULT; 0 = none. |
| DC/_Sim_/Fault/UtilityOut | Boolean |  | false |  |  | Utility feed forced out. |
| DC/_Sim_/LastError | String |  | "" |  |  | Last timer error; cleared after 30 clean ticks. |
| DC/_Sim_/State/LastEpochMs | Int8 | ms | 0 |  |  | Epoch time of the previous tick (for dt). |
| DC/_Sim_/State/OkStreak | Int4 | ticks | 0 |  |  | Clean ticks since the last error. |
| DC/_Sim_/State/ScenarioApplied | String |  | normal |  |  | Scenario the timer last applied. |
| DC/_Sim_/State/ScenarioClock | Float8 | s | 0 |  |  | Simulated seconds since the scenario was applied. |
| DC/_Sim_/State/RowScale/A | Float8 | x | 1 |  |  | Load multiplier of row A (rack_migration moves load between rows). |
| DC/_Sim_/State/RowScale/B | Float8 | x | 1 |  |  | Load multiplier of row B (rack_migration moves load between rows). |
| DC/_Sim_/State/RowScale/C | Float8 | x | 1 |  |  | Load multiplier of row C (rack_migration moves load between rows). |
| DC/_Sim_/State/RowScale/D | Float8 | x | 1 |  |  | Load multiplier of row D (rack_migration moves load between rows). |
| DC/_Sim_/State/RowScale/E | Float8 | x | 1 |  |  | Load multiplier of row E (rack_migration moves load between rows). |
| DC/_Sim_/State/RowScale/F | Float8 | x | 1 |  |  | Load multiplier of row F (rack_migration moves load between rows). |
| DC/_Sim_/State/UtilityLostS | Float8 | s | 0 |  |  | Seconds the utility has been out. |
| DC/_Sim_/State/UtilityStableS | Float8 | s | 0 |  |  | Seconds the utility has been back (re-transfer timer). |
| DC/_Sim_/State/GenRunS | Float8 | s | 0 |  |  | Seconds the generator has been RUNNING. |
| DC/_Sim_/State/CooldownS | Float8 | s | 0 |  |  | Seconds left of generator cooldown. |
| DC/_Sim_/State/MechPowerS | Float8 | s | 600 |  |  | Seconds the mechanical bus (chillers, CRAH) has had power. |
<!-- tag-table:end -->
