import RAPIER from '@dimforge/rapier3d-compat';
import { TUNING } from '../config';

export type Rapier = typeof RAPIER;

// Rapier replaces Box3D: it runs in every browser (WASM), has continuous collision
// detection for a fast-spinning axe, and reports contact forces per step.
//
// Physics runs on a fixed 120 Hz clock, the same as the demo, decoupled from the
// display rate. The splitting thresholds were tuned at that rate.
export class Physics {
  readonly world: RAPIER.World;
  readonly events: RAPIER.EventQueue;
  readonly dt = 1 / TUNING.physicsHz;
  // Slow motion on a split scales game time, not the step size.
  timeScale = 1;
  private acc = 0;
  private readonly stepHooks: Array<(dt: number) => void> = [];

  private constructor(readonly rapier: Rapier) {
    this.world = new rapier.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = this.dt;
    this.events = new rapier.EventQueue(true);
  }

  static async create(): Promise<Physics> {
    await RAPIER.init();
    return new Physics(RAPIER);
  }

  /** Run `fn` before every fixed step (forces, hand controller, etc.). */
  onStep(fn: (dt: number) => void) {
    this.stepHooks.push(fn);
  }

  /** Advance by real elapsed seconds. Returns the interpolation alpha for rendering. */
  update(realDt: number): number {
    // Cap so a backgrounded tab doesn't come back to a spiral of catch-up steps.
    this.acc += Math.min(realDt, 0.1) * this.timeScale;
    while (this.acc >= this.dt) {
      for (const fn of this.stepHooks) fn(this.dt);
      this.world.step(this.events);
      this.acc -= this.dt;
    }
    return this.acc / this.dt;
  }
}
