// Cámara lenta del corte (juice.gd :: slowmo_*).
//
// Corta pero no tanto como para que moleste al encadenar tiros. Dura en tiempo REAL,
// no de juego: si se midiera en tiempo de juego la cámara lenta se alargaría a sí misma.
//
// Nota del port: en la demo de Godot la cámara lenta y el sacudón del corte quedaron
// después de un `return` en juice.gd y nunca se ejecutaban. Acá van como el ticket los
// describe (0.35 por 160 ms).

export class HitStop {
  enabled = true;
  scale = 0.35;
  ms = 160;

  private remaining = 0;

  /** Escala que la física y las partículas tienen que aplicarle a su dt. */
  get timeScale(): number {
    return this.remaining > 0 ? this.scale : 1;
  }

  trigger(): void {
    if (!this.enabled) return;
    this.remaining = this.ms / 1000;
  }

  /** Avanza con dt real, en segundos. */
  update(realDt: number): void {
    if (this.remaining > 0) this.remaining = Math.max(this.remaining - realDt, 0);
  }
}
