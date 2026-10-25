# Neolithic villages that stay

How a farming village of the tree of humankind is placed, laid out and lives, replacing the hunter-gatherer camp rules where they no longer fit. Status: **Proposed** (2026-10-25), for Yang's review; nothing here is built yet. It answers Yang's list of 2026-10-25:

> villages in the neolithic no longer move. they stay. So let's make sure they are in locations of future cities
>
> long houses in europe are way too small. they need to be twice as large. ... long houses don't need to fit into any ring. there is no ring around a fire place in the neolithic anymore!
>
> once bands move into neolithic society, they should no longer form circles with their houses now that the fireplace is gone. they should also no longer build stone tools. ... villages in the neolithic should spend time making tools, not knapping stones in a primitive way. ... villagers in the neolithic no longer gather berries or roots from the vicinity. they work the fields.
>
> a village has way too many people in the neolithic. let's have half as many.
>
> sometimes houses are built over a cliff. ... fields should not be under trees. fields should not be under houses. animal enclosures should not include trees. ... there are no farm animals in the enclosures. there are no oxens pulling plows.
>
> the year dates are not accurate. there is a sign for yellow river farming at 6500 BCE but the first fields don't appear until 6018 BCE. ... ensure anchors for every sign of entering farming age!

The parts are numbered so they can be built and reviewed one at a time, each spec first, in this order: 1 (anchors), 2 (village sites), 3 (staying), 4 (people), 5 (layout), 6 (ground rules), 7 (herds and oxen), 8 (work).

## 1. Every farming sign is an anchor

Each threshold of `data/curated/neolithic.json` (a farming centre, its year and point; the sign of [../humankind.md](../humankind.md) section 8.4 and the event of farming-spread.md section 9.5) is also an anchor of [../sites.md](../sites.md) section 4.1, made by the build from the threshold itself, so the date and place are written once:

- A band stands at the threshold's site from 300 years before its year (as hunter-gatherers or herders, as the farming spread says there), and **at the threshold's year it becomes a village of the centre's profile and ploughs its first field**: no morph delay (today up to 100 years, `MORPH_YEARS`), and the threshold's point has the centre's date in the farming grid however far the site is from it (today only within `CENTRE_CORE_KM` = 100 km of the point; the Yellow River's site was 124 km from Cishan, so its fields began in 6016 BCE, not 6500).
- **Checked.** The build fails when the first farming house with fields at a threshold's site is built later than its year, naming the centre, its site and the day: the sign and the first fields can no longer disagree.
- The existing anchors at farming centres (`jericho`, `nanchoc`, `mehrgarh`, `kuk`, and `catalhoyuk` for the Konya plain) keep their scenes and texts, but their dates are made to agree with their centre's year or are dropped in favour of the threshold's (today `jericho` is 8000 BCE against the Fertile Crescent's 9500, `nanchoc` 8000 against the Andes' 3500, `kuk` 8000 against New Guinea's 5000). **Needs Yang's eye:** which date each sign should show where the sources differ (Jericho's Pre-Pottery Neolithic A begins about 9600 BCE; cultivated squash at Ñanchoc about 8000 BCE but villages with fields in the Andes later).
- Centres without an anchor today get one at their threshold's point: Amazonia, Mesoamerica, the Yellow River (Cishan) and the Yangtze.

## 2. Village sites are the places of future cities

A farming village is founded only at a **village site**, a dated place of the place table (sites.md section 2.1) where a city later stood, so the villages of 7000 BCE stand where Jericho, Uruk, Thebes, Xi'an or Teotihuacan will grow. The sites come from a source extract under `data/sources/`:

- **Source (Proposed):** Reba, M., Reitsma, F. and Seto, K. C. 2016, *Spatializing 6,000 years of global urbanization from 3700 BC to AD 2000*, Scientific Data 3, 160034, its dataset of geocoded historical cities with their first dated population (from Chandler 1987 and Modelski 2003), licence CC BY 4.0 as published (to be checked on the dataset's own page before the extract is added), which the data licence policy allows (spec section 13). The extract keeps each city's name, position and first date, a few hundred rows.
- Plus the farming anchors of part 1 and the Neolithic sites the spec already names (Çatalhöyük, Mehrgarh, Kuk), so the first villages stand where archaeology finds them.
- In a farming area, the lattice sites (sites.md section 2) are not used for founding villages; a band that turns farmer at a lattice site walks to the nearest free village site within the culture area's spacing and founds its village there, or stays a hunter-gatherer band if there is none. **Needs Yang's eye:** where a region had villages but no later city (central Europe's LBK, much of New Guinea), the extract has few sites; such regions keep lattice sites as village sites, chosen near rivers, until a list of their own is curated.

## 3. Villages stay

From its founding a village does not move: its band is settled at its site (as an anchor's band is, sites.md section 4.1) for as long as the culture area has people, its houses are rebuilt in place, and it buds off new villages by sending a small group (two to four grown-ups and their children) walking to the nearest free village site, never by moving the village. A village is abandoned only where the sea floods its site (it then moves to the nearest free village site inland) or a listed event ends it. The tree's checks add: a farming house is never taken down while its village stands, and no village's site changes.

## 4. People

A village holds **6 to 10 figures** (`VILLAGE_MIN` 6 plus a hash of its id below 5; 12 to 20 until 2026-10-25), in two or three houses. Its fields' jobs need one worker at a time (fields-and-crops.md section 2), which a village of 6 always has at home.

## 5. Layout: rows, not a ring

A village has no fire and no ring of lodgings (sections 8.1 and 8.5 of humankind.md stay for hunter-gatherer and herding camps):

- **Houses in rows.** The houses stand side by side in one or two rows along a lane, all turned the same way, the row's direction a hash of the site and, for the LBK, north-west to south-east as the excavated longhouses (Bandkeramik longhouses run NW-SE across central Europe; Coudart 1998, *Architecture et société néolithique*). The spacing between houses is their own width plus 3 layout metres, so no two touch whatever their size.
- **House sizes.** A house is drawn at the size its profile gives, no longer capped by a ring (`LODGING_MAX_M` stays for the camps): the LBK longhouse twice its present drawn length, about 5.4 figure metres; the others at their present size until Yang asks otherwise.
- **The green and the spots.** Each figure's spot is by its own house's door, and the lane between the rows is the village's open ground, where the dances and games of the camp events take place.
- **Fields and pen.** The fields lie beyond the ends of the rows and behind them, the pen at one end of the lane; outings go out along the lane.

## 6. Ground rules, checked by the build

Each is a rule of the village's layout, checked for every village of the built tree, failing the build with the village and the rule:

- **No house over a cliff.** Every house's footprint lies on ground whose drawn height varies by less than a set amount across it (Proposed: the height a figure is tall), and no house's footprint reaches water.
- **No field under a house** and no field under the pen: fields keep a margin from every house's and the pen's footprint.
- **No tree in a field or an enclosure.** The trees keep off every field and the pen with a margin, from the village's founding (fields-and-crops.md section 2).

## 7. Herds and oxen

- **In the enclosure.** The village's herd stands inside its pen, three to six animals at the herd scale, grazing there; a herder takes them out to graze nearby and back. **Needs Yang's eye:** the herd animal models (cattle, sheep, goat, pig and those of the other centres) are `generated`, not approved, so the public build draws none; they show in preview builds only, as with every model waiting for review.
- **Oxen at the plough.** Where the village's profile has cattle in its herd and the date is past its `ardFromBce`, ploughing is done with the ard drawn by a pair of oxen under a yoke (`prop-ard`, `prop-yoke`, both `generated`): two of the village's cattle walk the furrows of the field being ploughed, the ploughman behind them, and return to the pen. Before that date, and where there are no cattle, ploughing is by hand with the profile's field tool.

## 8. Work

A villager's day has no knapping, gathering or firewood outing:

- **Making tools** replaces knapping: grinding and polishing a stone axe or adze on a grinding slab (the polished stone tools of the Neolithic), and hafting it, at a spot by the house; a new clip, `polish`, to be modelled and reviewed (milestone-2 section 13.5).
- **Field work** replaces gathering: the farmers' and reapers' extra work at the fields (fields-and-crops.md section 2) takes the turns that went to gathering, and the share of the activity mix that was gathering goes to field work.
- Fetching water, the profile's crafts (pottery, spinning, grinding grain), herding and milking stay; hunting stays at the profile's small hunter share.

## 9. Open questions for Yang

1. The source for future city sites (part 2): Reba et al. 2016 (CC BY 4.0), or another list?
2. Regions with villages but few later cities (part 2): lattice sites as village sites, or a curated list per region?
3. The signs' dates where the existing anchors differ (part 1).
4. House rows for every profile, or a different layout for some (the agglutinated houses of Çatalhöyük, the pit houses of the Yellow River)?
