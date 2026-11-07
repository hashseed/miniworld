# Geo-history: the planet from 1 billion years ago

Miniworld gets a second mode, **geo-history**: a passive globe that shows how the continents moved over the last 1 billion years, from the supercontinent Rodinia through Gondwana and Pangaea to today's map. Plates, continents and plate boundaries only; no life and no people yet. The current mode, now called **history**, is not changed.

This file is the spec of the geo-history pack (section 2) and of the engine changes it needs. Decided by Yang on 2026-11-07: one engine and two sets of content, the history lens supported by the engine but not used by geo-history, plates and continents only in version 1, and a range of 1 Ga because no scientific plate model reaches further back with continuous motion.

## 1. What the viewer sees

- The same kind of globe as history: you fly around it from orbit, with the same camera and controls, the sky and the day and night light.
- Continents are drawn as flat painted land on a deep blue ocean, moving as the timeline moves: Rodinia breaking up, the oceans opening and closing, Pangaea assembling and splitting, India crashing into Asia.
- Plate boundaries are drawn as lines on land and under water, in three kinds that a child can tell apart at a glance: spreading ridges, subduction zones (with teeth on the overriding side) and transform faults.
- An overlay **Today's coasts** draws the present-day coastlines on the moving plates, so the viewer can see where Africa or India was. It is on by default.
- The timeline at the bottom runs from 1,000 Ma on the left to today on the right, linear (section 3). Moments such as "Rodinia breaks up" sit on it; tapping one shows a card and flying there moves time.
- There is no elevation, no ice, no sea level and no life: nobody has a global model of them for this whole range that meets our licence policy, and the viewer is told so in the About panel (section 8). A banner shows that the older the age, the less certain the map (section 7).
- No history lens: the globe is drawn in true proportions.

## 2. One engine, two packs

### 2.1 The split

| Part | Holds | Rule |
| --- | --- | --- |
| **Engine** | the clock and time curve, the camera, the globe renderer and its surface sources, the timeline widget, localisation, storage, the lens, the data-build framework, the quality and performance machinery | knows nothing of any pack |
| **Pack** | a spec, data (`data/`), the curated records, its data-build stages, its world code, its models and textures, its UI panels, its golden tests, its localisation strings, its entry page | registers itself with the engine; imports the engine, never another pack |

Two packs exist:

| Pack | Entry page | Range | Status |
| --- | --- | --- | --- |
| `history` | `index.html` | the last ice age to 1991 | today's Miniworld, moved behind the pack boundary without changing behaviour |
| `geo-history` | `geo-history.html` | 1,000 Ma to today | new |

A lint rule keeps the engine from importing a pack and a pack from importing the other, like the rule that keeps the world from importing the renderer ([architecture.md](architecture.md#1-layers)). Each pack has its own storage key prefix, so settings, the last time and the bookmarks of one never touch the other.

### 2.2 What a pack provides

A pack is an object the entry page hands to the engine:

- its **time axis**: the range, the function from watching time to the date, the unit of the date, the date formatting and the speed modes (section 3);
- its **surface**: how the globe is drawn (section 5), the elevation tiles of history or the plate meshes of geo-history, behind one engine interface;
- its **lens setting**: history builds and uses the fixed 120% warp; geo-history sets the lens to none, so the engine skips the warp and draws true proportions;
- its **timeline content**: lanes, bands and moments, from its own records;
- its **panels, overlays and cards**, and its **strings** in English and German;
- its **world**: a pure function of the clock, as in spec section 9.

The engine owns the timeline widget, the controls, the loop and the loader. Everything that says what a date is, what is on the globe or what text to show comes from the pack.

### 2.3 Mode switch

A small control in the corner switches between the two entry pages; it keeps the language and the quality setting and starts the other mode at its last saved time. The end of the geo-history timeline links to history ("Humans appear in the last few hundred thousand years: see them in Miniworld history").

### 2.4 Getting there without breaking history

Today history's code is mixed with the engine: `world/`, `tree/` and `wildlife/` are history content, and the globe renderer is tied to the elevation tile quadtree. The split is made first, in small pull requests, each judged by the golden and on-land tests and the browser tests, which must pass unchanged:

1. Name the boundary: move the history-only code under `app/src/packs/history/` and the engine under `app/src/engine/`, with the lint rule, no behaviour change.
2. Put the time axis, the lens and the terrain source behind the pack interface of section 2.2, history being the only implementation.
3. Add the second entry page and Vite page; geo-history registers an empty pack to prove the boundary.

The data build splits the same way: `data/build/` keeps the framework, and each pack has its `stages/`, `curated/` and `sources/` under `data/packs/<pack>/`, with its own manifest and startup index.

## 3. Time

- The axis is **linear in time, with no curve**: unlike history (spec section 2.1), geo-history has no deep past that passes quickly and a recent past that passes slowly. A metre of timeline is the same number of years anywhere on it.
- The date is the **age** in whole years before today, an integer from 1,000,000,000 down to 0. Watching time is counted in milliseconds as in history; at regular speed 1,000 Ma pass in 10 minutes, 100 Ma per minute (decided as a default; the speed modes of milestone 1 section 8.1 scale it as they do in history).
- The pack runs forward in time: it starts at 1,000 Ma and ends at 0, today. There is no future.
- The world is a pure function of the age and the data, so scrubbing is instant and the same age always shows the same planet.
- The timeline zooms from the whole 1,000 Ma down to about 1 Ma across, which is the finest the plate model supports. At full range the Cenozoic is a sliver, the last 66 Ma are 6.6% of the line; the zoom and the moments of section 6 are what make it explorable.
- The timeline's bands are the geological periods of the International Commission on Stratigraphy chart (Tonian, Cryogenian, Ediacaran, then the Phanerozoic periods), one lane "Geological time", plus a lane "Supercontinents" for the assemblies and break-ups of section 6.
- Ages are shown in English as "620 Ma" and in German as "vor 620 Mio. Jahren"; below 1 Ma, "10 ka" and "vor 10.000 Jahren".

## 4. Data

The data is the plate model of Merdith et al. (2021), "A continuous, kinematic full-plate motion model from 1 Ga to present", Earth-Science Reviews, in version 1.2.4 as published on Zenodo (record 13635864), licensed CC BY 4.0, which section 13 of the main spec allows without asking.

| Item | Value |
| --- | --- |
| Id | `merdith-2021` |
| Download | `https://zenodo.org/api/records/13635864/files/Merdith_etal_2021_ESR_v1.2.4.zip/content` |
| SHA-256 of the zip | `c08cd59f9fc26a99315a9a28c7a8da33ef7dc16e60c14eaec24e673cb6b78e6e` (8,496,217 bytes) |
| Licence | CC BY 4.0, attribution given in the About panel |

The zip holds, among others:

| File | Used for |
| --- | --- |
| `Rotations/1000_0_rotfile_Merdith_etal.rot` | the rotation model: finite rotations of every plate at key ages, relative to a fixed plate, in a palaeomagnetic reference frame |
| `StaticPolygons/shapes_static_polygons_Merdith_etal.gpml` | present-day crust split into pieces, each with a plate id: the shapes that move with a plate |
| `Continents/shapes_continents.gpml` | the continents' shapes for the whole 1 Ga, with their plate ids |
| `Coastlines/shapes_coastlines_Merdith_et_al_v2.gpmlz` | coastlines, which the model's README says are mainly for the last 400 Ma |
| `Topologies/*.gpml` | the plate boundaries over time, in three ranges (1,000 to 410, 410 to 250 and 250 to 0 Ma), with convergent, divergent and transform sections and their building blocks |
| `Cratons/shapes_cratons_Merdith_etal.gpml` | the old cores of the continents, for a later tint |

The data build keeps, under `data/packs/geo-history/sources/merdith-2021/`, only small simplified extracts (spec section 13): the rotation tree as numbers, the polygons simplified to the drawing resolution, and the boundary sections with their valid times, in compact binary chunks. The originals are recorded by URL and checksum and downloaded by `npm run fetch-data`.

Other free sources:

- **Today's coasts**: Natural Earth, already in the repository (public domain), whose vertices the build assigns to the plate of the static polygon they fall in.
- **Geological periods**: the International Chart of Stratigraphy, CC BY 4.0, for the band names and ages.

Out of scope for version 1, and the sources to look at later: a finer Mesozoic and Cenozoic model with deformation (Müller et al. 2019, CC BY 4.0, Zenodo 11601026), the 2,000 to 540 Ma model of Merdith et al. (2023, Zenodo 10256054) if the range is ever extended, and any palaeo-elevation or sea-level dataset. Scotese's PALEOMAP is not used until its licence is confirmed to meet section 13.

## 5. How the planet is computed and drawn

### 5.1 Poses

The model gives, for each plate id, finite rotations at key ages relative to a fixed plate, and the plates form a tree. The world computes the pose of a plate at an age like this:

1. Find the plate's two key ages around the age and interpolate between its two rotations along the great circle (spherical linear interpolation of the unit quaternions, the same way GPlates does it).
2. Compose the result with the pose of its fixed plate at the same age, up the tree to the root.
3. The result is one unit quaternion per plate: the plate's pose at that age.

This is the world of geo-history: `poses(age)` returns a quaternion per plate id, plus the drawn-ness of every plate and boundary section (a section exists only between its valid times). It is deterministic code on integer ages, with no wall clock and no randomness.

### 5.2 Drawing

The plate meshes are built once, in each plate's own frame: the land polygons triangulated on the sphere, the boundary sections as lines, the present-day coasts as lines. The renderer sets one quaternion per plate each frame, so moving the whole planet costs a few hundred uniforms, not new geometry. The shapes are drawn:

- land: flat painted colour per continent with a darker edge, over a deep blue ocean sphere; the colours are chosen so neighbouring continents can be told apart and so a continent keeps its colour across the whole timeline;
- plate boundaries: ridges, subduction zones with teeth and transforms as three line styles, on land and under water; they appear and disappear as their sections' valid times begin and end, with a short fade;
- today's coasts: thin lines on the plates, drawn over the land.

The camera range is the one of history (spec section 3), except that the lowest zoom stops where a figure would have filled the screen: nothing in geo-history is drawn at human size.

Version 1 does not fill the ocean plates, because that needs the full topological polygons resolved at every age: the ocean shows only the plate boundaries. Seafloor age, the ocean floor's colour by age, is a later step (section 9).

### 5.3 Performance

The data for the whole range is a few MB; there is nothing to stream by place, and the pack ships its poses and meshes in the first download. The target is the performance budget of spec section 9: 60 fps on a first MacBook Air M1 and 30 fps on a Pixel 9, with a world query under 8 ms, which poses and a few hundred uniforms meet by a wide margin.

## 6. Moments

A moment is a record in `data/packs/geo-history/curated/moments/`: an age or an age range, a place for the camera, a title and a card text in English and German, and its sources, using the envelope of [content-format.md](content-format.md). Uncertain ages are marked approximate, as everywhere in Miniworld. The first list, to be checked against the sources when the records are written (the ages below are the commonly cited ones and are not yet verified):

| Moment | About |
| --- | --- |
| Rodinia is largely assembled | around 1,000 to 900 Ma |
| Rodinia breaks up | from about 800 to 750 Ma |
| The Cryogenian ice ages ("Snowball Earth") | 720 to 635 Ma |
| The Ediacaran begins | 635 Ma |
| Gondwana is assembled | around 550 to 500 Ma |
| The Cambrian begins | about 539 Ma |
| The Iapetus Ocean closes and the Caledonian mountains rise | around 430 to 400 Ma |
| Pangaea is assembled | around 335 to 300 Ma |
| Pangaea begins to break up and the Atlantic opens | from about 200 Ma |
| The South Atlantic opens | from about 130 Ma |
| India collides with Asia and the Himalaya rises | from about 50 Ma |
| The Alps rise as Africa meets Europe | from about 35 Ma |

The cards are written at an 11 to 12-year-old reading level, with the presentation rules of CLAUDE.md. Since there is no life in version 1, cards may name life only to place a date, such as the Cambrian.

## 7. Honesty about the map

The plate model is a reconstruction, and the further back, the less is known. The app says so:

- **Uncertainty.** Between 1,000 and 410 Ma the model is constrained mostly by palaeomagnetic poles that fix latitude but not longitude, and by the geology of the continents; the oceans in that range are inferred. A band on the timeline marks the ranges "well constrained" (the last 250 Ma, with the ocean floor record), "constrained" (250 to 540 Ma) and "less certain" (540 to 1,000 Ma), and the About panel explains it in both languages.
- **Reference frame.** The model's frame is palaeomagnetic: it gives latitudes, but the east-west position is a convention, and the Pacific plates before 83 Ma keep only their motion relative to the continents (the model's README says not to use the model for the Pacific's absolute motion). Version 1 shows the model's own frame and says so on the card of the About panel; a choice of frame is a later step.
- **No relief.** Land is flat and the same colour all over: an old continent is drawn as the area the model says was continental crust, not as a coast with a shelf and mountains.
- **Continent outlines.** Before about 400 Ma, the model's coastlines do not exist; the land drawn there is the shape of continental crust, which is wider than the dry land was.

## 8. Interface, localisation, licences

- The interface is the engine's, in the pack's strings; every string and every moment has `en` and `de`, with German allowed to run longer.
- The About panel gives the attribution that CC BY 4.0 requires for Merdith et al. (2021), the ICS chart and Natural Earth, in both languages, and the limits of section 7.
- Third-party libraries and data follow section 13 of the main spec: the data build fails when a source's licence is missing or not on the allowed list. The GPlates software and its Python library (pyGPlates) are not dependencies of the build or the app. The rotation, polygon and boundary parsers are written in TypeScript in the data build. Test fixtures of poses may be made once by hand with GPlates by anyone who has it, as plain numbers (section 10).

## 9. Later

In order, none of it in version 1:

1. Ocean plates filled and the ocean floor coloured by age, which needs the topological polygons resolved at each age.
2. A choice of reference frame, such as keeping one continent fixed.
3. A finer last 250 Ma from Müller et al. (2019), if the Merdith model's boundary sections prove too coarse.
4. Palaeo-elevation, ice and sea level, if a dataset meeting section 13 is found.
5. Life, as a pack layer: the first animals, the Cambrian, the dinosaurs.
6. Extending the range with the 2,000 to 540 Ma model.

## 10. Milestones and tests

| Step | Content | Done when |
| --- | --- | --- |
| G0 | This spec, and the engine and pack boundary of section 2.4 steps 1 and 2 | history is unchanged: golden, on-land and browser tests pass as they are; the lint rule is on |
| G1 | The data build: fetch, parsers for the rotation file, polygons and boundaries, the compact chunks, licence entries | `npm run build-data` makes the geo-history chunks; the build fails on a missing licence |
| G2 | `poses(age)` and the golden tests | the poses of the golden ages (0, 50, 100, 250, 335, 540, 750 and 1,000 Ma) match the stored result, and spot checks of the rotation arithmetic match values worked out by hand from the rotation file; where a GPlates figure for a pose exists, it matches within a tolerance of 0.01 degrees |
| G3 | The geo-history entry, the plate meshes and the globe | scrubbing from 1,000 Ma to 0 shows Rodinia, Pangaea and today's map, on the reference laptop and phone within the performance budget |
| G4 | The timeline in Ma, the bands, the moments, the cards and the mode switch | the first list of section 6 is in both languages with sources, and switching language and mode keeps the other mode's state |
| G5 | The About panel, the uncertainty band, review in both languages, an approved look | Yang's feedback is in |

Golden tests compare the numbers within a tolerance, since the trigonometric functions of different devices may differ in the last digits; the rule that the same age shows the same planet holds up to that tolerance.

## 11. Open decisions

- How long the default play-through is (section 3 assumes 10 minutes for 1 Ga).
- Whether the continent colours should follow the plates' ids or be fixed by hand per continent.
- Whether the mode switch and the About panel belong in the first view of history too, and in what form.
