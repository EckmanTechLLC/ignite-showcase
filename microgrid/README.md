# Campus Microgrid (Svelte 5)

Full-viewport animated single-line diagram bound to the live `[default]MG/` tags (task-67; ADR-005 Amendment A1).
Served by the Ignite gateway at site `microgrid`; the gateway injects `window.__IGNITE_ENV__`. Overlays (trends,
alarms, controls, identity panel, audit) are task-68.

## What is on screen

- **Single-line diagram** (`src/diagram/`, SVG): utility intertie (available / islanded, V and Hz), main switchboard, 4 PV arrays
  (hover expands to 2 inverters x 6 strings with health; curtailment shown on the card), 2 BESS (SOC, kW direction, mode, temperature),
  genset (state, start countdown, fuel), 10 EV chargers as a bank, 3 buildings (kW, HVAC share, critical badge, shed).
  Conductor dashes run as Web Animations: direction follows the power, speed follows |kW|, dead paths stop; colour is import amber,
  export green, island red, genset grey. Island mode re-routes the picture; faults pulse. Hover shows a live tooltip, click selects
  (`selection.svelte.ts`, consumed by task-68), `Esc` clears.
- **Day strip** (`src/strip/`): sun arc and cloud layer from `Time/*`, time-of-use band with the hour marker and the demand window.
- **HUD** (`src/hud/`): net load, PV fraction, self-sufficiency, cost / savings / CO2 / peak ticker (numbers roll), mode badge,
  scenario and speed chips, alarm count, SSE link chip (live / stale / connecting / reconnecting, tag count, data age, trial notice),
  identity chip (anonymous / gateway session / bearer; read-only here).
- `?perf` in the URL shows the performance readout (always in dev); `P` toggles. `?` or `?about` opens help.
- Reduced motion: flows stop, numbers jump instead of rolling, CSS motion tokens go to 0.

## Connection model

One SSE connection on the folder pattern `[default]MG/**` (405 tags). The server answers with `event: subscribed` (count) and the client
delivers the initial snapshot as one batch, applied in one pass to a reactive map (`src/live/store.svelte.ts`). `src/live/paths.ts` and
`units.ts` are generated from `sim/microgrid/tags.json` (`npm run gen`, run by `dev`, `build` and `test`). Health probe: a 6-row history
request for `KPI/NetLoadkW` every 60 s; all nulls means the gateway trial expired (history and alarms stop, tags keep moving).

## Development

Copy `.env.example` to `.env.development.local` (git-ignored; never `.env.local`), then `npm run dev -w @ignite/microgrid`.
`npm run check` runs `svelte-check`; `npm run build` includes it.
