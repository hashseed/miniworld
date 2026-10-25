# Farming spread

How the **farming onset day** of any place is computed (issue 128). Status: **Implemented**, with the decisions of section 7 taken by the most defensible choice; the numbers marked approximate in `data/curated/farming.json` stay open for Yang to adjust (section 7). The implementation is in section 9. It continues [peopling.md](../peopling.md) section 3.6: the eight Neolithic centres of `data/curated/neolithic.json` are the seeds, and the farming plan spreads from them. The timeline runs to 1991 CE, so late waves (Japan, the Eastern Woodlands, Bantu farmers, Polynesia) are inside it.

## 1. Method: wave of advance with dated anchors

Archaeology and models agree on one picture. Farming spread as a front at a roughly constant speed per region, not as jumps: about 1 km per year across Europe (Pinhasi, Fort & Ammerman 2005, *PLoS Biology* 3(12): 0.6 to 1.3 km/yr, 95% interval, from 735 early-Neolithic sites; Fort 2015, *J. R. Soc. Interface* 12: demic plus cultural diffusion, same order; Silva & Steele 2014, *J. Archaeol. Sci.* 52, Isern et al. 2017, *PNAS* 114), fast along Mediterranean coasts (the Cardial spread from Italy to Portugal at about 5 km/yr, Zilhão 2001, *PNAS* 98; Isern et al. 2017), slow with detours in the Americas (Bellwood 2005, *First Farmers*; Larson et al. 2014, *PNAS* 111).

The onset `T(x)` (a year, BCE positive, CE negative; converted to whole days with the calendar of the timeline) of a place `x` is:

```
wave(x) = min over seeds s of ( s.bce - cost(s, x) )
T(x)    = max( wave(x), max over holds h containing x of h.notBeforeBce )
```

- **Seeds** are the eight centres (`neolithic.json`, with their own dates) and every waypoint of `farming.json`. Each is a dated observation that farming was there; it is also a seed because the wave continues from it.
- **cost(s, x)** is the least-cost path length from `s` to `x` in years: the sum over path segments of `length_km / kmPerYear(zone)`. The path runs over land cells of the land mask already used for the tree (peopling.md section 4); it may cross open water in hops of at most `seaMaxHopKm` (900 km, approximate); sea hops and the 50 km coastal strip of the Mediterranean and Black Sea are charged at the zone's coastal speed. Zones are lat/lon boxes, first match wins, `default` otherwise. Polynesian voyaging uses `island-voyaging`.
- **Holds** are boxes with a `notBeforeBce` floor. They stop a wave that is faster than history: farming stood on the Continental coast around 4800 BCE but crossed the Channel only about 4000 BCE (Whittle, Healy & Bayliss 2011, *Gathering Time*), and Polynesian islands were settled late (Wilmshurst et al. 2011, *PNAS* 108).
- **Irrigated land:** `irrigated` boxes in `farming.json` (the Mesopotamian plain, the lower Indus, the oases round Tehran and Sialk) waive the dry-climate limit, because those places were farmed on river or spring water (Wilkinson 2003; Possehl 2002). Without them the dry rule left Mesopotamia, Sindh and the Iranian plateau with no farming at all.
- **No farming:** `noFarming` boxes (mainland Australia, Antarctica) never get an onset. Cells whose limits fail the culture area (cold, dry, high: peopling.md section 5.2) also get none; the same limits as the tree, no new numbers.
- Computation: one Dijkstra over a coarse grid (about 50 km cells) at build time, written to a small raster in the content chunks; at runtime the onset is a lookup, so the world stays a pure function of the date.

### Why waypoints are seeds, not overrides

A seed can only make the onset earlier than the wave, and the holds only later; so every waypoint satisfies `T(w) <= w.bce` by construction. What can go wrong is the opposite, a wave arriving much too early from an older seed. The check of section 6 catches that, and the fix is a speed, a hold or a missing waypoint, never a patch at one place.

## 2. Speeds

| Zone | km/yr | Range | Source |
| --- | --- | --- | --- |
| Europe and Near East | 1.0 | 0.6 to 1.3 | Pinhasi et al. 2005; Fort 2015 |
| Mediterranean coast and sea hops | 1.5 (approx.) | 1 to 6 | Zilhão 2001 (5 km/yr, western Mediterranean only); fitted over the whole sea |
| Africa (Sahel, Bantu) | 1.5 (approx.) | 1 to 2.5 | derived from the Bantu waypoints; Currie et al. 2013, *PLoS ONE* 8 |
| East Asia | 0.65 (approx.) | 0.5 to 1.0 | derived from the Yellow River to Yangtze waypoints |
| Japan | 1.5 (approx.) | 1 to 2.5 | derived from Itazuke, Kinki and Tohoku (Yayoi) |
| South Asia | 0.7 (approx.) | 0.4 to 1.0 | derived from Mehrgarh to the Ganges and Deccan |
| Americas | 0.5 (approx.) | 0.3 to 0.8 | derived from Mesoamerica to Arizona (2100 BCE) and the Eastern Woodlands |
| Island voyaging | 5.0 (approx.) | 3 to 7 | derived from Taiwan, Luzon, Bismarck, Tonga; applies to open water only inside its box (lat -30 to 25, lon 105 to 180), elsewhere water runs at the speed of the land zone around it |

Only the first row is a published rate. The others are our fit to the dated waypoints and are marked approximate in the data. The first fit (4 km/yr over every sea and 5 km/yr over every ocean) made every wave arrive thousands of years early, so section 9.2 and 9.3 add a start date per centre and regional holds.

## 3. Waypoints

`data/curated/farming.json` holds 73 waypoints (Vinča and Cahokia were dropped: they are later cultures on ground where farming had begun, at the Starčevo site and in the Mississippi valley): `id`, `bce` (negative for CE), `lat`, `lon`, `en`, `de`, `package` (`en`, `de`), `source`, optional `"approximate": true`, and `toleranceYears` for the check. Summary by region (dates BCE unless CE):

| Region | Waypoints (date) |
| --- | --- |
| Near East, Cyprus, Anatolia | Cyprus 8500, central Anatolia 8200, Zagros 8000, west Anatolia 6600, Jeitun 6000 |
| Aegean and Balkans | Crete 7000, Thessaly 6500, Starčevo 6100, Dalmatia 5900, Cucuteni 5000 |
| Central and west Europe | Transdanubia 5550, Vaihingen 5450, Elsloo 5300, Paris Basin 5100, Brittany 4800 |
| Mediterranean west | Apulia 6000, Provence 5600, Valencia 5500, Portugal 5400, Morocco 5500 |
| North Europe | Britain 4000, Ireland 3800, Denmark 3950, S Sweden 3900, Oslofjord 3800, Finland 2300, Iceland 874 CE |
| Steppe | Pontic herders 5000 (herding only) |
| Egypt and Sahara | Fayum 5400, Takarkori 5200, Nabta Playa 6000 (debated) |
| Sub-Saharan Africa | Turkana 3300, Dhar Tichitt 2000, Ethiopia 2000, Kintampo 1700, Kenya Rift 1000, Cameroon 1000, Great Lakes 500, Limpopo 300 CE |
| South Asia | Ganges 6000 (debated), Deccan 3000 |
| East Asia | Houli 6500, Xinglongwa 6000, Dadiwan 5800, Hemudu 5000, Tibet 3300, Korea (Dongsam-dong millet) 3300, Kyushu 900, Kinki 600, Tohoku 400 |
| South-East Asia and Pacific | Taiwan 3500, Luzon 2200, Thailand 2000, Vietnam 2000, Marianas 1500, Bismarck 1500, Tonga 900, Samoa 800, Society Is. 1000 CE, Hawaii 1100 CE, Easter Is. 1200 CE, New Zealand 1280 CE |
| Americas | Panama 4500 (preceramic maize and manioc), Ecuador 3500, Caral 3000, Maya lowlands 2500, Arizona 2100, Eastern Agricultural Complex 1800, Titicaca 1500, Caribbean 400, Ohio 200 CE, Taquara 400 CE, Ontario 600 CE |

Checked against sources on 2026-10-24 and kept: Fayum 5400 (domesticates 5400 to 5200 BCE; caprines about 5600) and Ganj Dareh 8000 (goats managed by about 8200 BCE). East Asia needs no faster zone: with the centre dates of section 9.2 Beijing gets farming 5900 BCE, Seoul 3100, Busan 3400. Colombia follows the Panama waypoint (Cali about 3000, Bogotá 2600 BCE); the Orinoco basin and Caracas stay late (about 1100 to 1250 BCE), as the lowland forest was farmed late.

Most dates outside Europe are approximate; the file says which. Dates of the Sahara, the Ganges, Ethiopia and the Eastern Woodlands are debated and should be shown as "about" in the UI.

## 4. Data to download (not in the repo)

| Data | Where | Licence |
| --- | --- | --- |
| Pinhasi et al. 2005 site list (735 sites, Near East and Europe) | supplement of the PLoS Biology article, doi 10.1371/journal.pbio.0030410 | CC BY 4.0 |
| p3k14c, a global radiocarbon database (Bird et al. 2022, *Sci. Data* 9) | p3k14c.org | CC BY 4.0 |
| Isern et al. 2017 and Fort 2015 model outputs | article supplements (PNAS, J. R. Soc. Interface) | check per article; CC BY where open access |
| Bocquet-Appel et al. 2009 Neolithic database | article supplement (*Radiocarbon* 51) | licence unclear; do not use without Yang's approval |
| Zanon et al. 2018 / Bird et al. 2022 for cross-checks | open access | CC BY |

Only a simplified extract (id, lat, lon, date, source) of the CC BY sets would go to `data/sources/`, used to test the waypoint dates, not at runtime. No download was made for this draft; the waypoint dates are from the cited papers and still need a pass against the extracts.

## 5. Package and presentation

Each waypoint names the package that arrived (`package.en`, `package.de`). A place's package is that of the seed that set its onset. Herding-only regions (Sahara, steppe, East Africa) say so; no crops are shown before their onset.

## 6. Build check

The build fails when:

1. a waypoint is missing `en`, `de`, `source` or valid coordinates, or a mark `approximate` is missing on a date its source calls uncertain;
2. `|T(w) - w.bce| > w.toleranceYears` for any waypoint (the computed onset at Thessaly, Vinča, Vaihingen, Provence, Portugal, Britain, Denmark, Fayum, Kyushu, Tonga and every other waypoint must be within its tolerance: 200 to 250 years where dated well, 300 to 1000 where approximate);
3. onset is not monotone: no place has an onset earlier than a seed that is its least-cost ancestor minus the path cost (a sanity check of the Dijkstra);
4. a centre of `neolithic.json` has an onset later than its own date;
5. the report lists every place with a wave more than 500 years earlier than the nearest dated waypoint within 300 km, so a missing waypoint is visible.

## 7. Decisions

The questions of the draft are resolved as follows (the lead agent asked for the most defensible choice; Yang can overturn any of them).

1. **Gradual spread by wave, with holds.** The wave is more faithful; the holds are documented pauses with sources (section 9.3).
2. **Speeds other than Europe** are accepted as approximate fits and say so in the data and in section 2.
3. **Sea hops** of 900 km are implemented as water passable within 450 km of land (section 9.1). Larger hops fill the Pacific too early.
4. **Debated dates** (Sahara cattle, Ganges rice, Kuk, Ethiopia, Eastern Complex) are shown, marked "about" (`approximate: true`) in the data and in the cards, never hidden.
5. **Later centres** (Eastern North America, Sahel, Ethiopia, West Africa) stay waypoints, not tree thresholds.
6. **Polynesia, Iceland and the Caribbean:** the farming dates of this file are the farming dates; the later-arrivals plan owns when people first land. The holds of `farming.json` keep the wave from reaching these lands earlier than the arrival.
7. **Date convention:** a negative `bce` means CE (-1000 is 1000 CE), converted to days with the timeline's calendar (`dayOfFarmingYear`).
8. **Mesolithic foragers who keep their way of life** (Britain before 4000 BCE, Ertebølle, Jomon): only the label changes; the holds delay the onset to their date.

## 8. Sources

Pinhasi, Fort & Ammerman 2005 (PLoS Biology 3(12)); Fort 2015 (J. R. Soc. Interface 12); Isern et al. 2017 (PNAS 114); Silva & Steele 2014 (J. Archaeol. Sci. 52); Zilhão 2001 (PNAS 98); Larson et al. 2014 (PNAS 111); Bellwood 2005 (*First Farmers*); Whittle, Healy & Bayliss 2011 (*Gathering Time*); Wilmshurst et al. 2008, 2011 (PNAS 105, 108); Bird et al. 2022 (Sci. Data 9); further site sources per record in `farming.json`.

## 9. Implementation

### 9.1 Build

`data/build/lib/farming.ts` (pure, tested in `farming.test.ts`) computes the onset; `data/build/stages/farming.ts` reads and validates `farming.json`, builds the land and habitability callbacks from the map and climate, runs the check of section 6 and writes `farming.<hash>.bin`, named in `manifest.farming`.

- **Grid:** 0.5 degree cells, 720 columns by 360 rows, row 0 at the north pole, column 0 at 180 W; moves between the eight neighbours, length by the cell's latitude (no random numbers, `detmath` sines).
- **Land** is the land mask at the sea level of 6000 BCE, lakes are not land, and a cell is land if any of 5 sample points is. A seed's own cell is always land. Water within 450 km (half of `seaMaxHopKm`) of land is passable, except inside `barriers` (the North Pacific, so the wave cannot cross Beringia by water).
- **Two waves:** one from all seeds gives the onset; one from the seeds that are not `herdingOnly` gives the first crops. Where the second is later, herding is the stage between the two. The herding-only seeds are Takarkori, Nabta, Yamnaya, Turkana, Kenya Rift and South India.
- **Exclusion** at the onset year: mean temperature below -5 C, a dry climate by the Köppen rule, ice, and ground above 3500 m (4800 m on the Andean and Tibetan plateaus) get no onset; so do the `noFarming` boxes. Seed cells are always valid.
- **Arrival after 2000 CE:** a year later than the raster holds (2000 CE) is stored as none, never as a wrapped-round year; before this rule 5,000 cells in Alaska and southern New Zealand read as farmed since the ice age.
- **File:** u32 little-endian header length, a JSON header `{ seeds }` (id, date, approximate, herding-only, names, package of each seed), then five planes of 720 x 360 bytes: onset high bytes, onset low bytes, crop delay high and low bytes, the index of the seed + 1 that set the onset. A year is stored as `round(bce) + 2001`, 0 meaning none; a delay of 0xffff means no crops. About 1.3 MB, about 60 KB after Brotli.

### 9.2 Start date of a centre

A centre's date is when farming first stood at its place; the package is complete and spreads outward only later. `farming.json` gives each centre an optional `spreadBce` (always later than its date) and a `spreadNote` with the source; the wave starts from `spreadBce`, the centre's own cell keeps its date. Without it every wave started 1000 to 4000 years early (Cyprus 9350 BCE against 8500, Mesoamerica to the Maya lowlands 7000 against 2500). The country round a centre is not held back with the package: land within `CENTRE_CORE_KM` (100 km) of a centre that is habitable at the centre's date also starts at the centre's date and belongs to its seed, so that the camps there, and the scene, turn Neolithic when the centre's event (events.md first-farming events) says (Yang, 2026-10-24: the Fertile Crescent turned Neolithic in 5400 BCE and the Yangtze later than their events, 9500 and 7500 BCE). Values: Fertile Crescent 8500, Yellow River 6300, Yangtze 5200, South Asia 6500 BCE, all approximate. The other centres need none, because their dates are those of the first villages with fields. Centre dates (neolithic.json, peopling.md 3.6): Fertile Crescent 9500, South Asia 7000, Yellow River 6500, Yangtze 5750, New Guinea 5000, Mesoamerica 4300, Andes 3500, Amazonia 3500 BCE. The signs of the first-farming events follow these dates (Yang, 2026-10-24: "anchor events so that the dates reflect history", and neighbouring bands should adopt farming soon, with few exceptions).

### 9.3 Holds

Each hold in `farming.json` is a box with a `notBeforeBce`, a source and `approximate`. Besides Britain, Scandinavia and Polynesia there are regional pauses that the dated waypoints force: the Anatolian pause (Aegean 6450), the Balkans 6250, the steppe by river (Don and Pontic 3800, Volga 4600, west of the Dnieper 5300), Cucuteni 5600, the Caucasus 5800, the Iranian plateau 6400, Egypt and the Sahara 5500, the central and western Mediterranean 5900, Ertebølle 4100, Finland 2600; Korea 3500, the Mesopotamian alluvium 6200, the Indus and Ghaggar-Hakra plains 4500, the Russian forest zone 2900, Hokkaido 700, the Ryukyu Islands 900, Kyushu 1000, eastern Japan 700, Taiwan 3600, mainland South-East Asia 2300, Luzon 2300, Wallacea 1600, the Deccan 3200, Tibet 3500; the Maya lowlands 2900, the Peruvian coast 3200, the altiplano 2100, the American Southwest 2300, the Antilles 500, the Eastern Woodlands 150 CE, southern Brazil 100 CE; and Africa south of the Sahara (West Sahel 2400, Guinea forest 1900, Turkana 3500, Ethiopia 3000, the Rift 1500, the Great Lakes 800, Cameroon 1500, Limpopo 100 CE). The calibration is the fit of section 6: with them every waypoint is within its tolerance and no centre is later than its date.

### 9.4 App module

`app/src/world/farmingOnset.ts` holds the lookup:

- `farmingOnsetDay(lat, lon): number | null` is the whole-day onset (null for sea, ice, desert, high ground, mainland Australia), `cropFarmingDay(lat, lon)` the day of the first crops.
- `settlementStage(lat, lon, day)` is `none`, `herding` (from the onset to the first crops, where herders came first) or `farming`.
- `farmingStateAt(lat, lon, day)` gives `{ farming, stage, sinceDays, profile, fieldTool, package }`. The profile applies from the first crops, by the interim boxes of people-profiles.md section 1 (each farming profile's `areas` in the culture table `cultures.json`; where boxes overlap, the profile with the lower `areaRank` wins) until the polygons are drawn into `culture-areas.json`; the field tool is the `ard` from the profile's `ardFromBce`, otherwise the profile's `fieldTool` (the digging stick for the Mesoamerican and New Guinea highland farmers, the hoe for the rest).
- `FarmingGrid` decodes the file; `setFarmingGrid` installs it. The loader fetches `manifest.farming` together with the lens bytes at startup and sets it before the first tree scene is computed, in the app and, by message `farming`, in the scene worker, so the world never depends on load timing. The data build sets it before the tree is built, which gives the camps their Neolithic culture (humankind.md section 8.5). No query is made before it is set (all return null or `none`).

### 9.5 First-farming events

Each of the eight centres is an event of the events dialog (`kind: farming`, id `farming-<centre id>`, the place and day of the centre's first village with fields in the built tree, which the build holds within 50 years of the centre's date ([villages.md](villages.md) section 1; until 2026-10-25 the centre's own point and date, which the first fields could miss by centuries), and the title its threshold gives in both languages, `title` in `neolithic.json`, such as "First farming: Fertile Crescent"; no part of a title is written in code) with an event card `data/curated/site-cards/farming-<centre id>.md` in the format of humankind.md section 8.4: sources, "about" for the approximate dates, a note on what is debated, `en` and `de`. The data build fails when a centre has no card or a farming card has no centre. The spread to later places (Britain, Japan, Polynesia) is not an event: it is shown by the onset itself.
