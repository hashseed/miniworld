// The one fixed quality and dynamic resolution (spec milestone 1, sections
// 11.2 and 11.3).

export interface QualitySettings {
  renderScaleCap: number;
  errorTargetPx: number;
  waterDetail: number; // 0 foam only, 1 waves and foam, 2 waves, glint and foam
  animatedFigures: number;
}

export const QUALITY: QualitySettings = {
  renderScaleCap: 2,
  errorTargetPx: 1.5,
  waterDetail: 2,
  animatedFigures: 5000,
};

/** Target frame time: 60 fps on desktop, 30 fps on phones. */
export function targetFrameMs(isPhone: boolean): number {
  return isPhone ? 1000 / 30 : 1000 / 60;
}

/**
 * Lowers the render scale in steps of 10 % when frames are slow for half a
 * second, down to half the cap, and raises it again after 3 seconds
 * of comfortable frames.
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
    if (this.avg > this.target * 1.08) {
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
    if (this.slowFor >= 500 && this.scale > this.cap * 0.5 + 1e-6) {
      this.scale = Math.max(this.cap * 0.5, this.scale - step);
      this.slowFor = 0;
      return true;
    }
    if (this.fastFor >= 3000 && this.scale < this.cap - 1e-6) {
      this.scale = Math.min(this.cap, this.scale + step);
      this.fastFor = 0;
      return true;
    }
    return false;
  }
}

/** Rolling frame statistics for the overlay and the performance report. */
export class FrameStats {
  private samples: number[] = [];
  private max: number;

  constructor(max = 600) {
    this.max = max;
  }

  push(ms: number): void {
    this.samples.push(ms);
    if (this.samples.length > this.max) this.samples.shift();
  }

  get average(): number {
    if (!this.samples.length) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  percentile(p: number): number {
    if (!this.samples.length) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
  }

  get fps(): number {
    const avg = this.average;
    return avg > 0 ? 1000 / avg : 0;
  }

  reset(): void {
    this.samples = [];
  }
}
