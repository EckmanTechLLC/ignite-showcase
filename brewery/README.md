# Craft Brewery (SolidJS + PixiJS 8)

Full-viewport isometric brewery bound to the live `[default]BR/` tags (task-73; ADR-005 Amendment A2). Served by the Ignite
gateway at site `brewery`; the gateway injects `window.__IGNITE_ENV__`. Overlays (batch, trends, alarms, controls, identity,
audit) were added in task-74.

## What is on screen

- **Plant** (`src/plant/`, Pixi, WebGL with canvas fallback, `?renderer=canvas` forces it): brewhouse (mill, mash tun, lauter tun,
  kettle, whirlpool, wort chiller, HLT, CLT), 12 fermenters, 4 bright tanks, 8-machine packaging line on a conveyor, utilities
  (boiler, glycol chiller, CO2, air, CIP skid). Vessels show level (liquid in the recipe colour), temperature (jacket tint), phase and
  the batch tag. Pipes carry wort, beer, glycol and steam only while a transfer or demand is active; particles: kettle and HLT steam,
  boil roll, CO2 bubbles in fermenting tanks, cans at `SpeedCPM`, pallet stacking. Faults and process deviations pulse red; a line stop
  shows its reason on the machine. Hover: live tooltip (DOM). Click: selection (`src/selection.ts`; a batch bar opens the Batch panel, any other item opens Trends). Drag pans, wheel
  zooms, `R` resets, gentle idle drift.
- **Batch strip** (`src/strip/`): ISA-88 Gantt of every active batch (`BR/Batches/B01..B24`, state not PLANNED / COMPLETE / DUMPED) plus
  the next planned one, phases grouped (mash, lauter, boil, whirlpool, knock-out, fermentation, conditioning, packaging), recipe colour,
  QA HOLD hatched, a marker for the simulated "now". **OEE tile**: availability x performance x quality as bars, the downtime reason, rolling counts.
- **HUD**: KPIs, mode badge, scenario and speed chips, alarm count, SSE link chip (with the trial notice), identity chip (anonymous / gateway session / bearer); the alarm tile and the identity chip open their panels, the alarm tile pulses while a High or Critical alarm is active (the model's highest priority is High). `?perf` shows
  the readout (fps, frame p50/p95, draw calls, sprites, SSE batches/s; `P` toggles), `?` or `?about` opens help. Reduced motion: particles off, flows static.

## Overlays (right dock; keys B / T / A / C / L, `Esc` closes help, then the selection, then the panel)

- **Batch (B)**, `src/overlays/batch/`: for the selected batch (a vessel, a strip bar or the list): recipe card; the ISA-88 phase timeline with the **actual** simulated hours from `Batches/Bnn/Timeline` against the **recipe** hours (derived from the recipe tags and the sim model: fixed unit-phase minutes plus the recipe's rest and boil times; fermentation, conditioning and carbonation at the current `FermentAccel`); the live values of every unit that holds the batch (same rows as the tooltip); QA per sample point (end of boil, end of fermentation, before packaging) with `PASS | HOLD | FAIL | PENDING`. The fermentation verdict is the batch record's `QAStatus`; the wort and pre-package verdicts are checked against the recipe in the page (OG within 1.0 °P, IBU within 20 %, DO at most 100 ppb) and labelled so. Genealogy chain (brewhouse units, fermenter, bright tank, packaging run, pallets) with yeast strain and format; the yeast generation is the cellar's current pitch generation (the model does not store it per batch). During the `contamination` scenario an "at risk" box names the held batch and the batches sharing its fermenter, bright tank or yeast strain. QA release and QA dump (write tier). Second tab: all 24 ring records with a state filter (all, active, hold, planned, complete, dumped).
- **Trends (T)**, `src/overlays/trends/`: Fermentation (gravity solid and temperature dashed of every fermenting FV, overlaid, in the recipe colour, with each recipe's target FG as a dashed line), Cellar temperatures vs setpoints (current setpoints as thin dashed lines; setpoints are not historized), Line OEE over the shift (stacked to 100 %: OEE plus the availability, performance and quality losses it is made of), an OEE waterfall (planned minutes down to good minutes, from `Packaging/OEE/*`), Utilities (glycol load and supply temperature, boiler pressure and CO2 tank). Windows: Shift (8 simulated hours, 8 real minutes at 60x) and Batch (the longest fermentation in the cellar plus a margin, 24 to 48 simulated hours, in 6 h steps). The x axis is in **simulated time** ("D3 14:00"): history is stored against wall-clock time and mapped with `Time/DayIndex`, `Time/HourOfDay` and `_Sim_/SpeedFactor`, so a speed change bends the older part of the window. 240 history points per chart; live values are appended once per bucket and a chart redraws only when a point was added or aged out (at most 4 per second). Click-to-trend: a fermenter (temperature with setpoint, gravity and ABV, level and pH, pressure and glycol valve), a bright tank, a brewhouse unit, a machine (counts in/out, not historized so they fill live, plus line speed and good/reject counts), the line or a utility. ECharts is a lazy chunk.
- **Alarms (A)**: grouped by area (brewhouse, cellar with one group per fermenter, packaging, utilities, quality); priority, state, label, live value, age; filters Active / Needs ack / All events and a "show load artefacts" toggle (the zero-length Cleared events the tag load creates, hidden by default); acknowledge per row, per group and all visible (write tier, disabled with the reason otherwise). The **glycol failure cascade** (glycol supply and load, then the fermenter temperature and pressure alarms, then the QA hold) is a timeline with offsets from the first alarm of the latest failure.
- **Controls (C)**: Operator tier: Start batch (recipe picker), Hold / Resume line, Changeover (CAN / KEG), CIP (unit picker), Clear fault, Glycol restore, QA release / dump (also in Batch). Director tier: scenario (`normal`, `glycol_failure`, `filler_jam`, `stuck_sparge`, `boil_over`, `contamination`, `rush_order`), Inject fault (named), Schedule (brews per day and recipe queue), Speed (30 / 60 / 120 / 240) and Ferment acceleration (4 / 8 / 16). Each action toasts the library `message` and refreshes `brew.status()`; anonymous and Viewer see the live state with "Log in to operate". Director gating is in the UI only; the library is write tier.
- **Login (L)**: three states: nobody (Viewer by API key, login form), Gateway session ("Gateway session · user" and "Log in as a different user"), Bearer (tier chip, Log out, Log out everywhere). Audit view for Director: last 30 minutes of the audit profile named by `__IGNITE_ENV__.IGNITE_AUDIT_PROFILE`, grouped by actor, every 10 s; hidden when the profile is absent.
- Reduced motion: particles off, flows static, the pulsing alarm tile and dock badge stop.

## Connection model

One SSE connection. The gateway caps a subscription at 1 000 expanded tags and the model holds 1 039 (131 are the engine state under
`_Sim_/State`, which the page never reads), so `src/live/paths.ts` lists folder patterns that cover the other 908 tags
(`Time`, `Recipes`, `Brewhouse`, `Cellar`, `Packaging`, `Utilities`, `Batches`, `Schedule`, `KPI`, `_Sim_/*`, `_Sim_/Fault`, `_Sim_/Request`); `event: subscribed`
confirms 908. `paths.ts` and `units.ts` are generated from `sim/brewery/tags.json` (`npm run gen`, run by `dev`, `build` and `test`). The store keeps a plain
copy of every value (read by the render loop) and one Solid signal per tag, created on first read and updated inside `batch()`.
Health probe: a 6-row history request for `Cellar/FV01/GravityP` every 60 s; all nulls means the gateway trial expired.

## Rendering notes

Static art (floors, pipe tubes, zone titles, vessel bodies, machines) is drawn once into cached textures and refreshed only when a
value changes, so the main canvas is not multisampled and a frame is a few textured quads plus the moving sprites. The Pixi chunk is loaded
lazily after the HTML shell and HUD have painted.

## Development

Copy `.env.example` to `.env.development.local` (git-ignored; never `.env.local`), then `npm run dev -w @ignite/brewery`.
`npm run build` runs `tsc --noEmit` first.

## Feature matrix

| Route | Tier | Used in |
|---|---|---|
| `GET /sse` | key | `live/store.ts`: one connection on 12 folder patterns covering 908 of the 1 039 tags (the gateway caps a subscription at 1 000), snapshot then changes |
| `GET /tags/read` | key | n/a: the SSE stream opens with a snapshot of every subscribed tag |
| `GET /tags/browse` | key | n/a: names are generated from `sim/brewery/tags.json` at build time (`scripts/gen-paths.mjs`) |
| `GET /tags/history` | key | Health probe (`live/store.ts`, `Cellar/FV01/GravityP`, every 60 s) and every Trends chart (`overlays/trends/history.ts`, 240 points) |
| `POST /tags/write` | write | n/a: every state change goes through the `brew` library, which owns the `_Sim_` and `Schedule` tags; a Viewer gets 403 (curl matrix) |
| `GET /alarms/status` | key | Alarm board, HUD tile and dock badge (`overlays/alarms/store.ts`), polled every 3 s, paused while the tab is hidden |
| `GET /alarms/history` | key | n/a: the lab has no alarm journal; `/alarms/status` carries cleared events with active and clear times, enough for the cascade timeline |
| `POST /alarms/acknowledge` | write | Alarm board: per row, per group, all visible |
| `GET /script/projects` | key | n/a in the UI (the project is fixed to `demo`); checked in the curl matrix |
| `POST /script/library` | write | Controls and Batch: `brew.status/start_batch/hold_line/resume_line/changeover/cip/clear_fault/glycol_restore/qa_release/qa_dump/set_scenario/inject_fault/set_schedule/set_speed/set_ferment_accel` |
| `POST /script/system` | write | n/a: the library is the whole command surface |
| `POST /auth/login` | none | Login panel; 401 is a generic message, 429 a lockout message |
| `GET /auth/session` | token | Tier and panel state (`authMethod`, `canLogout`, `securityLevels`); refreshed after login, logout, on `unauthorized` and when the tab becomes visible |
| `POST /auth/logout` | token | Login panel: Log out / Log out everywhere; 400 for non-bearer callers is treated as nothing logged out |
| `GET /audit/logs` | admin | Login panel, Director only (`overlays/identity/audit.ts`) |
| `POST /db/query` | key | n/a: the brewery has no database; history comes from the tag historian |
| `/sites*`, `/system/*` | admin | n/a: gateway administration (the audit profile is set once through `PUT /sites/:id` `envVars`) |

The site is scoped to `[default]BR/**`: every tag path the page touches is under it; a path outside it (for example `[default]MG/KPI/Mode`) is 403 with the brewery key.
