// El hacha, portada de axe.gd. El origen del cuerpo ES el punto de agarre, en la base
// del mango. Todo el juego sale de que la mano tira de ahí y el peso está lejos, en la
// cabeza de metal.
//
// NO HAY ARTICULACIÓN. La mano es un controlador de VELOCIDAD: cada paso de física se
// aplica un impulso EN EL AGARRE que lo lleva hacia el dedo. Como el agarre está lejos
// del centro de masa, ese mismo impulso genera torque y de ahí sale el bamboleo.
//
// El giro NO se calcula. Al soltar, el hacha se va con lo que tenía. Las vueltas son
// del jugador.

import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import {
  AXE_BOXES, AXE_HOME_ANGLE_X, AXE_HOME_POS, AXE_LENGTH, COM_LOCAL, CONTACT_COOLDOWN,
  DEFAULT_FRICTION, DEFAULT_LINEAR_DAMP, EDGE_POINT, EDGE_RADIUS, VELOCITY_HISTORY,
} from './constants';
import type { Knobs } from './knobs';
import { DEFAULT_KNOBS } from './knobs';
import { effectiveMass, smoothstep, toQuat, toV3 } from './vec';

type Rapier = typeof RAPIER_NS;
type World = RAPIER_NS.World;
type RigidBody = RAPIER_NS.RigidBody;
type Collider = RAPIER_NS.Collider;

export enum AxeState { LOOSE, HELD, STUCK }

/** Qué rol tiene cada collider del mundo, para saber contra qué pegó el hacha. */
export type ColliderRole = 'log' | 'stump' | 'floor' | 'half' | 'axe';

export interface LogContactInfo {
  energiaBruta: number;
  cuna: number;
  vFilo: number;
  vNormal: number;
  masaEfectiva: number;
  vCentro: number;
  giro: number;
  puntoMundo: Vector3;
  normal: Vector3;
}

export type AxeContact =
  | { kind: 'log'; localPoint: Vector3; energy: number; info: LogContactInfo }
  | { kind: 'slam'; energy: number; point: Vector3; normal: Vector3; vNormal: number; masaEfectiva: number };

const COM = new Vector3(COM_LOCAL.x, COM_LOCAL.y, COM_LOCAL.z);
const EDGE = new Vector3(EDGE_POINT.x, EDGE_POINT.y, EDGE_POINT.z);

export class Axe {
  readonly body: RigidBody;
  readonly colliders: Collider[] = [];

  // Perillas (las mismas que persiste knobs.ts).
  bladeWeight = DEFAULT_KNOBS.bladeWeight;
  weightAt = DEFAULT_KNOBS.weightAt;
  gripHold = DEFAULT_KNOBS.gripHold;
  wrist = DEFAULT_KNOBS.wrist;
  assistStrength = DEFAULT_KNOBS.assistStrength;

  baseMass = 1.4;
  maxGripSpeed = 14.0;
  gripMaxAccel = 90.0;
  /** Roce del aire sobre el giro. Con 0.45 el filo se desfasaba en pleno vuelo. */
  airSpinDrag = 0.06;
  handCatchUp = 10.0;
  assistRadius = 1.3;
  assistFullSpin = 7.0;
  /** Después de despegarla no se puede volver a clavar por este rato. */
  lodgeGrace = 1.0;

  // Leña clavada: suma masa, corre el centro de masa y agrega su forma al cuerpo.
  carriedMass = 0;
  carriedPoint = new Vector3();
  /** Pose de la leña cargada respecto del agarre. */
  carriedLocal = { pos: new Vector3(), rot: new Quaternion() };
  carrying = false;
  carriedCollider: Collider | null = null;

  state = AxeState.LOOSE;
  /** Dónde está el dedo, ya proyectado al plano x = 0. */
  handPointer = new Vector3();
  /** Centro de la leña, para la ayuda de alineación. */
  targetPoint = new Vector3(0, 0.95, 0);

  // Lo que sale de apply_blade_weight. Sirve para HUD, tests y la masa efectiva.
  mass = 0;
  centerOfMass = new Vector3();
  inertia = new Vector3();

  assistFrames = 0;
  assistTotal = 0;
  assistApplied = 0;

  private handTarget = new Vector3();
  private lodgeBlockUntil = 0;
  private nextContactOk = 0;
  private histLin: Vector3[] = [];
  private histAng: Vector3[] = [];
  private prevLin = new Vector3();
  private prevAng = new Vector3();

  constructor(
    private readonly R: Rapier,
    private readonly world: World,
    private readonly roles: Map<number, ColliderRole>,
  ) {
    const home = Axe.homeRotation();
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(AXE_HOME_POS.x, AXE_HOME_POS.y, AXE_HOME_POS.z)
      .setRotation(home)
      .setLinearDamping(DEFAULT_LINEAR_DAMP)
      .setAngularDamping(this.airSpinDrag)
      .setCanSleep(false)
      .setCcdEnabled(true);
    this.body = world.createRigidBody(desc);
    // EL ARREGLO DEL GIRO LOCO, hecho con los ejes bloqueados del motor. En Godot se
    // anulaba a mano el giro en Y/Z y se reproyectaba la pose al plano x = 0, con zona
    // muerta para no pelearse con el solver. Acá el solver directamente no puede
    // moverla fuera del plano: vive en x = 0 y solo tumbea sobre X.
    this.body.setEnabledTranslations(false, true, true, true);
    this.body.setEnabledRotations(true, false, false, true);

    for (const b of AXE_BOXES) {
      const c = world.createCollider(
        R.ColliderDesc.cuboid(b.half[0], b.half[1], b.half[2])
          .setTranslation(b.center[0], b.center[1], b.center[2])
          .setDensity(0)
          .setFriction(DEFAULT_FRICTION),
        this.body,
      );
      this.colliders.push(c);
      roles.set(c.handle, 'axe');
    }
    this.applyBladeWeight();
  }

  static homeRotation(): Quaternion {
    return new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), AXE_HOME_ANGLE_X);
  }

  setKnobs(k: Partial<Knobs>): void {
    if (k.bladeWeight !== undefined) this.bladeWeight = k.bladeWeight;
    if (k.weightAt !== undefined) this.weightAt = k.weightAt;
    if (k.gripHold !== undefined) this.gripHold = k.gripHold;
    if (k.wrist !== undefined) this.wrist = k.wrist;
    if (k.assistStrength !== undefined) this.assistStrength = k.assistStrength;
    this.applyBladeWeight();
  }

  knobs(): Knobs {
    return {
      bladeWeight: this.bladeWeight,
      weightAt: this.weightAt,
      gripHold: this.gripHold,
      wrist: this.wrist,
      assistStrength: this.assistStrength,
    };
  }

  /**
   * Recalcula masa, centro de masa e INERCIA a partir de la pesa ficticia y de dónde
   * está colgada (más la leña clavada, si hay). La inercia importa tanto como el peso:
   * decide si cuesta arrancarle el giro y si, una vez girando, sigue girando.
   */
  applyBladeWeight(): void {
    this.bladeWeight = clamp(this.bladeWeight, 0, 5);
    this.weightAt = clamp(this.weightAt, 0, 1.6);

    const wp = EDGE.clone().multiplyScalar(this.weightAt);
    const total = this.baseMass + this.bladeWeight + this.carriedMass;
    const com = COM.clone().multiplyScalar(this.baseMass)
      .addScaledVector(wp, this.bladeWeight)
      .addScaledVector(this.carriedPoint, this.carriedMass)
      .divideScalar(total);

    // Barra de largo AXE_LENGTH más las masas puntuales, llevadas al centro de masa
    // combinado con el teorema de ejes paralelos.
    let ix = (this.baseMass * AXE_LENGTH * AXE_LENGTH) / 12;
    ix += this.baseMass * COM.distanceToSquared(com);
    ix += this.bladeWeight * wp.distanceToSquared(com);
    ix += this.carriedMass * this.carriedPoint.distanceToSquared(com);
    ix = Math.max(ix, 0.01);

    this.mass = total;
    this.centerOfMass.copy(com);
    // Sobre el eje del mango la inercia es chica, pero ese giro está bloqueado igual.
    this.inertia.set(ix, ix * 0.12, ix);
    this.body.setAdditionalMassProperties(
      total, com, this.inertia, { x: 0, y: 0, z: 0, w: 1 }, true,
    );
  }

  nudgeBladeWeight(dkg: number): void {
    this.bladeWeight += dkg;
    this.applyBladeWeight();
  }

  nudgeWeightAt(d: number): void {
    this.weightAt += d;
    this.applyBladeWeight();
  }

  reset(): void {
    this.body.setTranslation(AXE_HOME_POS, true);
    this.body.setRotation(Axe.homeRotation(), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setBodyType(this.R.RigidBodyType.Dynamic, true);
    this.state = AxeState.LOOSE;
    this.forgetMotion();
  }

  /**
   * Olvida la historia de velocidades y la espera entre contactos. Sin esto, el primer
   * golpe después de reponer el hacha se perdía: caía dentro de los 0.25 s de espera
   * del golpe anterior (al banco de Godot probablemente le pasaba lo mismo con los
   * tiros rápidos, que llegan en menos de 30 pasos).
   */
  private forgetMotion(): void {
    this.histLin = [];
    this.histAng = [];
    if (!this.godotCooldownQuirk) this.nextContactOk = 0;
  }

  /** Solo para el banco: reproduce la espera de Godot que se comía golpes. */
  godotCooldownQuirk = false;

  /** Coloca el hacha con un ángulo sobre X y velocidades exactas (bancos de prueba). */
  place(origin: Vector3, angleX: number, lin = new Vector3(), angX = 0): void {
    this.body.setTranslation({ x: 0, y: origin.y, z: origin.z }, true);
    this.body.setRotation(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angleX), true);
    this.body.setLinvel({ x: 0, y: lin.y, z: lin.z }, true);
    this.body.setAngvel({ x: angX, y: 0, z: 0 }, true);
    this.forgetMotion();
  }

  position(): Vector3 { return toV3(this.body.translation()); }
  rotation(): Quaternion { return toQuat(this.body.rotation()); }
  linvel(): Vector3 { return toV3(this.body.linvel()); }
  angvel(): Vector3 { return toV3(this.body.angvel()); }

  worldCom(): Vector3 {
    return this.centerOfMass.clone().applyQuaternion(this.rotation()).add(this.position());
  }

  // --- agarre -------------------------------------------------------------------

  grab(now: number): void {
    if (this.state === AxeState.STUCK) this.unstick(now);
    // El objetivo arranca donde está el hacha y después alcanza al dedo: agarrarla
    // nunca la teletransporta de un saque.
    this.handTarget.copy(this.position());
    this.state = AxeState.HELD;
  }

  release(): boolean {
    if (this.state !== AxeState.HELD) return false;
    this.state = AxeState.LOOSE;
    return true;
  }

  canLodge(now: number): boolean {
    return now >= this.lodgeBlockUntil;
  }

  private unstick(now: number): void {
    this.body.setBodyType(this.R.RigidBodyType.Dynamic, true);
    this.state = AxeState.LOOSE;
    this.lodgeBlockUntil = now + this.lodgeGrace;
  }

  /**
   * Se clava una leña en el filo. Deja de ser un objeto aparte y pasa a ser parte del
   * cuerpo del hacha: suma masa, corre el centro de masa y agrega su forma para que
   * pueda golpear contra el tocón.
   */
  carryLog(localPos: Vector3, localRot: Quaternion, radius: number, height: number, logMass: number): void {
    if (this.carrying) return;
    const c = this.world.createCollider(
      this.R.ColliderDesc.cylinder(height / 2, radius)
        .setTranslation(localPos.x, localPos.y, localPos.z)
        .setRotation(localRot)
        .setDensity(0)
        .setFriction(DEFAULT_FRICTION),
      this.body,
    );
    this.roles.set(c.handle, 'axe');
    this.carriedCollider = c;
    this.carriedMass = logMass;
    this.carriedPoint.copy(localPos);
    this.carriedLocal.pos.copy(localPos);
    this.carriedLocal.rot.copy(localRot);
    this.carrying = true;
    this.applyBladeWeight();
  }

  /** Suelta la leña cargada y devuelve dónde quedó en el mundo. */
  dropLog(): { pos: Vector3; rot: Quaternion } {
    const rot = this.rotation();
    const where = {
      pos: this.carriedLocal.pos.clone().applyQuaternion(rot).add(this.position()),
      rot: rot.clone().multiply(this.carriedLocal.rot),
    };
    if (this.carriedCollider) {
      this.roles.delete(this.carriedCollider.handle);
      this.world.removeCollider(this.carriedCollider, true);
      this.carriedCollider = null;
    }
    this.carrying = false;
    this.carriedMass = 0;
    this.carriedPoint.set(0, 0, 0);
    this.applyBladeWeight();
    return where;
  }

  // --- física -------------------------------------------------------------------

  /** Lo que en Godot hacía _integrate_forces ANTES del paso de física. */
  preStep(dt: number): void {
    this.remember();
    if (this.state === AxeState.HELD) this.pullTowardHand(dt);
    if (this.state === AxeState.LOOSE) this.edgeAssist(dt);
  }

  /**
   * Guarda la velocidad de este paso y deja en prev* la más rápida de la ventana, que es
   * la mejor estimación de con qué venía el hacha antes de chocar. Cuanto más rápido
   * viene, más tarde aparece el contacto; con un solo frame se medía mal. Con 6 frames
   * agarraba el bamboleo ya pasado. Tres alcanzan.
   */
  private remember(): void {
    this.histLin.push(this.linvel());
    this.histAng.push(this.angvel());
    if (this.histLin.length > VELOCITY_HISTORY) {
      this.histLin.shift();
      this.histAng.shift();
    }
    let best = 0;
    let bestSpeed = -1;
    for (let i = 0; i < this.histLin.length; i++) {
      const s = this.histLin[i].length() + this.histAng[i].length() * 0.25;
      if (s > bestSpeed) {
        bestSpeed = s;
        best = i;
      }
    }
    this.prevLin.copy(this.histLin[best]);
    this.prevAng.copy(this.histAng[best]);
  }

  private pullTowardHand(dt: number): void {
    this.handTarget.lerp(this.handPointer, 1 - Math.exp(-this.handCatchUp * dt));

    const grip = this.position();
    const arm = grip.clone().sub(this.worldCom());
    // La velocidad de referencia mezcla la del centro de masa con la del agarre según
    // la muñeca. Con muñeca 0 el bamboleo le resulta invisible y no lo frena.
    const velRef = this.linvel().add(this.angvel().cross(arm).multiplyScalar(this.wrist));

    const followGain = lerp(6, 34, this.gripHold);
    const response = lerp(0.3, 1, this.gripHold);

    const desired = this.handTarget.clone().sub(grip).multiplyScalar(followGain);
    if (desired.length() > this.maxGripSpeed) desired.setLength(this.maxGripSpeed);
    const dv = desired.sub(velRef);
    const need = dv.length();
    if (need < 0.0001) return;

    const dir = dv.divideScalar(need);
    // Masa efectiva EN EL AGARRE y en esa dirección: lo que evita pasarse.
    const mEff = this.effMass(arm, dir);
    const impulse = Math.min(need * mEff * response, this.gripMaxAccel * mEff * dt);
    // Aplicado en el ORIGEN del cuerpo: de esa palanca sale el torque del bamboleo.
    this.body.applyImpulseAtPoint(dir.multiplyScalar(impulse), grip, true);
  }

  /**
   * Masa efectiva en un punto y una dirección: 1/m_ef = 1/m + (r×n)ₓ² / Iₓ.
   *
   * Solo cuenta el giro sobre X, que es el único que el hacha tiene: los otros dos están
   * bloqueados, o sea que para el solver tienen inercia infinita. Godot usaba el tensor
   * entero, y un contacto corrido del plano (el borde de la leña al cascarla, las dos
   * esquinas del filo) se llevaba el término de Y, que es chico (0.12·Iₓ) y desplomaba
   * la masa efectiva: el cascazo medía 1.7 J donde el solver frenaba 7.4 kg.
   */
  effMass(arm: Vector3, dir: Vector3): number {
    return effectiveMass(this.mass, this.inertia.x, arm, dir);
  }

  /** Ayuda de alineación del filo. APAGADA POR DEFECTO: medida, no ayuda (ticket 2.4). */
  private edgeAssist(dt: number): void {
    this.assistApplied = 0;
    if (this.assistStrength <= 0) return;
    const dist = this.position().distanceTo(this.targetPoint);
    if (dist > this.assistRadius) return;
    const w = this.angvel();
    const gain = clamp(Math.abs(w.x) / this.assistFullSpin, 0, 1);
    if (gain <= 0.01) return;
    const e = this.edgeDirection();
    const err = wrapAngle(Math.PI - Math.atan2(e.z, e.y));
    const closeness = 1 - dist / this.assistRadius;
    // Corrige la ORIENTACIÓN, no la velocidad angular (a un metro no alcanza a girar).
    const stepRot = clamp(err, -1, 1) * gain * closeness * this.assistStrength * dt;
    this.assistApplied = stepRot;
    this.assistFrames++;
    this.assistTotal += Math.abs(stepRot);
    const q = this.rotation().multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), stepRot));
    this.body.setRotation(q, true);
  }

  /**
   * Revisa los contactos que dejó el paso de física. Devuelve a lo sumo uno, como en
   * Godot, y después espera CONTACT_COOLDOWN para no llenar todo de toques repetidos.
   */
  scanContacts(now: number, logCenter: Vector3 | null): AxeContact | null {
    if (this.state === AxeState.STUCK || now < this.nextContactOk) return null;

    const mine = this.carriedCollider ? [...this.colliders, this.carriedCollider] : this.colliders;
    for (const c of mine) {
      let found: AxeContact | null = null;
      this.world.contactPairsWith(c, (other) => {
        if (found) return;
        const role = this.roles.get(other.handle);
        if (role === 'stump' && this.carrying) found = this.slamContact(c, other);
        else if (role === 'log' && logCenter) found = this.logContact(c, other, logCenter);
      });
      if (found) {
        this.nextContactOk = now + CONTACT_COOLDOWN;
        return found;
      }
    }
    return null;
  }

  /**
   * El punto de contacto entre un collider del hacha y otro, en mundo: el centro de
   * presión, o sea el promedio de los puntos del manifold pesado por el impulso que
   * recibió cada uno. Una cara plana contra otra arma varios puntos sobre el borde, y
   * tomar "el primero" (como en Godot) a veces elegía uno de la orilla, con una masa
   * efectiva que no tenía nada que ver con el golpe.
   */
  private firstTouch(c: Collider, other: Collider): { point: Vector3; normal: Vector3 } | null {
    const sum = new Vector3();
    let weight = 0;
    let normal: Vector3 | null = null;
    const rot = toQuat(c.rotation());
    const pos = toV3(c.translation());
    this.world.contactPair(c, other, (m, flipped) => {
      for (let i = 0; i < m.numContacts(); i++) {
        // Rapier arma contactos predictivos: frena el golpe ANTES de que las formas se
        // toquen, así que un contacto todavía separado ya puede haber recibido el
        // choque. Cuenta si se toca o si el solver le aplicó impulso.
        const impulse = m.contactImpulse(i);
        if (m.contactDist(i) > 0.002 && impulse <= 1e-6) continue;
        const local = flipped ? m.localContactPoint2(i) : m.localContactPoint1(i);
        if (!local) continue;
        // Un punto que toca sin impulso cuenta poquito, para no quedarse sin punto.
        const w = Math.max(impulse, 1e-4);
        sum.addScaledVector(toV3(local).applyQuaternion(rot).add(pos), w);
        weight += w;
        normal ??= toV3(m.normal());
      }
    });
    if (weight === 0 || !normal) return null;
    return { point: sum.divideScalar(weight), normal };
  }

  /**
   * Con una leña clavada, lo que importa es que pegue contra el tocón. Misma cuenta de
   * energía que un hachazo, pero sin exigir filo: acá se rompe por golpe seco.
   */
  private slamContact(c: Collider, other: Collider): AxeContact | null {
    const t = this.firstTouch(c, other);
    if (!t) return null;
    const sn = t.normal.lengthSq() < 0.5 ? new Vector3(0, 1, 0) : t.normal;
    const r = t.point.clone().sub(this.worldCom());
    const vp = this.prevLin.clone().add(this.prevAng.clone().cross(r));
    const vn = Math.abs(vp.dot(sn));
    const m = this.effMass(r, sn);
    return { kind: 'slam', energy: 0.5 * m * vn * vn, point: t.point, normal: sn, vNormal: vn, masaEfectiva: m };
  }

  private logContact(c: Collider, other: Collider, logCenter: Vector3): AxeContact | null {
    const t = this.firstTouch(c, other);
    if (!t) return null;
    const worldPoint = t.point;
    const invRot = this.rotation().invert();
    const localPoint = worldPoint.clone().sub(this.position()).applyQuaternion(invRot);
    const normal = t.normal;

    // FÍSICA DEL GOLPE: lo que corta es EL FILO, que en un hacha girando va mucho más
    // rápido que el centro de masa (v = v_c + w × r), y participa la masa efectiva en
    // ese punto. La energía entregada es ½·m_ef·v_n².
    const r = worldPoint.clone().sub(this.worldCom());
    const vPoint = this.prevLin.clone().add(this.prevAng.clone().cross(r));

    // Solo cuenta lo que entra HACIA ADENTRO de la madera (antes era un abs() y un filo
    // alejándose contaba como hachazo).
    const into = logCenter.clone().sub(worldPoint).normalize();
    const vN = Math.max(vPoint.dot(into), 0);
    const mEff = this.effMass(r, normal);
    const energy = 0.5 * mEff * vN * vN;

    // Eficiencia de cuña: solo lo que empuja el filo hacia adentro abre la madera.
    let wedge = 0;
    if (vPoint.length() > 0.01) {
      wedge = smoothstep(0, 0.55, this.edgeDirection().dot(vPoint.clone().normalize()));
    }

    return {
      kind: 'log',
      localPoint,
      energy: energy * wedge,
      info: {
        energiaBruta: energy,
        cuna: wedge,
        vFilo: vPoint.length(),
        vNormal: vN,
        masaEfectiva: mEff,
        vCentro: this.prevLin.length(),
        giro: this.prevAng.length(),
        puntoMundo: worldPoint,
        normal,
      },
    };
  }

  // --- geometría ------------------------------------------------------------------

  /** Hacia dónde mira el filo, en mundo: del centro de masa de la malla al filo. */
  edgeDirection(): Vector3 {
    return EDGE.clone().sub(COM).applyQuaternion(this.rotation()).normalize();
  }

  /** Si un contacto cayó sobre el filo o sobre el lomo (quedan a 0.36 m). */
  isEdgeContact(localPoint: Vector3): boolean {
    return localPoint.distanceTo(EDGE) < EDGE_RADIUS;
  }

  stateName(): string {
    return this.state === AxeState.HELD ? 'MANO' : this.state === AxeState.STUCK ? 'CLAVA' : 'LIBRE';
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
}
