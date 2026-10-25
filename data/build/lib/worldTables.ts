// Hands the world its tables from data/curated/ (app/src/world/tables.ts), for the data build,
// the asset tools and the tests; the app gets the same tables from the startup index.
// Imported for its effect, before anything asks the world.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setWorldTables, type WorldTables } from '../../../app/src/world/tables.ts';

const CURATED = join(import.meta.dirname, '../../curated');

/** The world's tables as data/curated/ has them. */
export function curatedWorldTables(): WorldTables {
  const read = (name: string) => JSON.parse(readFileSync(join(CURATED, name), 'utf8'));
  return { cultures: read('cultures.json'), wildlife: read('wildlife.json') };
}

setWorldTables(curatedWorldTables());
