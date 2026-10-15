// Entrada de escritorio: mouse (o cualquier puntero) para agarrar y soltar, y las
// perillas en vivo del teclado, como en game.gd. El táctil fino es del paso 4; con
// Pointer Events un dedo ya agarra y suelta igual que el mouse.
//
//   ↑↓ pesa · ←→ distancia · W S agarre · A D muñeca · Q E ayuda · R reiniciar

import { type Camera, Vector2 } from 'three';
import { pointerToPlane } from './pointer';
import type { GameSim } from './sim';

export function attachInput(sim: GameSim, el: HTMLElement, camera: Camera): () => void {
  const ndc = new Vector2();
  const toWorld = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    return pointerToPlane(camera, ndc) ?? sim.axe.position();
  };

  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    sim.grab(toWorld(e));
  };
  const move = (e: PointerEvent) => {
    if (sim.isHeld()) sim.setPointer(toWorld(e));
  };
  const up = (e: PointerEvent) => {
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    sim.release();
  };

  const key = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const a = sim.axe;
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    switch (e.code) {
      case 'ArrowUp': a.nudgeBladeWeight(0.1); break;
      case 'ArrowDown': a.nudgeBladeWeight(-0.1); break;
      case 'ArrowRight': a.nudgeWeightAt(0.1); break;
      case 'ArrowLeft': a.nudgeWeightAt(-0.1); break;
      case 'KeyW': case 'Equal': case 'NumpadAdd': a.gripHold = clamp01(a.gripHold + 0.05); break;
      case 'KeyS': case 'Minus': case 'NumpadSubtract': a.gripHold = clamp01(a.gripHold - 0.05); break;
      case 'KeyD': a.wrist = clamp01(a.wrist + 0.05); break;
      case 'KeyA': a.wrist = clamp01(a.wrist - 0.05); break;
      case 'KeyE': a.assistStrength = Math.min(8, a.assistStrength + 0.5); break;
      case 'KeyQ': a.assistStrength = Math.max(0, a.assistStrength - 0.5); break;
      case 'KeyR': sim.resetAxe(); break;
      default: return;
    }
    e.preventDefault();
    // Toda perilla que se toca se guarda: al volver está como la dejaste.
    sim.saveKnobs();
  };

  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  window.addEventListener('keydown', key);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    window.removeEventListener('keydown', key);
  };
}
