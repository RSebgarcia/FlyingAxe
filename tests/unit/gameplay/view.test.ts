import RAPIER from '@dimforge/rapier3d-compat';
import { Mesh, Scene, Vector3 } from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { GameSim, GameplayView } from '../../../src/gameplay';
import { initPhysics } from './bench';

beforeAll(initPhysics);

describe('vista', () => {
  it('sigue al hacha, esconde la leña cargada y dibuja mitades y escombros', () => {
    const sim = new GameSim(RAPIER, { seed: 5, store: null });
    const scene = new Scene();
    const view = new GameplayView(sim, scene);
    const log = scene.getObjectByName('Log') as Mesh;
    expect(log.geometry.groups.length).toBe(2);
    expect(view.axe.position.distanceTo(sim.axe.position())).toBeLessThan(1e-9);

    sim.log.handTo(sim.axe);
    view.sync();
    expect(log.visible).toBe(false);
    expect(view.axe.children.length).toBe(1);

    const where = sim.axe.dropLog();
    sim.log.splitAt(where, new Vector3());
    view.sync();
    expect(view.axe.children.length).toBe(0);
    const halves = () => scene.children.filter((c) => c instanceof Mesh && c !== log).length;
    expect(halves()).toBe(2);
    sim.newLog();
    view.sync();
    expect(log.visible).toBe(true);
    expect(halves()).toBe(2); // las mitades viejas quedan tiradas en el pasto
    sim.dispose();
  });
});
