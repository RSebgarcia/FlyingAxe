// Sliding window of frame times. No per-frame allocation: a fixed ring, plus a sorted
// copy rebuilt only when someone asks for percentiles.

export class FrameStats {
  private readonly ring: Float32Array;
  private readonly sorted: Float32Array;
  private head = 0;
  private count = 0;
  private dirty = true;

  constructor(readonly size = 240) {
    this.ring = new Float32Array(size);
    this.sorted = new Float32Array(size);
  }

  push(ms: number) {
    this.ring[this.head] = ms;
    this.head = (this.head + 1) % this.size;
    if (this.count < this.size) this.count++;
    this.dirty = true;
  }

  get samples() {
    return this.count;
  }

  reset() {
    this.head = 0;
    this.count = 0;
    this.dirty = true;
  }

  mean() {
    if (this.count === 0) return 0;
    let s = 0;
    for (let i = 0; i < this.count; i++) s += this.ring[i];
    return s / this.count;
  }

  /** Nearest-rank percentile, p in [0, 100]. */
  percentile(p: number) {
    if (this.count === 0) return 0;
    if (this.dirty) {
      const view = this.sorted.subarray(0, this.count);
      view.set(this.ring.subarray(0, this.count));
      view.sort();
      this.dirty = false;
    }
    const rank = Math.ceil((p / 100) * this.count) - 1;
    return this.sorted[Math.min(this.count - 1, Math.max(0, rank))];
  }
}
