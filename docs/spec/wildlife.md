# Wildlife

The globe gets small groups of wild animals that are typical of each continent: elephants and lions in Africa, kangaroos in Australia, penguins in Antarctica, yaks on the Tibetan plateau. They make the land feel alive between the stories, teach a child which animals live where, and show how the world changed: mammoths walk Siberia until the end of the ice age, and horses vanish from the Americas and come back with the Europeans. Like everything else, wildlife is a pure function of the date and the clock.

Status: asked for by Yang on 2026-10-18 ("let's add typical animals to all continents ... only groups of 2 or 3, only 1-2 groups of each species", then "also add parrots in south america, keas in new zealand, zebras, lions" and "elands and wildebeests (for hunting later!)"). The species and places below are **Proposed**, for review on the preview.

## 1. What the viewer sees

- A few **groups of 2 or 3 animals** of one species, at most **2 groups per species** in the whole world at any date. Each group stays in its home area: it grazes or rests for a while, then walks a short way to a new spot, again and again. Birds fly slow loops over their home.
- Animals are clay models like the people (milestone 2, section 13.3), drawn **not to scale, at one size at every zoom**, like trees and figures (milestone 2, section 5.1), but half as large again as the figures so they are easy to spot (Yang, 2026-10-18: "make the animals 50% larger"): 75 km per life-size metre. Their drawn size (the larger of the height and half the length) is kept between about 1.8 m and 4 m of life size (135 to 300 km on the globe), so a penguin or a parrot is still seen from orbit and a giraffe does not tower over everything. They always stand upright on the ground and never turn or tilt towards the camera (Yang, 2026-10-18: the lean of the figures looked wrong on animals), so from straight above they are seen from above.
- Animals are only scenery: they cannot be tapped and have no cards or names on screen in this first version (section 7), so they need no localised text.
- **Hunting later.** Elands and wildebeest are included because hunting dioramas will use them (Yang, 2026-10-18). The wildlife groups are separate from vignette casts: a hunt is a vignette with its own animals.

## 2. Ranges change with history

Each group has one or more **spans** of years in which it is shown. Outside them it is gone. When a span starts or ends, the group grows in or shrinks away over 5 years of the timeline, like the trees (foliage.md section 4). Default picked for this version: ranges follow the climate and history, and species are left out where they were extinct or absent. Choices worth checking:

- **Ice-age animals.** Woolly mammoths are shown on the Siberian mainland until 10,000 BCE and on Wrangel Island, their last home, until about 2000 BCE (Vartanyan et al. 1993, *Nature* 362). Woolly rhinos until 12,000 BCE (Lord et al. 2020, *Current Biology* 30). Cave bears until 22,000 BCE (Terlato et al. 2019, *Historical Biology* 31). Reindeer live in south-west France during the ice age, until 10,000 BCE, and in Lapland once the ice has gone, from 8000 BCE.
- **Horses in the Americas.** Wild horses lived on the Great Plains until about 10,000 BCE, then died out in the Americas; horses came back with the Spanish after 1492 and herds of mustangs roamed the plains from about 1700 (Haile et al. 2009, *PNAS* 106; the Smithsonian's history of the horse in North America). The plains group therefore has two spans.
- **Bison.** The American bison herd of the Great Plains is shown until 1885, when hunting had nearly wiped bison out; from 1885 a group lives in Yellowstone, where the last wild herd survived (US National Park Service, *Bison history*).
- **Camels.** Dromedaries are shown in Arabia for the whole timeline and in the Sahara only from 200 CE, after they were brought across North Africa (Bulliet, *The Camel and the Wheel*, 1975).
- **Lions.** One group in the Okavango and one in the Gir forest of India, where the last Asiatic lions live (IUCN Red List, *Panthera leo*).
- **The Amazon crocodilian** is a black caiman, a relative of the crocodile that lives in the Amazon; it uses the crocodile model.

The ground under a group is whatever the terrain draws at the date: penguins and polar bears stand on ice, and a group whose home the sea floods simply stands on the water surface. Homes are picked so that this does not happen within their spans.

## 3. The groups

Africa's groups are spread over the east, the south and the Sahel and west (Yang, 2026-10-18: "in africa the animals are all in the south eastern part of the continent"). Coordinates are the home of the group in degrees (true positions; the history lens moves them like everything else). Years are negative for BCE. "All" means the whole timeline, 70,000 BCE to 1991. Every group has a source for the species being there at those dates; the IUCN Red List range maps are the source for today's ranges unless another is named in section 2.

| Species | Model | Home | Lat, lon | Spans |
| --- | --- | --- | --- | --- |
| African elephant | `animal-elephant` | Tsavo, Kenya | −3.0, 38.5 | All |
| African elephant | `animal-elephant` | Gourma, Mali (the northernmost elephants of Africa) | 15.3, −1.6 | All |
| Asian elephant | `animal-asian-elephant` | Kaziranga, Assam, India | 26.6, 93.4 | All |
| Giraffe | `animal-giraffe` | Marsabit, Kenya | 3.2, 38.6 | All |
| Giraffe | `animal-giraffe` | Zakouma, Chad | 10.8, 19.6 | All |
| Plains zebra | `animal-zebra` | Laikipia, Kenya | 0.3, 36.9 | All |
| Plains zebra | `animal-zebra` | Kruger, South Africa | −24.0, 31.5 | All |
| Blue wildebeest | `animal-wildebeest` | Serengeti, Tanzania | −2.3, 34.8 | All |
| Blue wildebeest | `animal-wildebeest` | Kalahari, Botswana | −23.0, 22.5 | All |
| Lion | `animal-lion` | Okavango, Botswana | −19.3, 22.9 | All |
| Lion | `animal-lion` | Gir forest, India | 21.1, 70.8 | All |
| Eland | `animal-eland` | Drakensberg, South Africa | −29.0, 29.5 | All |
| Giant eland | `animal-eland` | Bénoué, Cameroon | 8.4, 13.8 | All |
| Mountain gazelle | `animal-gazelle` | Negev | 30.5, 34.8 | All |
| Dromedary | `animal-camel` | Arabia | 21.5, 49.0 | All |
| Dromedary | `animal-camel` | Sahara, Niger | 18.0, 8.0 | 200 to 1991 |
| European bison | `animal-bison` | Białowieża, Poland | 52.7, 23.9 | All |
| American bison | `animal-bison` | Great Plains, Nebraska | 42.0, −101.0 | All to 1885 |
| American bison | `animal-bison` | Yellowstone | 44.6, −110.5 | 1885 to 1991 |
| Wild horse | `animal-horse` | Mongolian steppe | 47.0, 96.0 | All |
| Wild horse | `animal-horse` | Southern Great Plains | 37.0, −103.0 | All to −10,000; 1700 to 1991 |
| Reindeer | `animal-reindeer` | Dordogne, France | 45.0, 1.0 | All to −10,000 |
| Reindeer | `animal-reindeer` | Lapland | 68.0, 25.0 | −8000 to 1991 |
| Woolly mammoth | `animal-mammoth` | Siberia | 65.0, 130.0 | All to −10,000 |
| Woolly mammoth | `animal-mammoth` | Wrangel Island | 71.2, −179.5 | −10,000 to −2000 |
| Woolly rhino | `animal-woolly-rhino` | Siberia | 62.0, 100.0 | All to −12,000 |
| Cave bear | `animal-cave-bear` | Eastern Alps, Slovenia | 46.0, 14.5 | All to −22,000 |
| Brown bear | `animal-brown-bear` | Carpathians, Romania | 46.5, 25.0 | All |
| Brown bear | `animal-brown-bear` | Interior Alaska | 64.5, −150.0 | All |
| Polar bear | `animal-polar-bear` | North Slope, Alaska | 70.8, −153.0 | All |
| Polar bear | `animal-polar-bear` | Svalbard | 78.5, 17.0 | −10,000 to 1991 |
| Grey wolf | `animal-wolf` | Central Russia | 55.0, 40.0 | All |
| Grey wolf | `animal-wolf` | Yukon, Canada | 64.0, −139.0 | All |
| Wild yak | `animal-yak` | Tibetan plateau | 33.0, 88.0 | All |
| Guanaco | `animal-guanaco` | Patagonia | −48.0, −69.0 | All |
| Guanaco | `animal-guanaco` | Atacama Andes | −24.0, −68.0 | All |
| Black caiman | `animal-crocodile` | Amazon near Manaus | −3.3, −60.0 | All |
| Scarlet macaw | `animal-parrot` | Western Amazon | −4.0, −72.0 | All |
| Scarlet macaw | `animal-parrot` | Eastern Amazon | −3.0, −52.0 | All |
| Saltwater crocodile | `animal-crocodile` | Kakadu, Australia | −12.6, 132.5 | All |
| Grey kangaroo | `animal-kangaroo` | New South Wales | −31.0, 146.0 | All |
| Red kangaroo | `animal-kangaroo` | Western Australia | −27.0, 118.0 | All |
| Kea | `animal-kea` | Southern Alps, New Zealand | −43.6, 170.5 | All |
| Emperor penguin | `animal-penguin` | Cape Crozier, Ross Sea | −77.5, 169.0 | All |
| Emperor penguin | `animal-penguin` | Halley Bay, Weddell Sea | −75.5, −26.5 | All |

The groups are a curated data file, `data/curated/wildlife.json`, with the species, model, home, spans and source of each group. It is small (about 5 KB) and part of the app bundle, like the asset manifest; there is no text in it for the viewer.

## 4. Behaviour

All of it is a pure function of the group, its member index and the clock (spec section 2, one clock), with seeded hashes and no `Math.random`. Pausing freezes the animals; scrubbing moves them to where they are at that moment.

- **Size of a group.** 2 or 3 members, chosen by the hash of the group.
- **Grazing and walking, in fluid motion** (Yang, 2026-10-18). A group's time is cut into rounds of about 10 to 16 seconds of the clock at regular speed: it stands and grazes (idle clip) for a part of the round, then walks (walk clip) to its next spot. The path runs along a smooth curve through the spots (a Catmull-Rom spline), so the group turns gradually and never snaps round, and the walk eases in and out: the animals speed up from standing, slow down before they stop, and their steps slow with them, ending on a whole stride so the legs come to rest. Spots are hashed points within the group's roaming radius around its home, about 150 km of the true globe (crocodiles about 80 km: they mostly bask), so groups never meet: homes are at least about 350 km apart. The group walks at about the speed its walk clip suggests, so feet do not slide much.
- **Each animal walks on its own** (Yang, 2026-10-18: "animals run individually, they don't keep a formation"). Every member has its own place in the group, about one and a half body lengths from the first, fixed on the ground and never turned with the group, and its own path: its spots lie up to about 40 km from the group's, it sets off up to about 1.5 seconds after the first and walks a little faster or slower, and it faces along its own curve. So the group stays together, but the animals at the back never swing round when it turns.
- **Birds** (macaws and keas) fly loops of about 160 km radius around their home at about 150 km above the ground, flapping their wings in big strokes (one beat every 0.6 seconds), each well behind the one before (about 0.15 of the loop) and on a loop about 60 km wider, so they never crowd (Yang, 2026-10-18: "the parrots are too close to each other").
- **Penguins** waddle, **kangaroos** hop, everything else walks on four legs.

## 5. Drawing and performance

Yang asked for small counts, and the Pixel 9 must keep 30 fps.

- About 45 groups and 100 animals exist over the whole timeline; at one date about 35 groups and 85 animals, of which at most about half are on the visible side of the globe.
- **Instanced.** Each species is drawn as instanced meshes, one per moving part of its model (body, head, legs, tail, wings), each with its ink outline, so a species in view costs about 10 to 14 draw calls however many of its animals are seen, and a species with nothing in view costs none. Each frame the app poses one copy of the model per animal with the clips of milestone 2 and copies its part matrices into the instances. The model shaders accept instance matrices for this.
- Animals on the far side of the globe are skipped.
- **Trees make room.** Each group keeps a clearing of trees around its home as wide as its roaming area plus about 225 km (foliage.md section 4), so the animals are not hidden in a forest of 200 km trees.
- **Proposed** limit: 70,000 wildlife triangles per frame, about 60 animals at up to 1,200 triangles each.

Yang's review of the first models (2026-10-18) asked for the giraffe's mane on its neck, the elephant's ears on its head and its legs closer together, and rounder bear faces; these are in.

## 6. Models

New clay models in `assets/src/animals.ts`, built like the existing animals, at life size in metres, facing +Z, within 1,200 triangles, each needing Yang's approval on the review sheets (`npm run asset-sheets`, sheet `animals&set=wild`) before it may be drawn outside a preview build.

| Id | Animal | Look |
| --- | --- | --- |
| `animal-elephant` | African bush elephant | Grey, huge ears on the sides of the head, trunk, short tusks, legs close under the body |
| `animal-asian-elephant` | Asian elephant | Darker grey, small ears, domed twin-bumped head, no visible tusks |
| `animal-giraffe` | Giraffe | Tall neck and legs, tan with brown patches, ossicones, a short dark mane along the back of the neck |
| `animal-zebra` | Plains zebra | Horse body in white with black stripes, upright striped mane |
| `animal-wildebeest` | Blue wildebeest | Grey-blue, heavy front, dark mane and beard, curved horns |
| `animal-lion` | Lion | Tawny cat with a big dark mane; the first member of a lion group |
| `animal-lioness` | Lioness | Tawny cat without a mane; the other members of a lion group |
| `animal-camel` | Dromedary | Sandy, one hump, long curved neck |
| `animal-yak` | Wild yak | Black-brown, long shaggy skirt of hair, wide horns |
| `animal-brown-bear` | Brown bear | Brown, shoulder hump, round face with full cheeks and a short muzzle, round ears |
| `animal-polar-bear` | Polar bear | Creamy white, long neck, round face, black nose |
| `animal-guanaco` | Guanaco | Llama shape, tan back, white belly, grey face |
| `animal-crocodile` | Crocodile | Long low olive body, snout, sprawling legs, ridged tail |
| `animal-penguin` | Emperor penguin | Upright, black back, white front, yellow neck patch, flippers |
| `animal-parrot` | Scarlet macaw | Red body, wings with yellow and blue bands, long tail |
| `animal-kea` | Kea | Olive-green parrot with orange under the wings, hooked beak |

Bison, horse, reindeer, mammoth, woolly rhino, cave bear, wolf, eland, gazelle and kangaroo use the approved models of milestone 2.

**Clips.** The animal clips of milestone 2 gain a `fly` clip (wings flap, body bobs) for birds, a waddle for two-legged walkers (penguins) and a hop for the kangaroo. They stay pure functions of the clip and the seconds.

## 7. Later

- Tapping an animal to see its name and a sentence about it in English and German.
- More species where a continent feels empty on the preview, and seasonal migrations (the wildebeest of the Serengeti).
- Animals displaced or hunted out by people as the tree of humankind spreads (humankind.md), for example the end of the mammoths.
