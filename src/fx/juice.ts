import type { Object3D, Scene } from 'three/webgpu';
import type { EventBus, GameEvents } from '../events';
import { HitAudio } from './audio';
import { ChipBurst } from './chips';
import { srgb } from './color';
import { HitStop } from './hitstop';
import { CameraShake } from './shake';

// Todo el feedback del golpe en un solo lugar: astillas, cámara lenta, sacudón y sonido
// (juice.gd). Nada de esto cambia la física ni las reglas: cada cosa se apaga con su
// `enabled` y el juego sigue funcionando igual.

export class Juice {
  readonly hitStop = new HitStop();
  readonly shake: CameraShake;
  readonly audio: HitAudio;
  readonly chips = new ChipBurst({ tint: srgb(0.78, 0.62, 0.38), amount: 26, speed: 2.6, size: 0.022 });
  readonly dust = new ChipBurst({ tint: srgb(0.55, 0.45, 0.3), amount: 10, speed: 0.9, size: 0.014 });

  chipsEnabled = true;

  private off: Array<() => void> = [];

  constructor(scene: Scene, camera: Object3D, bus: EventBus<GameEvents>) {
    this.shake = new CameraShake(camera);
    this.audio = new HitAudio(camera);
    scene.add(this.chips.mesh, this.dust.mesh);

    this.off.push(
      bus.on('cut', ({ point, normal, force }) => {
        if (this.chipsEnabled) {
          this.chips.fire(point, normal);
          this.dust.fire(point, normal);
        }
        this.audio.play('crack', point, force);
        this.hitStop.trigger();
        this.shake.kick(this.shake.cut);
      }),
      bus.on('lodge', ({ point, normal, force }) => {
        if (this.chipsEnabled) this.dust.fire(point, normal);
        this.audio.play('chunk', point, force);
        this.shake.kick(this.shake.bounce);
      }),
      bus.on('bounce', ({ point, force }) => {
        if (point) this.audio.play('thud', point, force);
        this.shake.kick(this.shake.bounce * 0.6);
      }),
    );
  }

  /** Escala de tiempo para la física y todo lo que corra en tiempo de juego. */
  get timeScale(): number {
    return this.hitStop.timeScale;
  }

  update(realDt: number): void {
    // La escala se lee antes de avanzar la cámara lenta: el frame que la termina todavía va lento.
    const gameDt = realDt * this.hitStop.timeScale;
    this.hitStop.update(realDt);
    this.chips.update(gameDt);
    this.dust.update(gameDt);
    this.shake.update(realDt);
  }

  dispose(): void {
    for (const f of this.off) f();
    this.chips.mesh.removeFromParent();
    this.dust.mesh.removeFromParent();
    this.chips.dispose();
    this.dust.dispose();
    this.audio.dispose();
  }
}
