import RAPIER from '@dimforge/rapier3d-compat';
import { Mesh, PerspectiveCamera, Scene, Vector2, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { GameSim, GameplayView, pointerToPlane } from '../../src/gameplay';
import { initPhysics } from './bench';

beforeAll(initPhysics);

describe('puntero sobre el plano x = 0', () => {
  it('el centro de la pantalla cae sobre lo que mira la cámara', () => {
    const cam = new PerspectiveCamera(52, 16 / 9, 0.1, 100);
    // La cámara de tres cuartos de game.gd.
    cam.position.set(2.9, 1.5, 3.2);
    cam.lookAt(0, 1, 0.6);
    cam.updateMatrixWorld();
    const p = pointerToPlane(cam, new Vector2(0, 0))!;
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(1, 1);
    expect(p.z).toBeCloseTo(0.6, 1);
  });

  it('mirando el plano de canto no inventa un punto', () => {
    const cam = new PerspectiveCamera(10, 1, 0.1, 100);
    cam.position.set(1, 1, 5);
    cam.lookAt(1, 1, 0);
    cam.updateMatrixWorld();
    expect(pointerToPlane(cam, new Vector2(0, 0))).toBeNull();
  });
});

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
