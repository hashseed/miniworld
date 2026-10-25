// The schemas of the curated tables (spec content-format.md section 1.1):
// every JSON file directly under data/curated has one here, keyed by its file
// name. The data build validates each table against its schema before any
// stage reads it, and the build and the app take the tables' types from these
// schemas, so a change to a table's format shows up as a type error wherever
// it is used.

import { z } from 'zod';
import { PROFILES } from '../../app/src/world/cultures.ts';
import { NEOLITHIC_ROLES, NEOLITHIC_TOOLS } from '../../app/src/world/neolithicProfiles.ts';

/** A stable lowercase slug: letters, digits and single hyphens. */
export const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase slug');
/** Text the viewer reads, in one language. */
const text = z.string().trim().min(1);
/** A free-text citation; content-format.md section 1.1 moves these to refs into sources.yaml. */
const citation = z.string().trim().min(1);
/** What a table is for; every table opens with one. */
const description = z.string().trim().min(1);
/** A year BCE as a positive number (CE years are negative). */
const bce = z.number().int();

export const lat = z.number().min(-90).max(90);
export const lon = z.number().min(-180).max(180);
/** A point written [lon, lat]. */
const lonLat = z.tuple([lon, lat]);
/** A point written [lat, lon]. */
const latLon = z.tuple([lat, lon]);
/** A box written [west, south, east, north] in degrees. */
const wsen = z
  .tuple([lon, lat, lon, lat])
  .refine(([w, s, e, n]) => w < e && s < n, 'needs west < east and south < north');
/** A box written { lat: [south, north], lon: [west, east] }. */
const latLonBox = z.strictObject({
  lat: z.tuple([lat, lat]).refine(([s, n]) => s < n, 'needs south < north'),
  lon: z.tuple([lon, lon]).refine(([w, e]) => w < e, 'needs west < east'),
});

/** Localised names in every supported language. */
const named = { en: text, de: text };

/** Ids are unique within a list. */
const uniqueIds = <T extends { id: string }>(rows: T[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    if (seen.has(r.id))
      ctx.addIssue({ code: 'custom', message: `duplicate id ${r.id}`, path: [i, 'id'] });
    seen.add(r.id);
  });
};
const list = <T extends z.ZodType<{ id: string }>>(row: T) => z.array(row).superRefine(uniqueIds);

// --- Release and lens -------------------------------------------------------

export const releaseTable = z.strictObject({
  description,
  version: z.string().min(1),
  cutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
});

export const lensTable = z.strictObject({
  description,
  approvedVersion: z.string().regex(/^[0-9a-f]{12}$/, 'must be 12 hex digits'),
});

export const lensBoostsTable = z.strictObject({
  description,
  boosts: list(
    z.strictObject({
      id,
      reason: text,
      weight: z.number().int().positive(),
      points: z.array(latLon).min(1),
    }),
  ),
});

// --- The land and its climate (milestone-1 section 10) -----------------------

export const straitsTable = z.strictObject({
  description,
  straits: list(
    z.strictObject({
      id,
      name: text,
      source: citation,
      /** Depth of the shallowest point on the deepest way through, in metres (negative). */
      sill: z.number().negative(),
      /** [lon, lat] points from one sea to the other. */
      line: z.array(lonLat).min(2),
      /** Half-width of the always-open core in km, for narrow seas wider than a strait. */
      coreKm: z.number().positive().max(60).optional(),
    }),
  ),
});

export const islandsTable = z.strictObject({
  description,
  islands: list(z.strictObject({ id, name: text, reason: text, source: citation, lat, lon })),
});

export const removedAreasTable = z.strictObject({
  description,
  areas: list(
    z.strictObject({
      id,
      name: text,
      reason: text,
      /** [lon, lat] points. */
      polygon: z.array(lonLat).min(3),
    }),
  ),
});

export const mountainsTable = z.strictObject({
  description,
  mountains: list(
    z.strictObject({
      id,
      name: text,
      reason: text,
      source: citation,
      kind: z.enum(['range', 'peak']),
      /** [lon, lat] points along the crest, or the one point of a peak. */
      line: z.array(lonLat).min(1),
      widthKm: z.number().positive(),
      heightM: z.number().positive().optional(),
    }),
  ),
});

export const humidPeriodsTable = z.strictObject({
  description,
  periods: list(
    z.strictObject({
      id,
      name: text,
      region: z.strictObject({ west: lon, south: lat, east: lon, north: lat }),
      featherDegrees: z.number().nonnegative(),
      /** [latitude, minimum precipitation in mm], ascending latitude. */
      profile: z.array(z.tuple([z.number(), z.number()])).min(1),
      /** [years BP, strength 0..1], descending years. */
      strength: z.array(z.tuple([z.number(), z.number().min(0).max(1)])).min(1),
      sources: z.array(citation).min(1),
    }),
  ),
});

export const riversTable = z.strictObject({
  description,
  rivers: list(
    z.strictObject({
      id,
      names: z.array(text).min(1),
      box: wsen.optional(),
      /** [lon, lat] where the river starts. */
      source: lonLat.optional(),
    }),
  ),
});

export const inlandSeasTable = z.strictObject({
  description,
  seas: list(
    z.strictObject({
      id,
      lat,
      lon,
      level: z.number(),
      box: wsen,
    }),
  ),
});

// --- Peopling and the tree of humankind --------------------------------------

/** A [lon, lat] ring of a culture area. */
const ring = z.array(lonLat).min(3);

export const cultureAreasTable = z.strictObject({
  description,
  areas: z.array(
    z.strictObject({
      culture: id,
      density: z.enum(['remote', 'sparse', 'low', 'medium']),
      coldestC: z.number().optional(),
      highestM: z.number().positive().optional(),
      spacingKm: z.number().positive().optional(),
      /** [year BCE, count] pairs, each from its year on. */
      maxBands: z.array(z.tuple([bce, z.number().int().nonnegative()])).optional(),
      siteStepKm: z.number().positive().optional(),
      snapshots: z
        .array(z.strictObject({ fromBP: z.number().int(), label: text, source: citation, ring }))
        .min(1),
    }),
  ),
});

export const arrivalsTable = z.strictObject({
  description,
  points: list(
    z.strictObject({
      id,
      bce,
      lat,
      lon,
      ...named,
      source: citation,
      debated: z.boolean().optional(),
      passage: z.boolean().optional(),
      continent: text.optional(),
      apart: z.array(id).optional(),
    }),
  ),
  routes: list(z.strictObject({ id, ...named, from: id, points: z.array(id).min(1) })),
});

export const crossingsTable = z.strictObject({
  description,
  crossings: list(
    z.strictObject({
      id,
      ...named,
      bce,
      widthKm: z.number().positive(),
      /** [lat, lon] points along the way. */
      way: z.array(latLon).min(2),
      source: citation,
    }),
  ),
});

export const neolithicTable = z.strictObject({
  description,
  thresholds: list(
    z.strictObject({
      id,
      bce,
      lat,
      lon,
      ...named,
      /** The title of its first-farming event in the events dialog. */
      title: z.strictObject(named),
      source: citation,
      debated: z.boolean().optional(),
    }),
  ),
});

export const keyPlacesTable = z.strictObject({
  description,
  places: list(z.strictObject({ id, ...named, lat, lon, source: citation })),
});

/** Excavated Neolithic villages where few later cities stood (neolithic/villages.md section 2). */
export const villageSitesTable = z.strictObject({
  description,
  sites: list(z.strictObject({ id, ...named, lat, lon, bce, source: citation })),
});

/** The scene kinds an anchor can stage (humankind.md section 8.2). */
export const SCENE_KINDS = ['cave-painting', 'burial', 'monument', 'bone-hut'] as const;

export const anchorsTable = z.strictObject({
  description,
  anchors: list(
    z
      .strictObject({
        id,
        bce,
        until: bce.optional(),
        lat,
        lon,
        camp: z.strictObject({ lat, lon }).optional(),
        scene: z.strictObject({ kind: z.enum(SCENE_KINDS), prop: id }).optional(),
        ...named,
        source: citation,
      })
      .refine((a) => a.until === undefined || a.until <= a.bce, {
        message: 'until must not be before bce',
        path: ['until'],
      }),
  ),
});

export const encountersTable = z.strictObject({
  description,
  encounters: list(
    z
      .strictObject({
        id,
        kind: z.enum(['visit', 'gathering', 'trade', 'battle']),
        bce,
        every: z.number().positive().optional(),
        until: bce.optional(),
        stay: z.number().positive().optional(),
        lat,
        lon,
        host: id.optional(),
        roles: list(
          z.strictObject({
            id,
            lat,
            lon,
            km: z.number().positive(),
            people: z.number().int().min(2).max(8),
          }),
        ).min(1),
        ...named,
        source: citation,
      })
      .refine((e) => (e.every === undefined) === (e.until === undefined), {
        message: 'every and until come together',
        path: ['every'],
      }),
  ),
});

// --- Culture profiles (neolithic/people-profiles.md section 4) --------------

const role = z.number().int().min(0).max(100);
const tool = z.enum(NEOLITHIC_TOOLS);

export const culturesTable = z.strictObject({
  description,
  cultures: list(
    z
      .strictObject({
        id: z.enum(PROFILES),
        /** The asset id of the profile's camp lodging. */
        lodging: id.optional(),
        /** Asset ids of the animals it hunts; the founder's people's prey where absent. */
        hunts: z.array(id).min(1).optional(),
        en: text.optional(),
        de: text.optional(),
        farming: z
          .strictObject({
            /** Region ids of farming.json whose onset starts the profile. */
            regions: z.array(id).min(1),
            /** Interim boxes [south, north, west, east]; where boxes overlap, the lower areaRank wins. */
            areas: z
              .array(
                z
                  .tuple([lat, lat, lon, lon])
                  .refine(([s, n, w, e]) => s < n && w < e, 'needs south < north and west < east'),
              )
              .min(1),
            areaRank: z.number().int().positive(),
            /** Shelter asset ids. */
            architecture: z.array(id).min(1),
            tools: z.strictObject({ man: tool, woman: tool, child: tool }),
            fieldTool: z.enum(['hoe', 'digging-stick']),
            /** From this year BCE the field tool is the ard. */
            ardFromBce: bce.optional(),
            /** How its village is laid out (neolithic/villages.md section 5). */
            layout: z.enum(['rows', 'cluster', 'hamlet', 'pits', 'stilts']),
            /** The longest a house is drawn, in figure metres, where not the usual 2.7. */
            houseM: z.number().positive().max(12).optional(),
            /** How many people one house holds, where a whole village lives in one (the longhouse). */
            houseCapacity: z.number().int().positive().optional(),
            /** Percent of the grown-ups in each role, in the order of NEOLITHIC_ROLES. */
            mix: z
              .strictObject(
                Object.fromEntries(NEOLITHIC_ROLES.map((r) => [r, role])) as {
                  [R in (typeof NEOLITHIC_ROLES)[number]]: typeof role;
                },
              )
              .refine(
                (m) => Object.values(m).reduce((a, b) => a + b, 0) === 100,
                'the shares must sum to 100',
              ),
            /** Asset ids of the herd animals. */
            herd: z.array(id).min(1),
            /** Crop ids; each is drawn by the asset crop-<id>. */
            crops: z.array(id).min(1),
          })
          .optional(),
      })
      .refine((c) => (c.en === undefined) === (c.de === undefined), {
        message: 'labels come in both languages or neither',
        path: ['de'],
      })
      .refine((c) => !c.farming || c.en !== undefined, {
        message: 'a farming profile needs its labels',
        path: ['en'],
      }),
  )
    .refine((rows) => {
      const ranks = rows.flatMap((r) => (r.farming ? [r.farming.areaRank] : []));
      return new Set(ranks).size === ranks.length;
    }, 'every farming profile needs an areaRank of its own')
    .refine(
      (rows) => PROFILES.every((p) => rows.some((r) => r.id === p)),
      `every profile of app/src/world/cultures.ts needs a row: ${PROFILES.join(', ')}`,
    ),
});

// --- Farming (neolithic/farming-spread.md) -----------------------------------

const approximateValue = <T extends z.ZodType>(value: T) =>
  z.strictObject({ value, approximate: z.boolean(), note: text, source: citation });

export const farmingTable = z.strictObject({
  description,
  speeds: z.strictObject({
    seaMaxHopKm: approximateValue(z.number().positive()),
    zones: list(
      z.strictObject({
        id,
        kmPerYear: z.number().positive(),
        range: z.tuple([z.number().positive(), z.number().positive()]),
        box: latLonBox.optional(),
        source: citation,
        approximate: z.boolean().optional(),
        coastal: z.boolean().optional(),
        sea: z.boolean().optional(),
        note: text.optional(),
      }),
    ),
    default: z.strictObject({
      kmPerYear: z.number().positive(),
      approximate: z.boolean(),
      note: text,
    }),
  }),
  holds: list(
    z.strictObject({
      id,
      box: latLonBox,
      notBeforeBce: bce,
      source: citation,
      approximate: z.boolean().optional(),
    }),
  ),
  irrigated: list(z.strictObject({ id, box: latLonBox, source: citation })),
  noFarming: list(z.strictObject({ id, box: latLonBox, source: citation })),
  barriers: list(z.strictObject({ id, box: latLonBox, source: citation })),
  centres: list(
    z.strictObject({
      id,
      package: z.strictObject(named),
      source: citation,
      spreadBce: bce.optional(),
      spreadNote: text.optional(),
    }),
  ),
  waypoints: list(
    z.strictObject({
      id,
      bce,
      lat,
      lon,
      ...named,
      package: z.strictObject(named),
      source: citation,
      approximate: z.boolean().optional(),
      toleranceYears: z.number().nonnegative(),
      herdingOnly: z.boolean().optional(),
    }),
  ),
});

// --- Wildlife (wildlife.md section 4) ----------------------------------------

/** How a model moves and is drawn where it differs from the defaults (wildlife.md sections 4 and 5). */
export const wildModelTraits = z.strictObject({
  /** Walks on open land (the default), flies loops over anything, or swims in the open sea. */
  moves: z.enum(['walk', 'fly', 'swim']).optional(),
  /** How a swimmer rides the sea: leaps in arcs, dives between journeys, or floats. */
  swim: z.enum(['leap', 'dive', 'float']).optional(),
  /** Roaming radius in km, where a group gives none (default 1000). */
  roamKm: z.number().positive().optional(),
  /** Seconds of a round of grazing and walking, before its hashed extra (default 10). */
  roundSeconds: z.number().positive().optional(),
  /** The most of a round a walk may take (default 0.9). */
  walkShare: z.number().positive().max(1).optional(),
  /** The model of a group's other members, such as lionesses in a lion's pride. */
  others: id.optional(),
  /** Drawn size in life-size metres, in place of the rule. */
  drawnM: z.number().positive().optional(),
  /** Share of the rule's drawn size. */
  shrink: z.number().positive().max(1).optional(),
});

export const wildlifeTable = z.strictObject({
  source: citation,
  /** Traits by model id. */
  models: z
    .record(id, wildModelTraits)
    .refine(
      (m) => Object.values(m).every((t) => (t.swim === undefined) === (t.moves !== 'swim')),
      'a swimmer names how it swims, and only a swimmer does',
    ),
  groups: z.array(
    z.strictObject({
      species: id,
      model: id,
      home: text,
      lat,
      lon,
      /** Years shown; a missing end runs from the start or to the end of the timeline. */
      spans: z
        .array(
          z.strictObject({ from: z.number().int().optional(), to: z.number().int().optional() }),
        )
        .optional(),
      /** Number of animals where the default of 2 or 3 does not fit. */
      size: z.number().int().positive().optional(),
      /** Roaming radius in km where the default does not fit. */
      roamKm: z.number().positive().optional(),
      source: citation,
    }),
  ),
});

/** Every curated table by its file name under data/curated. */
export const TABLES = {
  'release.json': releaseTable,
  'lens.json': lensTable,
  'lens-boosts.json': lensBoostsTable,
  'straits.json': straitsTable,
  'islands.json': islandsTable,
  'removed-areas.json': removedAreasTable,
  'mountains.json': mountainsTable,
  'humid-periods.json': humidPeriodsTable,
  'rivers.json': riversTable,
  'inland-seas.json': inlandSeasTable,
  'culture-areas.json': cultureAreasTable,
  'arrivals.json': arrivalsTable,
  'crossings.json': crossingsTable,
  'neolithic.json': neolithicTable,
  'key-places.json': keyPlacesTable,
  'anchors.json': anchorsTable,
  'village-sites.json': villageSitesTable,
  'encounters.json': encountersTable,
  'farming.json': farmingTable,
  'cultures.json': culturesTable,
  'wildlife.json': wildlifeTable,
} as const;

export type TableName = keyof typeof TABLES;
export type Table<N extends TableName> = z.infer<(typeof TABLES)[N]>;

/** Validates a parsed table; returns its errors, each prefixed with the file and path. */
export function tableErrors(name: TableName, value: unknown): string[] {
  const result = TABLES[name].safeParse(value);
  if (result.success) return [];
  return result.error.issues.map(
    (i) => `${name}: ${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}`,
  );
}
