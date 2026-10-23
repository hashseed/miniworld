// Saves the review sheets (spec milestone 2, section 13.3) as PNG files.
// Run with the dev server up: `npm run asset-sheets [-- out-dir [name-filter]]`.

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PROFILES } from '../app/src/world/cultures.ts';

const out = process.argv[2] ?? 'assets/sheets';
const base = process.env.SHEET_URL ?? 'http://localhost:8800/asset-sheet.html';
const sheets: [string, string][] = [
  ['people', 'sheet=people'],
  ['people-neolithic', 'sheet=people&set=neolithic'],
  ['first-person', 'sheet=founder'],
  ['first-person-camp', 'sheet=founder-camp'],
  ['first-person-motion', 'sheet=founder-motion'],
  ...['idle', 'walk', 'run', 'carry', 'work', 'point', 'throw', 'cheer'].map(
    (c): [string, string] => [`clip-${c}`, `sheet=clips&clip=${c}`],
  ),
  ['clips-mammoth', 'sheet=clips-animal&id=animal-mammoth'],
  ...['over', 'close', 'side'].map((v): [string, string] => [
    `gobekli-ring-1-${v}`,
    `sheet=landmark&rings=1&view=${v}`,
  ]),
  ['gobekli-rings-1-4', 'sheet=landmark&rings=4&view=over'],
  ['shelters', 'sheet=shelters'],
  ['build-grass-hut', 'sheet=build&id=shelter-grass-hut'],
  ['build-gobekli-ring', 'sheet=build&id=prop-gobekli-ring'],
  ['crops', 'sheet=crops'],
  ['animals-large', 'sheet=animals&set=large'],
  ['animals-small', 'sheet=animals&set=small'],
  ...[
    'animal-mammoth',
    'animal-horse',
    'animal-reindeer',
    'shelter-mammoth-bone-hut',
    'shelter-yangtze-stilt-house',
    'shelter-yellow-river-pit-house',
    'shelter-mesoamerican-hut',
    'shelter-andean-stone-house',
    'shelter-highland-new-guinea-house',
  ].map((id): [string, string] => [id, `sheet=single&id=${id}`]),
  ['turnaround-ice-age-hunter', 'sheet=turnaround&profile=ice-age-hunter'],
  ['turnaround-neanderthal', 'sheet=turnaround&profile=neanderthal'],
  ...PROFILES.map((p): [string, string] => [`camp-${p}`, `sheet=camp&profile=${p}`]),
];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (e) => console.error(e));
const only = process.argv[3];
for (const [name, query] of sheets) {
  if (only && !name.includes(only)) continue;
  await page.goto(`${base}?${query}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 60_000 });
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(name);
}
await browser.close();
