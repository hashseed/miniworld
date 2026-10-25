// Models per culture (spec section 10, "Models per culture"): the modules of the models that load
// with their culture (assets/src/cultureModels.ts) are separate files of the app, loaded when a
// culture or lodging that names one of their models is near the camera and the clock. Until then
// the model is drawn as it would be unapproved. Only what is drawn waits; the world never does.

import manifest from '../../../data/assets/manifest.json';
import type { AssetManifest } from '../../../data/schema/assets.ts';
import { CULTURES } from '../world/cultures.ts';

/** The culture-specific modules, each its own file of the build. */
const MODULES = import.meta.glob([
  '../../../assets/src/neolithicHouses.ts',
  '../../../assets/src/eastAsiaAmericasHouses.ts',
  '../../../assets/src/neolithicTools.ts',
  '../../../assets/src/crops.ts',
]);

/** The module of each model that loads with its culture, by asset id, from the manifest's `file`. */
const moduleOf = new Map<string, string>(
  (manifest as AssetManifest).assets.flatMap((a) => {
    const key = `../../../${a.file}`;
    return key in MODULES ? [[a.id, key] as const] : [];
  }),
);

const loaded = new Set<string>();
const loading = new Set<string>();

/** Whether a model can be built now: it is in the first download, or its module has loaded. */
export function modelLoaded(id: string): boolean {
  const module = moduleOf.get(id);
  return module === undefined || loaded.has(module);
}

/** Loads the modules of these models that are not loaded yet; `drawable` decides which are worth it. */
export function loadModels(ids: Iterable<string>, drawable: (id: string) => boolean): void {
  for (const id of ids) {
    const module = moduleOf.get(id);
    if (module === undefined || loaded.has(module) || loading.has(module) || !drawable(id))
      continue;
    loading.add(module);
    MODULES[module]!().then(
      () => {
        loading.delete(module);
        loaded.add(module);
      },
      // Tried again the next time the culture is near.
      () => loading.delete(module),
    );
  }
}

/** Every string in a culture table row, where its models are named (lodging, architecture, tools, herd, crops). */
function strings(value: unknown, out: string[]): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value)) strings(v, out);
  return out;
}

const assetsOf = new Map<string, string[]>();

/**
 * The asset ids a culture profile names in the culture table: its lodging and architecture
 * set as they are, its tools as `prop-<tool>` and its crops as `crop-<crop>`.
 */
export function cultureModels(profile: string): string[] {
  let ids = assetsOf.get(profile);
  if (!ids) {
    const row = CULTURES.get(profile);
    ids = [
      ...new Set(
        strings(row, [])
          .flatMap((s) => [s, `prop-${s}`, `crop-${s}`])
          .filter((s) => moduleOf.has(s)),
      ),
    ];
    assetsOf.set(profile, ids);
  }
  return ids;
}

/** The models that load with their culture which a lodging of the tree needs: its culture's and its own. */
export function lodgingModels(lodging: { culture?: string; kind: string }): string[] {
  const own = moduleOf.has(lodging.kind) ? [lodging.kind] : [];
  return lodging.culture === undefined ? own : [...cultureModels(lodging.culture), ...own];
}
