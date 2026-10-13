# sim/brewery - Craft Brewery simulation

Gateway-side simulation for demo 4 (ADR-005 Amendment A2): a craft brewery with an ISA-88 brewhouse (mill, mash tun,
lauter tun, kettle, whirlpool, wort chiller, hot and cold liquor tanks), a cellar of 12 fermenters and 4 bright tanks,
a 300 cans/min packaging line with per-machine states, reject causes and OEE, utilities (steam boiler, glycol, CO2,
air, CIP skid), quality-lab holds and a ring of 24 batch records with genealogy. A scheduler keeps 4-6 batches
overlapping. It runs inside the Ignition gateway and is steered through project-library functions called with
`POST /script/library`. Loading and installing follow `sim/README.md` (same scripts as the other demos); the tags live
under `[default]BR/`, which needs a site whose `TagPathPatterns` allow `[default]BR/**` (the `brewery` site).

```
sim/brewery/
  tags.json                         1039 tags under [default]BR/, system.tag.configure format
  project/
    timer/br_sim/                   1000 ms timer: the whole model (one main readBlocking, one writeBlocking)
    script-python/brew/code.py      library module "brew": the scenario/command API
```

    export IGNITE_URL=http://<gateway>:8088/data/ignite IGNITE_SITE=brewery IGNITE_USER=<operator> IGNITE_PASS=<secret>
    node sim/scripts/load-tags.mjs sim/brewery/tags.json
    sim/scripts/install-project.sh <ssh-host> <data>/projects/<project>/ignition brewery    # copies, restarts, waits

## Library API (`brew.<fn>`, operator tier)

Each returns `{ok, message, state}` (state is read before the timer reacts); `status()` returns the state dict only
(mode, scenario/step, speed, time, KPIs, schedule, the batch ring, every brewhouse unit, all FV/BBT, line + OEE,
utilities, active faults, pending commands, tick count, last error).

| Function | Effect |
|---|---|
| `status()` | the state dict |
| `set_scenario(name)` | `normal`, `glycol_failure`, `filler_jam`, `stuck_sparge`, `boil_over`, `contamination`, `rush_order` |
| `restore()` | clear every fault, release the line and all QA holds, 2 brews/day with the full recipe queue, speed 60, ferment acceleration 8, scenario `normal` |
| `start_batch(recipe)` | brew `Pilsner`, `IPA`, `Stout` or `Wheat` as soon as the mill and mash tun are free (refused when no fermenter is free) |
| `set_schedule(brews_per_day, recipes)` | 1-6 brews per day; `recipes` (list or comma string) is the cycling queue |
| `set_speed(f)` | 1 - 600 (default 60: one real minute per simulated hour) |
| `set_ferment_accel(x)` | 1 - 60 (default 8: extra acceleration of fermentation, conditioning and carbonation) |
| `hold_line()` / `resume_line()` | stop the packaging line (it keeps its batch) / release it |
| `changeover(fmt)` | `CAN` or `KEG` on an idle line with no batch (45 s) |
| `inject_fault(name)` / `clear_fault(name)` | `glycol_failure`, `filler_jam`, `seamer_fault`, `label_out`, `stuck_sparge`, `boil_over`, `contamination`, `co2_leak`, `air_loss`, `boiler_low`, `cip_dosing`; the five scenario faults start / end their scenario |
| `glycol_restore()` | `clear_fault("glycol_failure")` |
| `cip(unit)` | queue a CIP for an empty tank: `FV01`-`FV12`, `BBT1`-`BBT4` or `LINE` |
| `qa_release(batch)` | release a batch from `HOLD` (id `BR0007`, slot `B07` or slot number) |
| `qa_dump(batch)` | dump beer that is in a tank (batch to `DUMPED`, QA `FAIL`, tank to CIP) |

Commands write `_Sim_/*`, `_Sim_/Request/*` and `Schedule/*` tags; the timer reacts on its next tick and consumes the
`Request/*` tags (the line hold, `Request/HoldLine`, is a level and stays set until `resume_line()`).

## Model (what the timer computes each tick)

State lives only in tags (`_Sim_/State/*` plus the process tags), so a gateway restart is harmless.
`ds = SpeedFactor x real seconds since the previous tick`; `dm = ds / 60` simulated minutes. Brewhouse phases, vessel
temperatures, utilities, the clock and CIP run on `dm`. **Fermentation, conditioning and carbonation are dramatised**:
their biology runs `FermentAccel` (8) times faster than the clock, so a 5-day primary completes in 15 simulated hours
(15 real minutes at speed 60). **The packaging line runs on real seconds** (300 cans/min means 5 cans per real second);
only the shift and day boundaries follow the simulated clock. A shift is 8 simulated hours (8 real minutes).

* **Clock and schedule.** `Time/HourOfDay` starts at 05:00 on day 0; shifts DAY 06-14, SWING 14-22, NIGHT 22-06.
  `Schedule/BrewsPerDay` (2) brews are scheduled from 06:00 at a spacing of 10 / BrewsPerDay hours; the head of
  `Schedule/Queue` is brewed and moves to the back (Pilsner, IPA, Stout, Wheat). A brew starts when its time has come
  and the mill, the mash tun and a fermenter are free, so a slow lauter pushes the following starts later (the
  start is recorded in `StartHour`). The next brew always exists as a `PLANNED` record in the ring.
* **Recipes** (`BR/Recipes/<name>/*`, editable while running): mash rest temperature and minutes, boil minutes, target
  OG/FG, fermentation temperature, `FermentDays`, `ConditionDays`, yeast, IBU, package format (Stout is `KEG`), UI colour.
  A batch is 6 hl (scaled down so one batch packages in about 6 real minutes at 300 cpm: 1 690 cans).
* **Brewhouse** (unit `Phase`, `PhaseRemainingMin`, `BatchId`, `Recipe`; two batches overlap in the plant, one per
  unit, handed over in sequence). Mill `MILLING` 15 min; mash tun `MASH_IN` 10, `MASH_REST` (recipe), `MASH_OUT` 10,
  `WAIT_LAUTER`; lauter tun `VORLAUF` 15, `RUNOFF` (progress-driven, 90 min at full flow, 8.3 L/min), `WAIT_KETTLE`;
  kettle `HEAT` 25, `BOIL` (recipe; evaporation 0.17 %/min raises the wort from 0.9 x OG to OG, steam 130 kg/h),
  `WAIT_WHIRLPOOL`, `TRANSFER` 10; whirlpool `FILL` 10, `REST` 30, `WAIT_CHILLER`, `KNOCKOUT`; chiller `PRECOOL` 5,
  `KNOCKOUT` 40 (into the batch's reserved fermenter, wort out at fermentation temperature + 0.8 C), `FLUSH` 5. Hot
  liquor draws (mash-in, sparge), cold liquor draws (knock-out) and kettle/mash steam feed the utilities. The mash
  tun's heating follows boiler pressure, so `boiler_low` makes it sag below its setpoint.
* **Fermenters.** `EMPTY` (reserved when `BatchId` is set) -> `FILLING` -> `FERMENTING` -> `DIACETYL_REST` (1 d, +2 C)
  -> `CRASH` (1 d, to 2.5 C) -> `CONDITIONING` (`ConditionDays`, 2 C) -> `TRANSFER` (30 min, to a free BBT) -> `CIP`
  -> `EMPTY`. Gravity is a logistic attenuation curve (short lag, exponential-looking drop, taper) from OG to FG, quicker
  when warm; pH falls from 5.3 to about 4.45, CO2 saturation rises, head pressure follows the phase (about 12 psi
  conditioning) and the temperature loop is a P controller on the glycol valve (jacket conductance 0.02 /min).
  `DaysInTank` counts biological days.
* **Bright tanks.** `FILLING` -> `CARBONATING` (0.8 d to the recipe's CO2 volumes) -> `READY` (`ReadyToPackage` once
  the batch's QA is `PASS`) -> `PACKAGING` -> `CIP`.
* **Packaging line.** `State` `RUNNING|IDLE|STARVED|BLOCKED|DOWN|CHANGEOVER|CIP`, reasons `NONE|FILLER_JAM|LABEL_OUT|
  CAN_SUPPLY|SEAMER_FAULT|CHANGEOVER|CIP|NO_BEER`. The line takes the oldest `READY` batch; a format change costs 45 s,
  a recipe (label) change 15 s. Running at `RatedCPM` 300 (keg runs count can-equivalents at 150) with a 6 s ramp,
  random micro-stops (about every 80 s, 4-16 s; 70 % can supply, otherwise label, seamer or filler), rejects by cause
  (fill 0.6 %, seam 0.3 %, label 0.4 %) that multiply for a while after a restart from an injected jam. Machines are
  `RUNNING`, `BLOCKED` upstream and `STARVED` downstream of the stopped one, or `FAULT`. Counters are per shift; OEE =
  availability (run / planned, planned excludes idle) x performance (packages / (rated x run time)) x quality (good /
  total). `KPI/RejectPct` is a one-minute moving window.
* **Utilities.** Boiler pressure falls with steam demand (kettle, mash, hot liquor refill, CIP, pasteuriser) and sags to
  4.5 bar on `boiler_low`; glycol load is the cooling duty over a 90 kW capacity, supply -3 C (24 C on failure, load
  pinned at 100 %); CO2 tank falls with carbonation and packaging, is topped up at 22 %, recovery follows fermentation
  activity; air 7 bar (3.5 on `air_loss`); the CIP skid cleans one tank at a time (`PRE_RINSE`, `CAUSTIC` 45 mS/cm,
  `RINSE`, `ACID`, `FINAL_RINSE`, 35 min); water and energy accumulate per simulated day.
* **Quality.** Lab samples write the batch record: end of boil (`OG`, `IBU`, wort `pH`), end of fermentation (`FG`,
  `ABV`, `pH`; `HOLD` when gravity is more than 0.9 P above target, pH under 4.15 or an infection is running) and
  before packaging (`DO`). `HOLD` blocks the transfer (and packaging); `qa_release` or `qa_dump` resolve it.
* **KPIs.** `Mode`: `QA_HOLD` > `LINE_DOWN` > `CELLAR_RISK` (glycol failure, a fermenter off by 3 C, occupancy
  above 90 %) > `RUSH` > `BREW_DAY` > `NORMAL`. `ActiveAlarms` from `system.alarm.queryStatus` under `BR`.
* **Batches.** `BR/Batches/B01..B24` is a ring: the id (`BRnnnn`), recipe, state, absolute start hour (day x 24 + hour),
  phase, fermenter, bright tank, volume, lab results, QA status, cans, pallets, yield and `Timeline`
  (`PHASE@absolute-hour,...`, one entry per phase change). The timer reads only the slots listed in
  `_Sim_/State/ActiveSlots` (a one-tag read first), which keeps the tick cost independent of the ring size.

### Scenarios and `ScenarioStep`

* `glycol_failure` (until `glycol_restore()`, or automatically after 8 simulated hours): 1 chiller down (supply rises
  to 24 C, load 100 %, fermenters warm and their pressure rises, wort-out temperature rises); 2 restored, supply
  recovering; the scenario then returns to `normal`.
* `filler_jam`: 1 filler jammed (line `DOWN`, reason `FILLER_JAM`, cleared by `clear_fault("filler_jam")` or after
  2 minutes of line time); 2 restarted, rejects x9 decaying with a 40 s time constant; ends when they have decayed.
* `stuck_sparge`: 1 the lauter bed is compacted (run-off drops to 12 %, turbidity up, `LauterStuck` alarm) until
  cleared or 200 simulated minutes; 2 raked, flow recovering; the mash tun holds its next batch and later starts slip.
* `boil_over`: 1 armed; a batch in the boil gets steam 560 kg/h, risk and foam rise to 100 %, the kettle level
  overshoots; 2 alarm (`BoilOverRisk` > 80) for 8 simulated minutes, then the operator cuts the steam; 3 foam
  settling; ends when the risk is under 35 %.
* `contamination`: picks the fermenting tank furthest along; 2 pH falls, gravity stalls, pressure rises, the batch goes
  `HOLD` after about 20 simulated minutes (blocking its transfer); ends when the batch is released or dumped.
* `rush_order` (until another scenario is chosen): 3 brews/day, the first one starts at once, the shift target assumes
  two shifts; `BrewsPerDay` returns to its previous value afterwards.

## Tags

Units are on every numeric tag. `Recipes/*` and `Schedule/*` can be edited while running. `_Sim_/Fault/*` are the fault
switches (the library covers them), `_Sim_/Request/*` the command tags, `_Sim_/State/*` (131 tags) the engine state
(phase lengths, fermenter kinetics, line counters) that makes the timer restart-safe. `Batches/Bnn/Timeline` is an
extra tag beyond the task's list.

`_Sim_/LastTickMs` is the **duration in milliseconds** of the last tick's read + compute (the write follows it and is
logged separately every 60 ticks: `br_sim tick N: read+compute X ms, write Y ms (Z tags)`).
Measured on the lab gateway (about 600 keys plus 19 per active batch slot read, 22-128 changed tags written per tick):
read+compute 9-30 ms (mean 16 ms over the 82 logged ticks; `LastTickMs` max 36 over 1 645 samples in 82 minutes),
write 1-9 ms (mean 2 ms).

The model is 1 039 tags, well above the ADR's "about 550", because the batch ring is 24 slots x 19 tags (456) and the
engine state is 131 tags; the two-step read (one tag, then the main read) is deliberate. Both are accepted.

The noise generator is a small xorshift class inside the timer (see sim/microgrid for why `random.Random` is avoided).

### History and the historian load

Provider `IgniteHistorian`, 472 tags with history. Vessel and fermenter temperatures, gravity, pH, pressure and levels
are stored on change at a 1 s minimum with deadbands; line counts, OEE and the line state at a 1 s minimum; utilities,
CO2/DO/ABV and daily totals at a 5 s minimum; batch records (state, phase, tanks, lab results, QA, cans, yield) on
change. `GravityP` and `TempC` of a fermenter over its fermentation window give several hundred rows.

### Alarms

64 alarm definitions: mash temperature deviation (> 2 C), kettle boil-over risk (> 80 %) and level (> 97 %), lauter
stuck (run-off < 3 L/min in `RUNOFF`), per fermenter temperature deviation (> 2.5 C) and pressure (> 15 psi), glycol
supply (> 2 C) and load (> 90 %), CO2 tank (< 20 %), boiler pressure (> 9.5 and < 6.5 bar), air (< 5.5 bar), filler
jam, seamer fault, label stock out, reject rate (> 4 %), CIP caustic conductivity (< 20 mS/cm, 3 s on-delay), one QA hold per ring
slot and cellar occupancy (> 90 %). The tag load itself produces one zero-length "Cleared, Acknowledged" event per
alarm.

## Tag model

Generated from `tags.json` by `node sim/scripts/tag-table.mjs sim/brewery/tags.json --write sim/brewery/README.md`.

<!-- tag-table:start -->
1039 tags, 472 with history, 64 alarms.

| Tag | Type | Unit | Initial | Alarms | History | Description |
|---|---|---|---|---|---|---|
| BR/Time/HourOfDay | Float8 | h | 5 |  |  | Simulated clock hour of day, 0-24 (advances SpeedFactor x real time). |
| BR/Time/DayIndex | Int4 |  | 0 |  |  | Simulated day counter (day 0 = start of the simulation). |
| BR/Time/Shift | String |  | NIGHT |  |  | DAY (06-14) \| SWING (14-22) \| NIGHT (22-06). |
| BR/Time/BrewDayActive | Boolean |  | false |  |  | True while brews are scheduled for today or the brewhouse is occupied. |
| BR/Recipes/Pilsner/MashTempC | Float8 | °C | 65 |  |  | Pilsner: main mash rest temperature. |
| BR/Recipes/Pilsner/MashMin | Int4 | min | 60 |  |  | Pilsner: main mash rest duration (simulated minutes). |
| BR/Recipes/Pilsner/BoilMin | Int4 | min | 90 |  |  | Pilsner: boil duration (simulated minutes). |
| BR/Recipes/Pilsner/TargetOGP | Float8 | °P | 12 |  |  | Pilsner: target original gravity. |
| BR/Recipes/Pilsner/TargetFGP | Float8 | °P | 2.6 |  |  | Pilsner: target final gravity. |
| BR/Recipes/Pilsner/FermentTempC | Float8 | °C | 10 |  |  | Pilsner: primary fermentation temperature. |
| BR/Recipes/Pilsner/FermentDays | Float8 | d | 7 |  |  | Pilsner: primary fermentation time in biological days (divided by FermentAccel for the clock). |
| BR/Recipes/Pilsner/ConditionDays | Float8 | d | 8 |  |  | Pilsner: cold conditioning time in biological days. |
| BR/Recipes/Pilsner/Yeast | String |  | W-34/70 Lager |  |  | Pilsner: yeast strain. |
| BR/Recipes/Pilsner/IBU | Float8 | IBU | 35 |  |  | Pilsner: target bitterness. |
| BR/Recipes/Pilsner/Format | String |  | CAN |  |  | Pilsner: package format, CAN or KEG. |
| BR/Recipes/Pilsner/Color | String |  | #E8C547 |  |  | Pilsner: display colour for the UI (hex). |
| BR/Recipes/IPA/MashTempC | Float8 | °C | 66 |  |  | IPA: main mash rest temperature. |
| BR/Recipes/IPA/MashMin | Int4 | min | 60 |  |  | IPA: main mash rest duration (simulated minutes). |
| BR/Recipes/IPA/BoilMin | Int4 | min | 60 |  |  | IPA: boil duration (simulated minutes). |
| BR/Recipes/IPA/TargetOGP | Float8 | °P | 15 |  |  | IPA: target original gravity. |
| BR/Recipes/IPA/TargetFGP | Float8 | °P | 3.6 |  |  | IPA: target final gravity. |
| BR/Recipes/IPA/FermentTempC | Float8 | °C | 19 |  |  | IPA: primary fermentation temperature. |
| BR/Recipes/IPA/FermentDays | Float8 | d | 5 |  |  | IPA: primary fermentation time in biological days (divided by FermentAccel for the clock). |
| BR/Recipes/IPA/ConditionDays | Float8 | d | 4 |  |  | IPA: cold conditioning time in biological days. |
| BR/Recipes/IPA/Yeast | String |  | US-05 Ale |  |  | IPA: yeast strain. |
| BR/Recipes/IPA/IBU | Float8 | IBU | 65 |  |  | IPA: target bitterness. |
| BR/Recipes/IPA/Format | String |  | CAN |  |  | IPA: package format, CAN or KEG. |
| BR/Recipes/IPA/Color | String |  | #D9822B |  |  | IPA: display colour for the UI (hex). |
| BR/Recipes/Stout/MashTempC | Float8 | °C | 68 |  |  | Stout: main mash rest temperature. |
| BR/Recipes/Stout/MashMin | Int4 | min | 70 |  |  | Stout: main mash rest duration (simulated minutes). |
| BR/Recipes/Stout/BoilMin | Int4 | min | 60 |  |  | Stout: boil duration (simulated minutes). |
| BR/Recipes/Stout/TargetOGP | Float8 | °P | 14.5 |  |  | Stout: target original gravity. |
| BR/Recipes/Stout/TargetFGP | Float8 | °P | 4.4 |  |  | Stout: target final gravity. |
| BR/Recipes/Stout/FermentTempC | Float8 | °C | 18 |  |  | Stout: primary fermentation temperature. |
| BR/Recipes/Stout/FermentDays | Float8 | d | 5 |  |  | Stout: primary fermentation time in biological days (divided by FermentAccel for the clock). |
| BR/Recipes/Stout/ConditionDays | Float8 | d | 5 |  |  | Stout: cold conditioning time in biological days. |
| BR/Recipes/Stout/Yeast | String |  | London Ale III |  |  | Stout: yeast strain. |
| BR/Recipes/Stout/IBU | Float8 | IBU | 30 |  |  | Stout: target bitterness. |
| BR/Recipes/Stout/Format | String |  | KEG |  |  | Stout: package format, CAN or KEG. |
| BR/Recipes/Stout/Color | String |  | #2B1B12 |  |  | Stout: display colour for the UI (hex). |
| BR/Recipes/Wheat/MashTempC | Float8 | °C | 64 |  |  | Wheat: main mash rest temperature. |
| BR/Recipes/Wheat/MashMin | Int4 | min | 50 |  |  | Wheat: main mash rest duration (simulated minutes). |
| BR/Recipes/Wheat/BoilMin | Int4 | min | 60 |  |  | Wheat: boil duration (simulated minutes). |
| BR/Recipes/Wheat/TargetOGP | Float8 | °P | 12.5 |  |  | Wheat: target original gravity. |
| BR/Recipes/Wheat/TargetFGP | Float8 | °P | 3 |  |  | Wheat: target final gravity. |
| BR/Recipes/Wheat/FermentTempC | Float8 | °C | 20 |  |  | Wheat: primary fermentation temperature. |
| BR/Recipes/Wheat/FermentDays | Float8 | d | 4 |  |  | Wheat: primary fermentation time in biological days (divided by FermentAccel for the clock). |
| BR/Recipes/Wheat/ConditionDays | Float8 | d | 3 |  |  | Wheat: cold conditioning time in biological days. |
| BR/Recipes/Wheat/Yeast | String |  | Weizen Ale |  |  | Wheat: yeast strain. |
| BR/Recipes/Wheat/IBU | Float8 | IBU | 14 |  |  | Wheat: target bitterness. |
| BR/Recipes/Wheat/Format | String |  | CAN |  |  | Wheat: package format, CAN or KEG. |
| BR/Recipes/Wheat/Color | String |  | #F2D98A |  |  | Wheat: display colour for the UI (hex). |
| BR/Brewhouse/Mill/Phase | String |  | IDLE |  | OnChange | Mill ISA-88 phase: IDLE \| MILLING \| WAIT_MASH. |
| BR/Brewhouse/Mill/PhaseRemainingMin | Float8 | min | 0 |  |  | Mill: simulated minutes left in the present phase (estimate during RUNOFF). |
| BR/Brewhouse/Mill/BatchId | String |  | "" |  |  | Mill: batch it holds (empty when idle). |
| BR/Brewhouse/Mill/Recipe | String |  | "" |  |  | Mill: recipe of that batch. |
| BR/Brewhouse/Mill/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | Mill fill level. |
| BR/Brewhouse/Mill/TempC | Float8 | °C | 20 |  |  | Mill: ambient (grist) temperature. |
| BR/Brewhouse/Mill/SetpointC | Float8 | °C | 20 |  |  | Mill temperature setpoint. |
| BR/Brewhouse/Mill/Fault | Boolean |  | false |  |  | Mill unit fault / abnormal condition. |
| BR/Brewhouse/MashTun/Phase | String |  | IDLE |  | OnChange | MashTun ISA-88 phase: IDLE \| MASH_IN \| MASH_REST \| MASH_OUT \| WAIT_LAUTER. |
| BR/Brewhouse/MashTun/PhaseRemainingMin | Float8 | min | 0 |  |  | MashTun: simulated minutes left in the present phase (estimate during RUNOFF). |
| BR/Brewhouse/MashTun/BatchId | String |  | "" |  |  | MashTun: batch it holds (empty when idle). |
| BR/Brewhouse/MashTun/Recipe | String |  | "" |  |  | MashTun: recipe of that batch. |
| BR/Brewhouse/MashTun/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | MashTun fill level. |
| BR/Brewhouse/MashTun/TempC | Float8 | °C | 20 | MashTempDeviation: OnCondition {[.]Phase} = "MASH_REST" && abs({[.]TempC} - {[.]SetpointC}) > 2.0, High ("Mash temperature deviates more than 2 C from the rest setpoint") | OnChange, deadband 0.2 | MashTun temperature. |
| BR/Brewhouse/MashTun/SetpointC | Float8 | °C | 20 |  |  | MashTun temperature setpoint. |
| BR/Brewhouse/MashTun/Fault | Boolean |  | false |  |  | MashTun unit fault / abnormal condition. |
| BR/Brewhouse/MashTun/pH | Float8 | pH | 5.4 |  | OnChange, deadband 0.02 | Mash pH. |
| BR/Brewhouse/MashTun/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.1 | Mash (first wort) gravity. |
| BR/Brewhouse/MashTun/RakeRPM | Float8 | rpm | 0 |  |  | Mash rake speed. |
| BR/Brewhouse/LauterTun/Phase | String |  | IDLE |  | OnChange | LauterTun ISA-88 phase: IDLE \| VORLAUF \| RUNOFF \| WAIT_KETTLE. |
| BR/Brewhouse/LauterTun/PhaseRemainingMin | Float8 | min | 0 |  |  | LauterTun: simulated minutes left in the present phase (estimate during RUNOFF). |
| BR/Brewhouse/LauterTun/BatchId | String |  | "" |  |  | LauterTun: batch it holds (empty when idle). |
| BR/Brewhouse/LauterTun/Recipe | String |  | "" |  |  | LauterTun: recipe of that batch. |
| BR/Brewhouse/LauterTun/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | LauterTun fill level. |
| BR/Brewhouse/LauterTun/TempC | Float8 | °C | 20 |  | OnChange, deadband 0.2 | LauterTun temperature. |
| BR/Brewhouse/LauterTun/SetpointC | Float8 | °C | 20 |  |  | LauterTun temperature setpoint. |
| BR/Brewhouse/LauterTun/Fault | Boolean |  | false |  |  | LauterTun unit fault / abnormal condition. |
| BR/Brewhouse/LauterTun/RunoffLpm | Float8 | L/min | 0 | LauterStuck: OnCondition {[.]Phase} = "RUNOFF" && {[.]RunoffLpm} < 3.0, High ("Lauter run-off stuck (flow low)") | OnChange, deadband 0.2 | Wort run-off flow. |
| BR/Brewhouse/LauterTun/TurbidityNTU | Float8 | NTU | 0 |  | OnChange, deadband 2 | Run-off turbidity. |
| BR/Brewhouse/LauterTun/SpargeLpm | Float8 | L/min | 0 |  |  | Sparge water flow. |
| BR/Brewhouse/Kettle/Phase | String |  | IDLE |  | OnChange | Kettle ISA-88 phase: IDLE \| HEAT \| BOIL \| WAIT_WHIRLPOOL \| TRANSFER. |
| BR/Brewhouse/Kettle/PhaseRemainingMin | Float8 | min | 0 |  |  | Kettle: simulated minutes left in the present phase (estimate during RUNOFF). |
| BR/Brewhouse/Kettle/BatchId | String |  | "" |  |  | Kettle: batch it holds (empty when idle). |
| BR/Brewhouse/Kettle/Recipe | String |  | "" |  |  | Kettle: recipe of that batch. |
| BR/Brewhouse/Kettle/LevelPct | Float8 | % | 0 | LevelHigh: AboveValue 97, Medium ("Kettle level above 97 %") | OnChange, deadband 0.5 | Kettle fill level. |
| BR/Brewhouse/Kettle/TempC | Float8 | °C | 20 |  | OnChange, deadband 0.2 | Kettle temperature. |
| BR/Brewhouse/Kettle/SetpointC | Float8 | °C | 20 |  |  | Kettle temperature setpoint. |
| BR/Brewhouse/Kettle/Fault | Boolean |  | false |  |  | Kettle unit fault / abnormal condition. |
| BR/Brewhouse/Kettle/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.05 | Kettle wort gravity (rises with evaporation). |
| BR/Brewhouse/Kettle/SteamKgph | Float8 | kg/h | 0 |  | OnChange, deadband 10 | Kettle steam demand. |
| BR/Brewhouse/Kettle/EvapPct | Float8 | % | 0 |  |  | Cumulative evaporation this boil. |
| BR/Brewhouse/Kettle/FoamLevelPct | Float8 | % | 0 |  | OnChange, deadband 1 | Foam height in the kettle. |
| BR/Brewhouse/Kettle/BoilOverRisk | Float8 | % | 0 | BoilOverRisk: AboveValue 80, High ("Kettle boil-over risk above 80 %") | OnChange, deadband 1 | Boil-over risk index. |
| BR/Brewhouse/Whirlpool/Phase | String |  | IDLE |  | OnChange | Whirlpool ISA-88 phase: IDLE \| FILL \| REST \| WAIT_CHILLER \| KNOCKOUT. |
| BR/Brewhouse/Whirlpool/PhaseRemainingMin | Float8 | min | 0 |  |  | Whirlpool: simulated minutes left in the present phase (estimate during RUNOFF). |
| BR/Brewhouse/Whirlpool/BatchId | String |  | "" |  |  | Whirlpool: batch it holds (empty when idle). |
| BR/Brewhouse/Whirlpool/Recipe | String |  | "" |  |  | Whirlpool: recipe of that batch. |
| BR/Brewhouse/Whirlpool/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | Whirlpool fill level. |
| BR/Brewhouse/Whirlpool/TempC | Float8 | °C | 20 |  | OnChange, deadband 0.2 | Whirlpool temperature. |
| BR/Brewhouse/Whirlpool/SetpointC | Float8 | °C | 20 |  |  | Whirlpool temperature setpoint. |
| BR/Brewhouse/Whirlpool/Fault | Boolean |  | false |  |  | Whirlpool unit fault / abnormal condition. |
| BR/Brewhouse/Whirlpool/RestMin | Float8 | min | 0 |  |  | Whirlpool rest minutes remaining. |
| BR/Brewhouse/Whirlpool/TrubPct | Float8 | % | 0 |  |  | Trub cone height. |
| BR/Brewhouse/Chiller/Phase | String |  | IDLE |  | OnChange | Chiller ISA-88 phase: IDLE \| PRECOOL \| KNOCKOUT \| FLUSH. |
| BR/Brewhouse/Chiller/PhaseRemainingMin | Float8 | min | 0 |  |  | Chiller: simulated minutes left in the present phase (estimate during RUNOFF). |
| BR/Brewhouse/Chiller/BatchId | String |  | "" |  |  | Chiller: batch it holds (empty when idle). |
| BR/Brewhouse/Chiller/Recipe | String |  | "" |  |  | Chiller: recipe of that batch. |
| BR/Brewhouse/Chiller/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | Chiller fill level. |
| BR/Brewhouse/Chiller/TempC | Float8 | °C | 20 |  | OnChange, deadband 0.2 | Chiller temperature. |
| BR/Brewhouse/Chiller/SetpointC | Float8 | °C | 20 |  |  | Chiller temperature setpoint. |
| BR/Brewhouse/Chiller/Fault | Boolean |  | false |  |  | Chiller unit fault / abnormal condition. |
| BR/Brewhouse/Chiller/WortOutC | Float8 | °C | 20 |  | OnChange, deadband 0.2 | Wort-out temperature after the heat exchanger. |
| BR/Brewhouse/Chiller/FlowLpm | Float8 | L/min | 0 |  | OnChange, deadband 0.5 | Knock-out flow. |
| BR/Brewhouse/Chiller/GlycolValvePct | Float8 | % | 0 |  |  | Glycol valve on the wort chiller. |
| BR/Brewhouse/HLT/LevelPct | Float8 | % | 90 |  | OnChange, deadband 0.5 | Hot liquor tank level. |
| BR/Brewhouse/HLT/TempC | Float8 | °C | 78 |  | OnChange, deadband 0.2 | Hot liquor tank temperature. |
| BR/Brewhouse/CLT/LevelPct | Float8 | % | 90 |  | OnChange, deadband 0.5 | Cold liquor tank level. |
| BR/Brewhouse/CLT/TempC | Float8 | °C | 4 |  | OnChange, deadband 0.2 | Cold liquor tank temperature. |
| BR/Cellar/FV01/BatchId | String |  | "" |  | OnChange | FV01: batch in the tank (also set while the tank is reserved for a coming brew). |
| BR/Cellar/FV01/Recipe | String |  | "" |  |  | FV01: recipe. |
| BR/Cellar/FV01/Phase | String |  | EMPTY |  |  | FV01: EMPTY \| FILLING \| FERMENTING \| DIACETYL_REST \| CRASH \| CONDITIONING \| TRANSFER \| CIP. |
| BR/Cellar/FV01/TempC | Float8 | °C | 15 | TempDeviation: OnCondition {[.]Phase} != "EMPTY" && {[.]Phase} != "CIP" && abs({[.]TempC} - {[.]SetpointC}) > 2.5, High ("FV01 temperature deviates more than 2.5 C from setpoint") | OnChange, deadband 0.05 | FV01 temperature. |
| BR/Cellar/FV01/SetpointC | Float8 | °C | 15 |  |  | FV01 temperature setpoint (ramps with the phase). |
| BR/Cellar/FV01/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.01 | FV01 gravity (plato). |
| BR/Cellar/FV01/pH | Float8 | pH | 0 |  | OnChange, deadband 0.01 | FV01 pH. |
| BR/Cellar/FV01/DOppb | Float8 | ppb | 0 |  | OnChange, deadband 5 | FV01 dissolved oxygen. |
| BR/Cellar/FV01/PressurePSI | Float8 | psi | 0 | PressureHigh: AboveValue 15, High ("FV01 pressure above 15 psi") | OnChange, deadband 0.1 | FV01 head pressure. |
| BR/Cellar/FV01/CO2VolPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV01 dissolved CO2 as percent of saturation. |
| BR/Cellar/FV01/ABVEst | Float8 | % | 0 |  | OnChange, deadband 0.02 | FV01 estimated alcohol by volume. |
| BR/Cellar/FV01/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV01 fill level. |
| BR/Cellar/FV01/DaysInTank | Float8 | d | 0 |  | OnChange, deadband 0.01 | FV01 biological days since filling started. |
| BR/Cellar/FV01/GlycolValvePct | Float8 | % | 0 |  | OnChange, deadband 1 | FV01 glycol jacket valve. |
| BR/Cellar/FV01/Fault | Boolean |  | false |  |  | FV01 temperature out of control or contamination. |
| BR/Cellar/FV02/BatchId | String |  | "" |  | OnChange | FV02: batch in the tank (also set while the tank is reserved for a coming brew). |
| BR/Cellar/FV02/Recipe | String |  | "" |  |  | FV02: recipe. |
| BR/Cellar/FV02/Phase | String |  | EMPTY |  |  | FV02: EMPTY \| FILLING \| FERMENTING \| DIACETYL_REST \| CRASH \| CONDITIONING \| TRANSFER \| CIP. |
| BR/Cellar/FV02/TempC | Float8 | °C | 15 | TempDeviation: OnCondition {[.]Phase} != "EMPTY" && {[.]Phase} != "CIP" && abs({[.]TempC} - {[.]SetpointC}) > 2.5, High ("FV02 temperature deviates more than 2.5 C from setpoint") | OnChange, deadband 0.05 | FV02 temperature. |
| BR/Cellar/FV02/SetpointC | Float8 | °C | 15 |  |  | FV02 temperature setpoint (ramps with the phase). |
| BR/Cellar/FV02/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.01 | FV02 gravity (plato). |
| BR/Cellar/FV02/pH | Float8 | pH | 0 |  | OnChange, deadband 0.01 | FV02 pH. |
| BR/Cellar/FV02/DOppb | Float8 | ppb | 0 |  | OnChange, deadband 5 | FV02 dissolved oxygen. |
| BR/Cellar/FV02/PressurePSI | Float8 | psi | 0 | PressureHigh: AboveValue 15, High ("FV02 pressure above 15 psi") | OnChange, deadband 0.1 | FV02 head pressure. |
| BR/Cellar/FV02/CO2VolPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV02 dissolved CO2 as percent of saturation. |
| BR/Cellar/FV02/ABVEst | Float8 | % | 0 |  | OnChange, deadband 0.02 | FV02 estimated alcohol by volume. |
| BR/Cellar/FV02/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV02 fill level. |
| BR/Cellar/FV02/DaysInTank | Float8 | d | 0 |  | OnChange, deadband 0.01 | FV02 biological days since filling started. |
| BR/Cellar/FV02/GlycolValvePct | Float8 | % | 0 |  | OnChange, deadband 1 | FV02 glycol jacket valve. |
| BR/Cellar/FV02/Fault | Boolean |  | false |  |  | FV02 temperature out of control or contamination. |
| BR/Cellar/FV03/BatchId | String |  | "" |  | OnChange | FV03: batch in the tank (also set while the tank is reserved for a coming brew). |
| BR/Cellar/FV03/Recipe | String |  | "" |  |  | FV03: recipe. |
| BR/Cellar/FV03/Phase | String |  | EMPTY |  |  | FV03: EMPTY \| FILLING \| FERMENTING \| DIACETYL_REST \| CRASH \| CONDITIONING \| TRANSFER \| CIP. |
| BR/Cellar/FV03/TempC | Float8 | °C | 15 | TempDeviation: OnCondition {[.]Phase} != "EMPTY" && {[.]Phase} != "CIP" && abs({[.]TempC} - {[.]SetpointC}) > 2.5, High ("FV03 temperature deviates more than 2.5 C from setpoint") | OnChange, deadband 0.05 | FV03 temperature. |
| BR/Cellar/FV03/SetpointC | Float8 | °C | 15 |  |  | FV03 temperature setpoint (ramps with the phase). |
| BR/Cellar/FV03/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.01 | FV03 gravity (plato). |
| BR/Cellar/FV03/pH | Float8 | pH | 0 |  | OnChange, deadband 0.01 | FV03 pH. |
| BR/Cellar/FV03/DOppb | Float8 | ppb | 0 |  | OnChange, deadband 5 | FV03 dissolved oxygen. |
| BR/Cellar/FV03/PressurePSI | Float8 | psi | 0 | PressureHigh: AboveValue 15, High ("FV03 pressure above 15 psi") | OnChange, deadband 0.1 | FV03 head pressure. |
| BR/Cellar/FV03/CO2VolPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV03 dissolved CO2 as percent of saturation. |
| BR/Cellar/FV03/ABVEst | Float8 | % | 0 |  | OnChange, deadband 0.02 | FV03 estimated alcohol by volume. |
| BR/Cellar/FV03/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV03 fill level. |
| BR/Cellar/FV03/DaysInTank | Float8 | d | 0 |  | OnChange, deadband 0.01 | FV03 biological days since filling started. |
| BR/Cellar/FV03/GlycolValvePct | Float8 | % | 0 |  | OnChange, deadband 1 | FV03 glycol jacket valve. |
| BR/Cellar/FV03/Fault | Boolean |  | false |  |  | FV03 temperature out of control or contamination. |
| BR/Cellar/FV04/BatchId | String |  | "" |  | OnChange | FV04: batch in the tank (also set while the tank is reserved for a coming brew). |
| BR/Cellar/FV04/Recipe | String |  | "" |  |  | FV04: recipe. |
| BR/Cellar/FV04/Phase | String |  | EMPTY |  |  | FV04: EMPTY \| FILLING \| FERMENTING \| DIACETYL_REST \| CRASH \| CONDITIONING \| TRANSFER \| CIP. |
| BR/Cellar/FV04/TempC | Float8 | °C | 15 | TempDeviation: OnCondition {[.]Phase} != "EMPTY" && {[.]Phase} != "CIP" && abs({[.]TempC} - {[.]SetpointC}) > 2.5, High ("FV04 temperature deviates more than 2.5 C from setpoint") | OnChange, deadband 0.05 | FV04 temperature. |
| BR/Cellar/FV04/SetpointC | Float8 | °C | 15 |  |  | FV04 temperature setpoint (ramps with the phase). |
| BR/Cellar/FV04/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.01 | FV04 gravity (plato). |
| BR/Cellar/FV04/pH | Float8 | pH | 0 |  | OnChange, deadband 0.01 | FV04 pH. |
| BR/Cellar/FV04/DOppb | Float8 | ppb | 0 |  | OnChange, deadband 5 | FV04 dissolved oxygen. |
| BR/Cellar/FV04/PressurePSI | Float8 | psi | 0 | PressureHigh: AboveValue 15, High ("FV04 pressure above 15 psi") | OnChange, deadband 0.1 | FV04 head pressure. |
| BR/Cellar/FV04/CO2VolPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV04 dissolved CO2 as percent of saturation. |
| BR/Cellar/FV04/ABVEst | Float8 | % | 0 |  | OnChange, deadband 0.02 | FV04 estimated alcohol by volume. |
| BR/Cellar/FV04/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV04 fill level. |
| BR/Cellar/FV04/DaysInTank | Float8 | d | 0 |  | OnChange, deadband 0.01 | FV04 biological days since filling started. |
| BR/Cellar/FV04/GlycolValvePct | Float8 | % | 0 |  | OnChange, deadband 1 | FV04 glycol jacket valve. |
| BR/Cellar/FV04/Fault | Boolean |  | false |  |  | FV04 temperature out of control or contamination. |
| BR/Cellar/FV05/BatchId | String |  | "" |  | OnChange | FV05: batch in the tank (also set while the tank is reserved for a coming brew). |
| BR/Cellar/FV05/Recipe | String |  | "" |  |  | FV05: recipe. |
| BR/Cellar/FV05/Phase | String |  | EMPTY |  |  | FV05: EMPTY \| FILLING \| FERMENTING \| DIACETYL_REST \| CRASH \| CONDITIONING \| TRANSFER \| CIP. |
| BR/Cellar/FV05/TempC | Float8 | °C | 15 | TempDeviation: OnCondition {[.]Phase} != "EMPTY" && {[.]Phase} != "CIP" && abs({[.]TempC} - {[.]SetpointC}) > 2.5, High ("FV05 temperature deviates more than 2.5 C from setpoint") | OnChange, deadband 0.05 | FV05 temperature. |
| BR/Cellar/FV05/SetpointC | Float8 | °C | 15 |  |  | FV05 temperature setpoint (ramps with the phase). |
| BR/Cellar/FV05/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.01 | FV05 gravity (plato). |
| BR/Cellar/FV05/pH | Float8 | pH | 0 |  | OnChange, deadband 0.01 | FV05 pH. |
| BR/Cellar/FV05/DOppb | Float8 | ppb | 0 |  | OnChange, deadband 5 | FV05 dissolved oxygen. |
| BR/Cellar/FV05/PressurePSI | Float8 | psi | 0 | PressureHigh: AboveValue 15, High ("FV05 pressure above 15 psi") | OnChange, deadband 0.1 | FV05 head pressure. |
| BR/Cellar/FV05/CO2VolPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV05 dissolved CO2 as percent of saturation. |
| BR/Cellar/FV05/ABVEst | Float8 | % | 0 |  | OnChange, deadband 0.02 | FV05 estimated alcohol by volume. |
| BR/Cellar/FV05/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV05 fill level. |
| BR/Cellar/FV05/DaysInTank | Float8 | d | 0 |  | OnChange, deadband 0.01 | FV05 biological days since filling started. |
| BR/Cellar/FV05/GlycolValvePct | Float8 | % | 0 |  | OnChange, deadband 1 | FV05 glycol jacket valve. |
| BR/Cellar/FV05/Fault | Boolean |  | false |  |  | FV05 temperature out of control or contamination. |
| BR/Cellar/FV06/BatchId | String |  | "" |  | OnChange | FV06: batch in the tank (also set while the tank is reserved for a coming brew). |
| BR/Cellar/FV06/Recipe | String |  | "" |  |  | FV06: recipe. |
| BR/Cellar/FV06/Phase | String |  | EMPTY |  |  | FV06: EMPTY \| FILLING \| FERMENTING \| DIACETYL_REST \| CRASH \| CONDITIONING \| TRANSFER \| CIP. |
| BR/Cellar/FV06/TempC | Float8 | °C | 15 | TempDeviation: OnCondition {[.]Phase} != "EMPTY" && {[.]Phase} != "CIP" && abs({[.]TempC} - {[.]SetpointC}) > 2.5, High ("FV06 temperature deviates more than 2.5 C from setpoint") | OnChange, deadband 0.05 | FV06 temperature. |
| BR/Cellar/FV06/SetpointC | Float8 | °C | 15 |  |  | FV06 temperature setpoint (ramps with the phase). |
| BR/Cellar/FV06/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.01 | FV06 gravity (plato). |
| BR/Cellar/FV06/pH | Float8 | pH | 0 |  | OnChange, deadband 0.01 | FV06 pH. |
| BR/Cellar/FV06/DOppb | Float8 | ppb | 0 |  | OnChange, deadband 5 | FV06 dissolved oxygen. |
| BR/Cellar/FV06/PressurePSI | Float8 | psi | 0 | PressureHigh: AboveValue 15, High ("FV06 pressure above 15 psi") | OnChange, deadband 0.1 | FV06 head pressure. |
| BR/Cellar/FV06/CO2VolPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV06 dissolved CO2 as percent of saturation. |
| BR/Cellar/FV06/ABVEst | Float8 | % | 0 |  | OnChange, deadband 0.02 | FV06 estimated alcohol by volume. |
| BR/Cellar/FV06/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV06 fill level. |
| BR/Cellar/FV06/DaysInTank | Float8 | d | 0 |  | OnChange, deadband 0.01 | FV06 biological days since filling started. |
| BR/Cellar/FV06/GlycolValvePct | Float8 | % | 0 |  | OnChange, deadband 1 | FV06 glycol jacket valve. |
| BR/Cellar/FV06/Fault | Boolean |  | false |  |  | FV06 temperature out of control or contamination. |
| BR/Cellar/FV07/BatchId | String |  | "" |  | OnChange | FV07: batch in the tank (also set while the tank is reserved for a coming brew). |
| BR/Cellar/FV07/Recipe | String |  | "" |  |  | FV07: recipe. |
| BR/Cellar/FV07/Phase | String |  | EMPTY |  |  | FV07: EMPTY \| FILLING \| FERMENTING \| DIACETYL_REST \| CRASH \| CONDITIONING \| TRANSFER \| CIP. |
| BR/Cellar/FV07/TempC | Float8 | °C | 15 | TempDeviation: OnCondition {[.]Phase} != "EMPTY" && {[.]Phase} != "CIP" && abs({[.]TempC} - {[.]SetpointC}) > 2.5, High ("FV07 temperature deviates more than 2.5 C from setpoint") | OnChange, deadband 0.05 | FV07 temperature. |
| BR/Cellar/FV07/SetpointC | Float8 | °C | 15 |  |  | FV07 temperature setpoint (ramps with the phase). |
| BR/Cellar/FV07/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.01 | FV07 gravity (plato). |
| BR/Cellar/FV07/pH | Float8 | pH | 0 |  | OnChange, deadband 0.01 | FV07 pH. |
| BR/Cellar/FV07/DOppb | Float8 | ppb | 0 |  | OnChange, deadband 5 | FV07 dissolved oxygen. |
| BR/Cellar/FV07/PressurePSI | Float8 | psi | 0 | PressureHigh: AboveValue 15, High ("FV07 pressure above 15 psi") | OnChange, deadband 0.1 | FV07 head pressure. |
| BR/Cellar/FV07/CO2VolPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV07 dissolved CO2 as percent of saturation. |
| BR/Cellar/FV07/ABVEst | Float8 | % | 0 |  | OnChange, deadband 0.02 | FV07 estimated alcohol by volume. |
| BR/Cellar/FV07/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV07 fill level. |
| BR/Cellar/FV07/DaysInTank | Float8 | d | 0 |  | OnChange, deadband 0.01 | FV07 biological days since filling started. |
| BR/Cellar/FV07/GlycolValvePct | Float8 | % | 0 |  | OnChange, deadband 1 | FV07 glycol jacket valve. |
| BR/Cellar/FV07/Fault | Boolean |  | false |  |  | FV07 temperature out of control or contamination. |
| BR/Cellar/FV08/BatchId | String |  | "" |  | OnChange | FV08: batch in the tank (also set while the tank is reserved for a coming brew). |
| BR/Cellar/FV08/Recipe | String |  | "" |  |  | FV08: recipe. |
| BR/Cellar/FV08/Phase | String |  | EMPTY |  |  | FV08: EMPTY \| FILLING \| FERMENTING \| DIACETYL_REST \| CRASH \| CONDITIONING \| TRANSFER \| CIP. |
| BR/Cellar/FV08/TempC | Float8 | °C | 15 | TempDeviation: OnCondition {[.]Phase} != "EMPTY" && {[.]Phase} != "CIP" && abs({[.]TempC} - {[.]SetpointC}) > 2.5, High ("FV08 temperature deviates more than 2.5 C from setpoint") | OnChange, deadband 0.05 | FV08 temperature. |
| BR/Cellar/FV08/SetpointC | Float8 | °C | 15 |  |  | FV08 temperature setpoint (ramps with the phase). |
| BR/Cellar/FV08/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.01 | FV08 gravity (plato). |
| BR/Cellar/FV08/pH | Float8 | pH | 0 |  | OnChange, deadband 0.01 | FV08 pH. |
| BR/Cellar/FV08/DOppb | Float8 | ppb | 0 |  | OnChange, deadband 5 | FV08 dissolved oxygen. |
| BR/Cellar/FV08/PressurePSI | Float8 | psi | 0 | PressureHigh: AboveValue 15, High ("FV08 pressure above 15 psi") | OnChange, deadband 0.1 | FV08 head pressure. |
| BR/Cellar/FV08/CO2VolPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV08 dissolved CO2 as percent of saturation. |
| BR/Cellar/FV08/ABVEst | Float8 | % | 0 |  | OnChange, deadband 0.02 | FV08 estimated alcohol by volume. |
| BR/Cellar/FV08/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV08 fill level. |
| BR/Cellar/FV08/DaysInTank | Float8 | d | 0 |  | OnChange, deadband 0.01 | FV08 biological days since filling started. |
| BR/Cellar/FV08/GlycolValvePct | Float8 | % | 0 |  | OnChange, deadband 1 | FV08 glycol jacket valve. |
| BR/Cellar/FV08/Fault | Boolean |  | false |  |  | FV08 temperature out of control or contamination. |
| BR/Cellar/FV09/BatchId | String |  | "" |  | OnChange | FV09: batch in the tank (also set while the tank is reserved for a coming brew). |
| BR/Cellar/FV09/Recipe | String |  | "" |  |  | FV09: recipe. |
| BR/Cellar/FV09/Phase | String |  | EMPTY |  |  | FV09: EMPTY \| FILLING \| FERMENTING \| DIACETYL_REST \| CRASH \| CONDITIONING \| TRANSFER \| CIP. |
| BR/Cellar/FV09/TempC | Float8 | °C | 15 | TempDeviation: OnCondition {[.]Phase} != "EMPTY" && {[.]Phase} != "CIP" && abs({[.]TempC} - {[.]SetpointC}) > 2.5, High ("FV09 temperature deviates more than 2.5 C from setpoint") | OnChange, deadband 0.05 | FV09 temperature. |
| BR/Cellar/FV09/SetpointC | Float8 | °C | 15 |  |  | FV09 temperature setpoint (ramps with the phase). |
| BR/Cellar/FV09/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.01 | FV09 gravity (plato). |
| BR/Cellar/FV09/pH | Float8 | pH | 0 |  | OnChange, deadband 0.01 | FV09 pH. |
| BR/Cellar/FV09/DOppb | Float8 | ppb | 0 |  | OnChange, deadband 5 | FV09 dissolved oxygen. |
| BR/Cellar/FV09/PressurePSI | Float8 | psi | 0 | PressureHigh: AboveValue 15, High ("FV09 pressure above 15 psi") | OnChange, deadband 0.1 | FV09 head pressure. |
| BR/Cellar/FV09/CO2VolPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV09 dissolved CO2 as percent of saturation. |
| BR/Cellar/FV09/ABVEst | Float8 | % | 0 |  | OnChange, deadband 0.02 | FV09 estimated alcohol by volume. |
| BR/Cellar/FV09/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV09 fill level. |
| BR/Cellar/FV09/DaysInTank | Float8 | d | 0 |  | OnChange, deadband 0.01 | FV09 biological days since filling started. |
| BR/Cellar/FV09/GlycolValvePct | Float8 | % | 0 |  | OnChange, deadband 1 | FV09 glycol jacket valve. |
| BR/Cellar/FV09/Fault | Boolean |  | false |  |  | FV09 temperature out of control or contamination. |
| BR/Cellar/FV10/BatchId | String |  | "" |  | OnChange | FV10: batch in the tank (also set while the tank is reserved for a coming brew). |
| BR/Cellar/FV10/Recipe | String |  | "" |  |  | FV10: recipe. |
| BR/Cellar/FV10/Phase | String |  | EMPTY |  |  | FV10: EMPTY \| FILLING \| FERMENTING \| DIACETYL_REST \| CRASH \| CONDITIONING \| TRANSFER \| CIP. |
| BR/Cellar/FV10/TempC | Float8 | °C | 15 | TempDeviation: OnCondition {[.]Phase} != "EMPTY" && {[.]Phase} != "CIP" && abs({[.]TempC} - {[.]SetpointC}) > 2.5, High ("FV10 temperature deviates more than 2.5 C from setpoint") | OnChange, deadband 0.05 | FV10 temperature. |
| BR/Cellar/FV10/SetpointC | Float8 | °C | 15 |  |  | FV10 temperature setpoint (ramps with the phase). |
| BR/Cellar/FV10/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.01 | FV10 gravity (plato). |
| BR/Cellar/FV10/pH | Float8 | pH | 0 |  | OnChange, deadband 0.01 | FV10 pH. |
| BR/Cellar/FV10/DOppb | Float8 | ppb | 0 |  | OnChange, deadband 5 | FV10 dissolved oxygen. |
| BR/Cellar/FV10/PressurePSI | Float8 | psi | 0 | PressureHigh: AboveValue 15, High ("FV10 pressure above 15 psi") | OnChange, deadband 0.1 | FV10 head pressure. |
| BR/Cellar/FV10/CO2VolPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV10 dissolved CO2 as percent of saturation. |
| BR/Cellar/FV10/ABVEst | Float8 | % | 0 |  | OnChange, deadband 0.02 | FV10 estimated alcohol by volume. |
| BR/Cellar/FV10/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV10 fill level. |
| BR/Cellar/FV10/DaysInTank | Float8 | d | 0 |  | OnChange, deadband 0.01 | FV10 biological days since filling started. |
| BR/Cellar/FV10/GlycolValvePct | Float8 | % | 0 |  | OnChange, deadband 1 | FV10 glycol jacket valve. |
| BR/Cellar/FV10/Fault | Boolean |  | false |  |  | FV10 temperature out of control or contamination. |
| BR/Cellar/FV11/BatchId | String |  | "" |  | OnChange | FV11: batch in the tank (also set while the tank is reserved for a coming brew). |
| BR/Cellar/FV11/Recipe | String |  | "" |  |  | FV11: recipe. |
| BR/Cellar/FV11/Phase | String |  | EMPTY |  |  | FV11: EMPTY \| FILLING \| FERMENTING \| DIACETYL_REST \| CRASH \| CONDITIONING \| TRANSFER \| CIP. |
| BR/Cellar/FV11/TempC | Float8 | °C | 15 | TempDeviation: OnCondition {[.]Phase} != "EMPTY" && {[.]Phase} != "CIP" && abs({[.]TempC} - {[.]SetpointC}) > 2.5, High ("FV11 temperature deviates more than 2.5 C from setpoint") | OnChange, deadband 0.05 | FV11 temperature. |
| BR/Cellar/FV11/SetpointC | Float8 | °C | 15 |  |  | FV11 temperature setpoint (ramps with the phase). |
| BR/Cellar/FV11/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.01 | FV11 gravity (plato). |
| BR/Cellar/FV11/pH | Float8 | pH | 0 |  | OnChange, deadband 0.01 | FV11 pH. |
| BR/Cellar/FV11/DOppb | Float8 | ppb | 0 |  | OnChange, deadband 5 | FV11 dissolved oxygen. |
| BR/Cellar/FV11/PressurePSI | Float8 | psi | 0 | PressureHigh: AboveValue 15, High ("FV11 pressure above 15 psi") | OnChange, deadband 0.1 | FV11 head pressure. |
| BR/Cellar/FV11/CO2VolPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV11 dissolved CO2 as percent of saturation. |
| BR/Cellar/FV11/ABVEst | Float8 | % | 0 |  | OnChange, deadband 0.02 | FV11 estimated alcohol by volume. |
| BR/Cellar/FV11/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV11 fill level. |
| BR/Cellar/FV11/DaysInTank | Float8 | d | 0 |  | OnChange, deadband 0.01 | FV11 biological days since filling started. |
| BR/Cellar/FV11/GlycolValvePct | Float8 | % | 0 |  | OnChange, deadband 1 | FV11 glycol jacket valve. |
| BR/Cellar/FV11/Fault | Boolean |  | false |  |  | FV11 temperature out of control or contamination. |
| BR/Cellar/FV12/BatchId | String |  | "" |  | OnChange | FV12: batch in the tank (also set while the tank is reserved for a coming brew). |
| BR/Cellar/FV12/Recipe | String |  | "" |  |  | FV12: recipe. |
| BR/Cellar/FV12/Phase | String |  | EMPTY |  |  | FV12: EMPTY \| FILLING \| FERMENTING \| DIACETYL_REST \| CRASH \| CONDITIONING \| TRANSFER \| CIP. |
| BR/Cellar/FV12/TempC | Float8 | °C | 15 | TempDeviation: OnCondition {[.]Phase} != "EMPTY" && {[.]Phase} != "CIP" && abs({[.]TempC} - {[.]SetpointC}) > 2.5, High ("FV12 temperature deviates more than 2.5 C from setpoint") | OnChange, deadband 0.05 | FV12 temperature. |
| BR/Cellar/FV12/SetpointC | Float8 | °C | 15 |  |  | FV12 temperature setpoint (ramps with the phase). |
| BR/Cellar/FV12/GravityP | Float8 | °P | 0 |  | OnChange, deadband 0.01 | FV12 gravity (plato). |
| BR/Cellar/FV12/pH | Float8 | pH | 0 |  | OnChange, deadband 0.01 | FV12 pH. |
| BR/Cellar/FV12/DOppb | Float8 | ppb | 0 |  | OnChange, deadband 5 | FV12 dissolved oxygen. |
| BR/Cellar/FV12/PressurePSI | Float8 | psi | 0 | PressureHigh: AboveValue 15, High ("FV12 pressure above 15 psi") | OnChange, deadband 0.1 | FV12 head pressure. |
| BR/Cellar/FV12/CO2VolPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV12 dissolved CO2 as percent of saturation. |
| BR/Cellar/FV12/ABVEst | Float8 | % | 0 |  | OnChange, deadband 0.02 | FV12 estimated alcohol by volume. |
| BR/Cellar/FV12/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | FV12 fill level. |
| BR/Cellar/FV12/DaysInTank | Float8 | d | 0 |  | OnChange, deadband 0.01 | FV12 biological days since filling started. |
| BR/Cellar/FV12/GlycolValvePct | Float8 | % | 0 |  | OnChange, deadband 1 | FV12 glycol jacket valve. |
| BR/Cellar/FV12/Fault | Boolean |  | false |  |  | FV12 temperature out of control or contamination. |
| BR/Cellar/BBT1/BatchId | String |  | "" |  | OnChange | BBT1: batch in the tank. |
| BR/Cellar/BBT1/Recipe | String |  | "" |  |  | BBT1: recipe. |
| BR/Cellar/BBT1/Phase | String |  | EMPTY |  |  | BBT1: EMPTY \| FILLING \| CARBONATING \| READY \| PACKAGING \| CIP. |
| BR/Cellar/BBT1/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | BBT1 level. |
| BR/Cellar/BBT1/TempC | Float8 | °C | 3 |  | OnChange, deadband 0.1 | BBT1 temperature. |
| BR/Cellar/BBT1/CO2Vol | Float8 | vol | 0 |  | OnChange, deadband 0.02 | BBT1 carbonation (volumes of CO2). |
| BR/Cellar/BBT1/ReadyToPackage | Boolean |  | false |  | OnChange | BBT1: carbonated, QA passed, ready for the packaging line. |
| BR/Cellar/BBT2/BatchId | String |  | "" |  | OnChange | BBT2: batch in the tank. |
| BR/Cellar/BBT2/Recipe | String |  | "" |  |  | BBT2: recipe. |
| BR/Cellar/BBT2/Phase | String |  | EMPTY |  |  | BBT2: EMPTY \| FILLING \| CARBONATING \| READY \| PACKAGING \| CIP. |
| BR/Cellar/BBT2/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | BBT2 level. |
| BR/Cellar/BBT2/TempC | Float8 | °C | 3 |  | OnChange, deadband 0.1 | BBT2 temperature. |
| BR/Cellar/BBT2/CO2Vol | Float8 | vol | 0 |  | OnChange, deadband 0.02 | BBT2 carbonation (volumes of CO2). |
| BR/Cellar/BBT2/ReadyToPackage | Boolean |  | false |  | OnChange | BBT2: carbonated, QA passed, ready for the packaging line. |
| BR/Cellar/BBT3/BatchId | String |  | "" |  | OnChange | BBT3: batch in the tank. |
| BR/Cellar/BBT3/Recipe | String |  | "" |  |  | BBT3: recipe. |
| BR/Cellar/BBT3/Phase | String |  | EMPTY |  |  | BBT3: EMPTY \| FILLING \| CARBONATING \| READY \| PACKAGING \| CIP. |
| BR/Cellar/BBT3/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | BBT3 level. |
| BR/Cellar/BBT3/TempC | Float8 | °C | 3 |  | OnChange, deadband 0.1 | BBT3 temperature. |
| BR/Cellar/BBT3/CO2Vol | Float8 | vol | 0 |  | OnChange, deadband 0.02 | BBT3 carbonation (volumes of CO2). |
| BR/Cellar/BBT3/ReadyToPackage | Boolean |  | false |  | OnChange | BBT3: carbonated, QA passed, ready for the packaging line. |
| BR/Cellar/BBT4/BatchId | String |  | "" |  | OnChange | BBT4: batch in the tank. |
| BR/Cellar/BBT4/Recipe | String |  | "" |  |  | BBT4: recipe. |
| BR/Cellar/BBT4/Phase | String |  | EMPTY |  |  | BBT4: EMPTY \| FILLING \| CARBONATING \| READY \| PACKAGING \| CIP. |
| BR/Cellar/BBT4/LevelPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | BBT4 level. |
| BR/Cellar/BBT4/TempC | Float8 | °C | 3 |  | OnChange, deadband 0.1 | BBT4 temperature. |
| BR/Cellar/BBT4/CO2Vol | Float8 | vol | 0 |  | OnChange, deadband 0.02 | BBT4 carbonation (volumes of CO2). |
| BR/Cellar/BBT4/ReadyToPackage | Boolean |  | false |  | OnChange | BBT4: carbonated, QA passed, ready for the packaging line. |
| BR/Cellar/Yeast/Strain | String |  | US-05 Ale |  |  | Strain in the brink. |
| BR/Cellar/Yeast/Generation | Int4 |  | 1 |  |  | Brink generation (re-pitches). |
| BR/Cellar/Yeast/ViabilityPct | Float8 | % | 98 |  | OnChange, deadband 0.5 | Brink viability. |
| BR/Cellar/OccupancyPct | Float8 | % | 0 | CellarFull: AboveValue 90, Medium ("Cellar occupancy above 90 %") | OnChange, deadband 0.5 | Share of fermenters in use (reserved or holding beer). |
| BR/Packaging/Line/State | String |  | IDLE |  | OnChange | RUNNING \| IDLE \| STARVED \| BLOCKED \| DOWN \| CHANGEOVER \| CIP. |
| BR/Packaging/Line/SpeedCPM | Float8 | cpm | 0 |  | OnChange, deadband 2 | Line speed in cans per minute (keg runs count can-equivalents). |
| BR/Packaging/Line/RatedCPM | Float8 | cpm | 300 |  |  | Rated can speed. |
| BR/Packaging/Line/GoodCount | Int4 | cans | 0 |  | OnChange | Good packages this shift. |
| BR/Packaging/Line/RejectCount | Int4 | cans | 0 |  | OnChange | Rejected packages this shift. |
| BR/Packaging/Line/RejectFill | Int4 | cans | 0 |  | OnChange | Rejects: fill level. |
| BR/Packaging/Line/RejectSeam | Int4 | cans | 0 |  | OnChange | Rejects: seam. |
| BR/Packaging/Line/RejectLabel | Int4 | cans | 0 |  | OnChange | Rejects: label. |
| BR/Packaging/Line/DowntimeReason | String |  | NO_BEER |  | OnChange | NONE \| FILLER_JAM \| LABEL_OUT \| CAN_SUPPLY \| SEAMER_FAULT \| CHANGEOVER \| CIP \| NO_BEER. |
| BR/Packaging/Line/DowntimeMin | Float8 | min | 0 |  | OnChange, deadband 0.05 | Line downtime this shift (real minutes of line time). |
| BR/Packaging/Line/BatchId | String |  | "" |  | OnChange | Batch being packaged. |
| BR/Packaging/Line/Recipe | String |  | "" |  |  | Recipe being packaged. |
| BR/Packaging/Line/Format | String |  | CAN |  |  | Present format, CAN or KEG. |
| BR/Packaging/Line/ShiftTargetCans | Int4 | cans | 1500 |  |  | Planned packages for the shift. |
| BR/Packaging/Line/PalletsToday | Int4 |  | 0 |  | OnChange | Pallets completed today. |
| BR/Packaging/Line/CasesToday | Int4 |  | 0 |  | OnChange | Cases packed today. |
| BR/Packaging/Depal/State | String |  | IDLE |  |  | Depal: RUNNING \| IDLE \| STARVED \| BLOCKED \| FAULT. |
| BR/Packaging/Depal/Fault | Boolean |  | false |  |  | Depal fault. |
| BR/Packaging/Depal/CountIn | Int4 | cans | 0 |  |  | Depal: packages in this shift. |
| BR/Packaging/Depal/CountOut | Int4 | cans | 0 |  |  | Depal: packages out this shift. |
| BR/Packaging/Rinser/State | String |  | IDLE |  |  | Rinser: RUNNING \| IDLE \| STARVED \| BLOCKED \| FAULT. |
| BR/Packaging/Rinser/Fault | Boolean |  | false |  |  | Rinser fault. |
| BR/Packaging/Rinser/CountIn | Int4 | cans | 0 |  |  | Rinser: packages in this shift. |
| BR/Packaging/Rinser/CountOut | Int4 | cans | 0 |  |  | Rinser: packages out this shift. |
| BR/Packaging/Filler/State | String |  | IDLE |  |  | Filler: RUNNING \| IDLE \| STARVED \| BLOCKED \| FAULT. |
| BR/Packaging/Filler/Fault | Boolean |  | false | FillerJam: OnCondition {[.]Fault} = 1, High ("Filler jam") |  | Filler fault. |
| BR/Packaging/Filler/CountIn | Int4 | cans | 0 |  |  | Filler: packages in this shift. |
| BR/Packaging/Filler/CountOut | Int4 | cans | 0 |  |  | Filler: packages out this shift. |
| BR/Packaging/Seamer/State | String |  | IDLE |  |  | Seamer: RUNNING \| IDLE \| STARVED \| BLOCKED \| FAULT. |
| BR/Packaging/Seamer/Fault | Boolean |  | false | SeamerFault: OnCondition {[.]Fault} = 1, High ("Seamer fault") |  | Seamer fault. |
| BR/Packaging/Seamer/CountIn | Int4 | cans | 0 |  |  | Seamer: packages in this shift. |
| BR/Packaging/Seamer/CountOut | Int4 | cans | 0 |  |  | Seamer: packages out this shift. |
| BR/Packaging/Pasteurizer/State | String |  | IDLE |  |  | Pasteurizer: RUNNING \| IDLE \| STARVED \| BLOCKED \| FAULT. |
| BR/Packaging/Pasteurizer/Fault | Boolean |  | false |  |  | Pasteurizer fault. |
| BR/Packaging/Pasteurizer/CountIn | Int4 | cans | 0 |  |  | Pasteurizer: packages in this shift. |
| BR/Packaging/Pasteurizer/CountOut | Int4 | cans | 0 |  |  | Pasteurizer: packages out this shift. |
| BR/Packaging/Labeler/State | String |  | IDLE |  |  | Labeler: RUNNING \| IDLE \| STARVED \| BLOCKED \| FAULT. |
| BR/Packaging/Labeler/Fault | Boolean |  | false | LabelOut: OnCondition {[.]Fault} = 1, Medium ("Labeler out of label stock") |  | Labeler fault. |
| BR/Packaging/Labeler/CountIn | Int4 | cans | 0 |  |  | Labeler: packages in this shift. |
| BR/Packaging/Labeler/CountOut | Int4 | cans | 0 |  |  | Labeler: packages out this shift. |
| BR/Packaging/Packer/State | String |  | IDLE |  |  | Packer: RUNNING \| IDLE \| STARVED \| BLOCKED \| FAULT. |
| BR/Packaging/Packer/Fault | Boolean |  | false |  |  | Packer fault. |
| BR/Packaging/Packer/CountIn | Int4 | cans | 0 |  |  | Packer: packages in this shift. |
| BR/Packaging/Packer/CountOut | Int4 | cans | 0 |  |  | Packer: packages out this shift. |
| BR/Packaging/Palletizer/State | String |  | IDLE |  |  | Palletizer: RUNNING \| IDLE \| STARVED \| BLOCKED \| FAULT. |
| BR/Packaging/Palletizer/Fault | Boolean |  | false |  |  | Palletizer fault. |
| BR/Packaging/Palletizer/CountIn | Int4 | cans | 0 |  |  | Palletizer: packages in this shift. |
| BR/Packaging/Palletizer/CountOut | Int4 | cans | 0 |  |  | Palletizer: packages out this shift. |
| BR/Packaging/OEE/Availability | Float8 |  | 0 |  | OnChange, deadband 0.002 | Shift availability: run time / planned time (0-1). |
| BR/Packaging/OEE/Performance | Float8 |  | 0 |  | OnChange, deadband 0.002 | Shift performance: packages / (rated speed x run time) (0-1). |
| BR/Packaging/OEE/Quality | Float8 |  | 1 |  | OnChange, deadband 0.002 | Shift quality: good / total packages (0-1). |
| BR/Packaging/OEE/OEE | Float8 |  | 0 |  | OnChange, deadband 0.002 | Overall equipment effectiveness: availability x performance x quality (0-1). |
| BR/Packaging/OEE/RunMin | Float8 | min | 0 |  | OnChange, deadband 0.05 | Run time this shift. |
| BR/Packaging/OEE/DownMin | Float8 | min | 0 |  | OnChange, deadband 0.05 | Down time this shift. |
| BR/Packaging/OEE/PlannedMin | Float8 | min | 0 |  | OnChange, deadband 0.05 | Planned production time this shift. |
| BR/Utilities/Boiler/PressureBar | Float8 | bar | 8 | PressureHigh: AboveValue 9.5, High ("Boiler pressure above 9.5 bar")<br>PressureLow: BelowValue 6.5, High ("Boiler pressure below 6.5 bar") | OnChange, deadband 0.05 | Steam header pressure. |
| BR/Utilities/Boiler/SteamKgph | Float8 | kg/h | 0 |  | OnChange, deadband 10 | Steam flow. |
| BR/Utilities/Boiler/FuelKwh | Float8 | kWh | 0 |  | OnChange, deadband 1 | Fuel energy used today. |
| BR/Utilities/Boiler/State | String |  | RUN |  |  | RUN \| STANDBY \| LOW_FIRE. |
| BR/Utilities/Glycol/SupplyC | Float8 | °C | -3 | SupplyHigh: AboveValue 2, High ("Glycol supply temperature above 2 C") | OnChange, deadband 0.1 | Glycol supply temperature. |
| BR/Utilities/Glycol/ReturnC | Float8 | °C | 0 |  | OnChange, deadband 0.1 | Glycol return temperature. |
| BR/Utilities/Glycol/LoadPct | Float8 | % | 0 | LoadHigh: AboveValue 90, Medium ("Glycol chiller load above 90 %") | OnChange, deadband 0.5 | Glycol chiller load. |
| BR/Utilities/Glycol/CompressorOn | Boolean |  | true |  |  | Glycol compressor running. |
| BR/Utilities/Glycol/Fault | Boolean |  | false |  |  | Glycol chiller fault. |
| BR/Utilities/CO2/TankPct | Float8 | % | 85 | TankLow: BelowValue 20, Medium ("CO2 tank below 20 %") | OnChange, deadband 0.2 | Bulk CO2 tank level. |
| BR/Utilities/CO2/ConsumptionKgph | Float8 | kg/h | 0 |  | OnChange, deadband 0.5 | CO2 consumption. |
| BR/Utilities/CO2/RecoveredPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | Share of CO2 use covered by fermentation recovery. |
| BR/Utilities/Air/PressureBar | Float8 | bar | 7 | PressureLow: BelowValue 5.5, Medium ("Compressed air below 5.5 bar") | OnChange, deadband 0.05 | Compressed air header pressure. |
| BR/Utilities/CIP/Step | String |  | IDLE |  | OnChange | IDLE \| PRE_RINSE \| CAUSTIC \| RINSE \| ACID \| FINAL_RINSE. |
| BR/Utilities/CIP/TargetUnit | String |  | "" |  |  | Unit being cleaned. |
| BR/Utilities/CIP/ConductivitymS | Float8 | mS/cm | 0.5 | ConductivityLow: OnCondition {[.]Step} = "CAUSTIC" && {[.]ConductivitymS} < 20.0, Medium ("CIP caustic conductivity low") | OnChange, deadband 1 | CIP return conductivity. |
| BR/Utilities/CIP/TempC | Float8 | °C | 20 |  | OnChange, deadband 0.5 | CIP return temperature. |
| BR/Utilities/CIP/Active | Boolean |  | false |  |  | CIP skid running. |
| BR/Utilities/Water/TodayHl | Float8 | hl | 0 |  | OnChange, deadband 0.1 | Water used today. |
| BR/Utilities/Energy/TodayKwh | Float8 | kWh | 0 |  | OnChange, deadband 1 | Electrical and thermal energy used today. |
| BR/Batches/B01/Id | String |  | "" |  |  | B01: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B01/Recipe | String |  | "" |  |  | B01: Recipe. |
| BR/Batches/B01/State | String |  | PLANNED |  | OnChange | B01: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B01/StartHour | Float8 | h | 0 |  |  | B01: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B01/Phase | String |  | "" |  | OnChange | B01: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B01/FV | String |  | "" |  | OnChange | B01: Fermenter (source of the beer). |
| BR/Batches/B01/BBT | String |  | "" |  | OnChange | B01: Bright tank. |
| BR/Batches/B01/Hl | Float8 | hl | 0 |  |  | B01: Batch volume. |
| BR/Batches/B01/OG | Float8 | °P | 0 |  | OnChange | B01: Original gravity (lab sample at end of boil). |
| BR/Batches/B01/FG | Float8 | °P | 0 |  | OnChange | B01: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B01/ABV | Float8 | % | 0 |  | OnChange | B01: Alcohol by volume from OG and FG. |
| BR/Batches/B01/pH | Float8 | pH | 0 |  |  | B01: Lab pH at end of fermentation. |
| BR/Batches/B01/IBU | Float8 | IBU | 0 |  |  | B01: Bitterness estimate (end of boil sample). |
| BR/Batches/B01/DO | Float8 | ppb | 0 |  |  | B01: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B01/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B01") | OnChange | B01: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B01/Cans | Int4 | cans | 0 |  | OnChange | B01: Good packages produced. |
| BR/Batches/B01/Pallets | Int4 |  | 0 |  |  | B01: Pallets built. |
| BR/Batches/B01/Yield | Float8 | % | 0 |  | OnChange | B01: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B01/Timeline | String |  | "" |  |  | B01: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B02/Id | String |  | "" |  |  | B02: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B02/Recipe | String |  | "" |  |  | B02: Recipe. |
| BR/Batches/B02/State | String |  | PLANNED |  | OnChange | B02: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B02/StartHour | Float8 | h | 0 |  |  | B02: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B02/Phase | String |  | "" |  | OnChange | B02: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B02/FV | String |  | "" |  | OnChange | B02: Fermenter (source of the beer). |
| BR/Batches/B02/BBT | String |  | "" |  | OnChange | B02: Bright tank. |
| BR/Batches/B02/Hl | Float8 | hl | 0 |  |  | B02: Batch volume. |
| BR/Batches/B02/OG | Float8 | °P | 0 |  | OnChange | B02: Original gravity (lab sample at end of boil). |
| BR/Batches/B02/FG | Float8 | °P | 0 |  | OnChange | B02: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B02/ABV | Float8 | % | 0 |  | OnChange | B02: Alcohol by volume from OG and FG. |
| BR/Batches/B02/pH | Float8 | pH | 0 |  |  | B02: Lab pH at end of fermentation. |
| BR/Batches/B02/IBU | Float8 | IBU | 0 |  |  | B02: Bitterness estimate (end of boil sample). |
| BR/Batches/B02/DO | Float8 | ppb | 0 |  |  | B02: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B02/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B02") | OnChange | B02: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B02/Cans | Int4 | cans | 0 |  | OnChange | B02: Good packages produced. |
| BR/Batches/B02/Pallets | Int4 |  | 0 |  |  | B02: Pallets built. |
| BR/Batches/B02/Yield | Float8 | % | 0 |  | OnChange | B02: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B02/Timeline | String |  | "" |  |  | B02: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B03/Id | String |  | "" |  |  | B03: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B03/Recipe | String |  | "" |  |  | B03: Recipe. |
| BR/Batches/B03/State | String |  | PLANNED |  | OnChange | B03: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B03/StartHour | Float8 | h | 0 |  |  | B03: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B03/Phase | String |  | "" |  | OnChange | B03: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B03/FV | String |  | "" |  | OnChange | B03: Fermenter (source of the beer). |
| BR/Batches/B03/BBT | String |  | "" |  | OnChange | B03: Bright tank. |
| BR/Batches/B03/Hl | Float8 | hl | 0 |  |  | B03: Batch volume. |
| BR/Batches/B03/OG | Float8 | °P | 0 |  | OnChange | B03: Original gravity (lab sample at end of boil). |
| BR/Batches/B03/FG | Float8 | °P | 0 |  | OnChange | B03: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B03/ABV | Float8 | % | 0 |  | OnChange | B03: Alcohol by volume from OG and FG. |
| BR/Batches/B03/pH | Float8 | pH | 0 |  |  | B03: Lab pH at end of fermentation. |
| BR/Batches/B03/IBU | Float8 | IBU | 0 |  |  | B03: Bitterness estimate (end of boil sample). |
| BR/Batches/B03/DO | Float8 | ppb | 0 |  |  | B03: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B03/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B03") | OnChange | B03: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B03/Cans | Int4 | cans | 0 |  | OnChange | B03: Good packages produced. |
| BR/Batches/B03/Pallets | Int4 |  | 0 |  |  | B03: Pallets built. |
| BR/Batches/B03/Yield | Float8 | % | 0 |  | OnChange | B03: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B03/Timeline | String |  | "" |  |  | B03: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B04/Id | String |  | "" |  |  | B04: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B04/Recipe | String |  | "" |  |  | B04: Recipe. |
| BR/Batches/B04/State | String |  | PLANNED |  | OnChange | B04: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B04/StartHour | Float8 | h | 0 |  |  | B04: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B04/Phase | String |  | "" |  | OnChange | B04: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B04/FV | String |  | "" |  | OnChange | B04: Fermenter (source of the beer). |
| BR/Batches/B04/BBT | String |  | "" |  | OnChange | B04: Bright tank. |
| BR/Batches/B04/Hl | Float8 | hl | 0 |  |  | B04: Batch volume. |
| BR/Batches/B04/OG | Float8 | °P | 0 |  | OnChange | B04: Original gravity (lab sample at end of boil). |
| BR/Batches/B04/FG | Float8 | °P | 0 |  | OnChange | B04: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B04/ABV | Float8 | % | 0 |  | OnChange | B04: Alcohol by volume from OG and FG. |
| BR/Batches/B04/pH | Float8 | pH | 0 |  |  | B04: Lab pH at end of fermentation. |
| BR/Batches/B04/IBU | Float8 | IBU | 0 |  |  | B04: Bitterness estimate (end of boil sample). |
| BR/Batches/B04/DO | Float8 | ppb | 0 |  |  | B04: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B04/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B04") | OnChange | B04: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B04/Cans | Int4 | cans | 0 |  | OnChange | B04: Good packages produced. |
| BR/Batches/B04/Pallets | Int4 |  | 0 |  |  | B04: Pallets built. |
| BR/Batches/B04/Yield | Float8 | % | 0 |  | OnChange | B04: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B04/Timeline | String |  | "" |  |  | B04: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B05/Id | String |  | "" |  |  | B05: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B05/Recipe | String |  | "" |  |  | B05: Recipe. |
| BR/Batches/B05/State | String |  | PLANNED |  | OnChange | B05: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B05/StartHour | Float8 | h | 0 |  |  | B05: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B05/Phase | String |  | "" |  | OnChange | B05: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B05/FV | String |  | "" |  | OnChange | B05: Fermenter (source of the beer). |
| BR/Batches/B05/BBT | String |  | "" |  | OnChange | B05: Bright tank. |
| BR/Batches/B05/Hl | Float8 | hl | 0 |  |  | B05: Batch volume. |
| BR/Batches/B05/OG | Float8 | °P | 0 |  | OnChange | B05: Original gravity (lab sample at end of boil). |
| BR/Batches/B05/FG | Float8 | °P | 0 |  | OnChange | B05: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B05/ABV | Float8 | % | 0 |  | OnChange | B05: Alcohol by volume from OG and FG. |
| BR/Batches/B05/pH | Float8 | pH | 0 |  |  | B05: Lab pH at end of fermentation. |
| BR/Batches/B05/IBU | Float8 | IBU | 0 |  |  | B05: Bitterness estimate (end of boil sample). |
| BR/Batches/B05/DO | Float8 | ppb | 0 |  |  | B05: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B05/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B05") | OnChange | B05: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B05/Cans | Int4 | cans | 0 |  | OnChange | B05: Good packages produced. |
| BR/Batches/B05/Pallets | Int4 |  | 0 |  |  | B05: Pallets built. |
| BR/Batches/B05/Yield | Float8 | % | 0 |  | OnChange | B05: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B05/Timeline | String |  | "" |  |  | B05: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B06/Id | String |  | "" |  |  | B06: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B06/Recipe | String |  | "" |  |  | B06: Recipe. |
| BR/Batches/B06/State | String |  | PLANNED |  | OnChange | B06: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B06/StartHour | Float8 | h | 0 |  |  | B06: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B06/Phase | String |  | "" |  | OnChange | B06: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B06/FV | String |  | "" |  | OnChange | B06: Fermenter (source of the beer). |
| BR/Batches/B06/BBT | String |  | "" |  | OnChange | B06: Bright tank. |
| BR/Batches/B06/Hl | Float8 | hl | 0 |  |  | B06: Batch volume. |
| BR/Batches/B06/OG | Float8 | °P | 0 |  | OnChange | B06: Original gravity (lab sample at end of boil). |
| BR/Batches/B06/FG | Float8 | °P | 0 |  | OnChange | B06: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B06/ABV | Float8 | % | 0 |  | OnChange | B06: Alcohol by volume from OG and FG. |
| BR/Batches/B06/pH | Float8 | pH | 0 |  |  | B06: Lab pH at end of fermentation. |
| BR/Batches/B06/IBU | Float8 | IBU | 0 |  |  | B06: Bitterness estimate (end of boil sample). |
| BR/Batches/B06/DO | Float8 | ppb | 0 |  |  | B06: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B06/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B06") | OnChange | B06: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B06/Cans | Int4 | cans | 0 |  | OnChange | B06: Good packages produced. |
| BR/Batches/B06/Pallets | Int4 |  | 0 |  |  | B06: Pallets built. |
| BR/Batches/B06/Yield | Float8 | % | 0 |  | OnChange | B06: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B06/Timeline | String |  | "" |  |  | B06: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B07/Id | String |  | "" |  |  | B07: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B07/Recipe | String |  | "" |  |  | B07: Recipe. |
| BR/Batches/B07/State | String |  | PLANNED |  | OnChange | B07: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B07/StartHour | Float8 | h | 0 |  |  | B07: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B07/Phase | String |  | "" |  | OnChange | B07: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B07/FV | String |  | "" |  | OnChange | B07: Fermenter (source of the beer). |
| BR/Batches/B07/BBT | String |  | "" |  | OnChange | B07: Bright tank. |
| BR/Batches/B07/Hl | Float8 | hl | 0 |  |  | B07: Batch volume. |
| BR/Batches/B07/OG | Float8 | °P | 0 |  | OnChange | B07: Original gravity (lab sample at end of boil). |
| BR/Batches/B07/FG | Float8 | °P | 0 |  | OnChange | B07: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B07/ABV | Float8 | % | 0 |  | OnChange | B07: Alcohol by volume from OG and FG. |
| BR/Batches/B07/pH | Float8 | pH | 0 |  |  | B07: Lab pH at end of fermentation. |
| BR/Batches/B07/IBU | Float8 | IBU | 0 |  |  | B07: Bitterness estimate (end of boil sample). |
| BR/Batches/B07/DO | Float8 | ppb | 0 |  |  | B07: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B07/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B07") | OnChange | B07: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B07/Cans | Int4 | cans | 0 |  | OnChange | B07: Good packages produced. |
| BR/Batches/B07/Pallets | Int4 |  | 0 |  |  | B07: Pallets built. |
| BR/Batches/B07/Yield | Float8 | % | 0 |  | OnChange | B07: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B07/Timeline | String |  | "" |  |  | B07: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B08/Id | String |  | "" |  |  | B08: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B08/Recipe | String |  | "" |  |  | B08: Recipe. |
| BR/Batches/B08/State | String |  | PLANNED |  | OnChange | B08: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B08/StartHour | Float8 | h | 0 |  |  | B08: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B08/Phase | String |  | "" |  | OnChange | B08: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B08/FV | String |  | "" |  | OnChange | B08: Fermenter (source of the beer). |
| BR/Batches/B08/BBT | String |  | "" |  | OnChange | B08: Bright tank. |
| BR/Batches/B08/Hl | Float8 | hl | 0 |  |  | B08: Batch volume. |
| BR/Batches/B08/OG | Float8 | °P | 0 |  | OnChange | B08: Original gravity (lab sample at end of boil). |
| BR/Batches/B08/FG | Float8 | °P | 0 |  | OnChange | B08: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B08/ABV | Float8 | % | 0 |  | OnChange | B08: Alcohol by volume from OG and FG. |
| BR/Batches/B08/pH | Float8 | pH | 0 |  |  | B08: Lab pH at end of fermentation. |
| BR/Batches/B08/IBU | Float8 | IBU | 0 |  |  | B08: Bitterness estimate (end of boil sample). |
| BR/Batches/B08/DO | Float8 | ppb | 0 |  |  | B08: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B08/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B08") | OnChange | B08: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B08/Cans | Int4 | cans | 0 |  | OnChange | B08: Good packages produced. |
| BR/Batches/B08/Pallets | Int4 |  | 0 |  |  | B08: Pallets built. |
| BR/Batches/B08/Yield | Float8 | % | 0 |  | OnChange | B08: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B08/Timeline | String |  | "" |  |  | B08: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B09/Id | String |  | "" |  |  | B09: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B09/Recipe | String |  | "" |  |  | B09: Recipe. |
| BR/Batches/B09/State | String |  | PLANNED |  | OnChange | B09: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B09/StartHour | Float8 | h | 0 |  |  | B09: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B09/Phase | String |  | "" |  | OnChange | B09: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B09/FV | String |  | "" |  | OnChange | B09: Fermenter (source of the beer). |
| BR/Batches/B09/BBT | String |  | "" |  | OnChange | B09: Bright tank. |
| BR/Batches/B09/Hl | Float8 | hl | 0 |  |  | B09: Batch volume. |
| BR/Batches/B09/OG | Float8 | °P | 0 |  | OnChange | B09: Original gravity (lab sample at end of boil). |
| BR/Batches/B09/FG | Float8 | °P | 0 |  | OnChange | B09: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B09/ABV | Float8 | % | 0 |  | OnChange | B09: Alcohol by volume from OG and FG. |
| BR/Batches/B09/pH | Float8 | pH | 0 |  |  | B09: Lab pH at end of fermentation. |
| BR/Batches/B09/IBU | Float8 | IBU | 0 |  |  | B09: Bitterness estimate (end of boil sample). |
| BR/Batches/B09/DO | Float8 | ppb | 0 |  |  | B09: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B09/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B09") | OnChange | B09: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B09/Cans | Int4 | cans | 0 |  | OnChange | B09: Good packages produced. |
| BR/Batches/B09/Pallets | Int4 |  | 0 |  |  | B09: Pallets built. |
| BR/Batches/B09/Yield | Float8 | % | 0 |  | OnChange | B09: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B09/Timeline | String |  | "" |  |  | B09: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B10/Id | String |  | "" |  |  | B10: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B10/Recipe | String |  | "" |  |  | B10: Recipe. |
| BR/Batches/B10/State | String |  | PLANNED |  | OnChange | B10: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B10/StartHour | Float8 | h | 0 |  |  | B10: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B10/Phase | String |  | "" |  | OnChange | B10: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B10/FV | String |  | "" |  | OnChange | B10: Fermenter (source of the beer). |
| BR/Batches/B10/BBT | String |  | "" |  | OnChange | B10: Bright tank. |
| BR/Batches/B10/Hl | Float8 | hl | 0 |  |  | B10: Batch volume. |
| BR/Batches/B10/OG | Float8 | °P | 0 |  | OnChange | B10: Original gravity (lab sample at end of boil). |
| BR/Batches/B10/FG | Float8 | °P | 0 |  | OnChange | B10: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B10/ABV | Float8 | % | 0 |  | OnChange | B10: Alcohol by volume from OG and FG. |
| BR/Batches/B10/pH | Float8 | pH | 0 |  |  | B10: Lab pH at end of fermentation. |
| BR/Batches/B10/IBU | Float8 | IBU | 0 |  |  | B10: Bitterness estimate (end of boil sample). |
| BR/Batches/B10/DO | Float8 | ppb | 0 |  |  | B10: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B10/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B10") | OnChange | B10: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B10/Cans | Int4 | cans | 0 |  | OnChange | B10: Good packages produced. |
| BR/Batches/B10/Pallets | Int4 |  | 0 |  |  | B10: Pallets built. |
| BR/Batches/B10/Yield | Float8 | % | 0 |  | OnChange | B10: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B10/Timeline | String |  | "" |  |  | B10: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B11/Id | String |  | "" |  |  | B11: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B11/Recipe | String |  | "" |  |  | B11: Recipe. |
| BR/Batches/B11/State | String |  | PLANNED |  | OnChange | B11: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B11/StartHour | Float8 | h | 0 |  |  | B11: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B11/Phase | String |  | "" |  | OnChange | B11: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B11/FV | String |  | "" |  | OnChange | B11: Fermenter (source of the beer). |
| BR/Batches/B11/BBT | String |  | "" |  | OnChange | B11: Bright tank. |
| BR/Batches/B11/Hl | Float8 | hl | 0 |  |  | B11: Batch volume. |
| BR/Batches/B11/OG | Float8 | °P | 0 |  | OnChange | B11: Original gravity (lab sample at end of boil). |
| BR/Batches/B11/FG | Float8 | °P | 0 |  | OnChange | B11: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B11/ABV | Float8 | % | 0 |  | OnChange | B11: Alcohol by volume from OG and FG. |
| BR/Batches/B11/pH | Float8 | pH | 0 |  |  | B11: Lab pH at end of fermentation. |
| BR/Batches/B11/IBU | Float8 | IBU | 0 |  |  | B11: Bitterness estimate (end of boil sample). |
| BR/Batches/B11/DO | Float8 | ppb | 0 |  |  | B11: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B11/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B11") | OnChange | B11: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B11/Cans | Int4 | cans | 0 |  | OnChange | B11: Good packages produced. |
| BR/Batches/B11/Pallets | Int4 |  | 0 |  |  | B11: Pallets built. |
| BR/Batches/B11/Yield | Float8 | % | 0 |  | OnChange | B11: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B11/Timeline | String |  | "" |  |  | B11: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B12/Id | String |  | "" |  |  | B12: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B12/Recipe | String |  | "" |  |  | B12: Recipe. |
| BR/Batches/B12/State | String |  | PLANNED |  | OnChange | B12: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B12/StartHour | Float8 | h | 0 |  |  | B12: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B12/Phase | String |  | "" |  | OnChange | B12: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B12/FV | String |  | "" |  | OnChange | B12: Fermenter (source of the beer). |
| BR/Batches/B12/BBT | String |  | "" |  | OnChange | B12: Bright tank. |
| BR/Batches/B12/Hl | Float8 | hl | 0 |  |  | B12: Batch volume. |
| BR/Batches/B12/OG | Float8 | °P | 0 |  | OnChange | B12: Original gravity (lab sample at end of boil). |
| BR/Batches/B12/FG | Float8 | °P | 0 |  | OnChange | B12: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B12/ABV | Float8 | % | 0 |  | OnChange | B12: Alcohol by volume from OG and FG. |
| BR/Batches/B12/pH | Float8 | pH | 0 |  |  | B12: Lab pH at end of fermentation. |
| BR/Batches/B12/IBU | Float8 | IBU | 0 |  |  | B12: Bitterness estimate (end of boil sample). |
| BR/Batches/B12/DO | Float8 | ppb | 0 |  |  | B12: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B12/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B12") | OnChange | B12: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B12/Cans | Int4 | cans | 0 |  | OnChange | B12: Good packages produced. |
| BR/Batches/B12/Pallets | Int4 |  | 0 |  |  | B12: Pallets built. |
| BR/Batches/B12/Yield | Float8 | % | 0 |  | OnChange | B12: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B12/Timeline | String |  | "" |  |  | B12: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B13/Id | String |  | "" |  |  | B13: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B13/Recipe | String |  | "" |  |  | B13: Recipe. |
| BR/Batches/B13/State | String |  | PLANNED |  | OnChange | B13: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B13/StartHour | Float8 | h | 0 |  |  | B13: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B13/Phase | String |  | "" |  | OnChange | B13: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B13/FV | String |  | "" |  | OnChange | B13: Fermenter (source of the beer). |
| BR/Batches/B13/BBT | String |  | "" |  | OnChange | B13: Bright tank. |
| BR/Batches/B13/Hl | Float8 | hl | 0 |  |  | B13: Batch volume. |
| BR/Batches/B13/OG | Float8 | °P | 0 |  | OnChange | B13: Original gravity (lab sample at end of boil). |
| BR/Batches/B13/FG | Float8 | °P | 0 |  | OnChange | B13: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B13/ABV | Float8 | % | 0 |  | OnChange | B13: Alcohol by volume from OG and FG. |
| BR/Batches/B13/pH | Float8 | pH | 0 |  |  | B13: Lab pH at end of fermentation. |
| BR/Batches/B13/IBU | Float8 | IBU | 0 |  |  | B13: Bitterness estimate (end of boil sample). |
| BR/Batches/B13/DO | Float8 | ppb | 0 |  |  | B13: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B13/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B13") | OnChange | B13: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B13/Cans | Int4 | cans | 0 |  | OnChange | B13: Good packages produced. |
| BR/Batches/B13/Pallets | Int4 |  | 0 |  |  | B13: Pallets built. |
| BR/Batches/B13/Yield | Float8 | % | 0 |  | OnChange | B13: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B13/Timeline | String |  | "" |  |  | B13: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B14/Id | String |  | "" |  |  | B14: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B14/Recipe | String |  | "" |  |  | B14: Recipe. |
| BR/Batches/B14/State | String |  | PLANNED |  | OnChange | B14: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B14/StartHour | Float8 | h | 0 |  |  | B14: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B14/Phase | String |  | "" |  | OnChange | B14: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B14/FV | String |  | "" |  | OnChange | B14: Fermenter (source of the beer). |
| BR/Batches/B14/BBT | String |  | "" |  | OnChange | B14: Bright tank. |
| BR/Batches/B14/Hl | Float8 | hl | 0 |  |  | B14: Batch volume. |
| BR/Batches/B14/OG | Float8 | °P | 0 |  | OnChange | B14: Original gravity (lab sample at end of boil). |
| BR/Batches/B14/FG | Float8 | °P | 0 |  | OnChange | B14: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B14/ABV | Float8 | % | 0 |  | OnChange | B14: Alcohol by volume from OG and FG. |
| BR/Batches/B14/pH | Float8 | pH | 0 |  |  | B14: Lab pH at end of fermentation. |
| BR/Batches/B14/IBU | Float8 | IBU | 0 |  |  | B14: Bitterness estimate (end of boil sample). |
| BR/Batches/B14/DO | Float8 | ppb | 0 |  |  | B14: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B14/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B14") | OnChange | B14: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B14/Cans | Int4 | cans | 0 |  | OnChange | B14: Good packages produced. |
| BR/Batches/B14/Pallets | Int4 |  | 0 |  |  | B14: Pallets built. |
| BR/Batches/B14/Yield | Float8 | % | 0 |  | OnChange | B14: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B14/Timeline | String |  | "" |  |  | B14: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B15/Id | String |  | "" |  |  | B15: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B15/Recipe | String |  | "" |  |  | B15: Recipe. |
| BR/Batches/B15/State | String |  | PLANNED |  | OnChange | B15: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B15/StartHour | Float8 | h | 0 |  |  | B15: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B15/Phase | String |  | "" |  | OnChange | B15: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B15/FV | String |  | "" |  | OnChange | B15: Fermenter (source of the beer). |
| BR/Batches/B15/BBT | String |  | "" |  | OnChange | B15: Bright tank. |
| BR/Batches/B15/Hl | Float8 | hl | 0 |  |  | B15: Batch volume. |
| BR/Batches/B15/OG | Float8 | °P | 0 |  | OnChange | B15: Original gravity (lab sample at end of boil). |
| BR/Batches/B15/FG | Float8 | °P | 0 |  | OnChange | B15: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B15/ABV | Float8 | % | 0 |  | OnChange | B15: Alcohol by volume from OG and FG. |
| BR/Batches/B15/pH | Float8 | pH | 0 |  |  | B15: Lab pH at end of fermentation. |
| BR/Batches/B15/IBU | Float8 | IBU | 0 |  |  | B15: Bitterness estimate (end of boil sample). |
| BR/Batches/B15/DO | Float8 | ppb | 0 |  |  | B15: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B15/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B15") | OnChange | B15: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B15/Cans | Int4 | cans | 0 |  | OnChange | B15: Good packages produced. |
| BR/Batches/B15/Pallets | Int4 |  | 0 |  |  | B15: Pallets built. |
| BR/Batches/B15/Yield | Float8 | % | 0 |  | OnChange | B15: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B15/Timeline | String |  | "" |  |  | B15: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B16/Id | String |  | "" |  |  | B16: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B16/Recipe | String |  | "" |  |  | B16: Recipe. |
| BR/Batches/B16/State | String |  | PLANNED |  | OnChange | B16: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B16/StartHour | Float8 | h | 0 |  |  | B16: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B16/Phase | String |  | "" |  | OnChange | B16: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B16/FV | String |  | "" |  | OnChange | B16: Fermenter (source of the beer). |
| BR/Batches/B16/BBT | String |  | "" |  | OnChange | B16: Bright tank. |
| BR/Batches/B16/Hl | Float8 | hl | 0 |  |  | B16: Batch volume. |
| BR/Batches/B16/OG | Float8 | °P | 0 |  | OnChange | B16: Original gravity (lab sample at end of boil). |
| BR/Batches/B16/FG | Float8 | °P | 0 |  | OnChange | B16: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B16/ABV | Float8 | % | 0 |  | OnChange | B16: Alcohol by volume from OG and FG. |
| BR/Batches/B16/pH | Float8 | pH | 0 |  |  | B16: Lab pH at end of fermentation. |
| BR/Batches/B16/IBU | Float8 | IBU | 0 |  |  | B16: Bitterness estimate (end of boil sample). |
| BR/Batches/B16/DO | Float8 | ppb | 0 |  |  | B16: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B16/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B16") | OnChange | B16: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B16/Cans | Int4 | cans | 0 |  | OnChange | B16: Good packages produced. |
| BR/Batches/B16/Pallets | Int4 |  | 0 |  |  | B16: Pallets built. |
| BR/Batches/B16/Yield | Float8 | % | 0 |  | OnChange | B16: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B16/Timeline | String |  | "" |  |  | B16: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B17/Id | String |  | "" |  |  | B17: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B17/Recipe | String |  | "" |  |  | B17: Recipe. |
| BR/Batches/B17/State | String |  | PLANNED |  | OnChange | B17: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B17/StartHour | Float8 | h | 0 |  |  | B17: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B17/Phase | String |  | "" |  | OnChange | B17: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B17/FV | String |  | "" |  | OnChange | B17: Fermenter (source of the beer). |
| BR/Batches/B17/BBT | String |  | "" |  | OnChange | B17: Bright tank. |
| BR/Batches/B17/Hl | Float8 | hl | 0 |  |  | B17: Batch volume. |
| BR/Batches/B17/OG | Float8 | °P | 0 |  | OnChange | B17: Original gravity (lab sample at end of boil). |
| BR/Batches/B17/FG | Float8 | °P | 0 |  | OnChange | B17: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B17/ABV | Float8 | % | 0 |  | OnChange | B17: Alcohol by volume from OG and FG. |
| BR/Batches/B17/pH | Float8 | pH | 0 |  |  | B17: Lab pH at end of fermentation. |
| BR/Batches/B17/IBU | Float8 | IBU | 0 |  |  | B17: Bitterness estimate (end of boil sample). |
| BR/Batches/B17/DO | Float8 | ppb | 0 |  |  | B17: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B17/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B17") | OnChange | B17: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B17/Cans | Int4 | cans | 0 |  | OnChange | B17: Good packages produced. |
| BR/Batches/B17/Pallets | Int4 |  | 0 |  |  | B17: Pallets built. |
| BR/Batches/B17/Yield | Float8 | % | 0 |  | OnChange | B17: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B17/Timeline | String |  | "" |  |  | B17: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B18/Id | String |  | "" |  |  | B18: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B18/Recipe | String |  | "" |  |  | B18: Recipe. |
| BR/Batches/B18/State | String |  | PLANNED |  | OnChange | B18: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B18/StartHour | Float8 | h | 0 |  |  | B18: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B18/Phase | String |  | "" |  | OnChange | B18: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B18/FV | String |  | "" |  | OnChange | B18: Fermenter (source of the beer). |
| BR/Batches/B18/BBT | String |  | "" |  | OnChange | B18: Bright tank. |
| BR/Batches/B18/Hl | Float8 | hl | 0 |  |  | B18: Batch volume. |
| BR/Batches/B18/OG | Float8 | °P | 0 |  | OnChange | B18: Original gravity (lab sample at end of boil). |
| BR/Batches/B18/FG | Float8 | °P | 0 |  | OnChange | B18: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B18/ABV | Float8 | % | 0 |  | OnChange | B18: Alcohol by volume from OG and FG. |
| BR/Batches/B18/pH | Float8 | pH | 0 |  |  | B18: Lab pH at end of fermentation. |
| BR/Batches/B18/IBU | Float8 | IBU | 0 |  |  | B18: Bitterness estimate (end of boil sample). |
| BR/Batches/B18/DO | Float8 | ppb | 0 |  |  | B18: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B18/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B18") | OnChange | B18: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B18/Cans | Int4 | cans | 0 |  | OnChange | B18: Good packages produced. |
| BR/Batches/B18/Pallets | Int4 |  | 0 |  |  | B18: Pallets built. |
| BR/Batches/B18/Yield | Float8 | % | 0 |  | OnChange | B18: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B18/Timeline | String |  | "" |  |  | B18: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B19/Id | String |  | "" |  |  | B19: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B19/Recipe | String |  | "" |  |  | B19: Recipe. |
| BR/Batches/B19/State | String |  | PLANNED |  | OnChange | B19: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B19/StartHour | Float8 | h | 0 |  |  | B19: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B19/Phase | String |  | "" |  | OnChange | B19: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B19/FV | String |  | "" |  | OnChange | B19: Fermenter (source of the beer). |
| BR/Batches/B19/BBT | String |  | "" |  | OnChange | B19: Bright tank. |
| BR/Batches/B19/Hl | Float8 | hl | 0 |  |  | B19: Batch volume. |
| BR/Batches/B19/OG | Float8 | °P | 0 |  | OnChange | B19: Original gravity (lab sample at end of boil). |
| BR/Batches/B19/FG | Float8 | °P | 0 |  | OnChange | B19: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B19/ABV | Float8 | % | 0 |  | OnChange | B19: Alcohol by volume from OG and FG. |
| BR/Batches/B19/pH | Float8 | pH | 0 |  |  | B19: Lab pH at end of fermentation. |
| BR/Batches/B19/IBU | Float8 | IBU | 0 |  |  | B19: Bitterness estimate (end of boil sample). |
| BR/Batches/B19/DO | Float8 | ppb | 0 |  |  | B19: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B19/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B19") | OnChange | B19: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B19/Cans | Int4 | cans | 0 |  | OnChange | B19: Good packages produced. |
| BR/Batches/B19/Pallets | Int4 |  | 0 |  |  | B19: Pallets built. |
| BR/Batches/B19/Yield | Float8 | % | 0 |  | OnChange | B19: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B19/Timeline | String |  | "" |  |  | B19: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B20/Id | String |  | "" |  |  | B20: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B20/Recipe | String |  | "" |  |  | B20: Recipe. |
| BR/Batches/B20/State | String |  | PLANNED |  | OnChange | B20: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B20/StartHour | Float8 | h | 0 |  |  | B20: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B20/Phase | String |  | "" |  | OnChange | B20: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B20/FV | String |  | "" |  | OnChange | B20: Fermenter (source of the beer). |
| BR/Batches/B20/BBT | String |  | "" |  | OnChange | B20: Bright tank. |
| BR/Batches/B20/Hl | Float8 | hl | 0 |  |  | B20: Batch volume. |
| BR/Batches/B20/OG | Float8 | °P | 0 |  | OnChange | B20: Original gravity (lab sample at end of boil). |
| BR/Batches/B20/FG | Float8 | °P | 0 |  | OnChange | B20: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B20/ABV | Float8 | % | 0 |  | OnChange | B20: Alcohol by volume from OG and FG. |
| BR/Batches/B20/pH | Float8 | pH | 0 |  |  | B20: Lab pH at end of fermentation. |
| BR/Batches/B20/IBU | Float8 | IBU | 0 |  |  | B20: Bitterness estimate (end of boil sample). |
| BR/Batches/B20/DO | Float8 | ppb | 0 |  |  | B20: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B20/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B20") | OnChange | B20: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B20/Cans | Int4 | cans | 0 |  | OnChange | B20: Good packages produced. |
| BR/Batches/B20/Pallets | Int4 |  | 0 |  |  | B20: Pallets built. |
| BR/Batches/B20/Yield | Float8 | % | 0 |  | OnChange | B20: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B20/Timeline | String |  | "" |  |  | B20: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B21/Id | String |  | "" |  |  | B21: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B21/Recipe | String |  | "" |  |  | B21: Recipe. |
| BR/Batches/B21/State | String |  | PLANNED |  | OnChange | B21: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B21/StartHour | Float8 | h | 0 |  |  | B21: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B21/Phase | String |  | "" |  | OnChange | B21: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B21/FV | String |  | "" |  | OnChange | B21: Fermenter (source of the beer). |
| BR/Batches/B21/BBT | String |  | "" |  | OnChange | B21: Bright tank. |
| BR/Batches/B21/Hl | Float8 | hl | 0 |  |  | B21: Batch volume. |
| BR/Batches/B21/OG | Float8 | °P | 0 |  | OnChange | B21: Original gravity (lab sample at end of boil). |
| BR/Batches/B21/FG | Float8 | °P | 0 |  | OnChange | B21: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B21/ABV | Float8 | % | 0 |  | OnChange | B21: Alcohol by volume from OG and FG. |
| BR/Batches/B21/pH | Float8 | pH | 0 |  |  | B21: Lab pH at end of fermentation. |
| BR/Batches/B21/IBU | Float8 | IBU | 0 |  |  | B21: Bitterness estimate (end of boil sample). |
| BR/Batches/B21/DO | Float8 | ppb | 0 |  |  | B21: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B21/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B21") | OnChange | B21: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B21/Cans | Int4 | cans | 0 |  | OnChange | B21: Good packages produced. |
| BR/Batches/B21/Pallets | Int4 |  | 0 |  |  | B21: Pallets built. |
| BR/Batches/B21/Yield | Float8 | % | 0 |  | OnChange | B21: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B21/Timeline | String |  | "" |  |  | B21: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B22/Id | String |  | "" |  |  | B22: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B22/Recipe | String |  | "" |  |  | B22: Recipe. |
| BR/Batches/B22/State | String |  | PLANNED |  | OnChange | B22: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B22/StartHour | Float8 | h | 0 |  |  | B22: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B22/Phase | String |  | "" |  | OnChange | B22: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B22/FV | String |  | "" |  | OnChange | B22: Fermenter (source of the beer). |
| BR/Batches/B22/BBT | String |  | "" |  | OnChange | B22: Bright tank. |
| BR/Batches/B22/Hl | Float8 | hl | 0 |  |  | B22: Batch volume. |
| BR/Batches/B22/OG | Float8 | °P | 0 |  | OnChange | B22: Original gravity (lab sample at end of boil). |
| BR/Batches/B22/FG | Float8 | °P | 0 |  | OnChange | B22: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B22/ABV | Float8 | % | 0 |  | OnChange | B22: Alcohol by volume from OG and FG. |
| BR/Batches/B22/pH | Float8 | pH | 0 |  |  | B22: Lab pH at end of fermentation. |
| BR/Batches/B22/IBU | Float8 | IBU | 0 |  |  | B22: Bitterness estimate (end of boil sample). |
| BR/Batches/B22/DO | Float8 | ppb | 0 |  |  | B22: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B22/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B22") | OnChange | B22: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B22/Cans | Int4 | cans | 0 |  | OnChange | B22: Good packages produced. |
| BR/Batches/B22/Pallets | Int4 |  | 0 |  |  | B22: Pallets built. |
| BR/Batches/B22/Yield | Float8 | % | 0 |  | OnChange | B22: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B22/Timeline | String |  | "" |  |  | B22: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B23/Id | String |  | "" |  |  | B23: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B23/Recipe | String |  | "" |  |  | B23: Recipe. |
| BR/Batches/B23/State | String |  | PLANNED |  | OnChange | B23: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B23/StartHour | Float8 | h | 0 |  |  | B23: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B23/Phase | String |  | "" |  | OnChange | B23: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B23/FV | String |  | "" |  | OnChange | B23: Fermenter (source of the beer). |
| BR/Batches/B23/BBT | String |  | "" |  | OnChange | B23: Bright tank. |
| BR/Batches/B23/Hl | Float8 | hl | 0 |  |  | B23: Batch volume. |
| BR/Batches/B23/OG | Float8 | °P | 0 |  | OnChange | B23: Original gravity (lab sample at end of boil). |
| BR/Batches/B23/FG | Float8 | °P | 0 |  | OnChange | B23: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B23/ABV | Float8 | % | 0 |  | OnChange | B23: Alcohol by volume from OG and FG. |
| BR/Batches/B23/pH | Float8 | pH | 0 |  |  | B23: Lab pH at end of fermentation. |
| BR/Batches/B23/IBU | Float8 | IBU | 0 |  |  | B23: Bitterness estimate (end of boil sample). |
| BR/Batches/B23/DO | Float8 | ppb | 0 |  |  | B23: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B23/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B23") | OnChange | B23: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B23/Cans | Int4 | cans | 0 |  | OnChange | B23: Good packages produced. |
| BR/Batches/B23/Pallets | Int4 |  | 0 |  |  | B23: Pallets built. |
| BR/Batches/B23/Yield | Float8 | % | 0 |  | OnChange | B23: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B23/Timeline | String |  | "" |  |  | B23: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/B24/Id | String |  | "" |  |  | B24: Batch id (BRnnnn), kept for genealogy. |
| BR/Batches/B24/Recipe | String |  | "" |  |  | B24: Recipe. |
| BR/Batches/B24/State | String |  | PLANNED |  | OnChange | B24: PLANNED \| BREWING \| FERMENTING \| CONDITIONING \| PACKAGING \| COMPLETE \| DUMPED. |
| BR/Batches/B24/StartHour | Float8 | h | 0 |  |  | B24: Brew start in absolute simulated hours (day x 24 + hour); planned start while PLANNED. |
| BR/Batches/B24/Phase | String |  | "" |  | OnChange | B24: Present phase: MILLING MASH LAUTER BOIL WHIRLPOOL KNOCKOUT FERMENTATION DIACETYL_REST CRASH CONDITIONING TRANSFER CARBONATING READY PACKAGING COMPLETE DUMPED. |
| BR/Batches/B24/FV | String |  | "" |  | OnChange | B24: Fermenter (source of the beer). |
| BR/Batches/B24/BBT | String |  | "" |  | OnChange | B24: Bright tank. |
| BR/Batches/B24/Hl | Float8 | hl | 0 |  |  | B24: Batch volume. |
| BR/Batches/B24/OG | Float8 | °P | 0 |  | OnChange | B24: Original gravity (lab sample at end of boil). |
| BR/Batches/B24/FG | Float8 | °P | 0 |  | OnChange | B24: Final gravity (lab sample at end of fermentation). |
| BR/Batches/B24/ABV | Float8 | % | 0 |  | OnChange | B24: Alcohol by volume from OG and FG. |
| BR/Batches/B24/pH | Float8 | pH | 0 |  |  | B24: Lab pH at end of fermentation. |
| BR/Batches/B24/IBU | Float8 | IBU | 0 |  |  | B24: Bitterness estimate (end of boil sample). |
| BR/Batches/B24/DO | Float8 | ppb | 0 |  |  | B24: Dissolved oxygen at the pre-packaging sample. |
| BR/Batches/B24/QAStatus | String |  | PENDING | QAHold: OnCondition {[.]QAStatus} = "HOLD", High ("QA hold on batch slot B24") | OnChange | B24: PENDING \| PASS \| HOLD \| FAIL; HOLD blocks transfer and packaging until released. |
| BR/Batches/B24/Cans | Int4 | cans | 0 |  | OnChange | B24: Good packages produced. |
| BR/Batches/B24/Pallets | Int4 |  | 0 |  |  | B24: Pallets built. |
| BR/Batches/B24/Yield | Float8 | % | 0 |  | OnChange | B24: Good packages x 355 ml as percent of the batch volume. |
| BR/Batches/B24/Timeline | String |  | "" |  |  | B24: Phase timestamps: PHASE@absolute-hour, comma separated. |
| BR/Batches/NextIndex | Int4 |  | 1 |  |  | Ring slot (1-24) the next new batch record uses. |
| BR/Batches/ActiveCount | Int4 |  | 0 |  |  | Batches brewing, fermenting, conditioning or packaging. |
| BR/Schedule/BrewsPerDay | Int4 |  | 2 |  |  | Brews started per simulated day. |
| BR/Schedule/NextRecipe | String |  | Pilsner |  |  | Recipe of the next scheduled brew (head of Queue). |
| BR/Schedule/NextStartHour | Float8 | h | 6 |  |  | Hour of day the next brew is scheduled to start. |
| BR/Schedule/Queue | String |  | Pilsner,IPA,Stout,Wheat |  |  | Recipe queue, comma separated; the head is brewed and moves to the back. |
| BR/KPI/BatchesInProgress | Int4 |  | 0 |  | OnChange | Batches brewing, fermenting, conditioning or packaging. |
| BR/KPI/BrewsToday | Int4 |  | 0 |  | OnChange | Brews started today. |
| BR/KPI/HlToday | Float8 | hl | 0 |  | OnChange, deadband 0.1 | Volume brewed today. |
| BR/KPI/CellarOccupancyPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | Fermenters in use. |
| BR/KPI/AvgFermentDays | Float8 | d | 0 |  | OnChange, deadband 0.05 | Mean tank age of occupied fermenters. |
| BR/KPI/LineOEE | Float8 |  | 0 |  | OnChange, deadband 0.002 | Packaging line OEE this shift (0-1). |
| BR/KPI/GoodCansToday | Int4 | cans | 0 |  | OnChange | Good packages today. |
| BR/KPI/RejectPct | Float8 | % | 0 | RejectRateHigh: AboveValue 4, Medium ("Packaging reject rate above 4 %") | OnChange, deadband 0.1 | Packaging reject rate, one minute moving window. |
| BR/KPI/EnergyKwhPerHl | Float8 | kWh/hl | 0 |  | OnChange, deadband 1 | Energy per hl brewed today. |
| BR/KPI/WaterHlPerHl | Float8 | hl/hl | 0 |  | OnChange, deadband 0.05 | Water per hl brewed today. |
| BR/KPI/CO2RecoveredPct | Float8 | % | 0 |  | OnChange, deadband 0.5 | CO2 recovered. |
| BR/KPI/ActiveAlarms | Int4 |  | 0 |  | OnChange | Active alarms under BR/. |
| BR/KPI/Mode | String |  | NORMAL |  | OnChange | NORMAL \| BREW_DAY \| LINE_DOWN \| CELLAR_RISK \| QA_HOLD \| RUSH. |
| BR/_Sim_/Enabled | Boolean |  | true |  |  | Master switch of the br_sim timer. |
| BR/_Sim_/Scenario | String |  | normal |  |  | normal \| glycol_failure \| filler_jam \| stuck_sparge \| boil_over \| contamination \| rush_order. |
| BR/_Sim_/ScenarioStep | Int4 |  | 0 |  |  | Step of the running scenario (0 = none). |
| BR/_Sim_/SpeedFactor | Float8 | x | 60 |  |  | Simulated seconds per real second (60 = one real minute per simulated hour). |
| BR/_Sim_/FermentAccel | Float8 | x | 8 |  |  | Extra acceleration of fermentation, conditioning and carbonation biology (dramatised). |
| BR/_Sim_/Seed | Int4 |  | 7 |  |  | Random seed offset. |
| BR/_Sim_/TickCount | Int8 |  | 0 |  |  | Timer ticks since load. |
| BR/_Sim_/LastTickMs | Int4 | ms | 0 |  |  | Read + compute time of the last tick. |
| BR/_Sim_/LastError | String |  | "" |  |  | Last error of br_sim (cleared after 30 clean ticks). |
| BR/_Sim_/Fault/GlycolFailure | Boolean |  | false |  |  | Fault flag: glycol chiller down (scenario glycol_failure). |
| BR/_Sim_/Fault/FillerJam | Boolean |  | false |  |  | Fault flag: filler jammed (scenario filler_jam). |
| BR/_Sim_/Fault/SeamerFault | Boolean |  | false |  |  | Fault flag: seamer fault. |
| BR/_Sim_/Fault/LabelOut | Boolean |  | false |  |  | Fault flag: labeler out of label stock. |
| BR/_Sim_/Fault/StuckSparge | Boolean |  | false |  |  | Fault flag: lauter bed compacted, run-off stuck (scenario stuck_sparge). |
| BR/_Sim_/Fault/BoilOver | Boolean |  | false |  |  | Fault flag: kettle steam too high, foam rising (scenario boil_over). |
| BR/_Sim_/Fault/Contamination | Boolean |  | false |  |  | Fault flag: one fermenter infected (scenario contamination). |
| BR/_Sim_/Fault/Co2Leak | Boolean |  | false |  |  | Fault flag: CO2 leak on the tank manifold. |
| BR/_Sim_/Fault/AirLoss | Boolean |  | false |  |  | Fault flag: compressed-air supply loss. |
| BR/_Sim_/Fault/BoilerLow | Boolean |  | false |  |  | Fault flag: boiler low fire / pressure loss. |
| BR/_Sim_/Fault/CipDosing | Boolean |  | false |  |  | Fault flag: CIP caustic dosing pump failure. |
| BR/_Sim_/Request/StartBatch | String |  | "" |  |  | Command: recipe to brew now (consumed by the timer). |
| BR/_Sim_/Request/HoldLine | Boolean |  | false |  |  | Command: packaging line held (true) or released (false). |
| BR/_Sim_/Request/Changeover | String |  | "" |  |  | Command: CAN or KEG changeover on the line (consumed). |
| BR/_Sim_/Request/Cip | String |  | "" |  |  | Command: unit to clean, FVnn \| BBTn \| LINE (consumed). |
| BR/_Sim_/Request/QaRelease | String |  | "" |  |  | Command: batch id to release from HOLD, or ALL (consumed). |
| BR/_Sim_/Request/QaDump | String |  | "" |  |  | Command: batch id to dump (consumed). |
| BR/_Sim_/State/LastEpochMs | Int8 |  | 0 |  |  | Wall clock of the previous tick (ms). |
| BR/_Sim_/State/OkStreak | Int4 |  | 0 |  |  | Clean ticks since the last error. |
| BR/_Sim_/State/ScenarioApplied | String |  | normal |  |  | Scenario the timer has already started. |
| BR/_Sim_/State/ScenarioClock | Float8 | min | 0 |  |  | Simulated minutes since the scenario started. |
| BR/_Sim_/State/BatchSeq | Int4 |  | 0 |  |  | Last batch sequence number issued. |
| BR/_Sim_/State/NextStartAbs | Float8 | h | 0 |  |  | Absolute simulated hour of the next scheduled brew (0 = compute). |
| BR/_Sim_/State/PlannedSlot | Int4 |  | 0 |  |  | Ring slot holding the PLANNED record (0 = none). |
| BR/_Sim_/State/ActiveSlots | String |  | "" |  |  | Comma list of ring slots the timer reads (PLANNED and in-progress batches). |
| BR/_Sim_/State/PrevBrews | Int4 |  | 2 |  |  | BrewsPerDay before rush_order. |
| BR/_Sim_/State/ContamFV | String |  | "" |  |  | Fermenter infected by the contamination scenario. |
| BR/_Sim_/State/ShiftApplied | String |  | NIGHT |  |  | Shift for which the OEE counters run. |
| BR/_Sim_/State/RecoverPct | Float8 | % | 0 |  |  | Fermentation CO2 recovery fraction. |
| BR/_Sim_/State/CipRemaining | Float8 | min | 0 |  |  | Simulated minutes left in the CIP step. |
| BR/_Sim_/State/LauterProg | Float8 |  | 0 |  |  | Lauter run-off progress 0-1. |
| BR/_Sim_/State/LauterRate | Float8 |  | 1 |  |  | Lauter run-off rate factor. |
| BR/_Sim_/State/BoilOverClock | Float8 | min | 0 |  |  | Minutes the boil-over alarm condition lasted. |
| BR/_Sim_/State/BH/Mill/Total | Float8 | min | 0 |  |  | Phase length of Mill. |
| BR/_Sim_/State/BH/MashTun/Total | Float8 | min | 0 |  |  | Phase length of MashTun. |
| BR/_Sim_/State/BH/LauterTun/Total | Float8 | min | 0 |  |  | Phase length of LauterTun. |
| BR/_Sim_/State/BH/Kettle/Total | Float8 | min | 0 |  |  | Phase length of Kettle. |
| BR/_Sim_/State/BH/Whirlpool/Total | Float8 | min | 0 |  |  | Phase length of Whirlpool. |
| BR/_Sim_/State/BH/Chiller/Total | Float8 | min | 0 |  |  | Phase length of Chiller. |
| BR/_Sim_/State/Line/GoodF | Float8 |  | 0 |  |  | Packaging engine state: GoodF. |
| BR/_Sim_/State/Line/RejFillF | Float8 |  | 0 |  |  | Packaging engine state: RejFillF. |
| BR/_Sim_/State/Line/RejSeamF | Float8 |  | 0 |  |  | Packaging engine state: RejSeamF. |
| BR/_Sim_/State/Line/RejLabelF | Float8 |  | 0 |  |  | Packaging engine state: RejLabelF. |
| BR/_Sim_/State/Line/RunS | Float8 |  | 0 |  |  | Packaging engine state: RunS. |
| BR/_Sim_/State/Line/DownS | Float8 |  | 0 |  |  | Packaging engine state: DownS. |
| BR/_Sim_/State/Line/PlannedS | Float8 |  | 0 |  |  | Packaging engine state: PlannedS. |
| BR/_Sim_/State/Line/Ramp | Float8 |  | 0 |  |  | Packaging engine state: Ramp. |
| BR/_Sim_/State/Line/StopS | Float8 |  | 0 |  |  | Packaging engine state: StopS. |
| BR/_Sim_/State/Line/ChangeS | Float8 |  | 0 |  |  | Packaging engine state: ChangeS. |
| BR/_Sim_/State/Line/LineCipS | Float8 |  | 0 |  |  | Packaging engine state: LineCipS. |
| BR/_Sim_/State/Line/RunTotal | Float8 |  | 0 |  |  | Packaging engine state: RunTotal. |
| BR/_Sim_/State/Line/RunGoodF | Float8 |  | 0 |  |  | Packaging engine state: RunGoodF. |
| BR/_Sim_/State/Line/RunRejF | Float8 |  | 0 |  |  | Packaging engine state: RunRejF. |
| BR/_Sim_/State/Line/RejBoost | Float8 |  | 0 |  |  | Packaging engine state: RejBoost. |
| BR/_Sim_/State/Line/GoodDayF | Float8 |  | 0 |  |  | Packaging engine state: GoodDayF. |
| BR/_Sim_/State/Line/FaultAutoS | Float8 |  | 0 |  |  | Packaging engine state: FaultAutoS. |
| BR/_Sim_/State/Line/RecentGood | Float8 |  | 0 |  |  | Packaging engine state: RecentGood. |
| BR/_Sim_/State/Line/RecentRej | Float8 |  | 0 |  |  | Packaging engine state: RecentRej. |
| BR/_Sim_/State/Line/StopReason | String |  | "" |  |  | Reason of the running micro stop. |
| BR/_Sim_/State/Line/BBT | String |  | "" |  |  | BBT being emptied by the line. |
| BR/_Sim_/State/FV/FV01/PhaseDays | Float8 |  | 0 |  |  | Fermenter engine state: PhaseDays. |
| BR/_Sim_/State/FV/FV01/OG | Float8 |  | 0 |  |  | Fermenter engine state: OG. |
| BR/_Sim_/State/FV/FV01/FGt | Float8 |  | 0 |  |  | Fermenter engine state: FGt. |
| BR/_Sim_/State/FV/FV01/LagDays | Float8 |  | 0 |  |  | Fermenter engine state: LagDays. |
| BR/_Sim_/State/FV/FV01/Stall | Float8 |  | 0 |  |  | Fermenter engine state: Stall. |
| BR/_Sim_/State/FV/FV01/XferMin | Float8 |  | 0 |  |  | Fermenter engine state: XferMin. |
| BR/_Sim_/State/FV/FV01/DOBase | Float8 |  | 0 |  |  | Fermenter engine state: DOBase. |
| BR/_Sim_/State/FV/FV02/PhaseDays | Float8 |  | 0 |  |  | Fermenter engine state: PhaseDays. |
| BR/_Sim_/State/FV/FV02/OG | Float8 |  | 0 |  |  | Fermenter engine state: OG. |
| BR/_Sim_/State/FV/FV02/FGt | Float8 |  | 0 |  |  | Fermenter engine state: FGt. |
| BR/_Sim_/State/FV/FV02/LagDays | Float8 |  | 0 |  |  | Fermenter engine state: LagDays. |
| BR/_Sim_/State/FV/FV02/Stall | Float8 |  | 0 |  |  | Fermenter engine state: Stall. |
| BR/_Sim_/State/FV/FV02/XferMin | Float8 |  | 0 |  |  | Fermenter engine state: XferMin. |
| BR/_Sim_/State/FV/FV02/DOBase | Float8 |  | 0 |  |  | Fermenter engine state: DOBase. |
| BR/_Sim_/State/FV/FV03/PhaseDays | Float8 |  | 0 |  |  | Fermenter engine state: PhaseDays. |
| BR/_Sim_/State/FV/FV03/OG | Float8 |  | 0 |  |  | Fermenter engine state: OG. |
| BR/_Sim_/State/FV/FV03/FGt | Float8 |  | 0 |  |  | Fermenter engine state: FGt. |
| BR/_Sim_/State/FV/FV03/LagDays | Float8 |  | 0 |  |  | Fermenter engine state: LagDays. |
| BR/_Sim_/State/FV/FV03/Stall | Float8 |  | 0 |  |  | Fermenter engine state: Stall. |
| BR/_Sim_/State/FV/FV03/XferMin | Float8 |  | 0 |  |  | Fermenter engine state: XferMin. |
| BR/_Sim_/State/FV/FV03/DOBase | Float8 |  | 0 |  |  | Fermenter engine state: DOBase. |
| BR/_Sim_/State/FV/FV04/PhaseDays | Float8 |  | 0 |  |  | Fermenter engine state: PhaseDays. |
| BR/_Sim_/State/FV/FV04/OG | Float8 |  | 0 |  |  | Fermenter engine state: OG. |
| BR/_Sim_/State/FV/FV04/FGt | Float8 |  | 0 |  |  | Fermenter engine state: FGt. |
| BR/_Sim_/State/FV/FV04/LagDays | Float8 |  | 0 |  |  | Fermenter engine state: LagDays. |
| BR/_Sim_/State/FV/FV04/Stall | Float8 |  | 0 |  |  | Fermenter engine state: Stall. |
| BR/_Sim_/State/FV/FV04/XferMin | Float8 |  | 0 |  |  | Fermenter engine state: XferMin. |
| BR/_Sim_/State/FV/FV04/DOBase | Float8 |  | 0 |  |  | Fermenter engine state: DOBase. |
| BR/_Sim_/State/FV/FV05/PhaseDays | Float8 |  | 0 |  |  | Fermenter engine state: PhaseDays. |
| BR/_Sim_/State/FV/FV05/OG | Float8 |  | 0 |  |  | Fermenter engine state: OG. |
| BR/_Sim_/State/FV/FV05/FGt | Float8 |  | 0 |  |  | Fermenter engine state: FGt. |
| BR/_Sim_/State/FV/FV05/LagDays | Float8 |  | 0 |  |  | Fermenter engine state: LagDays. |
| BR/_Sim_/State/FV/FV05/Stall | Float8 |  | 0 |  |  | Fermenter engine state: Stall. |
| BR/_Sim_/State/FV/FV05/XferMin | Float8 |  | 0 |  |  | Fermenter engine state: XferMin. |
| BR/_Sim_/State/FV/FV05/DOBase | Float8 |  | 0 |  |  | Fermenter engine state: DOBase. |
| BR/_Sim_/State/FV/FV06/PhaseDays | Float8 |  | 0 |  |  | Fermenter engine state: PhaseDays. |
| BR/_Sim_/State/FV/FV06/OG | Float8 |  | 0 |  |  | Fermenter engine state: OG. |
| BR/_Sim_/State/FV/FV06/FGt | Float8 |  | 0 |  |  | Fermenter engine state: FGt. |
| BR/_Sim_/State/FV/FV06/LagDays | Float8 |  | 0 |  |  | Fermenter engine state: LagDays. |
| BR/_Sim_/State/FV/FV06/Stall | Float8 |  | 0 |  |  | Fermenter engine state: Stall. |
| BR/_Sim_/State/FV/FV06/XferMin | Float8 |  | 0 |  |  | Fermenter engine state: XferMin. |
| BR/_Sim_/State/FV/FV06/DOBase | Float8 |  | 0 |  |  | Fermenter engine state: DOBase. |
| BR/_Sim_/State/FV/FV07/PhaseDays | Float8 |  | 0 |  |  | Fermenter engine state: PhaseDays. |
| BR/_Sim_/State/FV/FV07/OG | Float8 |  | 0 |  |  | Fermenter engine state: OG. |
| BR/_Sim_/State/FV/FV07/FGt | Float8 |  | 0 |  |  | Fermenter engine state: FGt. |
| BR/_Sim_/State/FV/FV07/LagDays | Float8 |  | 0 |  |  | Fermenter engine state: LagDays. |
| BR/_Sim_/State/FV/FV07/Stall | Float8 |  | 0 |  |  | Fermenter engine state: Stall. |
| BR/_Sim_/State/FV/FV07/XferMin | Float8 |  | 0 |  |  | Fermenter engine state: XferMin. |
| BR/_Sim_/State/FV/FV07/DOBase | Float8 |  | 0 |  |  | Fermenter engine state: DOBase. |
| BR/_Sim_/State/FV/FV08/PhaseDays | Float8 |  | 0 |  |  | Fermenter engine state: PhaseDays. |
| BR/_Sim_/State/FV/FV08/OG | Float8 |  | 0 |  |  | Fermenter engine state: OG. |
| BR/_Sim_/State/FV/FV08/FGt | Float8 |  | 0 |  |  | Fermenter engine state: FGt. |
| BR/_Sim_/State/FV/FV08/LagDays | Float8 |  | 0 |  |  | Fermenter engine state: LagDays. |
| BR/_Sim_/State/FV/FV08/Stall | Float8 |  | 0 |  |  | Fermenter engine state: Stall. |
| BR/_Sim_/State/FV/FV08/XferMin | Float8 |  | 0 |  |  | Fermenter engine state: XferMin. |
| BR/_Sim_/State/FV/FV08/DOBase | Float8 |  | 0 |  |  | Fermenter engine state: DOBase. |
| BR/_Sim_/State/FV/FV09/PhaseDays | Float8 |  | 0 |  |  | Fermenter engine state: PhaseDays. |
| BR/_Sim_/State/FV/FV09/OG | Float8 |  | 0 |  |  | Fermenter engine state: OG. |
| BR/_Sim_/State/FV/FV09/FGt | Float8 |  | 0 |  |  | Fermenter engine state: FGt. |
| BR/_Sim_/State/FV/FV09/LagDays | Float8 |  | 0 |  |  | Fermenter engine state: LagDays. |
| BR/_Sim_/State/FV/FV09/Stall | Float8 |  | 0 |  |  | Fermenter engine state: Stall. |
| BR/_Sim_/State/FV/FV09/XferMin | Float8 |  | 0 |  |  | Fermenter engine state: XferMin. |
| BR/_Sim_/State/FV/FV09/DOBase | Float8 |  | 0 |  |  | Fermenter engine state: DOBase. |
| BR/_Sim_/State/FV/FV10/PhaseDays | Float8 |  | 0 |  |  | Fermenter engine state: PhaseDays. |
| BR/_Sim_/State/FV/FV10/OG | Float8 |  | 0 |  |  | Fermenter engine state: OG. |
| BR/_Sim_/State/FV/FV10/FGt | Float8 |  | 0 |  |  | Fermenter engine state: FGt. |
| BR/_Sim_/State/FV/FV10/LagDays | Float8 |  | 0 |  |  | Fermenter engine state: LagDays. |
| BR/_Sim_/State/FV/FV10/Stall | Float8 |  | 0 |  |  | Fermenter engine state: Stall. |
| BR/_Sim_/State/FV/FV10/XferMin | Float8 |  | 0 |  |  | Fermenter engine state: XferMin. |
| BR/_Sim_/State/FV/FV10/DOBase | Float8 |  | 0 |  |  | Fermenter engine state: DOBase. |
| BR/_Sim_/State/FV/FV11/PhaseDays | Float8 |  | 0 |  |  | Fermenter engine state: PhaseDays. |
| BR/_Sim_/State/FV/FV11/OG | Float8 |  | 0 |  |  | Fermenter engine state: OG. |
| BR/_Sim_/State/FV/FV11/FGt | Float8 |  | 0 |  |  | Fermenter engine state: FGt. |
| BR/_Sim_/State/FV/FV11/LagDays | Float8 |  | 0 |  |  | Fermenter engine state: LagDays. |
| BR/_Sim_/State/FV/FV11/Stall | Float8 |  | 0 |  |  | Fermenter engine state: Stall. |
| BR/_Sim_/State/FV/FV11/XferMin | Float8 |  | 0 |  |  | Fermenter engine state: XferMin. |
| BR/_Sim_/State/FV/FV11/DOBase | Float8 |  | 0 |  |  | Fermenter engine state: DOBase. |
| BR/_Sim_/State/FV/FV12/PhaseDays | Float8 |  | 0 |  |  | Fermenter engine state: PhaseDays. |
| BR/_Sim_/State/FV/FV12/OG | Float8 |  | 0 |  |  | Fermenter engine state: OG. |
| BR/_Sim_/State/FV/FV12/FGt | Float8 |  | 0 |  |  | Fermenter engine state: FGt. |
| BR/_Sim_/State/FV/FV12/LagDays | Float8 |  | 0 |  |  | Fermenter engine state: LagDays. |
| BR/_Sim_/State/FV/FV12/Stall | Float8 |  | 0 |  |  | Fermenter engine state: Stall. |
| BR/_Sim_/State/FV/FV12/XferMin | Float8 |  | 0 |  |  | Fermenter engine state: XferMin. |
| BR/_Sim_/State/FV/FV12/DOBase | Float8 |  | 0 |  |  | Fermenter engine state: DOBase. |
| BR/_Sim_/State/BBT/BBT1/PhaseDays | Float8 | d | 0 |  |  | Bright tank engine state: biological days in phase. |
| BR/_Sim_/State/BBT/BBT2/PhaseDays | Float8 | d | 0 |  |  | Bright tank engine state: biological days in phase. |
| BR/_Sim_/State/BBT/BBT3/PhaseDays | Float8 | d | 0 |  |  | Bright tank engine state: biological days in phase. |
| BR/_Sim_/State/BBT/BBT4/PhaseDays | Float8 | d | 0 |  |  | Bright tank engine state: biological days in phase. |
<!-- tag-table:end -->
