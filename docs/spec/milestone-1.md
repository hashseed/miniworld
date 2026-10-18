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
  src/vignettes/  drawing vignettes (milestone 2, section 18)
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
scripts/          development tools, such as the test pool (section 2.5)
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
| `npm run build-data` | Runs the offline data build (section 10): terrain tiles, ocean mask, ice, sea-level curve, startup index, chunks, manifest |
| `npm run dev` | The dev server on port 8800 |
| `npm run staging` | Starts, in the background, the watcher that keeps the staging checkout on the latest `main` and its dev server on port 8800 running (spec section 11); data built with `--max-level 5`; `-- --stop` stops it |
| `npm run build` | Production build of app plus data into `dist/` |
| `npm run check` | Lint, typecheck, unit and golden tests, data validation |
| `npm run coverage` | Unit and golden tests with the coverage report and its thresholds (section 2.4) |
| `npm run golden` | The golden tests (section 13) on the data in `app/public/data`; `npm run golden -- -u` stores new results after an intended change |
| `npm run test:browser` | Playwright tests at desktop and phone sizes |
| `npm run pool` | Runs the checks or browser tests for a commit in a worktree of the test pool (section 2.5) |
| `npm run fixture-key` | Prints the hash of everything the fixture data build reads, the key of its cache (section 2.4) |
| `npm run notices` | Regenerates `app/public/third-party-notices.txt` from the licences of the runtime dependencies (spec section 13) |
| `npm run perf` | Runs the stress scene and prints the performance report (section 11.4) |

### 2.4 Continuous integration

GitHub Actions runs on every pull request and on `main`: lint, typecheck, unit and golden tests with the coverage report, data validation against a small fixture dataset, the production build with its size check (section 10.6), and the Playwright tests in headless Chromium. Three jobs run side by side so a pull request is checked in about three minutes: the static checks and unit tests; the fixture data build and the golden tests on it; and, once the data is built, the browser tests, split over five jobs (desktop and phone in two shards each, and the perf check), one test at a time, because the software renderer uses every core and two tests on one machine slow each other down more than they gain. The fixture data is cached under a hash of everything its build reads (`npm run fixture-key`), and the Playwright browser under its version, so neither is rebuilt or downloaded when nothing changed. A new push to a pull request cancels its running checks. CI does not judge frame rate, because CI machines are not the reference devices; it checks draw calls and triangle counts of the stress scene instead (section 11.4). The phone browser tests emulate a phone's screen size and touch input at device pixel ratio 1, because CI renders in software and a phone's full pixel density would make every test several times slower without testing anything more.

`npm run coverage` runs the unit tests with a line and branch coverage report (`coverage/`). Its thresholds, overall and for the well-tested folders, are the coverage when they were set; a change may raise them but never lower them.

### 2.5 Running tests locally

Tests run in Yang's devenv container, but never in the checkout that serves the app on port 8800, which is the staging copy Yang looks at. `npm run pool -- <ref> [check|browser|all]` runs them for any commit in a pool of git worktrees beside that checkout (`../miniworld-pool/slot-<n>`, two slots by default):

- A run takes a free slot under a lock, so runs from different threads never share one, checks the commit out there, and frees the slot when it ends. The lock is kept alive by a heartbeat file, so a run that is killed frees its slot a minute later. Worktrees stay for the next run.
- Dependencies are installed only when `package-lock.json` changed since the slot's last run, with the pool's own npm cache and a time limit. The fixture data comes from a cache shared by all slots under the same key as in CI, and is built only when the key is new.
- Each slot's browser tests start their own dev server on port 8810 + n. The browser tests never use port 8800 or a server that is already running, so they cannot test the staging copy by mistake.
- Logs and the Playwright report of the last run are kept in the slot's `.pool/last/`. `npm run pool -- --prune` removes the slots and old caches.

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
| Before 10,000 BCE, playing or scrubbing | c. 50,000 BCE (rounded to 100 years) | ca. 50.000 v. Chr. |
| 10,000 BCE to 1 BCE | 3250 BCE (whole years; "c." while playing in fast forward) | 3250 v. Chr. |
| 1 CE to 999 CE | 79 CE | 79 n. Chr. |
| From 1000 | 1492 | 1492 |
| When paused at or after 1500 | 14 July 1789 | 14. Juli 1789 |

Rounding applies only to display; the clock keeps the exact day. Era dates marked approximate in [eras.md](eras.md) always show "c." ("ca."). Four-digit years are written without a thousands separator in both languages; five-digit years use one ("50,000" and "50.000"). Formatting lives in `src/i18n` and is covered by unit tests for both languages.

### 3.3 The clock and the speed modes

**The clock** (spec section 2.1) is a whole number of milliseconds of watching time since the start of the timeline (1 January 70,000 BCE), held by `src/time`. It is the only time input of the world: the date and everything that moves are pure functions of it. While playing it advances by the real frame time multiplied by the speed factor; an accumulator keeps the fraction, and only the whole milliseconds reach world state.

**Uniform rate.** The date advances at 25 years per minute, exactly 25 × 365.2425 = 146097 / 16 days per minute, in every era (decided by Yang on 2026-10-18). So the day is

`day = start day + ⌊clock × 146097 / 960000⌋`

in exact integer arithmetic (the product stays below 2⁵³ for the whole timeline), and the clock time at which a day begins is the smallest clock time that gives that day. One day lasts about 6.6 ms of clock time. The whole timeline is about 173 million ms, about 48 hours; from the opening date of 50,000 BCE about 34 h 40 min. A unit test checks the rate, the round trip from day to clock time and back, and the length of the timeline.

**Speed modes.** Instead of a slider, three modes (decided by Yang on 2026-10-18), with factors **Proposed**:

| Mode | Factor | Rate shown | Icon |
| --- | --- | --- | --- |
| Snail | ×1/8 | ≈ 3 years/min | A turtle |
| Regular | ×1 (default) | 25 years/min | A walking person |
| Fast forward | ×16 | 400 years/min | A galloping horse |

The mode only changes how fast the clock advances, never the clock time itself, so changing it never changes the date or what is on screen. Figures and vignettes run on the clock, so they move faster in fast forward and in slow motion in snail mode. Keys `[` and `]` step to the slower and the faster mode. At the end of the timeline the clock stops and switches to *paused*.

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

There is no day and night (decided by Yang on 2026-10-17). Everything is cel shaded (decided by Yang on 2026-10-17): light falls in three flat bands with narrow soft edges instead of smooth gradients, there are no highlights or reflections of the light (decided by Yang on 2026-10-17), and dark ink outlines trace the globe's silhouette, the coastlines, the ice edges and every cloud. The globe is lit like a toy under studio lights (spec section 8): a key light that follows the camera, coming from the upper left of the screen and slightly from behind the viewer, so relief is shaded the same way wherever the viewer looks; soft wrap-around shading so the dark side of every slope stays warm and readable; a cool sky-coloured fill from above and a warm bounce from below; and a soft bright rim along edges facing away from the light.

## 4. The globe

### 4.1 Source data

| Layer | Source | Licence | Kept in the repository |
| --- | --- | --- | --- |
| Elevation and sea floor | NOAA ETOPO 2022, 60 arc-second bedrock elevation (GeoTIFF), [doi:10.25921/fd45-gt74](https://doi.org/10.25921/fd45-gt74) | CC0 1.0, not subject to copyright in the US | Elevation averaged to 4 arc-minutes (about 7 km, 17 MB) |
| Lakes and rivers | Natural Earth 1:10m physical: lakes, rivers and lake centrelines | Public domain | The used layers only |
| Ice sheets and sea level | PaleoMIST 1.0, Gowan et al. 2021, [doi:10.1594/PANGAEA.905800](https://doi.org/10.1594/PANGAEA.905800) | CC BY 4.0 | Grounded ice thickness and relative sea level on 0.25°, every 2,500 years from 52,500 years ago (6 MB) |
| Climate (precipitation for the deserts) | Beyer, Krapp and Manica 2020, [doi:10.6084/m9.figshare.12293345](https://doi.org/10.6084/m9.figshare.12293345) | CC BY 4.0 | BIOME4 biomes, annual mean temperature and annual precipitation on 0.5°, every 1,000 to 2,000 years from 54,000 years ago (6 MB) |

Every source must meet the data licence policy in [spec.md](spec.md#13-licences): freely available and usable commercially. `data/sources.json` lists every source with its URL, version, checksum, licence (as an SPDX identifier) and citation. The data build fails when a source used by a layer has no licence entry or its licence is not on the allowed list, and the app's About panel lists every source and its licence in both languages.

### 4.2 Terrain

- The globe is a unit cube projected onto a sphere (with an equal-angle warp so tiles are similar in size), each face split into a quadtree. Every tile is a grid of 33 × 33 vertices with skirts to hide cracks between levels (decided by Yang on 2026-10-17, first 65 × 65: the map is deliberately simple, and the terrain should stay at about 800,000 triangles or fewer on screen). Tiles are refined by screen-space error: a tile splits when its geometric error, estimated as half its vertex spacing, would exceed the terrain error target in CSS pixels (section 11.2). A tile splits only once all four children are ready to draw, so the ground never shows holes while loading. The tile meshes are kept in a cache of about 1,500; every mesh the current frame draws or checks (the drawn tiles, their parents and the children waiting to be drawn) is kept, and only meshes the frame did not touch are evicted, oldest first, so a full cache never makes tiles flicker between levels. When a coarser tile is wanted but not built yet, its finer children keep being drawn until it is. The meshes are kept in order of last use, so evicting stops at the first mesh the frame touched instead of sorting the whole cache. Downloaded data tiles are kept in the same way: levels 0 to 2 always (the planet query falls back to them, section 5), and up to 2,048 deeper tiles, the least recently used dropped first and downloaded again when next needed.
- **Cheaper tiles where there is little to draw** (decided by Yang on 2026-10-18: Antarctica seen from above needed about 700,000 triangles and 520 draw calls, most of them for the empty Southern Ocean around it). A tile that is sea at every date (its smoothed coast level below the lowest sea level of the timeline at every sample, with no lake or river) is drawn as its flat sea surface alone, on an 8 × 8 grid with skirts, which also carries any ice lying over the sea; it costs one draw call and about 200 triangles. Tiles in the polar regions (north of 74°N and south of 62°S), whose relief is smoothed away (section 4.2), use every second vertex (16 × 16 cells). A tile that is land at every date (its coast level above +10 m at every sample) draws no sea surface. Neighbouring tiles with different grids are joined by their skirts.
- The data build produces one heightmap per tile down to level 5 (tiles of roughly 300 km with samples about 10 km apart). The map is smoothed far more than that (section 4.2), so a deeper level would add size without adding information. Rendered tiles stop at level 5 too (decided by Yang on 2026-10-18: "using so many triangles for a simple coast seems unnecessary"; first level 9), since the smoothed map has nothing finer to show. Normals are exact: the vertex shader carries the gradient of the heights through every step that shapes the surface (the coast cap below and the ice of section 5.2), so the shading is smooth and never shows the blocky stripes that normals from screen-space derivatives gave.
- Heights are stored in whole metres as 16-bit integers with an offset, compressed per tile (section 10.5). The data build clamps the deep ocean floor below −1,000 m, which is never visible and saves space.
- **Simplified map** (decided by Yang on 2026-10-17). The globe shows the Earth's shapes, not all its details. The look is a simple clay globe, like a plasticine world map (decided by Yang on 2026-10-17): soft rounded continents, only the big islands and gulfs, but still with mountains, ice caps and the changing sea level. The data build smooths the elevation with a Gaussian of about 80 km (first 25 km, then 40 km) (decided by Yang on 2026-10-18: Antarctica's smooth look "looks great ... we could use that as example for the other continents. Maybe not as extreme"), smoothing land and continental shelf (above −150 m) separately from the deep sea floor so shelves and land bridges keep their depth. Narrow bays and fjords may fill in. **Polar regions** (decided by Yang on 2026-10-17) matter little for history and are simplified much more: south of 60°S and north of 72°N the elevation is smoothed with a Gaussian of about 150 km and the coast (section 5.1) with one of about 60 km, blending into the normal smoothing over the 10° of latitude towards the equator (from 50°S and from 62°N), so Greenland, the Canadian Arctic and Antarctica have smooth coasts (decided by Yang on 2026-10-17). Antarctica is simplified most (decided by Yang on 2026-10-17): its coast is smoothed with a Gaussian of about 120 km, blending in from 50°S to 60°S. The Bering Strait is a listed strait (section 5.1), so it keeps its sill. **Islands** (decided by Yang on 2026-10-17): tiny islands are not drawn unless history needs them. Islands under 5,000 km² are removed (decided by Yang on 2026-10-17, first 1,000 km²), so island groups such as Indonesia and the Philippines keep only their main islands, except those on the keep list in `data/curated/islands.json`, each named with the reason it matters (such as Thera, Malta, Elba, Saint Helena and Delos) and a source. Every island that stays and is under 60,000 km² (such as Hawaii, Crete, Cyprus, Sicily, Jamaica, Taiwan, and the kept small islands) is drawn larger than it is, so the oversized people of later milestones have room on it: it grows outwards into the sea by 40% of its equivalent radius, at least 6 km and at most 30 km (first 25 km, decided by Yang on 2026-10-17: Hawaii slightly larger), as a low shore sloping down from its coast. Islands from 60,000 to 250,000 km² (such as Honshu, Great Britain, Cuba, Java and Iceland) grow by 15 km, so narrow ones such as Japan read wider (decided by Yang on 2026-10-17). Bigger islands and the continents keep their size. Hawaii shows its main islands: Oʻahu, Maui and Kauaʻi are on the keep list beside the island of Hawaii. The Galápagos are kept as two islands, Isabela and San Cristóbal, for Darwin's visit in 1835 (decided by Yang on 2026-10-17). Bermuda and San Salvador are left off (decided by Yang on 2026-10-17). **Removed areas** (decided by Yang on 2026-10-17): a few groups of small islands and shallow banks that matter little for history but would show as land, at least at low sea level, are left off the map at every date: the Bahama Banks with the Turks and Caicos, the islands and banks between Madagascar and India (the Seychelles and the Mascarene Plateau with Mauritius and Réunion, Lakshadweep, the Maldives and Chagos), and the Faroe Islands and Rockall Bank. They are listed as polygons with a reason in `data/curated/removed-areas.json`, and the build turns them into deep sea floor before anything else, keeping any kept island inside. Island sizes are measured on today's coastline. Only a short, hand-picked list of the rivers history needs most is drawn (decided by Yang on 2026-10-17): the Nile (with the White Nile up to the Sudd swamps and the Blue Nile up to Lake Tana; decided by Yang on 2026-10-17, the White Nile's channels through the swamps made it too complicated), Euphrates, Tigris (which join to form the Shatt al-Arab), Indus, Ganges, Yellow River, Yangtze, Mekong, Danube with its delta branches, Rhine, Volga, Mississippi, Amazon with its main branches (Madeira, Negro, Xingu and Tapajós), Congo and Niger, taken from Natural Earth by name and always shown at every zoom, and large lakes (scale rank 4 or lower, and at least 3,000 km² each, so Ladoga, Onega and Vänern stay but the many small Finnish lakes do not) are drawn. The map must stay accurate enough that every historical place sits where it belongs: on the right coast, river or island. From milestone 2 the data build checks that each event and settlement location is on land at its date (or on water for sea events) and fails if not.
- **Raised continents.** Land stands a fixed 250 m (exaggerated with the relief) above the sea level of the date, so continents and islands read as chunky slabs, like a toy (spec section 8). **No walls at any coast** (decided by Yang on 2026-10-17: jagged, icicle-like walls along the Black Sea, the Crimea and Greenland "don't look good anywhere"). Near the sea, land and its lift may rise only as fast as a rounded clay edge allows: the data build stores every sample's distance from today's smoothed coastline (section 5.1) in km, up to 255 km, and the shader softly caps the land's rise above the date's sea level at d × (6 + 0.08 d) metres at d km from the coast (first d × (12 + 0.15 d), softened on 2026-10-18 with the smoother continents), after a flat beach of 2 km. At 100× relief that is a slope of about 30° at the shore, flattening the land within a few km of the sea and leaving mountains further inland alone, so a coast never steps from the exaggerated height to the sea between two neighbouring vertices. The cap uses today's coast for every date: where a lower sea exposes the continental shelf, the shelf is low and flat anyway. Lakes rise under the same cap; ice sheets have their own smooth profile (section 5.2).
- **Famous mountains** (decided by Yang on 2026-10-18: "kilimanjaro, mount fuji, and possibly other mountains are snow capped as well. make mount fuji look like it"). The ranges and peaks history needs most are listed in `data/curated/mountains.json`, each with the reason it matters and a source. A listed range (such as the Alps, the Himalaya and the Andes) keeps the relief smoothed with a Gaussian of only 25 km within its half-width, blending into the normal smoothing over 60 km. A listed peak (Everest, Mount Fuji, Kilimanjaro, Vesuvius, Etna, Olympus, Ararat and Popocatépetl) stands as a smooth cone reaching 70% of its real summit height, falling as (1 − t²)² to nothing at its listed radius (130 km for Mount Fuji, 120 km for Kilimanjaro), so the snow-capped ones carry a broad cap above the snow line (section 5.2). Under a peak the stored coast distance (below) is raised so the coast cap leaves the cone whole, but at most to 10 times its real value, so a peak near the sea still slopes down to the shore.
- **Depressions** (decided by Yang on 2026-10-18: "dead sea looks pretty bad"). Ground below sea level that is never drawn as sea is raised to sea level before smoothing, so it never shows as a steep, jagged pit: dry land that never joins the ocean, such as the Jordan rift with the Dead Sea or the Qattara Depression, and the ends of narrow gulfs that the smoothed coast closes even at today's sea level, such as the head of the Gulf of Suez (Yang, 2026-10-18: "the sinai area is weird. could be smoother").
- Elevation is exaggerated by a factor of 100 relative to the Earth's radius (decided by Yang on 2026-10-17, replacing 12), in the vertex shader, so the factor can be tuned without rebuilding data. The factor and the ice exaggeration (section 5.2) are the same so ice and rock line up. Relief is shown at every altitude, including from orbit, so mountain ranges stand out of the planet's outline.

### 4.3 Terrain painting

- The colours are saturated and warm, like painted clay: rich greens, golden steppe, orange-red deserts, warm grey-brown rock and soft white snow, with large soft patches instead of fine speckle. Until the textures below are approved, the shader paints these colours directly.
- The ground is splat-mapped from six painted tiling textures: grass, forest floor, soil and steppe, sand, rock and snow (spec section 8). Splat weights are computed in the shader from elevation, slope, latitude and a climate band.
- The climate band shifts with the date: at the height of the ice age, tundra and steppe reach far further south and deserts are wider, and both relax towards today's pattern as the ice retreats. The band is driven by the same glacial index as the ice (section 5.2), so ground and ice always agree. This is a deliberately broad approximation and is described as such in the About panel.
- **Deserts change with history** (decided by Yang on 2026-10-17). They follow the annual precipitation of Beyer, Krapp and Manica 2020 (0.5°, every 1,000 to 2,000 years from 54,000 years ago): aridity is 0 (green) at 600 mm a year or more and rises linearly to 1 (full desert) at 100 mm or less. Where the dataset has no value (the sea of its time, and south of 60°S), cells take the value of the nearest land, so coasts are not greened by the sea. The build evaluates it at each of the dataset's own time steps on a global 1° grid and stores it in the climate slices (section 5.2). The ground turns to steppe and then sand as aridity rises.
- **Green Sahara** (decided by Yang on 2026-10-17: "the Sahara wasn't always a desert"). Climate models, Beyer 2020 among them, are known to miss most of the rain of the African Humid Period, so the dataset keeps the Sahara a desert at every date. A curated override in `data/curated/humid-periods.json` raises the precipitation over North Africa and Arabia to at least 600 mm a year south of 20°N (enough to draw it green), falling to 450 mm at 25°N, 300 mm at 29°N and 150 mm at 32°N, fading out over 3° outside the region, while the period lasts: it starts abruptly about 14,800 years ago (about 12,800 BCE), weakens to half during the Younger Dryas cold spell (about 12,900 to 11,700 years ago), is at its full strength from about 11,000 to 6000 years ago and ends from about 5500 to 4800 years ago (about 3500 to 2800 BCE), when the Sahara becomes the desert of today. The Sahara is therefore drawn as savanna, grassland and steppe through the early farming era and turns to sand as Egypt's first dynasties rise. Sources: deMenocal et al. 2000 (Quaternary Science Reviews, abrupt onset and end of the African Humid Period), Tierney, Pausata and deMenocal 2017 (Science Advances, rainfall of the Green Sahara) and Shanahan et al. 2015 (Nature Geoscience, the time-transgressive end). The dates are approximate and named in the About panel.
- Lakes from Natural Earth are drawn as flat water at their surface height. Large rivers are drawn as wide, smooth bands of water with an ink outline, much wider than real rivers so they match the oversized people of later milestones (decided by Yang on 2026-10-17): the build smooths each river centreline into a curve and stores a river field per sample that is full within the river's core (about 12 km either side for the rivers Natural Earth ranks largest and 9 km for the others) and falls to zero over a further 30 km. Water is drawn where the field passes one half, so the banks are smooth curves at every zoom, and rivers keep the same width on the ground at every camera height.
- **Smooth water at every zoom** (decided by Yang on 2026-10-17). The ocean level, lake field and river field of each tile are also uploaded as a small texture, and the fragment shader samples them with a cubic B-spline filter, so coastlines, lake shores and river banks are smooth curves even when the camera is closer than the data's sample spacing, instead of straight segments along the triangles. The vertices still use the same fields to place the land and water surfaces.
- **Rivers reach the sea at every date** (decided by Yang on 2026-10-17). Natural Earth rivers end at today's coast, so the build continues each river mouth downhill across the land that the lower sea levels of the past expose, along the steepest way down the smoothed elevation and the ocean mask, until it reaches sea floor that is sea at every date (below −130 m) or a lake. In a flat basin with no way down (such as the Volga delta at the Caspian) it heads straight for the nearest water within 80 km, and every river runs on a few cells past its mouth so the smoothed shore never cuts it off. Where the sea is higher, the continuation lies under water and is not seen.
- **Rivers flow** (decided by Yang on 2026-10-17). Lighter pulses travel down every river towards its mouth, like the waves on the sea. The build stores, per sample, the distance along the river in units of one pulse spacing of 150 km, measured downstream (the mouth is the end with the lower elevation). The pulses are animated by the life clock and stop when everything is frozen; the low tier shows them still.
- **Smooth lakes** (decided by Yang on 2026-10-17). Lake outlines are smoothed like the rivers: the build blurs each lake's mask with the coast's Gaussian (about 28 km) and stores the result as a field from 0 to 1 per sample, and water is drawn where the interpolated field passes one half, with an ink outline.
- The six textures are generated assets and ship only after Yang approves them (section 12).

### 4.4 Water

- **The sea is completely flat** (decided by Yang on 2026-10-17). It is drawn as its own surface exactly at the date's sea level (a few metres below, so it never fights the land for depth), covering every terrain tile with a coarse grid of its own (8 × 8 cells per tile). On tiles that are sea at every date, the sea surface also carries the ice over the sea (section 4.2). The terrain surface leaves out every point the smooth ocean field (section 5.1) marks as sea, and its sea floor and the foot of its coast lie below the sea surface, so the water never slopes up a shore or follows the relief. The coastline is where the smooth field crosses the sea level, drawn with its ink line on both surfaces. The sea surface draws only the sea and its coast line, so land lying below the sea level away from the sea (such as the Dead Sea or the low ground at the head of the Gulf of Suez) shows its own ground and never a ghost of the sea surface through it. A sea that the ocean reaches inside a lake basin (such as the Baltic) is sea and lies at the sea level too. The sea has one colour at every depth, with no lighter shallows along the coasts (decided by Yang on 2026-10-17). Lakes and rivers use the same blue (decided by Yang on 2026-10-18; first a slightly lighter blue).
- The sea is a bright, saturated blue that looks like glossy plastic, with a lighter sheen towards the globe's edge but no reflection of the light.
- **Waves and texture** (decided by Yang on 2026-10-17). The open sea carries a stylised cartoon pattern rather than a flat colour: soft lighter ripple bands of long wavelength (several times the spacing of the first version, decided by Yang on 2026-10-17) that drift slowly, small white wave crests scattered over the water that appear and fade, and a gentle swell in the shading. The pattern lives in world space so it stays put as the camera moves, and its scale adapts to the distance so it reads from orbit and close up. It does not mark depth, so there are still no lighter shallows. The large lakes and inland seas, such as the Black Sea and the Caspian, carry the same waves (decided by Yang on 2026-10-17); since only lakes of at least 3,000 km² are drawn, every drawn lake has them. Rivers stay without waves.
- The waves are animated by the clock (section 3.3). Animation stops when history is paused.

### 4.5 Sky and horizon

- There is no atmosphere glow around the globe, no haze over distant terrain and no stars (decided by Yang on 2026-10-17). From orbit the globe sits on a soft pastel background, muted peach at the bottom of the screen fading to lilac and sky blue at the top, like a studio backdrop, a little darker than the first version (decided by Yang on 2026-10-18).
- **Clouds.** About 30 big puffy cartoon clouds, each a cluster of soft white balls, float a little above the ground and drift slowly around the globe on the clock (still when history is paused). Their places come from a seeded hash, so they are the same for every viewer. They carry no weather meaning. They fade out as the camera comes down, between 5,000 km and 3,000 km, about when Europe fills the screen (decided by Yang on 2026-10-18), so they never block a closer view, and are drawn in one batch.
- Close to the ground the sky behind the horizon fades from blue at the zenith to a paler blue at the horizon, so a low view does not look like space.
- The ink outline of the globe's edge fades out as the view tilts from 42° to 58° away from straight down, so at low angles it never cuts across the mountains in front of the horizon (decided by Yang on 2026-10-18).
- The curved horizon comes naturally from the sphere: as the camera comes down it tilts towards the horizon (section 6), giving the look of Populous: The Beginning.

## 5. The planet over time

Everything in this section is a pure function of the date, computed from data, so scrubbing to any date shows the coastline and ice for that date at once.

**One planet query.** Sea level, whether a place is sea, ice cover and the height of the drawn ground at a place and date are answered by one planet query (`src/planet`). It samples the terrain data the way the terrain mesh does (heights bicubically, the ocean level, lake field, bed and coast distance bilinearly) and applies the same rules as the terrain shader (sea, lakes, the land lift, the rounded coast of section 4.2 and the ice domes of section 5.2), and the shader takes its constants from the same module. Everything placed on the ground, such as vignette figures, trees and the camera's lowest height, therefore stands on the drawn surface rather than floating above it or sinking into it.

Sea level, ice and deserts come from published reconstructions (decided by Yang on 2026-10-17, replacing the hand-made models of the first drafts): ice thickness and sea level from PaleoMIST 1.0, and precipitation from Beyer, Krapp and Manica 2020 (section 4.1). Both are read from the small extracts under `data/sources/`. The main periods they show:

| Period (approximate) | Ice | Sea level |
| --- | --- | --- |
| 50,000 to 29,000 BCE | Mid-sized ice sheets (a milder phase of the last ice age) | About −50 to −90 m |
| 24,000 to 17,000 BCE | Last Glacial Maximum: ice at its largest | About −120 m |
| 17,000 to 9700 BCE | Fast melting; the ice age ends about 9700 BCE | Rising to about −50 m |
| 9700 to 5000 BCE | Scandinavian and North American ice gone | Rising to roughly today's level |

### 5.1 Sea level and coastlines

- **Sea-level curve.** Global mean sea level relative to today: for every PaleoMIST time step (every 2,500 years), the build averages the relative sea level over today's ocean, weighted by area, and interpolates smoothly (monotone cubic) between the steps so the sea never rises in visible jumps. It is stored every 100 years in the startup index (section 10.2) with its source.
- **Ocean mask.** A coastline cannot simply be "everywhere below sea level", because inland basins such as the Caspian Sea and the Dead Sea lie below today's sea level but are not part of the ocean. The data build therefore computes, for every terrain sample, the lowest sea level at which that sample is connected to the open ocean (a priority flood fill outward from the deep ocean, seeded from sea floor deeper than 3,000 m, in 1 m steps from −130 m to +10 m, on the 4 arc-minute elevation grid). The flood runs on the elevation before smoothing (section 4.2), so straits and sills keep their true depth. Straits that are narrower than the grid, or that the smoothing of the coast (below) would close, are listed in `data/curated/straits.json` (such as Gibraltar, the Bosporus, the Dardanelles, the Sea of Marmara between them, Bab-el-Mandeb, Hormuz, the Øresund, the Great Belt and the Kattegat between Jutland and Sweden, Kerch, Messina, Dover, the North Channel between Ireland and Britain, Tsugaru between Honshu and Hokkaido, the Sunda Strait, Cook Strait, the Strait of Malacca, the Qiongzhou Strait south of Hainan, Palk Strait, the Strait of Belle Isle, the ʻAlenuihāhā Channel in Hawaii, the channel between Corsica and Tuscany, and La Pérouse and Nevelskoy around Sakhalin), each as a line with its sill depth and a source, running well out into open water on both sides; the build carves each line to its sill depth before the flood and draws it at least 24 km wide (first 12 km, decided by Yang on 2026-10-17: Denmark and Sweden, and Sicily and Italy, ran together), so a strait is open exactly when the sea level is above its sill. A narrow sea that the smoothing would erase can be listed the same way with a wider core: the Sea of Marmara is a line along its length with a 25 km half-width core (decided on 2026-10-18: without it the Bosporus led into land). Narrow gulfs that shape a coast the history needs are listed the same way, from the open sea to the gulf's head: the Gulf of Suez and the Gulf of Aqaba, so the Sinai peninsula keeps its shape (Yang, 2026-10-18: "the sinai area is weird"; the Red Sea ended in one rounded lobe). The Black Sea, the Caspian Sea and the Baltic Sea are flooded as permanent lakes at fixed levels (0 m, −28 m and 0 m) within their own basins (a bounding box per sea in the data build, so the flood cannot leak through a strait into the ocean), so a sea that the falling ocean cuts off is drawn as a lake, never as dry land (decided by Yang on 2026-10-17). Where the ocean reaches such a basin, it is drawn as sea (decided by Yang on 2026-10-17: the Baltic is part of the Atlantic), with the sea's colour and waves; only while it is cut off is it drawn as a lake. The sea then fills the basin's smooth lake outline (the build gives every point of the lake field the level at which the nearest point of the basin joins the ocean, raised by 2 m for every step the field lies below one half, so the level follows the smooth field), so no strip of lake, and no raised lake rim, is left along its shores.
- **Smooth coasts** (decided by Yang on 2026-10-17). Coasts are smoothed like the rivers: after the flood, the build first grows every coast 34 km out into the sea (the maximum of the connection level over a 34 km disc; first 16 km, raised with the stronger blur on 2026-10-18 so peninsulas and islands about 20 km wide survive it), then blurs it with a Gaussian of about 28 km (first 8 km, then 20 km, decided by Yang on 2026-10-18 with the smoother elevation) (treating land that never joins the ocean as +40 m), takes the minimum with the carved straits, and stores the result. The growth makes up for the blur, which on its own wears coasts back by about 14 km, so peninsulas and islands are kept and come out slightly larger rather than smaller (decided by Yang on 2026-10-17: Italy had lost its heel and toe). Straits narrower than about 50 km would close, so the important ones are listed (above). The coarse tiles seen from far away sample the coast more sparsely, so for every quadtree level whose samples lie 30 km or more apart the build makes its own coast field: grown by 0.4 and blurred by 0.5 of the sample spacing, with the straits laid in again at least half a spacing wide. Italy, Greece and the Crimea therefore keep their shape from orbit too. A sample is sea when this smoothed value is at or below the date's sea level, whatever its height, and the water depth used to draw the coastline between vertices is the difference between the two. Coastlines are therefore smooth curves at every sea level, and features smaller than about 28 km, such as islets and narrow inlets, disappear (kept islands are enlarged first, section 4.2). The smoothed level is stored in centimetres, so flat coasts do not move in whole-metre steps. Natural Earth lakes are flat water at the 20th percentile of the heights along their shore. The value is stored as an extra channel of each terrain tile.
- **Known simplifications**, named in the About panel: the land surface is today's, so the sinking of land under the ice sheets and its later rebound are not shown; past lakes that no longer exist (such as the glacial Lake Agassiz) and the Black Sea before it joined the Mediterranean are not shown in this milestone.
- **Teaching moments the data must show** (exit criterion 1): Beringia joining Siberia and Alaska, Doggerland joining Britain to the continent, and Sundaland joining Sumatra, Java and Borneo to mainland Asia, each opening as the sea falls and drowning as it rises again. Sahul (Australia joined to New Guinea) shows too.

### 5.2 Ice sheets

- **Data.** Where the ice is comes from the grounded ice thickness of PaleoMIST 1.0 (0.25°, every 2,500 years from 52,500 years ago to today). Only whether a place is covered matters, not how thick the ice is (decided by Yang on 2026-10-17: the 14 MB of ice data was far too much). **Climate slices**: for each time step of the climate data (every 1,000 to 2,000 years, the ice interpolated linearly between its own steps), the data build makes one small global file on a 0.5° latitude-longitude grid holding the ice cover and, on a 1° grid, the aridity (section 4.3). Ice is covered where the smoothed thickness (below) reaches 60 m. Gaps up to 200 km between two sheets, over land or sea, are then filled (a morphological closing of the ice by 100 km), so neighbouring sheets such as those of the Canadian Arctic and Greenland merge; gaps up to 200 km of land between ice and the sea are filled too (a closing of the ice together with the sea that adds only land); and the ice runs 80 km out over the sea it meets, so no strip of bare coast shows between ice and sea (decided by Yang on 2026-10-18: "how come the ice sheet in the arctic does not merge", "ice sheets should merge"). Since the smoothing below can reopen a filled gap next to open water, the smoothed cover is closed once more, and around what that adds the field takes the lightly smoothed (25 km) distance of the closed cover where it is larger; the file stores the signed distance from the ice border in steps of 4 km (positive inside the ice, from 128 km outside to 892 km inside), smoothed with a Gaussian of 30 km (60 km in the polar regions and 120 km south of 60°S), so the border is a smooth curve and small ice-free patches inside a sheet do not show. Between two slices the renderer blends the distances, so the border moves smoothly as the ice grows and melts.
- **Smooth domes** (decided by Yang on 2026-10-17: the ice sheets were not smooth, "fewer polygons!"). The ice surface is drawn from the distance alone: it stands on the heavily smoothed bed that the terrain tiles carry (the elevation averaged to about 0.5°, never below the sea level) and rises from its border like a dome, 1,200 m × (1 − e^(−d / 250 km)) at d km inside, at the relief's exaggeration. The relief under the ice is hidden, and the ice rises from the sea or the land, over the first 120 km, so the sheets are plain smooth domes with gentle edges, shaded by their own surface, with no walls where they meet the sea or the land. The polar regions (north of 74°N and south of 62°S) are drawn with tiles no finer than level 4, since their smoothing leaves no detail for finer tiles.
- The land surface stays today's: the sinking of the land under the ice is not shown, so ice is drawn on today's bedrock.
- **Glacial index.** The ratio of the date's sea level to the lowest sea level of the curve, from 0 (today) to 1 (glacial maximum), drives the climate band in section 4.3.
- The ice border is drawn where the blended distance crosses zero, sampled per pixel, so it is a smooth curve with a smooth ink outline rather than following the vertex grid (decided by Yang on 2026-10-17).
- Today's coastlines get no ink where ice covers them, so buried coasts do not show through the ice sheets.
- **Polar ice sheets** (decided by Yang on 2026-10-17). The relief under the polar ice is not useful for history. Where the polar simplification applies (section 4.2), the build smooths the thickness before deciding the cover: it averages the bed plus the ice over a disc of about 120 km (250 km south of 60°S) and subtracts the bed again, and towards the margin it thins by the share of the disc that holds ice. South of 60°S, land with ice nearby is always covered, so Antarctica's ice reaches its coast.
- **Arctic pack ice** (decided by Yang on 2026-10-17). The Arctic Ocean has carried sea ice all year through the whole timeline. It is drawn as a flat, pale ice cover on the sea north of a gently wobbling edge near 78°N today, reaching 70°N at the glacial maximum (moving with the glacial index), with an ink outline. This is a simplified extent, named in the About panel. Past the pack edge the ice sheets and the pack ice read as one ice (decided by Yang on 2026-10-18): no ink line where they meet, and the sheets reach over the pack and over narrow strips of shore up to 80 km away, the reach growing smoothly from nothing at the pack edge.
- **Snow caps** (decided by Yang on 2026-10-18, replacing the snow and glacier painting of 2026-10-17: ice on the mountains had no ink border, "I would like to consistently have borders. We can simplify the ice on the mountains a bit"). High mountains turn to rock towards a snow line and carry simple merged ice caps above it, drawn as ice with the same white surface and ink outline as the ice sheets. The snow line is 3,600 m of smoothed height up to 20° of latitude, 3,000 m at 28° (so the dry subtropical hills such as Sinai, the Red Sea hills and Arabia stay sand-coloured instead of turning to blotchy rock), 1,600 m at 36°, 1,500 m at 46°, 800 m at 65° and 400 m from 75°, moving 12° towards the equator at the glacial maximum with the glacial index. A place is under a cap where it stands above the snow line and also more than 300 m above the heavily smoothed bed, so flat high plateaus such as Tibet and the Altiplano stay bare. The metres above that limit count as ice distance (10 km per 100 m), so a cap and an ice sheet share one field and one outline where they meet. Plants keep clear of caps as they do of the ice sheets.
- Ice is drawn as a raised, glossy white surface with soft blue shading, like icing on a cake, with the same elevation exaggeration as the land, cracked blue edges where it meets the sea, and a soft edge where it ends on land. The Laurentide and Fennoscandian ice sheets must read clearly from orbit at 20,000 BCE and be gone by about 5000 BCE, apart from Greenland and Antarctica, which stay.

## 6. Camera

### 6.1 Range and behaviour

- The camera orbits a target point on the globe. Its distance ranges from 2.6 Earth radii (the whole planet with room around it), or further on a narrow phone screen so the whole globe fits across it, down to 1,300 km above the surface, where Spain fills the screen (decided by Yang on 2026-10-18: "it's also not great to allow too high zoom levels"; first about 2 km).
- Tilt follows altitude by default: looking straight down from 6,000 km and above, tilting gradually to 40° at the closest zoom, so close up the view looks across the land. The viewer can tilt to any angle between straight down and nearly level (85°) at every altitude, with the controls below or two tilt buttons under the compass (decided by Yang on 2026-10-17).
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
| Reset heading and tilt | Compass button | Compass button | N |

Keyboard controls are active whenever focus is not in a text field. Touch gestures on the globe never scroll or zoom the page.

### 6.3 Fly-to

The camera has one fly-to operation used by bookmarks now and by events and famous people later: it moves to a target position, distance, tilt and heading along an arc that rises with the distance travelled, taking 1 to 3 seconds. Any input during a flight stops it where it is. With the system setting for reduced motion, flights are shortened to a quick fade.

## 7. Timeline

### 7.1 Layout

- The timeline is a strip along the bottom of the screen, drawn on a canvas, with its expand button built into its left edge. It has a date readout, the playhead, a lane "World" and one lane per region in the order of spec section 7.1.
- Lanes show the era ranges from [eras.md](eras.md). The World lane uses a fixed colour per era; regional ranges use the colour assigned to that polity in `data/curated/eras` (later shared with the border overlay). Overlapping ranges in one lane stack into sub-rows.
- A range's label is drawn inside it when it fits, otherwise it is shortened with an ellipsis and shown in full on hover or tap, together with its dates. German labels are about a third longer, so layout never assumes English widths.
- **Collapsed (the default on every device):** the timeline shows only the lane of the region the globe is centred on, which changes as the viewer moves the globe (decided by Yang on 2026-10-17). The collapsed timeline always keeps the height of the regional lane with the most sub-rows, so moving the globe to another region never changes its height or shifts the controls above it (decided by Yang on 2026-10-18); a lane with fewer sub-rows sits at the top and leaves the rest empty. The region comes from a coarse region lookup table built by the data build. A button at the left edge of the timeline, inside its frame (decided by Yang on 2026-10-18), expands it to the World lane and all regional lanes, taking at most about a third of the window height on desktop and two thirds on phones, and collapses it again. The choice is saved with the settings.

### 7.2 Axis and zoom

- The default axis is **logarithmic** in the time before the end of the timeline (decided by Yang on 2026-10-18). A date *d* sits at

  `x = 1 − ln(1 + (end − d) / k) / ln(1 + (end − start) / k)`

  across the whole timeline, from 0 at 70,000 BCE to 1 at the end, with *k* = 50 years (**Proposed**). *k* sets how much room the last decades get: without it the end would stretch without limit. With 50 years and the event lists of the spec at the time of writing, the axis gives about a third to everything before 3000 BCE, a tenth to 3000 to 500 BCE, a fifth to 500 BCE to 1500, an eighth to 1500 to 1800, a twelfth to the 19th century and about a seventh to 1900 to 1991, so the listed events spread far more evenly than on a linear axis. The data build reports how evenly the events spread, so *k* can be tuned as content grows. The axis is used only for drawing the timeline and for the content time windows (section 10.3); the clock and the world do not depend on it.
- Because the clock runs at one pace, the playhead moves slowly across the deep past and faster towards the end, which shows how much more is happening there.
- The toggle "True time scale" switches to a linear axis in years, where all of written history is a thin sliver at the right end. The switch animates over about half a second and keeps the playhead in place.
- The timeline zooms from the whole of history down to about a single year across its width: scroll wheel or pinch over the timeline. There are no zoom buttons (removed by Yang on 2026-10-18). Tick labels adapt to the zoom (10,000 years, 1,000 years, 100 years, 10 years, 1 year) and are formatted per language.
- By default the visible window follows the playhead while playing; dragging the timeline background pans it and stops following until the play button or a "follow" button is pressed. The follow button sits at the right edge inside the timeline and shows only while the timeline is not following.

### 7.3 Scrubbing

- Dragging the playhead, or pressing on the timeline and dragging, scrubs the date. The globe updates live: sea level, ice and climate band follow the playhead every frame at 60 fps on desktop (section 11). **No flicker while scrubbing** (decided by Yang on 2026-10-17): ice and deserts come from the global climate slices (section 5.2), which are all loaded soon after start and kept on the graphics card, so scrubbing only changes which two slices are blended and by how much, for the whole globe at once; nothing is loaded tile by tile and nothing pops. Until a slice has arrived, the nearest loaded slices stand in for it (section 10.7).
- Clicking a point on the timeline jumps there. Tapping an era range shows its name and dates; it does not jump.
- Keyboard: Home and End jump to the start and end; with focus on the timeline, left and right arrows step by one tick of the current zoom.

### 7.4 Era data

`data/curated/eras` holds the ranges of [eras.md](eras.md) as records in the format of [content-format.md](content-format.md): id, lane, `when` (converted to whole days, with approximate flags per end), colour, a source, and a title in `en` and `de`. The data build validates them like all content (section 10.8) and writes them into the startup index. Events are not shown on the timeline in this milestone.

## 8. Interface shell

### 8.1 Screen layout

- The globe fills the screen. Text on buttons, the speed selector, the date ribbon and the timeline cannot be selected, so clicking and dragging never highlights it (decided by Yang on 2026-10-17); text in the About panel and in cards can be selected. The timeline runs along the bottom. Above its left end sit the play controls: one play/pause button, the speed modes and the rate readout. The top-right corner holds three buttons: bookmarks, settings and About. The history lens button ([history-lens.md](history-lens.md) section 1) sits at the bottom right, at the right end of that row, just above the timeline.
- Sliders fold away behind icon buttons, so the screen stays calm (decided by Yang on 2026-10-18). The three speed-mode buttons (section 3.3) fold away behind the play/pause button, and the history lens slider behind a magnifying-glass button. Pointing at a button shows a short explanation of what it does, and the slider slides out beside its button while the pointer is over the button or the slider. The speed modes pop up above the play/pause button as a column of bare buttons as wide as it, with no box around them, fast forward at the top and snail nearest the button, so they never cover the date beside it (Yang, 2026-10-18; icons by Yang the same day: turtle, walking person, galloping horse). Both fold away when the pointer leaves. On touch screens, where nothing can be pointed at, tapping the button opens them (the play/pause button also plays or pauses), and tapping anywhere else folds them away again. They also open while they have keyboard focus. While folded, the play/pause button shows a small turtle or horse when the mode is not regular. The play/pause explanation is "Play history; the buttons above it set the speed" ("Geschichte abspielen; die Knöpfe darüber stellen die Geschwindigkeit ein"), or "Pause history; …" ("Geschichte anhalten; …") while playing. The speed modes are named "Slow", "Regular" and "Fast" ("Langsam", "Normal", "Schnell").
- The date readout is large and clear above the timeline's playhead area, in the format of section 3.2.
- All controls are at least 44 by 44 CSS pixels on touch devices, have visible focus outlines, and have accessible names in the current language.

### 8.2 Settings

| Setting | Values | Default |
| --- | --- | --- |
| Language | English, Deutsch | Browser language if German, otherwise English |
| True time scale | On, Off | Off |
| Show performance stats | On, Off | Off |

The language names in the selector are always written in their own language. Changes apply immediately and are saved (section 9).

### 8.3 Bookmarks

A bookmark stores a date and a camera position under a name the viewer types, defaulting to the formatted date. The bookmarks panel lists them, newest first; tapping one flies to it (section 6.3) and sets the date while keeping the play state. Bookmarks can be renamed and deleted. The app ships with no preset bookmarks in this milestone.

### 8.4 Localisation

- Every UI string lives in `app/messages/en.json` and `app/messages/de.json` under the same keys. Messages use ICU-style placeholders and plural forms, resolved with `Intl.PluralRules`. A small in-house formatter is used instead of a library, to keep the bundle small; it covers placeholders and plural forms only.
- `npm run check` fails when a key exists in one language and not the other, when a message is empty, or when a component contains a string literal that is shown to the viewer. Textures and generated images carry no text.
- The interface and the timeline use the Fredoka web font (variable weight, Latin and Latin Extended, so German umlauts and ß are covered), bundled with the app from `@fontsource-variable/fredoka` under the SIL Open Font License 1.1 (spec section 13), with `system-ui` as the fallback.
- Numbers use `Intl.NumberFormat` for the active language. Dates use the in-house formatting of section 3.2, because `Intl.DateTimeFormat` does not handle years before 1 CE or the BCE suffixes well.
- Switching language changes every visible string at once, including the timeline labels, tick labels, the rate readout, tooltips, accessible names, the About panel and the page title, without a reload and without changing date, camera or play state. The `lang` attribute of the page follows the language.
- The light index (section 10.2) is per language; switching language loads the other language's index if it is not cached and keeps the old strings visible until it arrives.

### 8.5 About panel

Shows the app name, version and content cutoff date; the data sources and licences from `data/sources.json`; and the known simplifications named in sections 4.3, 5.1 and 5.2, in plain language for the child and the parent. All text is in both languages and lives in the message files.

## 9. Saved state

Local storage holds only small things (spec section 7.6). Each key is versioned JSON; values that fail validation or have an unknown version are discarded and replaced by defaults, never causing an error.

| Key | Holds | Written |
| --- | --- | --- |
| `miniworld.settings.v1` | The settings of section 8.2 | On change |
| `miniworld.view.v2` | Last clock time (whole milliseconds), camera target, distance, tilt and heading, play state and speed mode | At most once every 2 seconds, and when the page is hidden; only when it has changed |
| `miniworld.bookmarks.v2` | Up to 200 bookmarks: id, name, clock time, camera; version 1 bookmarks are converted from their day to the clock time at which that day begins | On change |

On start, the saved clock time and camera are restored; a saved play state of *playing* is restored as *paused*, so the world does not run on while nobody is watching. Saved state never affects what the world looks like at a given clock time: it only chooses which moment and view to show.

## 10. Content pipeline

This milestone builds the full delivery path of spec section 10 even though there is little content yet, so later milestones only add layers.

### 10.1 Manifest

`manifest.json` is the only file fetched without a content hash in its name. It holds the build version, the content cutoff date, the supported languages, the quadtree and time-window definitions, and for every layer the chunk keys with their file names for quadtree levels 0 and 1 plus, for deeper levels, one hashed part file per level 2 tile that lists the chunks below it. Part files are fetched when the camera first needs a tile under them, which keeps the manifest small. Tiles that are entirely deep ocean have no terrain file and are listed as deep. It is fetched network-first on every start and falls back to the cached copy when offline.

### 10.2 Startup index

One light index per language, fetched with the manifest: the era records with their labels in that language, the timeline axis constant *k* (section 7.2), the sea-level curve, the region lookup table for the phone timeline, and the source and licence list for the About panel. Layers that do not exist yet (events, famous people) are present as empty lists, so the format does not change when they arrive. Budget: at most 150 KB compressed per language.

### 10.3 Chunk keys

- **Place:** a cube face and quadtree path, for example `2/0313`, at a level chosen per layer: terrain at every level up to 5. The climate slices are global and keyed by their time step only.
- **Time:** windows of equal width on the logarithmic timeline axis (section 7.2): 35 windows over the whole timeline, about 13,500 years at the start, about two centuries around the year 1000 and about 12 years at the end, so each holds a similar amount of content. Window boundaries are whole days, computed by the data build and listed in the manifest. Layers that do not change with time, such as terrain, use the single window `all`.
- **Language:** `xx` for layers without text, otherwise `en` or `de`.

A chunk's file name is `{layer}/{place}/{window}/{language}.{hash}.{ext}`, where the hash is the first 16 hex characters of the SHA-256 of the file's content.

In this milestone the shipped layers are `terrain` (place only) and the climate slices (time only, listed in the manifest with their days and hashed file names). Per-language chunks are proven by a test layer that exists only in the test fixtures: the pipeline tests build it, load it in a browser test in both languages and check that only the active language's chunks are fetched.

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

### 10.8 Data build validation

The build fails when: a source has no licence entry, its licence is not allowed by the data licence policy, or its files under `data/sources/` do not match their checksums; an era record lacks a date, a source or its label in any supported language; a date is outside the timeline; an approximate flag is missing where [eras.md](eras.md) marks "c."; a chunk exceeds 1 MB; or a referenced asset is not `approved` in the asset manifest.

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

The renderer tracks an average of recent frame times. When it rises above the target (16.7 ms on desktop, 33 ms on phones) for half a second, the render scale drops by a step of 10 %, down to half of the cap (section 11.2); when frame time stays well below the target for 3 seconds, it rises a step again. The interface is drawn at full resolution regardless.

### 11.4 Stress scene

The stress scene proves the figure-heavy targets before any content exists and stays in the test suite as a performance check.

- Opened with `?scene=stress` in the URL; not reachable from the interface.
- A fixed camera path over the Nile delta at close zoom, then out to orbit and back down, about 60 seconds long, with the clock running from 1 CE in regular mode.
- 20,000 placeholder figures over an area of about 30 × 30 km, of which up to the animated-figure limit (section 11.2) are drawn as animated figures near the camera and the rest as simple coloured marks. 1,000 placeholder buildings of about 2,000 triangles each.
- Placeholder figures are a simple humanoid of about 700 triangles on one shared skeleton, with three baked animations (walk, work, idle) played from an animation texture on the GPU, drawn with instancing: the technique real figures will use in milestone 2. They are coloured by a hash of their index, and their positions and animations come from a seeded hash of index and clock slot, never from `Math.random`.
- The placeholders are generated in code as plain shapes, not shipped assets, so they need no approval; they never appear outside the stress scene.
- A stats overlay (also available in the normal app from the settings) shows frame time with its average and 99th percentile, draw calls, triangles and render scale.
- `npm run perf` runs the camera path in Chromium and writes a report: average fps, 99th percentile frame time, the average and 99th percentile time the main thread spends updating a frame before drawing it, and maximum draw calls and triangles per frame. On a reference device the same report is produced from a button in the overlay, so results can be recorded from a real phone. CI runs the scene headless and fails only when draw calls or triangles exceed the budget, since its frame times mean nothing.

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

## 12. Assets in this milestone

The only shipped assets are the six terrain textures, the water normal map and the ice texture. The interface icons are simple shapes drawn in code (SVG), and the interface uses the Fredoka web font (section 8.4), so neither needs an approval. Each is generated and listed in `data/assets/manifest.json` with: id, file, kind, how it was generated, status (`generated`, `approved`, `rejected`), the date it was reviewed and a note; a model built by code also records the hash of the geometry that was approved (milestone 2, section 13.3). Until Yang approves an asset, the app uses a flat-coloured stand-in of the same size in development, and the production build fails if an unapproved asset is referenced.

## 13. Tests

| Test | Checks |
| --- | --- |
| Date unit tests | Day-number conversion, year 0, leap years, formatting in both languages |
| Clock rate test | 25 years per minute exactly; round trip day to clock time and back at the start, the end and around year 0; length of the timeline (section 3.3) |
| Clock tests | Play states, the three speed modes and their keys, end of timeline, scrubbing, the clock stops when paused; the timeline axis round trip and its ends (section 7.2) |
| Golden tests | For a fixed list of dates (50,000 BCE, 20,000 BCE, 12,000 BCE, 8000 BCE, 6200 BCE, 3000 BCE, today) and places (Bering Strait, North Sea, Java Sea, Torres Strait, Hudson Bay, Baltic, Caspian Sea): sea level, whether each place is sea or land, ice cover, glacial index, and the height of the drawn ground. They run on the built data (`npm run golden`; in CI on the fixture dataset after its build), with the results stored per dataset (fixture or full) beside the test. Stored results must match exactly; changes must be intended and reviewed |
| Localisation tests | Same keys in both message files, no empty messages, no viewer-facing literals in components |
| Data validation | Section 10.8 on the fixture dataset in CI and the full dataset locally |
| Pipeline tests | Chunk keys, hashing, manifest, the test layer in both languages |
| Loader tests | With a fake server and clock: at most six requests at once and most urgent first, new priorities, cancelling, the growing retry pauses, no second request for a missing file, a failed index retried; terrain tiles cancelled when out of view; every binary format round-trips and refuses a file of the wrong length (section 10) |
| Browser tests | Desktop and phone sizes: first view loads within the size budget; timeline scrubbing changes the date and coastline; language switch changes every string without reload; settings and bookmarks survive a reload; camera controls with mouse, touch emulation and keyboard |
| Performance check | Stress scene draw calls and triangles (section 11.4) |

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

Decided by Yang on 2026-10-18: one clock for everything, with no separate life clock, at a uniform 25 years per minute; three speed modes (snail, regular, fast forward) instead of the speed slider; no slowdown when zoomed in (section 3.3); and a logarithmic timeline axis (section 7.2).
