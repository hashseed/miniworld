import type { Vec3 } from '../geo/cube.ts';

export interface SurfaceSource {
  /** Drawn surface height in km over a drawn direction. */
  surfaceKm(dir: Vec3): number;
  /** Changes when the ground a height was read from may have changed (tiles arriving, the ice moving). */
  version?(): number;
  /** Where a true direction is drawn, through the history lens (history-lens.md section 4). */
  toDrawn(dir: Vec3): Vec3;
  /** Drawn km per true km at a true direction; 1 where absent. */
  widthAt?(dir: Vec3): number;
  /** The drawn height of the sea of the day, in km; the caves' cuts never go below it. */
  seaKm?(): number;
}
