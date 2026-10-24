// What the tree scene gives the renderer (spec humankind.md section 8): the chunk it reads and
// the poses of figures, lodgings, prey, props and clearings it returns. The scene's contract.

import type { Day } from '../../time/calendar.ts';
import type { Field } from '../fieldShapes.ts';
import type { TreeFigure, TreeLodging, TreeStage } from '../tree.ts';
import type { PreyKind } from './hunt.ts';

/** One time window's share of the tree (section 8). */
export interface TreeChunk {
  fromDay: Day;
  toDay: Day;
  figures: TreeFigure[];
  lodgings: TreeLodging[];
  /** Scenes at anchors standing in the chunk's time (humankind.md section 8.2). */
  stages?: TreeStage[];
}

export type FigureLook = 'founder' | 'woman' | 'man' | 'child';

export type TreeClip =
  | 'idle'
  | 'work'
  // At a cave painting; falling ill and dying before a burial (section 8.2).
  | 'paint'
  | 'ill'
  | 'lie'
  | 'sit'
  // Telling a story by the fire (section 8.1).
  | 'point'
  | 'knap'
  | 'walk'
  | 'run'
  | 'carry'
  | 'throw'
  | 'shoot'
  | 'pole'
  | 'bearBehind'
  | 'bearAhead'
  | 'strike'
  | 'crouch'
  | 'dance'
  | 'scrape'
  | 'crack'
  | 'paddle'
  // The Neolithic village's work (section 8.5).
  | 'till'
  | 'sow'
  | 'reap'
  | 'thresh'
  | 'grind'
  | 'milk'
  | 'shape'
  | 'spin';

/** A point of the scene: a place on the globe, and an offset there in layout metres east and north. */
export interface Placed {
  lat: number;
  lon: number;
  x: number;
  z: number;
  /** Facing, east and north. */
  dirX: number;
  dirZ: number;
  /**
   * The same spot in another place's frame, and how far to trust it, 0 to 1: a visitor on its
   * way to a monument is drawn between where its own camp's frame puts it and where the host's
   * frame puts it, so its place at the monument is the host's own and never an estimate of the
   * distance between two camps (humankind.md section 8.2).
   */
  anchor?: { lat: number; lon: number; x: number; z: number; mix: number };
}

export interface FigurePose extends Placed {
  id: number;
  look: FigureLook;
  clip: TreeClip;
  clipMs: number;
  /** The clip being eased out of, while a change is under way. */
  from?: { clip: TreeClip; clipMs: number; weight: number };
  /** The hand is empty: the figure's spear is in the air, in the prey or in the grass. */
  unarmed?: boolean;
  /** The tool its hand holds at the field or the work spot instead of the culture's own (section 8.5). */
  tool?: string;
  /** Inside its hut, out of sight (section 8.1). */
  hidden?: boolean;
  /** The culture whose clothes it wears (peopling.md section 5.3); the founder's when not given. */
  profile?: string;
  /** A dead's soul (section 8.2): how far it shows, 0 to 1, and how high it floats, in life-size metres. */
  soul?: { fade: number; height: number };
  /** Held up off the ground by its bearers, in life-size metres (a dead carried to its grave). */
  lift?: number;
}

export type PreyClip = 'idle' | 'walk' | 'run' | 'fall' | 'bound' | 'hung' | 'struggle' | 'graze';

/** An animal of a hunt: it grazes, flees when the hunter runs at it, falls and is butchered. */
export interface PreyPose extends Placed {
  /** The hunter's id and the turn of the hunt, unique while it is shown. */
  id: string;
  kind: PreyKind;
  clip: PreyClip;
  clipMs: number;
  /** 0 to 1, fading in and out. */
  visibility: number;
  /** Drawn at this share of life size (the village herd, section 8.5); 1 when left out. */
  scale?: number;
}

export interface LodgingPose extends Placed {
  id: number;
  kind: string;
  /** 0 to 1: how far it is put up, while the band builds it or takes it down. */
  built: number;
  /** The share of the full camp's ring its camp's ring is: a lodging is at most that share of LODGING_MAX_M across (section 8.5), so five never touch. */
  room?: number;
}

/** A field of a Neolithic camp (section 8.5): its outline in layout metres off the camp's place, and how far its crop has grown. */
export interface FieldPose {
  /** Unique while shown: the camp and the field. */
  id: string;
  lat: number;
  lon: number;
  field: Field;
  /** The crop's stage, 0 to 1 (fieldStage). */
  stage: number;
}

export interface HearthPose {
  camp: number;
  lat: number;
  lon: number;
  /** 0 before the fire is lit at a new camp, rising to 1 as it catches (section 8.1). */
  lit: number;
}

/** A spark from the flint stones of a fire being lit: layout point, height in life-size metres, 0 to 1 of its life. */
export interface SparkPose {
  lat: number;
  lon: number;
  x: number;
  z: number;
  height: number;
  life: number;
}

/** A prop of camp life at a layout point: a drying rack beside a lodging, a spit over the fire. */
export interface CampPropPose extends Placed {
  id: string;
  /** A drying rack, the spit, a canoe, or a scene's wall or grave (section 8.2). */
  kind: string;
  /** 0 to 1: how far a scene's prop has grown in, painted or filled. */
  built?: number;
  /** A share of its full size, for a scene's prop at a smaller camp. */
  scale?: number;
  /** Whether a cave's torch is lit. */
  lit?: boolean;
  /** 0 to 1: how far a scene's hill or heap of earth has risen out of the ground. */
  rise?: number;
  /** 0 to 1: how far a cave's painting shows, fading before the cave sinks back. */
  paint?: number;
  /** 0 to 1: how far a prop has faded, 1 drawn in full: the dead's skull. */
  fade?: number;
  /** Height above the ground in life-size metres: the dead's skull rising. */
  height?: number;
}

/** Where the trees make way for a camp: 1 cleared, 0 grown back. */
export interface ClearingPose {
  lat: number;
  lon: number;
  amount: number;
  /** True while the trees are being felled, false while they grow back. */
  felling: boolean;
  /** Off the hearth in layout metres, and the radius in drawn kilometres, for a hunt's ground. */
  x?: number;
  z?: number;
  km?: number;
}

/** A hunter's spear away from his hand: its middle, height above the ground in life-size metres, and pitch. */
export interface SpearPose extends Placed {
  id: string;
  /** An arrow in a bow hunt, or the bow itself in the archer's hand (humankind.md section 8.1); a spear without it. */
  kind?: 'arrow' | 'bow';
  height: number;
  /** Rise per unit along (dirX, dirZ), tip first; negative points down. */
  slope: number;
}

/** The carrying pole of a hunt: its middle, and its height above the ground in life-size metres. */
export interface PolePose extends Placed {
  id: string;
  height: number;
}

export interface TreeScene {
  figures: FigurePose[];
  prey: PreyPose[];
  spears: SpearPose[];
  poles: PolePose[];
  sparks: SparkPose[];
  props: CampPropPose[];
  fields: FieldPose[];
  lodgings: LodgingPose[];
  hearths: HearthPose[];
  clearings: ClearingPose[];
}
