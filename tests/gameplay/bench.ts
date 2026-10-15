// Bancos de prueba portados de test/autoplay.gd, test/slam_test.gd y test/tap_test.gd.
// Corren headless, a paso fijo, y son deterministas: misma configuración, mismos números.

import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { COM_LOCAL, EDGE_POINT, GRAVITY, PHYSICS_HZ } from '../../src/gameplay/constants';
import { DEFAULT_KNOBS } from '../../src/gameplay/knobs';
import { Rng } from '../../src/gameplay/rng';
import { GameSim } from '../../src/gameplay/sim';
import type { LogContactInfo } from '../../src/gameplay/axe';

export const SEED = 20260815;
/**
 * El leño contra el que se calibraron los números del ticket: el fijo de antes del
 * sorteo (32 cm × 40 cm, 10 J). Sin fijarlo, cada corrida mediría otro leño.
 */
export const REF_LOG = { radius: 0.16, height: 0.4, density: 605, needed: 10 };

let ready: Promise<void> | null = null;
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

export function makeSim(): GameSim {
  const sim = new GameSim(RAPIER, { seed: SEED, autoRespawn: false, store: null });
  // Las perillas por defecto, no las que haya guardado alguien jugando.
  sim.axe.setKnobs(DEFAULT_KNOBS);
  sim.log.setDimensions(REF_LOG.radius, REF_LOG.height, REF_LOG.density, REF_LOG.needed);
  return sim;
}

export interface Trial {
  speed: number;
  spin: number;
  hit: (LogContactInfo & { util: number }) | null;
  reason: string;
}

/** Cuánto hay que girar sobre X para que el filo apunte a -Y. */
function angleForEdgeDown(com: Vector3): number {
  const e = new Vector3(EDGE_POINT.x, EDGE_POINT.y, EDGE_POINT.z).sub(com).normalize();
  return Math.PI - Math.atan2(e.z, e.y);
}

/**
 * autoplay.gd: pone el hacha en el aire con velocidad y giro exactos y la deja caer
 * sobre la tapa del leño. Por defecto la fase se apunta para que el filo llegue
 * mirando abajo (el MÁXIMO que entrega el hacha); con randomPhase, como juega la gente.
 */
export function runAutoplay(opts: { randomPhase?: boolean; assist?: number; godotCooldownQuirk?: boolean } = {}) {
  const LAUNCH_Z = 1.2;
  const SPEEDS = [2.6, 3.4, 4.2, 5.0, 6.0];
  const SPINS = [0, 5, 10, 15, 20, 26];
  const sim = makeSim();
  if (opts.assist !== undefined) sim.axe.assistStrength = opts.assist;
  sim.axe.godotCooldownQuirk = opts.godotCooldownQuirk ?? false;
  const rng = new Rng(SEED);
  const top = GameSim.stumpTop + sim.log.height;

  let hit: Trial['hit'] = null;
  sim.on('hit', (e) => {
    if (!hit) hit = { ...e.info, util: e.energy };
  });

  const trials: Trial[] = [];
  for (const speed of SPEEDS) {
    for (const spin of SPINS) {
      sim.log.restore();
      sim.axe.reset();
      const t = LAUNCH_Z / speed;
      const y0 = top + 0.5 * GRAVITY * t * t;
      let start = angleForEdgeDown(sim.axe.centerOfMass) + spin * t;
      if (opts.randomPhase) start = rng.range(0, Math.PI * 2);
      // Quien vuela en parábola es el centro de masa: el origen se corre para compensar.
      const comOff = sim.axe.centerOfMass.clone().applyAxisAngle(new Vector3(1, 0, 0), start);
      sim.axe.place(new Vector3(0, y0 - comOff.y, LAUNCH_Z - comOff.z), start, new Vector3(0, 0, -speed), -spin);
      sim.log.lastReason = 'sin impactos';
      hit = null;
      for (let f = 0; f < 150 && !hit; f++) sim.fixedStep();
      trials.push({ speed, spin, hit, reason: hit ? sim.log.lastReason : 'no llegó' });
    }
  }
  const cuts = trials.filter((t) => t.reason === 'corto').length;
  const result = {
    trials, cuts, needed: sim.log.splitEnergy(),
    axeMass: sim.axe.mass, inertia: sim.axe.inertia.x, assistFrames: sim.axe.assistFrames,
  };
  sim.dispose();
  return result;
}

/**
 * Cascazo: leña clavada en el filo, soltada desde `drop` metros (medidos desde la base
 * de la leña) sobre la tapa del tocón. Prueba el MECANISMO con umbral bajo (6 J), como
 * slam_test.gd.
 *
 * No copia la colocación de Godot a propósito: allá se clavaba la leña con el hacha
 * acostada en el pasto, así que la leña quedaba a 1.9 m del agarre y el hacha terminaba
 * enterrada bajo el piso (ticket 2.6, "el banco del cascazo es frágil"). Acá se clava
 * como en el juego, con el filo apoyado en la tapa, y el conjunto cae derecho.
 */
export function runSlam(drops = [0.15, 0.25, 0.35], needed = 6.0) {
  const sim = makeSim();
  sim.log.neededEnergy = needed;
  const rows: Array<{ drop: number; energy: number | null; broke: boolean; vNormal?: number; mEff?: number }> = [];
  const com = new Vector3(COM_LOCAL.x, COM_LOCAL.y, COM_LOCAL.z);
  const ang = angleForEdgeDown(com);
  const edgeWorld = new Vector3(EDGE_POINT.x, EDGE_POINT.y, EDGE_POINT.z).applyAxisAngle(new Vector3(1, 0, 0), ang);
  for (const drop of drops) {
    if (sim.axe.carrying) sim.axe.dropLog();
    sim.log.restore();
    sim.axe.reset();
    // Filo apoyado en el centro de la tapa, y ahí se clava.
    const top = GameSim.stumpTop + sim.log.height;
    sim.axe.place(new Vector3(0, top, 0).sub(edgeWorld), ang);
    if (!sim.log.handTo(sim.axe)) throw new Error('no se pudo clavar la leña');
    // Se levanta el conjunto `drop` metros y se suelta quieto.
    sim.axe.place(new Vector3(0, top + drop, 0).sub(edgeWorld), ang);
    let energy: number | null = null;
    let vNormal: number | undefined;
    let mEff: number | undefined;
    const off = sim.on('slam', (e) => {
      if (energy === null) energy = e.energy;
    });
    const offRaw = sim.on('slamRaw', (e) => {
      vNormal ??= e.vNormal;
      mEff ??= e.masaEfectiva;
    });
    for (let f = 0; f < 260 && energy === null; f++) sim.fixedStep();
    off();
    offRaw();
    rows.push({ drop, energy, broke: sim.log.isSplit, vNormal, mEff });
  }
  sim.dispose();
  return { rows, breaks: rows.filter((r) => r.broke).length, needed };
}

/**
 * tap_test.gd: el hacha AGARRADA, filo abajo, bajando despacito (0.45 m/s) hasta
 * apoyarse en la leña. Un toque suave no tiene que partir nada.
 */
export function runTap(handSpeed = 0.45) {
  const sim = makeSim();
  sim.log.restore();
  sim.axe.reset();
  const com = new Vector3(COM_LOCAL.x, COM_LOCAL.y, COM_LOCAL.z);
  const ang = angleForEdgeDown(com);
  const edgeWorld = new Vector3(EDGE_POINT.x, EDGE_POINT.y, EDGE_POINT.z).applyAxisAngle(new Vector3(1, 0, 0), ang);
  const top = GameSim.stumpTop + sim.log.height;
  let alto = top + 0.55;
  sim.axe.place(new Vector3(0, alto, 0).sub(edgeWorld), ang);
  sim.grab(sim.axe.position());
  const hits: Array<{ outcome: string; energy: number }> = [];
  sim.on('hit', (e) => hits.push({ outcome: e.outcome, energy: e.energy }));
  for (let f = 0; f < 260; f++) {
    alto -= handSpeed / PHYSICS_HZ;
    sim.setPointer(new Vector3(0, alto, 0).sub(edgeWorld));
    sim.fixedStep();
  }
  sim.dispose();
  return hits;
}

export function formatAutoplay(r: ReturnType<typeof runAutoplay>): string {
  const lines = r.trials.map((t) =>
    t.hit
      ? `  v=${t.speed.toFixed(1)}  giro=${t.spin.toFixed(1).padStart(4)}  |  v_filo=${t.hit.vFilo.toFixed(2).padStart(5)}  ` +
        `v_norm=${t.hit.vNormal.toFixed(2).padStart(5)}  m_ef=${t.hit.masaEfectiva.toFixed(2)}  cuna=${t.hit.cuna.toFixed(2)}  |  ` +
        `${t.hit.util.toFixed(1).padStart(6)} J de ${r.needed.toFixed(1)}  (${t.reason})`
      : `  v=${t.speed.toFixed(1)}  giro=${t.spin.toFixed(1).padStart(4)}  ->  no llegó`,
  );
  return [
    `hacha: masa ${r.axeMass.toFixed(2)} kg  inercia ${r.inertia.toFixed(4)}`,
    ...lines,
    `cortes: ${r.cuts} de ${r.trials.length}   (umbral ${r.needed.toFixed(1)} J)`,
  ].join('\n');
}
