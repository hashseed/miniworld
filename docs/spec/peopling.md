# Peopling the world

This is the design of how humankind leaves Africa and reaches every part of the globe it reached before 9000 BCE, and how people adapt to each new land on the way. It continues [humankind.md](humankind.md), which grows the tree of humankind inside Africa, and replaces the migration rules of [milestone-2.md](milestone-2.md#9-migrations) section 9. Where they disagree, fix whichever is wrong in the same pull request. Decisions marked **Proposed** are defaults chosen so work can start and are open for Yang to change.

Asked for by Yang on 2026-10-18: "humanity migrates out of Africa and populates the entire world. They will have to adapt to the respective regions." Decided by Yang on 2026-10-18, on the first draft: the tree of humankind is extended for this purpose; the plan ends at 9000 BCE, before farming begins (the Neolithic, milestone 3); sea crossings are made in small boats, canoes; Denisovans and *Homo floresiensis* are not shown. The cold and height limits (section 5.2), the new profiles and the first dogs (section 5) are part of the plan as drafted. Routes and dates follow mainstream archaeology and genetics; dates that are argued about are marked as debated on the timeline and the cards, and the card names the older claims.

Asked for by Yang on 2026-10-19: "implement human spread across the continents up to the verge of entering neolithic age (we plan farming etc. separately). Once a local population is about to enter neolithic age, they put up a huge red flag so that I know that's where things should continue." The plan therefore no longer ends at one date for the whole world: it ends at each region's **Neolithic threshold** (section 3.6), and the tree runs until the last threshold of this plan, c. 6500 BCE (**Proposed**). What the first implementation builds, and what waits, is in section 9.1.

## 1. The idea in one paragraph

After the prologue has filled Africa (humankind.md section 4.2), the tree keeps growing the way it always has: a full camp sends two or three people off to found a new camp. What changes is where they may go. A small table of dated **arrival points**, each a real site with a source (the first people in Arabia, on Sumatra, in Australia, in Bulgaria, in Siberia, in Chile), says when people first reached each part of the world; the data build turns it into an **arrival map** that opens the land a little at a time, so the tree can only spread where and when people really did. A strait wider than people can wade is crossed in small canoes, only at a listed **crossing**. And a band can only live where its way of life lets it: in light clothing it cannot camp in the cold north, without the know-how of the high plateau it cannot camp at 4,500 m, without boats it cannot reach an island. Each new land therefore comes with an **adaptation**, a culture profile with its own clothes, shelters, tools, food and animals, so the people who walk into Ice Age Europe come out of their huts in sewn fur clothes and hunt reindeer, and those who reach New Guinea build bark shelters and dig yams. Every arrival and every adaptation is a key moment on the timeline with a card in English and German.

## 2. Accuracy

- **One figure stands for many people** (spec section 2.4), so a camp founded at an arrival point stands for the first people of a whole region, not for one family. The arrival card says so where it matters ("People had been moving along these coasts for thousands of years...").
- **Arrival dates are the earliest well-accepted evidence**, not the first footstep. People were often there a little earlier. Where an older date is claimed but argued about, the timeline uses the accepted one and the card names the older one as debated, as already done for Madjedbebe (humankind.md section 7).
- **Earlier groups whose lines died out** are mentioned on the cards and not drawn: modern humans in the Levant about 180,000 to 90,000 years ago (Misliya, Skhul, Qafzeh) and possibly in Greece and southern China.
- **Other humans.** Neanderthals are the second tree (humankind.md section 3.5). Denisovans and *Homo floresiensis* are not shown, on the globe or on cards (decided by Yang on 2026-10-18).
- **No conquest story.** Arriving people meet Neanderthals in western Asia and Europe; the card says the two lived side by side for thousands of years and had children together, and that the reasons the Neanderthals disappeared are still debated. Nobody is shown fighting.
- **Body and way of life.** The cards say that people adapted mostly through what they made and knew (clothes, fire, shelters, boats, tools, knowledge of plants and animals), and only slowly and a little in their bodies: skin colour over many thousands of years (milestone 2 section 13.3), and the breathing of high-altitude peoples.
- **Nothing is named after a later people.** A camp of 40,000 BCE in Europe is "Ice Age hunters", never "Germans" or "Europeans"; the first Americans are "the first people of the Americas", ancestors of the Indigenous peoples of the Americas, as the card says.

## 3. Arrival points

An arrival point is a dated place where people first reached a region. Arrival points form **routes**: chains of points in the order people reached them, starting at an earlier point or at the African front. The tables below are the editorial list; the records go to `data/curated/arrivals/`, one Markdown file per route (content-format section 4), each point with its source. Dates are years BCE or CE, approximate; coordinates are approximate and only have to lie on land at the date. Where a date was already decided in [events.md](events.md) or milestone 2 section 12, it is kept.

Dates and sources in these tables are drafted from the overview literature and are checked, one by one, when the records are written (**Proposed**): a record is only merged with its source looked up.

### 3.1 Out of Africa and the southern route (milestone 2)

| Id | Date | Place | Lat, lon | Evidence and source |
| --- | --- | --- | --- | --- |
| `bab-el-mandeb` | c. 60,000 BCE | Crossing of the Bab-el-Mandeb into Arabia, on its Arabian shore | 13.30, 43.55 | Decided (humankind.md section 7); main dispersal 60,000 to 50,000 years ago (Bae, Douka and Petraglia 2017, *Science* 358) |
| `south-asia` | c. 53,000 BCE | Coast of Gujarat, India | 21.50, 70.50 | About 55,000 years ago from genetics and microliths (Mellars et al. 2013, *PNAS* 110); older Jwalapuram tools debated |
| `sundaland` | c. 52,000 BCE | Lida Ajer, Sumatra | -0.40, 100.30 | Teeth dated 73,000 to 63,000 years ago (Westaway et al. 2017, *Nature* 548), debated; Niah Cave, Borneo, from about 50,000 years ago (Barker et al. 2007, *Journal of Human Evolution* 52) |
| `wallacea` | c. 51,000 BCE | Sulawesi | -5.00, 119.80 | Cave painting of 51,200 years ago, the oldest known (Oktaviana et al. 2024, *Nature* 631) |
| `sahul` | c. 50,000 BCE | Arnhem Land, northern Australia | -12.50, 132.90 | Decided (events.md); about 50,000 years ago (O'Connell et al. 2018, *PNAS* 115); Madjedbebe 65,000 debated (Clarkson et al. 2017, *Nature* 547) |
| `new-guinea-highlands` | c. 46,000 BCE | Ivane Valley, Papua New Guinea | -8.20, 147.10 | 49,000 to 44,000 years ago, with pandanus nuts and yams (Summerhayes et al. 2010, *Science* 330) |
| `near-oceania` | c. 38,000 BCE | New Ireland, Bismarck Archipelago | -2.60, 150.80 | Buang Merabak, about 40,000 years ago (Leavesley et al. 2002, *Asian Perspectives* 41) |
| `southern-australia` | c. 40,000 BCE | Lake Mungo | -33.70, 143.00 | Mungo Lady and Mungo Man, about 42,000 years ago (Bowler et al. 2003, *Nature* 421) |
| `tasmania` | c. 39,000 BCE | Warreen Cave, Tasmania (then joined to the mainland) | -42.60, 146.30 | About 40,000 years ago (Cosgrove et al. 2010, *Journal of Human Evolution* 59) |

### 3.2 Europe, northern and eastern Asia (milestone 2)

| Id | Date | Place | Lat, lon | Evidence and source |
| --- | --- | --- | --- | --- |
| `levant` | c. 48,000 BCE | Boker Tachtit, Negev | 30.85, 34.77 | Initial Upper Palaeolithic, about 50,000 years ago (Boaretto et al. 2021, *PNAS* 118) |
| `europe` | c. 45,000 BCE | Bacho Kiro Cave, Bulgaria | 42.95, 25.43 | Decided (milestone 2 section 12); 45,800 to 44,000 years ago (Hublin et al. 2020, *Nature* 581); Grotte Mandrin 54,000 debated |
| `swabian-jura` | c. 40,000 BCE | Geißenklösterle and Hohle Fels, Germany | 48.40, 9.77 | Flutes and ivory figures from about 42,000 years ago (Higham et al. 2012, *Journal of Human Evolution* 62) |
| `iberia` | c. 39,000 BCE | Lapa do Picareiro, Portugal | 39.55, -8.67 | 41,000 to 38,000 years ago (Haws et al. 2020, *PNAS* 117) |
| `southern-siberia` | c. 43,000 BCE | Ust'-Ishim, Irtysh river | 57.70, 71.20 | Thigh bone of 45,000 years ago with a complete genome (Fu et al. 2014, *Nature* 514) |
| `east-asia` | c. 43,000 BCE | Southern China | 24.00, 108.00 | Decided as debated (milestone 2 section 12); older Fuyan Cave teeth disputed (Sun et al. 2021, *PNAS* 118) |
| `north-china` | c. 38,000 BCE | Tianyuan Cave, near Beijing | 39.65, 115.85 | About 40,000 years ago (Fu et al. 2013, *PNAS* 110) |
| `tibetan-plateau` | c. 38,000 BCE | Nwya Devu, 4,600 m | 31.00, 90.50 | 40,000 to 30,000 years ago, perhaps in summer only (Zhang et al. 2018, *Science* 362) |
| `japan` | c. 36,000 BCE | Kyushu, Japan | 33.00, 130.70 | About 38,000 years ago, reached by sea even at low sea level (Izuho and Kaifu 2015, in *Emergence and Diversity of Modern Human Behavior in Paleolithic Asia*) |
| `arctic-siberia` | c. 30,000 BCE | Yana River, above the Arctic Circle | 70.70, 135.40 | Decided (milestone 2 section 12); about 32,000 years ago (Pitulko et al. 2004, *Science* 303) |
| `beringia` | c. 23,000 BCE | Beringia land bridge | 65.00, -168.00 | People wait in Beringia while ice blocks the way south, about 25,000 to 16,000 years ago (Hoffecker, Elias and O'Rourke 2014, *Science* 343) |

### 3.3 The Americas (milestone 2)

| Id | Date | Place | Lat, lon | Evidence and source |
| --- | --- | --- | --- | --- |
| `americas` | c. 14,000 BCE | Cooper's Ferry, Idaho, after travelling down the Pacific coast | 45.80, -116.30 | Decided (events.md); about 16,000 years ago (Davis et al. 2019, *Science* 365); the footprints of White Sands, 23,000 to 21,000 years ago, debated (Bennett et al. 2021, *Science* 373) |
| `florida` | c. 12,500 BCE | Page-Ladson, Florida | 30.20, -83.90 | 14,550 years ago (Halligan et al. 2016, *Science Advances* 2) |
| `monte-verde` | c. 12,500 BCE | Monte Verde, Chile | -41.50, -73.20 | Wooden huts covered in hides, 14,500 years ago (Dillehay et al. 2008, *Science* 320) |
| `ice-free-corridor` | c. 11,000 BCE | The corridor between the ice sheets, Alberta | 56.00, -117.00 | Passable for people from about 12,600 years ago (Pedersen et al. 2016, *Nature* 537) |
| `clovis` | c. 11,100 BCE | Great Plains | 37.00, -103.00 | Clovis points, 13,050 to 12,750 years ago (Waters et al. 2020, *Science Advances* 6) |
| `amazon` | c. 10,500 BCE | Caverna da Pedra Pintada, Monte Alegre, Brazil | -2.00, -54.10 | Painted cave of early foragers (Roosevelt et al. 1996, *Science* 272) |
| `andes-highlands` | c. 10,500 BCE | Cuncaicha, Peru, 4,480 m | -15.40, -72.60 | About 12,400 years ago (Rademaker et al. 2014, *Science* 346) |
| `patagonia` | c. 10,500 BCE | Fell's Cave, southern Chile | -52.05, -70.00 | Early foragers at the southern end of the Americas (Prates, Politis and Perez 2020, *Science Advances* 6) |

### 3.4 Back into the north as the ice melts

When the ice sheets melt after about 15,000 BCE, people follow the edge of the ice into land that was empty: northern Europe and Britain (about 13,000 BCE), Scandinavia (Norway's coast about 9500 BCE, Bang-Andersen 2012, *Norwegian Archaeological Review* 45), and the north of Canada. These need no arrival point: the land was inside the culture areas before the ice came, so the arrival map has already opened it, and camps return as soon as the habitat allows (section 5).

### 3.5 After the thresholds

This plan ends at the Neolithic thresholds of section 3.6, where farming begins (Yang, 2026-10-19; until then it ended at 9000 BCE everywhere, decided by Yang on 2026-10-18). Away from the thresholds, foragers keep living as before until the tree ends at c. 6500 BCE (**Proposed**), when farming has not yet reached them: it reaches Greece about 6500 BCE and the rest of Europe, Egypt and India later, which belongs to the farming plan. The lands reached later, all of them by sea or across the Arctic (the Caribbean, the Arctic of Canada and Greenland, the islands of the Pacific, Madagascar, Iceland and New Zealand), get their own plan with the milestones of their dates ([milestones.md](milestones.md)). Antarctica stays without camps for the whole timeline.

### 3.6 Neolithic thresholds and red flags

A **Neolithic threshold** is a place and date where a local population of foragers is about to start farming or herding on its own: the centres of domestication of mainstream archaeology (Larson et al. 2014, *PNAS* 111) that fall before the tree's end. The farming plan (milestone 3) continues from them; this plan only marks them. The records go to `data/curated/neolithic.json` (**Proposed**), each with its source.

| Id | Date | Place | Lat, lon | Evidence and source |
| --- | --- | --- | --- | --- |
| `fertile-crescent` | c. 9500 BCE | Jericho, southern Levant | 31.87, 35.44 | Pre-Pottery Neolithic A, wild cereals sown and harvested (Zeder 2011, *Current Anthropology* 52 S4) |
| `amazonia` | c. 8300 BCE | Llanos de Moxos, Bolivia | -13.60, -65.40 | Squash and manioc on forest islands, about 10,350 years ago (Lombardo et al. 2020, *Nature* 581) |
| `mesoamerica` | c. 8000 BCE | Guilá Naquitz, Oaxaca, Mexico | 16.95, -96.43 | Domesticated squash, about 10,000 years ago (Smith 1997, *Science* 276) |
| `andes` | c. 8000 BCE | Ñanchoc Valley, northern Peru | -6.85, -79.20 | Squash, about 10,000 years ago (Dillehay et al. 2007, *Science* 316) |
| `yellow-river` | c. 8000 BCE | Cishan, Hebei, China | 36.58, 114.10 | Broomcorn millet, about 10,000 years ago (Lu et al. 2009, *PNAS* 106) |
| `new-guinea` | c. 8000 BCE | Kuk Swamp, Papua New Guinea | -5.78, 144.33 | Plants tended at the swamp edge about 10,000 years ago, debated; mounded gardens from about 7000 years ago (Denham et al. 2003, *Science* 301) |
| `yangtze` | c. 7500 BCE | Shangshan, Zhejiang, China | 29.45, 119.97 | Rice cultivation, about 9,400 years ago (Zuo et al. 2017, *PNAS* 114) |
| `south-asia-farming` | c. 7000 BCE | Mehrgarh, Pakistan | 29.38, 67.62 | Barley, wheat and zebu cattle, about 9,000 years ago (Jarrige et al. 1995, *Mehrgarh: Field Reports 1974–1985*) |

Later centres (eastern North America, the Sahel and West Africa, Ethiopia) come after the tree's end and belong to the farming plan.

- **The flag.** From a threshold's date, the camp of the tree nearest its place (within 1,500 km, **Proposed**) puts up a **huge red flag** beside its hearth (a new model `prop-red-flag`: a tall pole with a red cloth, drawn at four times a lodging's height so it is seen from far out; **Proposed**). It is a marker for development, not history: it shows Yang where the farming plan picks up (Yang, 2026-10-19), has no card and goes when the farming plan replaces it.
- **The camps stay.** From the threshold's date, the camps of the tree within 800 km of its place (**Proposed**) stop moving and stop sending out groups: these foragers are settling down, as the Natufians already had in the Levant, and the farming plan starts from them. The flag stays at its camp until the tree ends.
- **Key moment.** Each flag is a key moment of the tree (`neolithic-threshold`, humankind.md section 6.2). The build reports, without failing, every threshold with no camp within 1,500 km on its date.

## 4. The arrival map

The data build turns the arrival points into an **arrival map**: for each cell of the habitat grid (milestone 1 section 4.3), the first day on which people may camp there. It is computed once, by whole-number arithmetic, in a build stage before the tree (`data/build/stages/arrivals.ts`, **Proposed**).

- **Passages** (Yang, 2026-10-20: "I think people walking over ice for migration is fine. They don't have to camp"). An arrival point may be a way through rather than a place to camp (`passage: true` in its record): the ice-free corridor. Its route's way runs through it and the arrival map opens the land along it from its date, but no band is sent to camp near it, and the build's report does not ask for a camp there. Bands cross it, over the ice if need be, and camp wherever the land beyond is livable for them (section 5.2).
- **Along a route.** Between two consecutive arrival points, the land opens along the shortest way over land at the date, passing only the crossings of section 6, at the steady pace that makes the front reach the second point on its date. Coastal routes keep to land within about 300 km of the coast (**Proposed**), as the southern route did.
- **Sideways.** From land that has opened, the rest of the land inside the same culture area opens at a slower background pace (**Proposed** 1 km per year), so the interior fills behind a coastal front over thousands of years.
- **Gating the tree.** Budding (humankind.md section 4.3) and camps moving on may only use land whose arrival day has passed and which is habitable for the profile at that date (section 5). This replaces the prologue's own front after 62,000 BCE, and the walking families of milestone 2 section 9: the migration is the tree budding along the opened land, and the route overlay draws the dotted line of the route while its front moves (spec section 7.2).
- **Checks.** The build fails when the shortest way between two points of a route needs a sea crossing that is not listed, or when an arrival point is not habitable for its profile on its date (the profile's limits of section 5 or the point are then wrong). It reports, without failing, every arrival point whose first camp comes more than 500 years after its date (**Proposed**), so the tree keeps up with the history; at the densities of humankind.md section 4.1 a camp can found another every century or two, about 10 to 20 km a year, faster than any front needs.

## 5. Adapting to the land

### 5.1 Culture profiles are the adaptations

A **culture profile** (milestone 2 section 4) is how people live in one kind of land at one time: clothes, shelters, tools, food, animals and activities. Adapting to a region means taking on the profile of its culture area. The profiles of milestone 2 cover most of the world before 9000 BCE; three gaps are closed by new profiles (**Proposed**), so that nobody wears a fur parka in the Amazon:

| Id | Profile | Area and span (approximate) | Look and life | Typical activities | Prey and animals |
| --- | --- | --- | --- | --- | --- |
| `african-stone-age` | African hunter-gatherers | Africa, whole span | Unchanged (milestone 2 section 4); bone harpoons on lakes and rivers | Gathering, hunting with spears and bows, fishing, shellfish, beads | Eland, gazelle, zebra, wildebeest, fish |
| `coastal-asia-hunter` | Hunter-gatherers of southern Asia | Arabia, India, Sundaland, southern China | Unchanged | Fishing, shellfish, gathering, paddling canoes | Fish, deer, wild pig |
| `west-asia-hunter` (new) | Hunters of western and central Asia | The Levant, Anatolia, the Zagros, the Caucasus and the lands east to the Altai, c. 48,000 to 12,500 BCE, then `natufian` in the Levant | Fitted hide clothes, hide tents and rock shelters | Hunting gazelle, wild goat and horse, knapping long blades, beads of shell | Gazelle, wild goat, horse |
| `first-australians` | First Australians | Sahul, including New Guinea | Unchanged; in New Guinea no cloaks, bark and leaf shelters, digging for yams and gathering pandanus nuts in the highlands | Gathering, hunting, fishing, grinding seeds, rock painting, burning grass | Kangaroo, fish |
| `ice-age-hunter` | Ice-age hunters of Europe | Europe, c. 45,000 to 9000 BCE (extended from 10,000 BCE, so Europe does not stand empty before milestone 3) | Unchanged | Unchanged | Reindeer, horse, mammoth, bison |
| `steppe-beringia-hunter` | Mammoth hunters of Siberia and Beringia | Siberia from c. 43,000 BCE, Arctic Siberia and Beringia from c. 30,000 BCE, the ice-free north of North America | Unchanged | Unchanged | Mammoth, reindeer, horse, bison |
| `east-asia-hunter` (new) | Hunters of northern China, Korea and Japan | c. 38,000 to 9000 BCE | Fitted hide and fur clothes, hide tents, the first clay cooking pots from c. 18,000 BCE | Hunting deer, fishing, gathering nuts, making pottery | Deer, wild boar, fish |
| `first-americans` (new) | First people of the Americas | The Americas south of the ice, c. 14,000 to 9000 BCE | Hide and plant-fibre clothes, light in the tropics; huts of wooden frames covered in hides (Monte Verde); fluted Clovis points on the plains | Hunting mammoth, mastodon and bison on the plains, fishing and gathering shellfish on the coasts, gathering in forests, knapping points | Mammoth, mastodon, bison, guanaco, ground sloth, fish |
| `neanderthal`, `natufian` | | Unchanged | | | |

Each new profile needs a man, a woman and a child and its shelter in the prehistoric model set (milestone 2 section 13.3), reusing the shared skeleton and clips; Yang approves them as usual. New shelters (**Proposed**): `shelter-monte-verde-hut` for `first-americans`; `west-asia-hunter` and `east-asia-hunter` reuse `shelter-hide-tent` in a lighter colour.

### 5.2 Limits of a way of life

Each profile carries **limits** that, together with the land, ice and desert of milestone 2 section 3.1, decide where its camps may stand. They are what makes adapting necessary: a band can only spread into colder or higher land after its people have the profile, and the know-how, that lets them live there.

| Limit | Meaning | **Proposed** values |
| --- | --- | --- |
| `coldestC` | The lowest annual mean temperature (Beyer et al. 2020, BIO1, already in `data/sources/beyer-2020/`) at which camps may stand | Light clothing and hide cloaks (`african-stone-age`, `coastal-asia-hunter`): 5 °C; cloaks and fitted clothes (`first-australians`, with possum-skin cloaks in the south, `west-asia-hunter`, `east-asia-hunter`, `first-americans`, `natufian`): 0 °C; tailored furs sewn with eyed needles (`ice-age-hunter`): −15 °C; the mammoth hunters of Siberia (`steppe-beringia-hunter`): −28 °C, since the climate data gives the Yana site −27.7 °C at 30,000 BCE; `first-americans` −5 °C, for the ice-free corridor (tuned on 2026-10-19). Desert is aridity of 0.8 or more, as before, only where Köppen's rule for dry climates agrees (annual rain under 10 mm per °C of the annual mean plus 140 mm), so the cold, dry steppes of the Ice Age are not deserts |
| `highestM` | The highest ground for camps, replacing the single 3,500 m of humankind.md section 5 | 3,500 m; 4,800 m for the people of the Tibetan Plateau from c. 38,000 BCE and of the Andes from c. 10,500 BCE |
| `crossing` | The widest water a band can cross by boat (section 6) | Small canoes, about 100 km, for every profile that lives on a coast |

The values are tuned so that every arrival point of section 3 is habitable on its date (the check of section 4) and so that, during the coldest part of the last Ice Age (about 24,000 to 17,000 BCE), the camps of northern Europe and Siberia pull back south into the refuges where archaeology finds people: southwest France and Spain, Italy, the Balkans, Ukraine and southern Siberia. This comes from the climate data, not from extra rules: the camps move away from cold land as they move away from rising sea (humankind.md section 4.4), and come back when it warms.

### 5.3 How a band adapts on screen

The profile of a figure follows the culture area of its camp (humankind.md section 3.1), so a band that founds a camp in a new area belongs to the new profile. Nobody changes clothes in mid-step (spec section 5):

- **Into the hut, out in new clothes.** When the profile at a camp changes, because the band moved into a new area or because a profile begins on that date, each figure changes once, at a moment chosen by hash within one residence window (100 years, about 4 minutes of watching, **Proposed**): it walks into its lodging and comes out in the clothes and with the tools of the new profile. The camp's lodgings take the new kind when the band next builds them.
- **The first camp of a new profile** starts a branch (humankind.md section 3.3) and is a key moment.
- **Tools that arrive later** within a profile, such as the spear-thrower from c. 16,000 BCE or pottery from c. 18,000 BCE, are part of the profile's variants by date (milestone 2 section 4) and appear the same way.

### 5.4 Adaptation moments

Some adaptations are worth a card of their own. They are events of type Invention or idea (spec section 5), each at the place of its earliest accepted evidence, with a timeline icon and a card in English and German; the first camp near it shows the thing being made or used, as an ordinary camp activity. The first list (**Proposed**, sources checked when the records are written):

| Id | Date | Place | en | de | Source to check |
| --- | --- | --- | --- | --- | --- |
| `bows-and-arrows` | c. 62,000 BCE | Sibudu, South Africa | Bows and arrows | Pfeil und Bogen | Lombard and Phillipson 2010, *Antiquity* 84 (already a dated variant) |
| `boats-to-sahul` | c. 50,000 BCE | Timor Sea | The first sea voyages | Die ersten Seereisen | Bird et al. 2019, *Scientific Reports* 9; Kaifu et al. 2020, *Scientific Reports* 10 (a dugout canoe paddled from Taiwan to Yonaguni in 2019 to test such a voyage) |
| `ground-axes` | c. 45,000 BCE | Kimberley, Australia | Axes with ground edges | Geschliffene Beile | Hiscock et al. 2016, *Australian Archaeology* 82 |
| `eyed-needles` | c. 38,000 BCE | Altai, southern Siberia | Sewing with eyed needles | Nähen mit Öhrnadeln | Gilligan 2010, *Journal of Archaeological Method and Theory* 17 |
| `ice-age-music` | c. 40,000 BCE | Swabian Jura | The first flutes | Die ersten Flöten | Higham et al. 2012, *Journal of Human Evolution* 62 |
| `living-high` | c. 38,000 BCE | Nwya Devu, Tibet | Living on the roof of the world | Leben auf dem Dach der Welt | Zhang et al. 2018, *Science* 362 |
| `obsidian-voyages` | c. 36,000 BCE | Kōzushima, Japan | Sailing for stone | Mit dem Boot nach Stein | Ikeya 2015, in *Emergence and Diversity of Modern Human Behavior in Paleolithic Asia* |
| `grinding-seeds` | c. 30,000 BCE | Cuddie Springs, Australia | Grinding seeds into flour | Samen zu Mehl mahlen | Fullagar and Field 1997, *Antiquity* 71 |
| `first-pottery` | c. 18,000 BCE | Xianrendong Cave, China | The first cooking pots | Die ersten Kochtöpfe | Wu et al. 2012, *Science* 336 |
| `spear-thrower` | c. 16,000 BCE | Southwest France | The spear-thrower | Die Speerschleuder | Already a dated variant (milestone 2 section 13.3) |
| `mammoth-bone-huts` | c. 13,000 BCE | Mezhyrich, Ukraine | Houses of mammoth bones | Häuser aus Mammutknochen | Already in milestone 2 section 13.3 |
| `first-dogs` | c. 13,000 BCE | Bonn-Oberkassel, Germany | People and their first dogs | Menschen und ihre ersten Hunde | Janssens et al. 2018, *Journal of Archaeological Science* 92 |
| `kelp-highway` | c. 11,000 BCE | Channel Islands, California | Boats along the Pacific coast | Mit Booten die Pazifikküste entlang | Erlandson et al. 2011, *Science* 331 |
| `clovis-points` | c. 11,100 BCE | Great Plains | Clovis spear points | Clovis-Speerspitzen | Waters et al. 2020, *Science Advances* 6 |

**Dogs** (**Proposed**): from c. 13,000 BCE, camps of `ice-age-hunter`, `steppe-beringia-hunter` and `east-asia-hunter` keep one dog, which follows the figures on their outings, using a new model `animal-dog`. This moves the first dogs from milestone 3 (milestone 2 section 13.3) to this plan; the card says that wolves became dogs somewhere in Eurasia, perhaps earlier, and that the place and date are still debated (Bergström et al. 2020, *Science* 370).

### 5.5 Prey on the hunt

Hunting outings (humankind.md section 8.1) show no prey yet. With this plan each profile names its prey (section 5.1, from the approved wildlife models of [wildlife.md](wildlife.md)), and a hunting outing shows one animal of a species chosen by hash, standing at the far end of the outing and walking off as the hunter turns back carrying meat, so nothing is shown being killed (**Proposed**). An extinct species is never chosen after its extinction date (wildlife.md), so the mammoths leave the hunts when they leave the world.

## 6. Crossing water

Low sea levels joined many lands that are islands today: Sunda (Sumatra, Java, Borneo to Asia), Sahul (New Guinea and Tasmania to Australia), Beringia (Siberia to Alaska), Britain and Doggerland, and Japan's main islands to each other. The sea level curve of milestone 1 already draws these, so walking across them needs nothing new. Where water remained, people crossed it in small boats, and only at listed **crossings** (`data/curated/crossings.json`, **Proposed**), like the straits of `straits.json`:

| Id | Route | Width at the time, approximate | Date |
| --- | --- | --- | --- |
| `bab-el-mandeb` | Africa to Arabia | About 5 to 10 km at 60,000 BCE | c. 60,000 BCE |
| `wallace-line` | Bali to Lombok, and on through Wallacea | Up to about 30 km per strait | c. 51,000 BCE |
| `timor-sahul` | Timor or the Moluccas to Sahul | About 70 to 90 km | c. 50,000 BCE |
| `bismarck` | New Guinea to New Ireland | About 30 km | c. 38,000 BCE |
| `korea-japan` | Korea to Kyushu | About 20 to 40 km | c. 36,000 BCE |
| `channel-islands` | California coast to Santa Rosae | About 10 km | c. 11,000 BCE |

- **On screen.** A band budding across a crossing walks to the shore, where its people make small canoes, one for every two or three of them (a new model `prop-canoe`, **Proposed**: a short dugout of a hollowed log, or bark sewn over a frame of bent sticks, with simple paddles; decided by Yang on 2026-10-18: small boats, canoes), and paddle across with the `paddle` clip (milestone 2 section 5.3). They land, pull the canoes up the beach and build their camp; the canoes stay on the shore of a coastal camp while it stands. The crossing takes about a minute of watching (25 years, **Proposed**), far longer than life, so it can be seen, as stretched events are (milestone 2 section 6.7). The card says that no boat this old has survived, so nobody knows exactly what they looked like, and that the oldest boat ever found, the Pesse canoe from the Netherlands, is a dugout of about 8000 BCE.
- **The rule.** The tree's rule that the way to a new camp is land all the way (humankind.md section 4.1) stays; a crossing is the one exception, and only for a profile whose `crossing` is at least the crossing's width at the date.
- **Gibraltar** is not a crossing: there is no accepted evidence that people crossed it before the Neolithic.

## 7. What the viewer sees

- **The route overlay.** While a route's front is moving, its dotted line is drawn from the last point reached to the next, with the next point's name (spec section 7.2). Finished stretches fade out.
- **Key moments.** Every arrival point and adaptation moment is a mark on the timeline with an icon (Migration, Voyage or Invention or idea), and double-clicking it flies to the first camp there at its date (milestone 2 section 10). They make the long stretches between 60,000 and 9000 BCE (about 34 hours at regular speed) easy to jump through.
- **Cards.** Each arrival card says who arrived, how (on foot along the coast, by canoe, over the land bridge), what was new about the land (colder, higher, forest, desert) and how people lived there, in two or three sentences at an 11 to 12-year-old reading level, in English and German, with its source. Drafts for the first and the most important ones:
  - `bab-el-mandeb` en: "Small groups cross the narrow sea between Africa and Arabia. The sea was lower then, so it was only a few kilometres wide. Their children's children walk on along the coasts, collecting shellfish and fishing, and in about 10,000 years their families reach Australia."
  - `bab-el-mandeb` de: "Kleine Gruppen überqueren das schmale Meer zwischen Afrika und Arabien. Der Meeresspiegel lag damals tiefer, darum war es nur wenige Kilometer breit. Die Kinder ihrer Kinder wandern die Küsten entlang weiter, sammeln Muscheln und fischen, und in etwa 10.000 Jahren erreichen ihre Familien Australien."
  - `europe` en: "People from western Asia reach Europe. It is much colder than today, and Neanderthals have lived here for a very long time. The newcomers sew fitted fur clothes and hunt reindeer and horses. For a few thousand years both kinds of people live in Europe, and some have children together."
  - `europe` de: "Menschen aus Westasien erreichen Europa. Es ist viel kälter als heute, und hier leben schon sehr lange Neandertaler. Die Neuankömmlinge nähen sich passende Kleidung aus Fell und jagen Rentiere und Pferde. Einige tausend Jahre lang leben beide Menschenarten in Europa, und manche bekommen gemeinsame Kinder."
  - `americas` en: "The first people reach the Americas. Their families had lived for thousands of years in Beringia, the land between Siberia and Alaska that is under the sea today. When the ice opened a way along the Pacific coast, they travelled south, perhaps by boat. Some scientists think people arrived even earlier."
  - `americas` de: "Die ersten Menschen erreichen Amerika. Ihre Familien hatten Tausende Jahre in Beringia gelebt, dem Land zwischen Sibirien und Alaska, das heute unter dem Meer liegt. Als das Eis einen Weg die Pazifikküste entlang freigab, zogen sie nach Süden, vielleicht mit Booten. Manche Forscher glauben, dass Menschen noch früher kamen."
- **Family line.** The family line on a figure card (humankind.md section 6.2) names the arrival branches it passed, so a girl in Chile at 12,000 BCE "comes from the first person at Lake Turkana, left Africa about 60,000 BCE, crossed Beringia and reached the Americas about 14,000 BCE".

## 8. Build, tests and tools

- **Records.** `data/curated/arrivals/<route>.md` (routes with their points, en and de names and cards, sources), `data/curated/crossings.json`, the new and changed culture profiles with their limits, and the adaptation moments as event records. All of them have `en` and `de`.
- **Build.** The arrival stage (section 4) runs before the tree stage and writes the arrival map at the habitat grid's size, one whole-number day per cell, which the tree stage reads. The tree stage takes each profile's limits instead of the single height and adds the crossing rule. Everything stays deterministic (humankind.md section 5).
- **Checks** (failing the build): every arrival point is on land and habitable for its profile on its date; every route's shortest way uses only listed crossings; no camp stands on land before its arrival day or outside its profile's limits; no branch reaches a continent before its arrival point (replacing the culture-area check of milestone 2 section 3.1).
- **Report.** `npm run tree -- report` adds, per arrival point, the date of its first camp and the lag behind the arrival date, and per culture area, its camps over time, so the Ice Age retreat into the refuges can be read.
- **Development view.** `?tree` (humankind.md section 6.2) colours the arrival map on the globe as bands of arrival date, every 5,000 years (**Proposed**).
- **Tests.** Unit tests for the arrival map (a front reaches each point on its date; nothing opens across an unlisted strait), for the limits (a band of `coastal-asia-hunter` never camps below 5 °C) and for the change of clothes (a figure changes once, inside its lodging, at the same clock time on every run).

## 9. Order of work

Each step is a slice with its own preview for Yang (feedback first), after the camps of humankind.md settle:

1. **Arrival map and southern route**: arrival points of section 3.1, the `bab-el-mandeb` and Wallacea crossings with canoes, `coastal-asia-hunter` and `first-australians` camps; people reach Sahul.
2. **North and west**: `west-asia-hunter`, `ice-age-hunter`, `steppe-beringia-hunter` and `east-asia-hunter` with the cold limits, the change of clothes, Neanderthals meeting modern humans and disappearing, the Ice Age retreat and return.
3. **The Americas**: Beringia, the coast route, `first-americans`, the ice-free corridor.
4. **Adaptation moments, prey and dogs**, and the route overlay and cards.

New models (the men, women and children of three profiles, `shelter-monte-verde-hut`, `prop-canoe`, `animal-dog`) go to Yang for approval in the step that first needs them.

### 9.1 The first implementation (Yang, 2026-10-19)

Asked to implement the spread across the continents in one go, the first implementation builds steps 1 to 3 together and leaves the rest for later slices (**Proposed**):

- **Built.** The arrival points and routes of section 3 as a provisional `data/curated/arrivals.json` (en and de names, sources; the Markdown records with cards follow with step 4), the arrival map of section 4 (without the 300 km coastal rule, which the routes' points already keep close to), the crossings of section 6 with canoes, culture areas for every profile of section 5.1 with the limits of section 5.2 (`coldestC` from the climate data, `highestM`, held per culture area so the Tibetan Plateau and the Andes can have their own), the change of clothes in the hut (section 5.3), prey for the hunts of every profile (section 5.5, with the spear hunt and pole carry of humankind.md section 8.1 rather than an animal walking off), the Neolithic thresholds and red flags (section 3.6), and the tree running to c. 6500 BCE.
- **Prey** per profile (**Proposed**), from the approved wildlife models that two people can carry on a pole: `african-stone-age` zebra and eland; `coastal-asia-hunter`, `west-asia-hunter`, `east-asia-hunter` and `natufian` gazelle; `first-australians` kangaroo; `ice-age-hunter` and `steppe-beringia-hunter` reindeer; `first-americans` guanaco.
- **Canoes** (**Proposed**): one small canoe for each person, paddled at walking pace (a few seconds of watching for a crossing at the drawn size), not the minute of section 6; the canoes are not left on the shore yet.
- **Sites.** Bands camp at the sites of [sites.md](sites.md) and follow routes along its links (sites.md section 4), which replaces the free search for spots and the route bands of the first draft of this section (Yang, 2026-10-19).
- **Later.** Neanderthals as the second root and their meeting with modern humans, the adaptation moments and dogs of sections 5.4 and 5.5, the route overlay, the arrival cards and timeline marks, the family line on the card, the 300 km coastal rule, the report and the development view of section 8.

## 10. Changes to the rest of the spec

- [milestone-2.md](milestone-2.md) section 9: the front comes from the arrival map of section 4; the walking families are replaced by the tree's budding bands; the raft crossings become canoe crossings at the listed crossings of section 6. Section 4 gains the three new profiles and the limits; `ice-age-hunter` runs to 9000 BCE. Section 13.3 gains the new models. Section 12's migration dates are kept and refined by section 3 (southern Siberia now from c. 43,000 BCE; Arctic Siberia at c. 30,000 BCE as before).
- [humankind.md](humankind.md) section 4: camps may only stand on land the arrival map has opened and within their profile's limits; the 3,500 m height limit becomes the profile's `highestM`.
- [events.md](events.md): the three migration events stay; the arrival points and adaptation moments are added as events when their records are written.

## 11. Open questions for Yang

None at the moment.
