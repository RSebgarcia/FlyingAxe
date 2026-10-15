import {
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  type Camera,
  type Scene,
  type Texture,
} from 'three/webgpu';
import { fog, positionView, uniform } from 'three/tsl';
import type { EventBus, GameEvents } from '../events';
import { CLIMAS, lightningCurve, sunDirection, type Clima } from './climas';
import { srgb } from './color';
import { Precipitation } from './precip';

// Clima y hora del día (ambience.gd). Cambia cielo, sol, niebla y precipitación, y en la
// tormenta tira relámpagos.
//
// Lo que NO se portó todavía: la niebla volumétrica de Forward+ (los rayos de sol). En la
// demo está al 35 % porque en el campo pelado no hay nada que tape la luz y solo lava el
// color; cuando entre el bosque conviene hacerla con GodraysNode.

// Godot mide la luz en unidades propias; en three una direccional de intensidad π
// ilumina como la de energía 1 en Godot.
const SUN_SCALE = Math.PI;
// Cada cuántos leños cambia el clima. Que cambie con cada uno marea.
const LOGS_PER_WEATHER = 3;

/** El domo de cielo de src/render/sky.ts (o cualquier cosa que se le parezca). */
export interface SkyLike {
  setPanorama(panorama: Texture): void;
  intensity: { value: number };
}

export interface WeatherOptions {
  /** Carga el panorama equirectangular de un cielo como 'sky_01'. */
  loadSky: (name: string) => Promise<Texture>;
  /** El domo donde se dibuja el cielo. Sin domo, va como `scene.background`. */
  dome?: SkyLike;
  /** Si la escena ya trae un sol, se usa ese con sus sombras tal cual. */
  sun?: DirectionalLight;
  random?: () => number;
}

export class Weather {
  readonly sun: DirectionalLight;
  readonly rain = Precipitation.rain();
  readonly snow = Precipitation.snow();

  current = 0;
  /** Cierto cuando se eligió a mano: deja de rotar solo hasta que se suelte. */
  fixed = false;

  private skies = new Map<string, Promise<Texture>>();
  private applyToken = 0;
  private fogColor = uniform(new Color());
  private fogDensity = uniform(0);

  private lightning = false;
  private nextBolt = 5;
  private flash = 0;
  private baseSun = 1;
  private baseAmbient = 0.5;
  private skyEnergy = 1;
  private logsUntilChange = LOGS_PER_WEATHER;
  private random: () => number;
  private off: Array<() => void> = [];

  constructor(
    private scene: Scene,
    private camera: Camera,
    private bus: EventBus<GameEvents>,
    private opts: WeatherOptions,
  ) {
    this.random = opts.random ?? Math.random;
    if (opts.sun) {
      this.sun = opts.sun;
    } else {
      this.sun = new DirectionalLight();
      scene.add(this.sun, this.sun.target);
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      Object.assign(this.sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 50 });
      this.sun.shadow.bias = -0.0005;
    }

    // Niebla exponencial como la de Godot: 1 - e^(-densidad · distancia).
    // La FogExp2 de three eleva la distancia al cuadrado y da otra curva.
    const factor = positionView.length().mul(this.fogDensity).negate().exp().oneMinus();
    (scene as Scene & { fogNode: unknown }).fogNode = fog(this.fogColor, factor);

    scene.add(this.rain.mesh, this.snow.mesh);

    this.off.push(bus.on('logSpawned', () => this.onLogSpawned()));
  }

  get name(): string {
    return CLIMAS[this.current].nombre;
  }

  get count(): number {
    return CLIMAS.length;
  }

  /** Cambia cada tantos leños, salvo que se haya fijado a mano. */
  private onLogSpawned(): void {
    this.logsUntilChange -= 1;
    if (!this.fixed && this.logsUntilChange <= 0) {
      this.randomize();
      this.logsUntilChange = LOGS_PER_WEATHER;
    }
  }

  randomize(): void {
    this.apply(Math.floor(this.random() * CLIMAS.length));
  }

  next(): void {
    this.apply((this.current + 1) % CLIMAS.length);
  }

  /** C: elegir a mano FIJA el clima. Shift+C: vuelve a sortear y a rotar solo. */
  cycle(shift: boolean): void {
    if (shift) {
      this.fixed = false;
      this.randomize();
    } else {
      this.fixed = true;
      this.next();
    }
  }

  apply(i: number): void {
    this.current = Math.min(Math.max(i, 0), CLIMAS.length - 1);
    const c = CLIMAS[this.current];
    const token = ++this.applyToken;

    // --- cielo ---
    // La exposición se pisa en cada aplicación porque dos climas pueden compartir panorama
    // con brillos distintos.
    this.skyEnergy = c.cieloEnergia ?? 1;
    const dome = this.opts.dome;
    if (dome) dome.intensity.value = this.skyEnergy;
    else this.scene.backgroundIntensity = this.skyEnergy;
    void this.sky(c.cielo).then((tex) => {
      // Si mientras bajaba se cambió de clima otra vez, este cielo ya no corresponde.
      if (token !== this.applyToken) return;
      if (dome) dome.setPanorama(tex);
      else this.scene.background = tex;
      this.scene.environment = tex;
    });

    // --- sol ---
    const [dx, dy, dz] = sunDirection(c.elev, c.azim);
    this.sun.position.set(dx * 20, dy * 20, dz * 20);
    this.sun.target.position.set(0, 0, 0);
    this.sun.target.updateMatrixWorld();
    this.sun.color.copy(srgb(...c.luz));

    // --- niebla ---
    this.fogDensity.value = c.niebla;
    (this.fogColor.value as Color).copy(srgb(...c.nieblaColor));

    // --- precipitación ---
    this.rain.setEnabled(c.precip === 'lluvia', this.camera);
    this.snow.setEnabled(c.precip === 'nieve', this.camera);

    // --- tormenta ---
    this.lightning = c.rayos === true;
    this.nextBolt = 2 + this.random() * 4;
    this.flash = 0;
    this.baseSun = c.energia;
    this.baseAmbient = c.ambiente;
    this.setLight(0);

    this.bus.emit('weather', { name: c.nombre, fixed: this.fixed });
  }

  get clima(): Clima {
    return CLIMAS[this.current];
  }

  // El ambiente sale del cielo, así que también lo afecta su exposición.
  private setLight(curve: number): void {
    this.sun.intensity = (this.baseSun + curve * 9) * SUN_SCALE;
    this.scene.environmentIntensity = (this.baseAmbient + curve * 1.4) * this.skyEnergy;
  }

  private sky(name: string): Promise<Texture> {
    let p = this.skies.get(name);
    if (!p) {
      p = this.opts.loadSky(name).then((tex) => {
        tex.mapping = EquirectangularReflectionMapping;
        return tex;
      });
      this.skies.set(name, p);
    }
    return p;
  }

  /** dt de juego. */
  update(dt: number): void {
    this.bolts(dt);
    this.rain.update(dt, this.camera);
    this.snow.update(dt, this.camera);
  }

  // No es un flash de pantalla: sube de golpe la luz direccional y la ambiente, así que
  // el fogonazo proyecta sombras de verdad.
  private bolts(dt: number): void {
    if (!this.lightning) return;
    if (this.flash > 0) {
      this.flash = Math.max(this.flash - dt * 6, 0);
      this.setLight(this.flash > 0 ? lightningCurve(this.flash) : 0);
      return;
    }
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) {
      this.flash = 1;
      this.nextBolt = 4 + this.random() * 9;
      this.setLight(1);
      // El trueno llega después del fogonazo; el retardo lo decide quien escuche.
      this.bus.emit('thunder', { strength: 0.6 + this.random() * 0.4 });
    }
  }

  dispose(): void {
    for (const f of this.off) f();
    this.rain.mesh.removeFromParent();
    this.snow.mesh.removeFromParent();
    this.rain.dispose();
    this.snow.dispose();
    for (const p of this.skies.values()) void p.then((t) => t.dispose());
  }
}
