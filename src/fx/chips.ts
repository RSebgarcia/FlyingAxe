import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three/webgpu';

// Ráfaga de astillas (juice.gd :: _make_burst).
//
// Paralelepípedos chiquitos, no cuadraditos: se leen como madera. Es una ráfaga de una
// sola vez: cada disparo reinicia todas las partículas, igual que GPUParticles3D.restart().

export interface BurstOptions {
  tint: Color;
  amount: number;
  speed: number;
  size: number;
  lifetime?: number;
  spreadDeg?: number;
}

const GRAVITY = -9.8;
const DEG = Math.PI / 180;

export class ChipBurst {
  readonly mesh: InstancedMesh;
  private readonly lifetime: number;
  private readonly spread: number;
  private readonly speed: number;

  private age = Infinity;
  private pos: Float32Array;
  private vel: Float32Array;
  private axis: Float32Array;
  private spin: Float32Array;
  private scale: Float32Array;
  private damp: Float32Array;

  private m = new Matrix4();
  private q = new Quaternion();
  private v = new Vector3();
  private s = new Vector3();

  constructor(
    opts: BurstOptions,
    private random: () => number = Math.random,
  ) {
    const n = opts.amount;
    this.lifetime = opts.lifetime ?? 1.1;
    this.spread = (opts.spreadDeg ?? 55) * DEG;
    this.speed = opts.speed;
    const geo = new BoxGeometry(opts.size * 0.35, opts.size, opts.size * 2.6);
    const mat = new MeshStandardMaterial({ color: opts.tint, roughness: 0.9 });
    this.mesh = new InstancedMesh(geo, mat, n);
    this.capacity = n;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.axis = new Float32Array(n * 3);
    this.spin = new Float32Array(n);
    this.scale = new Float32Array(n);
    this.damp = new Float32Array(n);
  }

  private readonly capacity: number;

  /** Fracción de astillas a tirar (calidad adaptativa del paso 4). */
  setDensity(fraction: number): void {
    this.mesh.count = Math.max(1, Math.round(this.capacity * Math.min(Math.max(fraction, 0), 1)));
  }

  get active(): boolean {
    return this.age < this.lifetime;
  }

  fire(at: Vector3, normal: Vector3): void {
    const dir = normal.lengthSq() > 0.1 ? normal.clone().normalize() : new Vector3(0, 1, 0);
    // Base ortonormal alrededor de la dirección para abrir el cono.
    const t = Math.abs(dir.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const u = t.cross(dir).normalize();
    const w = dir.clone().cross(u);
    const r = this.random;
    const n = this.mesh.count;
    for (let i = 0; i < n; i++) {
      // Punto al azar en una esfera de 4 cm.
      const ex = (r() * 2 - 1) * 0.04;
      const ey = (r() * 2 - 1) * 0.04;
      const ez = (r() * 2 - 1) * 0.04;
      this.pos.set([at.x + ex, at.y + ey, at.z + ez], i * 3);

      const theta = Math.acos(1 - r() * (1 - Math.cos(this.spread)));
      const phi = r() * Math.PI * 2;
      const st = Math.sin(theta);
      const sp = this.speed * (0.4 + r() * 0.6);
      this.v
        .copy(dir)
        .multiplyScalar(Math.cos(theta))
        .addScaledVector(u, st * Math.cos(phi))
        .addScaledVector(w, st * Math.sin(phi))
        .multiplyScalar(sp);
      this.vel.set([this.v.x, this.v.y, this.v.z], i * 3);

      this.v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      this.axis.set([this.v.x, this.v.y, this.v.z], i * 3);
      this.spin[i] = (r() * 2 - 1) * 540 * DEG;
      this.scale[i] = 0.5 + r() * 0.9;
      this.damp[i] = 0.2 + r() * 0.6;
    }
    this.age = 0;
    this.mesh.visible = true;
    this.write();
  }

  /** dt de juego: en cámara lenta las astillas también van lentas. */
  update(frameDt: number): void {
    // Un frame trabado no puede tirar las astillas al piso de un salto.
    const dt = Math.min(frameDt, 1 / 20);
    if (!this.active) {
      this.mesh.visible = false;
      return;
    }
    this.age += dt;
    const n = this.mesh.count;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      // damping de Godot: resta una cantidad fija de velocidad por segundo.
      const vx = this.vel[k], vy = this.vel[k + 1], vz = this.vel[k + 2];
      const sp = Math.hypot(vx, vy, vz);
      const f = sp > 0 ? Math.max(sp - this.damp[i] * dt, 0) / sp : 0;
      this.vel[k] = vx * f;
      this.vel[k + 1] = vy * f + GRAVITY * dt;
      this.vel[k + 2] = vz * f;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
    }
    this.write();
  }

  private write(): void {
    const n = this.mesh.count;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      this.v.set(this.axis[k], this.axis[k + 1], this.axis[k + 2]);
      this.q.setFromAxisAngle(this.v, this.spin[i] * this.age);
      this.v.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
      this.s.setScalar(this.scale[i]);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
    this.mesh.dispose();
  }
}
