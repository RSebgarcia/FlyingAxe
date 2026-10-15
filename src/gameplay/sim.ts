// Orquestación del juego sin render, portada de game.gd: arma el mundo de Rapier, corre
// la física a paso fijo y rutea lo que pasa cuando el hacha toca la leña o el tocón.
//
// No sabe nada de three.js más allá de la matemática, así que corre igual en el
// navegador y en los tests headless. Efectos, sonido y clima (paso 3) se cuelgan de los
// eventos; la entrada táctil (paso 4) solo tiene que llamar a grab / release / pointer.

import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { Axe, type AxeContact, AxeState, type ColliderRole, type LogContactInfo } from './axe';
import {
  DEFAULT_FRICTION, FALL_LIMIT_Y, FLOOR_HALF, FLOOR_THICK, GRAVITY, PHYSICS_DT,
  RESPAWN_DELAY, STUMP_HEIGHT, STUMP_RADIUS,
} from './constants';
import { type KeyValueStore, loadKnobs, saveKnobs } from './knobs';
import { type ImpactOutcome, WoodLog } from './woodLog';

type Rapier = typeof RAPIER_NS;

export interface SimEvents {
  /** Un contacto del hacha con la leña, con el resultado y todos los números del golpe. */
  hit: { outcome: ImpactOutcome; energy: number; needed: number; info: LogContactInfo };
  /** Leña partida a hachazo. strength = energía / umbral, para el sonido y el sacudón. */
  cut: { point: Vector3; normal: Vector3; strength: number };
  /** El filo se clavó y el hacha ahora carga la leña. */
  lodge: { point: Vector3; normal: Vector3; strength: number };
  /** Golpe que no corta: de lomo, o un cascazo flojo. */
  bounce: { point: Vector3; strength: number };
  /** La leña clavada golpeó el tocón. broke dice si reventó. */
  slam: { energy: number; needed: number; point: Vector3; normal: Vector3; broke: boolean };
  /** Los números crudos del cascazo, para diagnóstico (CASCAZO_CRUDO en Godot). */
  slamRaw: { vNormal: number; masaEfectiva: number; normal: Vector3 };
  grab: Record<string, never>;
  release: { throws: number };
  /** Leño nuevo sobre el tocón. */
  newLog: { species: string; description: string };
  score: { score: number };
}

type Listener<K extends keyof SimEvents> = (e: SimEvents[K]) => void;

export interface SimOptions {
  /** Semilla de la leña. Sin semilla, cada partida sortea distinto. */
  seed?: number;
  /** Los bancos lo apagan: así miden siempre contra el mismo leño. */
  autoRespawn?: boolean;
  /** Dónde guardar las perillas. null = no persistir (tests). */
  store?: KeyValueStore | null;
}

export class GameSim {
  readonly world: RAPIER_NS.World;
  readonly axe: Axe;
  readonly log: WoodLog;
  readonly roles = new Map<number, ColliderRole>();

  score = 0;
  throws = 0;
  /** Tiempo de simulación en segundos. Todo lo que mide tiempo usa este reloj. */
  time = 0;
  autoRespawn: boolean;
  /** Paso 3 lo baja para la cámara lenta; los bancos lo dejan en 1. */
  timeScale = 1;

  private accumulator = 0;
  private restoreIn = 0;
  private readonly store: KeyValueStore | null;
  private listeners: { [K in keyof SimEvents]?: Array<Listener<K>> } = {};

  static readonly stumpTop = STUMP_HEIGHT;

  constructor(readonly R: Rapier, opts: SimOptions = {}) {
    this.autoRespawn = opts.autoRespawn ?? true;
    this.store = opts.store ?? null;

    this.world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = PHYSICS_DT;

    const ground = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    const floor = this.world.createCollider(
      R.ColliderDesc.cuboid(FLOOR_HALF, FLOOR_THICK / 2, FLOOR_HALF)
        .setTranslation(0, -FLOOR_THICK / 2, 0)
        .setFriction(DEFAULT_FRICTION),
      ground,
    );
    this.roles.set(floor.handle, 'floor');
    const stump = this.world.createCollider(
      R.ColliderDesc.cylinder(STUMP_HEIGHT / 2, STUMP_RADIUS)
        .setTranslation(0, STUMP_HEIGHT / 2, 0)
        .setFriction(DEFAULT_FRICTION),
      ground,
    );
    this.roles.set(stump.handle, 'stump');

    this.axe = new Axe(R, this.world, this.roles);
    const saved = loadKnobs(this.store);
    if (saved) this.axe.setKnobs(saved);

    this.log = new WoodLog(R, this.world, this.roles, opts.seed);
    this.newLog();
  }

  on<K extends keyof SimEvents>(name: K, fn: Listener<K>): () => void {
    const list = (this.listeners[name] ??= []) as Array<Listener<K>>;
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  private emit<K extends keyof SimEvents>(name: K, e: SimEvents[K]): void {
    for (const fn of (this.listeners[name] ?? []) as Array<Listener<K>>) fn(e);
  }

  // --- entrada ------------------------------------------------------------------------

  /** Dónde está el dedo, ya proyectado al plano x = 0 (ver pointer.ts). */
  setPointer(p: Vector3): void {
    this.axe.handPointer.set(0, p.y, p.z);
  }

  grab(p?: Vector3): void {
    if (p) this.setPointer(p);
    this.axe.grab(this.time);
    this.emit('grab', {});
  }

  release(): void {
    if (this.axe.release()) {
      this.throws++;
      this.emit('release', { throws: this.throws });
    }
  }

  resetAxe(): void {
    this.axe.reset();
    this.log.restore();
  }

  /** Guarda las perillas. Llamarlo después de tocar cualquiera. */
  saveKnobs(): void {
    saveKnobs(this.store, this.axe.knobs());
  }

  // --- bucle --------------------------------------------------------------------------

  /** Avanza con el tiempo real del frame; corre los pasos fijos que hagan falta. */
  update(frameDt: number): number {
    this.accumulator += Math.min(frameDt, 0.1) * this.timeScale;
    let steps = 0;
    while (this.accumulator >= PHYSICS_DT) {
      this.fixedStep();
      this.accumulator -= PHYSICS_DT;
      steps++;
    }
    return steps;
  }

  /** Cuánto del próximo paso ya pasó, para interpolar el render si hace falta. */
  alpha(): number {
    return this.accumulator / PHYSICS_DT;
  }

  fixedStep(): void {
    const dt = PHYSICS_DT;
    this.axe.preStep(dt);
    this.world.step();
    this.time += dt;

    const contact = this.axe.scanContacts(this.time, this.log.isSplit || this.log.carried ? null : this.log.center());
    if (contact) this.route(contact);

    // Si se fue del mundo, volvela sola. Nadie quiere perder el hacha.
    if (this.axe.position().y < FALL_LIMIT_Y) this.axe.reset();

    if (this.restoreIn > 0) {
      this.restoreIn -= dt;
      if (this.restoreIn <= 0 && this.autoRespawn) this.newLog();
    }
  }

  private route(c: AxeContact): void {
    if (c.kind === 'slam') {
      this.emit('slamRaw', { vNormal: c.vNormal, masaEfectiva: c.masaEfectiva, normal: c.normal });
      return this.onSlam(c.energy, c.point, c.normal);
    }

    const outcome = this.log.resolveImpact(this.axe, c.localPoint, c.energy);
    const needed = this.log.splitEnergy();
    this.emit('hit', { outcome, energy: c.energy, needed, info: c.info });
    const strength = clamp(c.energy / Math.max(needed, 0.01), 0, 2);
    const point = c.info.puntoMundo;
    const normal = c.info.normal;

    if (outcome === 'corto') {
      this.addScore();
      this.emit('cut', { point, normal, strength });
    } else if (outcome === 'clavada') {
      // El período de gracia evita que sacarla de costado la re-clave al toque.
      if (this.axe.canLodge(this.time) && this.log.handTo(this.axe)) {
        this.emit('lodge', { point, normal, strength });
      }
    } else if (outcome === 'lomo') {
      this.emit('bounce', { point, strength });
    }
  }

  /** La leña clavada golpea el tocón: mismo criterio de energía, sin exigir filo. */
  private onSlam(energy: number, point: Vector3, normal: Vector3): void {
    const needed = this.log.splitEnergy();
    const broke = energy >= needed;
    this.emit('slam', { energy, needed, point, normal, broke });
    if (!broke) {
      this.emit('bounce', { point, strength: energy / Math.max(needed, 0.01) });
      return;
    }
    const where = this.axe.dropLog();
    this.log.splitAt(where);
    this.addScore();
    this.emit('cut', { point, normal, strength: 1 });
  }

  private addScore(): void {
    this.score++;
    this.restoreIn = RESPAWN_DELAY;
    this.emit('score', { score: this.score });
  }

  /** Leño nuevo, sorteado, apoyado sobre la tapa del tocón. */
  newLog(): void {
    this.log.respawn(GameSim.stumpTop);
    this.axe.targetPoint.copy(this.log.center());
    this.emit('newLog', { species: this.log.woodName(), description: this.log.describe() });
  }

  isHeld(): boolean {
    return this.axe.state === AxeState.HELD;
  }

  dispose(): void {
    this.world.free();
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}
