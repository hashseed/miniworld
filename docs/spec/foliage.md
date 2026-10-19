# Foliage

Without plants the globe looks empty. Foliage covers the land with a few big chunky clay trees and bushes that read from orbit as forests, savannas and taiga, with open ground between them for the people and stories of later milestones. Like the ground and the ice, foliage is a pure function of the date: it follows the climate data through the ice age, the Green Sahara and the drying of the deserts.

Status: approved by Yang on 2026-10-18 and built, apart from the parts marked **Proposed** or **Later**. Previews of a prototype on the real globe are in `/mnt/project-files/foliage/` in the project; the current ones, with few big trees, are in `foliage/v2-big-trees/`.

## 1. What the viewer sees

- From orbit, forests are rows of big rounded clay trees, savannas are scattered flat-topped trees on grass, the taiga is a dark band of conifers, and deserts, tundra, ice and high mountains are bare. The pattern of the world's vegetation zones is readable at a glance.
- **Few, big trees** (decided by Yang on 2026-10-18: "a lot larger and fewer"). Trees are not to scale, like the dioramas: each tree stands for a whole stretch of forest and is about 150 to 250 km across on the globe, so the Iberian peninsula has room for only about 15 trees, with open space between them for action. Trees keep this size at every zoom: there are no smaller trees close up, and close to the ground a single tree towers over the scene.
- **No seasons** (decided by Yang on 2026-10-18). Trees are always green and in leaf; there is no autumn colour, bare winter branch or snow on trees. Foliage changes only with the climate over centuries and millennia.
- Foliage follows the date. In the ice age, forests retreat south and the land north of them is open steppe and tundra; the Green Sahara (milestone 1, section 4.3) is a savanna with scattered trees from about 12,800 to 3000 BCE and then empties as it turns to sand; forests grow back over the land the ice sheets leave.
- In deserts, the banks of the big rivers are green with palms, so the Nile, the Euphrates and Tigris and the Indus stand out as green ribbons through the sand, as they did for the people who lived there.
- Trees never stand in the sea, on lakes and rivers, on ice, in deserts or above the tree line. When the sea rises over a coast or ice spreads over a forest, the trees there shrink away; when the land comes back, they grow back.

## 2. Data

Foliage needs no new source. It comes from data already in the repository:

| What | From |
| --- | --- |
| Which kind of vegetation, where and when | The BIOME4 biome class of Beyer, Krapp and Manica 2020 (CC BY 4.0), already kept in `data/sources/beyer-2020/biome.*`: 28 classes on a 0.5° grid at the same 38 time steps as the climate slices (milestone 1, section 4.1), 300 KB compressed |
| Green Sahara | The humid periods of `data/curated/humid-periods.json` (milestone 1, section 4.3): where they raise the precipitation over a desert, the biome becomes savanna |
| Sea, lakes, rivers, ice and height | The terrain tiles and climate slices the globe already draws |

**Foliage slices.** For each time step of the climate slices, the data build makes one small global foliage grid on the 0.5° grid of the biome data: per cell, the foliage class after the overrides below and the tree density (two bytes). Cells without biome data (the sea of the time, and south of 60°S) take the class of the nearest land within three cells, so coasts that the simplified map draws further out than the data still get trees. Each grid is its own small file, listed in the manifest beside the climate slices with the same days, and loaded the same way: the two slices around the date first, the rest in the background. The tree density is rounded to eighths and kept at 1 where no trees grow, so it compresses well. Size: about 21 KB per step after Brotli, about 800 KB for all 38.

**Overrides**, each a curated file with a source, like the Green Sahara:

- **Green Sahara and Green Arabia.** Where the humid periods raise the precipitation over a desert or dry-shrub class, the cell becomes humid savanna in proportion to the added rain (section 3).
- **Thinner trees in the ice age** (decided by Yang on 2026-10-18: "the ice sheet displaces trees, and trees diminish in unsuitable climate like desert or cold"). BIOME4 driven by a climate model puts dense taiga over much of ice-age Eurasia, while pollen records show mostly open steppe-tundra with small refuges of trees (Tarasov et al. 2000, Journal of Biogeography; Binney et al. 2017, Quaternary Science Reviews). Each cell therefore also gets a tree density from 0 to 1, the product of three factors from the data already in the build:
  - **Near the ice sheets:** trees fade out towards the ice, from full at 600 km from the ice border to none at the border (ice from PaleoMIST 1.0 at the date, distance measured on the 0.5° grid).
  - **Cold:** trees fade with the ice-age cooling, the annual mean temperature (Beyer 2020, BIO1) at the date minus today's at the same place, from full at 4 °C colder to none at 12 °C colder, because the downscaled model climate is too mild there; and with absolute cold, from full at −12 °C to none at −20 °C.
  - **Dry:** trees fade with the annual precipitation (BIO12, raised by the humid periods), from full at 250 mm to none at 100 mm (today's Siberian taiga grows on 200 to 350 mm).

  The density thins trees only: a slot whose tree the density removes holds a bush in one case out of four, so thinned forest reads as open steppe with scattered trees. Bushes, and today's world (where the cooling is zero), are hardly affected.

**Known simplifications**, named in the About panel: the biome data is the natural vegetation the climate allows, not the land people cleared. Forests cleared for fields and towns, such as most of Europe's forests by the Middle Ages, are not shown in this first version (section 8).

## 3. Tree kinds

Eight kinds of plant, each one generated clay model with a few variants of size and tint. Each biome class gives every placement slot (section 4) a chance to hold one kind or another, or nothing.

| Kind | Look | Biome classes and share of slots |
| --- | --- | --- |
| Rainforest tree | Tall trunk, wide puffy crown of several deep green balls | Tropical evergreen forest 100%; tropical semi-deciduous forest 85% (plus 10% broadleaf) |
| Broadleaf tree | Round lollipop crown of three balls, mid green | Temperate deciduous forest 90%; warm mixed forest 60%; cool mixed forest 45%; tropical deciduous woodland 45%; temperate broadleaved savanna 30%; cold mixed forest 20% |
| Conifer | Three stacked cones, dark blue-green | Temperate and cool conifer forest 90%; evergreen taiga 85%; deciduous taiga 70%; cold mixed forest 60%; cool mixed forest 45%; open conifer woodland 35%; boreal parkland 30%; warm mixed forest 25% |
| Acacia | Thin trunk, flat umbrella crown, olive green | Tropical savanna 30%; tropical deciduous woodland 15%; tropical xerophytic shrubland 12%; tropical grassland 5%; humid savanna (Green Sahara) up to 30% |
| Palm | Curved trunk with a tuft of fronds | Green river banks in deserts (section 4) 80% |
| Olive | Short trunk, flattened grey-green crown | Temperate sclerophyll woodland (Mediterranean) 40% |
| Cypress | Slim dark green column | Temperate sclerophyll woodland 12% |
| Bush | Two or three low balls | Xerophytic shrubland 18 to 22%; shrub tundra 22%; dwarf shrub tundra 10%; savannas 10%; humid savanna up to 15%; grassland and steppe tundra 3 to 4% |

Desert, barren land, the colder tundra classes and land ice have no plants. Shares are first values to be tuned on the previews.

## 4. Placement

- **One fixed grid of slots.** The land is divided into placement slots on the cube-sphere quadtree: each level-4 tile holds 8 × 8 slots, about 78 km apart on the true globe. With the true sizes, about one slot in eleven is used (the hash of the slot decides which), so plants stand about 260 km apart. Each used slot holds at most one plant, placed at a hashed spot inside its cell, with a crown about 0.94 times 260 km (1.1 until Yang asked on 2026-10-19 to make trees 15% smaller), varied from 0.6 to 1.4 times so that most plants are mid-sized and a few are much bigger. Trees are only a hint of how vegetation is spread and keep the globe from looking empty (Yang, 2026-10-18: "generally fewer trees"): a dense forest has a tree in nearly every used slot, an open savanna or a Mediterranean woodland has wide gaps, and the Iberian peninsula holds about 9 trees at the default lens strength.
- **More plants where the lens enlarges the land** (decided by Yang on 2026-10-18). Plants keep their drawn size whatever the history lens does. Where the lens enlarges the land by an area factor A, the share of used slots grows by A (up to all of them), so the drawn spacing of plants stays the same and enlarged regions get more plants, not bigger ones. Which slots are used is decided by their hash, so the plants are the same for every viewer at the same lens strength. As the lens strength changes, plants pop in and out; this is wanted (Yang, 2026-10-18). Each plant grows in or shrinks away smoothly as the share passes its slot's hash, and the plants of a date are placed once and only moved while the strength changes, so the slider never reloads or flickers them.
- **Deterministic.** Each slot's position within its cell, its plant kind roll, size, tint and turn come from a seeded hash of the slot's quadtree key, never from `Math.random`, so every viewer sees the same trees on the same date.
- **Date changes.** Moving the camera never adds or removes plants. When the date changes, between two foliage slices each slot switches from the old class to the new one at its own hashed moment, by shrinking and growing, and a tree that the rising sea, a lake, a river or the ice reaches shrinks away rather than disappearing. Growing and shrinking take a few years of the timeline each (decided by Yang on 2026-10-18; **Proposed** 5 years, about 12 seconds at regular speed), so a forest visibly grows in and dies back; both are pure functions of the date, so scrubbing shows the same tree at the same size.
- **Soft edges.** Classes are looked up with a small wobble of the position (seeded value noise of about half a cell), so forest edges are irregular curves rather than 0.5° steps.
- **Where plants never stand:** on the sea of the date, lakes and rivers (their fields above about 0.4), within 2.5 km of the coast (so no tree hangs over the beach), on ice (within 25 km of the ice border), and above the tree line, which runs at about 3,800 m in the tropics and falls by about 75 m per degree of latitude beyond 25°.
- **Green banks.** Where a drawn river crosses desert or dry shrubland (and no humid period makes it green), palms stand on both banks. The 260 km spacing is too coarse to follow a river, so each level-4 tile also has a finer grid of 12 × 12 palm slots (about 52 km apart); where one falls on a desert river bank (river field above about 0.03), it holds a palm with a share of 10% times the lens's area factor. Palms are as big as other trees (Yang, 2026-10-18: palms were much smaller than trees).
- **On the drawn ground.** Every plant stands on the ground exactly as the terrain draws it at the date (sea level, coastal rounding, lift and exaggeration), using the same height function as the terrain, and through the history lens like everything else. It sinks a little into the ground so it never floats on a slope.
- **Room for people.** From milestone 2, plants are left out where a camp, vignette or landmark stands, so dioramas are never buried in trees. **Felling** (decided by Yang on 2026-10-18): where a camp, lodging or field of the tree of humankind ([humankind.md](humankind.md#7-changes-to-the-rest-of-the-spec) section 7) is founded on a tree's spot, the tree does not shrink away but is felled: it tips over and is gone within half a year of the timeline, starting when the builders arrive, and grows back over the usual few years only once the place is abandoned. A vignette stage standing at the date keeps a clearing of about 800 km around it on the drawn globe for as long as it is shown (decided 2026-10-18, as the trees hid the mammoth hunt). A camp of the tree keeps a clearing of about 430 km (its ring of lodgings and a margin): felled trees tip over about their foot within about 1.2 seconds of watching after the band arrives, and once the camp has left they grow back from nothing over about 12 seconds ([humankind.md](humankind.md#81-drawing-a-camp) section 8.1).

## 5. Look

- Plants follow the toy-planet style of spec section 8: chunky rounded clay shapes made of a few balls and cones, flat cel-shaded colours in three bands lit like the terrain, with no outlines (decided by Yang on 2026-10-18).
- Colours are rich and saturated, like the ground: bright greens for broadleaf, deep greens for rainforest, blue-green for conifers, olive for acacia and grey-green for the Mediterranean trees. Each tree has a small hashed variation of size and shade so forests do not look stamped.
- Each model has up to about 400 triangles (crown balls with 80 faces each), since there are few trees and each is large on screen. A simpler far model (balls with 20 faces) may be added if the budget needs it.
- **Later:** trees may sway very gently on the clock, standing still while history is paused.

## 6. The ground under the plants

Trees are few and only hint at the vegetation. The ground itself carries the rest of it, so the globe looks alive without more polygons (Yang, 2026-10-18: "is there a way to add grass etc without adding polygons and regress performance? e.g. some sort of texture?"). Both parts are painted in the terrain's fragment shader and add no triangles.

- **Vegetation tint.** The ground painting of milestone 1 (section 4.3) is tinted from the same foliage slices as the trees, so ground and trees always agree. From the foliage class and tree density of each 0.5° cell, the app derives a ground colour and a strength, so thinned ice-age forest shows steppe-coloured ground: deep forest-floor green under rainforest and broadleaf forest, blue-green under conifers, fresh grass green on grassland and savanna, olive under Mediterranean woodland, ochre on steppe and dry shrubland, and pale grey-green on tundra. Deserts, bare rock and ice keep the colours they have. The tint is a small RGBA texture on the slice grid (720 × 300), made on the CPU once per foliage slice when it loads and blended between the two slices around the date like the climate slices. Until the foliage slices load (just after the first view) the ground keeps the milestone 1 colours. It replaces the steppe-under-taiga look and gives each biome its own ground.
- **Green banks.** Along desert rivers, a strip of about 15 km either side of the water (the whole land falloff of the river field) is painted as grass under the palms, strongest at the water and fading softly into the desert (Yang, 2026-10-18: "make it fade to the sides"), from the river field the shader already has, so the green ribbon of the Nile reads from orbit.
- **Painted grass.** On grassy and wooded ground the shader adds a soft painted pattern: small cel-shaded tufts and dapples, a little lighter and darker than the ground, from seeded value noise on the true position (deterministic, so the same for every viewer). Its scale is fixed on the globe, so it moves with the land, and it fades out with the screen-space footprint of a pattern cell (`fwidth`) before it gets smaller than about 4 pixels, so it never shimmers or flickers. From orbit only the tint shows; the tufts appear as the camera comes down. Tundra gets sparse low dots, steppe longer dry streaks, and deserts nothing.
- **Cost.** One extra texture lookup and a few noise evaluations per land pixel, about the cost of the existing coast and river shading, and no extra draw calls or triangles. The tint texture is rebuilt only when the date crosses a foliage slice.

## 7. Performance

With few, fixed trees, foliage is cheap. The terrain is also being simplified (Yang, 2026-10-18: a layered height map), so the whole globe stays at about 800,000 triangles or fewer on screen.

- Only the slots on the visible side of the globe are drawn; at most about 2,500 plants are in view, whatever the zoom.
- All plants are instanced: one draw call per kind, 8 draw calls in all.
- Placement runs once per level-4 tile and date step and is cached; the camera moving never recomputes it.
- Foliage starts loading only once the first view is ready (its foliage slices and the level-4 terrain tiles it places plants on, about 600 KB for a whole hemisphere), so it stays outside the first view's data budget (milestone 1, section 10.6) and the plants appear a moment after the globe.
- Proposed limit: 400,000 foliage triangles per frame (there is one fixed quality, milestone 1 section 11.2).

Measurements of the built foliage with the history lens on (headless Chromium, 1280 × 800, terrain as merged on 2026-10-18; the whole frame's triangles):

| View | Plants | Triangles in the frame |
| --- | --- | --- |
| Africa and Europe from orbit, 1 CE | 2,190 | 683,000 |
| Iberia from 3,000 km | 1,570 | 590,000 |
| Tilted view over the Nile from 1,200 km | 760 | 875,000 |
| Tilted view over the Alps from 1,500 km | 1,000 | 843,000 |

## 8. Later

- **Forests cleared by people.** From the milestone that brings farming (milestone 3), fields and settlements clear the plants around them, and large historical clearings (such as the forests of western and central Europe by about 1300 CE, or Easter Island) can be added as curated overrides with sources, so the world gets visibly more farmed through history.
- **Fields and crops** as their own plant kinds near settlements (wheat, rice paddies, maize), from the farming milestone.

## 9. Assets

The plant models are built in code from simple shapes (balls, cones and strips with flat colours) in `app/src/globe/foliageModels.ts`, like the prehistoric figures, and each kind is listed in `data/assets/manifest.json`. Yang approved the look from previews on 2026-10-18 ("commit this"), asking for arched palm fronds at the same triangle count, which were added.

## 10. Open questions

None at the moment.
