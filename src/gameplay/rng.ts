// Generador con semilla. Cada sistema que sortea tiene el suyo (leña, mitades), igual
// que en Godot: si compartieran flujo, el clima o un relámpago le correrían los números
// a la leña y los bancos medirían contra otro leño sin que nadie tocara la física.

export class Rng {
  private s: number;

  constructor(seed = Date.now()) {
    this.s = seed >>> 0;
  }

  setSeed(seed: number): void {
    this.s = seed >>> 0;
  }

  /** mulberry32: rápido, 32 bits, suficiente para sortear leños. Devuelve [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}
