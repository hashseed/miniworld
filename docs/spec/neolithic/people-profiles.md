# Neolithic people and culture profiles

The farmers and herders of the Neolithic: how they look, what they hold, what they do all day, which houses they live in and where and when each profile replaces the hunter profile of [peopling.md](../peopling.md) section 5.1. It extends the culture profiles of [milestone-2.md](../milestone-2.md) section 4 and the model set of section 13.3 there, and the camp life of [humankind.md](../humankind.md) section 8.1. Decisions marked **Proposed** are defaults chosen so work can start and are open for Yang to change; nothing here is approved until Yang approves the models.

Ten profiles are added, with a man, a woman and a child each, built by `buildPerson` in `assets/src/people.ts` on the shared skeleton, in the clay-toy cel-shaded style with an ink outline and flat colours that stand for real materials (linen is cream, hemp grey-tan, red ochre rust, Spondylus shell coral, indigo blue, jade green, turquoise, malachite green). Dioramas are not to scale (milestone 2 section 13.3), so every figure is built for a bold silhouette: no tattoo or body paint is drawn that is not attested by finds, and ornaments are single bead strings, rings and bangles.

## 1. Where and when each profile applies

The profile of a figure follows the culture area of its camp (peopling.md section 5.3). Every area below is a polygon of `data/curated/culture-areas.json` (a new entry per profile, placed before the hunter areas it cuts into, since the first area holding a point decides its culture), with one snapshot per spread step and a `source` on each. **The date a profile begins at a place is not stored here**: it is the date farming reaches that place, from `data/curated/farming.json` (the farming plan), which gives each farming region its onset and the dates of its spread into neighbouring regions. A snapshot of a profile's area starts at the `fromBP` of the matching farming region, and the hunter profile there ends on the same day (the figures change clothes in their lodging, peopling.md section 5.3). This file only says which farming regions each profile covers and what the region looks like.

| Profile | English / German | Farming regions of `farming.json` (**Proposed** ids) and the area | Replaces | Ends |
| --- | --- | --- | --- | --- |
| `pre-pottery-neolithic-levant` | Pre-Pottery Neolithic farmers of the Levant / Frühe Bauern der Levante (vorkeramisches Neolithikum) | `fertile-crescent` and its spread over the southern Levant, upper Mesopotamia and the Zagros foothills; where the Natufian area was, from the Sinai to the Euphrates | `natufian` | Does not end before the tree's end; the later Near East has its own plan |
| `anatolian-farmer` | Farmers of Anatolia / Bauern Anatoliens | The farming spread into central and western Anatolia (the Konya plain, the lakes, the Aegean coast); the fertile uplands, not the Pontic or Taurus mountains | `west-asia-hunter` | Does not end before the tree's end |
| `lbk-farmer` | Linear Pottery farmers of central Europe / Bandkeramik-Bauern | The farming spread over the Balkans and the loess lands of the Danube and Rhine basins (Hungary to the Paris basin); loess and river terraces only, not the high mountains or the northern plain | `ice-age-hunter` | Does not end before the tree's end |
| `indus-farmer` | Farmers of the Indus borderlands / Bauern am Indus | `south-asia-farming` (Mehrgarh) and its spread over Balochistan, the Indus plain and Gujarat | `coastal-asia-hunter`, `west-asia-hunter` | Does not end before the tree's end |
| `nile-neolithic` | Neolithic farmers and herders of the Nile / Bauern und Hirten am Nil | The farming spread to the Fayum, the Delta and the Nile valley of Upper Egypt (Merimde, Fayum A, Badari) | `african-stone-age` and `west-asia-hunter` along the Nile | Does not end before the tree's end; the Old Kingdom profile of milestone 2 is a later era and has its own area |
| `yellow-river-millet-farmer` | Millet farmers of the Yellow River / Hirsebauern am Gelben Fluss | `yellow-river` (Cishan, Peiligang) and its spread over the loess plateau and the North China plain (later Yangshao) | `east-asia-hunter` | Does not end before the tree's end |
| `yangtze-rice-farmer` | Rice farmers of the Yangtze / Reisbauern am Jangtse | `yangtze` (Shangshan, later Hemudu and Majiabang) and its spread over the Yangtze basin and the south-eastern coast | `coastal-asia-hunter`, `east-asia-hunter` | Does not end before the tree's end |
| `mesoamerican-farmer` | Maize farmers of Mesoamerica / Maisbauern Mesoamerikas | `mesoamerica` (Oaxaca, Tehuacán) and its spread over the highlands and Gulf and Pacific lowlands of Mexico and Guatemala | `first-americans` | Does not end before the tree's end |
| `andean-farmer` | Farmers and herders of the Andes / Bauern und Hirten der Anden | `andes` (Ñanchoc, the Peruvian coast and valleys) and its spread over the coast, the highlands and the altiplano; llama and alpaca herding in the high puna | `first-americans` | Does not end before the tree's end |
| `new-guinea-highland-farmer` | Highland gardeners of New Guinea / Gartenbauern im Hochland Neuguineas | `new-guinea` (Kuk Swamp) and the Wahgi valley and neighbouring highland valleys above about 1,200 m | `first-australians` (the New Guinea highlands) | Does not end before the tree's end |

- **Limits (peopling.md section 5.2).** `coldestC` 0 °C for the lowland and subtropical profiles; −5 °C for `lbk-farmer` and `yellow-river-millet-farmer`; and `highestM` 4,800 m for `andean-farmer` (potatoes and herds up to the puna), 3,500 m for the rest. A farming region the data does not let people live in stays with the hunter profile.
- **Between hunter and farmer.** Land inside a farming region before its onset keeps its hunter profile; land the farming spread never reached keeps it for good. The farming plan decides spread dates (**Proposed** lag of at most 300 years per 100 km of spread, owned by `farming.json`).
- **Order of work.** The profile ids exist in `app/src/world/cultures.ts` and their records in `app/src/world/neolithicProfiles.ts` now, so the models are drawn and reviewed; the polygons are added to `culture-areas.json` once `farming.json` exists, so nothing draws these profiles on the globe before the plan does.

## 2. What each profile wears and holds

Clothing follows finds where they exist and the nearest evidence where they do not. Textile finds are rare, so the table says what is attested (A) and what is drawn from analogy (An). Skin and hair are picked per figure by hash from the range, as for all profiles; the ranges follow ancient DNA (Mathieson et al. 2015, *Nature* 528; Olalde et al. 2014, *Nature* 507: early farmers of Anatolia and central Europe were mostly dark-haired with intermediate skin) and are never so dark that the clay shading of the face is lost (milestone 2 section 13.3).

| Profile | Clothing and ornament | Hair | Tools in hand (man / woman / child) | Evidence |
| --- | --- | --- | --- | --- |
| `pre-pottery-neolithic-levant` | Tunics and kilts of linen-coloured plant fibre, hide aprons for children, a white headband (no bead string: the triangle budget of 1,100) | Dark | Sickle / quern (`grinding-stone`) / basket | Twined and netted flax and other plant-fibre textiles, cord and baskets at Nahal Hemar cave (Bar-Yosef and Alon 1988, *'Atiqot* 18) (A); flint-bladed sickles and querns in every PPNA/PPNB village, Jericho and Abu Hureyra (A); shell beads from the Mediterranean and Red Sea in the burials (A, not drawn) |
| `anatolian-farmer` | Hide and woven plant-fibre kilts for men, wrapped cloth and skirts for women, children in short hide aprons; red ochre lines on the chest and arms, stone and clay bead strings | Black to dark brown, women's hair in a bun on some | Hoe / pot / basket | Red ochre in Çatalhöyük burials and on its wall paintings, which also show people in leopard skins (ritual dress, not drawn) (Hodder 2006, *The Leopard's Tale*); plant-fibre and woven textile remains and bone awls and needles; clay and stone beads (A); the first pots there from about 6500 BCE (A) |
| `lbk-farmer` | Linen tunics for men and children, a linen shawl over a skirt for women, leg wraps for men, kilts for children, a coral Spondylus shell bangle and bead string for women | Dark brown, women in a bun on some | Hoe (the "shoe-last adze", Schuhleistenkeil) / pot (dark, decorated with incised bands) / basket | Flax grown and linen and bast fibre processed in the Linearbandkeramik (Kreuz et al. 2005); Spondylus shell, brought from the Aegean, in graves as belt buckles, beads and bangles (Windler et al. 2013); shoe-last adzes as hoes and Linear Pottery with incised ribbons (Bogucki 1988, *Forest Farmers and Stockherders*) (A) |
| `indus-farmer` | Cream wraps of plant fibre or cotton and hide: kilts for men, wrapped skirts for women, aprons for children; turquoise beads, white shell bangles for women | Black, women's in a long plait | Sickle / quern / basket | Cotton fibre preserved in a copper bead from Mehrgarh (Moulherat et al. 2002, *Journal of Archaeological Science* 29) (A); flint blades set in bitumen for sickles, querns, and burials with turquoise and lapis beads and shell bangles at Mehrgarh (Jarrige et al. 1995) (A) |
| `nile-neolithic` | Linen kilts for men, wrapped linen skirts for women, hide aprons for children, ivory bangles and green malachite beads | Black, short, with a bone or ivory comb in the hair on some (no wig: the wigs of the Old Kingdom profile are a later fashion) | Sickle / pot (black-topped) / basket | Linen cloth and coiled baskets of the Fayum (Caton-Thompson and Gardner 1934, *The Desert Fayum*); ivory combs and bangles, malachite beads and black-topped pottery of the Badarian culture (Brunton and Caton-Thompson 1928) (A) |
| `yellow-river-millet-farmer` | Hemp-coloured tunics (a shawl for women) with a hide kilt or skirt, a hair bun on every grown-up, white bone and stone bead strings; the clay pot is red, with a painted dark band in the Yangshao style | Black, tied up in a bun with a bone pin | Hoe (stone spade) / pot (red, painted) / basket | Hemp cloth impressions on the bases of Yangshao pots (Chang 1986, *The Archaeology of Ancient China*); bone hairpins, bone needles and spindle whorls (A); silk is not drawn before about 3500 BCE (Gong et al. 2016, *Journal of Archaeological Science*; later profile) |
| `yangtze-rice-farmer` | Light ramie and hemp-coloured wraps, skirts and kilts, bare shoulders in the wet heat, green jade bangle and slit-ring ornaments | Black, short or in a bun | Hoe (bone spade) / pot (dark, plant-tempered) / basket | Bone spades made from buffalo shoulder blades, wooden paddles, spindle whorls and loom parts at Hemudu (Zhejiang Provincial Institute 2003); jade slit rings and bangles from about 5000 BCE (A); rice at Shangshan (Zuo et al. 2017, *PNAS* 114) |
| `mesoamerican-farmer` | Breechclouts of agave and cotton cloth for men and boys, wrapped skirts for women, jade-green bead strings | Black and straight, long on women | Digging stick (the coa) / quern (metate) / basket | Maize and squash at Guilá Naquitz (Smith 1997, *Science* 276); grinding stones (metate and mano) in every Early Formative village; Formative figurines show breechclouts, wrapped skirts and headbands (An); greenstone beads (A) |
| `andean-farmer` | Cotton tunics for men and women in natural cream and brown, indigo-blue trim and headband, short kilts and skirts, white bead strings | Black, long, in a band | Hoe / basket / basket (llama herders carry a crook) | Twined cotton textiles dyed with indigo, about 6,000 years old, from Huaca Prieta (Splitstoser et al. 2016, *Science Advances* 2); cotton, squash and peanut in the Ñanchoc valley (Dillehay et al. 2007, *Science* 316); cotton cloth at Caral (Shady et al. 2001, *Science* 292) (A) |
| `new-guinea-highland-farmer` | Bark-cloth and fibre aprons and skirts, bare chests, a leaf-green fibre headband, a white shell bead string; women carry a net bag (the `basket` tool, a woven carrying bag) | Dark, short and tightly curled | Digging stick / basket (net bag) / none | Mounded gardens, drainage ditches and wooden digging stick marks at Kuk Swamp (Denham et al. 2003, *Science* 301; Golson et al. 2017, *Ten Thousand Years of Cultivation at Kuk Swamp*) (A); no cloth survives, so the clothes follow the highland peoples recorded in the 20th century (An); no body paint or feather dress is drawn, because none is dated to the Neolithic |

- **No tattoos.** The only well-attested tattoos of the period (the Iceman, Ötzi, about 3300 BCE, Alps) belong to a later culture and place. **Body paint** is drawn only for red ochre at Çatalhöyük (a pair of chest lines and an arm band, the `ochre` look of milestone 2 section 4).
- **Metal.** Copper ornaments start in the Near East from about 7000 BCE (Çayönü) and spread later; the profiles here draw none. A copper-age variant by date is a later step (peopling.md section 5.3, tools that arrive later).
- **Sun, snow and mud.** No boots except where the profile needs them: `lbk-farmer` and `yellow-river-millet-farmer` do not have them either, since the evidence of footwear before 3000 BCE is thin (Ötzi's shoes are later).
- **Skin.** `pre-pottery-neolithic-levant` and `indus-farmer` warm mid browns; `anatolian-farmer` and `yellow-river-millet-farmer` and `yangtze-rice-farmer` warm light to mid browns; `lbk-farmer` light to mid (the lightest range of the set, since light skin alleles were already common in early farmers: Mathieson et al. 2015); `nile-neolithic` mid to dark browns; `mesoamerican-farmer` and `andean-farmer` mid browns; `new-guinea-highland-farmer` mid to dark browns (features still visible).

## 3. The tool and held-item vocabulary

A person holds one tool in the right hand (the `tool` bone, hidden by the clips that need the hand). The tool ids of `assets/src/people.ts` and the prop each stands for in the asset manifest:

| Tool id | Prop | Shape and material | Held by |
| --- | --- | --- | --- |
| `sickle` (exists) | `prop-sickle` | Curved bone or wooden handle with flint blades set in it | Reaping: farmers of the Levant, the Indus, the Nile |
| `hoe` (new) | `prop-hoe` | Wooden haft with a stone, shoe-last adze or bone blade lashed on at a right angle | Hoeing: farmers of Europe, China and the Andes |
| `digging-stick` (exists) | `prop-digging-stick` | Pointed wooden stick with a stone weight | Planting: farmers of Mesoamerica and New Guinea |
| `ard` (new) | `prop-ard` | A short beam, handle and wooden share, drawn behind a draught animal, held by its handle | Ploughing, from the date below |
| `grinding-stone` (exists) | `prop-quern` | The saddle quern or metate with its hand stone; the spec's `prop-quern` is this tool | Grinding grain and maize |
| `basket` (exists) | `prop-basket` | Coiled or twined basket; in New Guinea a net bag | Gathering, carrying |
| `pot` (new) | `prop-pot` | A round-bellied clay pot held at the hip; the colour of clay and of the painted band come from the profile | Fetching water, cooking, storing; the potter |
| `crook` (new) | `prop-crook` | A herder's stick with a curved top | Herding: sheep, goats, cattle and llamas |
| `spindle` (new) | `prop-spindle` | A spindle with a clay or stone whorl and a ball of thread | Weaving, spinning |

- **Ard by date (Proposed).** The ard is part of the profile's variants by date (peopling.md section 5.3): the farmer's tool becomes the `ard` in `anatolian-farmer` from about 4500 BCE, `lbk-farmer` from about 4000 BCE, `nile-neolithic` from about 3500 BCE and `indus-farmer` from about 3500 BCE (Sherratt 1981, the secondary-products revolution; furrowed field at Kalibangan, Early Harappan). The other profiles have no ard here, because their farming used the hoe or digging stick.
- **Pots** are held at the hip by the hand; the first pots appear c. 7000 BCE in the Levant, 6500 BCE in Anatolia, 5500 BCE in Europe and 6000 BCE in China (earlier pots of `east-asia-hunter` exist, peopling.md section 5.1). `pre-pottery-neolithic-levant` has none.
- **No bundle changes.** The carried load stays the hide-wrapped bundle (milestone 2 section 13.3), with a farm variant (a sheaf of grain) left to the camp-life plan.

## 4. Roles and the activity mix

The role vocabulary is in `vocab/roles.yaml` (milestone 2 section 11), where each role has its English and German noun (the German in the feminine and masculine form), its cast rules (`man`: always a man; `tool`: the tool held instead of the profile's own) and its card sentence per profile. The hunter-gatherer camp of humankind.md section 8.1 already has the activities **hunting, gathering, firewood, water, scraping hides, nut-cracking, making a spear, cooking, fishing, skinning** and the roles that do them (hunter, gatherer, fisher, toolmaker). This section adds the roles of the farmer's day, each with the tool it holds:

| Role id | English / German | Holds | Does (camp-life activity, in the camp-life turn of about 17 seconds) |
| --- | --- | --- | --- |
| `farmer` | Farmer / Bauer, Bäuerin | The profile's field tool (`hoe`, `digging-stick` or, by date, `ard`) | Tilling: walks out to the fields at the edge of the camp, works (`work`) for about 3 seconds, walks back; sowing and weeding the same way |
| `reaper` | Reaper / Schnitter, Schnitterin | `sickle` | Harvest: cuts a sheaf (`work`) at the field for about 2.5 seconds and carries it to the camp (`carry`) |
| `herder` | Herder / Hirte, Hirtin | `crook` | Walks to the pen or pasture at the edge of the camp with the herd animals, stands and watches (`idle`) and walks back with them; only in a profile with herd animals |
| `potter` | Potter / Töpfer, Töpferin | `pot` | Sits by the hearth shaping a pot (`work`) for about 4 seconds, then carries it to the fire |
| `weaver` | Weaver / Weber, Weberin | `spindle` | Sits and spins or weaves (`work`) for about 4 seconds |
| `builder` | Builder / Bauarbeiter, Bauarbeiterin | none | Carries a mud brick, a bundle of reed or a pole (`carry`) to the lodging and works at it (`work`); also the builders of humankind.md section 8.1, who raise a lodging together |
| `grinder` | Grinder / Müller, Müllerin | `grinding-stone` | Kneels at the quern and grinds grain (`work`) for about 4 seconds |
| `hunter`, `gatherer`, `fisher`, `toolmaker` | As before | As before | As before, in the shares below |

- **The mix.** Each profile gives the share of its grown-up figures doing each role (**Proposed**; the sum is 100). Children gather and play as before; the mix decides what grown-ups do in their next turn, the way a hash picks the activity (humankind.md section 8.1). Any role may be held by a woman or a man (milestone 2 section 4); the shares are not split by sex, and the cards never assume it.
- **Records.** The mix and the rest of each profile live in `app/src/world/neolithicProfiles.ts` (`NEOLITHIC_PROFILES`), one record per profile: its labels, its architecture set, its tools by kind, its roles with their shares, its animals and its farming region ids. A test checks that the shares sum to 100, that every role is in the vocabulary above, that every tool is a known tool and every architecture id a shelter of the model set.

| Profile | farmer | reaper | herder | potter | weaver | builder | grinder | hunter | gatherer | fisher | toolmaker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pre-pottery-neolithic-levant` | 20 | 12 | 10 | 0 | 6 | 12 | 14 | 12 | 8 | 0 | 6 |
| `anatolian-farmer` | 20 | 10 | 12 | 8 | 8 | 12 | 10 | 8 | 6 | 0 | 6 |
| `lbk-farmer` | 22 | 10 | 14 | 10 | 8 | 12 | 8 | 6 | 6 | 0 | 4 |
| `indus-farmer` | 18 | 12 | 16 | 8 | 8 | 10 | 10 | 6 | 6 | 0 | 6 |
| `nile-neolithic` | 18 | 10 | 14 | 8 | 10 | 8 | 8 | 6 | 6 | 10 | 2 |
| `yellow-river-millet-farmer` | 22 | 10 | 8 | 10 | 8 | 12 | 10 | 8 | 6 | 2 | 4 |
| `yangtze-rice-farmer` | 22 | 12 | 4 | 8 | 8 | 12 | 8 | 6 | 6 | 12 | 2 |
| `mesoamerican-farmer` | 26 | 8 | 0 | 6 | 8 | 10 | 16 | 10 | 10 | 0 | 6 |
| `andean-farmer` | 22 | 8 | 16 | 0 | 14 | 10 | 6 | 6 | 8 | 6 | 4 |
| `new-guinea-highland-farmer` | 34 | 6 | 0 | 0 | 6 | 12 | 4 | 12 | 16 | 0 | 10 |

The reasons are in the evidence of section 2: pottery is rare in the Andean and New Guinea highland records of this period and the Levantine profile precedes pots, so those potters are 0; herding is absent in Mesoamerica and New Guinea before the pig and the dog (the dog is a pet, not a herd), and small in the Yangtze lands, where the water buffalo comes late; the Andean mix has the most weavers because cotton and camelid fibre are the main craft there; the Nile and Yangtze profiles keep fishers.

## 5. The architecture set

The shelters are built by the shelter models of other plans; this section only names them (ids not yet in the model set are listed in the hand-over notes, not built here). Each profile's set is its camp lodging kinds; the first is the one `CAMP_SHELTER` (assets/src/shelters.ts) gives the profile once the model exists.

| Profile | Architecture set (**Proposed** order) | Fallback until the shelter is approved |
| --- | --- | --- |
| `pre-pottery-neolithic-levant` | `shelter-pre-pottery-levant-house`, `shelter-natufian-house` | `shelter-natufian-house` |
| `anatolian-farmer` | `shelter-anatolian-house` | `shelter-natufian-house` |
| `lbk-farmer` | `shelter-lbk-longhouse` | `shelter-small-hut` |
| `indus-farmer` | `shelter-mehrgarh-house` | `shelter-natufian-house` |
| `nile-neolithic` | `shelter-egyptian-neolithic-hut` | `shelter-grass-hut` |
| `yellow-river-millet-farmer` | `shelter-yellow-river-pit-house` | `shelter-natufian-house` |
| `yangtze-rice-farmer` | `shelter-yangtze-stilt-house` | `shelter-grass-hut` |
| `mesoamerican-farmer` | `shelter-mesoamerican-hut` | `shelter-grass-hut` |
| `andean-farmer` | `shelter-andean-stone-house` | `shelter-small-hut` |
| `new-guinea-highland-farmer` | `shelter-highland-new-guinea-house` | `shelter-grass-hut` |

Until a shelter is approved, the drawn camp uses the fallback (the production build already stands in for an unapproved model, milestone 2 section 13.2). The larger lodgings, the Linear Pottery longhouse (up to 30 m), are drawn at most 2.7 m across like all lodgings (humankind.md section 8.1).

## 6. Animals and what the profile hunts or herds

Hunting stays a share of the mix (section 4); the prey of each profile is listed in `PREY_OF` of `app/src/world/treeScene.ts` once the camp-life plan uses the profiles. The domestic animals each profile keeps (a herder's flock stands at the camp's edge, one to three animals by hash):

| Profile | Herd animals (asset ids; those not built yet are in the domestic animal specs) |
| --- | --- |
| `pre-pottery-neolithic-levant`, `anatolian-farmer` | goat, sheep, later cattle (`animal-aurochs` is the wild form), dog |
| `lbk-farmer` | cattle, sheep, goat, pig, dog |
| `indus-farmer` | `animal-zebu`, goat, sheep, dog |
| `nile-neolithic` | cattle, goat, sheep, pig, dog |
| `yellow-river-millet-farmer` | pig, dog, later sheep and cattle |
| `yangtze-rice-farmer` | pig, dog, `animal-water-buffalo` (later) |
| `mesoamerican-farmer` | dog, turkey (later) |
| `andean-farmer` | `animal-llama`, `animal-guinea-pig`, dog |
| `new-guinea-highland-farmer` | dog; the pig arrives later and is not shown |

## 7. Tests and review

- The people tests of `assets/src/models.test.ts` run on every profile of `PROFILES` (the same every time, within 1,100 triangles with the bundle, standing on the ground at a believable height) and the asset manifest test requires an entry for each figure model.
- A cultures test (`app/src/world/neolithicProfiles.test.ts`) checks the records of section 4: the sums, the role and tool vocabularies, the architecture ids.
- Every model is listed in `data/assets/manifest.json` with status `generated` and is shown on the review sheets (`npm run asset-sheets`) for Yang; none is approved by this plan.
