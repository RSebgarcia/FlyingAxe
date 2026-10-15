import type { Vector3 } from 'three/webgpu';
import { bus as defaultBus, type EventBus, type GameEvents } from '../events';
import type { Fx } from './index';

// Cuelga los efectos, el clima y el HUD de la simulación del paso 2 (GameSim), sin que
// esta sepa nada de ellos. Hace de traductor: los eventos de la sim pasan al bus, y la
// cámara lenta del corte vuelve a la sim como `timeScale`.
//
// Los textos de ayuda vivían en game.gd y son de la interfaz, así que se arman acá.

export const HINT_LOOSE = 'Agarrá el hacha y movela — el peso está en la cabeza';
export const HINT_HELD = 'Soltá para tirarla';
export const HINT_CUT = '¡Partida!';
export const HINT_LODGED = 'Se clavó. Levantala y cascala contra el tocón.';
export const HINT_SMASH = '¡Reventada contra el tocón!';
export const HINT_BOUNCE = 'Entró de lomo. Tiene que entrar el filo.';

// Lo mínimo de GameSim que se usa, escrito a mano para no depender de sus módulos.
interface Hit { point: Vector3; normal: Vector3; strength: number }
export interface SimLike {
  timeScale: number;
  score: number;
  on(name: 'cut' | 'lodge', fn: (e: Hit) => void): () => void;
  on(name: 'bounce', fn: (e: { point: Vector3; strength: number }) => void): () => void;
  on(name: 'slam', fn: (e: { broke: boolean }) => void): () => void;
  on(name: 'grab' | 'release', fn: () => void): () => void;
  on(name: 'newLog', fn: (e: { species: string }) => void): () => void;
  on(name: 'score', fn: (e: { score: number }) => void): () => void;
  log: { radius: number; height: number; logMass: number; woodName(): string };
  axe: {
    bladeWeight: number;
    weightAt: number;
    gripHold: number;
    wrist: number;
    assistStrength: number;
    mass: number;
    centerOfMass: Vector3;
    inertia: Vector3;
  };
}

export interface SimLink {
  /** Llamar una vez por frame, antes de `sim.update`. */
  tick(): void;
  dispose(): void;
}

export function connectSim(sim: SimLike, fx: Fx, bus: EventBus<GameEvents> = defaultBus): SimLink {
  // La sim avisa `slam` y enseguida `cut` (o `bounce`) por el mismo golpe; esto recuerda
  // que el próximo viene de un cascazo para elegir el texto.
  let fromSlam: 'broke' | 'weak' | null = null;
  const hint = (text: string) => bus.emit('hint', { text });

  const logInfo = () => {
    bus.emit('logSpawned', {
      species: sim.log.woodName(),
      widthCm: sim.log.radius * 200,
      heightCm: sim.log.height * 100,
      massKg: sim.log.logMass,
    });
  };

  const off = [
    sim.on('slam', ({ broke }) => (fromSlam = broke ? 'broke' : 'weak')),
    sim.on('cut', ({ point, normal, strength }) => {
      hint(fromSlam === 'broke' ? HINT_SMASH : HINT_CUT);
      fromSlam = null;
      bus.emit('cut', { point, normal, force: strength });
    }),
    sim.on('lodge', ({ point, normal, strength }) => {
      hint(HINT_LODGED);
      bus.emit('lodge', { point, normal, force: strength });
    }),
    sim.on('bounce', ({ point, strength }) => {
      // Un cascazo flojo solo suena; el cartel queda como estaba.
      if (fromSlam !== 'weak') hint(HINT_BOUNCE);
      fromSlam = null;
      bus.emit('bounce', { point, force: strength });
    }),
    sim.on('grab', () => {
      hint(HINT_HELD);
      bus.emit('grabbed');
    }),
    sim.on('release', () => bus.emit('released')),
    sim.on('newLog', () => {
      hint(HINT_LOOSE);
      logInfo();
    }),
    sim.on('score', ({ score }) => bus.emit('score', { cuts: score })),
  ];

  // Estado de arranque: el leño que ya está puesto y el puntaje.
  bus.emit('score', { cuts: sim.score });
  hint(HINT_LOOSE);
  logInfo();

  // Las perillas no avisan cuando cambian; se miran una vez por frame y se manda solo
  // si algo se movió.
  let lastTuner = '';
  const tuner = () => {
    const a = sim.axe;
    const t = {
      bladeWeight: a.bladeWeight, weightAt: a.weightAt, grip: a.gripHold, wrist: a.wrist,
      assist: a.assistStrength, mass: a.mass, comY: a.centerOfMass.y, comZ: a.centerOfMass.z,
      inertia: a.inertia.x,
    };
    const key = JSON.stringify(t);
    if (key !== lastTuner) {
      lastTuner = key;
      bus.emit('tuner', t);
    }
  };

  return {
    tick() {
      sim.timeScale = fx.timeScale;
      tuner();
    },
    dispose() {
      for (const f of off) f();
    },
  };
}
