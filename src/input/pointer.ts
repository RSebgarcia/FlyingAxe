import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three/webgpu';

// The axe and the hand live on the x = 0 plane, the same one the axe tumbles in, so
// nobody has to aim in depth. Mouse, pen and touch all arrive as pointer events.
const PLAY_PLANE = new Plane(new Vector3(1, 0, 0), 0);

export class Pointer {
  /** Pointer position projected on the play plane, in world space. */
  readonly world = new Vector3();
  down = false;
  private readonly ndc = new Vector2();
  private readonly ray = new Raycaster();
  private readonly listeners = { down: [] as Array<() => void>, up: [] as Array<() => void> };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: PerspectiveCamera,
  ) {
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.move(e);
      this.down = true;
      this.listeners.down.forEach((fn) => fn());
    });
    canvas.addEventListener('pointermove', (e) => this.move(e));
    const up = (e: PointerEvent) => {
      if (!this.down) return;
      this.move(e);
      this.down = false;
      this.listeners.up.forEach((fn) => fn());
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  onDown(fn: () => void) {
    this.listeners.down.push(fn);
  }

  onUp(fn: () => void) {
    this.listeners.up.push(fn);
  }

  private move(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    // Looking at the plane edge-on there is no hit; keep the last point.
    this.ray.ray.intersectPlane(PLAY_PLANE, this.world);
  }
}
