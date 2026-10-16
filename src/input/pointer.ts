import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three/webgpu';

// The axe and the hand live on the x = 0 plane, the same one the axe tumbles in, so
// nobody has to aim in depth. Mouse, pen and touch all arrive as pointer events, and
// the rules mirror game.gd's _unhandled_input: press grabs, drag moves, release throws.
//
// What matters on a phone:
// - The first finger down owns the axe. A second finger neither steals nor drops it.
// - The pointer is captured, so a throw that flicks off the screen still releases.
// - pointercancel, lost capture, window blur and a hidden tab all count as letting go;
//   otherwise the axe stays glued to a finger that isn't there any more.
const PLAY_PLANE = new Plane(new Vector3(1, 0, 0), 0);

export interface PointerOptions {
  /**
   * Lift the grab point this many CSS px above a finger or pen, so the finger doesn't
   * cover the axe. 0 keeps the demo's behaviour.
   */
  touchOffsetY?: number;
  /** Where blur and visibilitychange are listened for. Injected by the unit tests. */
  env?: { window: EventTarget; document: EventTarget & { visibilityState: string } };
}

type Surface = Pick<
  HTMLElement,
  'addEventListener' | 'getBoundingClientRect' | 'setPointerCapture' | 'releasePointerCapture' | 'hasPointerCapture'
> & { style: Partial<CSSStyleDeclaration> };

export class Pointer {
  /** Pointer position projected on the play plane, in world space. */
  readonly world = new Vector3();
  down = false;
  /** 'mouse' | 'touch' | 'pen' while held, null otherwise. */
  type: string | null = null;
  private id: number | null = null;
  private readonly ndc = new Vector2();
  private readonly ray = new Raycaster();
  private readonly listeners = { down: [] as Array<() => void>, up: [] as Array<() => void> };
  private readonly touchOffsetY: number;

  constructor(
    private readonly canvas: Surface,
    private readonly camera: PerspectiveCamera,
    opts: PointerOptions = {},
  ) {
    this.touchOffsetY = opts.touchOffsetY ?? 0;
    const env = opts.env ?? { window, document };

    // Without these the browser keeps the drag for scrolling, zooming or text selection.
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';

    canvas.addEventListener('pointerdown', (e) => {
      if (this.id !== null) return;
      // Only the main button grabs, as in the demo.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.id = e.pointerId;
      this.type = e.pointerType;
      canvas.setPointerCapture(e.pointerId);
      this.move(e);
      this.down = true;
      this.listeners.down.forEach((fn) => fn());
    });
    canvas.addEventListener('pointermove', (e) => {
      // A mouse is tracked while hovering too; a finger only exists while it touches.
      if (this.id === null ? e.pointerType === 'mouse' : e.pointerId === this.id) this.move(e);
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.id) return;
      if (e.type !== 'lostpointercapture') this.move(e);
      this.release();
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    env.window.addEventListener('blur', () => this.cancel());
    env.document.addEventListener('visibilitychange', () => {
      if (env.document.visibilityState === 'hidden') this.cancel();
    });
  }

  onDown(fn: () => void) {
    this.listeners.down.push(fn);
  }

  onUp(fn: () => void) {
    this.listeners.up.push(fn);
  }

  /** Let go of the held pointer from outside, e.g. on a reset. */
  cancel() {
    const id = this.id;
    if (id === null) return;
    // Release first, so the lostpointercapture this triggers finds nothing held.
    this.release();
    if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }

  private release() {
    this.id = null;
    this.type = null;
    this.down = false;
    this.listeners.up.forEach((fn) => fn());
  }

  private move(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    const lift = e.pointerType === 'mouse' ? 0 : this.touchOffsetY;
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - lift - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    // Looking at the plane edge-on there is no hit; keep the last point.
    this.ray.ray.intersectPlane(PLAY_PLANE, this.world);
  }
}
