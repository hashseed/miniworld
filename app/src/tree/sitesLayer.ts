// Development view of the camp sites (spec sites.md, section 7): with `?sites` in the
// address, every site of the tree of humankind is a dot, coloured by its layout and by
// whether a camp could stand there at the sea level of the clock, and every link a faint
// line, bright while it can be walked.

import * as THREE from 'three';
import type { ContentLoader } from '../content/loader.ts';
import { latLonToDir } from '../geo/cube.ts';
import { EARTH_RADIUS_KM } from '../geo/earth.ts';
import type { SurfaceSource } from '../vignettes/vignetteLayer.ts';

/** The file the data build writes: sites as [lat, lon, kind, core, place level] (×1e4 degrees, metres), links as [a, b, level]. */
export interface SitesFile {
  sites: [number, number, number, number, number][];
  links: [number, number, number][];
}

/** Site kinds in the file. */
const FULL = 0;
const COMPACT = 1;
const MINIMAL = 2;
const WAYPOINT = 3;

/** Colours: usable full, compact and minimal sites, waypoints, and sites under water now. */
const COLOURS: Record<number, THREE.Color> = {
  [FULL]: new THREE.Color(0x3ddc5a),
  [COMPACT]: new THREE.Color(0xffd23a),
  [MINIMAL]: new THREE.Color(0xff7a2e),
  [WAYPOINT]: new THREE.Color(0xd8d8ff),
};
const WET = new THREE.Color(0x3a4a6a);
const LINK_OPEN = new THREE.Color(0x9fd8ff);
const LINK_SHUT = new THREE.Color(0x24344a);
/** Dots and lines float this far over the drawn ground, in km. */
const LIFT_KM = 25;

export class SitesLayer {
  readonly group = new THREE.Group();
  private data: SitesFile | undefined;
  private points: THREE.Points | undefined;
  private lines: THREE.LineSegments | undefined;
  private spots: THREE.Vector3[] = [];
  private facing = new THREE.Vector3();

  private surface: SurfaceSource;
  /** Where a fixed point is drawn: when the lens arrives or changes, the dots move with the land. */
  private probe = '';

  constructor(loader: ContentLoader, surface: SurfaceSource, file: string) {
    this.surface = surface;
    void loader.json<SitesFile>(file).then((data) => {
      this.data = data;
      const spots = this.spotsOf(data);
      const dots = new THREE.BufferGeometry().setFromPoints(spots);
      dots.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(new Float32Array(spots.length * 4), 4),
      );
      this.points = new THREE.Points(
        dots,
        new THREE.PointsMaterial({
          size: 6,
          sizeAttenuation: false,
          vertexColors: true,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      );
      const ends = data.links.flatMap(([a, b]) => [spots[a]!, spots[b]!]);
      const segs = new THREE.BufferGeometry().setFromPoints(ends);
      segs.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(new Float32Array(ends.length * 4), 4),
      );
      this.lines = new THREE.LineSegments(
        segs,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.45,
          depthTest: false,
          depthWrite: false,
        }),
      );
      // Drawn over everything, only the half of the globe facing the camera (update).
      this.points.renderOrder = 10;
      this.lines.renderOrder = 9;
      this.group.add(this.lines, this.points);
      this.spots = spots;
    });
  }

  /** The drawn place of every site, through the history lens as it is now. */
  private spotsOf(data: SitesFile): THREE.Vector3[] {
    const { surface } = this;
    return data.sites.map(([lat, lon]) => {
      const dir = surface.toDrawn(latLonToDir(lat / 1e4, lon / 1e4));
      const v = new THREE.Vector3(...dir).normalize();
      return v.multiplyScalar(EARTH_RADIUS_KM + surface.surfaceKm([v.x, v.y, v.z]) + LIFT_KM);
    });
  }

  /** Moves the dots and lines to where the land is drawn now, once the lens has changed. */
  private follow(data: SitesFile, points: THREE.Points, lines: THREE.LineSegments): void {
    const probe = this.surface
      .toDrawn([0.6, 0.5, 0.624])
      .map((v) => v.toFixed(5))
      .join(',');
    if (probe === this.probe) return;
    this.probe = probe;
    this.spots = this.spotsOf(data);
    points.geometry.setFromPoints(this.spots);
    lines.geometry.setFromPoints(data.links.flatMap(([a, b]) => [this.spots[a]!, this.spots[b]!]));
  }

  /**
   * Colours the sites and links for the sea level of the clock, and hides those on the far
   * side of the globe, since they are drawn over everything.
   */
  update(seaLevel: number, camera: THREE.Camera): void {
    const { data, points, lines } = this;
    if (!data || !points || !lines) return;
    this.follow(data, points, lines);
    const facing = this.facing.copy(camera.position).normalize();
    const horizon = EARTH_RADIUS_KM / camera.position.length();
    const seen = (i: number) =>
      this.spots[i]!.dot(facing) / this.spots[i]!.length() > horizon ? 1 : 0;
    const dots = points.geometry.getAttribute('color') as THREE.BufferAttribute;
    data.sites.forEach(([, , kind, core, place], i) => {
      const c = kind === WAYPOINT || (core > seaLevel && place > seaLevel) ? COLOURS[kind]! : WET;
      dots.setXYZW(i, c.r, c.g, c.b, seen(i));
    });
    dots.needsUpdate = true;
    const segs = lines.geometry.getAttribute('color') as THREE.BufferAttribute;
    data.links.forEach(([a, b, level], i) => {
      const c = level > seaLevel ? LINK_OPEN : LINK_SHUT;
      const alpha = seen(a) * seen(b);
      segs.setXYZW(2 * i, c.r, c.g, c.b, alpha);
      segs.setXYZW(2 * i + 1, c.r, c.g, c.b, alpha);
    });
    segs.needsUpdate = true;
  }
}
