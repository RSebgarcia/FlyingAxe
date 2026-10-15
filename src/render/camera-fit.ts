import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import { CAMERA } from '../config';

// Framing that survives any aspect ratio.
//
// The demo was framed at 1920x1080 with a 52° vertical fov, and Godot keeps the height:
// on a portrait phone that leaves a thin slice and the stump falls out of frame. Here
// the design's horizontal extent is kept instead. Widening the fov is fine up to
// `maxVFov`; past that the camera backs off (dolly), because a 110° lens warps everything.

export interface CameraFitOptions {
  designVFov?: number; // degrees
  designAspect?: number;
  maxVFov?: number; // degrees
}

export interface CameraFit {
  /** Vertical fov to use, in degrees. */
  vFov: number;
  /** Multiplier on the camera-to-target distance. 1 = the demo's position. */
  dolly: number;
}

const RAD = Math.PI / 180;

export function fitCamera(aspect: number, opts: CameraFitOptions = {}): CameraFit {
  const designVFov = opts.designVFov ?? CAMERA.fov;
  const designAspect = opts.designAspect ?? 16 / 9;
  const maxVFov = opts.maxVFov ?? 80;

  // Wider than the design: keep the height, like Godot.
  if (aspect >= designAspect) return { vFov: designVFov, dolly: 1 };

  const halfW = Math.tan((designVFov * RAD) / 2) * designAspect; // tan(hFov / 2)
  const wanted = (2 * Math.atan(halfW / aspect)) / RAD;
  if (wanted <= maxVFov) return { vFov: wanted, dolly: 1 };

  const halfWAtMax = Math.tan((maxVFov * RAD) / 2) * aspect;
  return { vFov: maxVFov, dolly: halfW / halfWAtMax };
}

const target = new Vector3();

/** Apply `fitCamera` to the game camera, moving it along its line of sight from CAMERA. */
export function applyCameraFit(camera: PerspectiveCamera, aspect: number) {
  const { vFov, dolly } = fitCamera(aspect);
  target.set(...CAMERA.lookAt);
  camera.position.set(...CAMERA.position).sub(target).multiplyScalar(dolly).add(target);
  camera.lookAt(target);
  camera.aspect = aspect;
  camera.fov = vFov;
  camera.updateProjectionMatrix();
}
