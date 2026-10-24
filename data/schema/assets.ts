// The schema of the asset manifest, data/assets/manifest.json (spec
// milestone-1 section 12, milestone-2 section 13.3). The asset tools, the data
// build and the app read the manifest through this type.

import { z } from 'zod';
import { id } from './tables.ts';

export const ASSET_STATUSES = ['generated', 'approved', 'rejected'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_KINDS = [
  'animal',
  'figure',
  'shelter',
  'prop',
  'texture',
  'plant',
  'crop',
] as const;

export const assetEntry = z.strictObject({
  id,
  /** The file that makes it: a modelling script or an image. */
  file: z.string().min(1),
  kind: z.enum(ASSET_KINDS),
  /** How it was generated. */
  generated: z.string().min(1),
  status: z.enum(ASSET_STATUSES),
  /** The day Yang reviewed it, YYYY-MM-DD. */
  reviewed: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** The hash of the approved geometry, for a model built by code. */
  geometry: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .optional(),
  note: z.string(),
});

export const assetManifest = z
  .strictObject({ assets: z.array(assetEntry) })
  .superRefine((m, ctx) => {
    const seen = new Set<string>();
    m.assets.forEach((a, i) => {
      if (seen.has(a.id))
        ctx.addIssue({ code: 'custom', message: `duplicate id ${a.id}`, path: ['assets', i] });
      seen.add(a.id);
      if (a.status === 'approved' && !a.reviewed)
        ctx.addIssue({
          code: 'custom',
          message: `${a.id} is approved but has no review date`,
          path: ['assets', i, 'reviewed'],
        });
    });
  });

export type AssetEntry = z.infer<typeof assetEntry>;
export type AssetManifest = z.infer<typeof assetManifest>;
