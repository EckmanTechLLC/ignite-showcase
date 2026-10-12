# Launch Operations (demo 1)

React 18 + Vite + React Three Fiber scene over live Ignition data, with overlays for telemetry, alarms, sequencer control, login and audit. Everything talks to the gateway through `@ignite/client`; the gateway injects `window.__IGNITE_ENV__` (`IGNITE_GATEWAY_URL`, `IGNITE_SITE`, `IGNITE_API_KEY`, `IGNITE_AUDIT_PROFILE`).

## Keys

| Key | Action |
|---|---|
| `1`-`6`, `D` | Camera presets, auto-director |
| `T` | Telemetry charts (lazy-loaded ECharts chunk) |
| `A` | Alarm board (the HUD badge pulses while a Critical alarm is active) |
| `C` | Sequencer and Director controls |
| `L` | Login, session, audit ticker |
| `Esc` | Close all panels |

## Auth tiers

The UI is role-generic (ADR-005 section 7) and reads `/auth/session` `permissions`; the gateway enforces every tier.

| UI tier | Server tier | Can |
|---|---|---|
| Viewer (also anonymous) | API key (read) | Everything visible; controls disabled with a "Log in to operate" hint |
| Operator | `permissions.canWrite` | Alarm acknowledge; Start count, Hold (reason), Resume, Abort, Recycle, Restart count, Go/No-Go overrides |
| Director | `permissions.canAdmin` | Operator plus scenario launcher, speed, fault injectors, audit ticker |

An expired token comes back from the gateway as a key-only session (not a 401); the client re-checks `/auth/session` every 30 s and after any 403, and drops to Viewer on the `unauthorized` event.

## Restarting the count

Controls > **Restart count** (Operator, confirm) aborts the running count, recycles the vehicle and starts a new one, one step per sequencer state (the sim only recycles from HOLD/ABORT/SAFING/ORBIT and only starts from IDLE). **Recycle** and **Start count** are also available on their own. A run past lift-off cannot be aborted; the macro waits for ORBIT/SAFING and then recycles.

## Feature matrix

Every Ignite route and where the UI uses it.

| Route | Tier | Used in |
|---|---|---|
| `GET /tags/read` | key | `live/store.ts`: initial read of all 110 tags, resync after an SSE reconnect |
| `GET /sse` (tag change stream) | key | `live/store.ts`: one coalesced subscription drives the scene, HUD and charts' live samples |
| `GET /tags/browse` | key | n/a: the tag list is generated from `sim/launch/tags.json` at build time (`scripts/gen-paths.mjs`), so there is nothing to discover at run time; client wrapper and curl matrix cover it |
| `GET /tags/history` | key | Telemetry panel (`overlays/telemetry/feed.ts`): 60-point back-fill per channel on open, window or channel change |
| `POST /tags/write` | write | n/a: all state changes go through the `launch` library so the sequencer validates them; the curl matrix checks that a Viewer gets 403 |
| `GET /alarms/status` | key | Alarm board and HUD badge (`overlays/alarms/store.ts`), polled every 3 s, paused while the tab is hidden |
| `GET /alarms/history` | key | n/a: the board is a live view; cleared-unacknowledged alarms stay in status until acknowledged, so a journal adds nothing here |
| `POST /alarms/acknowledge` | write | Alarm board: per-row **Ack** and **Ack all visible** (`ids[]`) |
| `GET /script/projects` | key | n/a in the UI (the project name `demo` is fixed); checked in the curl matrix |
| `POST /script/library` | write | Controls panel: `launch.status/start_count/hold/resume/abort/recycle/set_go/set_scenario/set_speed/inject_fault` |
| `POST /script/system` | write | n/a: no raw `system.*` calls from a browser demo; the library is the whole command surface |
| `POST /auth/login` | none | Identity panel; 401 is a generic message, 429 shows the `Retry-After` lockout time |
| `GET /auth/session` | token | Session chip and tier (Viewer / Operator / Director) |
| `POST /auth/logout` | token | Identity panel: **Log out** |
| `GET /audit/logs` | admin | Audit ticker in the Identity panel (Director): last 15 min, every 10 s |
| `POST /db/query` (named queries) | key | n/a: the lab has no database connection, so there is no named query to run (ADR-005 allows the panel to be absent) |

The alarm feed returns every alarm on the gateway; the board keeps only `Launch/` sources and drops zero-length Cleared/Acknowledged events (no `activeTime`) that a tag load leaves behind.

## Telemetry

Default channels: LOX/CH4 `PressureBar`, LOX/CH4 `TankLevelPct`, `GSEPower/BusAVolts`, `WindSpeedMS`; from IGNITION to ORBIT the panel shows `AltitudeM`, `VelocityMS`, `AccelG`, `ThrustPct`. The picker lists the 27 numeric tags the model trends (generated into `live/trended.ts`). Windows 1/5/15 min, pause/resume, a shared time cursor across charts. History points that are null or implausible (the uninitialised constants `1.8e-248` etc.) are dropped; live samples are recorded at 1 Hz and charts redraw at 2 Hz, outside the R3F tree.

## Development

`npm run dev -w @ignite/launch` proxies `/data/ignite` to `VITE_GATEWAY_URL`. Put the values in `launch/.env.development.local` (git-ignored, loaded only by the dev server; production builds never read any `.env` file, so the key cannot reach `dist/`):

    VITE_GATEWAY_URL=<gateway origin>
    VITE_SITE=launch
    VITE_API_KEY=<site read key>
    VITE_AUDIT_PROFILE=<audit profile name>   # optional: shows the audit ticker in dev

On the gateway, the audit profile reaches the page through the site record: set the site's `envVars` to `{"IGNITE_AUDIT_PROFILE":"<profile>"}`; without it the ticker is hidden.

## Bundle (production build)

| Chunk | Size | Gzip | Loads |
|---|---|---|---|
| `index` (app, HUD, overlays) | 243.6 kB | 78.0 kB | at start |
| `r3f` (React Three Fiber, post-processing) | 323.9 kB | 124.5 kB | at start |
| `three` | 740.7 kB | 187.8 kB | at start |
| `echarts` (tree-shaken line chart, canvas) | 495.3 kB | 167.5 kB | first time `T` is pressed |
| `TelemetryPanel` | 6.1 kB | 2.7 kB | first time `T` is pressed |
| CSS | 20.1 kB | 4.8 kB | at start |
| 4 woff2 fonts | 633 kB | n/a | at start |
