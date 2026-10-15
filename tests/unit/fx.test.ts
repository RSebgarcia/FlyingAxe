import { Matrix4, Object3D, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../../src/events';
import { pickNoRepeat, pitchFor, synthChunk, synthCrack, synthThud } from '../../src/fx/audio';
import { ChipBurst } from '../../src/fx/chips';
import { CLIMAS, lightningCurve, sunDirection } from '../../src/fx/climas';
import { srgb } from '../../src/fx/color';
import { connectSim, HINT_CUT, HINT_LOOSE, HINT_SMASH } from '../../src/fx/connect';
import type { Fx } from '../../src/fx/index';
import { HitStop } from '../../src/fx/hitstop';
import { CameraShake } from '../../src/fx/shake';

describe('cámara lenta', () => {
  it('baja a 0.35 por 160 ms de tiempo real y vuelve a 1', () => {
    const h = new HitStop();
    expect(h.timeScale).toBe(1);
    h.trigger();
    expect(h.timeScale).toBe(0.35);
    h.update(0.15);
    expect(h.timeScale).toBe(0.35);
    h.update(0.02);
    expect(h.timeScale).toBe(1);
  });

  it('apagada no hace nada', () => {
    const h = new HitStop();
    h.enabled = false;
    h.trigger();
    expect(h.timeScale).toBe(1);
  });
});

describe('sacudón', () => {
  it('decae y deja la cámara donde estaba', () => {
    const cam = new Object3D();
    cam.position.set(1, 2, 3);
    const s = new CameraShake(cam);
    s.kick(s.cut);
    s.update(1 / 60);
    expect(cam.position.distanceTo(new Vector3(1, 2, 3))).toBeGreaterThan(0);
    for (let i = 0; i < 300; i++) s.update(1 / 60);
    expect(s.amount).toBe(0);
    expect(cam.position.distanceTo(new Vector3(1, 2, 3))).toBeLessThan(1e-9);
  });

  it('respeta lo que otro le haga a la cámara mientras tiembla', () => {
    const cam = new Object3D();
    const s = new CameraShake(cam);
    s.kick(0.05);
    s.update(1 / 60);
    cam.position.x += 10; // alguien la mueve
    s.amount = 0;
    s.update(1 / 60);
    expect(cam.position.x).toBeCloseTo(10, 9);
  });

  it('un golpe chico no pisa a uno grande', () => {
    const s = new CameraShake(new Object3D());
    s.kick(0.055);
    s.kick(0.018);
    expect(s.amount).toBe(0.055);
  });
});

describe('sonido', () => {
  it('el tono baja con la fuerza, dentro de los topes de juice.gd', () => {
    const mid = () => 0.5;
    expect(pitchFor(0, mid)).toBeCloseTo(1.28, 5);
    expect(pitchFor(1, mid)).toBeCloseTo(0.98, 5);
    expect(pitchFor(5, mid)).toBeCloseTo(0.72, 5);
    expect(pitchFor(-5, mid)).toBeCloseTo(1.35, 5);
  });

  it('nunca repite el crujido anterior', () => {
    let last = -1;
    for (let i = 0; i < 200; i++) {
      const next = pickNoRepeat(6, last);
      expect(next).not.toBe(last);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(6);
      last = next;
    }
    expect(pickNoRepeat(1, 0)).toBe(0);
  });

  it('los sintetizados tienen la duración de la demo y no saturan', () => {
    for (const [s, secs] of [[synthCrack(), 0.55], [synthThud(), 0.25], [synthChunk(), 0.3]] as const) {
      expect(s.length).toBe(Math.floor(22050 * secs));
      expect(Math.max(...s.map(Math.abs))).toBeLessThanOrEqual(1);
    }
  });
});

describe('astillas', () => {
  it('salen hacia la normal, caen y se apagan a los 1.1 s', () => {
    const b = new ChipBurst({ tint: srgb(1, 1, 1), amount: 26, speed: 2.6, size: 0.022 });
    b.fire(new Vector3(0, 1, 0), new Vector3(0, 1, 0));
    expect(b.active).toBe(true);
    b.update(0.05);
    let sumY = 0;
    // Salen hacia arriba: a los 50 ms el promedio ya subió del punto de impacto.
    const pos = new Vector3();
    const mat = new Matrix4();
    for (let i = 0; i < 26; i++) {
      b.mesh.getMatrixAt(i, mat);
      pos.setFromMatrixPosition(mat);
      sumY += pos.y;
    }
    expect(sumY / 26).toBeGreaterThan(1.01);
    for (let t = 0; t < 1.2; t += 0.05) b.update(0.05);
    expect(b.active).toBe(false);
    expect(b.mesh.visible).toBe(false);
  });
});

describe('climas', () => {
  it('son los diez de la demo, con nombres únicos', () => {
    expect(CLIMAS.map((c) => c.nombre)).toEqual([
      'Mañana clara', 'Mediodía', 'Tarde dorada', 'Atardecer', 'Crepúsculo',
      'Noche', 'Niebla', 'Lluvia', 'Nieve', 'Tormenta',
    ]);
  });

  it('solo la tormenta tira rayos, y llueve en lluvia y tormenta', () => {
    expect(CLIMAS.filter((c) => c.rayos).map((c) => c.nombre)).toEqual(['Tormenta']);
    expect(CLIMAS.filter((c) => c.precip === 'lluvia').map((c) => c.nombre)).toEqual(['Lluvia', 'Tormenta']);
    expect(CLIMAS.filter((c) => c.precip === 'nieve').map((c) => c.nombre)).toEqual(['Nieve']);
  });

  it('el sol del mediodía está alto y el del atardecer rasante', () => {
    const [, yMid] = sunDirection(68, 15);
    const [, yAtar] = sunDirection(8, 78);
    expect(yMid).toBeCloseTo(Math.sin((68 * Math.PI) / 180));
    expect(yAtar).toBeLessThan(0.15);
    const d = sunDirection(42, 35);
    expect(Math.hypot(...d)).toBeCloseTo(1);
  });

  it('el relámpago arranca a pleno y termina apagado', () => {
    expect(lightningCurve(1)).toBe(1);
    expect(lightningCurve(0)).toBe(0);
  });
});

describe('bus de eventos', () => {
  it('entrega el payload y se puede desuscribir', () => {
    const bus = new EventBus<GameEvents>();
    const got: number[] = [];
    const off = bus.on('score', ({ cuts }) => got.push(cuts));
    bus.emit('score', { cuts: 1 });
    off();
    bus.emit('score', { cuts: 2 });
    expect(got).toEqual([1]);
  });
});

describe('conexión con la sim', () => {
  type Fn = (e?: unknown) => void;
  function fakeSim() {
    const ls = new Map<string, Fn[]>();
    return {
      timeScale: 1,
      score: 0,
      on(name: string, fn: Fn) {
        ls.set(name, [...(ls.get(name) ?? []), fn]);
        return () => {};
      },
      fire(name: string, e?: unknown) {
        for (const f of ls.get(name) ?? []) f(e);
      },
      log: { radius: 0.16, height: 0.27, logMass: 12, woodName: () => 'Cerezo' },
      axe: {
        bladeWeight: 1, weightAt: 1, gripHold: 0.8, wrist: 0.25, assistStrength: 0,
        mass: 2.4, centerOfMass: new Vector3(), inertia: new Vector3(0.1, 0, 0),
      },
    };
  }

  it('traduce eventos, elige el cartel y devuelve la cámara lenta', () => {
    const bus = new EventBus<GameEvents>();
    const sim = fakeSim();
    const fx = { timeScale: 0.35 } as Fx;
    const hints: string[] = [];
    const cuts: number[] = [];
    let log: GameEvents['logSpawned'] | null = null;
    bus.on('hint', ({ text }) => hints.push(text));
    bus.on('cut', ({ force }) => cuts.push(force));
    bus.on('logSpawned', (l) => (log = l));
    const link = connectSim(sim as never, fx, bus);
    expect(log).toEqual({ species: 'Cerezo', widthCm: 32, heightCm: 27, massKg: 12 });

    const p = { point: new Vector3(), normal: new Vector3(0, 1, 0), strength: 1.2 };
    sim.fire('cut', p);
    sim.fire('slam', { broke: true });
    sim.fire('cut', { ...p, strength: 1 });
    sim.fire('slam', { broke: false });
    sim.fire('bounce', { point: new Vector3(), strength: 0.4 });
    expect(hints).toEqual([HINT_LOOSE, HINT_CUT, HINT_SMASH]);
    expect(cuts).toEqual([1.2, 1]);

    link.tick();
    expect(sim.timeScale).toBe(0.35);
  });
});

describe('calidad adaptativa', () => {
  it('las astillas tiran menos con menos calidad y vuelven a todas', () => {
    const b = new ChipBurst({ tint: srgb(1, 1, 1), amount: 26, speed: 2.6, size: 0.022 });
    b.setDensity(0.3);
    expect(b.mesh.count).toBe(8);
    b.setDensity(1);
    expect(b.mesh.count).toBe(26);
  });
});
