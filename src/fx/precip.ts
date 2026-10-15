import {
  BoxGeometry,
  DataTexture,
  DynamicDrawUsage,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  Vector3,
  type Camera,
} from 'three/webgpu';
import { srgb } from './color';

// Lluvia y nieve (ambience.gd :: _make_rain, _make_snow).
//
// Las partículas SIGUEN A LA CÁMARA: nacen en una caja sobre ella y después caen en el
// mundo. Si no, habría que llenar los 80 × 80 m del piso de gotas para que se vean donde
// está el jugador. Arrancan ya llenas (el `preprocess` de Godot): sin eso la nieve, con
// 6 s de vida, tardaba una eternidad en llenar el aire.

interface Spec {
  amount: number;
  lifetime: number;
  /** Altura de la caja de emisión sobre la cámara. */
  above: number;
  extents: [number, number, number];
  dir: [number, number, number];
  spreadDeg: number;
  vMin: number;
  vMax: number;
  gravity: number;
  scaleMin: number;
  scaleMax: number;
  turbulence?: { strength: number; scale: number };
}

const RAIN: Spec = {
  amount: 1300, lifetime: 1.0, above: 6.0, extents: [6.5, 0.4, 6.5],
  dir: [0.08, -1, 0], spreadDeg: 2, vMin: 13, vMax: 17, gravity: -6,
  scaleMin: 0.6, scaleMax: 1.0,
};

// La nieve cae lenta, así que se emite más bajo: desde 5 m tardaba tanto en bajar que
// solo se veían copos arriba de todo.
const SNOW: Spec = {
  amount: 1400, lifetime: 6.0, above: 2.5, extents: [6.5, 1.5, 6.5],
  dir: [0.2, -1, 0.1], spreadDeg: 12, vMin: 0.5, vMax: 1.1, gravity: -0.5,
  scaleMin: 0.5, scaleMax: 1.5,
  // Sin turbulencia los copos caen como plomadas y parece lluvia blanca.
  turbulence: { strength: 0.8, scale: 1.6 },
};

/** Punto blanco con el borde difuminado, generado en memoria. */
export function softDot(size = 32): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c;
      const a = Math.min(Math.max(1 - d, 0), 1);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      // Al cuadrado: el borde se apaga más rápido y el centro queda sólido.
      data[i + 3] = Math.round(a * a * 255);
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class Precipitation {
  readonly mesh: InstancedMesh;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private scale: Float32Array;
  private time = 0;
  private on = false;

  private m = new Matrix4();
  private q = new Quaternion();
  private v = new Vector3();
  private s = new Vector3();
  private origin = new Vector3();
  private dir: Vector3;

  constructor(
    private spec: Spec,
    mesh: InstancedMesh,
    private billboard: boolean,
    private random: () => number = Math.random,
  ) {
    this.mesh = mesh;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.visible = false;
    const n = spec.amount;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n);
    this.scale = new Float32Array(n);
    this.dir = new Vector3(...spec.dir).normalize();
  }

  static rain(): Precipitation {
    // Gota = tira MUY fina y corta. La primera versión medía 34 cm y a esta distancia de
    // cámara se veían como postes blancos cruzando la pantalla.
    const geo = new BoxGeometry(0.006, 0.13, 0.006);
    const mat = new MeshBasicMaterial({
      color: srgb(0.76, 0.84, 0.95), transparent: true, opacity: 0.55, depthWrite: false,
    });
    return new Precipitation(RAIN, new InstancedMesh(geo, mat, RAIN.amount), false);
  }

  static snow(): Precipitation {
    const geo = new PlaneGeometry(0.045, 0.045);
    // Sin textura un quad plano se ve como confeti, no como nieve.
    const mat = new MeshBasicMaterial({
      color: 0xffffff, map: softDot(), transparent: true, opacity: 0.85, depthWrite: false,
    });
    return new Precipitation(SNOW, new InstancedMesh(geo, mat, SNOW.amount), true);
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Fracción de partículas a dibujar (calidad adaptativa del paso 4). */
  setDensity(fraction: number): void {
    const n = Math.max(1, Math.round(this.spec.amount * Math.min(Math.max(fraction, 0), 1)));
    this.mesh.count = n;
  }

  /**
   * Además de dejar de emitir hay que ocultarlo: con la nieve (6 s de vida) seguían
   * viéndose copos varios segundos después de pasar a lluvia.
   */
  setEnabled(on: boolean, camera: Camera): void {
    this.on = on;
    this.mesh.visible = on;
    if (on) this.prefill(camera);
  }

  private emitterOrigin(camera: Camera): Vector3 {
    camera.getWorldPosition(this.origin);
    this.origin.y += this.spec.above;
    return this.origin;
  }

  private spawn(i: number, origin: Vector3): void {
    const r = this.random;
    const [ex, ey, ez] = this.spec.extents;
    const k = i * 3;
    this.pos[k] = origin.x + (r() * 2 - 1) * ex;
    this.pos[k + 1] = origin.y + (r() * 2 - 1) * ey;
    this.pos[k + 2] = origin.z + (r() * 2 - 1) * ez;
    // Cono chico alrededor de la dirección.
    const spread = (this.spec.spreadDeg * Math.PI) / 180;
    this.v.set((r() * 2 - 1) * spread, 0, (r() * 2 - 1) * spread).add(this.dir).normalize();
    const sp = this.spec.vMin + r() * (this.spec.vMax - this.spec.vMin);
    this.vel[k] = this.v.x * sp;
    this.vel[k + 1] = this.v.y * sp;
    this.vel[k + 2] = this.v.z * sp;
    this.age[i] = 0;
    this.scale[i] = this.spec.scaleMin + r() * (this.spec.scaleMax - this.spec.scaleMin);
  }

  private prefill(camera: Camera): void {
    const origin = this.emitterOrigin(camera);
    const n = this.spec.amount;
    for (let i = 0; i < n; i++) {
      this.spawn(i, origin);
      // Cada una arranca en un punto distinto de su vida, como si ya viniera cayendo.
      this.step(i, this.random() * this.spec.lifetime);
    }
  }

  private step(i: number, dt: number): void {
    const k = i * 3;
    const t = this.spec.turbulence;
    if (t) {
      // Campo de ruido barato: senos cruzados que se desplazan con el tiempo.
      const px = this.pos[k] * t.scale, py = this.pos[k + 1] * t.scale, pz = this.pos[k + 2] * t.scale;
      const tt = this.time * 0.7;
      this.vel[k] += Math.sin(py * 1.7 + tt + pz) * t.strength * dt;
      this.vel[k + 2] += Math.cos(px * 1.3 - tt + py) * t.strength * dt;
    }
    this.vel[k + 1] += this.spec.gravity * dt;
    this.pos[k] += this.vel[k] * dt;
    this.pos[k + 1] += this.vel[k + 1] * dt;
    this.pos[k + 2] += this.vel[k + 2] * dt;
    this.age[i] += dt;
  }

  update(frameDt: number, camera: Camera): void {
    if (!this.on) return;
    // Con un frame larguísimo (pestaña en segundo plano, teléfono trabado) todas las gotas
    // vencerían juntas y renacerían en el mismo instante, cayendo en bloque. Mejor que
    // la lluvia vaya más lenta un momento.
    const dt = Math.min(frameDt, 1 / 20);
    this.time += dt;
    const origin = this.emitterOrigin(camera);
    const n = this.mesh.count;
    if (this.billboard) camera.getWorldQuaternion(this.q);
    else this.q.identity();
    for (let i = 0; i < n; i++) {
      if (this.age[i] >= this.spec.lifetime) this.spawn(i, origin);
      this.step(i, dt);
      const k = i * 3;
      this.v.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
      this.s.setScalar(this.scale[i]);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    const mat = this.mesh.material as MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
