# Art Direction, Proportions & Visual QA

Canonical visual rules for Miniworld's clay toy-planet diorama style ([spec.md](spec.md), [milestone-2.md](milestone-2.md) section 13, [neolithic/houses-old-world-west.md](neolithic/houses-old-world-west.md), [neolithic/east-asia-americas-new-guinea-houses.md](neolithic/east-asia-americas-new-guinea-houses.md)).

## 1. Claymation Proportions & Canonical Scale

Every architectural and camp model uses **unified `1 model metre = 1 game metre`** (`1:1` against figure models):

| Element | Canonical Measure | Notes |
| --- | --- | --- |
| Reference adult human | `~1.70 m` standing (`~1.05 m` child) | `people.ts`, `FIGURE_M = 1.7`; villages and huts stand directly beside figures at `1:1` |
| Toy-planet scale | Constant world scale | Dioramas never rescale with zoom; zoom brings the globe closer/farther while keeping fixed miniature ratios (orbital decluttering uses altitude LOD, not zoom-dependent scaling) |
| Formal house doors | `0.75–0.90 m` wide × `1.10–1.50 m` tall | Doors face `+Z` towards the village green/hearth |
| Crouched hut / pit entries | `0.70–1.00 m` tall | Grass, hide, bark, Natufian, Egyptian reed, Yellow River pit entries |
| Shelter heights | `>= 1.85 m` peak | Exceptions: compact `shelter-grass-hut` (`1.35 m`) and `shelter-small-hut` (`1.0–1.1 m`) |
| Foundation plinth skirt | `PLINTH_DEPTH_M = 1.5 m` below `y = 0` | `assets/src/plinth.ts` attaches battered clay/stone skirts or extended stilt piles to `build-0` / `root` so downhill walls never hover on slopes; hidden only on flat-plate asset review sheets via `hidePlinth()` |
| Grounding policies | `upright-plinth`, `terrain-aligned`, `draped` | Shared pure math in `app/src/globe/grounding.ts` (`groundUprightPlinth`, `groundTerrainAligned` / `standOnGround`, `groundRingPlane`, `groundDraped`) |
| Geometry & outline rules | Closed smoothed/radial normals, non-indexed | `slab()`, `smooth()`, `ModelBuilder` welded `clayWobble()` keep backface-extruded `inkMaterial()` hulls closed; `ModelBuilder([], 0)` outputs non-indexed `(position, normal, color)` for `PosedBatches` |
| Triangle caps | Shelters/houses `<= 1,000`, caves `<= 2,400`, crops `<= 120` | Enforced in `assets/src/models.test.ts` |

## 2. Curated Regional Material Palette (`assets/src/palette.ts`)

All shared architectural and shelter hues live in `assets/src/palette.ts`, grouped cleanly by material role and darkened/lightened dynamically with `shade(colour, amount)`:

- **`TIMBER`**: `pole` (`#7a5030`), `oakWest` (`#b88a54`), `oakEast` (`#c9a064`), `bark` (`#7d6650`), `cane` (`#d9bb7c`), `lash` (`#8a5f38`), `firewoodDark` (`#5a3a22`), `firewoodLight` (`#6a4528`), `canoeHull` (`#9a6438`), `canoeRim` (`#d9b27a`).
- **`EARTH`**: `mud` (`#cdb184`), `brick` (`#c9a577`), `plaster` (`#e2d3ac`), `earth` (`#c3ab7c`), `daubWest` (`#d6bf92`), `daubEast` (`#cdb48a`), `loess` (`#c2a15f`), `reedBase` (`#b59a6a`), `natufianBase` (`#9a8463`), `ochre` (`#b5502f`), `burialEarth` (`#7a5a3c`), `burialOchre` (`#a3412a`), `burialShroud` (`#a88f68`).
- **`ROOF`**: `thatchGold` (`#d2b865`), `thatchStraw` (`#cdb26a`), `reed` (`#d6c27c`), `palmLeaf` (`#6f8a45`), `brushLeaf` (`#6f8a3c`), `burialStraw` (`#b9a766`).
- **`OPENING`**: `door` (`#3a2a20`), `grassDoor` (`#5b3b26`), `trench` (`#2b211a`), `canoeHollow` (`#3e2a1c`), `roastMeat` (`#8b3a26`).
- **`SHELTER` & accents**: `hide` (`#b58b5c`), `dryingHide` (`#c9a171`), `bone` (`#ece2cc`), `ivoryBead` (`#efe6d2`), `ivorySpear` (`#e9dfc6`), `rockDark` (`#8e877c`), `rockLight` (`#a39b8e`), `rockShadow` (`#857e72`), `flameOuter` (`#f08a2c`), `flameMid` (`#f6b23b`), `flameCore` (`#ffe08a`), `torchEmber` (`#ffd166`), `signSteel` (`#8e9aa6`), `signBlue` (`#3d86e6`), `signWhite` (`#f4f1e8`).
- **`PLINTH`**: Per-architecture soil/stone plinth colours (`levant`, `anatolia`, `lbk`, `mehrgarh`, `egypt`, `loess`, `mesoamerica`, `andeanStone`, `hide`, `boneHut`, `windbreak`, `leanTo`; stone/pile plinths share `andeanStone` or `TIMBER` shades).

**Rule:** New buildings and props import from `assets/src/palette.ts` instead of duplicating hex strings. Refactoring existing approved models into `palette.ts` must preserve exact RGB values and verified `geometryHash` locks in `data/assets/manifest.json`.

## 3. In-Context Visual QA Harness

Development review sheets in `assets/src/sheet.ts` and `assets/sheets.ts` (`http://localhost:8800/asset-sheet.html`) and global globe captures (`scripts/tour.ts`) deliver images directly to `/mnt/review/` (`D:\devenv\review\` on Windows):

- **`sheet=house-lineup`**: All 19 shelters and Neolithic houses at `1:1` game scale beside a `1.7 m` figure, with measured `W×D×H` dimensions.
- **`sheet=house-slopes`**: Representative buildings grounded upright via `groundUprightPlinth` math on an 18° hillside ramp with plinth skirts and stilt piles exposed.
- **`sheet=village-diorama&culture=<id>`**: A `3 × 3` matrix running real `treeScene()` layout (`villageHouse`, fields, crops, pen, herd, villagers, grain store) across **flat**, **15° slope**, and **coastal edge** clay pads photographed at **close**, **mid**, and **orbital** distances. Catches wrong facings, downhill hovers, water encroachment, and orbital contrast issues (`#177`) in one glance.
- **`npm run tour`**: Playwright script loading the built globe at 12 canonical prehistory & Neolithic bookmarks (`01-turkana-70k` through `12-andes-highland`) and compositing a labeled `4 × 3` contact sheet (`tour-contact-sheet.png`).

## 4. Developer Art & Placement Inspector (`?debug=1`)

Appending `?debug=1` to the app URL lazily loads `app/src/dev/debugInspector.ts` (never bundled into the normal critical path or shown to regular viewers; developer labels in English like `?sites` and `asset-sheet.html`):

- **3D globe overlays** (toggled independently, horizon-culled):
  - **Wildlife `48 × 48` land/sea masks** around the nearest active wildlife groups (`green` open, `red` blocked).
  - **Keep-out rings**: static camp/village keep-out zones (`orange`) and live `TreeLayer` obstacles (`yellow`).
  - **Village field masks**: `MASK_RINGS × MASK_SECTORS` polar masks showing `fieldLand` usable cells (`green`), `fieldShare` boundary exclusions (`blue`), and blocked/water/steep cells (`red`).
  - **House footprints**: oriented 4-corner outlines coloured by `classifyGrounding()` (`green` seated within plinth, `amber` relief > 75% of plinth depth, `red` hovering gap or over-buried).
  - **`?sites` layer toggle**: reuses `SitesLayer` camp lattice and migration links.
- **Live tuning & JSON diff export**: sliders adjust `cultures.json` (`houseM`) and `wildlife.json` (`drawnM`) non-destructively on the running globe and copy a minimal JSON diff patch (`Copy JSON diff`) for pasting back into `data/curated/`.
