# Farming spread

How the **farming onset day** of any place is computed (issue 128). Status: **Proposed**; the numbers marked in `data/curated/farming.json` are Yang's to approve (section 7). It continues [peopling.md](../peopling.md) section 3.6: the eight Neolithic centres of `data/curated/neolithic.json` are the seeds, and the farming plan spreads from them. The timeline runs to 1991 CE, so late waves (Japan, the Eastern Woodlands, Bantu farmers, Polynesia) are inside it.

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
- **No farming:** `noFarming` boxes (mainland Australia, Antarctica) never get an onset. Cells whose limits fail the culture area (cold, dry, high: peopling.md section 5.2) also get none; the same limits as the tree, no new numbers.
- Computation: one Dijkstra over a coarse grid (about 50 km cells) at build time, written to a small raster in the content chunks; at runtime the onset is a lookup, so the world stays a pure function of the date.

### Why waypoints are seeds, not overrides

A seed can only make the onset earlier than the wave, and the holds only later; so every waypoint satisfies `T(w) <= w.bce` by construction. What can go wrong is the opposite, a wave arriving much too early from an older seed. The check of section 6 catches that, and the fix is a speed, a hold or a missing waypoint, never a patch at one place.

## 2. Speeds

| Zone | km/yr | Range | Source |
| --- | --- | --- | --- |
| Europe and Near East | 1.0 | 0.6 to 1.3 | Pinhasi et al. 2005; Fort 2015 |
| Mediterranean coast and sea hops | 4.0 (approx.) | 2 to 6 | Zilhão 2001; Isern et al. 2017 |
| Africa (Sahel, Bantu) | 1.5 (approx.) | 1 to 2.5 | derived from the Bantu waypoints; Currie et al. 2013, *PLoS ONE* 8 |
| East Asia | 0.8 (approx.) | 0.5 to 1.2 | derived from the Yellow River to Japan waypoints |
| South Asia | 0.7 (approx.) | 0.4 to 1.0 | derived from Mehrgarh to the Ganges and Deccan |
| Americas | 0.5 (approx.) | 0.3 to 0.8 | derived from Mesoamerica to Arizona (2100 BCE) and the Eastern Woodlands |
| Island voyaging | 5.0 (approx.) | 3 to 7 | derived from Taiwan, Luzon, Bismarck, Tonga |

Only the first row is a published rate. The others are our fit to the dated waypoints and are marked approximate in the data.

## 3. Waypoints

`data/curated/farming.json` holds 74 records: `id`, `bce` (negative for CE), `lat`, `lon`, `en`, `de`, `package` (`en`, `de`), `source`, optional `"approximate": true`, and `toleranceYears` for the check. Summary by region (dates BCE unless CE):

| Region | Waypoints (date) |
| --- | --- |
| Near East, Cyprus, Anatolia | Cyprus 8500, central Anatolia 8200, Zagros 8000, west Anatolia 6600, Jeitun 6000 |
| Aegean and Balkans | Crete 7000, Thessaly 6500, Starčevo 6100, Dalmatia 5900, Vinča 5700, Cucuteni 5000 |
| Central and west Europe | Transdanubia 5550, Vaihingen 5450, Elsloo 5300, Paris Basin 5100, Brittany 4800 |
| Mediterranean west | Apulia 6000, Provence 5600, Valencia 5500, Portugal 5400, Morocco 5500 |
| North Europe | Britain 4000, Ireland 3800, Denmark 3950, S Sweden 3900, Oslofjord 3800, Finland 2300, Iceland 874 CE |
| Steppe | Yamnaya herders 3300 |
| Egypt and Sahara | Fayum 5400, Takarkori 5200, Nabta Playa 6000 (debated) |
| Sub-Saharan Africa | Turkana 3300, Dhar Tichitt 2000, Ethiopia 2000, Kintampo 1700, Kenya Rift 1000, Cameroon 1000, Great Lakes 500, Limpopo 300 CE |
| South Asia | Ganges 6000 (debated), Deccan 3000 |
| East Asia | Houli 6500, Xinglongwa 6000, Dadiwan 5800, Hemudu 5000, Tibet 3300, Korea 1300, Kyushu 900, Kinki 600, Tohoku 400 |
| South-East Asia and Pacific | Taiwan 3500, Luzon 2200, Thailand 2000, Vietnam 2000, Marianas 1500, Bismarck 1500, Tonga 900, Samoa 800, Society Is. 1000 CE, Hawaii 1100 CE, Easter Is. 1200 CE, New Zealand 1280 CE |
| Americas | Ecuador 5000, Caral 3000, Maya lowlands 2500, Arizona 2100, Eastern Agricultural Complex 1800, Titicaca 1500, Caribbean 400, Ohio 200 CE, Taquara 400 CE, Ontario 600 CE, Cahokia 900 CE |

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

## 7. Decisions for Yang

1. **Gradual spread by wave, with holds** (this method), or only waypoints and a simple distance interpolation. The wave is more faithful; the holds add a few judgement calls.
2. **Speeds other than Europe** are our fit, not published rates. Accept them as approximate?
3. **Sea hops** of up to 900 km. Larger and the Pacific fills too early; smaller and Taiwan to Luzon needs a waypoint chain (already there).
4. **Debated dates** (Sahara cattle, Ganges rice, Kuk, Ethiopia, Eastern Complex): show them, hide them, or mark them "about".
5. **Later centres** (Eastern North America, Sahel, Ethiopia, West Africa) are waypoints here, not tree thresholds. Make them thresholds too?
6. **Polynesia, Iceland and the Caribbean** farming are in this file, but the peopling of those lands belongs to the later-arrivals plan. Which plan owns the arrival date?
7. **Date convention:** negative `bce` means CE; confirm against the timeline's date format.
8. **Mesolithic foragers who keep their way of life** (Britain before 4000, Scandinavia, Japan's Jomon in Hokkaido): at the onset the band changes culture only if the farming plan models it; otherwise only the label changes.

## 8. Sources

Pinhasi, Fort & Ammerman 2005 (PLoS Biology 3(12)); Fort 2015 (J. R. Soc. Interface 12); Isern et al. 2017 (PNAS 114); Silva & Steele 2014 (J. Archaeol. Sci. 52); Zilhão 2001 (PNAS 98); Larson et al. 2014 (PNAS 111); Bellwood 2005 (*First Farmers*); Whittle, Healy & Bayliss 2011 (*Gathering Time*); Wilmshurst et al. 2008, 2011 (PNAS 105, 108); Bird et al. 2022 (Sci. Data 9); further site sources per record in `farming.json`.
