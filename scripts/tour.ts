// Captures 12 canonical prehistory & Neolithic stops on the live globe into a labeled
// 4x3 contact sheet for art & terrain QA (docs/spec/art-direction.md section 3).
// Run against a running dev server (`npm run dev`):
//   npm run tour -- [out-dir] [--debug-shots dir]

import { chromium, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TIMELINE_START } from '../app/src/time/calendar.ts';

interface ManifestJson {
  cutoffDay: number;
  index: { en: string };
  tree?: { files: (string | null)[]; days: number[] };
}

interface EventEntry {
  id: string;
  day: number;
  lat: number;
  lon: number;
}

interface ChunkLodging {
  camp: number;
  lat: number;
  lon: number;
  built: number;
  gone: number;
  culture?: string;
  fieldLand?: string;
}

interface ChunkJson {
  fromDay: number;
  toDay: number;
  lodgings: ChunkLodging[];
}

export interface TourStop {
  id: string;
  label: string;
  day: number;
  lat: number;
  lon: number;
  altitudeKm: number;
  tilt: number;
}

const DATA_DIR = 'app/public/data';
const TOUR_URL = process.env.TOUR_URL ?? 'http://localhost:8800';
const today = new Date().toISOString().slice(0, 10);

function parseArgs(argv: string[]): { outDir: string; debugDir?: string } {
  let outDir = `/mnt/review/${today}-tour`;
  let debugDir: string | undefined;
  let positional = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--debug-shots') {
      debugDir = argv[++i];
    } else if (!a.startsWith('--') && !positional) {
      outDir = a;
      positional = true;
    }
  }
  return { outDir, ...(debugDir ? { debugDir } : {}) };
}

function buildStops(): TourStop[] {
  const manifest = JSON.parse(
    readFileSync(join(DATA_DIR, 'manifest.json'), 'utf8'),
  ) as ManifestJson;
  const index = JSON.parse(readFileSync(join(DATA_DIR, manifest.index.en), 'utf8')) as {
    events: EventEntry[];
  };
  const eventOf = (id: string, fallback: EventEntry): EventEntry =>
    index.events.find((e) => e.id === id) ?? fallback;

  const files = manifest.tree?.files ?? [];
  const days = manifest.tree?.days ?? [];
  // Pick a genuine Neolithic/Chalcolithic chunk (~3000–2500 BCE, day ~ -1,800,000) once all 7 cultures exist.
  const targetDay = -1_800_000;
  let matureIdx = Math.max(0, files.length - 1);
  for (let i = 0; i < files.length; i++) {
    if ((days[i] ?? 0) >= targetDay && files[i]) {
      matureIdx = i;
      break;
    }
  }
  const chunkFile = files[matureIdx];
  const matureChunk = chunkFile
    ? (JSON.parse(readFileSync(join(DATA_DIR, chunkFile), 'utf8')) as ChunkJson)
    : undefined;
  const matureDay = matureChunk
    ? Math.floor((matureChunk.fromDay + matureChunk.toDay) / 2)
    : Math.min(manifest.cutoffDay - 1000, -1_800_000);

  const villageStop = (
    id: string,
    label: string,
    culture: string,
    fallbackLat: number,
    fallbackLon: number,
    altitudeKm = 1350,
    tilt = 40,
  ): TourStop => {
    const matches = (matureChunk?.lodgings ?? []).filter(
      (l) =>
        l.culture === culture &&
        l.fieldLand &&
        l.camp < 2_000_000 &&
        l.built <= matureDay - 3650 &&
        (l.gone === -1 || l.gone > matureDay + 365),
    );
    const chosen =
      culture === 'lbk-farmer'
        ? (matches.find((l) => l.lat / 1e6 >= 45 && l.lon / 1e6 >= 5 && l.lon / 1e6 <= 20) ??
          matches[0])
        : culture === 'andean-farmer'
          ? (matches.find((l) => l.lon / 1e6 < -70) ?? matches[0])
          : (matches[0] ??
            (matureChunk?.lodgings ?? []).find((l) => l.culture === culture && l.fieldLand));
    return {
      id,
      label,
      day: matureDay,
      lat: chosen ? chosen.lat / 1e6 : fallbackLat,
      lon: chosen ? chosen.lon / 1e6 : fallbackLon,
      altitudeKm,
      tilt,
    };
  };

  const sulawesi = eventOf('scene-leang-karampuang', {
    id: 'scene-leang-karampuang',
    day: -18663752,
    lat: -3.12,
    lon: 119.7,
  });
  const chauvet = eventOf('scene-chauvet', {
    id: 'scene-chauvet',
    day: -13491407,
    lat: 44.52,
    lon: 4.89,
  });
  const mezhyrich = eventOf('scene-mezhyrich', {
    id: 'scene-mezhyrich',
    day: -6560775,
    lat: 48.78,
    lon: 31,
  });
  const gobekli = eventOf('scene-gobekli-tepe', {
    id: 'scene-gobekli-tepe',
    day: -4224763,
    lat: 37.34,
    lon: 39.54,
  });

  return [
    {
      id: '01-turkana-70k',
      label: '01 · Lake Turkana (70,000 BCE)',
      day: TIMELINE_START,
      lat: 3.95,
      lon: 36.2,
      altitudeKm: 1350,
      tilt: 38,
    },
    {
      id: '02-sulawesi-49k',
      label: '02 · Leang Karampuang',
      day: sulawesi.day + 18000,
      lat: sulawesi.lat,
      lon: sulawesi.lon,
      altitudeKm: 1350,
      tilt: 40,
    },
    {
      id: '03-chauvet-35k',
      label: '03 · Chauvet Cave',
      day: chauvet.day + 18000,
      lat: chauvet.lat,
      lon: chauvet.lon,
      altitudeKm: 1350,
      tilt: 40,
    },
    {
      id: '04-mezhyrich-16k',
      label: '04 · Mezhyrich Bone Huts',
      day: mezhyrich.day + 18000,
      lat: mezhyrich.lat,
      lon: mezhyrich.lon,
      altitudeKm: 1350,
      tilt: 40,
    },
    {
      id: '05-gobekli-tepe-9k',
      label: '05 · Göbekli Tepe',
      day: gobekli.day + 18000,
      lat: gobekli.lat,
      lon: gobekli.lon,
      altitudeKm: 1300,
      tilt: 42,
    },
    villageStop('06-levant', '06 · Levant Village', 'pre-pottery-neolithic-levant', 32.4, 35.8),
    villageStop('07-anatolia', '07 · Anatolia Cluster', 'anatolian-farmer', 37.8, 32.8),
    villageStop('08-lbk-danube', '08 · LBK Longhouse', 'lbk-farmer', 46.4, 7.17),
    villageStop('09-mehrgarh-indus', '09 · Mehrgarh Indus', 'indus-farmer', 29.7, 69.14),
    villageStop(
      '10-yellow-river',
      '10 · Yellow River Pits',
      'yellow-river-millet-farmer',
      36.45,
      112.77,
    ),
    villageStop(
      '11-yangtze-stilt',
      '11 · Yangtze Stilt House',
      'yangtze-rice-farmer',
      24.52,
      115.94,
    ),
    villageStop(
      '12-andes-highland',
      '12 · Andean Terraces',
      'andean-farmer',
      -13.8,
      -74.79,
      1550,
      22,
    ),
  ];
}

async function waitReady(
  page: Page,
  stop: Pick<TourStop, 'day' | 'lat' | 'lon' | 'altitudeKm' | 'tilt'>,
) {
  await page.evaluate(({ day, lat, lon, altitudeKm, tilt }) => {
    const m = (
      globalThis as unknown as {
        __miniworld: {
          clock: { setPlayState: (s: string) => void; setDay: (d: number) => void };
          controller: {
            cancelFlight: () => void;
            state: { lat: number; lon: number; altitudeKm: number; heading: number; tilt: number };
          };
        };
      }
    ).__miniworld;
    m.clock.setPlayState('paused');
    m.clock.setDay(day);
    m.controller.cancelFlight();
    m.controller.state = { lat, lon, altitudeKm, heading: 0, tilt };
  }, stop);
  await page
    .waitForFunction(
      () => {
        const m = (
          globalThis as unknown as {
            __miniworld?: {
              loader: { pending: number };
              globe: { pendingBuilds: number; drawnTiles: number };
            };
          }
        ).__miniworld;
        return m && m.loader.pending === 0 && m.globe.pendingBuilds === 0 && m.globe.drawnTiles > 0;
      },
      null,
      { timeout: 25_000 },
    )
    .catch(() => {});
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0;
        const step = () => {
          if (++frames >= 16) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
}

async function compositeContactSheet(
  page: Page,
  items: { path: string; label: string }[],
  outFile: string,
): Promise<void> {
  const payload = items.map((it) => ({
    label: it.label,
    src: `data:image/png;base64,${readFileSync(it.path).toString('base64')}`,
  }));
  const dataUrl = await page.evaluate(async (entries) => {
    const cols = 4;
    const rows = 3;
    const cellW = 640;
    const cellH = 360;
    const headerH = 44;
    const pad = 12;
    const canvas = document.createElement('canvas');
    canvas.width = cols * cellW + (cols + 1) * pad;
    canvas.height = headerH + rows * cellH + (rows + 1) * pad;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1b1714';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f7efe3';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText(
      'Miniworld Global Visual Tour (12 Canonical Prehistory & Neolithic Stops)',
      16,
      29,
    );

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = entry.src;
      });
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = pad + col * (cellW + pad);
      const y = headerH + pad + row * (cellH + pad);
      ctx.drawImage(img, x, y, cellW, cellH);
      ctx.fillStyle = 'rgba(20, 16, 13, 0.82)';
      ctx.fillRect(x + 8, y + 8, Math.min(cellW - 16, entry.label.length * 9 + 20), 26);
      ctx.fillStyle = '#fff5e6';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillText(entry.label, x + 16, y + 26);
    }
    return canvas.toDataURL('image/png');
  }, payload);
  writeFileSync(outFile, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

const { outDir, debugDir } = parseArgs(process.argv.slice(2));
mkdirSync(outDir, { recursive: true });
const stops = buildStops();

const browser = await chromium.launch({
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem(
      'miniworld.settings.v1',
      JSON.stringify({
        language: 'en',
        timelineExpanded: false,
        timelineMinimized: true,
        trueTimeScale: false,
        showStats: false,
      }),
    );
  });
  page.on('pageerror', (err) => console.error('pageerror:', err));

  await page.goto(TOUR_URL);
  await page.waitForFunction(
    () =>
      (globalThis as unknown as { __miniworld?: { ui: { value: { intro: string } } } }).__miniworld
        ?.ui.value.intro === 'done',
    null,
    { timeout: 60_000 },
  );

  const shots: { path: string; label: string }[] = [];
  for (const stop of stops) {
    await waitReady(page, stop);
    await page.evaluate(() =>
      (
        globalThis as unknown as { __miniworld: { holdFrames: (b: boolean) => Promise<void> } }
      ).__miniworld.holdFrames(true),
    );
    const shotPath = join(outDir, `${stop.id}.png`);
    await page.screenshot({ path: shotPath });
    await page.evaluate(() =>
      (
        globalThis as unknown as { __miniworld: { holdFrames: (b: boolean) => Promise<void> } }
      ).__miniworld.holdFrames(false),
    );
    shots.push({ path: shotPath, label: stop.label });
    console.log(`${stop.id} (${stop.lat.toFixed(2)}, ${stop.lon.toFixed(2)}, day ${stop.day})`);
  }

  const sheetPath = join(outDir, 'tour-contact-sheet.png');
  await compositeContactSheet(page, shots, sheetPath);
  console.log(`saved ${sheetPath}`);

  if (debugDir) {
    mkdirSync(debugDir, { recursive: true });
    await page.goto(`${TOUR_URL}/?debug=1`);
    await page.waitForFunction(
      () => {
        const m = (
          globalThis as unknown as {
            __miniworld?: { ui: { value: { intro: string } }; debug?: unknown };
          }
        ).__miniworld;
        return m?.ui.value.intro === 'done' && Boolean(m.debug);
      },
      null,
      { timeout: 60_000 },
    );

    const lbkStop = stops.find((s) => s.id === '08-lbk-danube')!;
    await page.evaluate(() => {
      const m = (
        globalThis as unknown as {
          __miniworld: {
            debug: { setToggle: (k: string, on: boolean) => void };
          };
        }
      ).__miniworld;
      m.debug.setToggle('houseFootprints', true);
      m.debug.setToggle('villageMasks', true);
      m.debug.setToggle('wildlifeMasks', false);
      m.debug.setToggle('keepOuts', true);
    });
    await waitReady(page, { ...lbkStop, altitudeKm: 1450, tilt: 35 });
    await page.evaluate(() =>
      (
        globalThis as unknown as { __miniworld: { holdFrames: (b: boolean) => Promise<void> } }
      ).__miniworld.holdFrames(true),
    );
    await page.screenshot({ path: join(debugDir, 'debug-village.png') });
    await page.evaluate(() =>
      (
        globalThis as unknown as { __miniworld: { holdFrames: (b: boolean) => Promise<void> } }
      ).__miniworld.holdFrames(false),
    );
    console.log('saved debug-village.png');

    await page.evaluate(() => {
      const m = (
        globalThis as unknown as {
          __miniworld: {
            debug: { setToggle: (k: string, on: boolean) => void };
          };
        }
      ).__miniworld;
      m.debug.setToggle('houseFootprints', false);
      m.debug.setToggle('villageMasks', false);
      m.debug.setToggle('wildlifeMasks', true);
      m.debug.setToggle('keepOuts', true);
    });
    await waitReady(page, {
      day: lbkStop.day,
      lat: 31.8,
      lon: 35.0,
      altitudeKm: 2400,
      tilt: 24,
    });
    await page.evaluate(() =>
      (
        globalThis as unknown as { __miniworld: { holdFrames: (b: boolean) => Promise<void> } }
      ).__miniworld.holdFrames(true),
    );
    await page.screenshot({ path: join(debugDir, 'debug-wildlife.png') });
    await page.evaluate(() =>
      (
        globalThis as unknown as { __miniworld: { holdFrames: (b: boolean) => Promise<void> } }
      ).__miniworld.holdFrames(false),
    );
    console.log('saved debug-wildlife.png');
  }
} finally {
  await browser.close();
}
