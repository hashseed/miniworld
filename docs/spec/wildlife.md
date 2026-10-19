# Wildlife

The globe gets small groups of wild animals that are typical of each continent: elephants and lions in Africa, kangaroos in Australia, penguins in Antarctica, yaks on the Tibetan plateau. They make the land feel alive between the stories, teach a child which animals live where, and show how the world changed: mammoths walk Siberia until the end of the ice age, and horses vanish from the Americas and come back with the Europeans. Like everything else, wildlife is a pure function of the date and the clock.

Status: asked for by Yang on 2026-10-18 ("let's add typical animals to all continents ... only groups of 2 or 3, only 1-2 groups of each species", then "also add parrots in south america, keas in new zealand, zebras, lions" and "elands and wildebeests (for hunting later!)"; later the same day capybaras, Siberian tigers and the extinct megafauna of section 2: "ok add these too"; in the evening giant pandas in south-west China, gorillas in Central Africa, and orangutans and a Komodo dragon in Indonesia). The species and places below are **Proposed**, for review on the preview.

## 1. What the viewer sees

- A few **groups of 2 or 3 animals** of one species, at most **2 groups per species** in the whole world at any date. Each group stays in its home area: it grazes or rests for a while, then walks a short way to a new spot, again and again. Birds fly slow loops over their home.
- Animals are clay models like the people (milestone 2, section 13.3), drawn **not to scale, at one size at every zoom**, like trees and figures (milestone 2, section 5.1), but half as large again as the figures so they are easy to spot (Yang, 2026-10-18: "make the animals 50% larger"): 75 km per life-size metre. Their drawn size (the larger of the height and half the length) is kept between about 1.8 m and 4 m of life size (135 to 300 km on the globe), so a penguin or a parrot is still seen from orbit and a giraffe does not tower over everything. They always stand upright on the ground and never turn or tilt towards the camera (Yang, 2026-10-18: the lean of the figures looked wrong on animals), so from straight above they are seen from above.
- **Tapping an animal opens its card** (Yang, 2026-10-18: "clicking on an animal should bring up their card"), as tapping a figure or landmark does (milestone 2, section 11): see section 8.
- **Hunting later.** Elands and wildebeest are included because hunting dioramas will use them (Yang, 2026-10-18). The wildlife groups are separate from vignette casts: a hunt is a vignette with its own animals.

## 2. Ranges change with history

Each group has one or more **spans** of years in which it is shown. Outside them it is gone. When a span starts or ends, the group grows in or shrinks away over 5 years of the timeline, like the trees (foliage.md section 4). Default picked for this version: ranges follow the climate and history, and species are left out where they were extinct or absent. Choices worth checking:

- **Ice-age animals.** Woolly mammoths are shown on the Siberian mainland until 10,000 BCE and on Wrangel Island, their last home, until about 2000 BCE (Vartanyan et al. 1993, *Nature* 362). Woolly rhinos until 12,000 BCE (Lord et al. 2020, *Current Biology* 30). Cave bears until 22,000 BCE (Terlato et al. 2019, *Historical Biology* 31). Reindeer live in south-west France during the ice age, until 10,000 BCE, and in Lapland once the ice has gone, from 8000 BCE.
- **Horses in the Americas.** Wild horses lived on the Great Plains until about 10,000 BCE, then died out in the Americas; horses came back with the Spanish after 1492 and herds of mustangs roamed the plains from about 1700 (Haile et al. 2009, *PNAS* 106; the Smithsonian's history of the horse in North America). The plains group therefore has two spans.
- **Bison.** The American bison herd of the Great Plains is shown until 1885, when hunting had nearly wiped bison out; from 1885 a group lives in Yellowstone, where the last wild herd survived (US National Park Service, *Bison history*).
- **Camels.** Dromedaries are shown in Arabia for the whole timeline and in the Sahara only from 200 CE, after they were brought across North Africa (Bulliet, *The Camel and the Wheel*, 1975).
- **Lions.** One group in the Okavango and one in the Gir forest of India, where the last Asiatic lions live (IUCN Red List, *Panthera leo*).
- **Extinct megafauna** (Yang, 2026-10-18: "what other megafauna in the past should I add, that maybe are even extinct already", then "ok add these too"). Each is shown until it died out, then shrinks away like any group; dates before written history are approximate and come from the sources in the data file: the giant deer (Irish elk) in Ireland until 10,700 BCE and in the southern Urals until 5700 BCE; the cave lion in the Swabian Jura and in Yakutia until 12,000 BCE; the sabre-toothed cat *Smilodon* at La Brea and in Florida until 8000 BCE; the American mastodon by the Great Lakes until 9000 BCE; the Columbian mammoth in the Valley of Mexico until 10,500 BCE (with the woolly mammoth model); the giant ground sloth *Megatherium* in the Pampas until 8500 BCE; *Glyptodon* in Uruguay until 8000 BCE; *Diprotodon* at Lake Callabonna until 42,000 BCE; the moa (North Island) until about 1400 CE, soon after the first people came; the elephant bird in southern Madagascar until about 1000 CE; the aurochs in Mazovia, Poland, until 1627, when the last one died; the quagga in the Karoo until 1883; and the thylacine in Tasmania until 1936. A group may have a smaller roaming radius (`roamKm` in the data file); on islands such as Tasmania the ground mask alone keeps the animals on the island. Haast's eagle is not on the globe either: New Zealand had too many animals (Yang, 2026-10-18: "new zealand has too many animals. remove the haast eagle."); its model stays in the asset set. Steller's sea cow is not on the globe either (Yang, 2026-10-18: "remove the sea cows completely"); its model stays in the asset set. The dodo is not on the globe for now: Mauritius is left off the simplified map (milestone 1, section 4.2), and even kept it would be a speck smaller than one dodo at drawn size, so dodos stood in the sea (Yang, 2026-10-18: "flat bird on and around madagascar"); its model stays in the asset set.
- **The Amazon crocodilian** is a black caiman, a relative of the crocodile that lives in the Amazon; it uses the crocodile model.

The ground under a group is whatever the terrain draws at the date: penguins and polar bears stand on ice, and a group whose home the sea floods simply stands on the water surface. Homes are picked so that this does not happen within their spans.

## 3. The groups

Africa's groups are spread over the east, the south and the Sahel and west (Yang, 2026-10-18: "in africa the animals are all in the south eastern part of the continent"). Coordinates are the home of the group in degrees (true positions; the history lens moves them like everything else). Years are negative for BCE. "All" means the whole timeline, 70,000 BCE to 1991. Every group has a source for the species being there at those dates; the IUCN Red List range maps are the source for today's ranges unless another is named in section 2.

| Species | Model | Home | Lat, lon | Spans |
| --- | --- | --- | --- | --- |
| African elephant | `animal-elephant` | Tsavo, Kenya | −3.0, 38.5 | All |
| African elephant | `animal-elephant` | Gourma, Mali (the northernmost elephants of Africa) | 15.3, −1.6 | All |
| Asian elephant | `animal-asian-elephant` | Irrawaddy plains, Myanmar | 21.0, 95.5 | All |
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
| Brown bear | `animal-brown-bear` | Kamchatka | 54.0, 156.5 | All |
| Polar bear | `animal-polar-bear` | North Slope, Alaska | 70.8, −153.0 | All |
| Polar bear | `animal-polar-bear` | Svalbard | 78.5, 17.0 | −10,000 to 1991 |
| Grey wolf | `animal-wolf` | Central Russia | 55.0, 40.0 | All |
| Grey wolf | `animal-wolf` | Yukon, Canada | 64.0, −139.0 | All |
| Wild yak | `animal-yak` | Tibetan plateau | 33.0, 88.0 | All |
| Guanaco | `animal-guanaco` | Patagonia | −48.0, −69.0 | All |
| Guanaco | `animal-guanaco` | Atacama Andes | −24.0, −68.0 | All |
| Black caiman | `animal-crocodile` | Amazon near Manaus | −3.3, −60.0 | All |
| Amur tiger | `animal-tiger` | Sikhote-Alin, Russian Far East | 45.5, 136.0 | All |
| Bengal tiger | `animal-tiger` | Kanha, India | 22.3, 80.6 | All |
| Capybara | `animal-capybara` | Amazon near Tefé | −3.4, −64.7 | All |
| Giant panda | `animal-panda` | Wolong, Sichuan | 31.0, 103.2 | All |
| Western gorilla | `animal-gorilla` | Odzala, Republic of the Congo | 0.6, 14.9 | All |
| Bornean orangutan | `animal-orangutan` | Tanjung Puting, Borneo | −2.8, 111.9 | All |
| Komodo dragon | `animal-komodo` | Flores, Indonesia | −8.6, 120.5 | All |
| Scarlet macaw | `animal-parrot` | Western Amazon | −4.0, −72.0 | All |
| Scarlet macaw | `animal-parrot` | Eastern Amazon | −3.0, −52.0 | All |
| Saltwater crocodile | `animal-crocodile` | Kakadu, Australia | −12.6, 132.5 | All |
| Grey kangaroo | `animal-kangaroo` | New South Wales | −31.0, 146.0 | All |
| Red kangaroo | `animal-kangaroo` | Western Australia | −27.0, 118.0 | All |
| Kea | `animal-kea` | Nelson Lakes, New Zealand | −41.8, 172.8 | All |
| Emperor penguin | `animal-penguin` | Cape Crozier, Ross Sea | −77.5, 169.0 | All |
| Emperor penguin | `animal-penguin` | Halley Bay, Weddell Sea | −75.5, −26.5 | All |
| Giant deer | `animal-giant-deer` | Ireland | 53.0, −8.0 | All to c. −10,700 |
| Giant deer | `animal-giant-deer` | Southern Urals | 57.5, 61.0 | All to c. −5700 |
| Aurochs | `animal-aurochs` | Mazovia, Poland | 52.2, 18.8 | All to 1627 |
| Cave lion | `animal-cave-lion` | Swabian Jura, Germany | 48.5, 9.8 | All to c. −12,000 |
| Cave lion | `animal-cave-lion` | Yakutia, Siberia | 66.0, 140.0 | All to c. −12,000 |
| Sabre-toothed cat | `animal-smilodon` | La Brea, California | 34.1, −118.3 | All to c. −8000 |
| Sabre-toothed cat | `animal-smilodon` | Florida | 28.0, −82.0 | All to c. −8000 |
| American mastodon | `animal-mastodon` | Great Lakes, Michigan | 42.5, −84.5 | All to c. −9000 |
| Columbian mammoth | `animal-mammoth` | Valley of Mexico | 19.6, −99.1 | All to c. −10,500 |
| Giant ground sloth | `animal-ground-sloth` | Pampas, Argentina | −35.5, −60.5 | All to c. −8500 |
| Glyptodon | `animal-glyptodon` | Uruguay | −32.5, −56.0 | All to c. −8000 |
| Diprotodon | `animal-diprotodon` | Lake Callabonna, South Australia | −29.8, 140.1 | All to c. −42,000 |
| Moa | `animal-moa` | Hawke's Bay, New Zealand | −39.6, 176.6 | All to c. 1400 |
| Elephant bird | `animal-elephant-bird` | Southern Madagascar | −24.5, 45.5 | All to c. 1000 |
| Quagga | `animal-quagga` | Karoo, South Africa | −31.5, 23.0 | All to 1883 |
| Thylacine | `animal-thylacine` | Tasmania | −42.0, 146.5 | All to 1936 |
| Humpback whale | `animal-whale` | Southern Ocean, off the Antarctic Peninsula (Yang, 2026-10-18: "too close to hawaii") | −60.0, −60.0 | All |
| Humpback whale | `animal-whale` | North Atlantic, off Newfoundland | 47.0, −45.0 | All |
| Bottlenose dolphin | `animal-dolphin` | Ionian Sea | 37.0, 18.5 | All |
| Bottlenose dolphin | `animal-dolphin` | East of the Bahamas | 25.0, −72.0 | All |

The groups are a curated data file, `data/curated/wildlife.json`, with the species, model, home, spans and source of each group. It is small (about 5 KB) and part of the app bundle, like the asset manifest; there is no text in it for the viewer.

## 4. Behaviour

All of it is a pure function of the group, its member index and the clock (spec section 2, one clock), with seeded hashes and no `Math.random`. Pausing freezes the animals; scrubbing moves them to where they are at that moment.

- **Size of a group.** 2 or 3 members, chosen by the hash of the group, unless the data file sets `size`: the thylacine of Tasmania is shown alone, so it fits on the island and stays on land (Yang, 2026-10-18: "let's only have one tasmanian tiger so that it can stay on land"), and so is the Komodo dragon on Flores.
- **Grazing and walking, in fluid motion** (Yang, 2026-10-18). A group's time is cut into rounds of about 10 to 16 seconds of the clock at regular speed: it stands and grazes (idle clip) for a part of the round, then walks (walk clip) to its next spot. The path runs along a smooth curve through the spots (a Catmull-Rom spline), so the group turns gradually and never snaps round, and the walk eases in and out: the animals speed up from standing, slow down before they stop, and their steps slow with them, ending on a whole stride so the legs come to rest. Groups roam far (Yang, 2026-10-18: "animals roam a bit further around their home area, like the radius of 1000km, as long as land animals stay on land and sea animals stay in the sea"): the roaming radius is about 1000 km of the true globe around the home (crocodiles about 80 km: they mostly bask by their river; forest and island animals less, set by `roamKm` in the data file: giant pandas 250 km in their mountains, where open ground is measured from their home in the valleys, gorillas 300 km, orangutans 250 km and the Komodo dragon 150 km). The group grazes around a centre that wanders slowly over its open ground: a seeded loop over the middle of the open cells within the roaming radius, as wide as they spread, swinging once east to west in about 41 rounds and north to south in about 29. Each spot is a hashed point within about 120 km of the centre in that round, so a walk is a few hundred km at most and the herd drifts across its range instead of jumping across it. Groups of different species may meet. The group walks at about the speed its walk clip suggests, so feet do not slide much.
- **On open lowland only** (Yang, 2026-10-18: "animals also should not climb mountains"). The data build gives every walking group a ground mask: a 48 × 48 grid of cells (about 60 km each) over a square reaching about 450 km beyond its roaming radius, laid on the plane touching the globe at the home just as the app places the animals, each open where the ground is dry land at today's sea level (no sea or lake) both in the source grids and as the globe draws it from the finest terrain tiles, whose interpolated shore can reach a sample further than the grids' (Yang, 2026-10-19: animals stood in the Gulf of Trieste and the Gulf of Suez), at most about 500 m above the home and no steeper than about 300 m over 40 km (the sea floor beyond a coast does not count, so small islands stay open). The masks travel in the startup index (one short hex string per group, in the order of the data file) and the app draws no wildlife until they have arrived, so loading never changes where an animal is; it draws none either when the index holds a different number of masks than the app has groups (data built before the groups changed), since the masks would then belong to other groups. A cell is open only if its middle and the middles of its four edges all pass, so no animal stands half in the sea, and a land cell must also be dry at its four corners, so lakes smaller than a cell are not walked over. A walk whose curve would cross closed ground (a lake, a bay, a mountain) goes round it instead, along the shortest way through open cells, pulled straight wherever the ground between stays open (Yang, 2026-10-18: "animals still walk across lakes"). Only open cells a walk can reach from the open cell nearest the home, through open cells, stay open, so land animals never cross a sea or strait to other land, island animals stay on their island and sea animals never cross land to another sea. A spot is the first of up to 16 hashed tries near the wandering centre at which every animal of the group, at its place in the group, stands on open ground; if none is, the group closes up on narrow land, its places in the group shrinking to three quarters and then a little over half, and tries again (Yang, 2026-10-18: "the moas are on the sea"); if still none fits, it grazes at the open cell nearest the centre where all its animals fit (else the open cell nearest the centre, else the home). A group closing up or opening out again does so smoothly along its walk. An animal that stays put faces a seeded direction. Places in the group are added on the true globe, one body length being the drawn length divided by the history lens's width at the home, so the check matches what is drawn (Yang, 2026-10-18: a sea cow on land, a tiger in the sea, Asian elephants on the Himalaya, flat penguins; the elephants also moved from Kaziranga, at the foot of the mountains, to the Irrawaddy plains). An animal's own jittered spot falls back to the group's when it is not open. Birds fly over anything and have no mask.
- **Clear of camps and fires** (Yang, 2026-10-18: "sometimes animals clip into huts or humans or fire. animals stay away from fire generally. schedule the animal paths correctly"). Walking groups keep away from the camps of the tree of humankind (humankind.md section 8.1). The data build lists in the startup index every place a camp stands (its hearth, from the day its first lodging is built to the day its last is taken down) within about 3,000 km of a walking group's home, as whole microdegrees and days, so loading the tree's chunks never changes where an animal is. While a camp stands, and from 30 seconds of the clock before its first lodging goes up, while the band arrives, its hearth has a keep-out circle on the drawn globe: the ring of lodgings, a lodging's width beyond it and a margin, together 24 layout metres (about 680 km at the drawn camp size), plus the animal's half body length; on the true globe it is that over the history lens's width at the group's home, as with places in the group. The group's wandering centre is moved out of any keep-out circle standing during a round, far enough that the spot's tries land outside it, and a try counts only if every animal of the group, at its place, stands outside every keep-out circle standing at any time from the walk to the spot until the walk away from it. Where a walk still comes near a circle, the animal is moved out to its edge, away from the hearth, and turns to walk along it, so it goes round the camp; the circle grows in over its first 15 seconds, so no animal jumps.
- **Clear of people.** Each frame, after animals are pushed apart from each other (section 5), any walking animal closer to a figure of the tree of humankind, a hunted animal, a lodging or a hearth than their two half sizes on the drawn globe is pushed away from it in full; the figures and their camps are never moved. This covers people out gathering, hunting or walking to a new camp, who go far beyond the keep-out circle.
- **Each animal walks on its own** (Yang, 2026-10-18: "animals run individually, they don't keep a formation"). Every member has its own place in the group, about one and a half body lengths from the first, fixed on the ground and never turned with the group, and its own path: its spots lie up to about 40 km from the group's, it sets off up to about 1.5 seconds after the first and walks a little faster or slower, and it faces along its own curve. So the group stays together, but the animals at the back never swing round when it turns.
- **Birds** (macaws and keas) fly loops of about 160 km radius around their home at about 150 km above the ground, flapping their wings in big strokes (one beat every 0.6 seconds), each well behind the one before (about 0.15 of the loop) and on a loop about 60 km wider, so they never crowd (Yang, 2026-10-18: "the parrots are too close to each other").
- **Sea animals** (Yang, 2026-10-18: "whales and dolphins in the oceans"). Whales and dolphins move like the walking groups, from spot to spot along smooth curves, but their spots lie in open sea at least about 300 m deep, so it is sea at every date, and at least about 150 km from any land, so they are seen out at sea, not by the shore (their masks open only such cells), and they swim the whole time (a `swim` clip: the tail beats up and down, the flippers steer). They ride at the sea surface, their backs just awash. Dolphins leap in arcs out of the water and back, about one leap every 2.4 seconds, tipping nose up as they rise and nose down as they fall. Whales cruise at the surface between spots, then dive while resting: they tip nose down so the flukes lift, sink out of sight and come up again before the next journey.
- **Penguins** waddle, **kangaroos** hop, everything else walks on four legs.

## 5. Drawing and performance

Yang asked for small counts, and the Pixel 9 must keep 30 fps.

- About 65 groups and 160 animals exist over the whole timeline; at one date about 45 to 50 groups and 115 animals, of which at most about half are on the visible side of the globe.
- **Instanced, two draw calls a species** (Yang, 2026-10-18: cut the animals' draw calls, which went over the desktop budget of 300 from orbit). Each species is one instanced mesh, the moving parts of its model (body, head, legs, tail, wings) merged into one geometry whose vertices name their part, with its ink outline, so a species in view costs 2 draw calls however many of its animals are seen, and a species with nothing in view costs none. Each frame the app poses one copy of the model per animal with the clips of milestone 2 and writes its part matrices into a small float texture, a row per animal, which the shaders read by instance and part. The model shaders read the pose texture for this.
- Animals on the far side of the globe are skipped.
- **Standing on the ground, never in it** (Yang, 2026-10-18: "animals clip through the terrain"). A land animal stands on the drawn ground (with the history lens's taller relief) under its middle and leans with the slope (Yang, 2026-10-18: "all animals hover above ground. if they are not on flat terrain, we should position them so that they follow the gradient of the terrain"): the ground about a third of a body length in front, behind, left and right gives the slope, the body tips nose up or down along it and leans across it, by at most about 15 degrees, so its feet follow the ground and the history lens, which makes the relief taller where it magnifies, never tips it far (Yang, 2026-10-18: "history lens causes tilted animals"). Where the ground around it lies higher than under its middle (a valley), it is raised by at most a tenth of its height, so a river bank beside it never lifts it into the air (Yang, 2026-10-18: "flying animals"). Birds and sea animals stay level.
- **Never overlapping** (Yang, 2026-10-18: "make sure animals don't overlap with each other"). Each frame, any two walking or swimming animals closer than their two half body lengths on the drawn globe are pushed apart along the line between them, half each, in three rounds; birds fly above and are left alone. It depends only on where the animals are, so the same time gives the same picture.
- **Trees make room.** Trees make way where an animal walks or grazes (foliage.md section 4), so the animals are not hidden in a forest of 200 km trees (Yang, 2026-10-18: "giraffe clipping through a tree"). The clock is cut into stretches of 20 seconds; in each, every walking or swimming animal is followed over the stretch, a point every second, and a clearing goes round each point where it has moved on by more than about 100 km of the drawn globe since the last: its half body length at drawn size plus about 200 km for a tree crown. Birds keep one clearing over their whole loop. The clearings change only once per stretch, so the trees are not re-placed every frame. (Earlier, each of a group's spots got one clearing as wide as the whole group's wander, places and walk; that cleared nearly every tree of the East African savanna. Yang, 2026-10-18: "somehow too little foliage now?")
- **Proposed** limit: 70,000 wildlife triangles per frame, about 60 animals at up to 1,300 triangles each, mostly far fewer.

Keas and capybaras are drawn smaller than the other animals, at 1.2 m (Yang, 2026-10-18: "the keas are a bit too large", "capybaras are too large").

Yang's review of the first models (2026-10-18) asked for the giraffe's mane on its neck, the elephant's ears on its head and its legs closer together, and rounder bear faces; these are in.

## 6. Models

New clay models in `assets/src/animals.ts`, built like the existing animals, at life size in metres, facing +Z, within 1,300 triangles, each needing Yang's approval on the review sheets (`npm run asset-sheets`, sheet `animals&set=wild`) before it may be drawn outside a preview build.

| Id | Animal | Look |
| --- | --- | --- |
| `animal-elephant` | African bush elephant | Grey, huge ears on the sides of the head, trunk, short tusks, legs close under the body, round column feet with toenails (Yang, 2026-10-18: no flat feet) |
| `animal-asian-elephant` | Asian elephant | Dusty grey-brown, a little warmer than the African elephant (Yang, 2026-10-18: "asian elephant is too dark"), small ears, domed twin-bumped head, no visible tusks |
| `animal-giraffe` | Giraffe | Tall neck and legs, tan with brown patches, ossicones, a short dark mane along the back of the neck |
| `animal-zebra` | Plains zebra | Horse body in white with bold black stripes painted on, never stuck on (Yang, 2026-10-18): upright bands on the body, across the thighs on the rump, rings round the legs, across the neck and the face; a short upright striped mane |
| `animal-wildebeest` | Blue wildebeest | Grey-blue, heavy front, dark mane and beard, curved horns |
| `animal-lion` | Lion | Tawny cat with a big dark mane; the first member of a lion group |
| `animal-lioness` | Lioness | Tawny cat without a mane; the other members of a lion group |
| `animal-camel` | Dromedary | Sandy, one hump, long curved neck |
| `animal-yak` | Wild yak | Black-brown, long shaggy skirt of hair, wide horns |
| `animal-brown-bear` | Brown bear | Brown, shoulder hump, round face with full cheeks and a short muzzle, round ears |
| `animal-polar-bear` | Polar bear | Creamy white, long neck, round face, black nose |
| `animal-guanaco` | Guanaco | Llama shape, tan back, white belly, grey face |
| `animal-tiger` | Tiger | Orange with narrow black stripes painted on its back, sides, upper legs, brow and tail; white cheeks and belly |
| `animal-capybara` | Capybara | Barrel-shaped, reddish brown, no tail, big blunt square head, small round ears, short legs |
| `animal-crocodile` | Crocodile | Long low olive body, snout, sprawling legs, ridged tail |
| `animal-penguin` | Emperor penguin | Upright, black back, white front, yellow neck patch, flippers |
| `animal-parrot` | Scarlet macaw | Red body, wings with yellow and blue bands, long tail |
| `animal-kea` | Kea | Olive-green parrot with orange under the wings, hooked beak |
| `animal-panda` | Giant panda | Round white bear with black legs, a black band over the shoulders, black ears and black eye patches, painted on like the zebra's stripes |
| `animal-gorilla` | Gorilla (silverback) | Black, broad shoulders above narrow hips, long arms walking on the knuckles, a crest on the head, a dark bare face, a silver saddle; the first member of a gorilla group |
| `animal-gorilla-female` | Gorilla | As the silverback but smaller and without the silver saddle; the other members of a gorilla group |
| `animal-orangutan` | Bornean orangutan | Red-orange great ape on all fours, very long arms with long hanging hair, a dark bare face |
| `animal-komodo` | Komodo dragon | Big grey-brown lizard, legs sprawled to the sides, long neck and tail, a forked yellow tongue |

The sea animals are in `assets/src/seaAnimals.ts`, built with their lowest point on y = 0 like the land animals; the layer floats them:

| Id | Animal | Look |
| --- | --- | --- |
| `animal-whale` | Humpback whale | Dark slate back, pale belly painted on, very long flippers, broad flukes, knobs on the head, a small back fin |
| `animal-dolphin` | Bottlenose dolphin | Grey, pale belly, a short beak, a curved back fin |
| `animal-sea-cow` | Steller's sea cow (not on the globe, section 2) | Huge and bulky, dark bark-like skin, a small head with a pale snout, stubby flippers, broad flukes |

The extinct megafauna are in `assets/src/extinctAnimals.ts`:

| Id | Animal | Look |
| --- | --- | --- |
| `animal-giant-deer` | Giant deer (Irish elk) | Big reddish deer with huge flat antlers, palms with tines |
| `animal-aurochs` | Aurochs | Huge black wild bull, pale stripe down the back, pale muzzle, long forward-curving horns |
| `animal-cave-lion` | Cave lion | A pale lion without a mane |
| `animal-smilodon` | Sabre-toothed cat | Stocky tawny cat, short tail, two long upper fangs |
| `animal-mastodon` | American mastodon | Lower and longer than a mammoth, reddish-brown hair, long upcurved tusks |
| `animal-ground-sloth` | Giant ground sloth | Elephant-sized, bulky hindquarters, a small long head, big front claws, a thick tail touching the ground |
| `animal-glyptodon` | Glyptodon | A domed shell with bands of pale plates painted on, a bony cap, a ringed tail with a club |
| `animal-diprotodon` | Diprotodon | A rhino-sized wombat with a broad dark nose |
| `animal-moa` | Moa | A giant wingless bird, long neck, thick three-toed legs; strides |
| `animal-elephant-bird` | Elephant bird | Heavier than the moa, with a shorter neck; strides |
| `animal-haast-eagle` | Haast's eagle | Dark brown eagle with a yellow beak, drawn in flight |
| `animal-dodo` | Dodo | Plump grey bird, big hooked beak, stubby wings, curly white tail, yellow legs; waddles |
| `animal-quagga` | Quagga | Zebra stripes only on the head, neck and front, brown behind, pale legs |
| `animal-thylacine` | Thylacine | Sandy dog-like marsupial with dark stripes painted over its back and rump, a long stiff tail |

Bison, horse, reindeer, mammoth, woolly rhino, cave bear, wolf, eland, gazelle and kangaroo use the approved models of milestone 2.

**Legs with joints** (Yang, 2026-10-18: "four legged animals have straight legs without a joint. that makes them run very unnaturally"). Every four-legged model built on the shared body has an upper and a lower leg: a knee in front and a hock behind, which bends the other way. In a walk the feet are set down one after another (hind left, fore left, hind right, fore right); in a run diagonal pairs move together. Each foot pushes back slowly on the ground, then swings forward lifted, its knee or hock bent: little for elephants, deeply for cats and dogs. The review sheet of an animal's clips shows the walk as six frames over one stride.

**Clips.** The animal clips of milestone 2 gain a `fly` clip (wings flap, body bobs) for birds, a waddle for two-legged walkers with wings (penguins, dodos), a stride for wingless birds (moas, elephant birds), a hop for the kangaroo and a `swim` clip for sea animals. Haast's eagle is drawn 2.2 m in life size, between the keas and the big animals. They stay pure functions of the clip and the seconds.

## 7. Later

- More species where a continent feels empty on the preview, and seasonal migrations (the wildebeest of the Serengeti).
- Animals displaced or hunted out by people as the tree of humankind spreads (humankind.md), for example the end of the mammoths.

## 8. Animal cards

Tapping an animal opens a card about its species, in a panel on desktop and a bottom sheet on phones, like every card (milestone 2, section 11); it never pauses time. The panel opens in the top-left corner of the screen and ends above the play controls and the timeline, so the buttons in the top right stay free (decided by Yang on 2026-10-18).

- **Records.** One record per species, `data/curated/animals/<species>.md`, its id equal to the `species` of the groups in `wildlife.json` (content-format.md, kind `animal`). The front matter holds `id`, `kind: animal` and `sources` (references into `sources.yaml`, at least one); the body has the usual `## en` and `## de` sections, each with the species' name as the `#` title, the card text, and an optional `### Learn more` (`### Mehr erfahren`). The data build fails when a species in `wildlife.json` has no record, a record has no group, or a record breaks the envelope rules of content-format.md section 2.
- **Text.** Written for a reader of about 11 to 12, in a few short paragraphs: what the animal is and how big, where it lives and what it eats, one thing that makes it special, and how people met it in history. An extinct animal says when and why it died out as far as is known, with uncertain dates marked approximate and debated causes (hunting, climate) named as debated. Nothing bloody; hunting and extinction are told plainly. English and German are written together and say the same.
- **Card.** The title, then, when the tapped group has a span in `wildlife.json`, one line on when this group is shown here, with the span that holds the current date: "Here until c. 10,700 BCE", "Here from 1885" (`Hier bis ca. 10.700 v. Chr.`, `Hier ab 1885`), marked approximate ("c.", "ca.") for years before 1500; then the text. Groups without a span have no date line.
- **Loading.** The startup index carries, per language, each species' id and title only (a few KB); the card text is one small file per species and language, loaded when the card opens, so nothing large is downloaded at startup (spec section 10).
- **Hit test.** A tap that hits no vignette cast or landmark is tested against the animals drawn in the frame: the nearest animal whose middle lies within its drawn size on screen (at least 24 CSS pixels) is hit, nearer animals first on a tie.
