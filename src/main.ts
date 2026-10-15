import { Timer } from 'three/webgpu';
import { buildWorld } from './game/world';
import { Pointer } from './input/pointer';
import { FrameStats } from './perf/frame-stats';
import { QualityGovernor, initialTier, readDeviceHints, type QualityTier } from './perf/quality';
import { Physics } from './physics/physics';
import { addStaticCollider } from './physics/static';
import { Assets } from './render/assets';
import { applyCameraFit } from './render/camera-fit';
import { createRenderer } from './render/renderer';
import { Hud } from './ui/hud';
import { PerfMeter } from './ui/perf-meter';

async function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const hud = new Hud();

  const [{ renderer, backend }, physics] = await Promise.all([createRenderer(canvas), Physics.create()]);
  const world = await buildWorld(new Assets(renderer));
  addStaticCollider(physics, world.ground, 'box');
  addStaticCollider(physics, world.stump, 'cylinder');

  const pointer = new Pointer(canvas, world.camera);

  // Quality starts from a guess about the device and then follows the measured p95.
  const applyQuality = (q: QualityTier) => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, q.maxPixelRatio));
    renderer.setSize(innerWidth, innerHeight, false);
    world.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    world.sun.shadow.map?.dispose();
    world.sun.shadow.map = null;
  };
  const quality = new QualityGovernor(initialTier(readDeviceHints()), applyQuality);
  applyQuality(quality.current);
  const frames = new FrameStats();
  const meter = new PerfMeter({ info: renderer.info, backend, tier: () => quality.current.name });

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    // Keeps the demo's horizontal framing on narrow and portrait screens.
    applyCameraFit(world.camera, innerWidth / innerHeight);
  };
  addEventListener('resize', resize);
  resize();

  hud.setScore(0);
  hud.setHint('Agarrá el hacha y movela, el peso está en la cabeza');
  hud.setSpecies('Pino', '32 × 40 cm · 3.2 kg');

  // Exposed for the browser smoke test and for poking around in the console.
  Object.assign(window, { flyingAxe: { renderer, backend, world, physics, pointer, quality } });

  const timer = new Timer();
  renderer.setAnimationLoop((t) => {
    timer.update(t);
    const dt = timer.getDelta();
    physics.update(dt);
    world.sky.follow(world.camera);
    renderer.render(world.scene, world.camera);
    const dtMs = dt * 1000;
    frames.push(dtMs);
    quality.update(frames, t);
    meter.frame(dtMs, t);
  });
  hud.loaded();
  document.documentElement.dataset.ready = backend;
}

main().catch((err: unknown) => {
  console.error(err);
  new Hud().fail('No se pudo cargar el juego. Probá con otro navegador.');
  document.documentElement.dataset.ready = 'error';
});
