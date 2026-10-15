import { BUDGET } from './budget';
import type { FrameStats } from './frame-stats';

// Quality tiers, best first. The governor moves between them watching the frame p95.
// On a phone the bottleneck is fill rate, so resolution drops first; shadows, particles
// and post-processing follow.

export interface QualityTier {
  name: string;
  /** devicePixelRatio cap. A phone at DPR 3 shades 9x the pixels of DPR 1. */
  maxPixelRatio: number;
  shadowMapSize: number;
  /** Particle count multiplier for step 3's chips, rain and snow. */
  particles: number;
  /** Bloom, height fog and other post (step 3). */
  post: boolean;
}

export const TIERS: readonly QualityTier[] = [
  { name: 'alta', maxPixelRatio: 2, shadowMapSize: 4096, particles: 1, post: true },
  { name: 'media', maxPixelRatio: 1.5, shadowMapSize: 2048, particles: 0.75, post: true },
  { name: 'baja', maxPixelRatio: 1.25, shadowMapSize: 1024, particles: 0.5, post: false },
  { name: 'mínima', maxPixelRatio: 1, shadowMapSize: 512, particles: 0.3, post: false },
];

export interface DeviceHints {
  coarsePointer: boolean;
  cores?: number;
  memoryGB?: number;
}

/** Starting tier before anything is measured. Better to start low and climb than stutter. */
export function initialTier(d: DeviceHints) {
  if (!d.coarsePointer) return 0;
  const weak = (d.cores !== undefined && d.cores <= 4) || (d.memoryGB !== undefined && d.memoryGB <= 3);
  return weak ? 2 : 1;
}

export function readDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    cores: nav.hardwareConcurrency,
    memoryGB: nav.deviceMemory,
  };
}

export interface GovernorOptions {
  /** How often to judge, in ms. */
  windowMs?: number;
  /** Minimum samples before judging. */
  minSamples?: number;
  /** Good windows in a row needed to step up. More than 1 so it doesn't oscillate. */
  upgradeAfter?: number;
  /** Extra good windows required after each stutter-driven step down. */
  cooldownPenalty?: number;
  /** Ignore the first ms after load: shader compiles and texture uploads aren't the device's pace. */
  warmupMs?: number;
}

export class QualityGovernor {
  tier: number;
  /** Switches to 30 Hz when even the lowest tier can't hold 60. */
  targetMs: number = BUDGET.frameMs;
  private lastEval = 0;
  private goodWindows = 0;
  private needed: number;
  private readonly o: Required<GovernorOptions>;

  constructor(
    start: number,
    private readonly onChange: (tier: QualityTier, index: number) => void = () => {},
    opts: GovernorOptions = {},
  ) {
    this.o = { windowMs: 2000, minSamples: 60, upgradeAfter: 3, cooldownPenalty: 2, warmupMs: 3000, ...opts };
    this.tier = Math.min(TIERS.length - 1, Math.max(0, start));
    this.needed = this.o.upgradeAfter;
  }

  get current() {
    return TIERS[this.tier];
  }

  /** Call once per frame after `stats.push`. Returns true when the tier changed. */
  update(stats: FrameStats, nowMs: number) {
    if (nowMs < this.o.warmupMs) {
      stats.reset();
      this.lastEval = nowMs;
      return false;
    }
    if (nowMs - this.lastEval < this.o.windowMs || stats.samples < this.o.minSamples) return false;
    this.lastEval = nowMs;
    const p95 = stats.percentile(95);
    const limit = this.targetMs === BUDGET.frameMs ? BUDGET.p95Ms : this.targetMs * 1.2;
    stats.reset();

    if (p95 > limit) {
      this.goodWindows = 0;
      if (this.tier < TIERS.length - 1) {
        this.needed += this.o.cooldownPenalty;
        return this.set(this.tier + 1);
      }
      this.targetMs = BUDGET.floorFrameMs;
      return false;
    }

    // Clear headroom: p95 fits with a 25% margin.
    if (p95 < this.targetMs * 0.75 && this.tier > 0) {
      if (++this.goodWindows >= this.needed) {
        this.goodWindows = 0;
        return this.set(this.tier - 1);
      }
    } else {
      this.goodWindows = 0;
    }
    return false;
  }

  private set(i: number) {
    this.tier = i;
    this.onChange(this.current, i);
    return true;
  }
}
