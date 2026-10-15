import type { Vector3 } from 'three/webgpu';

// Lo que pasa en el juego, para quien quiera enterarse.
//
// La jugabilidad (hacha, leña, puntaje) emite; los efectos, el clima y el HUD escuchan.
// Así el feedback se puede apagar o cambiar sin tocar la física, igual que en Godot
// game.gd ruteaba a juice.gd y ambience.gd sin que estos supieran nada del hacha.

export interface GameEvents {
  /** Partió la leña: hachazo con filo o cascazo contra el tocón. force = energía/umbral (0..2). */
  cut: { point: Vector3; normal: Vector3; force: number };
  /** El hacha se clavó en la leña. */
  lodge: { point: Vector3; normal: Vector3; force: number };
  /** Entró de lomo, o el cascazo no alcanzó. */
  bounce: { point?: Vector3; force: number };
  /** Apareció un leño nuevo. El clima rota cada tres. */
  logSpawned: { species: string; widthCm: number; heightCm: number; massKg: number };
  score: { cuts: number };
  hint: { text: string };
  /** Perillas del hacha, para el HUD de F1. */
  tuner: {
    bladeWeight: number;
    weightAt: number;
    grip: number;
    wrist: number;
    assist: number;
    mass: number;
    comY: number;
    comZ: number;
    inertia: number;
  };
  grabbed: void;
  released: void;
  /** Lo emite el clima de tormenta un instante después del relámpago. */
  thunder: { strength: number };
  /** Cambió el clima (a mano o solo). */
  weather: { name: string; fixed: boolean };
}

type Handler<T> = (payload: T) => void;

export class EventBus<M extends object> {
  private handlers = new Map<keyof M, Set<Handler<never>>>();

  on<K extends keyof M>(type: K, fn: Handler<M[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  emit<K extends keyof M>(type: K, ...payload: M[K] extends void ? [] : [M[K]]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) (fn as Handler<M[K] | undefined>)(payload[0]);
  }
}

export const bus = new EventBus<GameEvents>();
