# Campus Microgrid (Svelte 5 + PixiJS 8)

Full-viewport living campus map bound to the live `[default]MG/` tags (task-67; ADR-005 Amendments A1 and A3; the SVG diagram of task-67 was replaced by the Pixi map in task-82).
Served by the Ignite gateway at site `microgrid`; the gateway injects `window.__IGNITE_ENV__`. Overlays (trends,
alarms, dispatch and scenario controls, identity panel, audit) were added in task-68 and are unchanged.

## What is on screen

- **Campus map** (`src/campus/`, PixiJS 8, lazy chunk loaded after the first paint; everything is drawn from code in an oblique 2.5D view, one `project(x, y, z)` for art, shadows, flows and hit areas; static art is cached per asset and depth-sorted): 4 PV fields of 6 tilted racking rows each on gravel pads behind a fence
  (row brightness from `String/Sn/DCkW` against the best string, scaled by the array's own irradiance tag, with a sun-angle glint; a combiner box per string with a health LED, two inverter cabinets per array with spinning fans and `Inverter/A|B/State` LEDs, a flag when curtailed, a faulted inverter pulses its three rows red),
  2 BESS containers (corrugated walls, doors, roof HVAC fans spinning with |kW|, SOC panel on the front, warning signs, charge / discharge glow), a genset in an acoustic enclosure (louvres, radiator fan, exhaust stack with shimmer when RUNNING, fuel tank with a level stripe from `Genset/FuelPct`, START countdown badge),
  a 10-bay EV lot under a solar canopy (pedestals with a state / SOC LED ring and a cable, 3D cars arriving and leaving, CURTAILED dimmed, FAULT pulsing), 3 buildings (Office: 4-floor glass curtain wall with entrance canopy, roof plant and a roof PV strip; Lab: brick and panel facade, loading dock, exhaust stacks, generator pad, roof sign with the CRITICAL badge; Residence: 3 floors, balconies, pitched tile roof, chimneys; windows light floor by floor at night by `kW`, roof fans follow `HVACkW`, SHED dimmed),
  the substation yard (two transformers with fins, bushings and conservators, breaker, meter cabinet, gantry, fence) with the disconnect that snaps open with an arc flash on islanding and the utility pole line, plus roads with kerbs, markings and crossings, footpaths, hedges, a pond, a fence line, three tree kinds in three sizes, street lamps with light cones, buried-cable trenches and a nameplate on every asset.
- **Sun and clouds** (`sky.ts`, `cloud.ts`): azimuth derived from the hour (06 h east, 12 h south, 18 h west), elevation from `Time/SunElevationDeg`; every asset casts a projected shadow polygon
  (length 1 / tan(elevation), capped; one layer, opacity fades towards the horizon and softens under cloud). A multiply grade gives night blue and warm dawn / dusk; street lights and windows come on at night.
  One full-screen `Filter` (fbm noise in world space, `uTime`, `uCloudiness`, drift) draws cloud shadows over the campus; array brightness also follows each `PV/An/IrradianceWm2`.
- **Energy** (`flows.ts`, `network.ts`): buried conductors from every asset to the substation bus; a `ParticleContainer` streams along them, density from |kW|, colour by source
  (PV amber, battery blue, charging teal, grid green, genset grey), direction by sign. The trunk carries the net flow between taps. `Grid/Islanded` snaps the utility link open with a flash,
  the campus dips for half a second, the genset starts and the flows re-route; resync closes the link. kW numbers show only on hover.
- **Camera and interaction**: fit to the viewport (clear of the HUD) with a gentle idle drift, drag to pan, wheel to zoom, `R` resets. Hover shows the live tooltip (arrays show the 2 inverters x 6 strings flyout),
  click selects (`selection.svelte.ts`; opens Trends on that element), `Esc` clears.
- **Day strip** (`src/strip/`): a translucent band over the map: sun arc and cloud layer from `Time/*`, time-of-use band, hour marker, demand window.
- **HUD** (`src/hud/`): a slim top band (brand, scenario and speed chips, SSE link chip with tag count / data age / trial notice, identity chip, help) and a compact left rail
  (mode, alarms, net load, PV fraction, self-sufficiency, cost vs baseline, savings, CO2, peak import; numbers roll).
- `?perf` in the URL shows the performance readout (always in dev; `P` toggles): fps, frame times, DOM nodes, SSE rates and the scene's sprite, particle and draw-call counts.
  Reduced motion: shadows are drawn for the current hour only and refreshed in coarse steps, no particles, no cloud drift, no camera drift. `?renderer=canvas` forces the 2D fallback (no cloud pass).
- `?` or `?about` opens help.

## Overlays (right dock; keys T / A / C / L, `Esc` closes help, then the selection, then the panel)

- **Trends (T)**, `src/overlays/trends/`: Forecast vs actual PV, Forecast vs actual load, Grid import with the demand-limit and baseline-peak lines and the demand window shaded, BESS SOC with the tariff bands shaded, Cost today vs baseline. Windows: Today (the last 12 real minutes = 24 simulated hours) and 3 days (36 real minutes); `returnSize` 144. The x axis is in **simulated hours** (weekday on the 3-day view): history is stored against wall-clock time and mapped with the live `Time/DayIndex`, `Time/HourOfDay` and `_Sim_/SpeedFactor` tags, so a speed change or `set_hour` bends the older part of the window. Live values are appended once per history bucket (5 s) and a chart redraws only when a point was added or aged out (every 5 s), not at the 500 ms poll. Clicking an element on the map adds its charts on top: array (array AC/DC, the two inverters, six strings), BESS (SOC, kW, cell temperature), charger (kW and car SOC; SOC is not historized, so it fills live), building (kW, HVAC), plus EV bank, genset and utility. ECharts is a lazy chunk, loaded when the first chart mounts.
- **Alarms (A)**: grouped by subsystem (PV array, BESS, Grid, Genset, EV, Loads); priority, state, label, live value, age; filters Active / Needs ack / All events; acknowledge per row, per group and all visible (write tier, disabled with the reason otherwise). The PV fault cascade (inverter, strings, array health) is drawn as a timeline with offsets from the first event. Zero-length Cleared/Acknowledged load artefacts (`activeTime == clearTime`) are dropped.
- **Controls (C)**: Operator tier: BESS mode per container, Grid outage / restore, Inverter fault A_n_-A/B and Clear, Curtail PV (array, kW, release), EV smart charging, Cloudiness (slider, Auto), Jump to hour. Director tier: scenario (`normal`, `grid_outage`, `cloud_front_ev_rush`, `peak_shave_day`, `inverter_fault`) and speed (30 / 60 / 120 / 240). Each action toasts the library `message` and refreshes `mg.status()`; anonymous and Viewer see the live state with "Log in to operate".
- **Login (L)**: three states: nobody (Viewer by API key, login form), Gateway session ("Gateway session · user" and "Log in as a different user"), Bearer (tier chip, Log out, Log out everywhere). Audit view for Director: last 30 minutes of the audit profile named by `__IGNITE_ENV__.IGNITE_AUDIT_PROFILE`, grouped by actor, every 10 s; hidden when the profile is absent.
- Reduced motion: flows stop, numbers jump instead of rolling, CSS motion tokens go to 0.

## Screenshots

Headless Chrome, 1920x1080, live data (software-rendered, so only the look is representative).

![Noon: PV fields, BESS, EV canopies, genset and substation with live flows](../docs/screenshots/microgrid-campus-noon.png)
![Evening under heavy cloud: street lights, lit windows, grid import](../docs/screenshots/microgrid-campus-night-cloud.png)
![Grid outage: utility link open, genset RUN, BESS forming the grid, EV bays curtailed](../docs/screenshots/microgrid-island.png)

## Performance

`?perf` shows a readout (fps, frame time p50/p95/max, DOM nodes, SSE batches/s, updates/s, sprites, particles, draw calls); `P` toggles it. Measurements (campus scene, close-out task-83): [`docs/perf.md`](../docs/perf.md).

## Connection model

One SSE connection on the folder pattern `[default]MG/**` (405 tags). The server answers with `event: subscribed` (count) and the client
delivers the initial snapshot as one batch, applied in one pass to a reactive map (`src/live/store.svelte.ts`). `src/live/paths.ts` and
`units.ts` are generated from `sim/microgrid/tags.json` (`npm run gen`, run by `dev`, `build` and `test`). Health probe: `GET /system/status`
every 60 s; `trialExpired` means history and alarms stop (tags keep moving).

## Development

Copy `.env.example` to `.env.development.local` (git-ignored; never `.env.local`), then `npm run dev -w @ignite/microgrid`.
`npm run check` runs `svelte-check`; `npm run build` includes it. The audit view needs the profile name from the gateway (`window.__IGNITE_ENV__.IGNITE_AUDIT_PROFILE`, from the site's `envVars` `{"IGNITE_AUDIT_PROFILE":"<profile>"}`); in dev, set that global in the browser console to see it.

## Feature matrix

| Route | Tier | Used in |
|---|---|---|
| `GET /sse` | key | `live/store.svelte.ts`: one connection on `[default]MG/**` (405 tags), snapshot then changes |
| `GET /tags/read` | key | n/a: the SSE stream opens with a snapshot of every subscribed tag |
| `GET /tags/browse` | key | n/a: names are generated from `sim/microgrid/tags.json` at build time (`scripts/gen-paths.mjs`) |
| `GET /tags/history` | key | Every Trends chart (`overlays/trends/history.ts`, `returnSize` 144) |
| `POST /tags/write` | write | n/a: every state change goes through the `mg` library, which owns the `_Sim_` tags; a Viewer gets 403 (curl matrix) |
| `GET /system/status` | key | Health probe (`probeHealth()`, on connect and every 60 s): `license.trialExpired` drives the "Trial expired - history/alarms paused" notice; in Trial mode the link chip's tooltip shows "Trial - 1 h 42 m left" (`live/store.svelte.ts`) |
| `GET /alarms/status` | key | Alarm board and HUD tile (`overlays/alarms/store.svelte.ts`), polled every 3 s, paused while the tab is hidden |
| `GET /alarms/history` | key | n/a: the lab has no alarm journal (the launch and datacenter demos do not use one either) and `/alarms/status` already carries cleared events with active and clear times, enough for the cascade timeline; the history tab is therefore not offered |
| `POST /alarms/acknowledge` | write | Alarm board: per row, per group, all visible |
| `GET /script/projects` | key | n/a in the UI (the project is fixed to `demo`); checked in the curl matrix |
| `POST /script/library` | write | Controls: `mg.status/set_mode/grid_outage/grid_restore/inverter_fault/curtail_pv/ev_smart/set_cloudiness/set_hour/set_scenario/set_speed` |
| `POST /script/system` | write | n/a: the library is the whole command surface |
| `POST /auth/login` | none | Login panel; 401 is a generic message, 429 a lockout message |
| `GET /auth/session` | token | Tier, panel state (`authMethod`, `canLogout`, `securityLevels`); refreshed after login, logout, on `unauthorized` and when the tab becomes visible |
| `POST /auth/logout` | token | Login panel: Log out / Log out everywhere; 400 for non-bearer callers is treated as nothing logged out |
| `GET /audit/logs` | admin | Login panel, Director only (`overlays/identity/audit.svelte.ts`) |
| `POST /db/query` | key | n/a: the microgrid has no database; history comes from the tag historian |
| `/sites*`, `/system/*` | admin | n/a: gateway administration (the audit profile is set once through `PUT /sites/:id` `envVars`) |

The site is scoped to `[default]MG/**`: every tag path the page touches is under it; a path outside it (for example `[default]Launch/Clock/Phase`) is 403 with the microgrid key.
