# Flying Axe

A relaxing axe game for desktop and mobile browsers. Grab the axe, let the weight in
the head swing it, and let go: split the log with the edge, or get it stuck and smash it
on the stump.

It's a remake of a Godot 4.7 + Box3D demo, in TypeScript with three.js and Rapier. The
port is faithful first (same feel, same tuned numbers), with improvements after that.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm test           # unit tests (Vitest)
npm run test:e2e   # browser smoke test on desktop and mobile viewports (Playwright)
```

Add `?webgl` to the URL to force the WebGL 2 fallback on a machine that has WebGPU.

## Stack

| piece | choice | why |
|---|---|---|
| rendering | three.js r186, `WebGPURenderer` | WebGPU where available, WebGL 2 everywhere else, same code |
| shaders | TSL (three.js shading language) | one source for both backends |
| physics | Rapier 0.21 (WASM) | runs in every browser, unlike Box3D, which had no web or mobile builds |
| textures | KTX2 / Basis | stays compressed on the GPU, which matters on phones |
| meshes | glTF + meshopt | |
| build | Vite + TypeScript (strict) | |
| font | EB Garamond | the demo used Georgia, which can't be redistributed |

## Layout

Each folder has one job, so steps can be worked on in parallel without stepping on each
other.

```
src/
  main.ts          boot: renderer, physics, world, main loop
  config.ts        tuned values carried over from the demo, plus camera, sun, axe home pose
  render/          renderer setup, asset loading, materials, sky dome
  game/            world building (scene, axe, log) and, from step 2, the game rules
  physics/         Rapier world on a fixed 120 Hz clock; static colliders from the scene
  input/           pointer (mouse, pen, touch) projected on the x = 0 play plane
  fx/              (step 3) chips, hit-stop, camera shake, sound, weathers
  ui/              HUD (DOM over the canvas) and styles
tests/
  unit/            Vitest, headless (any tests/**/*.test.ts runs, in node)
  e2e/             Playwright smoke test against the production build
tools/
  build-assets.mjs rebuilds public/assets from the Godot project
  list-nodes.mjs   prints a glTF's nodes, materials and textures
public/assets/     built assets (committed)
```

### Conventions

- **The game is planar.** The axe and hand live on `x = 0` and the axe only rotates
  about X. That's what fixed the uncontrolled spin in the demo.
- **Physics runs at a fixed 120 Hz** (`Physics.update`), independent of the display rate.
  Put per-step logic (hand controller, forces) in `physics.onStep`. Slow motion changes
  `physics.timeScale`, never the step size.
- **Scene node names are a contract** with the Blender file: `Piso-col` (ground) and
  `Tocon-col` (stump). `game/world.ts` throws if one is missing, instead of silently
  losing a texture or a collider like the demo did.
- **`window.flyingAxe`** exposes the renderer, world, physics and pointer for tests and
  the console.

## Assets

`public/assets` is built from the Godot project and committed, so nobody else needs the
tooling. To rebuild after changing a source asset:

```sh
npm run assets -- "D:/04_Rol_y_Hobbies/Godot/Flying Axe"
```

It needs the [KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases) `ktx`
CLI on `PATH`. It keeps only the `aXE` object from `Axe.glb` (dropping the duplicate axe
and the stray Empty), caps the axe's textures at 512 px and the rest at 1024 px, and
encodes color and roughness as ETC1S and normal maps as UASTC with RDO. The assets went
from 51 MB to 6.6 MB, which keeps a cold load under the 12 MB mobile budget.

Sound: six wood-split clips from the demo's `Assets/sfx/WoodSplit`. One of them is
"Wood Splitting - Axe VS Log - Garage Gym" by Laird Ross; its license still needs
checking before a public release.

## Deploy

CI runs typecheck, unit tests and the browser smoke test on every PR. Pushes to `main`
also deploy `dist/` to GitHub Pages. That requires **Settings → Pages → Source: GitHub
Actions** to be set once on the repository.
