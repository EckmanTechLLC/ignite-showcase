# Craft Brewery (SolidJS + PixiJS 8)

Full-viewport isometric brewery bound to the live `[default]BR/` tags (task-73; ADR-005 Amendment A2). Served by the Ignite
gateway at site `brewery`; the gateway injects `window.__IGNITE_ENV__`. Overlays (trends, alarms, controls, batch panel,
identity, audit) are task-74.

## What is on screen

- **Plant** (`src/plant/`, Pixi, WebGL with canvas fallback, `?renderer=canvas` forces it): brewhouse (mill, mash tun, lauter tun,
  kettle, whirlpool, wort chiller, HLT, CLT), 12 fermenters, 4 bright tanks, 8-machine packaging line on a conveyor, utilities
  (boiler, glycol chiller, CO2, air, CIP skid). Vessels show level (liquid in the recipe colour), temperature (jacket tint), phase and
  the batch tag. Pipes carry wort, beer, glycol and steam only while a transfer or demand is active; particles: kettle and HLT steam,
  boil roll, CO2 bubbles in fermenting tanks, cans at `SpeedCPM`, pallet stacking. Faults and process deviations pulse red; a line stop
  shows its reason on the machine. Hover: live tooltip (DOM). Click: selection (`src/selection.ts`, for task-74). Drag pans, wheel
  zooms, `R` resets, gentle idle drift.
- **Batch strip** (`src/strip/`): ISA-88 Gantt of every active batch (`BR/Batches/B01..B24`, state not PLANNED / COMPLETE / DUMPED) plus
  the next planned one, phases grouped (mash, lauter, boil, whirlpool, knock-out, fermentation, conditioning, packaging), recipe colour,
  QA HOLD hatched, a marker for the simulated "now". **OEE tile**: availability x performance x quality as bars, the downtime reason, rolling counts.
- **HUD**: KPIs, mode badge, scenario and speed chips, alarm count, SSE link chip (with the trial notice), identity chip (read-only). `?perf` shows
  the readout (fps, frame p50/p95, draw calls, sprites, SSE batches/s; `P` toggles), `?` or `?about` opens help. Reduced motion: particles off, flows static.

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
