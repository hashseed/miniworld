# Foliage

Without plants the globe looks empty. Foliage covers the land with chunky clay trees and bushes that read from orbit as forests, savannas and taiga, and close up as single trees. Like the ground and the ice, foliage is a pure function of the date: it follows the climate data through the ice age, the Green Sahara and the drying of the deserts.

Status: **Proposed** (Yang asked for foliage on 2026-10-18). Everything here is a proposal until Yang approves it, apart from the decisions marked as Yang's. Previews of a prototype on the real globe are in `/mnt/project-files/foliage/` in the project.

## 1. What the viewer sees

- From orbit, forests are a carpet of small rounded clay trees, savannas are scattered flat-topped trees on grass, the taiga is a dark band of conifers, and deserts, tundra, ice and high mountains are bare. The pattern of the world's vegetation zones is readable at a glance.
- Trees are not to scale, like the dioramas: each tree stands for a whole stretch of forest. As the camera comes down, trees are replaced by more and smaller trees, so there are always about the same number on screen (section 4), until near the ground the trees reach their closest size and stay.
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

**Foliage slices.** For each time step of the climate slices, the data build makes one small global foliage grid on the 0.5° grid of the biome data: per cell, the foliage class after the overrides below (one byte). Cells without biome data (the sea of the time, and south of 60°S) take the class of the nearest land within three cells, so coasts that the simplified map draws further out than the data still get trees. The grid goes into the climate slice of the same step, so it loads and blends with the ice and the deserts and needs no requests of its own. Expected size: about 10 KB per step, under 400 KB for all 38.

**Overrides**, each a curated file with a source, like the Green Sahara:

- **Green Sahara and Green Arabia.** Where the humid periods raise the precipitation over a desert or dry-shrub class, the cell becomes humid savanna in proportion to the added rain (section 3).
- **Ice-age Europe** (Proposed). BIOME4 driven by a climate model puts dense taiga over Germany and France at the glacial maximum, while pollen records show mostly open steppe-tundra with small refuges of trees. Between 40°N and the ice sheet, west of the Urals, taiga and cold forest classes are thinned to open conifer woodland while the glacial index (milestone 1, section 5.2) is above 0.6. Sources to confirm before use: Tarasov et al. 2000 (Journal of Biogeography, last glacial maximum biomes of northern Eurasia from pollen) and Binney et al. 2017 (Quaternary Science Reviews, vegetation of Eurasia from the last glacial maximum).

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

- **Constant spacing on screen.** The land is divided into placement slots on the same cube-sphere quadtree as the terrain, but chosen separately from the terrain tiles: at every place the slot level is the one whose slots are about 14 CSS pixels apart on screen (per tier, section 7). Each slot holds at most one plant, sized to the slot (crown about as wide as the slot spacing, varied by ±20%), so a full forest closes into a canopy and an open savanna shows ground between its trees. Slots stop subdividing at level 12 (slots about 300 m apart on the true globe); closer than that, trees just get bigger on screen and switch to their detailed model.
- **Deterministic.** Each slot's position within its cell, its plant kind roll, size, tint and turn come from a seeded hash of the slot's quadtree key, never from `Math.random`, so every viewer sees the same trees on the same date.
- **No popping.** When the camera moves and the slot level changes, the trees of the old level shrink to nothing while the trees of the new level grow from nothing, over the band of distances between the two levels, so trees never appear or vanish in one frame. The same applies to the date: between two foliage slices each slot switches from the old class to the new one at its own hashed moment, by shrinking and growing, and a tree that the rising sea, a lake, a river or the ice reaches shrinks away rather than disappearing.
- **Soft edges.** Classes are looked up with a small wobble of the position (seeded value noise of about half a cell), so forest edges are irregular curves rather than 0.5° steps.
- **Where plants never stand:** on the sea of the date, lakes and rivers (their fields above about 0.4), within 2.5 km of the coast (so no tree hangs over the beach), on ice (within 25 km of the ice border), and above the tree line, which runs at about 3,800 m in the tropics and falls by about 75 m per degree of latitude beyond 25°.
- **Green banks.** Where a drawn river crosses desert or dry shrubland (and no humid period makes it green), the band just outside the water (river field between about 0.1 and 0.4) gets palms.
- **On the drawn ground.** Every plant stands on the ground exactly as the terrain draws it at the date (sea level, coastal rounding, lift and exaggeration), using the same height function as the terrain, and through the history lens like everything else. It sinks a little into the ground so it never floats on a slope.
- **Room for people.** From milestone 2, plants are left out where a camp, vignette or landmark stands, so dioramas are never buried in trees.

## 5. Look

- Plants follow the toy-planet style of spec section 8: chunky rounded clay shapes made of a few balls and cones, flat cel-shaded colours in three bands lit like the terrain, and dark ink outlines. In the prototype the outline is a slightly larger dark copy of the model drawn from behind, which reads well from orbit but doubles the triangles (section 7).
- Colours are rich and saturated, like the ground: bright greens for broadleaf, deep greens for rainforest, blue-green for conifers, olive for acacia and grey-green for the Mediterranean trees. Each tree has a small hashed variation of size and shade so forests do not look stamped.
- Each kind has two levels of detail: a far model of about 30 to 80 triangles (crown balls with 20 faces each) used for almost every view, and a near model of up to about 300 triangles used only near the ground.
- Trees sway very gently on the life clock, as one shared vertex animation, and stand still when everything is frozen; the low tier shows them still. (Proposed; can be dropped if it costs too much.)

## 6. The ground under the plants

The ground painting of milestone 1 (section 4.3) gets two changes from the same foliage classes, so ground and trees always agree:

- Under forest classes the ground turns to the darker forest-floor green, so the gaps between trees are not steppe-coloured. In the prototype the taiga stands on golden steppe ground, which looks wrong.
- Along desert rivers, a green strip of about 15 to 25 km either side of the water is painted as grass under the palms, so the green ribbon of the Nile reads from orbit; palms alone are too thin to see from there.

These touch the terrain shader, which belongs to the milestone 1 work; they are made together with that work.

## 7. Performance

The terrain is being simplified (Yang, 2026-10-18: a smoother height map with few height steps outside important mountains) partly to make room for foliage. The proposed budget keeps the whole globe at about 800,000 triangles or fewer on screen:

| | High | Medium | Low |
| --- | --- | --- | --- |
| Slot spacing on screen | 12 px | 14 px | 18 px |
| Foliage triangles per frame, at most | 300,000 | 200,000 | 120,000 |
| Detailed models within | 40 km | 25 km | 15 km |
| Outline | Model outline | Model outline | Ink drawn by the shader only |

- All plants are instanced: one draw call per kind and level of detail, and one per outline, at most about 32 draw calls.
- The number of plants on screen is set by the slot spacing, not by the zoom: a screen full of dense forest at 14 px spacing holds about 5,000 slots. Towards the horizon of a tilted view, slots grow to twice the spacing and then fade out, so a low view does not fill up with distant trees.
- Placement runs when a slot tile first comes into view and is cached; nothing is recomputed per frame except the grow and shrink factors in the vertex shader.

Prototype measurements (headless Chromium, 1280 × 800, about 14 px spacing, model outlines; terrain as merged on 2026-10-18):

| View | Plants | Foliage triangles | Terrain and the rest |
| --- | --- | --- | --- |
| Africa and Europe from orbit, 1 CE | 1,160 | 78,000 | 294,000 |
| Europe from 4,000 km | 1,910 | 122,000 | 542,000 |
| Siberian taiga from 2,500 km | 4,640 | 278,000 | 315,000 |
| Amazon from 3,500 km | 6,700 | 534,000 | 369,000 |
| Low tilted view over a German forest | 10,600 | 1,780,000 | 346,000 |

The overhead views fit the budget except the Amazon, where every slot holds a tree; the tilted view shows why the horizon rule above and a cheaper far rainforest model are needed. The prototype has neither yet.

## 8. Later

- **Forests cleared by people.** From the milestone that brings farming (milestone 3), fields and settlements clear the plants around them, and large historical clearings (such as the forests of western and central Europe by about 1300 CE, or Easter Island) can be added as curated overrides with sources, so the world gets visibly more farmed through history.
- **Fields and crops** as their own plant kinds near settlements (wheat, rice paddies, maize), from the farming milestone.

## 9. Assets

The tree models are generated assets: each kind is reviewed by Yang and only `approved` models ship (spec section 8). The prototype models in the previews are plain shapes made in code, for judging the overall look, density and colours only.

## 10. Questions for Yang

- Is the overall look right: tree size from orbit (about 14 px apart), density, and the dark outlines?
- Should foliage be built now, ahead of the rest of milestone 2, together with the terrain simplification? (Proposed: yes.)
- Ice-age Europe: thin the model's taiga to open woodland as section 2 proposes, or keep the data as it is?
