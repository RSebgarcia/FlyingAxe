# Touch input and frame budget

## Input (`src/input/pointer.ts`)

Mouse, pen and touch all go through Pointer Events, with the demo's rules
(`game.gd :: _unhandled_input`): press grabs, drag moves, release throws. On top of that:

- The first finger down owns the axe; a second finger neither steals nor drops it.
- `pointercancel`, lost capture, window blur and a hidden tab all let go, so the axe never
  stays glued to a finger that isn't there.
- Only the main mouse button grabs; the context menu is off over the canvas.
- `touchOffsetY` (off by default, to stay faithful) lifts the grab point above a finger so
  the finger doesn't cover the axe.

## Framing (`src/render/camera-fit.ts`)

The demo is framed at 16:9 with a 52° vertical fov, and Godot keeps the height, so on a
portrait phone the stump falls out of frame. The port keeps the horizontal extent instead:
the fov opens up to 80°, and past that the camera backs off along its line of sight.

## Budget (`src/perf/budget.ts`)

"Mid-range" means a Pixel 6a or Galaxy A54 on Chrome, or an iPhone 12 on Safari.

| what | budget | why |
|---|---|---|
| frame | 16.7 ms (60 Hz) | dragging the axe shows every hitch |
| frame p95 | 20 ms | above it, quality steps down |
| floor | 33.3 ms (30 Hz) | if even the lowest tier can't hold 60, aim for a steady 30 |
| physics | ≤ 4 ms per frame | 120 Hz like the demo, i.e. 2 steps per frame at 60 fps |
| draw calls | ≤ 120 | the scene is small: axe, log, stump, ground, sky, particles |
| triangles | ≤ 350 k | |
| first load | ≤ 12 MB compressed | assets are 6.6 MB today |

## Adaptive quality (`src/perf/quality.ts`)

Four tiers (alta, media, baja, mínima). Resolution drops first, because fill rate is what
runs out on a phone; then shadow map size. Each tier also carries a particle multiplier and
a post-processing switch for step 3 to read from `flyingAxe.quality.current`.

The governor looks at the p95 every 2 s, ignoring the first 3 s (shader compiles). Over
20 ms it steps down. To step up it needs 3 windows in a row with 25% headroom, and every
stutter adds 2 more to that count so it doesn't oscillate. Desktops start at "alta", phones
at "media", and phones with ≤ 4 cores or ≤ 3 GB at "baja".

## Meter (`src/ui/perf-meter.ts`)

`?perf` in the URL, the `` ` `` key, or three quick taps in the top-right corner. Shows
fps, p50/p95, draw calls, triangles, quality tier and backend.
