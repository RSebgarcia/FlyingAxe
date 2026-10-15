import { BUDGET } from '../perf/budget';
import { FrameStats } from '../perf/frame-stats';

// On-screen frame meter. Turn it on with `?perf` in the URL, the ` key, or three quick
// taps in the top-right corner on a phone. Reads only what both WebGPURenderer and
// WebGLRenderer expose.

export interface PerfSource {
  info: { render: { drawCalls?: number; calls?: number; triangles: number } };
  backend: string;
  tier: () => string;
}

export class PerfMeter {
  private readonly stats = new FrameStats(120);
  private readonly el = document.createElement('div');
  private visible = new URLSearchParams(location.search).has('perf');
  private last = 0;

  constructor(private readonly src: PerfSource) {
    this.el.id = 'perf';
    this.el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.el);
    this.apply();

    addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') this.toggle();
    });
    let taps: number[] = [];
    addEventListener('pointerdown', (e) => {
      if (e.clientX < innerWidth - 60 || e.clientY > 60) return;
      taps = taps.filter((t) => e.timeStamp - t < 600);
      taps.push(e.timeStamp);
      if (taps.length >= 3) {
        taps = [];
        this.toggle();
      }
    });
  }

  toggle() {
    this.visible = !this.visible;
    this.apply();
  }

  /** Call once per frame with the frame time in ms. */
  frame(dtMs: number, nowMs: number) {
    this.stats.push(dtMs);
    if (!this.visible || nowMs - this.last < 250) return;
    this.last = nowMs;
    const s = this.stats;
    const p95 = s.percentile(95);
    const r = this.src.info.render;
    const calls = r.drawCalls ?? r.calls ?? 0;
    this.el.textContent =
      `${(1000 / Math.max(s.mean(), 0.01)).toFixed(0)} fps · ${this.src.backend}\n` +
      `p50 ${s.percentile(50).toFixed(1)} · p95 ${p95.toFixed(1)} ms${p95 > BUDGET.p95Ms ? ' ⚠' : ''}\n` +
      `draw ${calls}/${BUDGET.drawCalls} · tri ${(r.triangles / 1000).toFixed(0)}k\n` +
      `calidad ${this.src.tier()}`;
  }

  private apply() {
    this.el.style.display = this.visible ? 'block' : 'none';
  }
}
