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

## Campus Microgrid (task-69)

Svelte 5 single-line diagram (about 465 DOM nodes, 405 tags in one `[default]MG/**` subscription). Same method as above: headless Chrome 147, **software raster, no GPU on this box**, deployed page with `?perf`, 12 s warm-up then 45 s, live data, the sim at 120x. fps and frame times are software-rendered and are not GPU results; **GPU fps is operator-reported** (the operator rows below are pending).

### Results (software-rendered, CPU-side)

| Metric | 1080p run 1 / 2 | 4K run 1 / 2 | 1080p, Trends open before | 1080p, Trends open after |
|---|---|---|---|---|
| fps (software raster) | 59.6 / 59.1 | 35.6 / 34.5 | 50.7 | 55.8 / 58.3 |
| frame p50 / p95 (ms) | 16.7 / 16.8 (both runs) | 25.9 / 50.0 and 27.8 / 51.9 | 16.7 / 40.8 | 16.7 / 27.8 and 16.7 / 16.8 |
| main thread (ms per s) | 283 / 360 | 185 / 189 | 529 | 349 / 363 |
| script (ms per s) | 23 / 29 | 17 / 18 | 188 | 49 / 50 |
| style recalc (ms per s) | 41 / 52 | 26 / 26 | 45 | 41 / 34 |
| layout (ms per s) | 39 / 52 | 27 / 27 | 47 | 41 / 39 |
| long tasks (count / total ms) | 0 / 0 and 1 / 67 | 0 / 0 (both) | 3 / 252 (max 102) | 2 / 128 and 1 / 52 |
| DOM nodes | 464 | 464 | 515 | 515 |
| SSE batches/s, updates/s | 1.1, 163 and 1.0, 190 | 1.1, 185 and 1.0, 189 | | |

The first four columns are one build (no rendering change was made for the diagram: flows are Web Animations from the start, 0 running animations under reduced motion, task-67). The 4K run is raster-bound in software (35 fps, p95 50 ms); the main thread is under 20 % busy. "Trends open" is the same page after pressing `T` (five ECharts charts, history already loaded); "before" is the deployed task-68 build measured on the deployed page, "after" is the task-69 build served through a local proxy to the same gateway (the numbers are therefore a small apples-to-oranges difference in transport only; each runs 45 s).

### Heap (leak check)

Forced GC every 60 s, deployed page, 1080p, 25 minutes (crosses the gateway's 20 minute SSE `reconnect`).

| Time (min) | 0 | 5 | 10 | 15 | 20 | 25 |
|---|---|---|---|---|---|---|
| Heap (MB) | 2.1 | 2.3 | 2.5 | 2.6 | 2.6 | 2.7 |

The heap climbs from 2.1 to 2.6 MB over the first 15 minutes while the bounded buffers fill (ticker tween, history probe, alarm list) and is then flat (+0.1 MB over minutes 15 to 25, across the reconnect at about minute 19).

DOM nodes stayed at 467 to 482. The stream reconnected at about 19 minutes (the gateway's 20 minute cap) and updates resumed within a second (about 190 per second before and after; 0 console errors, 0 non-gateway requests). A first attempt at this run was discarded: I rotated the site API key 4 minutes into it, so the page reconnected with the old key, got a 401 and stopped receiving data. That is expected behaviour for a rotated key (reload picks up the new one), not a page fault.

### Lighthouse (desktop preset, deployed page, software GL)

| Run | Performance | Accessibility | Best practices | FCP | LCP | TBT |
|---|---|---|---|---|---|---|
| Before (task-68 build, deployed) | 98 | 100 | 79 | 0.6 s | 1.1 s | 70 ms |
| After (deployed), 4 runs | 81 / 85 / 82 / 85 | 100 (all) | 79 (all) | 0.5 to 0.6 s | 1.0 to 1.3 s | 260 to 330 ms |
| A/B, local copies of old and new build, interleaved | old 83 / 86, new 84 / 98 | 100 (all) | 100 (all, no HTTP) | 0.5 to 0.6 s | 1.0 to 1.3 s | old 340 / 260, new 310 / 70 ms |

The performance score is bimodal on this shared, software-rendered box: runs land either at about 98 (TBT 70 ms) or at 81 to 86 (TBT 260 to 340 ms), for the old and the new build alike (the interleaved A/B above shows both builds in both modes), so the drop from 98 to 81 to 85 after deploy is not a code regression; the bundle is byte-identical in size (148.6 vs 148.7 kB) and the changes do not touch load. What the page does at load is mount about 465 SVG nodes and apply the 405-tag snapshot in one pass; the two fast runs (98) show it can finish inside 70 ms of blocking time.

- Best practices 79 is `is-on-https` and `redirects-http` only (lab gateway is plain HTTP). SEO 54 is `meta-description` and `is-crawlable`: the page is an internal demo behind a gateway path, intentionally unindexed; not changed.
- Accessibility: axe-core (wcag2a, wcag2aa, best-practice) on the deployed page in six states (idle, Trends, Alarms, Controls, Login, Help) at 1080p: **before** idle and Trends: `page-has-heading-one` (1), Trends: `scrollable-region-focusable` (1), Alarms: `color-contrast` (15 nodes: cleared alarm rows at 0.6 opacity gave 2.85:1 and 4.06:1), Help: `landmark-no-duplicate-banner` and `landmark-unique` (the dialog header was a banner); **after**: clean in all six states.
- Experimental `label-content-name-mismatch` (not scored) lists the diagram's `role="button"` groups whose aria-label does not repeat their visible text; left alone.

### What changed because of the numbers

| Change | Before | After |
|---|---|---|
| Trends: redraw a chart only when a point was added or aged out (every 5 s) instead of every 500 ms poll (`Chart.svelte`) | 1080p with Trends open: script 188 ms/s, main thread 529 ms/s, p95 40.8 ms, 3 long tasks (252 ms) | script 49 to 50 ms/s, main thread 349 to 363 ms/s, p95 16.8 to 27.8 ms, 1 to 2 long tasks (52 to 128 ms) |
| a11y: sr-only `h1`, dialog header no longer a banner, keyboard focus on the scrollable panel body, cleared alarm rows at 0.9 opacity | six axe violation rules (above) | 0 |

Left alone: the diagram (its main thread is paint and layout of about 465 nodes; 60 fps in software at 1080p), ECharts bundle (lazy, about 556 kB, first loaded on `T`), the 4K frame rate (raster-bound).

### ADR-005 section 7 and Amendment A1 status for the microgrid

| Target | Status |
|---|---|
| 60 fps / at least 55 fps at 1080p on an integrated GPU | **Unverified on a GPU.** Software raster here gives 59 fps at 1080p and 35 fps at 4K; the operator should paste the `?perf` readout from a real machine |
| Lighthouse performance at least 90 | **Met in 2 of 9 runs here** (two runs at 98; 81 to 86 otherwise). The spread is environmental (TBT 70 vs 260 to 340 ms for the same bundle). Not claimed as met |
| Lighthouse accessibility at least 90 | Met: 100 |
| No runtime calls to any host except the gateway | Met: `externalRequests` empty in every run |
| Fonts bundled | Met (shared theme fonts) |

## Craft Brewery (task-75)

Solid 1.9 UI over a PixiJS 8 isometric plant (WebGL, about 280 DOM nodes, 270 to 320 sprites, 700 display objects, 908 tags in one subscription made of 12 folder patterns because the gateway caps a subscription at 1 000 and the model has 1 039). Same method as above: headless Chrome 147, **software raster (SwiftShader), no GPU on this box**, deployed page with `?perf`, 12 s warm-up then 45 s, live data, the sim at 60x with fermentation acceleration 8. fps and frame times are software-rendered and are **not** GPU results; **GPU fps is operator-reported** and the operator rows are pending. The page was measured after the a11y fix below (deploy 581dc79).

### Results (software-rendered, CPU-side)

| Metric | 1080p run 1 / 2 | 4K run 1 / 2 |
|---|---|---|
| fps (software GL) | 11.0 / 7.4 | 1.9 / 2.0 |
| frame p50 / p95 (ms) | 84.6 / 164.4 and 126.8 / 236.7 | 521.9 / 788.5 and 500.6 / 680.4 |
| main thread (ms per s) | 122 / 136 | 59 / 58 |
| script (ms per s) | 63 / 73 | 29 / 28 |
| style recalc / layout (ms per s) | 10 / 10 and 11 / 11 | 7 / 4 and 7 / 5 |
| long tasks in 45 s (count / total ms, max) | 8 / 435 (65) and 7 / 419 (71) | 2 / 105 (53) and 3 / 168 (60) |
| draw calls | 3 / 6 | 18 / 20 |
| sprites / display objects | 273 / 670 and 314 / 713 | 324 / 719 and 307 / 699 |
| DOM nodes | 295 / 296 | 298 / 281 |
| SSE batches/s, updates/s | 1, 68 and 1, 76 | 1, 78 and 1, 75 |

The main thread is idle most of the time (12 to 14 % busy at 1080p). The frame rate here is fill-rate bound in software: the whole scene is rasterised on the CPU by SwiftShader, and a 4K canvas has four times the pixels (2 fps). Static art (floors, pipes, vessel and machine bodies) is cached as textures, which is why the main thread stays this low; in task-73 a trivial one-rect Pixi canvas of the same size measured 11 to 12 fps on this box. Nothing here says what a GPU does; the operator should paste the `?perf` readout from a real machine.

### Heap (leak check)

Forced GC every 60 s, deployed page, 1080p, 25 minutes (about 1 460 s, started 19:01 UTC, crossing the gateway's 20 minute SSE cap). The site key was not rotated during the run.

| Time (min) | 0 | 5 | 10 | 15 | 20 | 25 |
|---|---|---|---|---|---|---|
| Heap (MB) | 10.9 | 12.7 | 13.0 | 13.2 | 13.1 | 13.3 |

Heap climbs from 10.9 to 13.0 MB over the first 10 minutes while the bounded buffers fill, then stays within 12.9 to 13.3 MB (+0.1 MB over minutes 15 to 25). DOM nodes 279 to 300, sprites 190 to 380 (they follow the particles), 0 console or page errors, one host only (the gateway). Updates were 40 to 78 per second on every sample but one: at minute 23 the sample read 0 updates/s and 0 batches (a reconnect gap, consistent with the 20-minute cap) and the next sample (minute 24) was back at 72/s, with no error. The gateway trial lapsed at 19:04:43 during the run; SSE and the sim continued. The run was on build 9750e89 (the h1/main change was deployed during it, but the open page did not reload).

### Bundle (production build)

- Entry JS 56.5 kB (18.6 kB gzip), CSS 28 kB. Everything else is lazy.
- **Pixi chunks (lazy, loaded through `import('./scene')` after first paint): scene 318.3 kB (96.7 gz) + CanvasPool 112.3 + RenderTargetSystem 78.1 + browserAll 43.5 + init 14.8 + small ones, about 585 kB raw, 174 kB gzip.** The WebGL bundle is the cost of the plant; it is not referenced by `index.html`.
- ECharts (loaded on the first chart, `T`): 592.8 kB raw across the shared runtime chunks plus the Trends chunk 17.6 kB.

### Lighthouse (desktop preset, deployed page, software GL)

| Run | Performance | Accessibility | Best practices | FCP | LCP | TBT |
|---|---|---|---|---|---|---|
| 5 runs (deploy 581dc79) | 52 / 55 / 55 / 57 / 60 | 100 (all) | 79 (all) | 1.1 s | 1.8 to 2.5 s | 1.4 to 2.9 s |

Spread 52 to 60. Performance is below the 90 target, and this is the **WebGL bundle caveat**: the long tasks are Pixi initialising the WebGL context and building the scene (CanvasPool chunk 1.0 s, scene chunk 0.5 s of scripting, 7 long tasks of 52 to 571 ms), all of it executed under SwiftShader on a shared box; the unthrottled main thread blocks for 1.4 to 2.9 s in the first 3 s. The score comes from TBT only (FCP 1.1 s, LCP 1.8 s, CLS 0.01). Not changed: the possible fixes (a smaller renderer, deferring the first scene build, drawing less on the first frame) are redesigns, not clear wins, and task-69's microgrid showed this box swings the same page by 15 points between runs. A GPU machine will not show these long tasks; the operator report is pending. Best practices 79 is `is-on-https` and `redirects-http` only (lab gateway is plain HTTP); SEO 54 is `meta-description` and `is-crawlable` (an internal demo, not indexed).

Accessibility: axe-core (wcag2a, wcag2aa, best-practice), deployed page, 1080p, in seven states (idle, B, T, A, C, L, ?). **Before**: idle, B, T, A, C, L each had `landmark-one-main`, `page-has-heading-one` and `region` (the plant `div` was outside any landmark); `?` had `region`. **After** (deploy 581dc79): 0 violations in all seven states. The logged-in state was not axe-tested. The overlays (panels, dock, toasts) had no violations before or after.

### What changed because of the numbers

| Change | Before | After |
|---|---|---|
| a11y: the plant sits in a `<main>` with an sr-only `h1` "Craft Brewery" (`App.tsx`, `app.css`) | 3 axe rules (6 states) plus 1 in `?` | 0 |

No performance change was made: the main thread is not the limit, and the Lighthouse TBT is software-GL scene start-up.

### ADR-005 section 7 and Amendment A2 status for the brewery

| Target | Status |
|---|---|
| 60 fps / at least 55 fps at 1080p on an integrated GPU | **Unverified on a GPU.** Software raster here gives 7 to 11 fps at 1080p and 2 fps at 4K (fill-bound); operator to paste the `?perf` readout |
| Lighthouse performance at least 90 | **Not met here** (52 to 60 in 5 runs); TBT from WebGL start-up under software GL, not claimed as met |
| Lighthouse accessibility at least 90 | Met: 100 |
| Pixi chunk lazy | Met: about 585 kB raw, 174 kB gzip, only after first paint |
| Heap flat over 25 min including an SSE reconnect | Met: 13.0 to 13.3 MB over minutes 10 to 25 |
