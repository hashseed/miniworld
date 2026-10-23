# Domesticated animals of the other centres

Models for animals that people tamed outside the Fertile Crescent, for the Neolithic dioramas and the tree of humankind. They extend the model set of [milestone 2, section 13.3](../milestone-2.md) and the wild animals of [wildlife.md](../wildlife.md) section 6, and follow the same rules: built by a script in `assets/src/` from rounded primitives, life size in metres, facing +Z with the feet on y = 0, flat vertex colours, cel-shaded with an ink outline, at most 1,300 triangles, jointed legs on the shared four-legged body of `quadruped.ts`. Nothing is shown wounded. All five wait for Yang's review (status `generated` in `data/assets/manifest.json`); none is approved.

The script is `assets/src/domesticOtherAnimals.ts`; its ids are in `DOMESTIC_OTHER_ANIMALS` and joined to `ANIMALS` in `animals.ts`.

## 1. The models

Dioramas are not to scale (milestone 2 section 13.3): every model is built for a bold silhouette. Sizes below are the real animals' and the models are built at them.

| Id | Animal | Shoulder height | Where and when |
| --- | --- | --- | --- |
| `animal-dog` | Early domestic dog | about 0.55 m | Eurasia from about 14,000 BCE; first in every hunter-gatherer region |
| `animal-zebu` | Humped cattle (Bos indicus type) | about 1.2 m (hump about 1.5 m, horn tips 1.8 m) | Mehrgarh and the Indus valley, from about 7000 BCE |
| `animal-water-buffalo` | Swamp buffalo | about 1.2 m | Lower Yangtze and south China, from about 5000 to 4000 BCE |
| `animal-llama` | Llama | about 1.15 m (ear tips about 2.0 m) | Andes of Peru and Bolivia, from about 4000 BCE |
| `animal-guinea-pig` | Guinea pig (cavy) | about 0.12 m, 0.25 m long | Andes of Peru, Ecuador and Colombia, from about 5000 BCE |

### 1.1 Dog (`animal-dog`)

**Evidence.** The oldest undisputed dog burials are at Bonn-Oberkassel in Germany (about 14,000 years ago, a dog buried with two people) and in the Natufian cemetery of Ain Mallaha in Israel (about 12,000 BCE, an old woman buried with a puppy; Davis and Valla 1978, *Nature* 276). Genetic work puts the split from the wolf lineage between 20,000 and 40,000 years ago (Bergström et al. 2020, *Science* 370), and the people and dog fossils of Goyet (Belgium, about 36,000 years ago) are disputed, so the model is used from about 14,000 BCE and its start date is approximate. Dogs came to the Americas with the first people there (Perri et al. 2021, *PNAS* 118) and were already guarding camps and helping on the hunt.

**Against the wolf.** The wild ancestor is `animal-wolf` (0.8 m at the shoulder, 1.0 m long); the dog is not derived by code from it, because the dog has a different proportion and its own palette, but it is built on the same body recipe so the clips match. It is about two thirds the wolf's height, with a shorter, blunter muzzle, a wider forehead, ears that stand but fold at the tip, a tail curled up over the back, and the lighter, patchy coat of early dogs: tan with a white chest, white forefeet and a dark saddle. Early dogs were lean and wolf-sized or smaller; the model is small and lean. Dogs hunt with the people (`animal-dog` follows the hunters' walk), guard camps and, from the Neolithic, drive herds.

### 1.2 Zebu (`animal-zebu`)

**Evidence.** Cattle were domesticated at Mehrgarh (Balochistan, Pakistan) from the local Indian aurochs, *Bos primigenius namadicus*, in the seventh millennium BCE (Meadow 1993; Chen et al. 2010, *Molecular Biology and Evolution* 27 on the separate origin of indicine cattle). The hump is a muscle over the shoulders and is shown on Indus seals from about 2600 BCE, so humped cattle are used from the Indus phase (dates approximate).

**Against the wild animal.** The aurochs (`animal-aurochs`) is black and larger, with long forward-curving horns. The zebu is smaller, light grey to fawn with a darker neck and shoulder in bulls, has a high muscular hump over the shoulders, a loose dewlap hanging from the throat, long drooping ears, short upswept horns and a long thin tail with a dark tuft.

### 1.3 Water buffalo (`animal-water-buffalo`)

**Evidence.** The swamp type was domesticated in the lower Yangtze region, with the earliest remains in the Hemudu culture (about 5000 BCE) and domestic use by rice farmers by about 4000 BCE (Yang et al. 2008, *Journal of Zoology*; dates approximate). It pulled sledges and later ploughs through flooded paddies and wallowed in water. The river type of India is a separate domestication and is not modelled.

**Against the wild animal.** The wild water buffalo, *Bubalus arnee*, is a heavier animal of the swamps of India and Southeast Asia. The model shows the domestic swamp type: slate grey with sparse hair, a long broad face, big crescent horns that sweep out and back and then up, a pale chevron under the throat, pale stockings, a barrel body and a low carried head.

### 1.4 Llama (`animal-llama`)

**Evidence.** Llamas were bred from the guanaco in the high Andes of Peru and Bolivia from about 4000 BCE (Wheeler 1995 on the bones of Telarmachay, Peru; dates approximate). They were pack animals and also gave wool, meat and dung.

**Against the wild animal.** The wild ancestor is `animal-guanaco` (1.1 m, a uniform rich brown). The llama is bigger, with a longer neck, long banana-shaped ears, a woolly coat, and a coat of patches (cream, brown and white), which wild guanacos never have. It has a woolly tuft on the head and a short upright tail.

### 1.5 Guinea pig (`animal-guinea-pig`)

**Evidence.** Domesticated from wild cavies in the Andes from about 5000 BCE and kept in houses for meat (Spotorno et al. 2006, *Biological Journal of the Linnean Society* 87). A cheap model: a rounded body with a blunt face, small ears and four short legs, no tail, with a tricolour coat of orange, white and brown patches. It is shown in a house or yard, never in the field.

## 2. Clips

Every model has the same bones as the existing quadrupeds (`body`, `head`, `tail`, four legs, and for all but the guinea pig a knee or hock on each leg), so the animal clips of `clips.ts` drive them unchanged: `idle`, `walk`, `run`, `fall`, `struggle`, `bound` and `hung`. There is no `graze` clip yet; **proposed:** when grazing is wanted (herds at rest, buffalo in a paddy), add `graze` to `animateAnimal`, a looping clip in which the head bone dips to the ground and rises, and bake it like the others. Until then a resting herd uses `idle`.

## 3. How they are driven

Animals are not people's tools in the clip system; the people move and the animals follow.

- **Herding.** A herder uses the person clip `walk` at the herd's pace and the herd uses `walk` at its own gait, so a flock of zebu or llamas moves behind and beside a person. A dog runs ahead and to the sides of the herd with `run` and rests with `idle`. A person clip for calling or pointing is the existing `point`.
- **Farm work.** The water buffalo is the traction animal of the rice farmers: walking slowly with `walk` before a sledge or ard. The zebu pulls a cart on the Indus (clay toy carts are found at Harappan sites). The llama carries loads on its back. Props for the yoke, the plough, the cart and the pack, and the person clips for leading, driving and ploughing, are a later job of the person clip agent; the animal models need no change for them.
- **Camp and house.** Dogs lie near the hearth with `idle`; guinea pigs stay in the house.
- **Placement.** The culture and region of each animal is a content question, set in the tree and the sites data, not in the model scripts.
