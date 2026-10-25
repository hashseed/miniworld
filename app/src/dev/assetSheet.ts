// Development-only entry for the asset review sheets (spec milestone 2, section 13.3).
// The sheets show the culture table's lodgings, so the world gets its tables first, here
// straight from data/curated/ (the app gets them from the startup index).
import cultures from '../../../data/curated/cultures.json' with { type: 'json' };
import wildlife from '../../../data/curated/wildlife.json' with { type: 'json' };
import { setWorldTables, type WorldTables } from '../world/tables.ts';

setWorldTables({ cultures, wildlife } as unknown as WorldTables);
await import('../../../assets/src/sheet.ts');
