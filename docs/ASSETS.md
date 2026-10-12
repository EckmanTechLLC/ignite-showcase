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
