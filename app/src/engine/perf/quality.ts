// The one fixed quality and dynamic resolution (spec milestone 1, sections
// 11.2 and 11.3).

export interface QualitySettings {
  renderScaleCap: number;
  errorTargetPx: number;
  animatedFigures: number;
}

export const QUALITY: QualitySettings = {
  renderScaleCap: 2,
  errorTargetPx: 1.5,
  animatedFigures: 5000,
};

/**
 * The frame time below which the render scale never drops: 30 fps on every device
 * (Yang, 2026-10-19: "I don't want dynamic resolution unless average frame rate
 * consistently drops below 30fps"). The parameter is kept for callers.
 */
export function targetFrameMs(_isPhone: boolean): number {
  return 1000 / 30;
}

/**
 * Lowers the render scale in steps of 10 %, down to half the cap, only while the
 * average frame rate stays below the target for 3 seconds; raises it again by two
 * steps after each second of frames well above it (40 fps for the 30 fps target).
 */
export class DynamicResolution {
  scale: number;
  private cap: number;
  private target: number;
  private avg: number;
  private slowFor = 0;
  private fastFor = 0;

  constructor(cap: number, targetMs: number) {
    this.cap = cap;
    this.scale = cap;
    this.target = targetMs;
    this.avg = targetMs;
  }

  configure(cap: number, targetMs: number): void {
    this.cap = cap;
    this.target = targetMs;
    this.scale = Math.min(this.scale, cap);
    if (this.scale < cap * 0.5) this.scale = cap * 0.5;
  }

  /** Feeds one frame time; returns true when the scale changed. */
  frame(ms: number): boolean {
    this.avg += (ms - this.avg) * 0.1;
    if (this.avg > this.target) {
      this.slowFor += ms;
      this.fastFor = 0;
    } else if (this.avg < this.target * 0.75) {
      this.fastFor += ms;
      this.slowFor = 0;
    } else {
      this.slowFor = 0;
      this.fastFor = 0;
    }
    const step = this.cap * 0.1;
    if (this.slowFor >= 3000 && this.scale > this.cap * 0.5 + 1e-6) {
      this.scale = Math.max(this.cap * 0.5, this.scale - step);
      this.slowFor = 0;
      return true;
    }
    if (this.fastFor >= 1000 && this.scale < this.cap - 1e-6) {
      this.scale = Math.min(this.cap, this.scale + 2 * step);
      this.fastFor = 0;
      return true;
    }
    return false;
  }
}

/** Rolling frame statistics for the overlay and the performance report. */
export class FrameStats {
  /** The last frames' times, as a ring of the newest `max`. */
  private samples: Float64Array;
  private count = 0;
  private next = 0;

  constructor(max = 600) {
    this.samples = new Float64Array(max);
  }

  push(ms: number): void {
    this.samples[this.next] = ms;
    this.next = (this.next + 1) % this.samples.length;
    this.count = Math.min(this.count + 1, this.samples.length);
  }

  get average(): number {
    if (!this.count) return 0;
    let sum = 0;
    for (let k = 0; k < this.count; k++) sum += this.samples[k]!;
    return sum / this.count;
  }

  percentile(p: number): number {
    if (!this.count) return 0;
    const sorted = this.samples.slice(0, this.count).sort();
    return sorted[Math.min(this.count - 1, Math.floor((p / 100) * this.count))]!;
  }

  get fps(): number {
    const avg = this.average;
    return avg > 0 ? 1000 / avg : 0;
  }

  reset(): void {
    this.count = 0;
    this.next = 0;
  }
}
