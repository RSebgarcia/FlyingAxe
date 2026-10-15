import { describe, expect, it } from 'vitest';
import { Physics } from '../../src/physics/physics';

describe('Physics clock', () => {
  it('steps at a fixed 120 Hz regardless of frame time', async () => {
    const physics = await Physics.create();
    let steps = 0;
    physics.onStep(() => steps++);
    // One second of 60 fps frames.
    for (let i = 0; i < 60; i++) physics.update(1 / 60);
    expect(steps).toBeGreaterThanOrEqual(119);
    expect(steps).toBeLessThanOrEqual(120);
  });

  it('slows game time without changing the step size', async () => {
    const physics = await Physics.create();
    let steps = 0;
    physics.onStep((dt) => {
      expect(dt).toBeCloseTo(1 / 120);
      steps++;
    });
    physics.timeScale = 0.35;
    for (let i = 0; i < 60; i++) physics.update(1 / 60);
    // 0.35 s of game time at 120 Hz, give or take the step left in the accumulator.
    expect(steps).toBeGreaterThanOrEqual(41);
    expect(steps).toBeLessThanOrEqual(42);
  });

  it('drops a body under gravity', async () => {
    const physics = await Physics.create();
    const { rapier, world } = physics;
    const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(0, 10, 0));
    world.createCollider(rapier.ColliderDesc.ball(0.1), body);
    for (let i = 0; i < 60; i++) physics.update(1 / 60);
    // Free fall for 1 s: about 4.9 m.
    expect(10 - body.translation().y).toBeCloseTo(4.9, 0);
  });
});
