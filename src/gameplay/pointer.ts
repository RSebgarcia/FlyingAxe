// Proyecta el dedo o el mouse sobre el plano de juego x = 0, que es donde viven el
// hacha y la mano. Así no hay que apuntar en profundidad, que en un juego relajante
// sería pelear con la cámara.

import { type Camera, Plane, Ray, Vector2, Vector3 } from 'three';

const PLAY_PLANE = new Plane(new Vector3(1, 0, 0), 0);

/**
 * ndc: coordenadas normalizadas del puntero (-1..1, y hacia arriba).
 * Devuelve null si el rayo sale paralelo al plano (mirándolo de canto); el que llama
 * se queda con donde estaba el hacha, que es lo único sensato.
 */
export function pointerToPlane(camera: Camera, ndc: Vector2, out = new Vector3()): Vector3 | null {
  const origin = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const dir = new Vector3(ndc.x, ndc.y, 0.5).unproject(camera).sub(origin).normalize();
  if ('isOrthographicCamera' in camera && camera.isOrthographicCamera) {
    origin.set(ndc.x, ndc.y, -1).unproject(camera);
    dir.set(0, 0, -1).transformDirection(camera.matrixWorld);
  }
  return new Ray(origin, dir).intersectPlane(PLAY_PLANE, out);
}
