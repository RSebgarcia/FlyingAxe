import { Timer } from 'three/webgpu';
import { installFx, type QualityLike } from './fx';
import { buildWorld } from './game/world';
import { Pointer } from './input/pointer';
import { Physics } from './physics/physics';
import { addStaticCollider } from './physics/static';
import { Assets, assetUrl } from './render/assets';
import { createRenderer } from './render/renderer';
import { Hud } from './ui/hud';

async function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const hud = new Hud();

  const [{ renderer, backend }, physics] = await Promise.all([createRenderer(canvas), Physics.create()]);
  const assets = new Assets(renderer);
  const world = await buildWorld(assets);
  addStaticCollider(physics, world.ground, 'box');
  addStaticCollider(physics, world.stump, 'cylinder');

  const pointer = new Pointer(canvas, world.camera);

  // Efectos, clima, imagen final y perillas (F1). Escuchan los eventos del juego.
  const fx = installFx({
    renderer,
    scene: world.scene,
    camera: world.camera,
    loadSky: (name) => assets.sky(name),
    crackUrls: [1, 2, 3, 4, 5, 6].map((i) => assetUrl(`sfx/split_0${i}.wav`)),
    hud,
    hudRoot: document.getElementById('hud')!,
    dome: world.sky,
    sun: world.sun,
    // El gobernador de calidad adaptativa (paso 4) se cuelga en window.flyingAxe.quality.
    quality: () => (window as { flyingAxe?: { quality?: { current: QualityLike } } }).flyingAxe?.quality?.current,
  });

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
  Object.assign(window, { flyingAxe: { renderer, backend, world, physics, pointer, fx } });

  const timer = new Timer();
  renderer.setAnimationLoop((t) => {
    timer.update(t);
    const dt = timer.getDelta();
    fx.update(dt);
    physics.timeScale = fx.timeScale;
    physics.update(dt);
    world.sky.follow(world.camera);
    fx.render();
  });
  hud.loaded();
  document.documentElement.dataset.ready = backend;
}

main().catch((err: unknown) => {
  console.error(err);
  new Hud().fail('No se pudo cargar el juego. Probá con otro navegador.');
  document.documentElement.dataset.ready = 'error';
});
