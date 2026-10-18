// Schemas of the vocabulary files in data/curated/vocab/ (spec
// content-format.md sections 1 and 7). The data build validates the files
// with them; the app imports only the inferred types.

import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9-]*$/, 'ids are lower-case words joined by hyphens');
/** A vocabulary file: entries keyed by id. */
const vocab = <T extends z.ZodType>(entry: T) => z.record(id, entry);
const label = z.string().min(1);
const labels = z.strictObject({ en: label, de: label });

export const ActionSchema = z.strictObject({
  for: z.enum(['cast', 'prop']),
  object: z.enum(['none', 'mark', 'group', 'optional-group']),
});
export const ActionsSchema = vocab(ActionSchema);

export const RoleSchema = z.strictObject({
  en: label,
  de: z.strictObject({ female: label, male: label }),
  man: z.literal(true).optional(),
  tool: id.optional(),
});
export const RolesSchema = vocab(RoleSchema);

export const RegionsSchema = vocab(labels);
/** Timeline lanes from top to bottom: a lane of its own, or a region's lane. */
export const LanesSchema = z.array(
  z.union([z.strictObject({ id, en: label, de: label }), z.strictObject({ region: id })]),
);

export const AnimalsSchema = vocab(labels);
export const IconsSchema = vocab(labels);

export type Action = z.infer<typeof ActionSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Labels = z.infer<typeof labels>;
