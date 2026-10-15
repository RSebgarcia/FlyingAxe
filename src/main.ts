import RAPIER from '@dimforge/rapier3d-compat';
import { Timer } from 'three/webgpu';
import { GameSim, GameplayView, attachKnobKeys, browserStore } from './gameplay';
import { buildWorld } from './game/world';
import { Pointer } from './input/pointer';
import { Assets } from './render/assets';
import { createRenderer } from './render/renderer';
import { Hud } from './ui/hud';

async function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const hud = new Hud();

  const [{ renderer, backend }] = await Promise.all([createRenderer(canvas), RAPIER.init()]);
  const world = await buildWorld(new Assets(renderer));

  // El juego (paso 2): su propio mundo de Rapier con el piso, el tocón, el hacha y la
  // leña, a 120 Hz fijos. La vista reusa el hacha y la leña que armó el escenario.
  const sim = new GameSim(RAPIER, { store: browserStore() });
  const view = new GameplayView(sim, world.scene, { axe: world.axe, log: world.log });
  const pointer = new Pointer(canvas, world.camera);
  pointer.onDown(() => sim.grab(pointer.world));
  pointer.onUp(() => sim.release());
  attachKnobKeys(sim);

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    world.camera.aspect = innerWidth / innerHeight;
    world.camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  const showLog = () => {
    const l = sim.log;
    hud.setSpecies(l.woodName(), `${(l.radius * 200).toFixed(0)} × ${(l.height * 100).toFixed(0)} cm · ${l.logMass.toFixed(1)} kg`);
  };
  sim.on('newLog', showLog);
  sim.on('score', (e) => hud.setScore(e.score));
  hud.setScore(0);
  hud.setHint('Agarrá el hacha y movela, el peso está en la cabeza');
  showLog();

  // Exposed for the browser smoke test and for poking around in the console.
  Object.assign(window, { flyingAxe: { renderer, backend, world, sim, pointer } });

  const timer = new Timer();
  renderer.setAnimationLoop((t) => {
    timer.update(t);
    if (sim.isHeld()) sim.setPointer(pointer.world);
    sim.update(timer.getDelta());
    view.sync();
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
