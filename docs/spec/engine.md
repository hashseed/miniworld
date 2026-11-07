# Engine and packs

Miniworld is one engine that serves **packs**: sets of content with their own spec, data and look. Two packs exist, `history` ([spec.md](spec.md) and the files it links) and `geo-history` ([geo-history.md](geo-history.md)). This file is the spec of the engine and of the boundary between engine and packs. Decided by Yang on 2026-11-07: one engine and two sets of content, the history lens supported by the engine but not used by geo-history, and the pack chosen when the app is built.

## 1. The split

| Part       | Holds                                                                                                                                                                                                                                  | Rule                                                                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engine** | the clock and its mechanics, the camera, the globe renderer and its surface interface, the timeline widget, the controls, localisation, storage, the lens, the loader, the data-build framework, the quality and performance machinery | knows nothing of any pack                                                                                                                                                                           |
| **Pack**   | a spec, data, curated records, data-build stages, world code, models and textures, UI panels, golden tests, strings, and the choices of section 2                                                                                      | registers itself with the engine; imports the engine, never another pack; owns everything that says what a date is, what is on the globe and what text to show |

A test (`tests/unit/boundary.test.ts`, in `npm run check`) keeps the engine from importing a pack and a pack from importing another, like the lint rule that keeps the world from importing the renderer ([architecture.md](architecture.md#1-layers)). Imports the engine still has on the history pack when the split is made are listed in `tests/unit/boundary-debt.json`; the test fails on any new one and on any entry no longer needed, so the list only shrinks (section 4). Each pack has its own storage key prefix.

## 2. What a pack provides

A pack is an object the build hands to the engine:

- its **time axis**: the range, the function from watching time to the date, the unit of the date, the date formatting and the speed modes;
- its **surface**: how the globe is drawn, behind one engine interface (history: the elevation tile quadtree; geo-history: plate meshes);
- its **lens**: history builds and uses the fixed warp of [history-lens.md](history-lens.md); a pack that sets the lens to none gets true proportions, and the engine skips building and applying the warp;
- its **timeline content**: lanes, bands and moments, from its own records;
- its **panels, overlays and cards**, and its **strings** in English and German;
- its **world**: a pure function of the clock, as in spec section 9;
- its **data**: records, tables and sources under `data/packs/<pack>/`, with its own manifest and startup index.

The engine owns the timeline widget, the controls, the loop and the loader.

## 3. The pack is chosen at build time

There is no switch in the running app. One build holds one pack.

- The build takes the pack from the environment variable `PACK` (`history` when it is not set), and the app's entry (`app/src/main.ts`) imports the pack's `index.ts` through the build-time alias `@pack`, so the other pack's code, models and data are not in the bundle. An unknown pack is an error. The scripts are `npm run dev`, `build`, `preview` and `build-data` for history and `dev:geo-history`, `build:geo-history`, `preview:geo-history` and `build-data:geo-history` for geo-history.
- Each pack has its own output folders, so builds of different packs never overwrite each other (an easy mistake to make today: the build rewrites `app/public/data`). History, the first pack, keeps the folders its deploy already uses: `dist/` and `app/public/data/`. Other packs use `dist-<pack>/` and their own public folder `app/packs/<pack>/public/` (with its `data/` folder), which holds the favicons and the like it needs; the data build writes it and git ignores it. The data sources a pack uses carry `pack: "<id>"` in `data/sources.json`; a source without one belongs to history, so the history About panel lists only its own.
- History serves on port 8800 and geo-history on port 8801, so both can run side by side in the devenv.
- Language, quality and other engine settings are stored under the pack's own prefix, so the two apps share nothing at run time.
- Both packs may be deployed side by side, such as at `/` and `/geo-history/`. A link from one app to the other is a plain URL set at deploy time (an environment variable), shown in the About panel and not built in; without it, no link is shown.

## 4. Getting history behind the boundary

Today history's code is mixed with the engine: `world/`, `tree/` and `wildlife/` are history content, and the globe renderer is tied to the elevation tile quadtree. The split is made first, in small pull requests, each judged by the golden, on-land and browser tests, which must pass unchanged:

1. Name the boundary: move the history-only code under `app/src/packs/history/` and the engine under `app/src/engine/`, with the lint rule, no behaviour change.
2. Put the time axis, the lens and the terrain source behind the pack interface of section 2, history being the only implementation.
3. Add the build-time pack choice of section 3, with history the default, and a second pack that proves the boundary. Done on 2026-11-07: steps 1 and 3 and the first half of step 2 (the entry and the pack interface `Pack` in `app/src/engine/pack.ts`). The rest of step 2, putting the time axis, the lens and the terrain source behind the interface, is not done: the 14 imports in `tests/unit/boundary-debt.json` (the globe and the content loader on the history pack's planet queries and tables) are what it has left, and each one removed is a pull request of its own, judged by the golden tests.
4. Split the data build the same way: `data/build/` keeps the framework; each pack has `stages/`, `curated/` and `sources/` under `data/packs/<pack>/`.

## 5. Where the engine's rules live now

[spec.md](spec.md) was written for history alone, and it mixes the history pack's content with engine rules. Until they are moved here, in follow-up pull requests, these sections of it apply to the engine and so to every pack, unless a pack's spec says otherwise:

| spec.md section                                                                      | Rules that belong to the engine                                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 2.2 and 2.3 (speed and pausing, one clock)                                           | the clock in milliseconds, the speed modes, determinism                                                      |
| 3 (the globe), camera range                                                          | the camera from orbit to the ground, the curved horizon                                                      |
| 7 (interface), 7.4 to 7.6                                                            | the timeline widget, localisation, desktop and phone, what is saved                                          |
| 8 (visual style)                                                                     | the quality level and the dynamic resolution                                                                 |
| 9 (architecture), 10 (content delivery), 11 (development environment), 13 (licences) | the pipeline, the performance budget, streaming and caching, the devenv, the licence policy                  |

Everything else in spec.md, and the milestones, eras, events, people and the rest of the files in the history rows of [README.md](README.md), are the history pack's.

## 6. Tests

- The lint rule of section 1 runs in `npm run check`.
- CI builds every pack (`PACK=history` and `PACK=geo-history`) and runs each pack's tests; the history golden, on-land and browser tests pass unchanged through the whole refactor.
- A test builds one pack and checks that none of the other pack's code or data is in its output.
