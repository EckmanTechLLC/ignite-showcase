# Bundled third-party assets

All assets are bundled in this repository. No runtime request is made to any host other than the Ignition gateway.

| Asset | Files | Version | Licence | Source |
|---|---|---|---|---|
| Inter (variable) | `shared/theme/fonts/InterVariable.woff2`, `Inter-LICENSE.txt` | 4.1 | SIL Open Font License 1.1 | https://github.com/rsms/inter/releases/tag/v4.1 |
| JetBrains Mono (Regular, Medium, Bold) | `shared/theme/fonts/JetBrainsMono-{Regular,Medium,Bold}.woff2`, `JetBrainsMono-OFL.txt` | 2.304 | SIL Open Font License 1.1 | https://github.com/JetBrains/JetBrainsMono/releases/tag/v2.304 |

3D geometry in the demos is procedural (generated in code); no model, texture or image files are bundled.

## Launch demo (`launch/`)

All launch geometry, textures (concrete, ground, asphalt, sprites) and the sky (stars, Milky Way, moon, horizon glow) are generated in code or in shaders at start-up. No model, image or HDR file is bundled or fetched; the environment map for reflections is rendered from procedural light panels.

Runtime libraries bundled into `launch/dist` (npm, no CDN):

| Library | Version | Licence |
|---|---|---|
| three | 0.186.1 | MIT |
| @react-three/fiber, @react-three/drei | 8.18.0 / 9.122.0 | MIT |
| @react-three/postprocessing | 2.19.1 | MIT |
| postprocessing | 6.39.5 | Zlib |

## Craft Brewery demo (`brewery/`)

The whole plant is drawn by the PixiJS scene from code: every vessel, pipe, machine, floor and zone title is a vector shape, and the four small sprite textures (flow dot, bubble, can, steam puff) are painted once on a 2D canvas at start-up. No model, image or font file is bundled beyond the shared theme fonts above (JetBrains Mono is also the font of the scene text).

Runtime libraries bundled into `brewery/dist` (npm, no CDN):

| Library | Version | Licence |
|---|---|---|
| solid-js | 1.9.17 | MIT |
| pixi.js | 8.22.0 | MIT |
| echarts (declared for task-74, not imported yet) | 6.1.0 | Apache-2.0 |

Build-time only: `vite-plugin-solid` 2.11.14 (MIT).

## Data Center demo (`datacenter/`)

The 3D hall is procedural: every rack, CRAH, cabinet, pipe, busway, the floor tile pattern, the row/equipment labels and the "zz" offline mark are generated in code (geometry, a canvas-painted tile and label atlas, and shaders). No model, image or HDR file is bundled beyond the shared theme fonts.

Runtime libraries bundled into `datacenter/dist` (npm, no CDN); the three.js/TresJS code is one lazy chunk loaded after the first paint:

| Library | Version | Licence |
|---|---|---|
| three | 0.186.1 (same as Launch) | MIT |
| @tresjs/core, @tresjs/cientos | 5.9.3 | MIT |
| camera-controls (via cientos) | 3.1.2 | MIT |
| echarts | 6.1.0 | Apache-2.0 |
