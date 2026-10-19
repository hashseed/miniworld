# History lens

Most recorded history happened on a small share of the Earth's surface. Europe, the Nile valley, Mesopotamia, northern India and eastern China hold most of the events in the spec lists. Oceans, Siberia and the polar regions hold very few. On a true-scale globe the busy places are crowded and the empty ones take up most of the screen. The history lens enlarges the busy places and shrinks the empty ones a little, so that Europe and its neighbours have room for their towns, armies and markers.

The lens is fixed at 120% of the warp the build makes, with no control for it (Yang, 2026-10-19: "let's set history lens to 120% and remove the controls. We can consider bringing it back in the future but for now let's have it fixed at 120%"); until then a slider set it from 0% (true sizes) to 200% (section 1). It is built as part of milestone 1 (decided by Yang on 2026-10-17, [milestones.md](milestones.md#1-globe-and-time)), so the globe and its time travel are tried with it from the start.

## 1. What the viewer sees

- The globe keeps all continents and coasts in the right order and connected. Busy regions are drawn larger and empty regions smaller, and the change is smooth, with no visible seams or edges.
- Shapes stay recognisable: Italy is still a boot and Britain still an island next to the continent. Size changes, but local shapes barely do (section 3).
- Everything sits in its real place relative to the land: a town on a river stays on that river, and a battle on a coast stays on that coast. All geography and all positions pass through the same warp, so nothing contradicts the data.
- Miniatures keep their usual size. An enlarged region gets more space between its towns, not bigger towns.
- The lens is fixed at 120% (Yang, 2026-10-19). The slider "History lens" that set it from 0% to 200% behind a magnifying-glass button, and morphed the globe as it moved (section 4.1), is removed for now and may come back.
- No hint about the stretched map is shown at start (removed at Yang's request on 2026-10-19: "remove the history lens explainer dialog").

## 2. How big

The lens is one fixed warp for the whole timeline and is not tied to the current date. If the warp changed with the date, coasts would drift as the viewer scrubs, and the viewer could not learn where things are. Europe is busy in every era after the ice age, so a single warp is enough.

The warp is computed from the coordinates of every event, war and battle in the spec lists (see [content-format.md](content-format.md#4-place) section 4), each counted once:

1. Event density is smoothed over the sphere with a wide Gaussian kernel of 1,500 km. The wide kernel makes the size change gently over thousands of kilometres. Seas between busy coasts, such as the Mediterranean, grow together with both shores, and North Africa grows almost as much as southern Europe. The falloff happens far from the busy places, across the Sahara, the steppe and the open ocean.
2. The target area factor of each spot is (density / mean density + 0.3) to the power of an exponent. The added 0.3 keeps nearly empty places from shrinking too fast next to a single lonely event, and the exponent sets how strong the lens is. The build starts at 0.5 and lowers it in steps of 0.05 until the warp meets the limits of section 3.
3. The factor is scaled so that the total area of the globe stays the same, and then limited to between 0.6 and 3.5.

**Strength.** An exponent of 0.5 would give Europe about 3 times its area and Egypt 3.5 times. A warp that strong has to squeeze the quiet regions next to the busy ones, and their shapes stretch: Labrador and Newfoundland, between Europe and the shrinking Americas, up to 1.9 to 1, and Congo and Angola, south of the growing Sahara, up to 1.7 to 1, with a third of all land over 1.3 to 1. Yang chose the medium strength on 2026-10-17: shapes may stretch at most 1.5 to 1 anywhere (section 3), which the build reaches at an exponent of 0.3. The shapes of the busy regions themselves stretch only about 1.1 to 1.3 to 1 at any strength.

The warp the build makes from the 1,842 coordinates now in the spec, at an exponent of 0.3:

| Region | Area factor | Width factor (about) |
| --- | --- | --- |
| Europe as a whole | 2.0 | 1.4 |
| Alps and central Europe | 2.1 | 1.45 |
| Italy | 2.2 | 1.5 |
| Tunisia and the central Mediterranean | 2.1 | 1.45 |
| Algerian coast | 1.9 | 1.4 |
| Nile valley and Egypt | 2.4 | 1.55 |
| Northern India | 1.9 | 1.4 |
| Eastern China | 1.9 | 1.4 |
| Central Sahara | 1.75 | 1.3 |
| Sahel | 1.5 | 1.2 |
| Siberia | 1.3 | 1.1 |
| Americas | 0.86 | 0.93 |
| Open Pacific | 0.77 | 0.88 |

The size changes smoothly everywhere, with no step: the area factor changes by at most 1.4 times over any 1,000 km. Both shores of the Mediterranean grow alike, and most of the falloff happens in the Sahara. A narrow kernel of 600 km would drop from 2.2 on the North African coast to 0.8 in the central Sahara within about 1,300 km. That would squeeze the desert visibly, so the wide kernel is the default, and the strength comes from the exponent instead.

**Stronger and weaker.** The slider of section 1 scales how far every point moves from its true position: at a strength s, a point moves s times as far along the same direction as at 100%, and the width factor changes s times as much (section 4.1). Below 100% the warp only gets milder. Above it the limits of section 3 no longer hold, by Yang's choice, but the warp must still not fold. At 200% the warp the build makes gives:

| | 100% | 200% |
| --- | --- | --- |
| Europe as a whole, area factor | 2.0 | 3.5 |
| Italy | 2.2 | 3.8 |
| Nile valley and Egypt | 2.4 | 4.4 |
| Width factor, smallest to largest | 0.87 to 1.58 | 0.75 to 2.16 |
| Largest stretch of a shape (off Newfoundland) | 1.5 to 1 | 2.1 to 1 |
| Smallest local area factor (no fold below 0) | 0.76 | 0.55 |

**Boosts.** Where the lens must give room that the event lists do not yet give, `data/curated/lens-boosts.json` adds weight: places that each count as a number of event coordinates, with a reason. Japan has one (Yang, 2026-10-19: "let's make japan slightly wider"): five points along Kyushu, Shikoku and Honshu, each counted 12 times, since Honshu was too narrow for even the smallest camp of the tree of humankind ([sites.md](sites.md) section 2) and no band could reach Japan. The wide kernel spreads it, so Korea and the coast of China grow a little too. A boost changes the warp's version like any new event, and the new warp needs Yang's approval from its preview (section 3).

Only five regions have their own event lists for now, so the lens favours them. When lists for the Americas, Africa and other regions are added, the warp is computed again and those regions grow.

## 3. The warp

The warp is a smooth, one-to-one map of the sphere onto itself, from true positions to drawn positions. It is computed offline as a density-equalising cartogram on the sphere: a diffusion cartogram after Gastner and Newman (2004), adapted to the sphere so that it has no seam at the date line or the poles.

- **Method.** The target area factor is expanded in spherical harmonics up to degree 32 and diffused on the sphere; every grid point follows the diffusion flow until the density is even. Afterwards the whole globe is turned back by the rotation that moves the busy regions least, which changes no size or shape. Even so, enlarged regions push their neighbours aside: Afro-Eurasia spreads out from the Middle East, so Europe is drawn up to about 20 degrees further west and eastern China about 13 degrees further east. That is why everything outside drawing uses true positions (section 4).
- **Limits.** The data build checks the warp. It must not fold anywhere, so it stays one-to-one. Its stretch in one direction must never be more than 1.5 times its stretch in the other direction (raised from 1.3 by Yang on 2026-10-17, section 2), so shapes stay recognisable. The area factor must not change by more than 2 times over any 1,000 km, so there are no sudden size steps, for example across a narrow sea. If any check fails, the build lowers the exponent of section 2 step by step until all checks pass, and it fails if none does. The limits apply at 100%. The build also checks that the warp does not fold at the slider's highest strength of 200% (section 2), and fails if it does.
- **Storage.** The data build writes the warp as two grids of 2 degrees, one forward (true to drawn) and one inverse (drawn to true): 181 by 91 points from 180° west to 180° east (both kept, so no lookup wraps) and from pole to pole, each point the drawn (or true) latitude and longitude quantised to 16 bits. The two grids are one file of about 130 KB listed in the manifest. It is the same for every language, so it is not part of a language's startup index, but it is loaded together with the startup index, because the first frame needs it. Values between grid points are interpolated bilinearly as unit vectors, which is accurate enough because the warp only changes over hundreds of kilometres. The width factor (the square root of the area factor) is derived from the forward grid when the file is loaded.
- **Versioning.** The warp is a data build output with its own version, a hash of the event coordinates and the parameters. It changes only when the event lists or the parameters change and the data is built again; the approved warp is committed in `data/curated/lens/<version>.bin` (about 130 KB), so builds and CI read it instead of computing it, and any other warp is kept in `data/out/lens/` under its version and a hash of the lens code, so that unchanged inputs are not computed again. A new warp moves where things are drawn, so the build renders a before-and-after preview (`data/out/lens/preview-<version>.svg`) for Yang to approve, and `data/curated/lens.json` records the approved version; approving a version also means committing its warp file. The build reports a warp that is not approved; a release must not ship one.

## 4. Rendering

The world query does not change. It computes everything in true coordinates, and the lens is applied only when the world is drawn. That keeps the world a pure function of the clock, with or without the lens.

- **Terrain.** Tiles keep their true coordinates, so streaming and caching do not change. The vertex shader moves each vertex to its drawn position by reading the forward grid as a texture. It also multiplies the elevation by the local width factor, so that mountains in enlarged regions keep their steepness and do not look flattened. Tile detail is chosen from the drawn size of a tile, so enlarged regions get finer tiles.
- **Lines.** Coasts, rivers, borders, routes and paths pass through the same warp. Long segments are first split into pieces of at most 50 km, so the lines bend with the land.
- **Things placed on the globe.** Settlements, landmarks, vignettes ([milestone-2.md](milestone-2.md#6-vignettes) section 6), event markers, labels and famous people are placed at the warped position of their anchor. A settlement's cluster of buildings, a vignette's stage and the routines of their figures are laid out around that point in drawn units at the usual miniature scale, so figures walk at their normal speed everywhere.
- **Camera and picking.** Fly-to goes to the warped anchor. A tap is turned back into a true position through the inverse grid, so cards, the region in view and the timeline lane all use true positions. The clock slowing as the camera zooms in uses the drawn height of the camera.
- **Changing the strength.** When the slider moves, the globe morphs to the new strength (section 4.1). Which terrain tiles are drawn is chosen from the warp at 100% whatever the strength, so moving the slider never reloads tiles or shows coarser ones while new data arrives (decided by Yang on 2026-10-18, after flicker and a coarse map while sliding).

### 4.1 The transition

Changing the strength morphs the globe instead of swapping it, so the viewer sees the busy places swell and the oceans shrink, or the reverse.

- **Blend.** One blend value is the drawn strength: 0 for true sizes, 1 for the warp at 100% and 2 for 200%. Every drawn position is its true position moved by the blend times the way to its warped position (the blended vector is normalised back onto the sphere), and the width factor used for elevation, tile detail and miniatures is 1 plus the blend times its change at 100%. Terrain, sea, ice, lines and placed things all use the same blend in the same frame, so nothing slides against the land.
- **Timing.** The blend follows the slider like a critically damped spring: it starts and ends gently, never overshoots, and a jump from 0% to 100% settles in about 1 second. With "reduce motion" set in the operating system it settles in about 0.25 seconds. Moving the slider again during a morph, or dragging it, changes the target without a jump, so the globe follows the hand smoothly.
- **Camera.** The camera keeps the same true point in the middle of the screen and the same height above the ground, so the region in view grows or shrinks around that point. A fly-to that runs during a morph keeps flying to its true target.
- **No flicker.** The morph moves the existing terrain in the vertex shader; tiles are not rebuilt and nothing is loaded for it. Tile detail follows the blended drawn size, and a finer tile is shown only once its mesh exists, as everywhere else.
- **Clocks and world.** The morph runs on the frame time of the screen, not on the clock of history, so it also plays while history is paused and never changes the clock. It changes only how the world is drawn, never the world.
- **Start.** When the app opens, the globe is drawn straight in the saved state, with no morph.

## 5. Settings and tests

- The strength is kept with the other settings in local storage as a whole percentage from 0 to 200 ([spec.md](spec.md#76-what-is-saved) section 7.6, [milestone-1.md](milestone-1.md#82-settings) section 8.2). It is 100% by default on both desktop and phone. A saved value from the earlier on/off setting is read as 100% for on and 0% for off. Whether the hint of section 1 was closed is saved with it.
- Golden snapshot tests of the world query need no change, because the world is computed in true coordinates. Browser screenshot tests run with the lens at its fixed 120%. A test also checks that turning a true point into a drawn one and back gives the same point to within 1 km, at 100% and at 200%.
- The extra cost is four texture lookups per terrain vertex and one grid lookup per placed object. That must fit the frame budgets in [spec.md section 9](spec.md#9-architecture).

## 6. Considered and left out

- **A lens that follows the camera** (a magnifying glass around the centre of the screen): shapes would wobble as the globe turns, and the globe view as a whole would still be dominated by oceans.
- **A warp that changes with the date**: coasts would drift during scrubbing (section 2).
- **Enlarging only the miniatures**: crowded regions would get more crowded, not roomier.
