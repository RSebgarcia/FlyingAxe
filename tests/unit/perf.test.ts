import { describe, expect, it, vi } from 'vitest';
import { BUDGET } from '../../src/perf/budget';
import { FrameStats } from '../../src/perf/frame-stats';
import { QualityGovernor, TIERS, initialTier } from '../../src/perf/quality';

describe('FrameStats', () => {
  it('percentiles and mean', () => {
    const s = new FrameStats(100);
    for (let i = 1; i <= 100; i++) s.push(i);
    expect(s.percentile(50)).toBe(50);
    expect(s.percentile(95)).toBe(95);
    expect(s.mean()).toBeCloseTo(50.5);
  });

  it('the ring forgets old frames', () => {
    const s = new FrameStats(4);
    for (const v of [100, 100, 1, 1, 1, 1]) s.push(v);
    expect(s.percentile(100)).toBe(1);
    expect(s.samples).toBe(4);
  });
});

function windows(g: QualityGovernor) {
  const s = new FrameStats();
  let t = 0;
  return (ms: number) => {
    for (let i = 0; i < 60; i++) s.push(ms);
    return g.update(s, (t += 2000));
  };
}

describe('QualityGovernor', () => {
  const opts = { warmupMs: 0 };

  it('steps down when p95 goes over budget', () => {
    const onChange = vi.fn();
    const g = new QualityGovernor(0, onChange, opts);
    expect(windows(g)(25)).toBe(true);
    expect(g.tier).toBe(1);
    expect(onChange).toHaveBeenCalledWith(TIERS[1], 1);
  });

  it('ignores the warm-up', () => {
    const g = new QualityGovernor(0);
    const s = new FrameStats();
    for (let i = 0; i < 60; i++) s.push(200);
    expect(g.update(s, 2500)).toBe(false);
    expect(g.tier).toBe(0);
  });

  it('steps up only after several roomy windows, and slower after a stutter', () => {
    const g = new QualityGovernor(1, undefined, opts);
    const win = windows(g);
    win(8);
    win(8);
    expect(g.tier).toBe(1);
    win(8);
    expect(g.tier).toBe(0);
    win(30); // stutter: back to 1, now 5 good windows are needed
    expect(g.tier).toBe(1);
    for (let i = 0; i < 4; i++) win(8);
    expect(g.tier).toBe(1);
    win(8);
    expect(g.tier).toBe(0);
  });

  it('a middling window breaks the streak', () => {
    const g = new QualityGovernor(1, undefined, opts);
    const win = windows(g);
    win(8);
    win(8);
    win(15);
    win(8);
    expect(g.tier).toBe(1);
  });

  it('at the lowest tier it aims for 30 Hz', () => {
    const g = new QualityGovernor(TIERS.length - 1, undefined, opts);
    windows(g)(40);
    expect(g.targetMs).toBe(BUDGET.floorFrameMs);
  });
});

describe('initialTier', () => {
  it('desktop starts high, a weak phone starts low', () => {
    expect(initialTier({ coarsePointer: false })).toBe(0);
    expect(initialTier({ coarsePointer: true, cores: 8, memoryGB: 8 })).toBe(1);
    expect(initialTier({ coarsePointer: true, cores: 4 })).toBe(2);
  });
});
