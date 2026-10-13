# Ignite Showcase

Demos that prove one idea: **any web technology, served by the Ignition gateway, with live access to every Ignition resource through [Ignite](https://github.com/EckmanTechLLC/ignite)** — tags, alarms, history, named queries, scripts, audit and tiered auth.

Each demo is a single full-viewport control-room screen on a different front-end stack, all sharing one framework-agnostic client.

## Layout

| Path | What |
|---|---|
| `shared/client/` | `@ignite/client` — TypeScript, zero runtime dependencies: env bootstrap, REST wrappers, SSE (folder subscriptions, initial snapshot, per-frame batching, reconnect), history probe |
| `shared/theme/` | CSS tokens, motion rules and bundled fonts (Inter, JetBrains Mono) |
| `launch/` | Demo 1 — Launch Operations: React 18, Vite, React Three Fiber, ECharts |
| `datacenter/` | Demo 2 — Data Center: Vue 3, Vite, animated SVG |
| `microgrid/` | Demo 3 — Campus Microgrid: Svelte 5, Vite, animated single-line diagram (scene: task-67; overlays: task-68) |
| `brewery/` | Demo 4 — Craft Brewery: SolidJS, Vite, PixiJS 8 isometric plant, batch Gantt strip, OEE tile and overlays: batch, trends, alarms, controls, identity, audit (task-73, task-74) |
| `scripts/deploy.mjs` | Builds every demo and commits the output to the `deploy` branch |
| `docs/ASSETS.md` | Every bundled third-party asset and its licence |
| `docs/perf.md` | Measured performance, Lighthouse scores and what was changed because of them |
| `docs/screenshots/` | Three screenshots per demo (used by the demo READMEs) |

`main` holds source only. The `deploy` branch holds built output only (`launch/`, `datacenter/`, `microgrid/`, `brewery/`); gateway site records point at it with `servePath=launch` / `servePath=datacenter` / `servePath=microgrid` / `servePath=brewery`.

## Screenshots

Demo 4, Craft Brewery (headless Chrome, 1920x1080, live data, software GL):

![Craft Brewery plant, mid-brew](docs/screenshots/brewery-plant.png)
![Batch overlay with ISA-88 phases, QA and genealogy](docs/screenshots/brewery-batch-genealogy.png)
![Packaging line down: filler jam, OEE tile and HUD](docs/screenshots/brewery-line-down.png)

Demo 3, Campus Microgrid (headless Chrome, 1920x1080, live data):

![Campus Microgrid, midday](docs/screenshots/microgrid-scene.png)
![Trends panel](docs/screenshots/microgrid-trends.png)
![Grid outage with the alarm board](docs/screenshots/microgrid-island-alarms.png)

The other demos' screenshots are in `launch/README.md` and `datacenter/README.md`.

## Build

    npm install && npm run build
    npm test

## Local development

Copy `.env.example` in a demo folder to `.env.development.local` (git-ignored; `vite build` never reads it, unlike `.env.local`, so the key cannot reach `dist/`), fill in the gateway URL, site and (read-tier) API key, then `npm run dev -w @ignite/launch` (or `@ignite/datacenter`, `@ignite/microgrid`, `@ignite/brewery`). In production the gateway injects `window.__IGNITE_ENV__`; nothing else is configuration.

## Deploy

    npm run deploy              # build + commit to local `deploy` branch
    npm run deploy -- --push    # also push `deploy`

Architecture and decisions: [ADR-005](https://github.com/EckmanTechLLC/ignite/blob/main/docs/decisions/adr-005-showcase-program.md).

## License

MIT. Third-party assets: see `docs/ASSETS.md`.
