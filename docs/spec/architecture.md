# Architecture: content and engine, and the open work

How the code is organised so that history is data and the engine only knows kinds of things, and what is still to do to get there everywhere. Spec section 9 states the principles; this file says how the code follows them now (October 2026) and lists the open work in the order it should be done. Each item is done spec first, like everything else.

## 1. Layers

The world on screen is a pure function of the clock and the built data (spec section 9). Three layers, each looking only at the one below it:

| Layer | Where | What it holds |
| --- | --- | --- |
| Content | `data/curated/`, `data/schema/`, `data/sources/`, `data/assets/manifest.json` | Records (Markdown with `en` and `de` text: eras, animal cards, site and event cards), tables (JSON: culture profiles, wildlife groups and model traits, the farming spread, geography corrections, the tree of humankind's inputs), vocabularies, the bibliography, the source extracts and the asset manifest. Every table and the manifest have a Zod schema in `data/schema/`, which the build and the app take their types from ([content-format.md](content-format.md#11-tables) section 1.1). |
| Data build | `data/build/` | Validates all content before anything else runs (schemas, both languages, sources, references between records and tables, every asset a table names), computes what is expensive offline (terrain, climate, foliage, the farming spread, the tree of humankind) and writes content-hashed chunks and the light startup index ([milestone-1.md](milestone-1.md#10-content-pipeline) section 10). |
| Engine | `app/src/` | The **world** (`world/`, with `core/`, `time/`, `geo/`, `planet/`): pure, deterministic code that turns data and the clock into poses; `treeScene()` composes the parts in `world/scene/` ([humankind.md](humankind.md#8-performance) section 8). The **renderer and interface** (`globe/`, `tree/`, `wildlife/`, `timeline/`, `ui/`): draw what the world returns and never feed back into it. A lint rule keeps the world from importing the renderer, the models, the interface, the loader or the wall clock ([milestone-2.md](milestone-2.md#23-determinism-rules) section 2.3). |

Models are generated code in `assets/src/`, reviewed by Yang and listed in the manifest; the app draws only approved ones, and stand-ins for the rest.

## 2. The line between content and engine

- **Data says what exists, where and when, and how one culture or species differs from the next**: a culture's lodging, houses, tools, role mix, herd, crops, prey and area (`cultures.json`); whether an animal walks, flies or swims, how far it roams and how large it is drawn (`models` in `wildlife.json`); event titles, dates, places and card texts.
- **Code says how a kind of thing behaves**: how a camp lives, a hunt goes, a village works its fields, a scene at an anchor is staged, an animal walks or a dolphin leaps. A new kind of behaviour is a new part in `world/scene/` (or a module of its own), registered by its kind; a new instance of an existing kind is data only.
- **Tests guard the line.** Schemas fail the build on malformed content; the data build fails on references that point nowhere; `world/sceneParity.test.ts` checks that a scene does not depend on loading or memo state; the golden and on-land tests check the world against the built data, and CI's `release` job builds from the real data as the preview site does.

## 3. Open work

In the order to do it. Items marked with the milestone they belong to should be built with that milestone's first content, so the format is proven on real records.

### 3.1 Events as records (milestone 3)

[content-format.md](content-format.md) specifies events completely; none of it is built yet. Today's events (first arrivals on a continent, scenes at anchors, first farming) are put together by the data build from `arrivals.json`, `anchors.json` and `neolithic.json`, with their cards as `event-card` records under `site-cards/`.

1. The record kind `event` under `data/curated/events/` with its schema: the envelope of section 2, `type` from a new `vocab/event-types.yaml`, `when` with `peak` and `phases` (the date grammar of section 3 is built), `where` with `place`, `point`, `area` or `path` and the computed `anchor` with its 25 km check against the spec lists (section 4).
2. `effects` (section 6) with `vocab/effect-types.yaml` and one shared system per effect type in the world; presenters per event type in `app/src/world/presenters/` (section 7), registered by type id.
3. The existing synthesised events move onto records, with their dates and places checked against the tables they come from, so nothing is kept in two places.
4. The spec list check of section 9 for events and the generated `CHRONOLOGY.md`, `INDEX.md` and coverage report of section 8.

### 3.2 Tables that hold viewer content become records

The anchors, arrivals and thresholds carry titles and dates the viewer reads; they become records of their kinds (places, events) as 3.1 and the place records arrive. Table rows name their sources as free-text citations; they move to references into `sources.yaml`, table by table, so every source is in the bibliography (content-format section 1.1).

### 3.3 Streaming by place, and models per culture (spec section 10)

- **Tree chunks by place.** The tree's chunks are split by time only and the app culls the figures out of view after loading a whole window (humankind.md section 8). As the tree grows with the Neolithic and later milestones, each window's chunk grows with the whole world's population. Chunks are to be keyed by quadtree tile as well, at a level chosen so a chunk holds a few hundred camps, with the figures walking between tiles in both. The world query must stay the same whether or not a neighbouring tile has arrived (milestone-2 section 2.3). Decided on 2026-10-25 after measuring the real build: not yet. A minute's file is at most 26 KB Brotli, so splitting it would only add requests and the risk of figures showing up tile by tile; the data build fails when a minute's file passes 100 KB, and the split is made then, as humankind.md section 8 describes.
- **Models per culture.** Every model is compiled into the app's JavaScript today, so each new culture makes the first download larger, against the 3 MB first view of spec section 10. Models are to be bundled per culture profile and loaded when that culture is near the camera and the current time window, drawn as stand-ins until they arrive. Done on 2026-10-25 as spec section 10 describes (**Models per culture**): the Neolithic houses, tools and village props and the crops load with the cultures that name them; the people, the hunter-gatherer camps and the animals stay in the first download. This took 6 KB Brotli out of the first download (292 KB of JavaScript and CSS to 286 KB) into 11 KB of modules loaded later. The first view at the reference phone size, measured in a headless browser, is about 4.5 MB, of which 3.1 MB is terrain and 0.8 MB climate: that is where the 3 MB target of spec section 10 is still missed, not the models.
- **Bundled tables.** `wildlife.json`, `cultures.json` and the asset manifest are bundled into the app whole. They are small now; when they grow, they move into the startup index (what the first view needs) and chunks (the rest). Done on 2026-10-25: all three are in the startup index (milestone-1 section 10.2), the manifest cut to the ids, statuses and module files the app uses; the world reads the tables through `world/tables.ts`, filled by the app from the index, by the scene worker from a message and by the data build and tests from `data/curated/`. Nothing in them needs splitting into chunks yet.
- **Chunk size.** Done: the data build fails when a file's Brotli copy exceeds 1 MB and logs the five largest (milestone-1 section 10.8).

These change the data build, the loader and the renderer together, and are judged by the real build in a browser (download sizes, prefetching while playing and scrubbing, frame time on the reference phone), so they are done in the devenv against the real data, with Yang looking at the result.

### 3.4 Engine clean-ups

- **The scene's composer.** `treeScene()` still works out the per-call lookups itself (about 940 lines); they can move into `world/scene/` the same way the parts did.
- **Shared drawing helpers.** The tree, wildlife, crop and ground layers each place things on the drawn ground, choose levels of detail and keep caches their own way (`northEast` frames, slope sampling, pixel thresholds, "clear when larger than N" caches). One placement helper, one level-of-detail rule and one cache type replace them.
- **Wildlife and the renderer.** The wildlife world places animals by their drawn body length, which the app measures from the built models (`reach` in `wildlifeLayer.ts`), so the world depends on model geometry. The drawn sizes are to be recorded with the approved models (the manifest's geometry hash already changes with them) and read as data.
- **The farming grid in the app.** The app loads the farming grid and passes it to the scene worker, but the scene reads only the static culture table; the grid's runtime wiring (`setTreeFarming`, the worker's `farming` message) is to be removed or put to use.
- **Scene props.** The data build checks each anchor's scene prop against a list in code (`SCENE_PROPS` in `stages/humankind.ts`); the list moves into the anchors table's schema or the asset manifest.

### 3.5 Asset pipeline

Textures are listed in the manifest without a content hash, so a changed image keeps its approval; they get one like the models' geometry hash. `npm run approve-assets` cannot set `rejected`, and the model card of milestone-2 section 13.4 leaves no file in the repository; both are added.

### 3.6 Deploy

The hub repository `hashseed/hashseed-pages` builds the preview site from the `preview` branch when its deploy is started by hand; its hourly run, which should redeploy when a source moves, fails before it builds, so a push to `preview` does not reach the site on its own.
