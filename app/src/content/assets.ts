// Which generated models may be drawn (spec section 13 and giza.md section
// 11.1): only those Yang has approved in the asset manifest. A preview build
// on devenv may also draw the models still waiting for review, so Yang can
// review them in place; such a build is never shipped.

import manifest from '../../../data/assets/manifest.json';

const preview = import.meta.env.VITE_PREVIEW_ASSETS === '1';

/** Asset ids that may be drawn with their own model rather than a stand-in. */
export const drawable = new Set(
  (manifest as { assets: { id: string; status: string }[] }).assets
    .filter((a) => a.status === 'approved' || (preview && a.status === 'generated'))
    .map((a) => a.id),
);
