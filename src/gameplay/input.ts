// Perillas en vivo del teclado, como en game.gd. El puntero (mouse, lápiz y dedo) es de
// src/input/pointer.ts; main.ts lo conecta con sim.grab / setPointer / release.
//
//   ↑↓ pesa · ←→ distancia · W S agarre · A D muñeca · Q E ayuda · R reiniciar

import type { GameSim } from './sim';

export function attachKnobKeys(sim: GameSim, target: Window = window): () => void {
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

  target.addEventListener('keydown', key);
  return () => target.removeEventListener('keydown', key);
}
