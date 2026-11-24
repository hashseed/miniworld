import type { Vec3 } from '../geo/cube.ts';

export interface SurfaceSource {
  /** Drawn surface height in km over a drawn direction. */
  surfaceKm(dir: Vec3): number;
  /** Changes when the ground a height was read from may have changed (tiles arriving, the ice moving). */
  version?(): number;
  /** Where a true direction is drawn, through the history lens (history-lens.md section 4). */
  toDrawn(dir: Vec3): Vec3;
  /** The true direction of a drawn direction, through the inverse lens; the drawn one where absent. */
  toTrue?(dir: Vec3): Vec3;
  /** Drawn km per true km at a true direction; 1 where absent. */
  widthAt?(dir: Vec3): number;
  /** Whether open unfrozen water (sea or lake) covers a drawn direction, or undefined before terrain loads. */
  isWater?(dir: Vec3): boolean | undefined;
  /** The drawn height of the sea of the day, in km; the caves' cuts never go below it. */
  seaKm?(): number;
}
