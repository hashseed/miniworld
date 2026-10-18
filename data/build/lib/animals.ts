// Animal cards (spec wildlife.md, section 8): reads data/curated/animals/*.md,
// one record per wildlife species, validates them against the groups of
// wildlife.json and the sources, and compiles a text file per language.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Language } from '../../../app/src/i18n/messages.ts';
import {
  Errors,
  isMap,
  parseText,
  str,
  unknownFields,
  type VignetteText,
  type Yaml,
} from './vignettes.ts';

const RECORD_FIELDS = ['id', 'kind', 'sources'];

export interface BuiltAnimal {
  id: string;
  text: Record<Language, VignetteText>;
}

export interface AnimalInputs {
  curated: string;
  /** Folder of the records; `<curated>/animals` unless a test passes its fixtures. */
  records?: string;
  /** The species of the wildlife groups. */
  species: Set<string>;
}

export function buildAnimals(inp: AnimalInputs): { animals: BuiltAnimal[]; errors: string[] } {
  const errors: string[] = [];
  const animals: BuiltAnimal[] = [];
  const dir = inp.records ?? join(inp.curated, 'animals');
  const sourcesFile = join(inp.curated, 'sources.yaml');
  const sources = existsSync(sourcesFile)
    ? (parse(readFileSync(sourcesFile, 'utf8'), { schema: 'failsafe' }) as Yaml)
    : {};
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((n) => n.endsWith('.md'))
        .sort()
    : [];
  for (const f of files) {
    const e = new Errors(`animals/${f}`);
    const raw = readFileSync(join(dir, f), 'utf8');
    const fm = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    if (!fm) {
      errors.push(`animals/${f}: missing front matter`);
      continue;
    }
    let y: Yaml;
    try {
      y = parse(fm[1]!, { schema: 'failsafe' }) as Yaml;
    } catch (err) {
      errors.push(`animals/${f}: front matter is not valid YAML (${(err as Error).message})`);
      continue;
    }
    if (!isMap(y)) {
      errors.push(`animals/${f}: front matter must be a map`);
      continue;
    }
    unknownFields(e, 'record', y, RECORD_FIELDS);
    const id = str(y.id);
    if (!id || `${id}.md` !== f) e.add('id must equal the file name');
    if (str(y.kind) !== 'animal') e.add('kind must be "animal"');
    if (id && !inp.species.has(id)) e.add(`no wildlife group has species "${id}"`);
    const refs = Array.isArray(y.sources) ? y.sources : [];
    if (!refs.length) e.add('names no source');
    for (const r of refs) {
      if (isMap(r)) unknownFields(e, 'source', r, ['ref', 'note']);
      const ref = isMap(r) ? str(r.ref) : undefined;
      if (!ref || !isMap(sources) || !isMap(sources[ref] as Yaml | undefined))
        e.add(`unknown source "${ref}"`);
    }
    const text = parseText(e, fm[2]!);
    errors.push(...e.list);
    if (id && text && !e.list.length) animals.push({ id, text });
  }
  const have = new Set(animals.map((a) => a.id));
  for (const s of [...inp.species].sort())
    if (!have.has(s) && !files.includes(`${s}.md`))
      errors.push(`animals/${s}.md: missing card for wildlife species "${s}"`);
  return { animals, errors };
}
