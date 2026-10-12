# Data Center (Vue 3)

Top-down animated SVG data hall bound to live `[default]DC/` tags (task-56) with the operating overlays (task-57):
alarm board, trends, scenario controls, login and audit. Served by the Ignite gateway at site `datacenter`; the
gateway injects `window.__IGNITE_ENV__` (gateway URL, site, read key, and `IGNITE_AUDIT_PROFILE` from the site's
`envVars`). Nothing else configures the page.

## Keys and panels

| Key | Panel | What it does |
|---|---|---|
| `A` | Alarms | `/alarms/status` every 3 s (paused while the tab is hidden); grouped by source (racks by row, UPS, PDU, CRAH, Hall); filters Active / Needs ack / All; per-row, per-group and all-visible acknowledge; storm timeline (first High, first Critical, all clear) and a 15 min active-count sparkline from the board's own samples. The HUD ALARMS tile pulses on Critical. |
| `T` | Trends | PUE (1.6 line), IT and facility kW, hall max/avg inlet, UPS A/B load; windows 15 min / 1 h / 24 h from history, then live append from the store; redraw at most 2 Hz. Clicking a rack, CRAH, UPS or PDU opens a "Selected" chart (rack inlet + kW, CRAH supply/return/fan, UPS load + SOC, PDU load). ECharts is a lazy chunk. |
| `C` | Controls | Utility loss/restore, fail/restore CRAH 1-4, start migration, workload profile, restore all (confirm); Director: speed 0.5/1/2/4 and raw scenario set. Mode, scenario and speed chips live in the header; each action toasts the library message and refreshes `dc.status()`. |
| `L` | Identity | Login, session tier chip, logout, audit view (Director). `Esc` closes a panel, `p` toggles the perf readout. |

## Tiers

Role-generic names (ADR-005 section 7), derived from `/auth/session` `permissions`: Anonymous / Viewer (read) -> Operator
(`canWrite`: acknowledge, scenarios) -> Director (`canAdmin`: speed, raw scenario, audit). Disabled controls carry the
reason as their tooltip. A 401 on a call made with a stored token clears it and demotes to read-only (`onUnauthorized`).
The Director-only speed/raw-scenario controls are a UI gate: the server enforces only the write tier on `/script/library`.

## Feature matrix (every Ignite route)

| Route | Used by | Notes |
|---|---|---|
| `GET /tags/read` | n/a | No seed read and no constants poll: constants (rack Row/Feed/Workload, PDU Feed, CRAH Zone, Hall/CapacityKW) arrive in the SSE snapshot |
| `GET /sse` | `live/store.ts` | One connection on the folder pattern `[default]DC/**` (675 tags, 646 rendered), coalesced per frame |
| `GET /tags/history` | `overlays/trends/history.ts`, `live/store.ts` | Also the health probe (6 rows of `Hall/TotalFacilityKW` over 10 min, every 60 s). Trends: | `returnSize` 90 / 120 / 144 for 15 min / 1 h / 24 h; values arrive as strings; nulls and implausible constants (|v| < 1e-6 or > 1e7) are dropped |
| `GET /tags/browse` | n/a | Tag paths are generated at build time from `sim/datacenter/tags.json`; there is nothing to discover at runtime |
| `POST /tags/write` | n/a | The scene is read-only; scenarios are steered through the `dc` library, which owns the `_Sim_` tags |
| `GET /alarms/status` | `overlays/alarms/store.ts` | Filters other providers' alarms (`DC/` only) and the zero-length load artefacts (`activeTime == clearTime`) |
| `POST /alarms/acknowledge` | `overlays/alarms/store.ts` | One call per alarm id; write tier |
| `GET /alarms/history` | n/a | `/alarms/status` already carries cleared events with active/clear times, enough for the storm timeline |
| `POST /script/library` | `overlays/controls/dc.ts` | Project `demo`, `dc.status`, `set_scenario`, `restore`, `fail_crah`, `restore_crah`, `utility_loss`, `utility_restore`, `start_migration`, `set_workload_profile`, `set_speed` |
| `POST /script/system`, `GET /script/projects` | n/a | The demo calls named library functions only; raw `system.*` access is not needed and is the broader privilege |
| `POST /db/query` | n/a | The data center sim has no database; history comes from the tag historian |
| `POST /auth/login` | `identity/auth.ts` | 401 shown as a generic message, 429 as a lockout message |
| `GET /auth/session` | `identity/auth.ts` | `permissions` -> tier; refreshed after login, logout and on `unauthorized` |
| `POST /auth/logout` | `identity/auth.ts` | Server session invalidated, local token always cleared |
| `GET /audit/logs` | `identity/IdentityPanel.vue` | Director only; last 30 min every 10 s, grouped by actor; profile from `__IGNITE_ENV__.IGNITE_AUDIT_PROFILE`, audit hidden when absent |
| `/sites*`, `/system/*` | n/a | Gateway administration, not an operator-facing function (the audit profile is set once through `PUT /sites/:id` `envVars`) |

## Development

    npm ci && npm run build -w @ignite/client
    cp datacenter/.env.example datacenter/.env.development.local   # set VITE_API_KEY to the site's read key
    npm run dev -w @ignite/datacenter

Use `.env.development.local`, never `.env.local` (Vite also reads that one for `vite build`, which would bake the key
into the deployed output). The dev server proxies `/data/ignite` to `DEV_PROXY_TARGET`; set `IGNITE_AUDIT_PROFILE` in
the browser (`window.__IGNITE_ENV__ = { IGNITE_AUDIT_PROFILE: '...' }`) to see the audit view in dev.

## Live connection

One SSE connection per page: `GET /sse?paths=[default]DC/**`. The gateway expands the folder once at connect (675 leaf tags, limit 1 000), sends every value as a snapshot (applied as one batch), then `event: subscribed` with the count, then changes; the HUD shows `live · N tags · data age`. Before the 20-minute connection cap it sends `event: reconnect` and the client reopens at once (fresh snapshot, no polling needed). The gateway allows at most 64 live streams in total; beyond that it answers HTTP 503 `{"error":"too many live connections"}`, so every open tab costs one slot. Tags added to the folder later appear after the next reconnect. `test/paths.test.ts` asserts the pattern URL stays under 1 000 chars.

The HUD link tile reads LIVE / STALE (no data for 10 s) / CONNECTING / RECONNECTING, and shows "History/alarms unavailable - gateway trial may have expired" when `/tags/history` for a moving tag returns only nulls (the 2-hour trial stops the historian and alarms while tags keep moving).
