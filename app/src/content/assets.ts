// Which generated models may be drawn (spec section 13): only those Yang has approved in the asset manifest. A preview build
// on devenv may also draw the models still waiting for review, so Yang can
// review them in place; such a build is never shipped. A model that loads with its
// culture is drawn once its module has loaded (spec section 10, modelPacks.ts).

import type { ModelEntry } from './types.ts';
import { loadModels, modelLoaded, setModuleFiles } from './modelPacks.ts';

const preview = import.meta.env.VITE_PREVIEW_ASSETS === '1';

/** Asset ids that may be drawn with their own model rather than a stand-in, once loaded. */
const allowed = new Set<string>();

/** Takes the models of the startup index (milestone-1 section 10.2): which may be drawn, and their modules. */
export function setModels(models: readonly ModelEntry[]): void {
  allowed.clear();
  for (const m of models) if (m.status === 'approved' || preview) allowed.add(m.id);
  setModuleFiles(models);
}

/** Which models are drawn with their own model now rather than a stand-in. */
export const drawable = {
  has: (id: string): boolean => allowed.has(id) && modelLoaded(id),
};

/** Loads the modules of these models, where they may be drawn (modelPacks.ts). */
export function wantModels(ids: Iterable<string>): void {
  loadModels(ids, (id) => allowed.has(id));
}
