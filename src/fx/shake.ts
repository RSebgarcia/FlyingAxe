import { Vector3, type Object3D } from 'three/webgpu';

// Sacudón de cámara que decae (juice.gd :: shake_*).
//
// Se aplica como un desplazamiento que se saca al frame siguiente, así no pelea con
// quien sea que posicione la cámara: el que la mueve la mueve, y esto suma encima.

export class CameraShake {
  enabled = true;
  decay = 9;
  cut = 0.055;
  bounce = 0.018;

  amount = 0;
  private applied = new Vector3();

  constructor(
    private camera: Object3D,
    private random: () => number = Math.random,
  ) {}

  kick(strength: number): void {
    if (!this.enabled) return;
    this.amount = Math.max(this.amount, strength);
  }

  /** Usa dt real: en cámara lenta tiene que seguir decayendo a ritmo real. */
  update(realDt: number): void {
    this.camera.position.sub(this.applied);
    this.applied.set(0, 0, 0);
    if (this.amount <= 0.0001) {
      this.amount = 0;
      return;
    }
    this.amount = Math.max(this.amount - this.decay * this.amount * realDt, 0);
    const r = () => this.random() * 2 - 1;
    this.applied.set(r(), r(), r()).multiplyScalar(this.amount);
    this.camera.position.add(this.applied);
  }
}
