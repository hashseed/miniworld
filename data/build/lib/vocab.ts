// Reads and validates the vocabulary files (spec content-format.md section 1)
// against their schemas in data/schema/.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { z } from 'zod';
import {
  ActionsSchema,
  AnimalsSchema,
  IconsSchema,
  LanesSchema,
  RegionsSchema,
  RolesSchema,
  type Action,
  type Labels,
  type Role,
} from '../../schema/vocab.ts';

export interface Vocab {
  actions: Record<string, Action>;
  roles: Record<string, Role>;
  animals: Record<string, Labels>;
  icons: Record<string, Labels>;
  /** Shape only; the era build checks that lanes and regions match (eras.ts). */
  regions: Record<string, Labels>;
  lanes: z.infer<typeof LanesSchema>;
}

/** Parses one vocabulary file; adds every problem to errors, named by file and entry. */
export function parseVocab<T>(
  file: string,
  text: string,
  schema: z.ZodType<T>,
  errors: string[],
): T | undefined {
  let value: unknown;
  try {
    value = parse(text, { schema: 'core' });
  } catch (e) {
    errors.push(`${file}: ${(e as Error).message}`);
    return undefined;
  }
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  for (const issue of result.error.issues)
    errors.push(`${file}: ${issue.path.join('.') || '(file)'}: ${issue.message}`);
  return undefined;
}

let repo: Vocab | undefined;
/** The repository's vocabulary (data/curated/vocab), read once. */
export function repoVocab(): Vocab {
  return (repo ??= readVocab(new URL('../../curated/vocab', import.meta.url).pathname));
}

/** Reads every vocabulary file under dir; throws with all problems at once. */
export function readVocab(dir: string): Vocab {
  const errors: string[] = [];
  const read = <T>(name: string, schema: z.ZodType<T>) =>
    parseVocab(`vocab/${name}`, readFileSync(join(dir, name), 'utf8'), schema, errors);
  const vocab = {
    actions: read('actions.yaml', ActionsSchema),
    roles: read('roles.yaml', RolesSchema),
    animals: read('animals.yaml', AnimalsSchema),
    icons: read('icons.yaml', IconsSchema),
    regions: read('regions.yaml', RegionsSchema),
    lanes: read('lanes.yaml', LanesSchema),
  };
  if (errors.length) throw new Error(errors.join('\n'));
  return vocab as Vocab;
}
