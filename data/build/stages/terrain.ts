// Map and terrain stages of the data build: the simplified elevation, ocean
// mask, lakes and rivers on global grids, and the terrain tiles sampled from
// them (spec milestone 1, sections 4.2, 5.1 and 10.1).

import { KM_PER_DEG } from '../../../app/src/geo/earth.ts';
import {
  encodeTerrainTile,
  OCEAN_MIN_LEVEL,
  OCEAN_NEVER,
  OCEAN_SCALE,
  PART_LEVEL,
} from '../../../app/src/content/formats.ts';
import { chunkKey } from '../../../app/src/content/types.ts';
import { ancestorAt, tilePath, TILE_N, type TileKey } from '../../../app/src/geo/cube.ts';
import { fixtureElevation } from '../lib/fixture.ts';
import { Grid, GridPyramid } from '../lib/grid.ts';
import { placeOffWater } from '../lib/landmarks.ts';
import { openShare, wildMasks } from '../lib/wildlife.ts';
import { WILD_GROUPS } from '../../../app/src/world/wildlife.ts';
import {
  floodInlandSeas,
  oceanConnection,
  validateInlandSeas,
  type InlandSea,
} from '../lib/ocean.ts';
import { readElevation, readFeatures } from '../lib/readers.ts';
import {
  enlargeIslands,
  removeAreas,
  smoothElevation,
  validateRemovedAreas,
  type RemovedArea,
} from '../lib/simplify.ts';
import {
  blendPolar,
  carveStraits,
  smoothLakes,
  smoothOcean,
  coarseOcean,
  coastDistance,
  joinInlandSeas,
  COARSE_MIN_SPACING_KM,
  validateIslands,
  validateStraits,
  type KeptIsland,
  type Strait,
} from '../lib/coast.ts';
import {
  allowPeaksAtCoast,
  famousRelief,
  validateMountains,
  type Mountain,
} from '../lib/relief.ts';
import { allTileKeys, buildTerrainTile, isDeepTile } from '../lib/terrain.ts';
import {
  NO_LAKE,
  rasterizeLakes,
  rasterizeRivers,
  riverFlow,
  riverPicks,
  validateRivers,
  type CuratedRiver,
} from '../lib/water.ts';
import { validateHumidPeriods, type HumidPeriod } from '../lib/climate.ts';
import type { Content } from './content.ts';
import type { BuildContext, WriteContext } from './context.ts';
import type { DrawnGround, DrawnTiles } from '../lib/drawnGround.ts';

/** Simplified map (spec milestone 1, section 4.2). */
const SMOOTHING_KM = 80;
const POLAR_SMOOTHING_KM = 150;
/** Smoothing of the listed mountain ranges, which keep more of their shape. */
const RANGE_SMOOTHING_KM = 25;
const MAX_LAKE_RANK = 4;
/** Grid spacing (degrees) of the smoothed bed under the ice sheets. */
const ICE_BED_SPACING_DEG = 0.5;
const MIN_LAKE_KM2 = 3000;

/** The global grids the terrain, climate and tree stages sample. */
export interface WorldMap {
  /** Ocean connection levels of the unsmoothed elevation (OCEAN_NEVER where never sea). */
  connection: Grid<Uint8Array>;
  /** Smoothed ocean channel (section 5.1). */
  ocean: Grid<Uint16Array>;
  straits: Strait[];
  humidPeriods: HumidPeriod[];
  elevation: Grid;
  /** Elevation with the famous mountains, as a pyramid for the tile spacings. */
  heights: GridPyramid;
  /** The smoothed bed under the ice sheets (m, at least 0). */
  iceBed: (lat: number, lon: number) => number;
  lakeLevel: Grid<Int16Array>;
  lakes: Grid<Uint8Array>;
  rivers: Grid<Uint8Array>;
  flowCos: Grid<Uint8Array>;
  flowSin: Grid<Uint8Array>;
  coast: Grid<Uint8Array>;
}

/** Reads and simplifies the map (sections 4.2 and 5.1). */
export function buildMap(ctx: BuildContext): WorldMap {
  const { log, fail, neFile } = ctx;
  let source: Grid = ctx.fixture
    ? fixtureElevation(readFeatures(neFile('ne_10m_land.geojson')))
    : readElevation(
        ctx
          .sourceFiles('etopo-2022')
          .find((p) => p.endsWith('elevation.json'))!
          .replace(/\.json$/, ''),
      );
  // The map is simplified (section 4.2): the elevation extract is 4
  // arc-minutes; finer grids (the fixture) are averaged down to at most 2.
  while (source.width > 10800) {
    const m = source.downsampleMean();
    source = new Grid(m.width, m.height, Int16Array.from(m.data, Math.round));
  }
  const straits = ctx.curated<{ straits: Strait[] }>('straits.json').straits;
  const keptIslands = ctx.curated<{ islands: KeptIsland[] }>('islands.json').islands;
  const removedAreas = ctx.curated<{ areas: RemovedArea[] }>('removed-areas.json').areas;
  const mountains = ctx.curated<{ mountains: Mountain[] }>('mountains.json').mountains;
  const humidPeriods = ctx.curated<{ periods: HumidPeriod[] }>('humid-periods.json').periods;
  const curatedRivers = ctx.curated<{ rivers: CuratedRiver[] }>('rivers.json').rivers;
  const inlandSeas = ctx.curated<{ seas: InlandSea[] }>('inland-seas.json').seas;
  const mapErrors = [
    ...validateHumidPeriods(humidPeriods),
    ...validateStraits(straits),
    ...validateIslands(keptIslands),
    ...validateRemovedAreas(removedAreas),
    ...validateMountains(mountains),
    ...validateRivers(curatedRivers),
    ...validateInlandSeas(inlandSeas),
  ];
  if (mapErrors.length) fail(mapErrors.join('\n'));

  // Islands are edited on today's coastline before anything else (section 4.2).
  removeAreas(source, removedAreas, keptIslands);
  const islands = enlargeIslands(source, keptIslands);
  // The ocean mask floods the unsmoothed elevation with the straits carved to
  // their sills, then smooths the result into the coast (section 5.1).
  const conn = new Grid(source.width, source.height, Int16Array.from(source.data));
  carveStraits(conn, straits);
  const parents = new Int32Array(conn.width * conn.height);
  const connection = new Grid(conn.width, conn.height, oceanConnection(conn, parents));
  const ocean = new Grid(conn.width, conn.height, smoothOcean(connection, straits, keptIslands));
  log(`ocean mask grid ${conn.width} × ${conn.height}, ${straits.length} straits`);

  // Ground below sea level that is never drawn as sea is raised to sea level
  // before smoothing, so it never shows as a steep, jagged pit: dry land that
  // never joins the ocean (such as the Jordan rift with the Dead Sea, or the
  // Qattara Depression), and the ends of narrow gulfs that the smoothed coast
  // closes even today (such as the head of the Gulf of Suez) (section 4.2).
  const landSource = new Grid(source.width, source.height, Int16Array.from(source.data));
  for (let i = 0; i < landSource.data.length; i++) {
    const neverSea =
      connection.data[i] === OCEAN_NEVER || OCEAN_MIN_LEVEL + ocean.data[i]! / OCEAN_SCALE > 0;
    if (neverSea && landSource.data[i]! < 0) landSource.data[i] = 0;
  }
  const elevation = blendPolar(
    smoothElevation(landSource, SMOOTHING_KM),
    smoothElevation(landSource, POLAR_SMOOTHING_KM),
  );
  // The listed mountain ranges and peaks keep their shape (section 4.2).
  const relief = famousRelief(
    elevation,
    smoothElevation(landSource, RANGE_SMOOTHING_KM),
    mountains,
  );
  log(
    `elevation grid ${elevation.width} × ${elevation.height}, smoothed ${SMOOTHING_KM} km, ` +
      `${mountains.length} famous mountains, ` +
      `${islands.removed} small islands removed, ${islands.grown} enlarged`,
  );
  const heights = new GridPyramid(relief);
  // The ice sheets stand on a heavily smoothed bed, the same in the terrain
  // tiles and in the ice thickness, so their surface is smooth (section 5.2).
  // It leaves out the listed mountains, so their snow caps (section 5.2) stand
  // out from it.
  const bedGrid = new GridPyramid(elevation).forSpacing(ICE_BED_SPACING_DEG);
  const iceBed = (lat: number, lon: number) => Math.max(0, bedGrid.bilinear(lat, lon));

  const lakeLevel = new Grid(
    conn.width,
    conn.height,
    new Int16Array(conn.width * conn.height).fill(NO_LAKE),
  );
  const lakeCount = rasterizeLakes(
    conn,
    readFeatures(neFile('ne_10m_lakes.geojson')),
    lakeLevel.data,
    MAX_LAKE_RANK,
    MIN_LAKE_KM2,
  );
  floodInlandSeas(conn, inlandSeas, (i, level) => (lakeLevel.data[i] = level));
  const lakes = new Grid(conn.width, conn.height, smoothLakes(lakeLevel, NO_LAKE));
  joinInlandSeas(ocean.data, connection, lakes.data);
  const coast = new Grid(conn.width, conn.height, coastDistance(ocean));
  allowPeaksAtCoast(coast, mountains);
  const rivers = new Grid(conn.width, conn.height, new Uint8Array(conn.width * conn.height));
  const riverContext = {
    ocean: connection.data,
    parents,
    heights: elevation.data,
    lakes: lakes.data,
  };
  const riverCount = rasterizeRivers(
    conn,
    readFeatures(neFile('ne_10m_rivers_lake_centerlines.geojson')),
    rivers.data,
    riverPicks(curatedRivers),
    riverContext,
  );
  const flow = riverFlow(conn, rivers.data, riverContext);
  log(`${lakeCount} lakes, ${riverCount} river lines`);
  return {
    connection,
    ocean,
    straits,
    humidPeriods,
    elevation,
    heights,
    iceBed,
    lakeLevel,
    lakes,
    rivers,
    flowCos: new Grid(conn.width, conn.height, flow.cos),
    flowSin: new Grid(conn.width, conn.height, flow.sin),
    coast,
  };
}

/**
 * Moves landmarks onto dry land beside the drawn rivers (giza.md section 2).
 * The sea is where the ocean reaches at today's level, so dry depressions such
 * as Qattara count as land. Changes the landmarks in place.
 */
export function placeLandmarks(ctx: BuildContext, map: WorldMap, landmarks: Content['landmarks']) {
  const { connection, lakes, rivers } = map;
  const wet = (lat: number, lon: number) =>
    rivers.bilinear(lat, lon) > 127 ||
    lakes.bilinear(lat, lon) > 127 ||
    connection.nearest(lat, lon) <= -OCEAN_MIN_LEVEL;
  for (const l of landmarks)
    ctx.log(`landmark ${l.structure.id} moved ${placeOffWater(l, wet)} km west off the water`);
}

/**
 * The ground mask of every wildlife group, in the order of wildlife.json:
 * open lowland, or open sea for sea animals (wildlife.md section 4).
 */
export function buildWildlifeMasks(ctx: BuildContext, map: WorldMap, drawn: DrawnGround): string[] {
  const { connection, lakes, heights } = map;
  const relief = heights.levels[0]!;
  // Water in the source grids or as the globe draws it, whichever reaches
  // further, so no animal stands where the drawn shore lies (section 4).
  const lake = (lat: number, lon: number) => lakes.bilinear(lat, lon) > 127 || drawn.lake(lat, lon);
  const masks = wildMasks(WILD_GROUPS, {
    height: (lat, lon) => relief.bilinear(lat, lon),
    wet: (lat, lon) =>
      lake(lat, lon) || connection.nearest(lat, lon) <= -OCEAN_MIN_LEVEL || drawn.sea(lat, lon, 0),
    lake,
  });
  WILD_GROUPS.forEach((g, i) =>
    ctx.log(
      `wildlife ${g.species} at ${g.home}: ${Math.round(openShare(g, masks[i]!) * 100)}% open`,
    ),
  );
  return masks;
}

/** A layer's chunks before its part files are written (section 10.1). */
export interface LayerOut {
  chunks: Record<string, string>;
  parts: Map<string, { chunks: Record<string, string>; deep: string[] }>;
  deep: string[];
}

function place(layer: LayerOut, key: TileKey): { chunks: Record<string, string>; deep: string[] } {
  if (key.level < PART_LEVEL) return layer;
  const part = tilePath(ancestorAt(key, PART_LEVEL));
  let p = layer.parts.get(part);
  if (!p) layer.parts.set(part, (p = { chunks: {}, deep: [] }));
  return p;
}

/** Writes the terrain tiles of every level up to the context's maximum. */
/** Writes the terrain tiles, handing the finest to `drawn` for the checks of the later stages. */
export function buildTerrain(ctx: WriteContext, map: WorldMap, drawn?: DrawnTiles): LayerOut {
  const { log, output, maxLevel } = ctx;
  const { ocean } = map;
  // Coarse levels sample a coast prefiltered for their spacing (section 4.2).
  const coarse = new Map<number, Grid<Uint16Array>>();
  for (let level = 0; level <= maxLevel; level++) {
    const spacingKm = ((90 / (1 << level)) * KM_PER_DEG) / TILE_N;
    if (spacingKm < COARSE_MIN_SPACING_KM) break;
    coarse.set(
      level,
      new Grid(ocean.width, ocean.height, coarseOcean(ocean, spacingKm, map.straits)),
    );
  }
  log(`coarse coasts for levels 0..${coarse.size - 1}`);

  const terrain: LayerOut = { chunks: {}, parts: new Map(), deep: [] };
  let tileCount = 0;
  for (const key of allTileKeys(maxLevel)) {
    const tile = buildTerrainTile(key, {
      heights: map.heights,
      ocean,
      coarseOcean: coarse,
      lakeLevel: map.lakeLevel,
      lakes: map.lakes,
      rivers: map.rivers,
      flowCos: map.flowCos,
      flowSin: map.flowSin,
      bed: map.iceBed,
      coast: map.coast,
    });
    const target = place(terrain, key);
    const path = tilePath(key);
    const deep = isDeepTile(tile);
    drawn?.add(tile, deep);
    if (deep) target.deep.push(path);
    else
      target.chunks[chunkKey(path, 'all', 'xx')] = output.write(
        `terrain/${path}`,
        'bin',
        encodeTerrainTile(tile),
      );
    if (++tileCount % 4000 === 0) log(`${tileCount} terrain tiles`);
  }
  log(`${tileCount} terrain tiles`);
  return terrain;
}
