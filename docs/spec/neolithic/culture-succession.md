# Culture succession

**Proposed** (Yang, 2026-10-31: "If in an area a culture is replaced by another, the old culture should migrate away or pack up or move to another area (possibly joining another village) while the new culture comes from another village to colonize"; decisions of the same day: replacement only where the evidence shows it, Europe up to about 2000 BCE first, new models for each successor through the review loop).

Until now a village kept its culture for ever: LBK longhouses stood in Hungary in 100 BCE, three and a half thousand years after the culture ended. A place's culture changes in one of two ways, as archaeology and ancient DNA show, often side by side in neighbouring regions; each change is a record that names its way and its evidence.

## 1. Two ways a culture changes

- **In place** (the morph of sites.md section 5): the same people take up a new way of life. Each village of the area, at a moment chosen by hash within the change's window, rebuilds its houses in the new culture's kind where they stand, and its people go into their houses and come out in the new clothes (peopling.md section 5.3). Its fields, herd and store stay. Evidence: genetic continuity across the change.
- **Replacement**: newcomers colonise and the old people leave. Evidence: a large share of new ancestry within a few centuries, or colonies founded from a distant homeland.
  - **The newcomers come from villages of the new culture.** During the window, villages of the new culture outside the area (or, for the first, the band or village at the change's source) bud small groups (two to four grown-ups and their children, as villages bud, villages.md section 3) that walk in along the links and found villages at the area's village sites, nearest the source first, so the new culture advances across the area as a front over the window.
  - **The old villages pack up and leave.** A village of the old culture whose site the front reaches (the newcomers' next site lies within its spacing) packs up within the next residence window: its people take down their houses in turn (the take-down of humankind.md section 8.1) and walk away together to the nearest village of their own culture with room, joining it as far as there is room, or to the nearest free village site where their own culture still holds and found a village there. Where neither is within reach, they stay and take up the new culture in place, as the newcomers' neighbours did (a share of every replacement in the evidence is local ancestry).
  - **Nothing violent is shown.** The evidence includes massacres at the end of some LBK villages (Talheim, Schletz, c. 5000 BCE); the scene shows no fighting, only people leaving. Where a change came with violence, its card says so at an 11 to 12-year-old reading level, as the spec does for hard history (CLAUDE.md, Presentation).
- **A site freed by a leaving village** is free for the newcomers once the old houses are down; the trees do not grow back in between (sites.md section 6), as the newcomers are already planned.

Hunter-gatherer bands are part of this too: where a replacement's new culture is a farming one and the old a hunting one (section 3.1), the bands of the area move away ahead of the front as the old villages do, to land the farmers have not reached, or join bands there; the farming spread no longer turns hunters into farmers on the spot in that area.

## 2. Records

`data/curated/successions.json`, one record per change, validated by its schema:

| Field | Meaning |
| --- | --- |
| `id` | `lbk-to-rossen` |
| `from`, `to` | Culture ids of the culture table (`cultures.json`); `to` may be a new profile |
| `area` | Interim boxes `[south, north, west, east]`, as the farming profiles have, until polygons |
| `bce`, `years` | The change's start and its window: the front's crossing time for a replacement, the spread of the moments in place |
| `mode` | `in-place` or `replace` |
| `source` | For `replace`: where the newcomers come from, `[lat, lon]`, outside the area or at its edge |
| `evidence` | Sources, one at least, with the finding in a few words |

The build checks that every record's `from` holds villages or bands in its area at `bce`, that the windows of one area do not overlap, that a `replace` record's source is reachable along the links, and, after the tree has grown, that by `bce + years` no village of `from` stands in the area (each change's sign shows the day its first new village is founded or its first village changes, as farming signs do, villages.md section 1).

## 3. Europe to about 2000 BCE (first round)

### 3.1 Hunters to the first farmers: replacement

c. 5600 to 5000 BCE in the LBK area. The genomes of LBK farmers are of Near Eastern farmer ancestry with little from the local hunter-gatherers (Haak et al. 2010, PLoS Biology 8, e1000536; Lazaridis et al. 2014, Nature 513). The farming spread's dated front (farming-spread.md) is the front of the newcomers; the source is the LBK's earliest region in western Hungary (Schwanfeld and Brunn am Gebirge are among the first villages of the curated list).

### 3.2 LBK to the Middle Neolithic: in place

c. 4900 BCE, window 200 years. The end of the LBK came with a crisis and violence in some regions (Wild et al. 2004, Neolithic massacres: local skirmishes or general warfare in Europe?, Radiocarbon 46; Meyer et al. 2015, PNAS 112, on Schöneck-Kilianstädten), but maternal lineages continue into the Rössen culture (Brandt et al. 2013, Science 342; the Rössen cemetery of Wittmar, 2014). Two new profiles:

- `rossen-farmer` in the west (Rhine to Elbe and the Paris Basin): trapezoidal longhouses, a little shorter than the LBK's, with bowed long walls (the Rössen and Hinkelstein houses; the source for the model card is chosen with it).
- `lengyel-farmer` in the east (the Middle Danube, Hungary, Moravia, Lesser Poland): smaller trapezoidal houses in villages with circular ditched enclosures (rondels).

### 3.3 Funnel Beaker and Michelsberg: in place

c. 4300 to 4100 BCE, window 300 years: the north (Funnel Beaker, `trb-farmer`: small rectangular houses, the first megalithic tombs) and the west (Michelsberg, `michelsberg-farmer`), with the first copper objects.

### 3.4 Corded Ware: replacement

c. 2900 to 2600 BCE from the east into central and northern Europe; source the Pontic steppe's edge (the Yamnaya herders, a herding profile of the steppe to be added with this record). Late Neolithic Corded Ware people of Germany had about 75% steppe ancestry (Haak et al. 2015, Nature 522). `corded-ware-farmer`: small houses, herds of cattle and sheep, fewer fields than before.

### 3.5 Bell Beaker in Britain: replacement; elsewhere in place

c. 2450 to 2200 BCE: in Britain about 90% of the gene pool was replaced within a few hundred years (Olalde et al. 2018, Nature 555), source the Lower Rhine; in Iberia and central Europe the Beaker culture spread without large migration (the same study), so there the change is in place. `bell-beaker` as a profile of its own.

### 3.6 Early Bronze Age (Únětice): in place

c. 2200 BCE, window 200 years, in central Europe; the end of this round.

## 4. Models

Each new profile follows the model review loop of milestone-2 section 13.4 (model card, build, `npm run model -- <id> <round>`, images to Yang, numbered feedback, approve), one profile at a time in the order of section 3: its house, its clothes (man, woman, child) and any new tool. Until a profile's models are approved, its villages use the closest existing culture's (the LBK's for all of section 3), so the succession works before the models do.

## 5. Order of building

1. This spec, reviewed by Yang.
2. The records and the in-place change (section 1), with `lbk-to-rossen` and `lbk-to-lengyel` on the LBK's models.
3. Replacement (section 1), with Corded Ware (section 3.4) as its case, and its source herders.
4. Hunters to the first farmers as a replacement (section 3.1), which changes the farming spread in the LBK area.
5. The other records of section 3.
6. The models, one profile at a time (section 4).

## 6. Later regions (not this round)

Researched for the next rounds, with their ways:

- Northern Mesopotamia, Halaf to Ubaid (c. 5300 to 4500 BCE): in place, gradual.
- The Uruk expansion (c. 3600 to 3100 BCE): colonies such as Habuba Kabira and Jebel Aruda founded from southern Mesopotamia beside the local villages, withdrawn by about 3100 BCE (Algaze 1993, 2005, The Uruk World System): a replacement whose newcomers settle beside the old, not instead of them; needs its own record kind.
- The Nile, Naqada into the Delta (c. 3300 to 3200 BCE): disputed between conquest with abandonment and gradual assimilation (Köhler's work at Buto); to be decided with Yang.
- The Yellow River, Yangshao to Longshan (c. 3000 BCE): in place, with some ancestry from the Yangtze (Ning et al. 2020, Nature Communications 11; the Shimao mitogenomes, 2022).
- The Indus, Mehrgarh to the Harappan (c. 3300 BCE): in place.
