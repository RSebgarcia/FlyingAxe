import type { EventBus, GameEvents } from '../events';

// Las perillas del hacha en pantalla (game.gd :: _make_tuner), y el cableado del HUD del
// scaffold a los eventos del juego.
//
// Las perillas arrancan ocultas: es overlay de desarrollo. Con F1 aparecen, que sigue
// siendo la forma más rápida de tunear jugando.

/** Lo que usa del HUD de src/ui/hud.ts. */
export interface HudLike {
  setScore(cuts: number): void;
  setHint(text: string): void;
  setSpecies(name: string, detail: string): void;
}

const CSS = `
#tuner { position: absolute; top: calc(max(20px, env(safe-area-inset-top)) + clamp(34px, 5.5vw, 56px));
  left: var(--gutter, 16px); font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: clamp(11px, 1.05vw, 20px); color: rgb(252 224 158 / 0.95); white-space: pre;
  text-shadow: 0 2px 0 rgb(0 0 0 / 0.5); }
#tuner[hidden] { display: none; }
`;

export class Tuner {
  readonly el: HTMLDivElement;
  private log: GameEvents['logSpawned'] | null = null;
  private weather: GameEvents['weather'] = { name: '-', fixed: false };
  private knobs: GameEvents['tuner'] | null = null;
  private off: Array<() => void> = [];

  constructor(bus: EventBus<GameEvents>, private hud: HudLike, parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.id = 'tuner';
    this.el.hidden = true;
    parent.appendChild(this.el);

    this.off.push(
      bus.on('score', ({ cuts }) => hud.setScore(cuts)),
      bus.on('hint', ({ text }) => hud.setHint(text)),
      bus.on('logSpawned', (l) => {
        this.log = l;
        this.refreshSpecies();
      }),
      bus.on('weather', (w) => {
        this.weather = w;
        this.refreshSpecies();
        this.refresh();
      }),
      bus.on('tuner', (t) => {
        this.knobs = t;
        this.refresh();
      }),
    );
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  toggle(): void {
    this.el.hidden = !this.el.hidden;
  }

  private refreshSpecies(): void {
    const l = this.log;
    if (!l) return;
    const clima = this.weather.name + (this.weather.fixed ? ' ·' : '');
    this.hud.setSpecies(
      l.species,
      `${l.widthCm.toFixed(0)} × ${l.heightCm.toFixed(0)} cm · ${l.massKg.toFixed(1)} kg    ${clima}`,
    );
  }

  private refresh(): void {
    const t = this.knobs;
    const w = this.weather;
    const top = t
      ? `↑↓  pesa ${t.bladeWeight.toFixed(1)} kg      ←→  distancia ${t.weightAt.toFixed(1)}      ` +
        `W S  agarre ${t.grip.toFixed(2)}      A D  muñeca ${t.wrist.toFixed(2)}      ` +
        `Q E  ayuda ${t.assist.toFixed(1)}      R  reiniciar`
      : '';
    const mid = `C  clima: ${w.name}${w.fixed ? '  [fijo]' : '  [rota solo]'}      (Shift+C vuelve a rotar solo)`;
    const bottom = t
      ? `masa ${t.mass.toFixed(1)} kg · centro de masa y=${t.comY.toFixed(3)} z=${t.comZ.toFixed(3)} · inercia ${t.inertia.toFixed(3)}`
      : '';
    this.el.textContent = [top, mid, bottom].filter(Boolean).join('\n');
  }

  dispose(): void {
    for (const f of this.off) f();
    this.el.remove();
  }
}
