// El leño parado sobre el tocón, portado de wood_log.gd.
//
// El corte NO parte una malla en tiempo real: el leño entero se apaga y en su lugar
// aparecen dos mitades generadas por código (medio cilindro de verdad, con su cara
// plana en x = 0). Es el truco de siempre en los casuales y se ve igual de bien.

import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import type { Axe, ColliderRole } from './axe';
import { DEFAULT_ANGULAR_DAMP, DEFAULT_FRICTION, DEFAULT_LINEAR_DAMP } from './constants';
import { buildPrism, fullPoly, halfPoly, hull, type PrismData } from './prism';
import { Rng } from './rng';
import { toQuat, toV3 } from './vec';

type Rapier = typeof RAPIER_NS;
type World = RAPIER_NS.World;
type RigidBody = RAPIER_NS.RigidBody;
type Collider = RAPIER_NS.Collider;

export type ImpactOutcome = 'partido' | 'lomo' | 'suave' | 'clavada' | 'corto';

/** Especies ordenadas por densidad real (kg/m³). El jugador no ve un número: ve un roble. */
export const SPECIES: ReadonlyArray<[number, string]> = [
  [490, 'Abeto'],
  [550, 'Pino'],
  [620, 'Cerezo'],
  [680, 'Nogal'],
  [730, 'Haya'],
  [Infinity, 'Roble'],
];

export interface Half {
  body: RigidBody;
  collider: Collider;
  mesh: PrismData;
  /** Medidas del leño del que salió, para el render. */
  radius: number;
  height: number;
}

export class WoodLog {
  // Cada leño sale distinto, sorteado dentro de estos rangos. El tamaño y la densidad
  // entran en la cuenta de cuánta energía cuesta partirlo.
  radiusRange: [number, number] = [0.105, 0.205];
  heightRange: [number, number] = [0.26, 0.5];
  /** De pino (~430) a roble (~780). */
  densityRange: [number, number] = [430, 780];
  segments = 18;

  /** Energía de corte del leño promedio, en joules. */
  splitEnergyTarget = 10.0;
  /** Fracción de esa energía que alcanza para que el filo se clave sin partir. */
  lodgeFraction = 0.22;
  /** Cuánto puede alejarse un leño del promedio. El hacha entrega 13–18 J bien dada. */
  difficultySpan: [number, number] = [0.55, 1.3];
  /** Cuánto peso SIENTE el hacha al llevarla clavada (un roble real son 46 kg). */
  carryMassCap = 5.0;

  splitPush = 0.85;
  splitLift = 1.4;
  splitSpin = 0.8;
  debrisMax = 14;

  radius = 0.16;
  height = 0.4;
  density = 600;
  logMass = 3.2;
  neededEnergy = 10;

  isSplit = false;
  carried = false;
  attempts = 0;
  lastEnergy = 0;
  lastReason: ImpactOutcome | 'sin impactos' = 'sin impactos';

  /** Sube con cada leño nuevo, para que el render sepa cuándo rearmar la malla. */
  version = 0;
  wholeMesh: PrismData;
  readonly wholeBody: RigidBody;
  wholeCollider: Collider;
  halves: Half[] = [];
  /** Mitades de leños ya partidos que se quedan tiradas en el pasto. */
  debris: Half[] = [];

  /** Generador propio de la leña: nada de afuera le corre el flujo. */
  readonly rng = new Rng(Date.now());
  /** Generador del tumbo de las mitades, aparte por lo mismo. */
  readonly tumbleRng = new Rng(Date.now() ^ 0x5eed);

  private holder: Axe | null = null;
  private topY = 0.45;

  constructor(
    private readonly R: Rapier,
    private readonly world: World,
    private readonly roles: Map<number, ColliderRole>,
    seed?: number,
  ) {
    if (seed !== undefined) this.setSeed(seed);
    this.wholeBody = world.createRigidBody(R.RigidBodyDesc.fixed());
    this.pickDimensions();
    this.wholeMesh = this.buildWholeMesh();
    this.wholeCollider = this.makeWholeCollider();
    this.placeWhole();
  }

  setSeed(s: number): void {
    this.rng.setSeed(s);
    this.tumbleRng.setSeed(s ^ 0x5eed);
  }

  /** Centro del leño entero, en mundo. */
  center(): Vector3 {
    return toV3(this.wholeBody.translation());
  }

  // --- sorteo -----------------------------------------------------------------------

  /** Sortea un leño nuevo y lo apoya sobre la tapa del tocón (topY). */
  respawn(topY: number): void {
    this.retireHalves();
    this.topY = topY;
    this.pickDimensions();
    this.rebuild();
  }

  /** Fija medidas exactas (bancos de prueba): mismo leño en todas las corridas. */
  setDimensions(radius: number, height: number, density: number, neededEnergy?: number): void {
    this.retireHalves();
    this.radius = radius;
    this.height = height;
    this.density = density;
    this.computeMassAndEnergy();
    if (neededEnergy !== undefined) this.neededEnergy = neededEnergy;
    this.rebuild();
  }

  private rebuild(): void {
    this.restore();
    this.world.removeCollider(this.wholeCollider, false);
    this.roles.delete(this.wholeCollider.handle);
    this.wholeMesh = this.buildWholeMesh();
    this.wholeCollider = this.makeWholeCollider();
    this.placeWhole();
    this.version++;
  }

  private placeWhole(): void {
    this.wholeBody.setTranslation({ x: 0, y: this.topY + this.height / 2, z: 0 }, true);
  }

  private pickDimensions(): void {
    this.radius = this.rng.range(...this.radiusRange);
    this.height = this.rng.range(...this.heightRange);
    this.density = this.rng.range(...this.densityRange);
    this.computeMassAndEnergy();
  }

  private computeMassAndEnergy(): void {
    const volume = Math.PI * this.radius * this.radius * this.height;
    this.logMass = this.density * volume;
    // Dificultad relativa al leño promedio del rango, acotada: que divierta, no frustre.
    const refR = (this.radiusRange[0] + this.radiusRange[1]) / 2;
    const refH = (this.heightRange[0] + this.heightRange[1]) / 2;
    const refD = (this.densityRange[0] + this.densityRange[1]) / 2;
    const refVol = Math.PI * refR * refR * refH;
    const factor = (volume / refVol) * (this.density / refD);
    this.neededEnergy = this.splitEnergyTarget * clamp(factor, ...this.difficultySpan);
  }

  woodName(): string {
    for (const [d, name] of SPECIES) if (this.density < d) return name;
    return 'Roble';
  }

  /** Tenacidad implícita del umbral; una conífera de verdad ronda 180 J/m². */
  impliedToughness(): number {
    const area = 2 * this.radius * this.height;
    return area > 0 ? this.neededEnergy / area : 0;
  }

  describe(): string {
    return `${(this.radius * 200).toFixed(0)} cm de diámetro × ${(this.height * 100).toFixed(0)} de alto, ` +
      `${this.density.toFixed(0)} kg/m³, ${this.logMass.toFixed(1)} kg, cuesta ${this.neededEnergy.toFixed(1)} J`;
  }

  splitEnergy(): number {
    return this.neededEnergy;
  }

  // --- corte ------------------------------------------------------------------------

  /**
   * Resuelve un contacto del hacha contra la leña: parte, se clava, o nada. Quien decide
   * "filo o lomo" es el PUNTO de contacto, no el ángulo.
   */
  resolveImpact(axe: Axe, localPoint: Vector3, energy: number): ImpactOutcome {
    if (this.isSplit) return 'partido';
    this.attempts++;
    this.lastEnergy = energy;

    if (!axe.isEdgeContact(localPoint)) return (this.lastReason = 'lomo');
    const needed = this.splitEnergy();
    if (energy < needed * this.lodgeFraction) return (this.lastReason = 'suave');
    if (energy < needed) return (this.lastReason = 'clavada');

    this.lastReason = 'corto';
    // Las mitades salen empujadas por el golpe de verdad, no por un impulso fijo.
    this.splitAt(
      { pos: this.center(), rot: toQuat(this.wholeBody.rotation()) },
      axe.linvel(),
      energy / Math.max(needed, 0.01),
    );
    return 'corto';
  }

  /** Vuelve a dejar el leño entero en su lugar. */
  restore(): void {
    // Si el hacha la tenía clavada, hay que sacársela ANTES de reponerla: si no, el
    // hacha quedaba con una leña fantasma puesta para siempre (bug del ticket 1b).
    if (this.holder && this.holder.carrying) this.holder.dropLog();
    this.holder = null;
    this.isSplit = false;
    this.carried = false;
    this.wholeCollider.setEnabled(true);
    for (const h of this.halves) this.removeHalf(h);
    this.halves = [];
  }

  /**
   * Parte la leña donde se le diga: puede estar clavada en el hacha y a dos metros de
   * su lugar cuando se rompe contra el tocón.
   */
  splitAt(where: { pos: Vector3; rot: Quaternion }, inherit = new Vector3(), excess = 1): void {
    if (this.isSplit) return;
    this.isSplit = true;
    this.carried = false;
    this.wholeCollider.setEnabled(false);

    // Un golpe más fuerte abre las mitades más lejos.
    const force = clamp(excess, 0.7, 2.4);
    for (const dir of [1, -1] as const) {
      const poly = halfPoly(this.radius, this.segments, dir);
      const body = this.world.createRigidBody(
        this.R.RigidBodyDesc.dynamic()
          .setTranslation(where.pos.x, where.pos.y, where.pos.z)
          .setRotation(where.rot)
          .setLinearDamping(DEFAULT_LINEAR_DAMP)
          .setAngularDamping(DEFAULT_ANGULAR_DAMP),
      );
      const collider = this.world.createCollider(
        this.R.ColliderDesc.convexHull(hull(poly, this.height))!
          .setMass(this.logMass * 0.5)
          .setFriction(DEFAULT_FRICTION),
        body,
      );
      this.roles.set(collider.handle, 'half');
      const m = this.logMass * 0.5;
      // Se llevan puesta la velocidad del hacha: así se siente que las partió algo.
      body.setLinvel({ x: inherit.x * 0.35, y: inherit.y * 0.35, z: inherit.z * 0.35 }, true);
      body.applyImpulse({ x: dir * this.splitPush * force * m, y: this.splitLift * m, z: 0 }, true);
      const t = this.tumbleRng;
      body.applyTorqueImpulse({
        x: t.range(-0.2, 0.2) * m * 0.5,
        y: t.range(-0.3, 0.3) * m * 0.5,
        z: -dir * this.splitSpin * force * m * 0.5,
      }, true);
      this.halves.push({
        body, collider, mesh: buildPrism(poly, this.height, true), radius: this.radius, height: this.height,
      });
    }
  }

  /** Entrega la leña al hacha, que se la lleva clavada en el filo. */
  handTo(axe: Axe): boolean {
    if (this.isSplit || this.carried || axe.carrying) return false;
    const inv = axe.rotation().invert();
    const localPos = this.center().sub(axe.position()).applyQuaternion(inv);
    const localRot = inv.clone().multiply(toQuat(this.wholeBody.rotation()));
    this.wholeCollider.setEnabled(false);
    this.carried = true;
    this.holder = axe;
    axe.carryLog(localPos, localRot, this.radius, this.height, Math.min(this.logMass, this.carryMassCap));
    return true;
  }

  // --- construcción -----------------------------------------------------------------

  private buildWholeMesh(): PrismData {
    // La leña entera comparte UV y materiales con las mitades: la corteza no cambia de
    // escala al partirse.
    return buildPrism(fullPoly(this.radius, this.segments * 2), this.height, false);
  }

  private makeWholeCollider(): Collider {
    const c = this.world.createCollider(
      this.R.ColliderDesc.cylinder(this.height / 2, this.radius).setFriction(DEFAULT_FRICTION),
      this.wholeBody,
    );
    this.roles.set(c.handle, 'log');
    return c;
  }

  /** Las mitades partidas se van al montón de escombro; si no, se descartan. */
  private retireHalves(): void {
    if (this.isSplit) this.debris.push(...this.halves);
    else for (const h of this.halves) this.removeHalf(h);
    this.halves = [];
    // Tope de piezas tiradas: sin esto la escena se llena y el juego se arrastra.
    while (this.debris.length > this.debrisMax) this.removeHalf(this.debris.shift()!);
  }

  private removeHalf(h: Half): void {
    this.roles.delete(h.collider.handle);
    this.world.removeRigidBody(h.body);
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}
