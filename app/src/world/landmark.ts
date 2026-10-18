// Landmarks by date (spec milestone 2, section 8, and giza.md section 11): which
// model each part of a landmark shows on a day, and how far a part under
// construction has risen. Pure functions of the compiled record and the day.

/** People and everything they make are drawn 90 times life size (milestone 2, section 5.1). */
export const MINIATURE = 90;

export interface CompiledStage {
  fromDay: number;
  asset: string;
}

export interface CompiledBuild {
  fromDay: number;
  toDay: number;
  vignette: string;
}

export interface CompiledPart {
  name: string;
  /** Offset from the landmark's point in whole centimetres, east and north. */
  east: number;
  north: number;
  stages: CompiledStage[];
  build?: CompiledBuild;
}

/** The structure file of a landmark record. */
export interface CompiledLandmark {
  id: string;
  fromDay: number;
  toDay: number;
  icon: string;
  beacon: boolean;
  /** The true point in whole microdegrees, for flying to the landmark. */
  lat: number;
  lon: number;
  /** Where the group is drawn, moved off rivers, lakes and sea (giza.md section 2). */
  drawnLat: number;
  drawnLon: number;
  /**
   * The fixed drawn size (giza.md section 11.2): drawn kilometres per
   * life-size metre across the ground and upwards, and the share of the true
   * distances at which the parts stand from the landmark's point.
   */
  kmPerM: number;
  upKmPerM: number;
  spacing: number;
  parts: CompiledPart[];
}

export interface PartState {
  asset: string;
  /** Share of the build done, 0 to 1, while the part is being built; undefined once built. */
  rise?: number;
}

/** What a part shows on a day, or undefined before it exists. */
export function partAt(part: CompiledPart, day: number): PartState | undefined {
  let stage: CompiledStage | undefined;
  for (const s of part.stages) if (s.fromDay <= day) stage = s;
  if (!stage) return undefined;
  const b = part.build;
  if (b && day >= b.fromDay && day < b.toDay && stage === part.stages[0])
    return { asset: stage.asset, rise: (day - b.fromDay) / (b.toDay - b.fromDay) };
  return { asset: stage.asset };
}
