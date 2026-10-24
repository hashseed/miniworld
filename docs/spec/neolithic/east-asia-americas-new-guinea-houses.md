# Houses of the East Asian, American and New Guinea Neolithic

Part of the Neolithic model set. It adds five lodgings, shelters in the sense of [milestone-2.md](../milestone-2.md) section 13.3 and [humankind.md](../humankind.md) section 3.2: when a village of one of these cultures grows, a figure's `home` is one of these houses instead of a hut, and new people step out of its door. Every model is a script in `assets/src/eastAsiaAmericasHouses.ts`, built from the shared clay-toy kit (`assets/src/kit.ts`) at life size in metres, with its door facing +Z and its lowest point on y = 0 (a pit may sink at most 0.5 m below it). All stay within the shelter budget of 1,000 triangles. Status of all five: `generated`, waiting for Yang's review; nothing here is approved.

## 1. Look

- **Materials read as the real thing.** Oak-coloured wood is light warm brown (`#c9a064`, the colour of the event sign, never dark brown; Yang, 2026-10-23); thatch is golden (`#cdb26a` and lighter or darker batches of it); mudbrick, daub and loess are sandy (`#cdb48a`, `#c2a15f`); stone is grey (`STONE`). The doorway is the only dark colour.
- **Outline.** Solid blocks and roofs have normals pointing away from their middle, so the ink outline (back faces pushed out along their normals) closes on the model and never splits from it at an edge.
- **Not to scale in the world.** Like every diorama model (milestone-2.md section 13.3) the houses are drawn larger than life relative to the globe, but each is true to size against its own people: a door about 1.2 to 1.5 m high, a floor area of 3 to 8 m across.
- **Seen from afar.** Each has one strong silhouette: a pile-borne long gable, a low cone with a porch, an egg-shaped thatched loaf, a grey drum under a golden cone, a tall cone on posts.

## 2. The models

| Id | What it is | Size (W x D x H, m) | Culture profile (proposed, built by the people agent) |
| --- | --- | --- | --- |
| `shelter-yangtze-stilt-house` | Raised timber pile-dwelling with a thatched gable roof, a front veranda and a notched-log ladder | 5.1 x 8.0 x 4.5 (548 triangles) | `yangtze-rice-farmer` (Hemudu culture, rice wetlands of the lower Yangtze, c. 5500 to 3300 BCE) |
| `shelter-yellow-river-pit-house` | Round house sunk 0.3 m into the ground, a low earth bank round the rim, a conical thatch-and-daub roof, a small gabled porch over a stepped entrance | 6.3 x 7.6 x 3.6 (572) | `yellow-river-millet-farmer` (Peiligang and Cishan c. 7000 to 5000 BCE, Yangshao c. 5000 to 3000 BCE) |
| `shelter-mesoamerican-hut` | Oval pole house, walls of wattle and daub, a steep thatched roof | 3.9 x 5.6 x 3.6 (544) | `mesoamerican-farmer` (early village of Oaxaca, c. 1500 BCE) |
| `shelter-andean-stone-house` | Round dry-stone house with a slab-lintelled low door and a conical thatch roof | 5.1 x 5.1 x 3.5 (900) | `andean-farmer` (preceramic highland and northern Peru, c. 4000 to 2000 BCE) |
| `shelter-highland-new-guinea-house` | Round house on short posts, woven cane walls, a tall conical grass roof and a log step | 5.2 x 5.7 x 4.9 (488) | `new-guinea-highlander` (Kuk and the Wahgi valley, c. 5000 to 2000 BCE) |

The profile ids are proposals: the people profiles are specified elsewhere, and the lodging only has to be named by its profile's record.

### 2.1 `shelter-yangtze-stilt-house`

**Evidence.** At Hemudu (Yuyao, Zhejiang, c. 5500 to 3300 BCE) and the neighbouring Tianluoshan site (c. 5000 to 4500 BCE) the excavators found rows of wooden piles driven into waterlogged ground, with horizontal beams joined to them by mortise and tenon, one of the earliest known uses of the joint, floor planks, and the remains of long houses (the longest are about 23 m, with a deep front veranda), together with rice, water-buffalo and pig bones. The roofs were thatch. The wetland, wet soil and floods explain why the floor is lifted. Rice at Tianluoshan was being domesticated over this span (Fuller et al. 2009).

**Model.** Twelve oak piles in three rows hold two long bearers and crossbeams whose ends stand out past the piles (the tenons); the plank floor sits 1.25 m up. A wattle-and-plank box stands on the floor, and the big gable roof, ridge along the long axis, overhangs the front to roof a veranda on two posts. A notched log leans on the veranda. The door is a dark opening under the roof, facing +Z. Real Hemudu houses were longer; one bay of it is drawn so the model keeps a village-sized footprint.

### 2.2 `shelter-yellow-river-pit-house`

**Evidence.** The first millet farmers of the Yellow River basin lived in small semi-subterranean round or oval houses with a floor about 0.5 to 1 m below the ground, a ramp or steps down, a central hearth and a roof carried on posts and covered with thatch and clay: Peiligang (Henan, c. 7000 to 5000 BCE), Cishan (Hebei, c. 6500 to 5000 BCE), and, best known, Banpo near Xi'an (Yangshao, c. 4500 to 3750 BCE), whose 4 to 6 m round pit houses had a small gabled doorway hood over a stepped entry. The pit keeps the house warm in winter on the cold loess plateau.

**Model.** A bowl of packed loess earth with a bank round its rim; a low cone of thatch over it, drooping at the eaves, banded in two batches of straw, with a smoke vent on top; a small gabled porch over three earth steps that go down to a dark door. The floor of the pit is 0.3 m under the ground, so the model's lowest point is about y = -0.4 (the steps).

### 2.3 `shelter-mesoamerican-hut`

**Evidence.** The early villages of the Valley of Oaxaca, at San José Mogote and Tierras Largas (c. 1500 to 1150 BCE), had houses of upright poles with cane wattle plastered with clay daub, a floor of packed earth or lime, and a steep thatched roof, roughly 4 by 6 m with rounded ends, in rows round a yard with storage pits (Flannery ed. 1976; Marcus and Flannery 1996).

**Model.** An egg-shaped plan, the walls daubed sandy tan with the oak wattle poles showing where the plaster is bare and at the wall top where they rise into the roof; the roof is a golden hip of thatch that hangs past the wall as an eave, a ridge pole poking out at each end; the door is a dark opening in the short end facing +Z.

### 2.4 `shelter-andean-stone-house`

**Evidence.** The hunter-herders and first farmers of the highlands built round or oval houses on stone footings with dry-stone walls and a light roof of grass (ichu) on poles: Pachamachay and Telarmachay in the Junin puna (Rick 1980; Lavallee et al. 1985), Huaricoto in the Callejon de Huaylas (Burger and Salazar 1985, c. 2500 BCE) and the preceramic village phases of northern Peru (Dillehay et al. 2012 for the coast). The roof itself is never preserved; the cone is the usual reading of the post holes and the later ethnographic huts. Dates and sizes are approximate.

**Model.** A grey drum of fitted fieldstones about 1.3 m high with a slab lintel over a low doorway, topped with a golden cone of ichu grass.

### 2.5 `shelter-highland-new-guinea-house`

**Evidence.** At Kuk Swamp in the Wahgi valley the oldest drained and mounded gardens are about 7000 BCE, with deeper ditches and farming of taro, banana and sugar cane from about 4000 BCE (Golson 1977; Denham et al. 2003, *Science* 301). Post holes and stake holes of round structures stand beside the ditches. No house is preserved, so the model is inferred from the round, steep-roofed houses of the Highlands described later (Enga, Huli, Melpa). The raised floor is the ethnographically attested lifted floor kept dry above the damp soil of the drained garden village, and is the choice asked for by Yang; the evidence for it at Kuk is thin and should be marked uncertain in the people profile's source note.

**Model.** Six short posts raise a floor of split planks 0.5 m; the wall is a drum of woven cane (stripes painted by angle) one metre high; the roof is a tall, slightly concave cone of kunai grass with a bundled crown, reaching low over the wall; a log step leads to a dark door facing +Z.

## 3. Sources

- Zhejiang Provincial Institute of Cultural Relics and Archaeology, *Hemudu* (Cultural Relics Press, Beijing 2003).
- Liu Li and Chen Xingcan, *The Archaeology of China: From the Late Paleolithic to the Early Bronze Age* (Cambridge University Press 2012).
- Fuller, D. Q. et al. 2009, "The domestication process and domestication rate in rice", *Science* 323: 1607.
- Banpo Museum and the Institute of Archaeology, *Xi'an Banpo* (Cultural Relics Press 1963).
- Flannery, K. V. (ed.) 1976, *The Early Mesoamerican Village* (Academic Press); Marcus, J. and Flannery, K. V. 1996, *Zapotec Civilization* (Thames and Hudson).
- Rick, J. W. 1980, *Prehistoric Hunters of the High Andes* (Academic Press); Lavallee, D. et al. 1985, *Telarmachay: chasseurs et pasteurs prehistoriques des Andes* (Institut francais d'etudes andines).
- Burger, R. L. and Salazar, L. 1985, "The early ceremonial center of Huaricoto", in *Early Ceremonial Architecture in the Andes* (Dumbarton Oaks).
- Golson, J. 1977, "No room at the top", in *Sunda and Sahul* (Academic Press); Denham, T. P. et al. 2003, "Origins of agriculture at Kuk Swamp in the highlands of New Guinea", *Science* 301: 189.

## 4. Registration

The ids are in `SHELTERS` (`assets/src/shelters.ts`) and the manifest (`data/assets/manifest.json`) with status `generated`. The model test checks budget, ground contact and determinism, and the door faces +Z by construction; the sheets are `npm run asset-sheets` (shelters sheet and one single sheet per house).

**Scale.** Like the western houses, these are storybook-scaled by `assets/src/whimsy.ts`: small footprint (2 to 3 m), smaller base, larger roof; not life size (Yang, 2026-10-23).
