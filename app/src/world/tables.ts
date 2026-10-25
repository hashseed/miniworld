// The tables of content the world reads (architecture.md section 3.3, milestone-1 section 10.2):
// the culture table and the wildlife table. They are not part of the app's code: the app hands
// them over from the startup index before it first asks the world anything, the scene worker
// gets them in a message before its first tree file, and the data build and the tests read
// them from data/curated/ (data/build/lib/worldTables.ts). What the world works out from them
// (the culture and wildlife lookups) is filled in when they arrive, in the order the modules
// asked, so a lookup made from another is filled after it.

import type { Table } from '../../../data/schema/tables.ts';

export interface WorldTables {
  cultures: Table<'cultures.json'>;
  wildlife: Table<'wildlife.json'>;
}

let current: WorldTables | undefined;
const fills: ((tables: WorldTables) => void)[] = [];

/** Hands the world its tables, and fills in everything worked out from them. */
export function setWorldTables(tables: WorldTables): void {
  current = tables;
  for (const fill of fills) fill(tables);
}

/** Fills in something worked out from the tables now, if they are here, and whenever they are handed over. */
export function onWorldTables(fill: (tables: WorldTables) => void): void {
  fills.push(fill);
  if (current) fill(current);
}
