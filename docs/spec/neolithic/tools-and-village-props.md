# Neolithic hand tools and village props

Part of the Neolithic model set (milestone 2 section 13.3). Every model is a modelling script, `assets/src/neolithicTools.ts`, and is registered in `SHELTERS` (shelters.ts) so it gets the same review sheet, test and manifest entry as the other props. All are life size in metres, built from the kit's rounded primitives, cel-shaded with the ink outline on the model. Each prop is at most 600 triangles (the shelter test allows 1,000; this set stays lower). Status of every id: `generated`, waiting for Yang's review.

**Colours read as real materials** (Yang, 2026-10-23: a dark sign was rejected): wood is oak, a light warm brown (`#c9a064`, shaded a little darker for hafts and beams); fired clay is terracotta (`#c4683f`) and Yangshao ware buff (`#e2c28f`); straw and thatch golden (`#cdb26a` to `#dcbf6a`); stone grey; flint a cooler grey; leather and lashings tan (`#b98550`); unfired clay a pale earth brown. Nothing is near-black except fire mouths, pit hollows and doorways.

**Orientation.** Everything faces +Z (the working side or door). Held tools stand on y = 0 in the pose in which they are held at rest. Each model's `object.userData.holds` lists named points in model metres, so a later agent can attach a hand bone to the right place without reading the geometry: `grip` is the main hand, `grip2` the other hand, `hitch` where a draught animal's pull enters, `carry` where a bearer's body meets the thing. Moving parts have their own bone (`lid`, `gate`, `rest`) with the pivot at the hinge.

## Held tools

| Id | What it is | Size | Evidence | Use |
| --- | --- | --- | --- | --- |
| `prop-sickle` | Curved oak haft with a row of flint blades set in a groove and held with resin | 0.5 m | Natufian sickles with flint blades in bone or wood hafts, Levant, from c. 12,000 BCE (Ain Mallaha, Nahal Oren); in use across the early farming world | Grip at the handle (`grip`), blade forward (+Z) and low: the reaper bends, gathers a handful of stalks in the other hand and draws the blade back through them |
| `prop-digging-stick` | Pointed, fire-hardened oak stick with a bored stone weight | 1.2 m | Digging sticks with bored stone weights from Kuk (New Guinea, c. 5000 BCE), Çatalhöyük and Africa; used by foragers and first farmers to sow in holes | Tip down; `grip` high, `grip2` below it. Thrust into the soil with a foot on the stone-weighted stick, lever, drop in seed |
| `prop-hoe` | Crooked oak haft with a polished stone adze blade lashed on | 1.0 m long, blade 0.25 m | Linearbandkeramik shoe-last adzes, central Europe, c. 5500 BCE, used as hoes; antler and stone hoes in the Near East and China | Two hands: `grip` at the top of the haft, `grip2` a third down. Raised over the shoulder, blade edge swung down towards the person (-Z) and pulled back through the soil |
| `prop-ard` | Scratch plough: oak share beam with a pointed share, a long draught beam and a stilt (handle) | 3.3 m long, handle 1.1 m high | Ard marks under barrows and ards from Walle (Germany), Lavagnone (Italy) and Bronocice (Poland), c. 3500 BCE; ploughing marks at Neolithic sites from c. 4000 BCE | Pulled along +Z by two cattle at `hitch` (the beam end, which the yoke's pole meets); the ploughman walks behind holding `grip` on the stilt and bears down to set the depth. Share tip sits at y = 0 and scratches a furrow. The bone `rest` is a forked prop that holds the beam end up when the ard stands alone; hide it when the ard is yoked |
| `prop-yoke` | Oak beam with two pairs of pegs and a centre lug with a leather lashing | 1.7 m wide | Neolithic yokes and yoke parts of the Alpine lake dwellings and Denmark (Walle, Hosdorf); depicted in Mesopotamia and Egypt later | Rests on its pegs here. In use it sits across the withers of two cattle: `neckL` and `neckR` (x = -0.42 and 0.42) are the gaps between the pegs where the necks go; `hitch` at the centre lug is where the ard's pole is lashed |
| `prop-quern` | Saddle quern: a long grey stone with a worn hollow, a hand stone (muller) on it, a pile of grain at the far end and flour at the near end | 0.5 x 0.85 m | Saddle querns from the Natufian (c. 12,000 BCE) and every early farming site; grinding was women's daily work and shows on skeletons | The grinder kneels at -Z, both hands on `grip` and `grip2` (the two ends of the hand stone, x = +-0.2), and pushes the hand stone along +Z for 0.3 m and back, pressing grain into flour. The hand stone is its own bone `muller` for that slide |

The flail is left out: threshing with a flail is not attested before the Iron Age; Neolithic grain was trodden out, beaten with plain sticks and winnowed in baskets.

## Containers and crafts

| Id | What it is | Size | Evidence | Use |
| --- | --- | --- | --- | --- |
| `prop-basket` | Woven basket of straw and cane, a darker rim and a leather strap | 0.5 m high, 0.55 m wide | Basketry survives at Nahal Hemar (c. 7000 BCE), Çayönü and the Alpine lake dwellings; baskets are older than pots | Carried on the back (`carry`: base against the spine, `strap` over the head, a tump-line across the brow) or balanced on the head (base at y = 0 on the crown). Also stands on the ground as storage |
| `prop-pot-small` | Hand-built bowl-jar, buff with red-on-buff painted bands and a black line | 0.28 m | Yangshao painted pottery, Yellow River, c. 5000 to 3000 BCE (Banpo) | Held in one hand at the rim (`grip`) or in two hands; set on the floor |
| `prop-pot-large` | Round-bellied storage jar with incised dark band lines and knob lugs | 0.55 m | Linearbandkeramik ("band ceramic"), Europe, c. 5500 BCE: incised bands and spirals | Two hands at the belly (`grip`, `grip2`); carried on the hip or head; rests on the ground |
| `prop-pot-jar` | Tall-necked terracotta jar with two loop handles and shell-impressed rows on the neck | 0.4 m | Cardial ware (Impressed ware), Mediterranean coasts, c. 6400 to 5500 BCE, impressed with cockle shells | One hand through a handle (`grip`), the other under the base (`grip2`); carries water |
| `prop-kiln` | Updraught pottery kiln: a clay dome over a firing chamber, a stoked fire mouth in front, a vent on top | 1.7 m wide, 1.3 m high | Updraught kilns from Yarim Tepe (Iraq, c. 6000 BCE), Banpo and Jiangzhai (China, c. 5000 BCE) | The potter squats at the fire mouth (`stoke`, at +Z) feeding wood; a pile of billets lies beside it. Smoke can rise from `vent` |

The three pots are variants of one builder, `buildPot`, so a later agent can add a fourth style by giving it a profile and a pattern.

## Storage and herding

| Id | What it is | Size | Evidence | Use |
| --- | --- | --- | --- | --- |
| `prop-granary` | Round granary of wattle on six posts topped with flat mouse stones, a golden thatched cone roof, a small door and a notched-log ladder | 2.2 m wide, 3.2 m high | Raised granaries from the Chinese Neolithic (Cishan, Peiligang), Near Eastern and Egyptian Neolithic clay and wattle bins; the stone on the post top keeps mice out (staddle stones are later but the principle is old) | The door is at +Z, 1.3 m up: people climb the ladder (`ladder` foot at +Z) with baskets of grain (`door`) |
| `prop-silo-pit` | Clay-lined storage pit with a raised clay rim, grain showing inside, and a woven lid | 1.6 m across | Clay-lined storage pits at Neolithic sites from Jericho and Çatalhöyük to Cishan (hundreds of pits, 6000 BCE), sealed with lids and clay | The lid is bone `lid`, hinged at the rim edge (y = 0.14, z = -0.8); the model rests propped open about 70 degrees. Rotate it flat to close. Someone reaches in at `fill` |
| `prop-pen` | Wattle sheep pen: a ring of woven hurdle fence on stakes, 10 m across, with a gate | 10 m across, 1.1 m high | Wattle pens and folds for sheep, goats and cattle, from the Neolithic Near East and the Alpine and Funnel Beaker sites (Neolithic dung layers in caves and pens, Fumane and Franchthi) | Animals stand inside; the gate (bone `gate`, hinge at x = 1.0 on the +Z side) swings open outwards about 100 degrees. A herder stands at `gate` |
| `prop-well` | Oak-lined well: a square log-cabin curb above ground, a post with a crossbar and a leather bucket on a cord | 1.2 m wide, 2 m high | Wooden-lined wells of the Linearbandkeramik: Kuckhoven, Erkelenz (5090 BCE), Altscherbitz, Germany; wells are among the oldest oak structures | The drawer stands at +Z, `grip` at the cord; the bucket (bone `bucket`) hangs from the crossbar and can be lowered and drawn up |

## Review

`npm run asset-sheets` draws the set on the shelters sheet; for a closer look each prop has a single-model sheet (`sheet=single&id=<id>`) with a man for scale.
