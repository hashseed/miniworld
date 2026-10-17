# History lens

Most recorded history happened on a small share of the Earth's surface. Europe, the Nile valley, Mesopotamia, northern India and eastern China hold most of the events in the spec lists. Oceans, Siberia and the polar regions hold very few. On a true-scale globe the busy places are crowded and the empty ones take up most of the screen. The history lens enlarges the busy places and shrinks the empty ones a little, so that Europe and its neighbours have room for their towns, armies and markers.

The lens is on by default. It is a design only for now. Which milestone builds it will be decided in the milestone plan.

## 1. What the viewer sees

- The globe keeps all continents and coasts in the right order and connected. Busy regions are drawn larger and empty regions smaller, and the change is smooth, with no visible seams or edges.
- Shapes stay recognisable: Italy is still a boot and Britain still an island next to the continent. Size changes, but local shapes barely do (section 3).
- Everything sits in its real place relative to the land: a town on a river stays on that river, and a battle on a coast stays on that coast. All geography and all positions pass through the same warp, so nothing contradicts the data.
- Miniatures keep their usual size. An enlarged region gets more space between its towns, not bigger towns.
- A setting "Enlarge busy regions" ("Ereignisreiche Gegenden vergrößern") turns the lens on or off. A button "True sizes" ("Echte Größen") next to the globe controls switches it off in place for comparison. The globe eases between the two states over about one second.
- The first time the app starts, a short hint explains the stretched map in words a child can follow: "Places with a lot of history are drawn bigger. Tap True sizes to see the real sizes." ("Orte mit viel Geschichte sind größer gezeichnet. Tippe auf Echte Größen, um die echten Größen zu sehen.") The "Learn more" text of the hint explains that every map changes the shape of the Earth in some way.

## 2. How big

The lens is one fixed warp for the whole timeline and is not tied to the current date. If the warp changed with the date, coasts would drift as the viewer scrubs, and the viewer could not learn where things are. Europe is busy in every era after the ice age, so a single warp is enough.

The warp is computed from the coordinates of every event, war and battle in the spec lists (see [content-format.md](content-format.md#4-place) section 4), each counted once:

1. Event density is smoothed over the sphere with a Gaussian kernel of 600 km.
2. The target area factor of each spot is (density / mean density) to the power 0.3. The exponent keeps the contrast mild.
3. The factor is limited to between 0.6 and 3.0. It is then scaled so that the total area of the globe stays the same.

A first estimate from the 1,842 coordinates now in the spec, before the shape limit of section 3:

| Region | Area factor | Width factor (about) |
| --- | --- | --- |
| Europe | 3.0 | 1.7 |
| Nile valley and Egypt | 3.0 (capped from 4.3) | 1.7 |
| Eastern China | 3.0 (capped from 3.2) | 1.7 |
| Americas | 0.83 | 0.91 |
| Siberia | 0.82 | 0.91 |
| Open Pacific | 0.76 | 0.87 |

Only five regions have their own event lists for now, so the lens favours them. When lists for the Americas, Africa and other regions are added, the warp is computed again and those regions grow.

## 3. The warp

The warp is a smooth, one-to-one map of the sphere onto itself, from true positions to drawn positions. It is computed offline as a density-equalising cartogram on the sphere: a diffusion cartogram after Gastner and Newman (2004), adapted to the sphere so that it has no seam at the date line or the poles.

- **Limits.** The data build checks the warp. It must not fold anywhere, so it stays one-to-one. Its stretch in one direction must never be more than 1.3 times its stretch in the other direction, so shapes stay recognisable. If either check fails, the build lowers the exponent of section 2 step by step until both pass.
- **Storage.** The data build writes the warp as two grids of 2 degrees, one forward (true to drawn) and one inverse (drawn to true), quantised to 16 bits. Each grid is about 65 KB. Both ship with the startup index, because the first frame needs them. Values between grid points are interpolated bilinearly, which is accurate enough because the warp only changes over hundreds of kilometres.
- **Versioning.** The warp is a data build output with its own version. It changes only when the event lists change and the data is built again. A new warp moves where things are drawn, so before it ships the build renders a before-and-after preview of the globe for Yang to approve.

## 4. Rendering

The world query does not change. It computes everything in true coordinates, and the lens is applied only when the world is drawn. That keeps the world a pure function of the date and the life clock, with or without the lens.

- **Terrain.** Tiles keep their true coordinates, so streaming and caching do not change. The vertex shader moves each vertex to its drawn position by reading the forward grid as a texture. It also multiplies the elevation by the local width factor, so that mountains in enlarged regions keep their steepness and do not look flattened. Tile detail is chosen from the drawn size of a tile, so enlarged regions get finer tiles.
- **Lines.** Coasts, rivers, borders, routes and paths pass through the same warp. Long segments are first split into pieces of at most 50 km, so the lines bend with the land.
- **Things placed on the globe.** Settlements, landmarks, vignettes ([milestone-2.md](milestone-2.md#6-vignettes) section 6), event markers, labels and famous people are placed at the warped position of their anchor. A settlement's cluster of buildings, a vignette's stage and the routines of their figures are laid out around that point in drawn units at the usual miniature scale, so figures walk at their normal speed everywhere.
- **Camera and picking.** Fly-to goes to the warped anchor. A tap is turned back into a true position through the inverse grid, so cards, the region in view and the timeline lane all use true positions. The clock slowing as the camera zooms in uses the drawn height of the camera.
- **Switching.** When the lens is switched on or off, each drawn position moves along the arc between its true and its warped position over about one second, and the camera keeps the same true point in the middle of the screen.

## 5. Settings and tests

- The setting is kept with the other settings in local storage ([spec.md](spec.md#76-what-is-saved) section 7.6). It is on by default on both desktop and phone.
- Golden snapshot tests of the world query need no change, because the world is computed in true coordinates. Browser screenshot tests run with the lens both on and off. A test also checks that turning a true point into a drawn one and back gives the same point to within 1 km.
- The extra cost is one texture lookup per terrain vertex and one grid lookup per placed object. That must fit the frame budgets in [spec.md section 9](spec.md#9-architecture).

## 6. Considered and left out

- **A lens that follows the camera** (a magnifying glass around the centre of the screen): shapes would wobble as the globe turns, and the globe view as a whole would still be dominated by oceans.
- **A warp that changes with the date**: coasts would drift during scrubbing (section 2).
- **Enlarging only the miniatures**: crowded regions would get more crowded, not roomier.
