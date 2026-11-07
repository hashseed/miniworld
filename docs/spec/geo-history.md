# Geo-history: the planet from 1 billion years ago

Miniworld gets a second mode, **geo-history**: a passive globe that shows how the continents moved over the last 1 billion years, from the supercontinent Rodinia through Gondwana and Pangaea to today's map. Plates, continents and plate boundaries only; no life and no people yet. The current mode, now called **history**, is not changed.

This file is the spec of the geo-history pack only. What the engine is, how packs plug into it, how the pack is chosen when the app is built and how history moves behind the boundary are in [engine.md](engine.md). Decided by Yang on 2026-11-07: plates and continents only in version 1, a range of 1 Ga because no scientific plate model reaches further back with continuous motion, a play-through of one hour, natural continent colours from the expected climate, and no switch in the running app.

## 1. What the viewer sees

- The same kind of globe as history: you fly around it from orbit, with the same camera and controls, the sky and the day and night light.
- Continents are drawn as land in natural colours, on a deep blue ocean, moving as the timeline moves: Rodinia breaking up, the oceans opening and closing, Pangaea assembling and splitting, India crashing into Asia.
- Plate boundaries are drawn as lines on land and under water, in three kinds that a child can tell apart at a glance: spreading ridges, subduction zones (with teeth on the overriding side) and transform faults.
- An overlay **Today's coasts** draws the present-day coastlines on the moving plates, so the viewer can see where Africa or India was. It is on by default.
- The timeline at the bottom runs from 1,000 Ma on the left to today on the right, linear (section 3). Moments such as "Rodinia breaks up" sit on it; tapping one shows a card and flying there moves time.
- There is no elevation, no sea level and no life: nobody has a global model of them for this whole range that meets our licence policy, and the viewer is told so in the About panel (section 8). A banner shows that the older the age, the less certain the map (section 7).
- No history lens: the pack sets the lens to none ([engine.md](engine.md#2-what-a-pack-provides)) and the globe is drawn in true proportions.
- No switch to history in the running app: the pack is chosen when the app is built ([engine.md](engine.md#3-the-pack-is-chosen-at-build-time)).

## 2. What this pack provides to the engine

The pack interface is in [engine.md](engine.md#2-what-a-pack-provides). For geo-history:

| Part | Geo-history |
| --- | --- |
| Time axis | linear age from 1,000 Ma to 0, in whole years (section 3) |
| Surface | plate meshes, posed per age (section 5) |
| Lens | none |
| Timeline content | the lanes "Geological time" and "Supercontinents", and the moments of section 6 |
| Panels | the About panel with the attribution and the limits of section 7; the overlay "Today's coasts" |
| Data | `data/packs/geo-history/`, with its own manifest, built by `PACK=geo-history npm run build-data` |
| Port in the devenv | 8801 |

The pack's code lives in `app/src/packs/geo-history/`, its strings under its own namespace and its storage keys under the prefix `geo-history`.

## 3. Time

- The axis is **linear in time, with no curve**: unlike history (spec section 2.1), geo-history has no deep past that passes quickly and a recent past that passes slowly. A metre of timeline is the same number of years anywhere on it.
- The date is the **age** in whole years before today, an integer from 1,000,000,000 down to 0. Watching time is counted in milliseconds as in history; at regular speed 1,000 Ma pass in one hour (decided by Yang on 2026-11-07), which is about 16.7 Ma per minute or 0.28 Ma per second; the speed modes of milestone 1 section 8.1 scale it as they do in history.
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

The repository keeps, under `data/sources/merdith-2021/`, only small simplified extracts (spec section 13), made by `node data/packs/geo-history/build/simplify.ts` from the downloaded zip: `rotations.json` (the rotation rows as numbers, 177 KB), `land.json` (the continents' polygons, 845 of them, simplified to 0.05 degrees, 319 KB) and `boundaries.json` (2,784 ridge, subduction and transform sections with their plate ids, valid times, polarity and, for half-stage sections, their two plates, simplified to 0.08 degrees, 568 KB). The extracts are listed in `data/sources.json` with their checksums and the field `pack: "geo-history"`, which keeps them out of the history pack's source list; the originals are recorded by URL and checksum and downloaded by `npm run fetch-data merdith-2021` and extracted by hand into `data/out/merdith-2021/`.

The topological plate polygons of the model are not used: only the boundary sections that make them up. Ridges and rifts of the model move by half-stage rotation, the mean of the poses of the two plates beside them, and are placed as digitised at the age the feature records; all other sections and all land move with the pose of their plate id.

Other free sources:

- **Today's coasts**: Natural Earth 1:10m land, already in the repository (public domain), simplified to 0.1 degrees. The build assigns each vertex the plate of the model's continent polygon that contains it at 0 Ma (the nearest polygon where none does) and cuts the outlines into pieces at the points where the plate changes, so each piece moves with its plate.
- **Geological periods**: the International Chart of Stratigraphy, CC BY 4.0, for the band names and ages.

Out of scope for version 1, and the sources to look at later: a finer Mesozoic and Cenozoic model with deformation (Müller et al. 2019, CC BY 4.0, Zenodo 11601026), the 2,000 to 540 Ma model of Merdith et al. (2023, Zenodo 10256054) if the range is ever extended, and any palaeo-elevation or sea-level dataset. Scotese's PALEOMAP is not used until its licence is confirmed to meet section 13.

## 5. How the planet is computed and drawn

### 5.1 Poses

The model gives, for each plate id, finite rotations at key ages relative to a fixed plate, and the plates form a tree. The world computes the pose of a plate at an age like this:

1. Find the plate's two key ages around the age and interpolate between its two rotations along the great circle (spherical linear interpolation of the unit quaternions, the same way GPlates does it).
2. Compose the result with the pose of its fixed plate at the same age, up the tree to the root.
3. The result is one unit quaternion per plate: the plate's pose at that age.

This is the world of geo-history: `RotationModel.poses(age)` returns a quaternion per plate id (`app/src/packs/geo-history/world/poses.ts`), and a polygon or boundary section exists only between its valid times. It is deterministic code on the age, with no wall clock and no randomness. Where a plate's fixed plate changes between two key ages, the two poses themselves are interpolated; before a plate's first and after its last age it keeps the nearest rotation. The pack's world uses sin, cos and acos for the great-circle interpolation, which the lint rule of the history world forbids for determinism across engines; the rule does not apply to this pack, because nothing in geo-history branches on a pose, and the golden tests compare within a tolerance (section 10).

### 5.2 Drawing

The meshes are built once, in each plate's own frame: the land polygons triangulated on the sphere (by ear clipping in a stereographic projection about each polygon's centre, the triangles split until no edge is longer than about 1.7 degrees), the boundary sections and the present-day coasts as lines, and the teeth of the subduction zones as small triangles. Every vertex carries the slot of its plate and its valid ages. The poses go to the graphics card as one row of a float texture, one texel per plate (and per half-stage section), which is rewritten when the age changes; the vertex shader looks its pose up, rotates the vertex and drops it off screen when the age is outside its valid ages. Moving the whole planet costs one small texture upload, not new geometry. The shapes are drawn:

- land: natural colours from the expected climate (section 5.3), lit softly from the camera's side, over a deep blue ocean sphere;
- plate boundaries: ridges (orange), subduction zones (crimson, with teeth on the side of the overriding plate where the model says it) and transforms (yellow) as lines of a fixed width in pixels, on land and under water; they appear and disappear as their sections' valid times begin and end;
- today's coasts: thin pale lines on the plates, drawn over the land, and fading with age (opacity 0.85 today, 0.35 at 1,000 Ma), because the further back they are carried, the less these coasts say.

The camera range is the one of history (spec section 3), except that the lowest zoom stops where a figure would have filled the screen: nothing in geo-history is drawn at human size.

Version 1 does not fill the ocean plates, because that needs the full topological polygons resolved at every age: the ocean shows only the plate boundaries. Seafloor age, the ocean floor's colour by age, is a later step (section 9).

### 5.3 Climate colours

Decided by Yang on 2026-11-07: continents are drawn in regular natural colours based on the expected climate. There is no climate dataset for the whole range that meets section 13 of the main spec, so the colour comes from a simple model with one input, the **latitude each point of land has at the current age**, which the poses give (section 5.1): the same continent is green in the tropics and white near a pole, and changes colour as it drifts.

| Latitude | Expected climate | Colour |
| --- | --- | --- |
| 0° to about 10° | tropical rainforest | deep green |
| about 10° to 20° | tropical savanna | olive green |
| about 20° to 35° | subtropical desert, where the dry air of the Hadley cells sinks | sand |
| about 35° to 50° | temperate | fresh green |
| about 50° to 65° | cold forest | dark blue-green |
| about 65° to 75° | tundra | grey-brown |
| beyond about 75° | polar ice | white |

The bands blend smoothly in the shader, with no hard lines, and are the same in the northern and the southern hemisphere. They are the same for the whole timeline in version 1: the model does not know that the Sun was fainter, that the Earth had a ice-free "greenhouse" or a snowball state, or that the interior of a big continent is drier than its coast. The About panel says that the colours are an expectation from latitude and not a reconstruction (section 7). The latitude bands and their blending are data in `data/packs/geo-history/curated/climate-bands.json`, with a source for each (a climate textbook or the Köppen-Geiger zones' typical latitudes), so they can be tuned without code.

Later steps (section 9) replace the zones by an ice line that follows the known icehouse and greenhouse intervals, and by a real palaeoclimate dataset, if one is found.

### 5.4 Performance

The data for the whole range is one file of 1.8 MB (about 0.4 MB compressed), content-hashed, and there is nothing to stream by place. The target is the performance budget of spec section 9: 60 fps on a first MacBook Air M1 and 30 fps on a Pixel 9. The poses of about 1,200 plates and 1,200 half-stage sections cost a few milliseconds when the age changes, and nothing while it stands still. Not yet measured on the reference devices: only in a headless browser with software rendering, which is no judge of frame time.

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
- **Colours are an expectation.** Land is coloured by the latitude it had, as in section 5.3: a desert band is where deserts are expected, not where one was known. Land is flat, with no shelf and no mountains.
- **Continent outlines.** Before about 400 Ma, the model's coastlines do not exist; the land drawn there is the shape of continental crust, which is wider than the dry land was.

## 8. Interface, localisation, licences

- The interface is the engine's ([engine.md](engine.md)), in the pack's strings; every string and every moment has `en` and `de`, with German allowed to run longer.
- The About panel gives the attribution that CC BY 4.0 requires for Merdith et al. (2021), the ICS chart and Natural Earth, in both languages, and the limits of section 7.
- Third-party libraries and data follow section 13 of the main spec: the data build fails when a source's licence is missing or not on the allowed list. The GPlates software and its Python library (pyGPlates) are not dependencies of the build or the app. The rotation, polygon and boundary parsers are written in TypeScript in the data build. Test fixtures of poses may be made once by hand with GPlates by anyone who has it, as plain numbers (section 10).

## 9. Later

In order, none of it in version 1:

1. An ice line and climate colours that follow the known icehouse and greenhouse intervals (such as the Cryogenian), in place of the fixed zones of section 5.3.
2. Ocean plates filled and the ocean floor coloured by age, which needs the topological polygons resolved at each age.
3. A choice of reference frame, such as keeping one continent fixed.
4. A finer last 250 Ma from Müller et al. (2019), if the Merdith model's boundary sections prove too coarse.
5. Palaeo-elevation, ice and sea level, if a dataset meeting section 13 is found.
6. Life, as a pack layer: the first animals, the Cambrian, the dinosaurs.
7. Extending the range with the 2,000 to 540 Ma model.

## 10. Milestones and tests

| Step | Content | Done when | State (2026-11-07) |
| --- | --- | --- | --- |
| G0 | The engine and pack boundary and the build-time pack choice ([engine.md](engine.md#4-getting-history-behind-the-boundary), steps 1 to 3) | history is unchanged: golden, on-land and browser tests pass as they are; a test keeps the boundary; `PACK=geo-history` builds the second pack | Done, except that the engine still imports the history pack in 14 places ([engine.md](engine.md#4-getting-history-behind-the-boundary)) and the browser tests were not run |
| G1 | The data build: fetch, parsers for the rotation file, polygons and boundaries, the extracts and the data file, licence entries | `npm run build-data:geo-history` makes the data file; the build fails on a missing licence, a changed extract or a source a record names that is not in the bibliography | Done |
| G2 | `poses(age)` and the golden tests | the poses match values worked out by hand for a small model, and golden places match the stored result (Delhi, New York and Sydney at the ages of the table in the test) within 0.06 degrees; the motion of the main plates never jumps | Done; no GPlates figures to compare with were available, so the golden values are this code's, checked for plausibility against the known motions of India, North America and Australia |
| G3 | The plate meshes, the globe and the climate colours | scrubbing from 1,000 Ma to 0 shows Rodinia, Pangaea and today's map, on the reference laptop and phone within the performance budget | Looks right in a headless browser (Rodinia at 920 Ma, Gondwana at 520 Ma, Pangaea at 280 Ma, India meeting Asia at 50 Ma, today); performance on the reference devices not measured |
| G4 | The timeline in Ma, the bands, the moments, the cards | the first list of section 6 is in both languages with sources, and switching language keeps the time | Done: 12 moments, English and German; the ages and the card texts are still to be checked against their sources |
| G5 | The About panel, the uncertainty band, review in both languages, an approved look; both packs deployed side by side | Yang's feedback is in | About panel and uncertainty band built; waiting for Yang's review and for the deploy |

Golden tests compare the numbers within a tolerance, since the trigonometric functions of different devices may differ in the last digits; the rule that the same age shows the same planet holds up to that tolerance.

## 11. Open decisions

- The latitude bands of section 5.3 are a first guess; Yang reviews the look in G3. One consequence to judge: land that lies at a pole is drawn white at every age, such as Gondwana at 520 Ma, although the early Palaeozoic was mostly warm; the ice line of section 9 item 1 would fix it.
- Whether today's coasts should be on by default at the oldest ages, where they are scattered over blocks of land they did not belong to.
- Whether the ice line of section 9 item 1 should come before the ocean plates, since the Cryogenian is the most dramatic moment of the range.
