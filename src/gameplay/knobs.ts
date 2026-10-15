// Las perillas del hacha y su persistencia entre sesiones (settings.gd).
//
// Rodrigo tunea a mano cada vez que juega; antes cada arranque volvía a los valores por
// defecto. Se guarda en el navegador del jugador, no en el código.

export interface Knobs {
  /** Pesa ficticia en el filo, kg. */
  bladeWeight: number;
  /** Dónde cuelga la pesa sobre el eje agarre→filo: 0 en la mano, 1 en el filo. */
  weightAt: number;
  /** 0..1: qué tan pegado va el mango al mouse. */
  gripHold: number;
  /** 0..1: cuánto resiste la mano el bamboleo. */
  wrist: number;
  /** Ayuda de alineación del filo. Apagada: medida, no ayuda. */
  assistStrength: number;
}

export const DEFAULT_KNOBS: Readonly<Knobs> = Object.freeze({
  bladeWeight: 1.0,
  weightAt: 1.0,
  gripHold: 0.8,
  wrist: 0.25,
  assistStrength: 0.0,
});

export const KNOBS_KEY = 'flyingaxe.ajustes.v1';

/** Lo mínimo de Storage que hace falta; en tests se pasa un Map. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** null si no hay nada guardado o si el navegador no deja leer (modo privado). */
export function loadKnobs(store: KeyValueStore | null | undefined): Knobs | null {
  if (!store) return null;
  try {
    const raw = store.getItem(KNOBS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Knobs>;
    const out = { ...DEFAULT_KNOBS };
    for (const k of Object.keys(DEFAULT_KNOBS) as Array<keyof Knobs>) {
      const v = data[k];
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

export function saveKnobs(store: KeyValueStore | null | undefined, k: Knobs): void {
  if (!store) return;
  try {
    store.setItem(KNOBS_KEY, JSON.stringify(k));
  } catch {
    // Sin almacenamiento el juego anda igual; solo no recuerda las perillas.
  }
}

/** localStorage si existe y se deja usar. */
export function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
