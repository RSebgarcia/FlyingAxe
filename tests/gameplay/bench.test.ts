// El banco de calibración portado de Godot, como test. Compara contra los números del
// ticket.md con margen: el solver es otro (Rapier en vez de Box3D) y Godot mismo tenía
// ±1 de ruido entre corridas. Lo que sí se exige exacto es el determinismo.

import { beforeAll, describe, expect, it } from 'vitest';
import { formatAutoplay, initPhysics, runAutoplay, runSlam, runTap } from './bench';

beforeAll(initPhysics);

describe('banco de tiros (autoplay.gd)', () => {
  it('es determinista: dos corridas dan exactamente lo mismo', () => {
    const a = runAutoplay();
    const b = runAutoplay();
    expect(b.trials.map((t) => [t.reason, t.hit?.util])).toEqual(a.trials.map((t) => [t.reason, t.hit?.util]));
  });

  it('el hacha pesa 2.4 kg con las perillas por defecto', () => {
    const r = runAutoplay();
    expect(r.axeMass).toBeCloseTo(2.4, 6);
    console.log(formatAutoplay(r));
  });

  it('un tiro bien dado a velocidad de juego entrega lo que medía Godot (13–18 J, umbral 10)', () => {
    const r = runAutoplay();
    // Velocidades de un tiro normal y giro moderado, fase apuntada: el mejor caso.
    const good = r.trials.filter((t) => t.speed <= 4.2 && t.spin <= 10);
    for (const t of good) {
      expect(t.hit, `v=${t.speed} giro=${t.spin}`).not.toBeNull();
    }
    const cuts = good.filter((t) => t.reason === 'corto').map((t) => t.hit!.util);
    expect(cuts.length).toBeGreaterThanOrEqual(good.length - 1);
    const mean = cuts.reduce((s, e) => s + e, 0) / cuts.length;
    expect(mean).toBeGreaterThan(12);
    expect(mean).toBeLessThan(19);
  });

  it('con mucho giro y poca velocidad entra de lomo, como en Godot', () => {
    const r = runAutoplay();
    const wild = r.trials.filter((t) => t.speed <= 3.4 && t.spin >= 20);
    expect(wild.every((t) => t.reason === 'lomo')).toBe(true);
  });

  it('con fase al azar corta pocos tiros, como Godot (4 de 30, ±2 de ruido)', () => {
    const r = runAutoplay({ randomPhase: true });
    expect(r.cuts).toBeGreaterThanOrEqual(2);
    expect(r.cuts).toBeLessThanOrEqual(6);
  });

  it('la ayuda de alineación no mejora nada (ticket 2.4), y por eso arranca apagada', () => {
    const off = runAutoplay({ randomPhase: true, assist: 0 }).cuts;
    const on = runAutoplay({ randomPhase: true, assist: 3 }).cuts;
    expect(on - off).toBeLessThanOrEqual(2);
  });
});

describe('cascazo (slam_test.gd)', () => {
  it('la leña clavada revienta contra el tocón: 3 de 3, como en Godot', () => {
    const r = runSlam();
    console.log(r.rows);
    expect(r.breaks).toBe(3);
  });

  it('un golpe limpio sobre la tapa ronda los 11.3 J de Godot', () => {
    // En Godot la leña cayó ~0.24 m antes de pegar. Mismo umbral real de 10 J.
    const r = runSlam([0.2], 10);
    const e = r.rows[0].energy!;
    expect(e).toBeGreaterThan(9);
    expect(e).toBeLessThan(14);
    expect(r.rows[0].broke).toBe(e >= 10);
  });

  it('la energía crece con la altura de la caída', () => {
    const e = runSlam([0.1, 0.2, 0.3], 1000).rows.map((r) => r.energy!);
    expect(e[0]).toBeLessThan(e[1]);
    expect(e[1]).toBeLessThan(e[2]);
  });
});

describe('toque suave (tap_test.gd)', () => {
  it('bajar el hacha agarrada despacio no parte nada', () => {
    const hits = runTap();
    expect(hits.some((h) => h.outcome === 'corto')).toBe(false);
  });
});
