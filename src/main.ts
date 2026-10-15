import { Timer } from 'three/webgpu';
import { buildWorld } from './game/world';
import { Pointer } from './input/pointer';
import { Physics } from './physics/physics';
import { addStaticCollider } from './physics/static';
import { Assets } from './render/assets';
import { createRenderer } from './render/renderer';
import { Hud } from './ui/hud';

async function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const hud = new Hud();

  const [{ renderer, backend }, physics] = await Promise.all([createRenderer(canvas), Physics.create()]);
  const world = await buildWorld(new Assets(renderer));
  addStaticCollider(physics, world.ground, 'box');
  addStaticCollider(physics, world.stump, 'cylinder');

  const pointer = new Pointer(canvas, world.camera);

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    world.camera.aspect = innerWidth / innerHeight;
    world.camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  hud.setScore(0);
  hud.setHint('Agarrá el hacha y movela, el peso está en la cabeza');
  hud.setSpecies('Pino', '32 × 40 cm · 3.2 kg');

  // Exposed for the browser smoke test and for poking around in the console.
  Object.assign(window, { flyingAxe: { renderer, backend, world, physics, pointer } });

  const timer = new Timer();
  renderer.setAnimationLoop((t) => {
    timer.update(t);
    physics.update(timer.getDelta());
    world.sky.follow(world.camera);
    renderer.render(world.scene, world.camera);
  });
  hud.loaded();
  document.documentElement.dataset.ready = backend;
}

main().catch((err: unknown) => {
  console.error(err);
  new Hud().fail('No se pudo cargar el juego. Probá con otro navegador.');
  document.documentElement.dataset.ready = 'error';
});
