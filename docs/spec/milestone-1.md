# Milestone 1: Globe and time

This is the detailed spec for the first milestone in [milestones.md](milestones.md#1-globe-and-time). It refines [spec.md](spec.md) for what milestone 1 builds; where the two disagree, fix whichever is wrong in the same pull request. Decisions marked **Proposed** are defaults chosen so work can start and are open for Yang to change; the open question is in section 16.

**Goal:** a beautiful, empty Earth you can fly around and travel through time on. There are no people, settlements, events or borders yet. What a viewer sees at the end of this milestone: the globe at 50,000 BCE with the ice sheets and land bridges of the ice age, a timeline with coloured eras along the bottom, and the sea rising and the ice melting as time plays or the playhead is dragged towards today, in English or German.

The milestone proves the technical foundations every later milestone builds on: the terrain renderer, the two clocks, the timeline, localisation, content streaming and the performance budget.

## 1. Deliverables at a glance

| Area | Delivered | Section |
| --- | --- | --- |
| Project | TypeScript app, npm scripts, data build, CI | 2 |
| Time | Whole-day dates, one clock at a uniform rate with three speed modes, play and pause, constant lighting | 3 |
| Globe | Cube-sphere terrain from elevation data, painted textures, water, exaggerated relief, curved horizon | 4 |
| Planet over time | Sea level and ice sheets that change with the date | 5 |
| Camera | Orbit-to-ground camera for mouse, touch and keyboard | 6 |
| Timeline | World and regional era lanes, zoom, scrubbing, true time scale | 7 |
| Interface shell | Controls, settings, bookmarks, English and German | 8 |
| Saved state | Settings, last clock time, camera, bookmarks in local storage | 9 |
| Content pipeline | Manifest, startup index, chunks, hashing, service worker | 10 |
| Performance | Stress scene, fixed quality, dynamic resolution | 11 |

## 2. Project setup

### 2.1 Toolchain

- Development runs in Yang's devenv Docker container (spec section 11). `.nvmrc` and `engines` in `package.json` pin Node (current LTS); every other tool is a dev dependency, so `npm ci` sets up everything and nothing is installed globally. `npm run dev` starts the dev server on port 8800 with hot reload, listening on all interfaces, serving the app and the locally built content under the same origin.
- Vite as dev server and bundler, TypeScript in strict mode, ESLint and Prettier, Vitest for unit and golden tests, Playwright (using the pre-installed Chromium where available) for browser tests.
- The app uses Three.js for rendering and Preact for the interface, as in spec section 9. New runtime dependencies need a reason in the pull request that adds them, because every kilobyte counts against the first-view budget (section 10.6).

### 2.2 Repository layout

```
app/              the browser app
  src/main.ts     entry point; app.ts builds the state and scene and implements the actions, loop.ts runs the frame loop, input.ts handles the keyboard
  src/core/       deterministic hash and noise, small shared store, camera type (no engine-dependent maths)
  src/geo/        cube-sphere quadtree, Earth constants, local compass frame; shared with the data build
  src/time/       dates, the clock, formatting
  src/planet/     the planet at a date and place: sea level, ocean mask, ice, drawn ground height (no DOM, Three.js or network code)
  src/globe/      terrain, water, ice, sky, clouds, foliage, history lens, camera
  src/timeline/   canvas timeline
  src/ui/         Preact shell, settings, bookmarks, saved state
  src/i18n/       message loading, plural rules, date and number formatting
  src/content/    manifest, chunk loader, binary formats
  src/world/      the world query: pure functions from the clock to what is shown
  src/perf/       stress scene, fixed quality level, dynamic resolution, stats overlay
  src/dev/        development pages, such as the asset sheet, and the stress scene's camera path
  messages/       en.json, de.json
  public/         files served as they are: the service worker and the built data
assets/           code that generates the models (assets/src) and the asset sheet
data/
  sources/        simplified extracts of the source datasets used, with their licence texts
  curated/        hand-curated records, such as eras (format in content-format.md)
  schema/         one schema per content kind, shared by the data build and the app (planned)
  build/          Node scripts for the offline data build
  assets/         asset manifest and approved assets
  out/            downloads and build caches (not committed)
tests/browser/    Playwright tests
scripts/          development tools
dist/             build output (not committed)
```

**Simplified source data is kept in the repository** (decided by Yang on 2026-10-17). The full original downloads are not stored: `npm run fetch-data` downloads them into `data/out/` (not committed) and checks them against the checksums recorded in `data/sources.json`, and `npm run simplify-data` turns them into small extracts that are committed under `data/sources/<source-id>/` as plain files (no Git LFS), together with the licence text, so the app can always be rebuilt even if a source disappears from the web. An extract keeps only the variables, times (from the timeline's start onwards) and resolution the app needs (section 4.1). Gridded extracts are Brotli-compressed little-endian grids, `<name>.bin.br`, each with a JSON header, `<name>.json`, giving the variable, units, type, scale, no-data value, size, grid registration, origin, cell size and the years before present of each layer; layers follow one another, rows run from north to south and columns from west to east. The data build reads only from `data/sources/` and checks every file against the checksum in `data/sources.json`.

`src/time` and `src/planet` (sea level, ice, ocean mask and ground height at a date and place) contain no DOM, Three.js or network code, so the world query of milestone 2 can move them into the Web Worker unchanged.

### 2.3 Scripts

All are npm scripts, run in the dev container or any machine with the pinned Node:

| Script | Does |
| --- | --- |
| `npm run fetch-data` | Downloads the original source datasets listed in `data/sources.json` into `data/out/` and checks them against their recorded checksums (recording the checksum of a new source); used only when adding or updating a source |
| `npm run simplify-data` | Turns the original downloads into the simplified extracts under `data/sources/` and records their checksums; used only when adding or updating a source |
| `npm run build-data` | Runs the offline data build (section 10): terrain tiles, ocean mask, ice, sea-level curve, startup index, chunks, manifest; incremental through its caches (section 10.7.1), `-- --no-cache` or `-- --clean` to force |
| `npm run verify-cache` | Builds without caches, with a clean fill and from the caches, and fails when the output files differ (section 10.7.2) |
| `npm run dev` | The dev server on port 8800 |
| `npm run staging` | The former staging watcher, which kept a checkout on the latest `main` with its dev server on port 8800; no longer used in the devenv (spec section 11) |
| `npm run build` | Production build of app plus data into `dist/` |
| `npm run check` | Lint, typecheck, unit and golden tests, data validation |
| `npm run coverage` | Unit and golden tests with the coverage report and its thresholds (section 2.4) |
| `npm run golden` | The golden tests (section 13) on the data in `app/public/data`; `npm run golden -- -u` stores new results after an intended change |
| `npm run test:browser` | Playwright tests at desktop and phone sizes |
| `npm run fixture-key` | Prints the hash of everything the fixture data build reads, the key of its cache (section 2.4) |
| `npm run notices` | Regenerates `app/public/third-party-notices.txt` from the licences of the runtime dependencies (spec section 13) |
| `npm run perf` | Runs the stress scene and prints the performance report (section 11.4) |

### 2.4 Continuous integration

GitHub Actions runs on every pull request and on `main`: lint, typecheck, unit and golden tests with the coverage report, data validation against a small fixture dataset, the full build from the real data as the preview site is built (`npm run build`, so what only goes wrong on the real map, such as the scenes at anchors, fails the pull request rather than the deploy), the production build with its size check (section 10.6), and the Playwright tests in headless Chromium. Three jobs run side by side so a pull request is checked in about three minutes: the static checks and unit tests; the fixture data build and the golden tests on it; and, once the data is built, the browser tests, split over eight jobs (at each of desktop and phone size, the golden screenshots in two jobs of their own, as one test per view; the other desktop tests in two jobs and the other phone tests in one; and the perf check), one test at a time, because the software renderer uses every core and two tests on one machine slow each other down more than they gain. The fixture data is cached under a hash of everything its build reads (`npm run fixture-key`), and the Playwright browser under its version, so neither is rebuilt or downloaded when nothing changed. A new push to a pull request cancels its running checks. CI does not judge frame rate, because CI machines are not the reference devices; it checks draw calls and triangle counts of the stress scene instead (section 11.4). The phone browser tests emulate a phone's screen size and touch input at device pixel ratio 1, because CI renders in software and a phone's full pixel density would make every test several times slower without testing anything more.

`npm run coverage` runs the unit tests with a line and branch coverage report (`coverage/`). Its thresholds, overall and for the well-tested folders, are the coverage when they were set; a change may raise them but never lower them.

### 2.5 Running tests locally

Tests run in Yang's devenv container, in its one development checkout (spec section 11); there are no git worktrees and no test pool (Yang, 2026-10-18).

- `npm run check` runs the static checks and the unit and golden tests there, next to the running dev server.
- The browser tests need the fixture data, and `npm run build-data -- --fixture` replaces the content in `app/public/data` that the dev server on port 8800 serves. After a local browser test run, `npm run build-data` puts the real content back (and the dev server is restarted, as it keeps serving stale files otherwise). When that is not worth it, the browser tests are left to CI (section 2.4).
- The browser tests start their own dev server on port 8810, never on port 8800 and never on a server that is already running, so they do not test or disturb the server Yang looks at.

The browser tests read three settings from the environment: `MINIWORLD_PORT` (default 8810), `PW_WORKERS`, the number of tests at a time (default 1), and `MINIWORLD_CHROMIUM`, the path of a system Chromium for machines where Playwright's own download is not available.

## 3. Time

### 3.1 Dates

- A date is a whole-day integer: the number of days since 1 January 2000 CE in the proleptic Gregorian calendar, negative before that. 70,000 BCE is about −26.3 million, well inside a 32-bit integer. No floating-point years are used anywhere in world state.
- Internally years use astronomical numbering (1 BCE is year 0, 2 BCE is year −1). Conversion between day numbers and calendar dates is a pure function in `src/time` with unit tests at known dates, including leap years and the year 0 boundary.
- The timeline runs from 1 January 70,000 BCE to the content cutoff date stored in the manifest, which is 26 December 1991, the dissolution of the Soviet Union (spec section 2.5). The end of the timeline, called "today" in this spec where it means the timeline end, always means that cutoff, never the device clock, so the same build shows the same timeline on every day.
- The app opens at 1 January 50,000 BCE on first start, and at the last saved date after that. From milestone 2 it opens at the start of the timeline, 1 January 70,000 BCE, on the first person at Lake Turkana ([humankind.md](humankind.md#7-changes-to-the-rest-of-the-spec) section 7).

### 3.2 Displaying dates

| Range | English | German |
| --- | --- | --- |
| Before 1 CE | 50,042 BCE, 3250 BCE (the exact year, playing, scrubbing or paused, so it counts up year by year; until Yang, 2026-10-20, rounded to 100 years before 10,000 BCE and marked "c." while moving) | 50.042 v. Chr., 3250 v. Chr. |
| 1 CE to 999 CE | 79 CE | 79 n. Chr. |
| From 1000 | 1492 | 1492 |
| When paused at or after 1500 | 14 July 1789 | 14. Juli 1789 |

Years are whole years of the exact day; the readout changes when a new year starts, at most once a frame. Era dates marked approximate in [eras.md](eras.md) always show "c." ("ca."). Four-digit years are written without a thousands separator in both languages; five-digit years use one ("50,000" and "50.000"). Formatting lives in `src/i18n` and is covered by unit tests for both languages.

### 3.3 The clock and the speed modes

**The clock** (spec section 2.1) is a whole number of milliseconds of watching time since the start of the timeline (1 January 70,000 BCE), held by `src/time`. It is the only time input of the world: the date and everything that moves are pure functions of it. While playing it advances by the real frame time multiplied by the speed factor; an accumulator keeps the fraction, and only the whole milliseconds reach world state.

**Watching time and history time** (spec section 2.1; decided by Yang on 2026-10-19). The clock is watching time; the date follows from it by the curve of `app/src/time/curve.ts` (513 knots, evenly spaced in watching time, generated by `node scripts/time-curve.ts`). Between two knots *i* and *i+1* the day is

`day = dayᵢ + ⌊(clock − msᵢ) × (dayᵢ₊₁ − dayᵢ) / (msᵢ₊₁ − msᵢ)⌋`

in exact integer arithmetic (the products stay far below 2⁵³), and the clock time at which a day begins is the smallest clock time that gives that day. The whole timeline is exactly 86,400,000 ms, 24 hours. Unit tests check the 24 hours, the round trip from day to clock time and back, that the date never goes backwards, and that history is never slower than a year per minute.

**Speed modes.** Instead of a slider, four modes (three decided by Yang on 2026-10-18; Yang, 2026-10-19: factors of ten and the cheetah added):

| Mode | Factor | Icon |
| --- | --- | --- |
| Slow | ×1/10 | A turtle |
| Regular | ×1 (default) | A walking person |
| Fast | ×10 | A galloping horse |
| Fastest | ×100 | A running cheetah |

The rate shown beside the date (section 8.1) is history's rate at the current date times the factor, in years per minute: at regular speed about 560 at 70,000 BCE, 22 at 3000 BCE and 1 from about 1800. The mode only changes how fast the clock advances, never the clock time itself, so changing it never changes the date or what is on screen. Figures run on the clock, so they move faster in fast modes and in slow motion in the slow one. Keys `[` and `]` step to the slower and the faster mode. At the end of the timeline the clock stops and switches to *paused*.

**Jumps** (Yang, 2026-10-19). The back and forward buttons (section 8.1) move the clock 10 seconds of watching time back or forward by playing very fast (watching time runs at the speed mode's factor, so a press covers ten times as much at fast and a hundred times as much at fastest, a tenth as much at snail; Yang, GitHub issue 126): the clock runs linearly from its time to the target over one second of real time, backwards for the back button, so the scene visibly rewinds or fast-forwards; how much history that is depends on the date (spec section 2.1). A target beyond either end of the timeline stops at the end. Further presses during a jump are queued and played one after the other, each from where the one before it ended. During jumps the clock does not otherwise advance; when the last one has landed, the previous play state and speed resume. Dragging the playhead, a bookmark or any other jump of the date cancels the jumps still under way or queued. The jump is only a way of moving the clock: the world at each clock time is the same as at any other way of reaching it. (The first version jumped 1, 10, 100 or 1,000 years with the step chosen from a pop-up; replaced by Yang on 2026-10-19 once history's rate varied.)

**No zoom factor.** Zooming does not change the speed (the slowdown when zoomed in was removed by Yang on 2026-10-18), and the setting for it is gone.

### 3.4 Play states

| State | Clock | Entered by |
| --- | --- | --- |
| Playing | Advances at the speed mode's factor | Play button, space when paused |
| Paused | Stands still, so the date and every figure stop | Pause button, space when playing |

While the playhead is dragged the clock follows the playhead and does not advance on its own. When the drag ends, the previous state resumes. Opening the settings, a bookmark list or a tooltip never changes the play state.

### 3.5 No life clock

There is no separate life clock (spec section 2.3). The water, the flowing rivers, the clouds and the placeholder figures of the stress scene animate on the clock, so they stop when paused, run faster in fast forward, and show the same frame at the same clock time.

### 3.6 Lighting

There is no day and night (decided by Yang on 2026-10-17). Everything is cel shaded (decided by Yang on 2026-10-17): light falls in three flat bands with narrow soft edges instead of smooth gradients (on the ground the bands blur into each other over almost the whole of the light's range, as does the rim light, so the shading of slopes fades in smoothly with only a hint of the clay's steps and never follows the terrain triangles; Yang, 2026-10-19: "shadows are often jagged", and 2026-10-20: "further blur the shadows on the terrain"), there are no highlights or reflections of the light (decided by Yang on 2026-10-17), and dark ink outlines trace the globe's silhouette, the coastlines, the ice edges and every cloud. The globe is lit like a toy under studio lights (spec section 8): a key light that follows the camera, coming from the upper left of the screen and slightly from behind the viewer, so relief is shaded the same way wherever the viewer looks; soft wrap-around shading so the dark side of every slope stays warm and readable; a cool sky-coloured fill from above and a warm bounce from below; and a soft bright rim along edges facing away from the light.

## 4. The globe

### 4.1 Source data

| Layer | Source | Licence | Kept in the repository |
| --- | --- | --- | --- |
| Elevation and sea floor | NOAA ETOPO 2022, 60 arc-second bedrock elevation (GeoTIFF), [doi:10.25921/fd45-gt74](https://doi.org/10.25921/fd45-gt74) | CC0 1.0, not subject to copyright in the US | Elevation averaged to 4 arc-minutes (about 7 km, 17 MB) |
| Lakes and rivers | Natural Earth 1:10m physical: lakes, rivers and lake centrelines | Public domain | The used layers only |
| Ice sheets and sea level | PaleoMIST 1.0, Gowan et al. 2021, [doi:10.1594/PANGAEA.905800](https://doi.org/10.1594/PANGAEA.905800) | CC BY 4.0 | Grounded ice thickness and relative sea level on 0.25°, every 2,500 years from 72,500 years ago, so the ice and the sea change from the start of the timeline at 70,000 BCE (extended on 2026-10-18 from 52,500 years ago, Yang: "should we backfill this data?") |
| Climate (precipitation for the deserts) | Beyer, Krapp and Manica 2020, [doi:10.6084/m9.figshare.12293345](https://doi.org/10.6084/m9.figshare.12293345) | CC BY 4.0 | BIOME4 biomes, annual mean temperature and annual precipitation on 0.5°, every 1,000 to 2,000 years from 72,000 years ago (first from 54,000 years ago) |

Every source must meet the data licence policy in [spec.md](spec.md#13-licences): freely available and usable commercially. `data/sources.json` lists every source with its URL, version, checksum, licence (as an SPDX identifier) and citation. The data build fails when a source used by a layer has no licence entry or its licence is not on the allowed list, and the app's About panel lists every source and its licence in both languages.

### 4.2 Terrain

- The globe is a unit cube projected onto a sphere (with an equal-angle warp so tiles are similar in size), each face split into a quadtree. Every tile is a grid of 33 × 33 vertices with skirts to hide cracks between levels (decided by Yang on 2026-10-17, first 65 × 65: the map is deliberately simple, and the terrain should stay at about 800,000 triangles or fewer on screen). Tiles are refined by screen-space error: a tile splits when its geometric error, estimated as half its vertex spacing, would exceed the terrain error target in CSS pixels (section 11.2). A tile splits only once all four children are ready to draw, so the ground never shows holes while loading. The tile meshes are kept in a cache of about 1,500; every mesh the current frame draws or checks (the drawn tiles, their parents and the children waiting to be drawn) is kept, and only meshes the frame did not touch are evicted, oldest first, so a full cache never makes tiles flicker between levels. When a coarser tile is wanted but not built yet, its finer children keep being drawn until it is. The meshes are kept in order of last use, so evicting stops at the first mesh the frame touched instead of sorting the whole cache. Downloaded data tiles are kept in the same way: levels 0 to 2 always (the planet query falls back to them, section 5), and up to 2,048 deeper tiles, the least recently used dropped first and downloaded again when next needed.
- **Cheaper tiles where there is little to draw** (decided by Yang on 2026-10-18: Antarctica seen from above needed about 700,000 triangles and 520 draw calls, most of them for the empty Southern Ocean around it). A tile that is sea at every date (its smoothed coast level below the lowest sea level of the timeline at every sample, with no lake or river) is drawn as its flat sea surface alone, on an 8 × 8 grid with skirts, which also carries any ice lying over the sea; it costs one draw call and about 200 triangles. Tiles in the polar regions (north of 74°N and south of 62°S), whose relief is smoothed away (section 4.2), use every second vertex (16 × 16 cells). A tile that is land at every date (its coast level above +10 m at every sample) draws no sea surface. Neighbouring tiles with different grids are joined by their skirts.
- The data build produces one heightmap per tile down to level 5 (tiles of roughly 300 km with samples about 10 km apart). The map is smoothed far more than that (section 4.2), so a deeper level would add size without adding information. Rendered tiles stop at level 5 too (decided by Yang on 2026-10-18: "using so many triangles for a simple coast seems unnecessary"; first level 9), since the smoothed map has nothing finer to show. Normals are exact: the vertex shader carries the gradient of the heights through every step that shapes the surface (the coast cap below and the ice of section 5.2), so the shading is smooth and never shows the blocky stripes that normals from screen-space derivatives gave.
- Heights are stored in whole metres as 16-bit integers with an offset, compressed per tile (section 10.5). The data build clamps the deep ocean floor below −1,000 m, which is never visible and saves space.
- **Simplified map** (decided by Yang on 2026-10-17). The globe shows the Earth's shapes, not all its details. The look is a simple clay globe, like a plasticine world map (decided by Yang on 2026-10-17): soft rounded continents, only the big islands and gulfs, but still with mountains, ice caps and the changing sea level. The data build smooths the elevation with a Gaussian of about 80 km (first 25 km, then 40 km) (decided by Yang on 2026-10-18: Antarctica's smooth look "looks great ... we could use that as example for the other continents. Maybe not as extreme"), smoothing land and continental shelf (above −150 m) separately from the deep sea floor so shelves and land bridges keep their depth. Narrow bays and fjords may fill in. **Polar regions** (decided by Yang on 2026-10-17) matter little for history and are simplified much more: south of 60°S and north of 72°N the elevation is smoothed with a Gaussian of about 150 km and the coast (section 5.1) with one of about 60 km, blending into the normal smoothing over the 10° of latitude towards the equator (from 50°S and from 62°N), so Greenland, the Canadian Arctic and Antarctica have smooth coasts (decided by Yang on 2026-10-17). Antarctica is simplified most (decided by Yang on 2026-10-17): its coast is smoothed with a Gaussian of about 120 km, blending in from 50°S to 60°S. The Bering Strait is a listed strait (section 5.1), so it keeps its sill. **Islands** (decided by Yang on 2026-10-17): tiny islands are not drawn unless history needs them. Islands under 5,000 km² are removed (decided by Yang on 2026-10-17, first 1,000 km²), so island groups such as Indonesia and the Philippines keep only their main islands, except those on the keep list in `data/curated/islands.json`, each named with the reason it matters (such as Thera, Malta, Elba, Saint Helena and Delos) and a source. Every island that stays and is under 60,000 km² (such as Hawaii, Crete, Cyprus, Sicily, Jamaica, Taiwan, and the kept small islands) is drawn larger than it is, so the oversized people of later milestones have room on it: it grows outwards into the sea by 40% of its equivalent radius, at least 6 km and at most 30 km (first 25 km, decided by Yang on 2026-10-17: Hawaii slightly larger), as a low shore sloping down from its coast. Islands from 60,000 to 250,000 km² (such as Honshu, Great Britain, Cuba, Java and Iceland) grow by 15 km, so narrow ones such as Japan read wider (decided by Yang on 2026-10-17). Bigger islands and the continents keep their size. Hawaii shows its main islands: Oʻahu, Maui and Kauaʻi are on the keep list beside the island of Hawaii. The Galápagos are kept as two islands, Isabela and San Cristóbal, for Darwin's visit in 1835 (decided by Yang on 2026-10-17). Bermuda and San Salvador are left off (decided by Yang on 2026-10-17). **Removed areas** (decided by Yang on 2026-10-17): a few groups of small islands and shallow banks that matter little for history but would show as land, at least at low sea level, are left off the map at every date: the Bahama Banks with the Turks and Caicos, the islands and banks between Madagascar and India (the Seychelles and the Mascarene Plateau with Mauritius and Réunion, Lakshadweep, the Maldives and Chagos), and the Faroe Islands and Rockall Bank. They are listed as polygons with a reason in `data/curated/removed-areas.json`, and the build turns them into deep sea floor before anything else, keeping any kept island inside. Island sizes are measured on today's coastline. Only a short, hand-picked list of the rivers history needs most is drawn (decided by Yang on 2026-10-17): the Nile (with the White Nile up to Lake Victoria by its main channel through the Sudd, the Bahr el Jebel, then the Albert Nile and the Victoria Nile, without the side channels; up to the Sudd only until Yang, 2026-10-20: "the white nile extends down to lake victoria"; and the Blue Nile up to where Lake Tana lies, the lake itself being too narrow to draw), Euphrates and Tigris (which join to form the Shatt al-Arab; each drawn only from its `source` in `rivers.json` on, the Euphrates from Raqqa and the Tigris from Mosul, since Yang, 2026-10-21: "make the two rivers shorter. have them start in raqqa and mosul", so no river source lies at Göbekli Tepe), Indus, Ganges, Yellow River, Yangtze, Mekong, Danube with its delta branches, Rhine, Volga, Mississippi, Amazon with its main branches (Madeira, Negro, Xingu and Tapajós), Congo, Niger, and the Zambezi with the Shire, which drains Lake Malawi (added by Yang on 2026-10-20, as the lake read as a stray piece of river without them), taken from Natural Earth by the names listed in `data/curated/rivers.json` and always shown at every zoom (a river's free end near the water, a mouth, is led on to it: down the way the sea's flood came, or straight into a lake or an inland sea such as the Caspian; an end within 15 km of another drawn line is a joint and is not led on. Yang, 2026-10-20: the Volga's mouth was led off across Iran to the upper Indus, and the joint at Cairo drew a third Nile arm), and large lakes (scale rank 4 or lower, and at least 3,000 km² each, so Ladoga, Onega and Vänern stay but the many small Finnish lakes do not) are drawn. The map must stay accurate enough that every historical place sits where it belongs: on the right coast, river or island. From milestone 2 the data build checks that each event and settlement location is on land at its date (or on water for sea events) and fails if not.
- **Raised continents.** Land stands a fixed 250 m (exaggerated with the relief) above the sea level of the date, so continents and islands read as chunky slabs, like a toy (spec section 8). **No walls at any coast** (decided by Yang on 2026-10-17: jagged, icicle-like walls along the Black Sea, the Crimea and Greenland "don't look good anywhere"). Near the sea, land and its lift may rise only as fast as a rounded clay edge allows: the data build stores every sample's distance from today's smoothed coastline (section 5.1) in km, up to 255 km, and the shader softly caps the land's rise above the date's sea level at d × (6 + 0.08 d) metres at d km from the coast (first d × (12 + 0.15 d), softened on 2026-10-18 with the smoother continents), after a flat beach of 2 km. At 100× relief that is a slope of about 30° at the shore, flattening the land within a few km of the sea and leaving mountains further inland alone, so a coast never steps from the exaggerated height to the sea between two neighbouring vertices. The cap uses today's coast for every date: where a lower sea exposes the continental shelf, the shelf is low and flat anyway. Lakes rise under the same cap; ice sheets have their own smooth profile (section 5.2). **Lake shores** (Yang, 2026-10-20: the coasts of the Caspian and of the lakes south of Lake Victoria were jagged): a lake's level is the median height of the land just outside its shore, so the water stands nearly as high as its coast, and around a lake, inland seas included, the land's rise above the lake shrinks smoothly to nothing over the lake's smoothed field towards its shore, so it slopes down to the water instead of standing over it as a wall. **One coast line** (Yang, 2026-10-20: the ink of the Crimea was not at the shore): the coast's ink follows water that counts the sea and lakes alike, so where an inland sea is part lake and part sea at a low sea level (the Black Sea's shelf around 20,000 BCE), no line runs across the water.
- **Famous mountains** (decided by Yang on 2026-10-18: "kilimanjaro, mount fuji, and possibly other mountains are snow capped as well. make mount fuji look like it"). The ranges and peaks history needs most are listed in `data/curated/mountains.json`, each with the reason it matters and a source. A listed range (such as the Alps, the Himalaya and the Andes) keeps the relief smoothed with a Gaussian of only 25 km within its half-width, blending into the normal smoothing over 60 km. A listed peak (Everest, Mount Fuji, Kilimanjaro, Vesuvius, Etna, Olympus, Ararat and Popocatépetl) stands as a smooth cone reaching 70% of its real summit height, falling as (1 − t²)² to nothing at its listed radius (130 km for Mount Fuji, 120 km for Kilimanjaro), so the snow-capped ones carry a broad cap above the snow line (section 5.2). Under a peak the stored coast distance (below) is raised so the coast cap leaves the cone whole, but at most to 10 times its real value, so a peak near the sea still slopes down to the shore.
- **Depressions** (decided by Yang on 2026-10-18: "dead sea looks pretty bad"). Ground below sea level that is never drawn as sea is raised to sea level before smoothing, so it never shows as a steep, jagged pit: dry land that never joins the ocean, such as the Jordan rift with the Dead Sea or the Qattara Depression, and the ends of narrow gulfs that the smoothed coast closes even at today's sea level, such as the head of the Gulf of Suez (Yang, 2026-10-18: "the sinai area is weird. could be smoother").
- Elevation is exaggerated by a factor of 100 relative to the Earth's radius (decided by Yang on 2026-10-17, replacing 12), in the vertex shader, so the factor can be tuned without rebuilding data. The factor and the ice exaggeration (section 5.2) are the same so ice and rock line up. Relief is shown at every altitude, including from orbit, so mountain ranges stand out of the planet's outline.

### 4.3 Terrain painting

- The colours are saturated and warm, like painted clay: rich greens, golden steppe, orange-red deserts, warm grey-brown rock and soft white snow, with large soft patches instead of fine speckle. Until the textures below are approved, the shader paints these colours directly.
- The ground is splat-mapped from six painted tiling textures: grass, forest floor, soil and steppe, sand, rock and snow (spec section 8). Splat weights are computed in the shader from elevation, slope, latitude and a climate band.
- The climate band shifts with the date: at the height of the ice age, tundra and steppe reach far further south and deserts are wider, and both relax towards today's pattern as the ice retreats. The band is driven by the same glacial index as the ice (section 5.2), so ground and ice always agree. This is a deliberately broad approximation and is described as such in the About panel.
- **Deserts change with history** (decided by Yang on 2026-10-17). They follow the annual precipitation of Beyer, Krapp and Manica 2020 (0.5°, every 1,000 to 2,000 years from 54,000 years ago): aridity is 0 (green) at 600 mm a year or more and rises linearly to 1 (full desert) at 100 mm or less. Where the dataset has no value (the sea of its time, and south of 60°S), cells take the value of the nearest land, so coasts are not greened by the sea. The build evaluates it at each of the dataset's own time steps on a global 1° grid and stores it in the climate slices (section 5.2). The ground turns to steppe and then sand as aridity rises.
- **Green Sahara** (decided by Yang on 2026-10-17: "the Sahara wasn't always a desert"). Climate models, Beyer 2020 among them, are known to miss most of the rain of the African Humid Period, so the dataset keeps the Sahara a desert at every date. A curated override in `data/curated/humid-periods.json` raises the precipitation over North Africa and Arabia to at least 600 mm a year south of 20°N (enough to draw it green), falling to 450 mm at 25°N, 300 mm at 29°N and 150 mm at 32°N, fading out over 3° outside the region, while the period lasts: it starts abruptly about 14,800 years ago (about 12,800 BCE), weakens to half during the Younger Dryas cold spell (about 12,900 to 11,700 years ago), is at its full strength from about 11,000 to 6000 years ago and ends from about 5500 to 4800 years ago (about 3500 to 2800 BCE), when the Sahara becomes the desert of today. The Sahara is therefore drawn as savanna, grassland and steppe through the early farming era and turns to sand as Egypt's first dynasties rise. Sources: deMenocal et al. 2000 (Quaternary Science Reviews, abrupt onset and end of the African Humid Period), Tierney, Pausata and deMenocal 2017 (Science Advances, rainfall of the Green Sahara) and Shanahan et al. 2015 (Nature Geoscience, the time-transgressive end). The dates are approximate and named in the About panel.
- Lakes from Natural Earth are drawn as flat water at their surface height. A lake narrower than about twice the coast blur never fills its smoothed field (it never reaches 160 of 255) and would show as a pit with a speck of water, so it is left off the map with its basin: about 28 lakes, among them Lake Albert, Lake Turkana, Lake Tana, the Aral Sea, the Great Salt Lake, Lake Van and Issyk-Kul (decided by Yang on 2026-10-18: "there are two dips north of victoria lake. let's remove them completely", and to remove all such lakes). Large rivers are drawn as wide, smooth bands of water with an ink outline, much wider than real rivers so they match the oversized people of later milestones (decided by Yang on 2026-10-17): the build smooths each river centreline into a curve and stores a river field per sample that is full within the river's core (about 12 km either side for the rivers Natural Earth ranks largest and 9 km for the others) and falls to zero over a further 30 km. Water is drawn where the field passes one half, so the banks are smooth curves at every zoom, and rivers keep the same width on the ground at every camera height.
- **Smooth water at every zoom** (decided by Yang on 2026-10-17). The ocean level, lake field and river field of each tile are also uploaded as a small texture, and the fragment shader samples them with a cubic B-spline filter, so coastlines, lake shores and river banks are smooth curves even when the camera is closer than the data's sample spacing, instead of straight segments along the triangles. The vertices still use the same fields to place the land and water surfaces.
- **Rivers reach the sea at every date** (decided by Yang on 2026-10-17). Natural Earth rivers end at today's coast, so the build continues each river mouth downhill across the land that the lower sea levels of the past expose, along the steepest way down the smoothed elevation and the ocean mask, until it reaches sea floor that is sea at every date (below −130 m) or a lake. In a flat basin with no way down (such as the Volga delta at the Caspian) it heads straight for the nearest water within 80 km, and every river runs on sixteen cells (about 90 km) past its mouth so the smoothed shore, which can lie well out from the mask's, never cuts it off (Yang, 2026-10-20: a delta arm of the Nile ended short of the sea around 19,100 BCE). Where the sea is higher, the continuation lies under water and is not seen.
- **Rivers flow** (decided by Yang on 2026-10-17). Lighter pulses travel down every river towards its mouth, like the waves on the sea. The build stores, per sample, the distance along the river in units of one pulse spacing of 150 km, measured downstream (the mouth is the end with the lower elevation). The pulses are animated by the life clock and stop when everything is frozen; the low tier shows them still.
- **Smooth lakes** (decided by Yang on 2026-10-17). Lake outlines are smoothed like the rivers: the build blurs each lake's mask with the coast's Gaussian (about 28 km) and stores the result as a field from 0 to 1 per sample, and water is drawn where the interpolated field passes one half, with an ink outline.
- The six textures are generated assets and ship only after Yang approves them (section 12).

### 4.4 Water

- **The sea is completely flat** (decided by Yang on 2026-10-17). It is drawn as its own surface exactly at the date's sea level (a few metres below, so it never fights the land for depth), covering every terrain tile with a coarse grid of its own (8 × 8 cells per tile). On tiles that are sea at every date, the sea surface also carries the ice over the sea (section 4.2). The terrain surface leaves out every point the smooth ocean field (section 5.1) marks as sea, and its sea floor and the foot of its coast lie below the sea surface, so the water never slopes up a shore or follows the relief. The coastline is where the smooth field crosses the sea level, drawn with its ink line on both surfaces. The terrain's own edge meets the sea exactly there: its height above the sea never exceeds 8 times the metres its smooth ocean level stands above the sea, and the sea-side vertices dip below the sea (at most 1,000 m) by the same rule, so between two vertices the terrain crosses the sea level where the field crosses it and the coast line is a smooth curve, never a ragged fringe that follows the triangles (Yang, 2026-10-23). The limit applies within 15 km of the coast and fades out beyond it, so inland relief is untouched. The planet query applies the same limit. Where a river meets the sea, the river runs on over the water for a few metres of ocean level past the coast line (where its field is above half the river threshold), drawn as river with no coast line across it, so no line parts the river from the sea (Yang, 2026-10-23: a fine line separated the Nile from the Mediterranean). The flat sea is drawn only where the ocean is (the smooth ocean field above the sea level); on the land side of the coast the terrain alone is drawn, so the sea never paints dashes of land colour along a narrow strip of beach, such as the one between the Yellow River and the sea (Yang, 2026-10-23). The sea surface draws only the sea and its coast line, so land lying below the sea level away from the sea (such as the Dead Sea or the low ground at the head of the Gulf of Suez) shows its own ground and never a ghost of the sea surface through it. A sea that the ocean reaches inside a lake basin (such as the Baltic) is sea and lies at the sea level too. The sea has one colour at every depth, with no lighter shallows along the coasts (decided by Yang on 2026-10-17). Lakes and rivers use the same blue (decided by Yang on 2026-10-18; first a slightly lighter blue).
- The sea is a bright, saturated blue that looks like glossy plastic, with a lighter sheen towards the globe's edge but no reflection of the light.
- **Waves and texture** (decided by Yang on 2026-10-17). The open sea carries a stylised cartoon pattern rather than a flat colour: soft lighter ripple bands of long wavelength (several times the spacing of the first version, decided by Yang on 2026-10-17) that drift slowly, small white wave crests scattered over the water that appear and fade, and a gentle swell in the shading. The pattern lives in world space so it stays put as the camera moves, and it does not change size with the zoom (Yang, issue 137: waves based on the zoom level looked wrong, most of all in the startup zoom from the small globe): it has one fixed wavelength (features of about 64 km, decided by Yang on 2026-10-22: overlapping waves of different wavelengths looked bad), so there is never a second size of wave on screen; zooming only fades the pattern out when its features would shrink below about 3 pixels or grow beyond about 600, so it does not slide or rescale, and it still reads from a high orbit down to a close-up. It does not mark depth, so there are still no lighter shallows. The large lakes and inland seas, such as the Black Sea and the Caspian, carry the same waves (decided by Yang on 2026-10-17); since only lakes of at least 3,000 km² are drawn, every drawn lake has them. Rivers stay without waves.
- The waves are animated by the clock (section 3.3). Animation stops when history is paused.

### 4.5 Sky and horizon

- There is no atmosphere glow around the globe, no haze over distant terrain and no stars (decided by Yang on 2026-10-17). From orbit the globe sits on a soft pastel background, muted peach at the bottom of the screen fading to lilac and sky blue at the top, like a studio backdrop, a little darker than the first version (decided by Yang on 2026-10-18).
- **Clouds.** About 30 big puffy cartoon clouds, each a cluster of soft white balls, float above the highest mountain (centres 1,400 km up on the exaggerated globe, Yang, issue 149: clouds must not cut into terrain) and drift slowly around the globe on the clock (still when history is paused). Their places come from a seeded hash, so they are the same for every viewer. They carry no weather meaning. **Clouds come and go** (Yang, issue 133: "clouds are too static ... they sometimes grow by adding more groups, sometimes they shrink, sometimes new ones appear, sometimes they shrink to completely disappear, like in a timelapse of the sky, but slowly, otherwise it will look busy"): each cloud lives a cycle of 6 to 10 minutes of the clock (hashed per cloud, with its own phase). In the first part of its life its balls appear one after another, the middle ones first and the outer ones later, each swelling from nothing, so the cloud grows by adding groups; in the last part they shrink away in the same order from the outside in until the cloud has vanished. A cloud then comes back in a new hashed place (still drifting with the clock) for its next cycle, so the sky slowly turns over while the count stays about 30. Which balls stand, and how big, is a pure function of the clock, so scrubbing and fast forward show the same sky at the same time and a pause freezes it. They shrink away as the camera comes down, between 5,000 km and 3,000 km, about when Europe fills the screen (decided by Yang on 2026-10-18), so they never block a closer view, and are drawn in one batch; they are never dissolved in a screen-door pattern, which looked like dithering (Yang, issue 145).
- Close to the ground the sky behind the horizon fades from blue at the zenith to a paler blue at the horizon, so a low view does not look like space.
- The ink outline of the globe's edge fades out as the view tilts from 42° to 58° away from straight down, so at low angles it never cuts across the mountains in front of the horizon (decided by Yang on 2026-10-18).
- The curved horizon comes naturally from the sphere: as the camera comes down it tilts towards the horizon (section 6), giving the look of Populous: The Beginning.

## 5. The planet over time

Everything in this section is a pure function of the date, computed from data, so scrubbing to any date shows the coastline and ice for that date at once.

**One planet query.** Sea level, whether a place is sea, ice cover and the height of the drawn ground at a place and date are answered by one planet query (`src/planet`). It samples the terrain data the way the terrain mesh does (heights bicubically, the ocean level, lake field, bed and coast distance bilinearly) and applies the same rules as the terrain shader (sea, lakes, the land lift, the rounded coast of section 4.2 and the ice domes of section 5.2), and the shader takes its constants from the same module. Everything placed on the ground, such as figures, trees and the camera's lowest height, therefore stands on the drawn surface rather than floating above it or sinking into it.

Sea level, ice and deserts come from published reconstructions (decided by Yang on 2026-10-17, replacing the hand-made models of the first drafts): ice thickness and sea level from PaleoMIST 1.0, and precipitation from Beyer, Krapp and Manica 2020 (section 4.1). Both are read from the small extracts under `data/sources/`. The main periods they show:

| Period (approximate) | Ice | Sea level |
| --- | --- | --- |
| 50,000 to 29,000 BCE | Mid-sized ice sheets (a milder phase of the last ice age) | About −50 to −90 m |
| 24,000 to 17,000 BCE | Last Glacial Maximum: ice at its largest | About −120 m |
| 17,000 to 9700 BCE | Fast melting; the ice age ends about 9700 BCE | Rising to about −50 m |
| 9700 to 5000 BCE | Scandinavian and North American ice gone | Rising to roughly today's level |

### 5.1 Sea level and coastlines

- **Sea-level curve.** Global mean sea level relative to today: for every PaleoMIST time step (every 2,500 years), the build averages the relative sea level over today's ocean, weighted by area, and interpolates smoothly (monotone cubic) between the steps so the sea never rises in visible jumps. It is stored every 100 years in the startup index (section 10.2) with its source.
- **Ocean mask.** A coastline cannot simply be "everywhere below sea level", because inland basins such as the Caspian Sea and the Dead Sea lie below today's sea level but are not part of the ocean. The data build therefore computes, for every terrain sample, the lowest sea level at which that sample is connected to the open ocean (a priority flood fill outward from the deep ocean, seeded from sea floor deeper than 3,000 m, in 1 m steps from −130 m to +10 m, on the 4 arc-minute elevation grid). The flood runs on the elevation before smoothing (section 4.2), so straits and sills keep their true depth. Straits that are narrower than the grid, or that the smoothing of the coast (below) would close, are listed in `data/curated/straits.json` (such as Gibraltar, the Bosporus, the Dardanelles, the Sea of Marmara between them, Bab-el-Mandeb, Hormuz, the Øresund, the Great Belt and the Kattegat between Jutland and Sweden, Kerch, Messina, Dover, the North Channel between Ireland and Britain, Tsugaru between Honshu and Hokkaido, the Sunda Strait, Cook Strait, the Strait of Malacca, the Qiongzhou Strait south of Hainan, Palk Strait, the Strait of Belle Isle, the ʻAlenuihāhā Channel in Hawaii, the channel between Corsica and Tuscany, La Pérouse and Nevelskoy around Sakhalin, and the Lombok Strait between Bali and Lombok, on the Wallace Line, about 250 m deep, so Wallacea is never joined to Asia (Yang, 2026-10-20: "make sure that wallacea was never joined to asia, ever"; the smoothing had closed it at low sea levels; and issue 131: "the Wallace line must remain a water separation", at 24,000 BCE land connected Australia and Asia, so the Makassar Strait is listed in two parts, deep over 1,500 m in the north and over the 650 m Dewakang sill in the south, and the Sulu and Mindoro passages close the Philippine route from Borneo and Palawan to Mindanao and the Visayas; the Lombok line runs on south past Nusa Penida to the Indian Ocean, so Sundaland, Wallacea and Sahul are separate land masses at every sea level of the last 100,000 years)), each as a line with its sill depth and a source, running well out into open water on both sides; the build carves each line to its sill depth before the flood and draws it at least 24 km wide (first 12 km, decided by Yang on 2026-10-17: Denmark and Sweden, and Sicily and Italy, ran together), so a strait is open exactly when the sea level is above its sill. A narrow sea that the smoothing would erase can be listed the same way with a wider core: the Sea of Marmara is a line along its length with a 25 km half-width core (decided on 2026-10-18: without it the Bosporus led into land). The Adriatic Sea is a chain of such lines from the Strait of Otranto to the Gulf of Trieste, each with the depth of its own sill (about 780 m at Otranto, 170 m at the Palagruža sill into the Mid-Adriatic Depression, 75 m and 35 m further north) and a 30 to 60 km half-width core, so Italy and the Balkans are never joined and the shallow northern Adriatic is dry land in the ice age and floods as the sea rises (Yang, 2026-10-18: "adria is not open. italy is connected with the balkans"). Narrow gulfs that shape a coast the history needs are listed the same way, from the open sea to the gulf's head: the Gulf of Suez and the Gulf of Aqaba, so the Sinai peninsula keeps its shape (Yang, 2026-10-18: "the sinai area is weird"; the Red Sea ended in one rounded lobe). The Black Sea, the Caspian Sea and the Baltic Sea are flooded as permanent lakes at fixed levels (0 m, −28 m and 0 m) within their own basins (a bounding box per sea, listed with the levels in `data/curated/inland-seas.json`, so the flood cannot leak through a strait into the ocean), so a sea that the falling ocean cuts off is drawn as a lake, never as dry land (decided by Yang on 2026-10-17). Where the ocean reaches such a basin, it is drawn as sea (decided by Yang on 2026-10-17: the Baltic is part of the Atlantic), with the sea's colour and waves; only while it is cut off is it drawn as a lake. The sea then fills the basin's smooth lake outline (the build gives every point of the lake field the level at which the nearest point of the basin joins the ocean, raised by 2 m for every step the field lies below one half, so the level follows the smooth field), so no strip of lake, and no raised lake rim, is left along its shores.
- **Smooth coasts** (decided by Yang on 2026-10-17). Coasts are smoothed like the rivers: after the flood, the build first grows every coast 34 km out into the sea (the maximum of the connection level over a 34 km disc; first 16 km, raised with the stronger blur on 2026-10-18 so peninsulas and islands about 20 km wide survive it), then blurs it with a Gaussian of about 28 km (first 8 km, then 20 km, decided by Yang on 2026-10-18 with the smoother elevation) (treating land that never joins the ocean as +40 m), takes the minimum with the carved straits, and stores the result. The growth makes up for the blur, which on its own wears coasts back by about 14 km, so peninsulas and islands are kept and come out slightly larger rather than smaller (decided by Yang on 2026-10-17: Italy had lost its heel and toe). Straits narrower than about 50 km would close, so the important ones are listed (above). The coarse tiles seen from far away sample the coast more sparsely, so for every quadtree level whose samples lie 30 km or more apart the build makes its own coast field: grown by 0.4 and blurred by 0.5 of the sample spacing, with the straits laid in again at least half a spacing wide. Italy, Greece and the Crimea therefore keep their shape from orbit too. A sample is sea when this smoothed value is at or below the date's sea level, whatever its height, and the water depth used to draw the coastline between vertices is the difference between the two. Coastlines are therefore smooth curves at every sea level, and features smaller than about 28 km, such as islets and narrow inlets, disappear (kept islands are enlarged first, section 4.2). The smoothed level is stored in centimetres, so flat coasts do not move in whole-metre steps. Natural Earth lakes are flat water at the 20th percentile of the heights along their shore. The value is stored as an extra channel of each terrain tile.
- **Known simplifications**, named in the About panel: the land surface is today's, so the sinking of land under the ice sheets and its later rebound are not shown; past lakes that no longer exist (such as the glacial Lake Agassiz) and the Black Sea before it joined the Mediterranean are not shown in this milestone.
- **Teaching moments the data must show** (exit criterion 1): Beringia joining Siberia and Alaska, Doggerland joining Britain to the continent, and Sundaland joining Sumatra, Java and Borneo to mainland Asia, each opening as the sea falls and drowning as it rises again. Sahul (Australia joined to New Guinea) shows too.

### 5.2 Ice sheets

- **Data.** Where the ice is comes from the grounded ice thickness of PaleoMIST 1.0 (0.25°, every 2,500 years from 72,500 years ago to today). Only whether a place is covered matters, not how thick the ice is (decided by Yang on 2026-10-17: the 14 MB of ice data was far too much). **Climate slices**: for each time step of the climate data (every 1,000 to 2,000 years, the ice interpolated linearly between its own steps), the data build makes one small global file on a 0.5° latitude-longitude grid holding the ice cover and, on a 1° grid, the aridity (section 4.3). Ice is covered where the smoothed thickness (below) reaches 60 m. Gaps up to 200 km between two sheets, over land or sea, are then filled (a morphological closing of the ice by 100 km), so neighbouring sheets such as those of the Canadian Arctic and Greenland merge; gaps up to 200 km of land between ice and the sea are filled too (a closing of the ice together with the sea that adds only land); and the ice runs 80 km out over the sea it meets, so no strip of bare coast shows between ice and sea (decided by Yang on 2026-10-18: "how come the ice sheet in the arctic does not merge", "ice sheets should merge"). Since the smoothing below can reopen a filled gap next to open water, the smoothed cover is closed once more, and around what that adds the field takes the lightly smoothed (25 km) distance of the closed cover where it is larger; the file stores the signed distance from the ice border in steps of 4 km (positive inside the ice, from 128 km outside to 892 km inside), smoothed with a Gaussian of 30 km (60 km in the polar regions and 120 km south of 60°S), so the border is a smooth curve and small ice-free patches inside a sheet do not show. Between two slices the renderer blends the distances, so the border moves smoothly as the ice grows and melts.
- **Smooth domes** (decided by Yang on 2026-10-17: the ice sheets were not smooth, "fewer polygons!"). The ice surface is drawn from the distance alone: it stands on the heavily smoothed bed that the terrain tiles carry (the elevation averaged to about 0.5°, never below the sea level) and rises from its border like a dome, 1,200 m × (1 − e^(−d / 250 km)) at d km inside, at the relief's exaggeration. The relief under the ice is hidden, and the ice rises from the sea or the land, over the first 120 km, so the sheets are plain smooth domes with gentle edges, shaded by their own surface, with no walls where they meet the sea or the land. The polar regions (north of 74°N and south of 62°S) are drawn with tiles no finer than level 4, since their smoothing leaves no detail for finer tiles.
- The land surface stays today's: the sinking of the land under the ice is not shown, so ice is drawn on today's bedrock.
- **Glacial index.** The ratio of the date's sea level to the lowest sea level of the curve, from 0 (today) to 1 (glacial maximum), drives the climate band in section 4.3.
- The ice border is drawn where the blended distance crosses zero, sampled per pixel, so it is a smooth curve with a smooth ink outline rather than following the vertex grid (decided by Yang on 2026-10-17).
- Today's coastlines get no ink where ice covers them, so buried coasts do not show through the ice sheets.
- **Polar ice sheets** (decided by Yang on 2026-10-17). The relief under the polar ice is not useful for history. Where the polar simplification applies (section 4.2), the build smooths the thickness before deciding the cover: it averages the bed plus the ice over a disc of about 120 km (250 km south of 60°S) and subtracts the bed again, and towards the margin it thins by the share of the disc that holds ice. South of 60°S, land with ice nearby is always covered, so Antarctica's ice reaches its coast.
- **Arctic pack ice** (decided by Yang on 2026-10-17). The Arctic Ocean has carried sea ice all year through the whole timeline. It is drawn as a flat, pale ice cover on the sea north of a gently wobbling edge near 78°N today, reaching 70°N at the glacial maximum (moving with the glacial index), with an ink outline. This is a simplified extent, named in the About panel. Past the pack edge the ice sheets and the pack ice read as one ice (decided by Yang on 2026-10-18): no ink line where they meet, and the sheets reach over the pack and over narrow strips of shore up to 80 km away, the reach growing smoothly from nothing at the pack edge. Only the ice sheets reach out, not the mountain snow caps: the caps' field reached over low Arctic coasts and whitened them, with jagged bare holes along the shore (Yang, 2026-10-19: "north pole has these jagged coast under the ice sheet that clips through").
- **Snow caps** (decided by Yang on 2026-10-18, replacing the snow and glacier painting of 2026-10-17: ice on the mountains had no ink border, "I would like to consistently have borders. We can simplify the ice on the mountains a bit"). High mountains turn to rock towards a snow line and carry simple merged ice caps above it, drawn as ice with the same white surface and ink outline as the ice sheets. The snow line is 3,600 m of smoothed height up to 20° of latitude, 3,000 m at 28° (so the dry subtropical hills such as Sinai, the Red Sea hills and Arabia stay sand-coloured instead of turning to blotchy rock), 1,600 m at 36°, 1,500 m at 46°, 800 m at 65° and 400 m from 75°, moving 12° towards the equator at the glacial maximum with the glacial index. A place is under a cap where it stands above the snow line and also more than 300 m above the heavily smoothed bed, so flat high plateaus such as Tibet and the Altiplano stay bare. The metres above that limit count as ice distance (10 km per 100 m), so a cap and an ice sheet share one field and one outline where they meet. Plants keep clear of caps as they do of the ice sheets.
- Ice is drawn as a raised, glossy white surface with soft blue shading, like icing on a cake, with the same elevation exaggeration as the land, cracked blue edges where it meets the sea, and a soft edge where it ends on land. The Laurentide and Fennoscandian ice sheets must read clearly from orbit at 20,000 BCE and be gone by about 5000 BCE, apart from Greenland and Antarctica, which stay.

## 6. Camera

### 6.1 Range and behaviour

- The camera orbits a target point on the globe. Its distance ranges from 2.6 Earth radii (the whole planet with room around it), or further on a narrow phone screen so the whole globe fits across it, down to 1,300 km above the surface, where Spain fills the screen (decided by Yang on 2026-10-18: "it's also not great to allow too high zoom levels"; first about 2 km).
- Tilt follows altitude by default: looking straight down from 6,000 km and above, tilting gradually to 40° at the closest zoom, so close up the view looks across the land. The viewer can tilt to any angle between straight down and nearly level (85°) at every altitude, with the controls below (decided by Yang on 2026-10-17; the two tilt buttons under the compass were removed by Yang on 2026-10-19).
- The camera never goes below the terrain or ice surface and slides up over mountains as it moves. The height of the target point follows the surface with a short easing, so the view never jumps where the raised land meets the sea or as finer tiles arrive (decided by Yang on 2026-10-17, after jitter when zoomed in).
- Movement has gentle inertia. Rotation speed scales with altitude so the ground moves at a similar speed on screen at every zoom.
- North stays up unless the viewer rotates the heading; a compass button resets heading and tilt.

### 6.2 Controls

| Action | Mouse | Touch | Keyboard |
| --- | --- | --- | --- |
| Move over the globe | Left drag | One-finger drag | Arrow keys or W A S D |
| Zoom | Scroll wheel | Pinch | + and −, or Q and E |
| Tilt | Right drag up and down | Two-finger drag up and down | Page Up and Page Down |
| Turn heading | Right drag left and right | Two-finger twist | , and . |
| Zoom in to a point | Double-click | Double-tap | |
| Reset heading and tilt | Compass button or right double-click (Yang, 2026-10-20) | Compass button | N |

**Grabbing the globe** (Yang, 2026-10-20: "I want the feel of google earth"). A left drag or one-finger drag grabs the point of the globe under the pointer and keeps it under the pointer wherever it goes, at the globe's middle and its edge alike (past the edge, the nearest point of the outline is held): the whole view turns about the globe's centre, heading included, and nothing about the poles is special, so a drag passes straight over them. Let go while moving, the globe keeps turning the same way and slows to rest within about a second; held still for a moment before letting go, it stays. A drag that turns the heading by less than 20 degrees (30 until Yang, 2026-10-20: "30 degrees is too much"), from when it began to when it is let go, did not mean to turn it (Yang, 2026-10-20: "if the dragging is not changing the orientation of the pole axis significantly, the user does not intentionally want to change the pole axis"): once let go, north eases back to where it pointed before the drag, over about a second, while the globe stays where it was moved to; any other input stops the easing. Over the globe the pointer is an open hand, closed while the globe is held. Right drag still tilts (up and down) and turns the heading in place (left and right).

Keyboard controls are active whenever focus is not in a text field. Touch gestures on the globe never scroll or zoom the page.

### 6.3 Fly-to

The camera has one fly-to operation used by bookmarks now and by events and famous people later: it moves to a target position, distance, tilt and heading along an arc that rises with the distance travelled, taking 1 to 3 seconds. Any input during a flight stops it where it is. With the system setting for reduced motion, flights are shortened to a quick fade.

## 7. Timeline

### 7.1 Layout

- The timeline is a strip along the bottom of the screen, drawn on a canvas, with its minimize and expand buttons built into its left edge. It has a date readout, the playhead, a lane "World" and one lane per region in the order of spec section 7.1.
- Lanes show the era ranges from [eras.md](eras.md). The World lane uses a fixed colour per era; regional ranges use the colour stored in their record in `data/curated/eras/` (later the colour of their polity, shared with the border overlay). Overlapping ranges in one lane stack into sub-rows. The lanes and their order come from `data/curated/vocab/lanes.yaml` ([content-format.md](content-format.md#1-records) section 1).
- A range's label is drawn inside it when it fits, otherwise it is shortened with an ellipsis and shown in full on hover or tap, together with its dates. German labels are about a third longer, so layout never assumes English widths.
- **Collapsed (the default on every device):** the timeline shows only the lane of the region the globe is centred on, which changes as the viewer moves the globe (decided by Yang on 2026-10-17). The collapsed timeline always keeps the height of the regional lane with the most sub-rows, so moving the globe to another region never changes its height or shifts the controls above it (decided by Yang on 2026-10-18); a lane with fewer sub-rows sits at the top and leaves the rest empty. The region comes from a coarse region lookup table built by the data build. A button at the left edge of the timeline, inside its frame (decided by Yang on 2026-10-18), expands it to the World lane and all regional lanes, taking at most about a third of the window height on desktop and two thirds on phones, and collapses it again. The choice is saved with the settings.
- **Minimized** (Yang, 2026-10-19: "add a toggle to the left side of the timeline bar that minimizes it to just year number without event ranges"). A button at the top of the timeline's left edge, above the expand button, shrinks the timeline to its ruler of years alone, without lanes or era ranges, and shows a chevron pointing down ("Show only the years", "Nur die Jahre zeigen"). While minimized, the expand button is hidden and the button shows a chevron pointing up ("Show the eras", "Epochen zeigen"), which brings back the collapsed or expanded lanes as they were. A first visit opens minimized (Yang, 2026-10-20: "when the app is opened the first time, the timeline is fully collapsed"). The choice is saved with the settings.
- **Scrolling lanes.** Rows are at most 18 and at least 11 CSS pixels high, so labels stay readable. When the expanded lanes do not fit in their height even at 11 pixels (the ten lanes of [eras.md](eras.md) need more than 50 rows), the ruler stays fixed at the top and the lanes scroll vertically beneath it: drag up or down on the lanes, or turn the mouse wheel with Shift held. A thin bar at the right edge shows which part of the lanes is in view. A drag that starts sideways still pans and the wheel alone still zooms. Collapsing and expanding again starts at the top.

### 7.2 Axis and zoom

- The default axis is **linear in watching time** (spec section 2; decided by Yang on 2026-10-19, replacing the logarithmic axis of 2026-10-18): a day sits at the clock time at which it begins divided by the 24 hours of the whole timeline, from 0 at 70,000 BCE to 1 at the end (`app/src/time/axis.ts`, continuous between the knots of the curve, for drawing). It gives about 3 % to 70,000 to 50,000 BCE, 13 % to 50,000 to 10,000 BCE, 10 % to 10,000 to 3000 BCE, 13 % to 3000 to 500 BCE, a third to 500 BCE to 1500, 15 % to 1500 to 1800 and 13 % to 1800 to 1991. The axis is used for drawing the timeline and for the content time windows (section 10.3).
- The playhead moves across the axis at an even pace while playing at one speed.
- The toggle "True time scale" switches to a linear axis in years, where all of written history is a thin sliver at the right end. The switch animates over about half a second and keeps the playhead in place.
- The timeline zooms from the whole of history down to about a single year across its width: scroll wheel or pinch over the timeline. There are no zoom buttons (removed by Yang on 2026-10-18). Tick labels adapt to the zoom (10,000 years, 1,000 years, 100 years, 10 years, 1 year) and are formatted per language.
- By default the visible window follows the playhead while playing; dragging the timeline background pans it and stops following until the play button or a "follow" button is pressed. The follow button sits at the right edge inside the timeline and shows only while the timeline is not following.

### 7.3 Scrubbing

- Dragging the playhead, or pressing on the timeline and dragging, scrubs the date. The globe updates live: sea level, ice and climate band follow the playhead every frame at 60 fps on desktop (section 11). **No flicker while scrubbing** (decided by Yang on 2026-10-17): ice and deserts come from the global climate slices (section 5.2), which are all loaded soon after start and kept on the graphics card, so scrubbing only changes which two slices are blended and by how much, for the whole globe at once; nothing is loaded tile by tile and nothing pops. Until a slice has arrived, the nearest loaded slices stand in for it (section 10.7).
- Clicking a point on the timeline jumps there. Tapping an era range shows its name and dates; it does not jump.
- Keyboard: Home and End jump to the start and end; with focus on the timeline, left and right arrows step by one tick of the current zoom.

### 7.4 Era data

`data/curated/eras/` holds the ranges of [eras.md](eras.md) as records in the format of [content-format.md](content-format.md), one file per range: id, lane, `when` (converted to whole days, with approximate flags per end), colour, at least one source from `data/curated/sources.yaml`, and a title in `en` and `de`. The lanes come from `vocab/lanes.yaml` and `vocab/regions.yaml`. The data build validates them like all content (section 10.8) and writes them into the startup index. Events are not shown on the timeline in this milestone.

## 8. Interface shell

### 8.1 Screen layout

- The globe fills the screen. Text on buttons, the speed selector, the date ribbon and the timeline cannot be selected, so clicking and dragging never highlights it (decided by Yang on 2026-10-17); text in the About panel and in cards can be selected. The timeline runs along the bottom. Above its left end sit the play controls (Yang, 2026-10-19), left to right: the back button, the play/pause button, the forward button, the date and the state readout. The back button shows a counter-clockwise circular arrow around the number 10, the forward button a clockwise one; a click jumps 10 seconds of watching time back or forward (section 3.3). They have no pop-up of choices. The play/pause button shows the usual icons, a triangle while paused and two bars while playing (Yang, 2026-10-19: "change the play and pause button icon to the regular play and pause icons"; it showed the icon of the current speed mode before); a click plays or pauses; pointing at it still pops up the four speed modes above it, and the one picked is shown as chosen there and saved. While paused the button pulses gently. The state readout beside the date shows the rate as a bare number of years per minute while playing (history's rate at the date times the speed factor, section 3.3), a pause sign (⏸) while paused, and fast-forward or fast-reverse arrows (⏩, ⏪) while a jump is under way; its full meaning is its explanation and accessible name. Explanations: "Back 10 seconds", "Forward 10 seconds" ("10 Sekunden zurück", "10 Sekunden vor"). The top-right corner holds two buttons: bookmarks and settings (the About button was removed by Yang on 2026-10-19; the About panel opens from the settings panel, section 8.5).
- Sliders fold away behind icon buttons, so the screen stays calm (decided by Yang on 2026-10-18). The four speed-mode buttons (section 3.3) fold away behind the play/pause button (the history lens slider, which folded behind a magnifying-glass button, was removed by Yang on 2026-10-19: the lens is fixed at 120%, [history-lens.md](history-lens.md) section 1). Pointing at a button shows a short explanation of what it does, and the slider slides out beside its button while the pointer is over the button or the slider. The speed modes pop up above the play/pause button as a column of bare buttons as wide as it, with no box around them, the fastest at the top and the slowest nearest the button, so they never cover the date beside it (Yang, 2026-10-18; icons by Yang the same day: turtle, walking person, galloping horse; the cheetah added on 2026-10-19). Both fold away when the pointer leaves. On touch screens, where nothing can be pointed at, a tap on the play/pause button only plays or pauses, and pressing and holding it for about half a second opens the speed modes instead, as pointing does (Yang, 2026-10-19: "tap and hold should act as hover"); the hold does not also play or pause. Tapping anywhere else folds them away again. They also open while they have keyboard focus. The play/pause explanation is "Play history; the buttons above it set the speed" ("Geschichte abspielen; die Knöpfe darüber stellen die Geschwindigkeit ein"), or "Pause history; …" ("Geschichte anhalten; …") while playing. The speed modes are named "Slow", "Regular", "Fast" and "Fastest" ("Langsam", "Normal", "Schnell", "Am schnellsten").
- The date readout is large and clear above the timeline's playhead area, in the format of section 3.2.
- All controls are at least 44 by 44 CSS pixels on touch devices, have visible focus outlines, and have accessible names in the current language.

### 8.2 Settings

| Setting | Values | Default |
| --- | --- | --- |
| Language | English, Deutsch | Browser language if German, otherwise English |
| True time scale | On, Off | Off |
| Show performance stats | On, Off | Off |

The language names in the selector are always written in their own language. Changes apply immediately and are saved (section 9).

Below the settings is a button "Copy place and time" ("Ort und Zeit kopieren") (Yang, 2026-10-23). It copies the current view to the clipboard as one line of plain text, the same in both languages apart from the formatted date: the date as the readout shows it (section 3.2), the whole-day number, the camera's latitude and longitude in degrees to four decimals, its height in km, heading and tilt in degrees, for example `14 June 1805 | day 123456 | lat 37.5000 lon 119.0000 | alt 1300 km | heading 0 | tilt 0`. For about two seconds the button's label reads "Copied" ("Kopiert"); if the browser refuses the copy it reads "Copy failed" ("Kopieren fehlgeschlagen"). Nothing is saved.

### 8.3 Events and bookmarks

The bookmark button in the top-right corner opens a large dialog centred on the screen, over the globe (Yang, 2026-10-20), with two tabs: **Events**, the first and the one it opens on, and **Bookmarks**. Each tab has a search field above its list, which filters it as one types, by name and region, ignoring case and accents. The dialog closes with its close button, the Escape key or a click outside it; while it is open the globe does not take input. Tab names: "Events" and "Bookmarks" ("Ereignisse" and "Lesezeichen"); search placeholders "Search events" and "Search bookmarks" ("Ereignisse suchen", "Lesezeichen suchen").

- **Events** lists the events the globe shows, in chronological order, as rows with four columns (Yang, 2026-10-20): a button to travel there, the year (section 3.2) in plain text, the name, and the region (the timeline lane of the region the event's place lies in, section 7.1; on a phone it stands under the name). Choosing a row or its button closes the dialog and travels there: the camera flies to the place (section 6.3), looking straight down from a height that shows the band or scene, while history runs fast forward or backward to the date in the same time, easing in and out with the flight, as a time lapse; the play state stays as it was. They are:
  - **Arrivals in a new continent** (Yang, 2026-10-20: "crossing into a new continent is ok. otherwise too many uninteresting events"): the arrival points of the peopling routes marked `continent` in `arrivals.json` (the crossing of the Bab-el-Mandeb into Asia, Sahul, the Beringia land bridge into the Americas, Monte Verde in South America; Bacho Kiro in Europe is not an event, Yang 2026-10-21). The event stands where the band that founded the camp there starts its crossing (the shore where it takes to the water, or for a route on land the edge of the camp it leaves), at the moment 3 seconds of watching at the normal pace before that crossing begins (Yang, issue 148: "put the timestamp ... 3 watch seconds at normal pace before the people made a crossing"), so the dialog shows the people setting out. Where a band's founding group makes no walk (the camp is built where it already stands), the event stands at the new camp 3 seconds of watching before it is built.
  - **Events with their own scene**, such as the cave paintings and burials of milestone 2, at their camp. Their moment is 3 seconds of watching before the scene's work begins (Yang, issue 148): for a cave painting before the first paint stroke, not before the cave wall opens in the hill; for a burial, a monument or any scene that builds something, before anything has been built; for the bone hut, before the first mammoth hunt (humankind.md section 8.2).
  - **Every event has a card** (Yang, issue 148: "For each event, create a card"): the card of the anchor for an event with a scene (humankind.md section 8.3), and for an arrival a card of its own (humankind.md section 8.4). The events dialog marks them all alike; a row's travel button does not open the card, the sign does (humankind.md section 8.4).
  - The build writes them into the startup index (`events`), each with its id, kind, name in the index's language, day, place and the id of its card; it adds no event whose band never got there.
- **Bookmarks** has a button "Save this view" ("Diese Ansicht speichern") above its list. A bookmark stores the date, the camera's place, height, heading and tilt, under a name the viewer may type, defaulting to the formatted date. The list is in chronological order of the bookmarked dates, as rows with the travel button, the date, the name and the region of the camera's place. Its rows have the same travel button; choosing one travels to it in the same way, with the bookmark's heading and tilt. Bookmarks can be renamed and deleted. The app ships with no preset bookmarks in this milestone.

### 8.4 Localisation

- Every UI string lives in `app/messages/en.json` and `app/messages/de.json` under the same keys. Messages use ICU-style placeholders and plural forms, resolved with `Intl.PluralRules`. A small in-house formatter is used instead of a library, to keep the bundle small; it covers placeholders and plural forms only.
- `npm run check` fails when a key exists in one language and not the other, when a message is empty, or when a component contains a string literal that is shown to the viewer. Textures and generated images carry no text.
- The interface and the timeline use the Fredoka web font (variable weight, Latin and Latin Extended, so German umlauts and ß are covered), bundled with the app from `@fontsource-variable/fredoka` under the SIL Open Font License 1.1 (spec section 13), with `system-ui` as the fallback.
- Numbers use `Intl.NumberFormat` for the active language. Dates use the in-house formatting of section 3.2, because `Intl.DateTimeFormat` does not handle years before 1 CE or the BCE suffixes well.
- Switching language changes every visible string at once, including the timeline labels, tick labels, the rate readout, tooltips, accessible names, the About panel and the page title, without a reload and without changing date, camera or play state. The `lang` attribute of the page follows the language.
- The light index (section 10.2) is per language; switching language loads the other language's index if it is not cached and keeps the old strings visible until it arrives.

### 8.5 About panel

Opened from a link at the end of the settings panel, "About and sources" ("Über und Quellen"), so the attribution the data licences require stays one tap away (spec section 13). Shows the app name, version and content cutoff date; the data sources and licences from `data/sources.json`; and the known simplifications named in sections 4.3, 5.1 and 5.2, in plain language for the child and the parent. All text is in both languages and lives in the message files.

### 8.6 Loading screen

Asked for by Yang on 2026-10-19: "a loading screen with progress indicator". After trying a march-of-progress picture and a simplified grey globe, Yang chose: "I just want a smaller version of the same globe spinning as we load, with a percentage below it". Once the page has loaded, "the small globe zooms in and turns into the actual large globe and the camera moves to the remembered position".

- **While loading.** The globe itself, as the app draws it, spins slowly westward far away: the camera stands straight above 15°N at the distance where the globe is about 180 CSS pixels across (less on narrow phones), beyond the camera's usual farthest view (section 6.1), and turns 20 degrees of longitude a second. Below it is the caption "Loading the world…" ("Die Welt wird geladen …") with the share loaded as a whole percentage. From the very first paint the page shows the sky's backdrop gradient, peach below to lilac and blue above, set in the page itself before any stylesheet or script, so no other colour flashes (Yang, 2026-10-20: "there is still a flash of beige at the very start of loading"). Until the globe's first tiles are drawn, a still picture of the small globe stands in its place, so the screen is never empty but for the caption (Yang, 2026-10-20: "loading screen still starts very briefly with an empty screen and only the loading text... we could start with a screenshot"): `app/public/loading-globe.jpg`, taken from the app itself by `npm run loading-shot` (with the dev server's `?introHold`, which keeps the small globe still), facing 20°E. The small globe stands in the middle of the window, whatever the controls below do (Yang, issue 136: the still picture stood a little too low and jumped up when the layout settled): the shift that centres the globe above the bottom controls (section 6.1) is not applied while loading, so the picture, the caption and the drawn globe never move while the controls and the timeline lay out, and it eases in over about 1.5 seconds as the camera flies in (at once with reduced motion). The globe starts facing the same way and only begins to spin once it is drawn; then the picture fades out over 0.3 seconds. The picture is taken again whenever the globe's look changes much. The clouds wait for the land, and camps and animals are left out, since at that distance they would be specks. The controls and the timeline are hidden.
- **What the share counts.** The app shell counts 5%, the manifest 15%, and the startup index with the history lens grids 35%. The rest is the first view (section 10.6), counted as the share of the data requests made since the index arrived that have finished, which never goes down; the small globe's tiles fill the share up to 70%, the tiles of the flight in the rest.
- **The handover.** Once the small globe is drawn and the tiles of the view the camera will fly to have loaded too (Yang, issue 138: "initial load animation is janky... let's load a bit more (while the small scale globe keeps spinning) before zooming in"; the app asks for the tiles of views along the flight, at six stages of the descent, for where the spinning globe will be when the flight begins, while the globe spins on, and waits at most 20 seconds for them; with reduced motion there is no flight to prepare), the caption fades, the controls and the timeline fade in over about a second and a half, and the camera spins and zooms in from the small globe to the remembered view (section 9), or the opening view on a first visit (Yang, 2026-10-20: "spin the miniature globe so that when we zoom, we spin and zoom into location. if the location we want to zoom to happens to already face the camera, then add one more spin"): the globe keeps turning the way it turned while loading, from the speed it had, and comes to rest with the place in view as the camera arrives; where the place is already less than 90 degrees of longitude ahead, it turns once more all the way round first. The spin-in takes about 3.5 seconds, and 1.5 more with the extra turn (**Proposed**). Any input during the flight stops it, as for every fly-to. The far view of the loading screen is never saved as the remembered view. With reduced motion the globe does not spin and the flight is the quick fade of section 6.3.
- **Accessible.** The caption is a `progressbar` with the percentage as its value and the caption as its name.
- Loading never changes the world (section 10.7).
- **Favicon** (Yang, issue 135: "use the globe screenshot, reduced in size, as favicon"). The browser tab shows the still picture of the globe (`loading-globe.jpg`, the same one that stands in while loading), cut to its round disc and reduced to a 32 × 32 PNG (`favicon-32.png`); phones that save the page to the home screen get a 180 × 180 version (`apple-touch-icon.png`). Both are linked from `index.html`.

## 9. Saved state

Local storage holds only small things (spec section 7.6). Each key is versioned JSON; values that fail validation or have an unknown version are discarded and replaced by defaults, never causing an error.

| Key | Holds | Written |
| --- | --- | --- |
| `miniworld.settings.v1` | The settings of section 8.2 | On change |
| `miniworld.view.v3` | The date shown (history time, a whole day), camera target, distance, tilt and heading, play state and speed mode; a version 2 view, which saved the clock time at the old rate of 25 years per minute, is read as the day it showed | At most once every 2 seconds, and when the page is hidden; only when it has changed |
| `miniworld.bookmarks.v3` | Up to 200 bookmarks: id, name, the date (history time, a whole day), camera; version 2 bookmarks (clock time at the old rate) and version 1 bookmarks (a day) are read as their day | On change |

On start, the saved clock time and camera are restored; a saved play state of *playing* is restored as *paused*, so the world does not run on while nobody is watching. Saved state never affects what the world looks like at a given clock time: it only chooses which moment and view to show.

## 10. Content pipeline

This milestone builds the full delivery path of spec section 10 even though there is little content yet, so later milestones only add layers.

### 10.1 Manifest

`manifest.json` is the only file fetched without a content hash in its name. It holds the build version, the content cutoff date, the supported languages, the quadtree and time-window definitions, and for every layer the chunk keys with their file names for quadtree levels 0 and 1 plus, for deeper levels, one hashed part file per level 2 tile that lists the chunks below it. Part files are fetched when the camera first needs a tile under them, which keeps the manifest small. Tiles that are entirely deep ocean have no terrain file and are listed as deep. It is fetched network-first on every start and falls back to the cached copy when offline.

### 10.2 Startup index

One light index per language, fetched with the manifest: the era records with their labels in that language, the timeline axis constant *k* (section 7.2), the sea-level curve, the region lookup table for the phone timeline, and the source and licence list for the About panel. Layers that do not exist yet (events, famous people) are present as empty lists, so the format does not change when they arrive. Budget: at most 150 KB compressed per language.

### 10.3 Chunk keys

- **Place:** a cube face and quadtree path, for example `2/0313`, at a level chosen per layer: terrain at every level up to 5. The climate slices are global and keyed by their time step only.
- **Time:** windows of equal watching time, equal width on the timeline axis (section 7.2): 35 windows of about 41 minutes over the whole timeline, about 21,000 years at the start, about 130 years around the year 1000 and about 41 years at the end, so each holds a similar amount of watching. Window boundaries are whole days, computed by the data build and listed in the manifest. Layers that do not change with time, such as terrain, use the single window `all`.
- **Language:** `xx` for layers without text, otherwise `en` or `de`.

A chunk is listed in the manifest under the key `{place}/{window}/{language}`, which names its file. The file name leaves out what the layer does not vary by and adds a hash, the first 16 hex characters of the SHA-256 of the file's content: a terrain tile (window `all`, language `xx`) is `terrain/{face}/{path}.{hash}.bin`, for example `terrain/2/0313.{hash}.bin`.

In this milestone the shipped layers are `terrain` (place only) and the climate slices (time only, listed in the manifest with their days and hashed file names, `climate/{years before present}.{hash}.bin`). The per-language files are the startup index of each language and the card texts, `animals/{id}-{language}.{hash}.json` and `sites/{id}-{language}.{hash}.json`, which only that language's index names, so the app fetches the text of the active language alone.

### 10.4 Loading and prefetching

- The loader requests chunks for the tiles in view and their neighbours. It loads the two climate slices around the date first, then every other slice in the background, nearest in time first, so the whole history of ice and deserts is ready soon after start (about 600 KB in all).
- While scrubbing it fetches only chunks for the window under the playhead once the playhead has rested there for 200 ms, so a fast drag across history does not queue hundreds of requests.
- At most six requests run at once, the most urgent first. Every frame, waiting terrain requests take the priority of their tile in the current view, and a request whose tile has been out of view for half a second is cancelled, whether it is still waiting or already running.
- A failed request is retried with growing pauses: not before 1 second has passed, then 2, 4 and so on up to 60 seconds, so a lost connection does not turn into a storm of requests and loading resumes by itself when the connection returns. A file the server says does not exist (HTTP 404 or 410) is not asked for again until the app is reloaded. A cancelled request is not a failure.
- If the other language's index cannot be loaded when the language is switched, the app stays in the current language and the language setting goes back to it, so the setting always shows the language on screen; switching again tries again.

### 10.5 Formats

- Terrain tiles: 16-bit heights (with a one-sample border for smooth normals and interpolation), then the smoothed ocean-connection level in centimetres as two bytes per sample (section 5.1), then one byte per sample each for the smooth lake field, the smooth river field, and the river flow phase as its cosine and sine (section 4.3), then the smoothed bed under the ice sheets as 16-bit metres per sample (section 5.2), packed into one binary file per tile, compressed with Brotli for transfer.
- Terrain tiles end with one byte per sample for the distance from today's coast in km (section 4.2).
- Climate slices: one binary file per time step, with a small header (its day and grid sizes), the ice border distance as one byte per cell of a global 720 × 360 grid, and the aridity in 16 levels as one byte per cell of a global 360 × 180 grid, each row stored as differences from its left neighbour so the smooth fields compress well (section 5.2).
- Index and manifest: Brotli-compressed JSON.
- Terrain textures: KTX2 with Basis Universal compression, so phones get GPU-compressed textures.

### 10.6 Size budget for the first view

The first view of the globe at 50,000 BCE on a phone must need at most about 3 MB transferred (exit criterion 3). Proposed split:

| Part | Budget (compressed) |
| --- | --- |
| JavaScript and CSS | 500 KB |
| Manifest and one language's index | 200 KB |
| Terrain tiles for the first view | 1.5 MB |
| Climate slices for the first view | 50 KB |
| Terrain textures | 500 KB |

`npm run build` fails when JavaScript and CSS exceed their budget. A browser test loads the first view at a phone size with an empty cache and fails when the total transfer exceeds 3 MB.

### 10.7 Determinism while loading

Sea level, ocean mask thresholds, ice cover and the climate band at a date are fully determined by the data. When a tile or climate slice has not arrived, the renderer shows the coarser parent tile, or the nearest loaded slices, until it does; this is a drawing fallback only, never a change to the computed values. Golden tests (section 13) compute these values directly from the data and never depend on what has loaded.

### 10.7.1 Build caches

The data build keeps the results of its slow stages in `data/out/` (git-ignored), so a build that changes only the tree of humankind or the content does not compute the land again (Yang, 2026-10-19: "can we have some sort of incremental rebuild?", and "I don't think we'll change terrain much in the future").

- **The land cache** (`data/out/cache/<key>/`) holds the map grids, the coarse coasts of the terrain tiles and the climate and foliage slices, stored exactly. Its key is a hash of the source checksums (`data/sources.json`), the land's curated files (straits, islands, removed areas, mountains, humid periods, rivers, inland seas), the build code that makes the land and the climate (everything in `data/build/lib/` but the tree's own files, the terrain, climate and context stages, and the app modules they use) and the options.
- **The camp sites** ([sites.md](sites.md) section 7) are kept the same way in `data/out/sites/`.
- **Brotli copies** are kept by the hash of their file's bytes in `data/out/brotli/`, so unchanged files are not compressed again.
- **The stage cache** (`data/out/stages/`, section 10.7.2) holds the result and the files of whole stages.
- Each cache keeps only what the latest build used. `npm run build-data -- --no-cache` (also `--fresh`) uses and writes no cache; `--clean` empties every cache first and then fills them. A cached build must write exactly the same files as a fresh one, and `npm run verify-cache` proves it by building without caches, with a clean fill and from the caches, and comparing a hash of every output file.

### 10.7.2 Incremental builds and the stage graph

The build logs the seconds of every stage (`stage seconds:` line at the end), so a slow stage shows. A stage whose result is expensive and depends on little is cached as a whole (Yang, issue 152: "incremental builds that can reuse as much as previous builds as possible"): its return value and every file it wrote are stored under a key, and a later build with the same key replays them, writing the same names and bytes. The key hashes

- the stage's code: its file and every file it imports, transitively (code and JSON, found by reading the `import` lines, so a new import is picked up by itself);
- the stage's inputs from earlier stages (for the tree: the land cache key, the lens manifest entry, the options);
- every curated file the stage read through `ctx.curated`, recorded on the run that filled the cache and compared by content hash on the next, so changing `data/curated/farming.json` reruns only the stages that read it.

A stage is cached only when it completes. One entry is kept per stage; the build with `--fixture` caches no stages.

The stage graph (an arrow means the later stage uses the result):

| Stage | Reads | Cache |
| --- | --- | --- |
| map | sources, land curated files | land cache |
| terrain | map | land cache for the coarse coasts; tiles are written every build (about 3 s) |
| wildlife masks | map, drawn ground | not cached (about 2 s) |
| climate | map, sources | land cache (climate and foliage slices) |
| lens | spec event coordinates, `lens-boosts.json`, `lens.json` | lens grids in `data/out/lens/` |
| farming | map, climate, `farming.json` | not cached (under 1 s) |
| tree of humankind | map, climate, drawn ground, lens width, culture areas, arrivals, crossings, key places, anchors, encounters, thresholds | stage cache, and the camp sites in `data/out/sites/` |
| content | curated records, climate, wildlife, tree camps and events | not cached (under 1 s) |
| manifest, Brotli copies | everything above | Brotli copies by content hash |

The stages run one after another: terrain fills the drawn-ground tiles that the wildlife masks and the tree read, so they are not independent in the current code.

### 10.8 Data build validation

The build fails when: a source has no licence entry, its licence is not allowed by the data licence policy, or its files under `data/sources/` do not match their checksums; an era record lacks a date, a source or its label in any supported language; a date is outside the timeline; an approximate flag is missing where [eras.md](eras.md) marks "c."; a chunk exceeds 1 MB; a curated table does not match its schema, or a JSON file under `data/curated/` has none ([content-format.md](content-format.md#11-tables) section 1.1); the asset manifest does not match its schema; or an asset the content refers to (a wildlife model, a scene's prop, a culture's lodging) is missing from the asset manifest or `rejected`. A referenced asset that is listed but not yet `approved` does not fail the build: the app draws its stand-in until Yang approves it (section 12), and the build log lists every such asset.

### 10.9 Service worker and caching

- Hashed files are served cache-first and kept indefinitely; a new release downloads only chunks whose hashes changed.
- The cache has a budget of 200 MB on desktop and 100 MB on phones; when it is full, the least recently used chunks are evicted. The app shell and the current language's index are never evicted.
- The service worker is disabled under the dev server so hot reload is not affected; a flag enables it there for testing.

## 11. Performance

### 11.1 Budget

The budget is spec section 9's: 60 fps average and never below 30 fps on the reference laptop, 30 fps or better on the reference phone, at most about 300 draw calls per frame on desktop and 150 on phones. "Never below 30 fps" is measured as the 99th percentile frame time staying at or below 33 ms.

**Reference devices**, chosen by Yang: the first Apple silicon MacBook (MacBook Air with M1, 2020) running current Chrome and Safari as the laptop, and a Google Pixel 9 running current Chrome as the phone. Safari on iPhone is also tested for correctness.

### 11.2 Quality

There is one fixed quality and no quality setting (decided by Yang on 2026-10-18, replacing three tiers chosen by a benchmark at first start: "the other modes are untested"):

| | |
| --- | --- |
| Render scale cap | Device pixel ratio up to 2 |
| Terrain error target | 1.5 px |
| Terrain texture resolution | Full |
| Water | Animated wave pattern |
| Anti-aliasing | MSAA 4×; 2× on phones, whose screens are dense enough that the difference hardly shows |
| Animated figures (stress scene) | 5,000 |

When a device cannot keep up, dynamic resolution (section 11.3) lowers the render scale.

### 11.3 Dynamic resolution

The renderer tracks an average of recent frame times. Only when the average frame rate stays below 30 fps for 3 seconds, on every device, does the render scale drop by a step of 10 %, down to half of the cap (section 11.2); after each second of frames above 40 fps it rises two steps again (Yang, 2026-10-19: "I don't want dynamic resolution unless average frame rate consistently drops below 30fps", after the resolution dropped while scrubbing and took long to recover). Short bursts of slow frames, such as tiles being built while scrubbing, leave the resolution alone. The interface is drawn at full resolution regardless.

### 11.4 Stress scene

The stress scene proves the figure-heavy targets before any content exists and stays in the test suite as a performance check.

- Opened with `?scene=stress` in the URL; not reachable from the interface.
- A fixed camera path over the Nile delta at close zoom, then out to orbit and back down, about 60 seconds long, with the clock running from 1 CE in regular mode.
- 20,000 placeholder figures over an area of about 30 × 30 km, of which up to the animated-figure limit (section 11.2) are drawn as animated figures near the camera and the rest as simple coloured marks. 1,000 placeholder buildings of about 2,000 triangles each.
- Placeholder figures are a simple humanoid of about 700 triangles on one shared skeleton, with three baked animations (walk, work, idle) played from an animation texture on the GPU, drawn with instancing: the technique real figures will use in milestone 2. They are coloured by a hash of their index, and their positions and animations come from a seeded hash of index and clock slot, never from `Math.random`.
- **Levels of detail (Yang, 2026-10-24: "reduce triangle count slightly").** A placeholder figure under 16 pixels tall, or a building under 24 pixels wide, is drawn at a simple level instead: a figure of about 130 triangles (the simplified level of milestone 2, section 5.5 is about 150) and a building of about 200, from the same shapes with fewer segments. Size is measured at a nominal 800-pixel-high view from the camera's field of view and the distance, so it does not depend on the device, and the swap is made in the same half-second re-sort that picks the animated figures. Both levels stand in the same place with the same colours, so the swap cannot be seen at that size. In the stress path the camera is always far above the placeholders (they are a few pixels across), so the whole stress load is drawn at the simple level and the largest frame falls from about 4.94 million triangles to about 1.6 million, while the full level stays covered by a unit test; the draw calls rise by at most two (two more instanced meshes). The triangle budget stays the sum of the parts' allowances.
- The placeholders are generated in code as plain shapes, not shipped assets, so they need no approval; they never appear outside the stress scene.
- A stats overlay (also available in the normal app from the settings) shows frame time with its average and 99th percentile, draw calls, triangles and render scale.
- `npm run perf` runs the camera path in Chromium and writes a report: average fps, 99th percentile frame time, the average and 99th percentile time the main thread spends updating a frame before drawing it, and maximum draw calls and triangles per frame. On a reference device the same report is produced from a button in the overlay, so results can be recorded from a real phone. CI runs the scene headless and fails only when draw calls or triangles exceed the budget, since its frame times mean nothing. The triangle budget of the stress scene is the sum of what each part may draw: the terrain at about 800,000 triangles (section 4.2), the plants at 400,000 (foliage.md, section 7), 5,000 animated figures of about 700 triangles and 1,000 buildings of about 2,000, which comes to 6.7 million. Because a software renderer draws the scene at well under one frame a second, the check opens it with `&pathFrames=30`, which moves the camera along the path by an equal step each frame instead of with the time, so every run visits the same 30 points of the whole path however slow the machine is.
- **Draw-call rule for instanced models (Yang, 2026-10-24).** A model costs two draw calls (shaded body and ink), so a batch is keyed by the model and its geometry, never by its colours. The colour variants of a person (the 12 looks of a culture's profile) share one batch when they share vertices: their per-vertex colours sit in a float texture, one row of colours per look, and each copy names its look in an instance attribute that the shader uses to fetch the colour of each vertex. Looks whose parts differ in shape (the hair, bun and beard blobs) form at most two batches per model and kind (`lookShape` in `assets/src/people.ts`; a test checks that looks in one shape class have equal vertices). The stress scene's draw-call budget holds with the Neolithic villages in place.

### 11.5 Terrain work off the main thread

Building a terrain tile (resampling a finer tile from its data tile, its normals and its vertex attributes) and resampling a climate slice for the graphics card take long enough to make frames stutter while the globe refines or the climate slices arrive. A pool of terrain workers (Web Workers, `app/src/globe/terrainWorker.ts`; one on phones and small machines, two otherwise) does this work; the main thread keeps the Three.js objects, the uploads, the camera and tile selection.

- **Protocol.** The main thread posts a request with an id: either *build a tile* (tile key, its data tile or `deep`, the exaggeration and the timeline's lowest sea level) or *resample a climate slice* (the slice). The worker answers with the same id and plain typed arrays (vertex attributes, field texture, bounds and flags of the tile; the RG texture of the slice), transferred rather than copied. Code shared by both sides (`app/src/globe/tileArrays.ts`, `app/src/planet/`) uses no DOM or Three.js.
- **Order.** Requests wait on the main thread and the most urgent tile (nearest the camera, coarser first) is posted next whenever a worker has fewer than two requests in hand; a tile that leaves the view before it is posted is dropped.
- **No change to the world.** A tile or slice that is still being built is drawn from its coarser parent or the nearest loaded slice, exactly as while it is still downloading (section 10.7); the arrays a worker returns are the same as those built on the main thread. Where Web Workers are not available (unit tests in Node), the same functions run on the main thread.
- The planet query (section 5) stays on the main thread too, because the camera and the figures ask it for the ground every frame; the world query of milestone 2 runs its own copy in its worker.

### 11.6 Steady frames

Garbage collection pauses show as stutter, most of all on phones, so the code that runs every frame allocates nothing it could reuse: the tile selection, the camera and the clouds work in scratch vectors and matrices kept beside their code. The tile selection walks a tree of tile nodes that hold what never changes about a tile (its key, id, centre and corner directions, deepest level and data tile); children not walked into for 600 frames are forgotten, so the tree stays small. Every cache is bounded (section 4.2), and the saved view (section 9) is written only when it has changed.

### 11.7 Depth and overdraw

The globe is drawn from a few hundred metres to tens of thousands of kilometres away. Where the graphics card offers clip control (`EXT_clip_control`), the depth buffer is reversed and 32-bit float, which keeps that whole range precise without the fragment shaders writing depth, so the card can reject hidden pixels before shading them; elsewhere a logarithmic depth buffer is used, as before. Terrain and sea surfaces are drawn front side only: the globe is closed, so their back faces are always hidden. The terrain shader still leaves out the pixels the flat sea draws (section 4.4).

### 11.8 Shared memory between the workers and the main thread (issue 127)

Whether a `SharedArrayBuffer` would speed up what the workers hand to the main thread was measured first (Chromium 154 on the devenv, real data, the camp scene of central Europe at 4792 BCE with the clock running 15 s, and four jumps across the timeline; the main thread's time from the browser's sampling profiler and a structured-clone timer on every worker message).

| Worker | Messages | What is sent | Cost on the main thread |
| --- | --- | --- | --- |
| Terrain | 710 in 15 s | typed arrays, transferred | 0.1 ms per message, in all 0.5% of a frame budget |
| Camp scene | 11 a second, about 310 KB each | the scene as nested objects and arrays (poses of figures, animals, lodgings) | about 1.2 ms to receive each, in all about 1.3% of the main thread (a full clone out and in took 7.7 ms at most) |
| Plant placement | one answer per tile and date step | an array of plant objects | too little to show in the profile |
| Ground tint | one slice at a time, built on the main thread | not a message at all | about 25 ms per slice, a dropped frame or two on every jump into a new slice |

- **Decision: no `SharedArrayBuffer` for now.** The only large flows are the terrain's, which already move without a copy by transfer, and the camp scene's, which is made of objects, not of typed arrays, so shared memory would first need the whole scene turned into flat arrays (a rewrite of `treeScene` and of every reader in `treeLayer`) to save about 1% of the main thread. Shared memory also needs cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`), and the app's host, GitHub Pages (spec.md, section 10, "Hosting"), cannot send those headers; only a service worker that rewrites the headers could, with a reload on the first visit and a risk to every cross-origin resource. The app must therefore work without isolation in any case, so a shared path would be a second code path that most viewers never run, for no measurable gain. This is revisited if a profile of the real device shows a worker answer taking a noticeable part of a frame, or when the host can set headers.
- **The cheaper win, done.** The ground tint of a foliage slice moved into the foliage worker (foliage.md, section 7) and comes back as a transferred byte array. Across five jumps over the timeline the main thread spent 127 ms in the tint (`groundTexture` and `blurGrid` in the profile) before and none after. The world is unchanged: the same function makes the same bytes on either side, and a slice is used only when its tint is ready, so the picture never depends on timing.
- **Rule for later work.** A worker's answer is flat typed arrays that are transferred, not objects, where it is large and frequent. Objects are fine for small or rare answers.

## 12. Assets in this milestone

The only shipped assets are the six terrain textures, the water normal map and the ice texture. The interface icons are simple shapes drawn in code (SVG), and the interface uses the Fredoka web font (section 8.4), so neither needs an approval. Each is generated and listed in `data/assets/manifest.json` with: id, file, kind, how it was generated, status (`generated`, `approved`, `rejected`), the date it was reviewed and a note; a model built by code also records the hash of the geometry that was approved (milestone 2, section 13.3). Until Yang approves an asset, the app draws a flat-coloured stand-in of the same size in its place, in development and in the shipped app alike. Only a preview build, made with `VITE_PREVIEW_ASSETS=1`, draws the assets still waiting for review, so Yang can review them in place: the devenv's dev server and the invite-only preview site, which the hub repository `hashseed/hashseed-pages` builds from the `preview` branch at https://hashseed.pages.dev/miniworld-preview/. The public build of `main` on GitHub Pages never sets the flag.

## 13. Tests

| Test | Checks |
| --- | --- |
| Date unit tests | Day-number conversion, year 0, leap years, formatting in both languages |
| Clock rate test | The whole timeline exactly 24 hours; round trip day to clock time and back at the start, the end and around year 0; the date never goes backwards; never slower than a year per minute (section 3.3) |
| Clock tests | Play states, the three speed modes and their keys, end of timeline, scrubbing, the clock stops when paused; the timeline axis round trip and its ends (section 7.2) |
| Golden tests | For a fixed list of dates (70,000 BCE, 50,000 BCE, 20,000 BCE, 12,000 BCE, 8000 BCE, 6200 BCE, 3000 BCE, today) and places (Bering Strait, North Sea, Java Sea, Torres Strait, Hudson Bay, Baltic, Caspian Sea): sea level, whether each place is sea or land, ice cover, glacial index, and the height of the drawn ground. They run on the built data (`npm run golden`; in CI on the fixture dataset after its build), with the results stored per dataset (fixture or full) beside the test. Stored results must match exactly; changes must be intended and reviewed |
| Localisation tests | Same keys in both message files, no empty messages, no viewer-facing literals in components |
| Data validation | Section 10.8 on the fixture dataset in CI and the full dataset locally |
| Pipeline tests | Chunk keys, hashing, manifest, both languages' indexes. On the built data with the golden tests (`npm run golden`): every chunk key is place, window and language and lies under its part file; every file named in the manifest is named by the hash of its content and has a matching Brotli copy; no other files; the startup index and manifest within their budgets (sections 10.2 and 10.6) |
| Paths on land | On the built data with the golden tests (`npm run golden`): the deterministic paths of people and animals never lead onto water (Yang, 2026-10-18). Every figure of the tree of humankind, every 250 ms of watching through each tree window, and every walking animal's spot (not birds or sea animals), every 5 seconds over an hour of the life clock at every fourth time window and today, must stand on land at its date: not sea at that date's sea level and not a lake, where ice counts as ground (penguins and polar bears stand on it). A failure names the figure or group, the time and the place |
| Loader tests | With a fake server and clock: at most six requests at once and most urgent first, new priorities, cancelling, the growing retry pauses, no second request for a missing file, a failed index retried; terrain tiles cancelled when out of view; every binary format round-trips and refuses a file of the wrong length (section 10) |
| Browser tests | Each golden screenshot is taken with the frame loop held after its frame (a test-only hook of the dev build), so the capture does not wait for the software renderer (Yang, 2026-10-19: the screenshot tests took 5 to 8 minutes). Desktop and phone sizes: first view loads within the size budget; timeline scrubbing changes the date and coastline; language switch changes every string without reload; settings and bookmarks survive a reload; camera controls with mouse, touch emulation and keyboard |
| Performance check | Stress scene draw calls and triangles over the whole camera path (section 11.4) |

The golden places must show the expected answers as well as matching the stored results: the North Sea between Britain and the continent is land at 12,000 BCE and sea at 3000 BCE; the Bering Strait is land at 20,000 BCE and sea today; the Caspian Sea is never ocean; Hudson Bay is under ice at 20,000 BCE. These are checked on the full dataset, since the synthetic fixture has no real sea floor.

## 14. Exit criteria and how they are checked

| Criterion (from [milestones.md](milestones.md)) | Checked by |
| --- | --- |
| Scrubbing from 50,000 BCE to today shows Beringia, Doggerland and Sundaland drowning and the ice sheets retreating | Golden tests for the places involved; a browser test that captures screenshots at the golden dates for review; Yang watches a scrub on desktop and phone |
| The stress scene meets the performance budget on both reference devices | Performance reports from the reference laptop and phone, attached to the pull request that closes the milestone |
| The first view loads with at most about 3 MB on a phone | Browser test with an empty cache at phone size (section 10.6) |
| Switching language changes every visible string without a reload | Browser test comparing all visible text before and after switching; review of the app in both languages |

The definition of done in [milestones.md](milestones.md#definition-of-done-every-milestone) applies as well.

## 15. Out of scope

Figures other than the stress-scene placeholders, the world query in the Web Worker, settlements, events and event markers on the timeline, borders and place names, info cards, regional vegetation other than the climate colouring of section 4.3 (which includes the Green Sahara), sinking and rebound of land under the ice, vanished lakes, and offline use beyond what the service worker cache gives for free.

## 16. Decisions

Decided by Yang on 2026-10-17: the reference devices (section 11.1), 100× elevation exaggeration (section 4.2, first 12×), no day and night, atmosphere or shallow-water colours (sections 3.6, 4.4 and 4.5), free tilt down to nearly level (section 6.1), the toy-planet look with clouds and raised continents (sections 3.6, 4.2 to 4.5 and 5.2), the timeline collapsed to the region under the globe by default (section 7.1), the timeline ending at the dissolution of the Soviet Union on 26 December 1991 (section 3.1), the toolchain (section 2.1), zooming in slowing the clock (removed on 2026-10-18), and keeping only freely and commercially usable source data, with small simplified extracts in the repository (sections 2.2 and 4.1).

Decided by Yang on 2026-10-18: one clock for everything, with no separate life clock, at a uniform 25 years per minute (replaced on 2026-10-19 by the curve from watching time to history time, 24 hours in all, spec section 2.1, and a timeline linear in watching time); three speed modes (snail, regular, fast forward) instead of the speed slider; no slowdown when zoomed in (section 3.3); and a logarithmic timeline axis (section 7.2).
