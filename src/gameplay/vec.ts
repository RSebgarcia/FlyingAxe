// Puente entre los vectores planos de Rapier y la matemática de three.js.

import { Quaternion, Vector3 } from 'three';

export function toV3(v: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(v.x, v.y, v.z);
}

export function toQuat(q: { x: number; y: number; z: number; w: number }): Quaternion {
  return new Quaternion(q.x, q.y, q.z, q.w);
}

/** smoothstep de Godot: 0 antes de a, 1 después de b, curva de Hermite en el medio. */
export function smoothstep(a: number, b: number, x: number): number {
  if (a === b) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Cuánta masa siente un impulso aplicado a `arm` del centro de masa en dirección `dir`,
 * contando lo que se va en hacer girar el cuerpo. Para un cuerpo que solo gira sobre X
 * (el hacha, plano x = 0): 1/m_ef = 1/m + (arm×dir)ₓ² / Iₓ.
 */
export function effectiveMass(mass: number, inertiaX: number, arm: Vector3, dir: Vector3): number {
  const rnx = arm.y * dir.z - arm.z * dir.y;
  const invEff = 1 / mass + (rnx * rnx) / inertiaX;
  if (invEff <= 0.00001) return mass;
  return 1 / invEff;
}
