# Neolithic livestock models

Status: **Proposed**, for Yang's review (asked for in the Neolithic model round of October 2026). The four animals of the first farmers of the Near East and Europe. They follow the clay-toy style of [milestone 2](../milestone-2.md) section 13.3: rounded primitives, flat vertex colours, cel shading with an ink outline, life size in metres, facing +Z with the feet on y = 0, at most **1,300 triangles** each (section 15). They are modelled in `assets/src/livestock.ts`, listed in `LIVESTOCK_ANIMALS`, and joined to `ANIMALS` in `assets/src/animals.ts`. Each is listed in `data/assets/manifest.json` with status `generated` until Yang approves it. They share the four-legged body of `assets/src/quadruped.ts`, so every animal clip of `assets/src/clips.ts` drives them.

## 1. What the models are

| Id | Animal | Height at the shoulder | Length | Colours |
| --- | --- | --- | --- | --- |
| `animal-sheep` | Early domestic sheep | 0.70 m | 0.9 m | Short, pale, slightly woolly coat over a dark brown face, ears and legs; small curled horns |
| `animal-goat` | Domestic goat | 0.68 m | 0.85 m | Brown-grey coat, dark stripe down the back, dark legs and beard, pale belly, scimitar horns swept back |
| `animal-cattle` | Early domestic cattle | 1.15 m | 1.6 m | Reddish dark brown, pale stripe along the spine, pale muzzle, short forward-curving horns |
| `animal-pig` | Early domestic pig | 0.58 m | 1.0 m | Lean, dark grey-brown, a crest of dark bristles down the back, pink-grey snout, small tusks, curly tail |

Sizes are real, not drawn up: like every animal they are shown not to scale on the globe (wildlife.md section 1).

## 2. Evidence and dates

Domestication happened in the Fertile Crescent in the 9th and 8th millennia BCE, within a few centuries and a few hundred kilometres of each other (Zeder 2008, *PNAS* 105, "Domestication and early agriculture in the Mediterranean Basin"). Dates are approximate.

- **Sheep** come from the Asian mouflon (*Ovis orientalis*), tamed in south-east Anatolia and the northern Zagros from about 9000 to 8500 BCE (Zeder 2008). The first sheep were not woolly: they were hairy, brown or dun, like their wild ancestor. A woolly fleece developed later and spread from about 4000 to 3000 BCE (Sherratt 1981, "Plough and pastoralism", in *Pattern of the Past*). The model is therefore an early sheep with only a short, pale, slightly woolly coat, the "woolly-ish" look, so it reads as a sheep to a child without claiming a fully woolly animal at 8000 BCE. It keeps small curled horns; ewes of primitive breeds are often hornless, and the model does not try to show the sexes apart.
- **Goats** come from the bezoar ibex (*Capra aegagrus*) of the Zagros and Taurus, managed from about 8500 BCE and clearly domestic at Ganj Dareh, Iran, by about 8000 BCE (Zeder and Hesse 2000, *Science* 287). Early goats look very like the wild ones: brown-grey with a dark dorsal stripe and dark legs, with scimitar horns; the model keeps that wild colour pattern.
- **Cattle** come from the aurochs (*Bos primigenius*), domesticated from about 8500 BCE in the upper Euphrates and Taurus region, from only a small founding stock (Bollongino et al. 2012, *Molecular Biology and Evolution* 29; Helmer et al. 2005 on early cattle at Çayönü). Domestic cattle were much smaller than the aurochs: a bull stood about 1.8 m at the shoulder (the `animal-aurochs` model), early domestic cattle about 1.1 to 1.3 m (Zeder 2008). The model reuses the aurochs recipe at about 0.64 of its height, with shorter, thinner horns, a reddish brown coat in place of the bull's dark brown, and the aurochs' pale spine stripe and muzzle.
- **Pigs** come from the wild boar (*Sus scrofa*), kept in Anatolia (Çayönü, Nevalı Çori) from about 8500 BCE (Ervynck et al. 2001, *Paléorient*; Larson et al. 2005, *Science* 307). Farmers brought the Near Eastern pigs to Europe from about 6000 BCE, where they were later replaced by pigs of local boar descent (Larson et al. 2007, *PNAS* 104). Early domestic pigs were lean and long-legged compared with modern pigs, smaller than the wild boar (shoulder about 0.9 m for a big boar; the project has no boar model yet), and still dark and bristly with a ridge of long hair.

Domestication in general made animals smaller, gentler and more varied in colour, which archaeologists read from shrinking bones (Zeder 2008). The models show size and colour changes; they do not show diseases or wounds.

## 3. Clips

All four use the animal clips of milestone 2 section 13.3: `idle`, `walk`, `run`, `fall`, and the hunting clips `struggle`, `bound` and `hung`. Two points are specific to livestock:

- **`graze`** (new, `assets/src/clips.ts`): the head goes down to the ground and chews with small nods, lifts now and then to look round, and goes down again, the tail flicking. The head angle is worked out from the model so the muzzle reaches the ground on each animal. It repeats like `idle` (`animalLoop` default, 6 strides). It is the pose of a herd waiting while a herder works.
- **`idle`** is standing, breathing, head and tail moving a little.

**Herding** (dioramas.md `herding` scene; the herder person clips and the pen prop are specified elsewhere): the herder walks with `walk`; the animals follow with `walk` at the herder's pace, or `run` when driven. At pasture they play `graze`, at the pen and while being milked or sheared they play `idle`. A slaughtered animal is never shown; `fall` is only for hunted game. Counts per herd: a few animals of one kind (sheep and goats may mix).
