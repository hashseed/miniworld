// Checks the curated tables and the asset references they make (spec
// content-format.md section 1.1, milestone-1 section 10.8), before any stage
// reads them.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TABLES, tableErrors, type Table, type TableName } from '../../schema/tables.ts';
import { assetManifest, type AssetManifest } from '../../schema/assets.ts';

const isTable = (name: string): name is TableName => Object.hasOwn(TABLES, name);

/** Every JSON file directly under `dir`, checked against its schema. */
export function validateTables(dir: string): {
  tables: Partial<{ [N in TableName]: Table<N> }>;
  errors: string[];
} {
  const errors: string[] = [];
  const tables: Partial<Record<TableName, unknown>> = {};
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  for (const f of files) {
    if (!isTable(f)) {
      errors.push(
        `${f}: no schema; add one to data/schema/tables.ts (content-format.md section 1.1)`,
      );
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch (e) {
      errors.push(`${f}: ${(e as Error).message}`);
      continue;
    }
    const e = tableErrors(f, value);
    errors.push(...e);
    if (!e.length) tables[f] = value;
  }
  for (const name of Object.keys(TABLES))
    if (!files.includes(name)) errors.push(`${name}: missing from data/curated`);
  return { tables: tables as Partial<{ [N in TableName]: Table<N> }>, errors };
}

/** The asset manifest, checked against its schema. */
export function readAssetManifest(path: string): { manifest?: AssetManifest; errors: string[] } {
  const result = assetManifest.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (result.success) return { manifest: result.data, errors: [] };
  return {
    errors: result.error.issues.map(
      (i) => `data/assets/manifest.json: ${i.path.join('.')}: ${i.message}`,
    ),
  };
}

/** An asset id the content names, and where. */
export interface AssetRef {
  id: string;
  from: string;
}

/** The asset ids the curated tables name: the wildlife models and the props of the anchors' scenes. */
export function tableAssetRefs(tables: Partial<{ [N in TableName]: Table<N> }>): AssetRef[] {
  const refs: AssetRef[] = [];
  for (const g of tables['wildlife.json']?.groups ?? [])
    refs.push({ id: g.model, from: `wildlife.json: ${g.species} at ${g.home}` });
  for (const a of tables['anchors.json']?.anchors ?? [])
    if (a.scene) refs.push({ id: a.scene.prop, from: `anchors.json: ${a.id}` });
  return refs;
}

/**
 * Checks references against the manifest (milestone-1 section 10.8): an id the manifest does
 * not list fails the build; one that is listed but not approved is drawn as a stand-in until
 * Yang approves it, and is only counted.
 */
export function checkAssetRefs(
  refs: AssetRef[],
  manifest: AssetManifest,
): { errors: string[]; waiting: string[] } {
  const byId = new Map(manifest.assets.map((a) => [a.id, a]));
  const errors: string[] = [];
  const waiting = new Set<string>();
  for (const r of refs) {
    const a = byId.get(r.id);
    if (!a) errors.push(`${r.from}: asset ${r.id} is not in data/assets/manifest.json`);
    else if (a.status === 'rejected') errors.push(`${r.from}: asset ${r.id} was rejected`);
    else if (a.status !== 'approved') waiting.add(r.id);
  }
  return { errors, waiting: [...waiting].sort() };
}
