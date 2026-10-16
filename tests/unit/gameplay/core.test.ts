import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { AXE_HOME_POS, DEFAULT_KNOBS, GameSim, buildPrism, fullPoly, halfPoly, loadKnobs, saveKnobs } from '../../../src/gameplay';
import { Rng } from '../../../src/gameplay/rng';
import { initPhysics, makeSim } from './bench';

beforeAll(initPhysics);

class MemStore {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe('pesa ficticia (apply_blade_weight)', () => {
  it('reproduce masa, centro de masa e inercia de Godot', () => {
    const sim = makeSim();
    // Valores por defecto: 1.4 + 1.0 kg, pesa en el filo.
    expect(sim.axe.mass).toBeCloseTo(2.4, 6);
    expect(sim.axe.centerOfMass.y).toBeCloseTo((0.72 * 1.4 + 0.792) / 2.4, 6);
    expect(sim.axe.centerOfMass.z).toBeCloseTo((-0.06 * 1.4 - 0.248) / 2.4, 6);
    expect(sim.axe.inertia.x).toBeCloseTo(0.1267, 4);
    sim.fixedStep();
    expect(sim.axe.body.mass()).toBeCloseTo(2.4, 4);
    // Log de Godot: pesa 0.1 kg en 0.8 -> masa 1.5, inercia 0.1056.
    sim.axe.setKnobs({ bladeWeight: 0.1, weightAt: 0.8 });
    expect(sim.axe.mass).toBeCloseTo(1.5, 6);
    expect(sim.axe.centerOfMass.y).toBeCloseTo(0.71424, 5);
    expect(sim.axe.centerOfMass.z).toBeCloseTo(-0.069227, 5);
    expect(sim.axe.inertia.x).toBeCloseTo(0.1056, 4);
    sim.dispose();
  });

  it('acota la pesa a 0–5 kg y la distancia a 0–1.6', () => {
    const sim = makeSim();
    sim.axe.setKnobs({ bladeWeight: 9, weightAt: -1 });
    expect(sim.axe.bladeWeight).toBe(5);
    expect(sim.axe.weightAt).toBe(0);
    sim.dispose();
  });
});

describe('agarre tipo péndulo', () => {
  it('sigue al dedo, bambolea, y al soltarla vuela girando sin salirse de x = 0', () => {
    const sim = makeSim();
    const start = sim.axe.position();
    sim.grab(start);
    // Levantarla y hacer un arco rápido hacia la leña.
    for (let f = 0; f < 120; f++) {
      sim.setPointer(new Vector3(0, 0.6 + f * 0.008, 1.9 - f * 0.002));
      sim.fixedStep();
    }
    let maxSpin = 0;
    for (let f = 0; f < 18; f++) {
      sim.setPointer(new Vector3(0, 1.6 - f * 0.01, 1.66 - f * 0.06));
      sim.fixedStep();
      maxSpin = Math.max(maxSpin, Math.abs(sim.axe.angvel().x));
    }
    expect(sim.axe.position().y).toBeGreaterThan(1.0);
    expect(maxSpin).toBeGreaterThan(1);
    sim.release();
    expect(sim.throws).toBe(1);
    for (let f = 0; f < 120; f++) {
      sim.fixedStep();
      expect(Math.abs(sim.axe.position().x)).toBeLessThan(1e-5);
      const w = sim.axe.angvel();
      expect(Math.abs(w.y) + Math.abs(w.z)).toBeLessThan(1e-4);
    }
    sim.dispose();
  });

  it('con el dedo quieto el agarre llega y bambolea cerca; con más agarre, más pegado', () => {
    // El péndulo sigue bamboleando un rato (es lo que arma el giro), así que se mide la
    // distancia promedio entre el segundo 1 y el 4, no un instante.
    const meanLag = (hold: number) => {
      const sim = makeSim();
      sim.axe.setKnobs({ gripHold: hold });
      sim.grab(sim.axe.position());
      const target = new Vector3(0, 1.4, 1.2);
      sim.setPointer(target);
      let sum = 0;
      let n = 0;
      for (let f = 0; f < 120 * 4; f++) {
        sim.fixedStep();
        if (f >= 120) {
          sum += sim.axe.position().distanceTo(target);
          n++;
        }
      }
      sim.dispose();
      return sum / n;
    };
    const tight = meanLag(1);
    const loose = meanLag(0.2);
    expect(tight).toBeLessThan(0.06);
    expect(loose).toBeLessThan(0.12);
    expect(tight).toBeLessThan(loose);
  });
});

describe('fricción con el pasto', () => {
  it('el hacha que patina acostada en el pasto se frena', () => {
    // Regresión: bloquear giro y traslación juntos en Rapier apagaba la fricción y el
    // hacha se deslizaba para siempre.
    const sim = makeSim();
    sim.axe.body.setLinvel({ x: 0, y: 0, z: -1 }, true);
    for (let f = 0; f < 120; f++) sim.fixedStep();
    expect(Math.abs(sim.axe.linvel().z)).toBeLessThan(0.01);
    expect(Math.abs(sim.axe.position().x)).toBeLessThan(0.001);
    sim.dispose();
  });
});

describe('leños sorteados', () => {
  it('misma semilla, mismos leños', () => {
    const a = new GameSim(RAPIER, { seed: 7, store: null });
    const b = new GameSim(RAPIER, { seed: 7, store: null });
    for (let i = 0; i < 5; i++) {
      expect(b.log.describe()).toBe(a.log.describe());
      a.newLog();
      b.newLog();
    }
    a.dispose();
    b.dispose();
  });

  it('la dificultad queda acotada a 0.55–1.3 veces los 10 J y la masa sale de densidad × volumen', () => {
    const sim = new GameSim(RAPIER, { seed: 1, store: null });
    for (let i = 0; i < 200; i++) {
      const l = sim.log;
      expect(l.neededEnergy).toBeGreaterThanOrEqual(5.5 - 1e-9);
      expect(l.neededEnergy).toBeLessThanOrEqual(13 + 1e-9);
      expect(l.logMass).toBeCloseTo(l.density * Math.PI * l.radius ** 2 * l.height, 9);
      expect(l.center().y).toBeCloseTo(GameSim.stumpTop + l.height / 2, 6);
      sim.newLog();
    }
    sim.dispose();
  });

  it('nombra la especie por densidad', () => {
    const sim = makeSim();
    const name = (d: number) => {
      sim.log.density = d;
      return sim.log.woodName();
    };
    expect([450, 500, 600, 650, 700, 760].map(name)).toEqual(['Abeto', 'Pino', 'Cerezo', 'Nogal', 'Haya', 'Roble']);
    sim.dispose();
  });
});

describe('carga, cascazo y la leña fantasma', () => {
  it('clavar la leña le suma su masa al hacha, acotada a 5 kg', () => {
    const sim = makeSim();
    expect(sim.log.logMass).toBeGreaterThan(5);
    expect(sim.log.handTo(sim.axe)).toBe(true);
    expect(sim.axe.mass).toBeCloseTo(7.4, 6);
    expect(sim.axe.carriedCollider).not.toBeNull();
    sim.dispose();
  });

  it('reponer la leña se la saca al hacha (bug de la leña fantasma)', () => {
    const sim = makeSim();
    sim.log.handTo(sim.axe);
    sim.log.restore();
    expect(sim.axe.carrying).toBe(false);
    expect(sim.axe.carriedCollider).toBeNull();
    expect(sim.axe.mass).toBeCloseTo(2.4, 6);
    expect(sim.axe.colliders.length).toBe(3);
    sim.dispose();
  });

  it('al partir quedan dos mitades, y los escombros se acotan a 14 piezas', () => {
    const sim = new GameSim(RAPIER, { seed: 3, store: null });
    for (let i = 0; i < 12; i++) {
      sim.log.splitAt({ pos: sim.log.center(), rot: sim.axe.rotation().identity() });
      expect(sim.log.halves.length).toBe(2);
      sim.newLog();
    }
    expect(sim.log.debris.length).toBe(14);
    sim.dispose();
  });

  it('después de partir, a los 2.2 s sale un leño nuevo', () => {
    const sim = new GameSim(RAPIER, { seed: 3, store: null });
    const seen: string[] = [];
    sim.on('newLog', (e) => seen.push(e.species));
    sim.log.splitAt({ pos: sim.log.center(), rot: sim.axe.rotation().identity() });
    (sim as unknown as { addScore(): void }).addScore();
    for (let f = 0; f < 120 * 2.3; f++) sim.fixedStep();
    expect(seen.length).toBe(1);
    expect(sim.log.isSplit).toBe(false);
    sim.dispose();
  });

  it('si el hacha se cae del mundo vuelve sola', () => {
    const sim = makeSim();
    sim.axe.place(new Vector3(0, -7, 0), 0);
    sim.fixedStep();
    expect(sim.axe.position().z).toBeCloseTo(AXE_HOME_POS.z, 5);
    sim.dispose();
  });
});

describe('mallas de la leña', () => {
  it('tienen dos grupos (corteza y madera), UV en metros y normales unitarias hacia afuera', () => {
    const r = 0.16;
    const h = 0.4;
    for (const [poly, flat] of [[fullPoly(r, 36), false], [halfPoly(r, 18, 1), true]] as const) {
      const m = buildPrism([...poly], h, flat);
      expect(m.groups.map((g) => g.materialIndex)).toEqual([0, 1]);
      const n = m.positions.length / 3;
      expect(m.groups[0].count + m.groups[1].count).toBe(n);
      let maxV = 0;
      for (let i = 0; i < n; i++) {
        const nx = m.normals[i * 3], ny = m.normals[i * 3 + 1], nz = m.normals[i * 3 + 2];
        expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
        if (i < m.groups[0].count) maxV = Math.max(maxV, m.uvs[i * 2 + 1]);
      }
      // v recorre la altura en metros.
      expect(maxV).toBeCloseTo(h, 6);
    }
    // u de la corteza del cilindro entero da la vuelta: ≈ 2πr.
    const full = buildPrism(fullPoly(r, 36), h, false);
    let maxU = 0;
    for (let i = 0; i < full.groups[0].count; i++) maxU = Math.max(maxU, full.uvs[i * 2]);
    expect(maxU).toBeCloseTo(2 * Math.PI * r, 2);
  });

  it('la cara del corte de cada mitad está en x = 0 y mira hacia la otra mitad', () => {
    for (const dir of [1, -1] as const) {
      const m = buildPrism(halfPoly(0.16, 18, dir), 0.4, true);
      const g = m.groups[1];
      let found = 0;
      for (let i = g.start; i < g.start + g.count; i++) {
        if (Math.abs(m.normals[i * 3 + 1]) > 0.5) continue; // tapas
        expect(m.positions[i * 3]).toBeCloseTo(0, 6);
        expect(Math.sign(m.normals[i * 3])).toBe(-dir);
        found++;
      }
      expect(found).toBe(6);
    }
  });
});

describe('perillas guardadas (settings.gd)', () => {
  it('se guardan y se recuperan al arrancar', () => {
    const store = new MemStore();
    const a = new GameSim(RAPIER, { store });
    a.axe.setKnobs({ bladeWeight: 1.6, wrist: 0.4 });
    a.saveKnobs();
    a.dispose();
    const b = new GameSim(RAPIER, { store });
    expect(b.axe.bladeWeight).toBeCloseTo(1.6);
    expect(b.axe.wrist).toBeCloseTo(0.4);
    expect(b.axe.mass).toBeCloseTo(3.0);
    b.dispose();
  });

  it('un archivo roto o a medias cae a los valores por defecto', () => {
    const store = new MemStore();
    expect(loadKnobs(store)).toBeNull();
    store.setItem('flyingaxe.ajustes.v1', '{roto');
    expect(loadKnobs(store)).toBeNull();
    store.setItem('flyingaxe.ajustes.v1', JSON.stringify({ gripHold: 0.5, wrist: 'x' }));
    expect(loadKnobs(store)).toEqual({ ...DEFAULT_KNOBS, gripHold: 0.5 });
    saveKnobs(null, DEFAULT_KNOBS);
  });
});

describe('rng', () => {
  it('es reproducible y cae en el rango', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) {
      const x = a.range(2, 3);
      expect(x).toBe(b.range(2, 3));
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x).toBeLessThan(3);
    }
  });
});
