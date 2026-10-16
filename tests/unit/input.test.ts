import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three/webgpu';
import { Pointer } from '../../src/input/pointer';
import { applyCameraFit, fitCamera } from '../../src/render/camera-fit';
import { CAMERA } from '../../src/config';

// Node has EventTarget but no DOM: a canvas stand-in with just what Pointer touches.
class FakeCanvas extends EventTarget {
  style: Record<string, string> = {};
  captured = new Set<number>();
  getBoundingClientRect = () => ({ left: 0, top: 0, width: 1600, height: 900 }) as DOMRect;
  setPointerCapture = (id: number) => void this.captured.add(id);
  releasePointerCapture = (id: number) => void this.captured.delete(id);
  hasPointerCapture = (id: number) => this.captured.has(id);
}

function ev(type: string, o: { id?: number; x?: number; y?: number; pointerType?: string; button?: number } = {}) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, {
    pointerId: o.id ?? 1,
    pointerType: o.pointerType ?? 'touch',
    button: o.button ?? 0,
    clientX: o.x ?? 800,
    clientY: o.y ?? 450,
  });
  return e;
}

function setup(touchOffsetY = 0) {
  const canvas = new FakeCanvas();
  const camera = new PerspectiveCamera(CAMERA.fov, 16 / 9, 0.05, 400);
  applyCameraFit(camera, 16 / 9);
  camera.updateMatrixWorld();
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const pointer = new Pointer(canvas as unknown as HTMLCanvasElement, camera, {
    touchOffsetY,
    env: { window: win, document: doc },
  });
  const down = vi.fn();
  const up = vi.fn();
  pointer.onDown(down);
  pointer.onUp(up);
  return { canvas, pointer, down, up, win, doc };
}

describe('Pointer', () => {
  it('projects onto the x = 0 plane; the screen centre is the camera target', () => {
    const { canvas, pointer, down } = setup();
    canvas.dispatchEvent(ev('pointerdown'));
    expect(down).toHaveBeenCalledOnce();
    expect(pointer.down).toBe(true);
    expect(pointer.world.x).toBeCloseTo(0, 6);
    expect(pointer.world.y).toBeCloseTo(CAMERA.lookAt[1], 4);
    expect(pointer.world.z).toBeCloseTo(CAMERA.lookAt[2], 4);
    expect(canvas.style.touchAction).toBe('none');
  });

  it('a second finger neither steals nor drops the axe', () => {
    const { canvas, pointer, down, up } = setup();
    canvas.dispatchEvent(ev('pointerdown', { id: 1 }));
    const held = pointer.world.clone();
    canvas.dispatchEvent(ev('pointerdown', { id: 2, x: 100, y: 100 }));
    canvas.dispatchEvent(ev('pointermove', { id: 2, x: 120, y: 120 }));
    canvas.dispatchEvent(ev('pointerup', { id: 2 }));
    expect(down).toHaveBeenCalledOnce();
    expect(up).not.toHaveBeenCalled();
    expect(pointer.world.equals(held)).toBe(true);
  });

  it('cancel, blur and a hidden tab all let go', () => {
    const { canvas, up, win, doc } = setup();
    canvas.dispatchEvent(ev('pointerdown'));
    canvas.dispatchEvent(ev('pointercancel'));
    canvas.dispatchEvent(ev('pointerdown'));
    win.dispatchEvent(new Event('blur'));
    canvas.dispatchEvent(ev('pointerdown'));
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(up).toHaveBeenCalledTimes(3);
    expect(canvas.captured.size).toBe(0);
  });

  it('only the main mouse button grabs', () => {
    const { canvas, down } = setup();
    canvas.dispatchEvent(ev('pointerdown', { pointerType: 'mouse', button: 2 }));
    expect(down).not.toHaveBeenCalled();
  });

  it('the touch offset lifts the grab point for fingers only', () => {
    const plain = setup();
    plain.canvas.dispatchEvent(ev('pointerdown'));
    const lifted = setup(40);
    lifted.canvas.dispatchEvent(ev('pointerdown'));
    expect(lifted.pointer.world.y).toBeGreaterThan(plain.pointer.world.y);
    const mouse = setup(40);
    mouse.canvas.dispatchEvent(ev('pointerdown', { pointerType: 'mouse' }));
    expect(mouse.pointer.world.y).toBeCloseTo(plain.pointer.world.y, 6);
  });
});

const halfWidth = (fov: number, aspect: number) => Math.tan((fov * Math.PI) / 360) * aspect;

describe('fitCamera', () => {
  it('wide screens keep the demo framing', () => {
    expect(fitCamera(16 / 9)).toEqual({ vFov: 52, dolly: 1 });
    expect(fitCamera(21 / 9)).toEqual({ vFov: 52, dolly: 1 });
  });

  it('4:3 widens the fov and keeps the horizontal extent', () => {
    const { vFov, dolly } = fitCamera(4 / 3);
    expect(dolly).toBe(1);
    expect(halfWidth(vFov, 4 / 3)).toBeCloseTo(halfWidth(52, 16 / 9), 6);
  });

  it('portrait caps the fov and backs the camera off', () => {
    const { vFov, dolly } = fitCamera(9 / 19.5);
    expect(vFov).toBe(80);
    expect(dolly).toBeGreaterThan(1);
    expect(halfWidth(vFov, 9 / 19.5) * dolly).toBeCloseTo(halfWidth(52, 16 / 9), 6);
  });
});
