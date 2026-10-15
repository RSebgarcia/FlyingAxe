// Frame budget for a mid-range phone (reference: Pixel 6a / Galaxy A54 on Chrome,
// iPhone 12 on Safari). 16.7 ms at 60 Hz, with headroom for the browser compositor and
// thermal noise. docs/perf-budget.md explains each line.

export const BUDGET = {
  /** Whole frame (CPU + GPU) at 60 Hz. */
  frameMs: 16.7,
  /** p95 tolerated before dropping quality. Above it, dragging the axe stutters. */
  p95Ms: 20,
  /** Floor: if even the lowest tier can't hold 60, aim for a steady 30. */
  floorFrameMs: 33.3,
  /** CPU time for all physics steps in one frame (120 Hz: 2 steps at 60 fps). */
  physicsMs: 4,
  drawCalls: 120,
  triangles: 350_000,
  /** Compressed download before the first frame. */
  firstLoadMB: 12,
} as const;
