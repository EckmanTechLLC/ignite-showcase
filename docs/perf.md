# Performance (task-59)

How to read the numbers on a real machine: open either demo with `?perf` (production builds) and press `P` to hide or show the readout.

- Launch: `fps  p50/p95/max frame ms`, `js ms per frame`, `draw calls`, `triangles`, `geometries/textures`, `SSE batches/s`, `updates/s`, render scale (`dpr`).
- Data center: `fps`, avg frame ms, `p50/p95/max`, `DOM nodes`, `SSE batches/s`, `updates/s`.
- Both expose `window.__perf` (object in launch, function in the data center) for scripted runs.

## Method and caveats

- Headless Chrome 147 on the lab Linux box, **no GPU**: WebGL and compositing are software (SwiftShader / CPU raster). The box is shared (12 cores, load average 5 to 8 during every run). Frame rates below are **software-rendered** and are not GPU results.
- What is meaningful here: main-thread work per second and per frame (CDP `Performance.getMetrics`: task, script, style, layout), long tasks, DOM nodes, JS heap (after a forced GC), JS time per frame, draw calls and triangles. The launch scene is entirely raster-bound in software (0.2 to 0.7 fps), so its fps and main-thread seconds say nothing about a GPU.
- "Before" is the deployed build with only the `?perf` readout added (commit `1ffe873`); "after" is the final build. Runs are 45 s after a 12 s warm-up against the deployed pages (`?perf`), live data, one run each unless a table says otherwise. A/B rows are interleaved runs against local copies of the two builds, 3 rounds, median.
- Lighthouse 12.8, `--preset=desktop`, headless Chrome 147 with software GL, the lab gateway over plain HTTP.

## Operator GPU numbers

Operator report (2026-10-12): both demos "feel smooth" on their machine; no numbers because the readout did not exist in the deployed launch build. It does now.

| Demo | Machine / GPU | Resolution | fps | p50 ms | p95 ms | draw calls / DOM nodes | batches/s |
|---|---|---|---|---|---|---|---|
| Launch | pending: operator | | | | | | |
| Data center | pending: operator | | | | | | |

Please open `<site>/launch/?perf` and `<site>/datacenter/?perf`, let each run for a minute (launch: also try camera preset `1` and `5`), and paste the readout lines.

## Results (software-rendered, CPU-side)

### Data center (SVG hall, 1 766 to 1 772 DOM nodes)

| Metric | 1080p before | 1080p after | 4K before | 4K after |
|---|---|---|---|---|
| fps (software raster) | 32.7 | 39.0 | 14.9 | 11.2 |
| frame p50 / p95 (ms) | 22.2 / 74.1 | 25.9 / 63.0 | 57.4 / 185.2 | 81.5 / 233.3 |
| main thread (ms per s) | 702 | 622 | 359 | 290 |
| script (ms per s) | 31 | 14 | 15 | 9 |
| style recalc (ms per s) | 195 | 100 | 76 | 41 |
| style recalc per frame (ms) | 7.6 | 2.6 | 6.1 | 3.5 |
| layout (ms per s) | 24 | 21 | 13 | 12 |
| long tasks (count / total ms) | 61 / 4 518 | 36 / 2 432 | 55 / 4 515 | 54 / 3 775 |
| SSE batches/s, updates/s | 1.0, 241 | 1.1, 242 | 1.1, 241 | 1.0, 243 |

The single-run fps spread on this loaded box is about +/- 10 %, so fps in the table is not a result. The interleaved A/B (three rounds each, same minute) is the fair comparison:

| A/B, median of 3 | fps | p95 ms | script ms/s | style ms/s | long tasks ms |
|---|---|---|---|---|---|
| 1080p before | 34.7 | 70.0 | 29 | 188 | 2 019 |
| 1080p after (Web Animations flows) | 34.5 | 66.7 | 16 | 111 | 2 149 |
| 4K before | 15.3 | 183 | 16 | 77 | 3 050 |
| 4K after | 14.2 | 200 | 10 | 47 | 2 267 |

With reduced motion on, the same page spends 24 ms/s on style and runs 52.7 fps (same box), so the dash and fan animation was most of the style cost. Remaining main-thread time is paint and layerization (a 6 s trace: paint about 230 ms/s, `PaintArtifactCompositor` about 110 ms/s, style 100 ms/s), which is raster-bound and not something JS can remove.

### Launch (R3F scene)

| Metric | 1080p before | 1080p after | 4K before | 4K after |
|---|---|---|---|---|
| fps (SwiftShader) | 0.63 | 0.68 | 0.18 | 0.15 |
| JS per frame (ms) | 0.89 | 0.87 | 1.2 | 0.82 |
| draw calls / triangles per frame | 187 / 85k | 253 / 104k | 160 / 73k | 179 / 82k |
| script (ms per s) | 12 | 14 | 6 | 7 |
| DOM nodes | 329 | 335 | 316 | 335 |
| SSE batches/s, updates/s | 1.0, 37 | 1.1, 39 | 1.0, 44 | 1.0, 38 |

No launch rendering change was made, so before and after are the same code (draw calls vary with the camera position and the render-scale monitor, which stepped to 0.75 under software rendering). The numbers say the CPU side of the scene is cheap (under 1 ms of JS per frame, about 200 draw calls, under 110k triangles, 1 SSE batch per second at about 40 tag updates). Whether the GPU side is fine at 4K is exactly what the operator numbers above will show; the render-scale monitor (`PerformanceMonitor`, 0.75 to 1.25) already backs off if it is not. Candidate follow-ups only if those numbers disagree with "smooth": cap the initial render scale on very large canvases, half-resolution bloom.

### Heap (leak check)

Forced GC every 60 s, deployed pages, 1080p, both pages open at the same time, a 25 minute run (it also crosses the gateway's 20 minute SSE `reconnect`).

| Time | 0 min | 5 min | 10 min | 15 min | 20 min | 25 min |
|---|---|---|---|---|---|---|
| Launch heap (MB) | 8.8 | 9.8 | 10.2 | 10.3 | 10.2 | 10.4 |
| Data center heap (MB) | 3.5 | 3.8 | 4.1 | 4.1 | 4.1 | 4.1 |

Both grow for the first 10 to 12 minutes while the bounded sample buffers fill (history windows, alarm sparkline, frame window) and are flat afterwards: data center 4.1 MB from minute 10 to 25 (no change), launch +0.2 MB over minutes 10 to 25. An earlier 10 minute run showed the same curve (launch 8.9 to 10.3, data center 3.5 to 4.1). DOM nodes stay constant (launch 336, data center 1 773). Because the first ten minutes still climb, the 10 minute figure alone would not prove flatness; the 25 minute run does.

### Lighthouse (desktop preset, deployed pages, software GL)

| Page | Run | Performance | Accessibility | Best practices | FCP | LCP | TBT |
|---|---|---|---|---|---|---|---|
| Data center | before | 61 | 100 | 79 | 1.0 s | 1.3 s | 870 ms |
| Data center | after #1 / #2 | 63 / 72 | 100 / 100 | 79 / 79 | 0.5 / 0.6 s | 1.4 / 1.2 s | 990 / 580 ms |
| Launch | before | 40 | 95 | 79 | 2.0 s | 2.4 s | 20 090 ms |
| Launch | after #1 / #2 | 45 / 45 | 100 / 100 | 79 / 79 | 1.5 / 1.5 s | 2.1 / 2.1 s | 20 600 / 20 220 ms |

- Best practices 79 is entirely `is-on-https` and `redirects-http` (the lab gateway is plain HTTP); `valid-source-maps` on launch is the three.js chunk shipping without a map, on purpose. Nothing else fails.
- Accessibility: launch had one contrast failure (muted text `--fg-2` on the card background, 3.82:1); fixed by lightening `--fg-2` (now at least 4.9:1 on every surface token). The `axe-core` sweep in 6 states (idle and each panel open) at 1080p is clean on both demos.
- Performance is **not** at 90. Launch's TBT is software WebGL (each frame takes about 1.7 s of blocked main thread); the score cannot say anything about a GPU run. The data center's TBT comes from the first mount of the 1 700-node SVG plus the 675-tag snapshot (three tasks of 320, 391 and 183 ms at 1.0 to 1.9 s) and then per-frame software paint. See the ADR-005 table below.

## What changed because of the numbers

| Change | Before | After |
|---|---|---|
| Data center: dash flow on Web Animations (`Flow.vue`): one animation per path, `playbackRate` follows the load and is only touched while the speed eases; no per-frame script or inline-style writes for about 38 paths | style 188 ms/s, script 29 ms/s (1080p A/B); style 77 ms/s (4K) | style 111 ms/s, script 16 ms/s; style 47 ms/s at 4K. Frame rate unchanged within noise (raster-bound) |
| Both: preload Inter and JetBrains Mono Regular and Medium from `index.html` (fonts were only discovered after the CSS) | FCP 1.0 s (data center), 2.0 s (launch) | FCP 0.5 to 0.6 s, 1.5 s (Lighthouse desktop, n = 2) |
| Launch: draw calls, bloom, particle budget | not changed: 0.9 ms JS per frame, about 200 calls, no leak. Needs the operator GPU numbers first | |

Other things I looked at and left alone: per-rack reactive recomputation (script is 14 ms/s at 240 tag updates/s, nothing to batch), code splitting (ECharts and the help panels are already lazy chunks; the first-paint bundle is three, r3f and the app), the 30 Hz step of fans (flows now run at display rate; the cost is in paint, and a 30 Hz cap is not possible with Web Animations).

Not performance, but changed in this task: `?` help/about overlay and `?about` in both demos, a visible focus ring for keyboard users, `--fg-2` contrast, landmark and description-list fixes in launch, the data center HUD fits 1366 px wide and its dock has its own column, launch panels step the camera dock aside and stop above the (variable height) bottom strip, and a smaller launch clock at laptop widths.

## ADR-005 section 7 status

| Target | Status |
|---|---|
| 60 fps scene / at least 55 fps at 1080p on an integrated GPU | **Unverified.** No GPU here; the operator reports "smooth" but sent no numbers. The `?perf` readout is now live in both demos to collect them |
| Lighthouse performance at least 90 on the built page | **Not met** in this environment: data center 63 to 72, launch 45 (software WebGL, desktop preset, plain-HTTP lab). Data center's remaining TBT is initial mount plus software paint; a real GPU measurement is needed for launch |
| Lighthouse accessibility at least 90 | Met: 100 on both |
| No runtime calls to any host except the gateway | Met: zero non-gateway requests in every headless run (`externalRequests` empty) |
| Fonts and assets bundled, licences recorded | Met (`docs/ASSETS.md` unchanged) |
| Contrast of HUD text at least 4.5:1 | Met for tokens and for everything `axe` checks; the rack tiles in the data center put white text with a dark outline on the heat colours, which `axe` cannot evaluate |
