# Milestone 1: Globe and time

This is the detailed spec for the first milestone in [milestones.md](milestones.md#1-globe-and-time). It refines [spec.md](spec.md) for what milestone 1 builds; where the two disagree, fix whichever is wrong in the same pull request. Decisions marked **Proposed** are defaults chosen so work can start and are open for Yang to change; the open question is in section 16.

**Goal:** a beautiful, empty Earth you can fly around and travel through time on. There are no people, settlements, events or borders yet. What a viewer sees at the end of this milestone: the globe at 50,000 BCE with the ice sheets and land bridges of the ice age, a timeline with coloured eras along the bottom, and the sea rising and the ice melting as time plays or the playhead is dragged towards today, in English or German.

The milestone proves the technical foundations every later milestone builds on: the terrain renderer, the two clocks, the timeline, localisation, content streaming and the performance budget.

## 1. Deliverables at a glance

| Area | Delivered | Section |
| --- | --- | --- |
| Project | TypeScript app, npm scripts, data build, CI | 2 |
| Time | Whole-day dates, historical clock with rate curve and speeds, life clock, pause and freeze, constant lighting | 3 |
| Globe | Cube-sphere terrain from elevation data, painted textures, water, exaggerated relief, curved horizon | 4 |
| Planet over time | Sea level and ice sheets that change with the date | 5 |
| Camera | Orbit-to-ground camera for mouse, touch and keyboard | 6 |
| Timeline | World and regional era lanes, zoom, scrubbing, true time scale | 7 |
| Interface shell | Controls, settings, bookmarks, English and German | 8 |
| Saved state | Settings, last date, camera, bookmarks in local storage | 9 |
| Content pipeline | Manifest, startup index, chunks, hashing, service worker | 10 |
| Performance | Stress scene, quality tiers, dynamic resolution | 11 |

## 2. Project setup

### 2.1 Toolchain

- Development runs in Yang's devenv Docker container (spec section 11). `.nvmrc` and `engines` in `package.json` pin Node (current LTS); every other tool is a dev dependency, so `npm ci` sets up everything and nothing is installed globally. `npm run dev` starts the dev server on port 8800 with hot reload, listening on all interfaces, serving the app and the locally built content under the same origin.
- Vite as dev server and bundler, TypeScript in strict mode, ESLint and Prettier, Vitest for unit and golden tests, Playwright (using the pre-installed Chromium where available) for browser tests.
- The app uses Three.js for rendering and Preact for the interface, as in spec section 9. New runtime dependencies need a reason in the pull request that adds them, because every kilobyte counts against the first-view budget (section 10.6).

### 2.2 Repository layout

```
app/              the browser app
  src/time/       dates, historical clock, life clock, formatting
  src/globe/      terrain, water, ice, sky, camera
  src/timeline/   canvas timeline
  src/ui/         Preact shell, settings, bookmarks
  src/i18n/       message loading, plural rules, date and number formatting
  src/content/    manifest, chunk loader, service worker
  src/perf/       stress scene, quality tiers, dynamic resolution, stats overlay
  messages/       en.json, de.json
data/
  sources/        simplified extracts of the source datasets used, with their licence texts
  curated/        hand-curated records, such as eras (format in content-format.md)
  schema/         one schema per content kind, shared by the data build and the app
  build/          Node scripts for the offline data build
  assets/         asset manifest and approved assets
dist/             build output (not committed)
```

**Simplified source data is kept in the repository** (decided by Yang on 2026-10-17). The full original downloads are not stored: `npm run fetch-data` downloads them into `data/out/` (not committed) and checks them against the checksums recorded in `data/sources.json`, and `npm run simplify-data` turns them into small extracts that are committed under `data/sources/<source-id>/` as plain files (no Git LFS), together with the licence text, so the app can always be rebuilt even if a source disappears from the web. An extract keeps only the variables, times (from the timeline's start onwards) and resolution the app needs (section 4.1). Gridded extracts are Brotli-compressed little-endian grids, `<name>.bin.br`, each with a JSON header, `<name>.json`, giving the variable, units, type, scale, no-data value, size, grid registration, origin, cell size and the years before present of each layer; layers follow one another, rows run from north to south and columns from west to east. The data build reads only from `data/sources/` and checks every file against the checksum in `data/sources.json`.

`src/time` and the pure functions of `src/globe` that depend on the date (sea level, ice, ocean mask) contain no DOM, Three.js or network code, so the world query of milestone 2 can move them into the Web Worker unchanged.

### 2.3 Scripts

All are npm scripts, run in the dev container or any machine with the pinned Node:

| Script | Does |
| --- | --- |
| `npm run fetch-data` | Downloads the original source datasets listed in `data/sources.json` into `data/out/` and checks them against their recorded checksums (recording the checksum of a new source); used only when adding or updating a source |
| `npm run simplify-data` | Turns the original downloads into the simplified extracts under `data/sources/` and records their checksums; used only when adding or updating a source |
| `npm run build-data` | Runs the offline data build (section 10): terrain tiles, ocean mask, ice, sea-level curve, startup index, chunks, manifest |
| `npm run dev` | The dev server on port 8800 |
| `npm run build` | Production build of app plus data into `dist/` |
| `npm run check` | Lint, typecheck, unit and golden tests, data validation |
| `npm run test:browser` | Playwright tests at desktop and phone sizes |
| `npm run perf` | Runs the stress scene and prints the performance report (section 11.4) |

### 2.4 Continuous integration

GitHub Actions runs on every pull request and on `main`: lint, typecheck, unit and golden tests, data validation against a small fixture dataset, the production build with its size check (section 10.6), and the Playwright tests in headless Chromium. CI does not judge frame rate, because CI machines are not the reference devices; it checks draw calls and triangle counts of the stress scene instead (section 11.4).

## 3. Time

### 3.1 Dates

- A date is a whole-day integer: the number of days since 1 January 2000 CE in the proleptic Gregorian calendar, negative before that. 70,000 BCE is about −26.3 million, well inside a 32-bit integer. No floating-point years are used anywhere in world state.
- Internally years use astronomical numbering (1 BCE is year 0, 2 BCE is year −1). Conversion between day numbers and calendar dates is a pure function in `src/time` with unit tests at known dates, including leap years and the year 0 boundary.
- The timeline runs from 1 January 70,000 BCE to the content cutoff date stored in the manifest, which is 26 December 1991, the dissolution of the Soviet Union (spec section 2.5). The end of the timeline, called "today" in this spec where it means the timeline end, always means that cutoff, never the device clock, so the same build shows the same timeline on every day.
- The app opens at 1 January 50,000 BCE on first start, and at the last saved date after that.

### 3.2 Displaying dates

| Range | English | German |
| --- | --- | --- |
| Before 10,000 BCE, playing or scrubbing | c. 50,000 BCE (rounded to 100 years) | ca. 50.000 v. Chr. |
| 10,000 BCE to 1 BCE | 3250 BCE (whole years; "c." while rate is above 50 years/min) | 3250 v. Chr. |
| 1 CE to 999 CE | 79 CE | 79 n. Chr. |
| From 1000 | 1492 | 1492 |
| When paused at or after 1500 | 14 July 1789 | 14. Juli 1789 |

Rounding applies only to display; the clock keeps the exact day. Era dates marked approximate in [eras.md](eras.md) always show "c." ("ca."). Four-digit years are written without a thousands separator in both languages; five-digit years use one ("50,000" and "50.000"). Formatting lives in `src/i18n` and is covered by unit tests for both languages.

### 3.3 Historical clock and rate curve

The historical clock holds the current date and advances it in real time by the base rate at that date times the speed multiplier. The integer date is the floor of an accumulator kept by the clock; only the integer reaches world state.

The base rate curve is defined by control points (year, years per minute). Between points, the logarithm of the rate is interpolated linearly, so the rate changes smoothly and never jumps; before the first and after the last point the rate is constant. Starting points, to be tuned by hand during the project:

| Year | 60,000 BCE | 12,000 BCE | 6000 BCE | 2000 BCE | 500 BCE | 1000 | 1500 | 1750 | 1880 | 1950 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Years per minute | 2,200 | 1,500 | 220 | 62 | 25 | 18 | 12 | 8.5 | 4 | 1.9 |

With these points the watching time per period at normal speed is within about 15 % of the targets in spec section 2.1, and the whole timeline takes about 5 hours 40 minutes. A unit test computes the watching time per period from the curve and fails when a period is more than 15 % off its target, so later tuning keeps the intended pacing.

**Watching-time axis.** The data build integrates the curve into a table that maps each date to its watching time at ×1 (in seconds since the start of the timeline) and back, sampled every 10 years with linear interpolation between samples. The timeline axis (section 7) and the content time windows (section 10.3) both use this table, so they always agree with the clock.

**Speed.** Multipliers are ×¼, ×½, ×1, ×2, ×4 and ×16, default ×1.

**Zoom slows the clock.** Zooming in automatically slows history down, so that close up, where a viewer watches a single place, changes happen at a pace that can be followed, and from orbit, where a viewer watches the whole world, history runs at full rate. A zoom factor multiplies the rate on top of the speed multiplier:

- It is 1 at camera altitudes of 1,000 km and above, and ⅛ at 10 km and below. In between, its logarithm changes linearly with the logarithm of the altitude, so the slowdown is gradual and has no steps.
- The factor follows the camera's eased altitude, so it changes smoothly during zooms and fly-tos and never makes the rate jump.
- It changes only how fast the date advances. The date itself, and so the world, does not depend on the camera; the life clock and the timeline's watching-time axis (which is drawn for ×1 and the base curve) are unaffected.
- The setting "Slow down when zoomed in" (on by default) turns it off.

The interface shows the resulting rate, including speed and zoom factor, rounded to two significant figures, for example "≈ 20 years/min" or "≈ 2,000 years/min". At the end of the timeline the clock stops and switches to *pause history*.

### 3.4 Play states

| State | Historical date | Life clock | Entered by |
| --- | --- | --- | --- |
| Playing | Advances | Runs | Play button, space when paused |
| History paused | Stands still | Runs | Pause history button, space |
| Everything frozen | Stands still | Stops | Freeze button, shift and space |

Pressing the active state's key again returns to playing. While the playhead is dragged the date follows the playhead and does not advance on its own; the life clock keeps its state. When the drag ends, the previous state resumes. Opening the settings, a bookmark list or a tooltip never changes the play state.

### 3.5 Life clock

The life clock is an integer count of milliseconds that advances in real time while not frozen, independent of the historical rate and speed. In this milestone it drives water animation and the placeholder figures of the stress scene; in milestone 2 it drives what figures do. It is not saved.

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

- The globe is a unit cube projected onto a sphere (with an equal-angle warp so tiles are similar in size), each face split into a quadtree. Every tile is a grid of 65 × 65 vertices with skirts to hide cracks between levels. Tiles are refined by screen-space error: a tile splits when its geometric error, estimated as half its vertex spacing, would exceed the error target of the current quality tier in CSS pixels (section 11.2). A tile splits only once all four children are ready to draw, so the ground never shows holes while loading.
- The data build produces one heightmap per tile down to level 6 (tiles of roughly 150 km with samples about 2.4 km apart, close to the 1.85 km of the source). A deeper level would add size without adding information. Rendered tiles go down to level 12 (samples about 40 m apart); levels below 6 are refined from their level 6 ancestor by bicubic interpolation when the tile is built, so the ground never shows staircases at the closest zoom. Normals are computed from the heights when a tile is built rather than stored.
- Heights are stored in whole metres as 16-bit integers with an offset, compressed per tile (section 10.5). The data build clamps the deep ocean floor below −1,000 m, which is never visible and saves space.
- **Simplified map** (decided by Yang on 2026-10-17). The globe shows the Earth's shapes, not all its details. The data build smooths the elevation with a Gaussian of about 25 km, smoothing land and continental shelf (above −150 m) separately from the deep sea floor so shelves and land bridges keep their depth. Narrow bays and fjords may fill in. **Polar regions** (decided by Yang on 2026-10-17) matter little for history and are simplified much more: south of 60°S and north of 80°N the elevation is smoothed with a Gaussian of about 80 km and the coast (section 5.1) with one of about 30 km, blending into the normal smoothing over the 10° of latitude towards the equator (from 50°S and from 70°N, so the Bering Strait and Beringia keep the normal detail). **Islands** (decided by Yang on 2026-10-17): tiny islands are not drawn unless history needs them. Islands under 1,000 km² are removed, except those on the keep list in `data/curated/islands.json`, each named with the reason it matters (such as Thera, Malta, Elba, Saint Helena and Delos) and a source. Every island that stays and is under 60,000 km² (such as Hawaii, Crete, Cyprus, Sicily, Jamaica, Taiwan, and the kept small islands) is drawn larger than it is, so the oversized people of later milestones have room on it: it grows outwards into the sea by 40% of its equivalent radius, at least 6 km and at most 25 km, as a low shore sloping down from its coast. Bigger islands and the continents keep their size. Island sizes are measured on today's coastline. Only a short, hand-picked list of the rivers history needs most is drawn (decided by Yang on 2026-10-17): the Nile, Euphrates, Tigris, Indus, Ganges, Yellow River, Yangtze, Mekong, Danube with its delta branches, Rhine, Volga, Mississippi, Amazon with its main branches (Madeira, Negro, Xingu and Tapajós), Congo and Niger, taken from Natural Earth by name and always shown at every zoom, and large lakes (scale rank 4 or lower, and at least 3,000 km² each, so Ladoga, Onega and Vänern stay but the many small Finnish lakes do not) are drawn. The map must stay accurate enough that every historical place sits where it belongs: on the right coast, river or island. From milestone 2 the data build checks that each event and settlement location is on land at its date (or on water for sea events) and fails if not.
- **Raised continents.** Every land vertex stands a fixed 250 m (exaggerated with the relief) above the sea level of the date, so continents and islands read as chunky slabs with a short cliff along every coast, like a toy (spec section 8). The cliff follows the coastline of the date, so it moves as the sea rises and falls. Lakes and ice keep their own heights above that.
- Elevation is exaggerated by a factor of 100 relative to the Earth's radius (decided by Yang on 2026-10-17, replacing 12), in the vertex shader, so the factor can be tuned without rebuilding data. The factor and the ice exaggeration (section 5.2) are the same so ice and rock line up. Relief is shown at every altitude, including from orbit, so mountain ranges stand out of the planet's outline.

### 4.3 Terrain painting

- The colours are saturated and warm, like painted clay: rich greens, golden steppe, orange-red deserts, warm grey-brown rock and soft white snow, with large soft patches instead of fine speckle. Until the textures below are approved, the shader paints these colours directly.
- The ground is splat-mapped from six painted tiling textures: grass, forest floor, soil and steppe, sand, rock and snow (spec section 8). Splat weights are computed in the shader from elevation, slope, latitude and a climate band.
- The climate band shifts with the date: at the height of the ice age, tundra and steppe reach far further south and deserts are wider, and both relax towards today's pattern as the ice retreats. The band is driven by the same glacial index as the ice (section 5.2), so ground and ice always agree. This is a deliberately broad approximation and is described as such in the About panel.
- **Deserts change with history** (decided by Yang on 2026-10-17). They follow the annual precipitation of Beyer, Krapp and Manica 2020 (0.5°, every 1,000 to 2,000 years from 54,000 years ago): aridity is 0 (green) at 600 mm a year or more and rises linearly to 1 (full desert) at 100 mm or less. Where the dataset has no value (the sea of its time, and south of 60°S), aridity is 0. The build evaluates it with the ice, every 1,000 years at the ice tile samples (bilinear in space, linear in time), and stores it next to the ice thickness in the same chunks. The ground turns to steppe and then sand as aridity rises.
- Lakes from Natural Earth are drawn as flat water at their surface height. Large rivers are drawn as wide, smooth bands of water with an ink outline, much wider than real rivers so they match the oversized people of later milestones (decided by Yang on 2026-10-17): the build smooths each river centreline into a curve and stores a river field per sample that is full within the river's core (about 12 km either side for the rivers Natural Earth ranks largest and 9 km for the others) and falls to zero over a further 30 km. Water is drawn where the interpolated field passes one half, so the banks are smooth curves at every zoom, and rivers keep the same width on the ground at every camera height.
- **Rivers reach the sea at every date** (decided by Yang on 2026-10-17). Natural Earth rivers end at today's coast, so the build continues each river mouth downhill across the land that the lower sea levels of the past expose, along the steepest way down the smoothed elevation and the ocean mask, until it reaches sea floor that is sea at every date (below −130 m) or a lake. Where the sea is higher, the continuation lies under water and is not seen.
- **Rivers flow** (decided by Yang on 2026-10-17). Lighter pulses travel down every river towards its mouth, like the waves on the sea. The build stores, per sample, the distance along the river in units of one pulse spacing of 150 km, measured downstream (the mouth is the end with the lower elevation). The pulses are animated by the life clock and stop when everything is frozen; the low tier shows them still.
- **Smooth lakes** (decided by Yang on 2026-10-17). Lake outlines are smoothed like the rivers: the build blurs each lake's mask with a Gaussian of about 8 km and stores the result as a field from 0 to 1 per sample, and water is drawn where the interpolated field passes one half, with an ink outline.
- The six textures are generated assets and ship only after Yang approves them (section 12).

### 4.4 Water

- The sea is drawn as part of the terrain surface: wherever the ocean mask says the sea reaches at the date's sea level (section 5.1), the vertex shader lifts the surface to the sea level and the fragment shader draws water, with the water depth carried per vertex so the coastline stays crisp between vertices. The sea has one colour at every depth, with no lighter shallows along the coasts (decided by Yang on 2026-10-17). Lakes and rivers use a slightly lighter blue.
- The sea is a bright, saturated blue that looks like glossy plastic, with a lighter sheen towards the globe's edge but no reflection of the light.
- **Waves and texture** (decided by Yang on 2026-10-17). The open sea carries a stylised cartoon pattern rather than a flat colour: soft lighter ripple bands of long wavelength (several times the spacing of the first version, decided by Yang on 2026-10-17) that drift slowly, small white wave crests scattered over the water that appear and fade, and a gentle swell in the shading. The pattern lives in world space so it stays put as the camera moves, and its scale adapts to the distance so it reads from orbit and close up. It does not mark depth, so there are still no lighter shallows. The large lakes and inland seas, such as the Black Sea and the Caspian, carry the same waves (decided by Yang on 2026-10-17); since only lakes of at least 3,000 km² are drawn, every drawn lake has them. Rivers stay without waves.
- The waves are animated by the life clock. Animation stops when everything is frozen.
- The low tier keeps the static pattern but drops the animation.

### 4.5 Sky and horizon

- There is no atmosphere glow around the globe, no haze over distant terrain and no stars (decided by Yang on 2026-10-17). From orbit the globe sits on a soft pastel background, warm peach at the bottom of the screen fading to pale lilac and sky blue at the top, like a studio backdrop.
- **Clouds.** About 30 big puffy cartoon clouds, each a cluster of soft white balls, float a little above the ground and drift slowly around the globe on the life clock (still when everything is frozen). Their places come from a seeded hash, so they are the same for every viewer. They carry no weather meaning. They fade out as the camera comes down through them, so they never block a low view, and are drawn in one batch.
- Close to the ground the sky behind the horizon fades from blue at the zenith to a paler blue at the horizon, so a low view does not look like space.
- The curved horizon comes naturally from the sphere: as the camera comes down it tilts towards the horizon (section 6), giving the look of Populous: The Beginning.

## 5. The planet over time

Everything in this section is a pure function of the date, computed from data, so scrubbing to any date shows the coastline and ice for that date at once.

Sea level, ice and deserts come from published reconstructions (decided by Yang on 2026-10-17, replacing the hand-made models of the first drafts): ice thickness and sea level from PaleoMIST 1.0, and precipitation from Beyer, Krapp and Manica 2020 (section 4.1). Both are read from the small extracts under `data/sources/`. The main periods they show:

| Period (approximate) | Ice | Sea level |
| --- | --- | --- |
| 50,000 to 29,000 BCE | Mid-sized ice sheets (a milder phase of the last ice age) | About −50 to −90 m |
| 24,000 to 17,000 BCE | Last Glacial Maximum: ice at its largest | About −120 m |
| 17,000 to 9700 BCE | Fast melting; the ice age ends about 9700 BCE | Rising to about −50 m |
| 9700 to 5000 BCE | Scandinavian and North American ice gone | Rising to roughly today's level |

### 5.1 Sea level and coastlines

- **Sea-level curve.** Global mean sea level relative to today: for every PaleoMIST time step (every 2,500 years), the build averages the relative sea level over today's ocean, weighted by area, and interpolates smoothly (monotone cubic) between the steps so the sea never rises in visible jumps. It is stored every 100 years in the startup index (section 10.2) with its source.
- **Ocean mask.** A coastline cannot simply be "everywhere below sea level", because inland basins such as the Caspian Sea and the Dead Sea lie below today's sea level but are not part of the ocean. The data build therefore computes, for every terrain sample, the lowest sea level at which that sample is connected to the open ocean (a priority flood fill outward from the deep ocean, seeded from sea floor deeper than 3,000 m, in 1 m steps from −130 m to +10 m, on the 4 arc-minute elevation grid). The flood runs on the elevation before smoothing (section 4.2), so straits and sills keep their true depth. Straits that are narrower than the grid, or that the smoothing of the coast (below) would close, are listed in `data/curated/straits.json` (such as Gibraltar, the Bosporus, the Dardanelles, Bab-el-Mandeb, Hormuz, the Øresund and the Great Belt, Kerch and Messina), each as a line with its sill depth and a source; the build carves each line to its sill depth before the flood and draws it at least 12 km wide, so a strait is open exactly when the sea level is above its sill. The Black Sea, the Caspian Sea and the Baltic Sea are flooded as permanent lakes at fixed levels (0 m, −28 m and 0 m) within their own basins (a bounding box per sea in the data build, so the flood cannot leak through a strait into the ocean), so a sea that the falling ocean cuts off is drawn as a lake, never as dry land (decided by Yang on 2026-10-17). Where the ocean reaches such a basin, the sea and the lake are drawn the same.
- **Smooth coasts** (decided by Yang on 2026-10-17). Coasts are smoothed like the rivers: after the flood, the build blurs the connection level with a Gaussian of about 8 km (treating land that never joins the ocean as +40 m), takes the minimum with the carved straits, and stores the result. A sample is sea when this smoothed value is at or below the date's sea level, whatever its height, and the water depth used to draw the coastline between vertices is the difference between the two. Coastlines are therefore smooth curves at every sea level, and features smaller than about 10 km, such as tiny islets and narrow inlets, disappear. Natural Earth lakes are flat water at the 20th percentile of the heights along their shore. The value is stored as an extra channel of each terrain tile.
- **Known simplifications**, named in the About panel: the land surface is today's, so the sinking of land under the ice sheets and its later rebound are not shown; past lakes that no longer exist (such as the glacial Lake Agassiz) and the Black Sea before it joined the Mediterranean are not shown in this milestone.
- **Teaching moments the data must show** (exit criterion 1): Beringia joining Siberia and Alaska, Doggerland joining Britain to the continent, and Sundaland joining Sumatra, Java and Borneo to mainland Asia, each opening as the sea falls and drowning as it rises again. Sahul (Australia joined to New Guinea) shows too.

### 5.2 Ice sheets

- **Data.** Ice thickness comes from the grounded ice thickness of PaleoMIST 1.0 (0.25°, every 2,500 years from 52,500 years ago to today). The data build interpolates it in space (bilinear) and in time (linear) every 1,000 years at the samples of the ice tiles at level 3 (tiles of roughly 1,100 km, 33 × 33 samples about 35 km apart) and stores them as chunks keyed by tile and time window (section 10.3). Between steps, thickness is interpolated linearly by date.
- The land surface stays today's: the sinking of the land under the ice is not shown, so ice is drawn on today's bedrock.
- **Glacial index.** The ratio of the date's sea level to the lowest sea level of the curve, from 0 (today) to 1 (glacial maximum), drives the climate band in section 4.3.
- The ice border is drawn where the interpolated thickness reaches 60 m, so it is a smooth curve with a smooth ink outline rather than following the vertex grid (decided by Yang on 2026-10-17).
- Today's coastlines get no ink where ice covers them, so buried coasts do not show through the ice sheets. Snow lies only on mountains, never below 1,500 m, so lowland snow never suggests ice the data does not show.
- Ice is drawn as a raised, glossy white surface with soft blue shading, like icing on a cake, with the same elevation exaggeration as the land, cracked blue edges where it meets the sea, and a soft edge where it ends on land. The Laurentide and Fennoscandian ice sheets must read clearly from orbit at 20,000 BCE and be gone by about 5000 BCE, apart from Greenland and Antarctica, which stay.

## 6. Camera

### 6.1 Range and behaviour

- The camera orbits a target point on the globe. Its distance ranges from about three Earth radii (the whole planet with room around it) down to about 2 km above the terrain under the target.
- Tilt follows altitude by default: looking straight down from orbit, tilting towards the horizon as the camera comes down, so close to the ground the view is a low angle across the land with the curved horizon visible. The viewer can tilt to any angle between straight down and nearly level (85°) at every altitude, with the controls below or two tilt buttons under the compass (decided by Yang on 2026-10-17).
- The camera never goes below the terrain or ice surface and slides up over mountains as it moves.
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

- The timeline is a strip along the bottom of the screen, drawn on a canvas, with HTML controls beside it. It has a date readout, the playhead, a lane "World" and one lane per region in the order of spec section 7.1.
- Lanes show the era ranges from [eras.md](eras.md). The World lane uses a fixed colour per era; regional ranges use the colour assigned to that polity in `data/curated/eras` (later shared with the border overlay). Overlapping ranges in one lane stack into sub-rows.
- A range's label is drawn inside it when it fits, otherwise it is shortened with an ellipsis and shown in full on hover or tap, together with its dates. German labels are about a third longer, so layout never assumes English widths.
- **Collapsed (the default on every device):** the timeline shows only the lane of the region the globe is centred on, which changes as the viewer moves the globe (decided by Yang on 2026-10-17). The region comes from a coarse region lookup table built by the data build. A button expands the timeline to the World lane and all regional lanes, taking at most about a third of the window height on desktop and two thirds on phones, and collapses it again. The choice is saved with the settings.

### 7.2 Axis and zoom

- The default axis is the watching-time axis (section 3.3): each period is as wide as its watching time at ×1. The toggle "True time scale" switches to a linear axis in years, where all of written history is a thin sliver at the right end. The switch animates over about half a second and keeps the playhead in place.
- The timeline zooms from the whole of history down to about a single year across its width: scroll wheel or pinch over the timeline, plus zoom buttons. Tick labels adapt to the zoom (10,000 years, 1,000 years, 100 years, 10 years, 1 year) and are formatted per language.
- By default the visible window follows the playhead while playing; dragging the timeline background pans it and stops following until the play button or a "follow" button is pressed.

### 7.3 Scrubbing

- Dragging the playhead, or pressing on the timeline and dragging, scrubs the date. The globe updates live: sea level, ice and climate band follow the playhead every frame at 60 fps on desktop (section 11). If ice chunks for the new time window have not arrived, the previous ice stays visible until they do (section 10.7).
- Clicking a point on the timeline jumps there. Tapping an era range shows its name and dates; it does not jump.
- Keyboard: Home and End jump to the start and end; with focus on the timeline, left and right arrows step by one tick of the current zoom.

### 7.4 Era data

`data/curated/eras` holds the ranges of [eras.md](eras.md) as records in the format of [content-format.md](content-format.md): id, lane, `when` (converted to whole days, with approximate flags per end), colour, a source, and a title in `en` and `de`. The data build validates them like all content (section 10.8) and writes them into the startup index. Events are not shown on the timeline in this milestone.

## 8. Interface shell

### 8.1 Screen layout

- The globe fills the screen. Text on buttons, the speed selector, the date ribbon and the timeline cannot be selected, so clicking and dragging never highlights it (decided by Yang on 2026-10-17); text in the About panel and in cards can be selected. The timeline runs along the bottom. Above its left end sit the play controls: play, pause history, freeze everything, the speed selector and the rate readout. The top-right corner holds three buttons: bookmarks, settings and About.
- The date readout is large and clear above the timeline's playhead area, in the format of section 3.2.
- All controls are at least 44 by 44 CSS pixels on touch devices, have visible focus outlines, and have accessible names in the current language.

### 8.2 Settings

| Setting | Values | Default |
| --- | --- | --- |
| Language | English, Deutsch | Browser language if German, otherwise English |
| Quality | Automatic, High, Medium, Low | Automatic (section 11.2) |
| True time scale | On, Off | Off |
| Slow down when zoomed in | On, Off | On (section 3.3) |
| Show performance stats | On, Off | Off |

The language names in the selector are always written in their own language. Changes apply immediately and are saved (section 9).

### 8.3 Bookmarks

A bookmark stores a date and a camera position under a name the viewer types, defaulting to the formatted date. The bookmarks panel lists them, newest first; tapping one flies to it (section 6.3) and sets the date while keeping the play state. Bookmarks can be renamed and deleted. The app ships with no preset bookmarks in this milestone.

### 8.4 Localisation

- Every UI string lives in `app/messages/en.json` and `app/messages/de.json` under the same keys. Messages use ICU-style placeholders and plural forms, resolved with `Intl.PluralRules`. A small in-house formatter is used instead of a library, to keep the bundle small; it covers placeholders and plural forms only.
- `npm run check` fails when a key exists in one language and not the other, when a message is empty, or when a component contains a string literal that is shown to the viewer. Textures and generated images carry no text.
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
| `miniworld.view.v1` | Last date (day integer), camera target, distance, tilt and heading, play state and speed | At most once every 2 seconds, and when the page is hidden |
| `miniworld.bookmarks.v1` | Up to 200 bookmarks: id, name, date, camera | On change |
| `miniworld.perf.v1` | Result of the first-start benchmark (section 11.2) and the device it was measured on | After the benchmark |

On start, the saved date and camera are restored; a saved play state of *playing* is restored as *history paused*, so the world does not run on while nobody is watching. Saved state never affects what the world looks like at a given date: it only chooses which date and view to show.

## 10. Content pipeline

This milestone builds the full delivery path of spec section 10 even though there is little content yet, so later milestones only add layers.

### 10.1 Manifest

`manifest.json` is the only file fetched without a content hash in its name. It holds the build version, the content cutoff date, the supported languages, the quadtree and time-window definitions, and for every layer the chunk keys with their file names for quadtree levels 0 and 1 plus, for deeper levels, one hashed part file per level 2 tile that lists the chunks below it. Part files are fetched when the camera first needs a tile under them, which keeps the manifest small. Tiles that are entirely deep ocean have no terrain file and are listed as deep. It is fetched network-first on every start and falls back to the cached copy when offline.

### 10.2 Startup index

One light index per language, fetched with the manifest: the era records with their labels in that language, the watching-time table, the sea-level curve, the region lookup table for the phone timeline, and the source and licence list for the About panel. Layers that do not exist yet (events, famous people) are present as empty lists, so the format does not change when they arrive. Budget: at most 150 KB compressed per language.

### 10.3 Chunk keys

- **Place:** a cube face and quadtree path, for example `2/0313`, at a level chosen per layer: terrain at every level up to 6, ice at level 3.
- **Time:** windows of equal watching time, 10 minutes at ×1 each (35 windows over the whole timeline, roughly 20,000 years each in the deep past and about 20 years each in the 20th century). Window boundaries come from the watching-time table and are listed in the manifest. Layers that do not change with time, such as terrain, use the single window `all`.
- **Language:** `xx` for layers without text, otherwise `en` or `de`.

A chunk's file name is `{layer}/{place}/{window}/{language}.{hash}.{ext}`, where the hash is the first 16 hex characters of the SHA-256 of the file's content.

In this milestone the shipped layers are `terrain` (place only) and `ice` (place and time). Per-language chunks are proven by a test layer that exists only in the test fixtures: the pipeline tests build it, load it in a browser test in both languages and check that only the active language's chunks are fetched.

### 10.4 Loading and prefetching

- The loader requests chunks for the tiles in view and their neighbours, and the ice chunks for the current time window and the next one in the direction of playback. At high rates it looks further ahead, so the next window is ready before the playhead reaches it.
- While scrubbing it fetches only chunks for the window under the playhead once the playhead has rested there for 200 ms, so a fast drag across history does not queue hundreds of requests.
- At most six requests run at once; requests for tiles that left the view are cancelled.

### 10.5 Formats

- Terrain tiles: 16-bit heights (with a one-sample border for smooth normals and interpolation), then one byte per sample each for the smoothed ocean-connection level (section 5.1), the smooth lake field, the smooth river field, and the river flow phase as its cosine and sine (section 4.3), packed into one binary file per tile, compressed with Brotli for transfer.
- Ice chunks: 16-bit thickness grids per tile and time slice, in one binary file per tile and window.
- Index and manifest: Brotli-compressed JSON.
- Terrain textures: KTX2 with Basis Universal compression, so phones get GPU-compressed textures.

### 10.6 Size budget for the first view

The first view of the globe at 50,000 BCE on a phone must need at most about 3 MB transferred (exit criterion 3). Proposed split:

| Part | Budget (compressed) |
| --- | --- |
| JavaScript and CSS | 500 KB |
| Manifest and one language's index | 200 KB |
| Terrain tiles for the first view | 1.5 MB |
| Ice chunks for the first view | 200 KB |
| Terrain textures (low tier) | 500 KB |

`npm run build` fails when JavaScript and CSS exceed their budget. A browser test loads the first view at a phone size and quality tier with an empty cache and fails when the total transfer exceeds 3 MB.

### 10.7 Determinism while loading

Sea level, ocean mask thresholds, ice thickness and the climate band at a date are fully determined by the data. When a tile or ice chunk has not arrived, the renderer shows the coarser parent tile, or keeps the previous ice, until it does; this is a drawing fallback only, never a change to the computed values. Golden tests (section 13) compute these values directly from the data and never depend on what has loaded.

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

### 11.2 Quality tiers

| | High | Medium | Low |
| --- | --- | --- | --- |
| Render scale cap | Device pixel ratio up to 2 | Up to 1.5 | Up to 1 |
| Terrain error target | 1.5 px | 2.5 px | 4 px |
| Terrain texture resolution | Full | Half | Quarter |
| Water | Animated wave pattern | Animated wave pattern | Static wave pattern |
| Anti-aliasing | MSAA 4× | FXAA | None |
| Animated figures (stress scene) | 5,000 | 3,000 | 1,500 |

On first start, after the first view has loaded, the app renders the stress scene off-screen for about 3 seconds behind the loading screen and picks the highest tier whose frame time fits the device's budget. The result is saved (section 9) and re-measured only when the device or browser changes, or from the settings. Choosing a tier in the settings overrides the automatic choice.

### 11.3 Dynamic resolution

The renderer tracks an average of recent frame times. When it rises above the target (16.7 ms on desktop, 33 ms on phones) for half a second, the render scale drops by a step of 10 %, down to half of the tier's cap; when frame time stays well below the target for 3 seconds, it rises a step again. The interface is drawn at full resolution regardless.

### 11.4 Stress scene

The stress scene proves the figure-heavy targets before any content exists and stays in the test suite as a performance check.

- Opened with `?scene=stress` in the URL; not reachable from the interface.
- A fixed camera path over the Nile delta at close zoom, then out to orbit and back down, about 60 seconds long, with the date fixed at 1 CE and the life clock running.
- 20,000 placeholder figures over an area of about 30 × 30 km, of which up to the tier's animated-figure limit are drawn as animated figures near the camera and the rest as simple coloured marks. 1,000 placeholder buildings of about 2,000 triangles each.
- Placeholder figures are a simple humanoid of about 700 triangles on one shared skeleton, with three baked animations (walk, work, idle) played from an animation texture on the GPU, drawn with instancing: the technique real figures will use in milestone 2. They are coloured by a hash of their index, and their positions and animations come from a seeded hash of index and life-clock slot, never from `Math.random`.
- The placeholders are generated in code as plain shapes, not shipped assets, so they need no approval; they never appear outside the stress scene.
- A stats overlay (also available in the normal app from the settings) shows frame time with its average and 99th percentile, draw calls, triangles, render scale and tier.
- `npm run perf` runs the camera path in Chromium and writes a report: average fps, 99th percentile frame time, maximum draw calls and triangles per frame. On a reference device the same report is produced from a button in the overlay, so results can be recorded from a real phone. CI runs the scene headless and fails only when draw calls or triangles exceed the budget, since its frame times mean nothing.

## 12. Assets in this milestone

The only shipped assets are the six terrain textures, the water normal map and the ice texture. The interface icons are simple shapes drawn in code (SVG), and the interface uses the system font, so neither needs an approval or a licence entry. Each is generated and listed in `data/assets/manifest.json` with: id, file, kind, how it was generated, status (`generated`, `approved`, `rejected`), the date it was reviewed and a note. Until Yang approves an asset, the app uses a flat-coloured stand-in of the same size in development, and the production build fails if an unapproved asset is referenced. A dedicated font chosen for young readers may replace the system font in a later milestone; it would then be listed with the data sources.

## 13. Tests

| Test | Checks |
| --- | --- |
| Date unit tests | Day-number conversion, year 0, leap years, formatting in both languages |
| Rate curve test | Watching time per period within 15 % of target (section 3.3); round trip date to watching time and back |
| Clock tests | Play states, speeds, zoom factor at and between its limits, end of timeline, scrubbing, life clock stops only when frozen |
| Golden tests | For a fixed list of dates (50,000 BCE, 20,000 BCE, 12,000 BCE, 8000 BCE, 6200 BCE, 3000 BCE, today) and places (Bering Strait, North Sea, Java Sea, Torres Strait, Hudson Bay, Baltic, Caspian Sea): sea level, whether each place is sea or land, ice thickness, glacial index. Stored results must match exactly; changes must be intended and reviewed |
| Localisation tests | Same keys in both message files, no empty messages, no viewer-facing literals in components |
| Data validation | Section 10.8 on the fixture dataset in CI and the full dataset locally |
| Pipeline tests | Chunk keys, hashing, manifest, the test layer in both languages |
| Browser tests | Desktop and phone sizes: first view loads within the size budget; timeline scrubbing changes the date and coastline; language switch changes every string without reload; settings and bookmarks survive a reload; camera controls with mouse, touch emulation and keyboard |
| Performance check | Stress scene draw calls and triangles (section 11.4) |

The golden places must show the expected answers as well as matching the stored results: the North Sea between Britain and the continent is land at 12,000 BCE and sea at 3000 BCE; the Bering Strait is land at 20,000 BCE and sea today; the Caspian Sea is never ocean; Hudson Bay is under ice at 20,000 BCE.

## 14. Exit criteria and how they are checked

| Criterion (from [milestones.md](milestones.md)) | Checked by |
| --- | --- |
| Scrubbing from 50,000 BCE to today shows Beringia, Doggerland and Sundaland drowning and the ice sheets retreating | Golden tests for the places involved; a browser test that captures screenshots at the golden dates for review; Yang watches a scrub on desktop and phone |
| The stress scene meets the performance budget on both reference devices | Performance reports from the reference laptop and phone, attached to the pull request that closes the milestone |
| The first view loads with at most about 3 MB on a phone | Browser test with an empty cache at phone size (section 10.6) |
| Switching language changes every visible string without a reload | Browser test comparing all visible text before and after switching; review of the app in both languages |

The definition of done in [milestones.md](milestones.md#definition-of-done-every-milestone) applies as well.

## 15. Out of scope

Figures other than the stress-scene placeholders, the world query in the Web Worker, settlements, events and event markers on the timeline, borders and place names, info cards, regional vegetation such as the Green Sahara, sinking and rebound of land under the ice, vanished lakes, and offline use beyond what the service worker cache gives for free.

## 16. Decisions

Decided by Yang on 2026-10-17: the reference devices (section 11.1), 100× elevation exaggeration (section 4.2, first 12×), a rough ice-age model instead of reconstruction data (section 5), no day and night, atmosphere or shallow-water colours (sections 3.6, 4.4 and 4.5), free tilt down to nearly level (section 6.1), the toy-planet look with clouds and raised continents (sections 3.6, 4.2 to 4.5 and 5.2), the timeline collapsed to the region under the globe by default (section 7.1), the timeline ending at the dissolution of the Soviet Union on 26 December 1991 (section 3.1), the toolchain (section 2.1), zooming in slowing the clock (section 3.3), and keeping only freely and commercially usable source data, with copies in the repository (sections 2.2 and 4.1).
