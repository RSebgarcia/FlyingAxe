import type { DirectionalLight, PerspectiveCamera, Scene, Texture, WebGPURenderer } from 'three/webgpu';
import { bus as defaultBus, type EventBus, type GameEvents } from '../events';
import { Tuner, type HudLike } from '../ui/tuner';
import { Juice } from './juice';
import { PostFx, type PostOptions } from './post';
import { Weather, type SkyLike } from './weather';

// Punto de entrada de los efectos, el clima, la imagen final y las perillas en pantalla.
//
//   const fx = installFx({ renderer, scene, camera, ... });
//   // en el loop:
//   fx.update(dtReal);
//   physics.timeScale = fx.timeScale;   // la cámara lenta del corte
//   fx.render();                        // en vez de renderer.render(scene, camera)
//
// Todo lo demás llega por el bus de eventos (src/events.ts).

export interface FxOptions {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** Carga el panorama de un cielo ('sky_01'). */
  loadSky: (name: string) => Promise<Texture>;
  /** Los crujidos grabados. */
  crackUrls: string[];
  /** El HUD de src/ui/hud.ts: cortes, ayuda y especie. */
  hud: HudLike;
  /** Dónde va el panel de perillas (F1). */
  hudRoot?: HTMLElement;
  dome?: SkyLike;
  sun?: DirectionalLight;
  post?: PostOptions;
  bus?: EventBus<GameEvents>;
  /** Escucha C, Shift+C y F1. */
  keys?: boolean;
  /** Calidad del momento (el gobernador del paso 4); se lee en cada frame. */
  quality?: () => QualityLike | undefined;
}

/** Lo que se usa de un nivel de calidad de src/perf/quality.ts. */
export interface QualityLike {
  /** Multiplicador de partículas: astillas, lluvia y nieve. */
  particles: number;
  /** Bloom, AO y ajustes de color. */
  post: boolean;
}

export interface Fx {
  readonly juice: Juice;
  readonly weather: Weather;
  readonly post: PostFx;
  readonly tuner: Tuner;
  /** Escala para el dt de la física: baja a 0.35 durante la cámara lenta del corte. */
  readonly timeScale: number;
  update(realDt: number): void;
  setQuality(q: QualityLike): void;
  render(): void;
  dispose(): void;
}

export function installFx(opts: FxOptions): Fx {
  const bus = opts.bus ?? defaultBus;
  const juice = new Juice(opts.scene, opts.camera, bus);
  juice.audio.setCrackUrls(opts.crackUrls);
  juice.audio.attachUnlock();

  const tuner = new Tuner(bus, opts.hud, opts.hudRoot ?? document.body);
  const weather = new Weather(opts.scene, opts.camera, bus, {
    loadSky: opts.loadSky,
    dome: opts.dome,
    sun: opts.sun,
  });
  const post = new PostFx(opts.renderer, opts.scene, opts.camera, opts.post);
  weather.randomize();

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === 'F1') {
      e.preventDefault();
      tuner.toggle();
    } else if (e.code === 'KeyC') {
      weather.cycle(e.shiftKey);
    }
  };
  if (opts.keys ?? true) window.addEventListener('keydown', onKey);

  let lastQuality: QualityLike | null = null;
  const setQuality = (q: QualityLike) => {
    if (lastQuality && lastQuality.particles === q.particles && lastQuality.post === q.post) return;
    lastQuality = { particles: q.particles, post: q.post };
    for (const p of [juice.chips, juice.dust, weather.rain, weather.snow]) p.setDensity(q.particles);
    post.enabled = q.post;
  };

  return {
    juice,
    weather,
    post,
    tuner,
    get timeScale() {
      return juice.timeScale;
    },
    setQuality,
    update(realDt: number) {
      const q = opts.quality?.();
      if (q) setQuality(q);
      const gameDt = realDt * juice.timeScale;
      juice.update(realDt);
      weather.update(gameDt);
    },
    render() {
      post.render();
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      juice.dispose();
      weather.dispose();
      post.dispose();
      tuner.dispose();
    },
  };
}
