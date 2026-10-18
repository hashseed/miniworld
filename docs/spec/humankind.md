# The tree of humankind

This is the design of where ordinary people come from (spec section 2.4). It refines [spec.md](spec.md) and [milestone-2.md](milestone-2.md); where they disagree, fix whichever is wrong in the same pull request. Decisions marked **Proposed** are defaults chosen so work can start and are open for Yang to change.

Asked for by Yang on 2026-10-18: history starts with a single human at the cradle of humanity in Kenya, who hunts and builds temporary lodgings. As the population grows, more humans come out of these lodgings, and later out of houses, forts and palaces, so the globe holds one family tree of humankind. The tree is kept so that we can reason about what is going on.

Decided by Yang on 2026-10-18, on the first draft: the tree is computed by the data build and looked up by the app; the app opens at 70,000 BCE on the first person; Out of Africa moves to c. 60,000 BCE; Neanderthals are a second root; no population data is used to build the world, but the tree is checked against population estimates from time to time (section 6.1); a family tree view, a very detailed timeline of the tree, lets us skip to its key moments for debugging (section 6.2); foliage trees take a few years to grow and to disappear unless people fell them (section 7). Implementation waits until the one-clock spec and its implementation are merged.

## 1. The idea in one paragraph

At the very start of the timeline, 70,000 BCE, one person stands on the eastern shore of Lake Turkana in northern Kenya. She builds a grass hut, lights a fire and hunts. After a while a second person steps out of the hut, then a third. When the hut is full, two of them walk off and build a hut of their own a little further away, and people come out of that one too. Camp by camp the family spreads through Africa, then out of it, and on across the world. Every ordinary figure on the globe, from a mammoth hunter in Siberia to a factory worker in 1900, came out of some lodging and has a parent figure that was living there, so all of them form one tree that goes back to the first person. The tree is computed once, when the data is built, from the historical data; the app only looks it up, so the world stays a pure function of the clock.

## 2. Accuracy: what the first person stands for

Humankind never began with one person. Our species, *Homo sapiens*, arose in Africa about 300,000 years ago, and by 70,000 BCE people already lived across much of Africa. The first person is therefore a symbol, in the same way that one figure on the globe always stands for many real people (spec section 2.4): she stands for the first people of Africa. Her card says so plainly, and the opening of the tree is a **prologue** that tells a story of 200,000 years in about 8,000 (section 4.2). After the prologue the tree follows the historical data, as everything else in the world does.

- **Why Lake Turkana.** The Turkana basin, on the border of Kenya and Ethiopia, is one of the richest places on Earth for fossils of early humans and their relatives. The oldest well-dated *Homo sapiens* bones of East Africa, Omo I, about 233,000 years old, come from the Omo valley just north of the lake (Vidal et al. 2022, *Nature* 601). The name "Cradle of Humankind" is also used for a group of cave sites in South Africa; the card names Lake Turkana and says that early humans lived in many parts of Africa.
- **Place.** Koobi Fora, on the eastern shore of the lake, at about 3.95° N, 36.20° E (**Proposed**).
- **Her look** (decided by Yang on 2026-10-18: a woman): the model `figure-first-person` of [milestone-2.md](milestone-2.md#133-the-prehistoric-model-set) section 13.3, an `african-stone-age` woman with a fixed look and a spear. Her red-ochre headband stays with her in every later era, whatever her clothes, so the root of the tree can always be found.
- **Founder's card** (draft, both languages):
  - en: "The first person in this world. Our species, *Homo sapiens*, began in Africa about 300,000 years ago, and some of its oldest bones were found near Lake Turkana. Real humankind did not start with one person: she stands for the first people of Africa. Everyone you will see on this globe comes from here."
  - de: "Der erste Mensch dieser Welt. Unsere Art, *Homo sapiens*, entstand vor etwa 300.000 Jahren in Afrika, und einige ihrer ältesten Knochen wurden nahe dem Turkana-See gefunden. In Wirklichkeit begann die Menschheit nicht mit einem einzigen Menschen: Sie steht für die ersten Menschen Afrikas. Alle, die du auf diesem Globus sehen wirst, stammen von hier."
- **Neanderthals** are not descendants of the first person: their ancestors left Africa hundreds of thousands of years earlier. They are a second, smaller tree whose camps already stand in Europe and western Asia at the start of the timeline (section 3.5; decided by Yang on 2026-10-18). Their card says that most people living today carry a little Neanderthal ancestry, because the two met and had children; the tree, being a tree, does not draw these links.

## 3. What the tree holds

The tree is three tables, written by the data build (section 5) and read by the world query.

### 3.1 Figures

Every ordinary figure that ever appears is one row:

| Field | Meaning |
| --- | --- |
| `id` | Whole number, in the order the figures appear (the first person is 0). Replaces the camp-and-index id of milestone 2 section 5.4 |
| `parent` | The figure it came from; none only for the roots |
| `born` | Clock time at which it steps out of its lodging (a whole millisecond, so a whole day follows from it) |
| `home` | Its lodgings over time: a list of (clock time, lodging id); it walks from one to the next when the camp moves (section 4.4) |
| `branch` | The branch it belongs to (section 3.3), inherited from its parent unless it founds a new one |
| `depth` | Number of steps from its root: a measure of how far the family has come, not a count of real generations |
| `lost` | Clock time and the event id if it is lost to war, famine, epidemic or disaster; empty otherwise |
| `look` | A hash seed for its colours and parts within its culture profile, as in milestone 2 section 5.2 |

A figure's culture, role and clothes at a date are not stored: they come from the culture area at its home and its profile at that date, with the per-figure offset inside the transition window that makes eras morph gradually (spec section 9). The tree only says who someone is, where they came from and where they live.

### 3.2 Lodgings

Every place people live is a lodging: a tent, a grass hut or lean-to at first, later houses, longhouses, farmsteads, town houses, forts and palaces.

| Field | Meaning |
| --- | --- |
| `id` | Whole number |
| `camp` | The camp or settlement it belongs to (lodgings around one hearth or inside one settlement) |
| `at` | Position in whole microdegrees (milestone 2 section 2.3) |
| `built`, `gone` | Clock times at which it is put up and taken down or abandoned |
| `builder` | The figure who builds it; it walks there and the building beat plays (section 4.3) |
| `kinds` | Its model over time: a list of (clock time, kind), so a hut can be rebuilt as a house where the people stay |
| `capacity` | How many figures it holds (section 4.1) |

The **kind** is chosen from the architecture set of the culture profile at the lodging's place and date, so the first person's hut is the approved `shelter-grass-hut` of `african-stone-age` and a Natufian family lives in a `shelter-natufian-house`. From the Neolithic on (milestone 3), the buildings of settlements are lodgings too: figures come out of town houses, the barracks of a fort, a palace or a monastery, according to the building's kind, and its people take the roles that fit it (soldiers from a fort, courtiers and servants from a palace). Landmarks without residents, such as a temple or a pyramid, are not lodgings.

### 3.3 Branches

A **branch** is a part of the tree with a name, which is what makes the tree something to reason about. A new branch starts when a figure founds a camp in a place its parent's branch has not reached, for one of these reasons:

- it is the first camp of a migration (milestone 2 section 9) beyond a named point of its path, such as the first camp in Arabia after the crossing of the Bab-el-Mandeb, the first in Sahul, the first in the Americas;
- it is the first camp of a new culture profile, for example where farming first takes over from hunting;
- it is the first lodging of a settlement record, such as the founding of Uruk or Rome.

Each branch row holds an id, its parent branch, the figure and clock time it starts with, its reason (a migration, culture or settlement id) and its localised name taken from that record. There are a few hundred branches over the whole of history (**Proposed** estimate), far fewer than figures.

### 3.4 What the tree is not

- It is not a population count, and no population data goes into it (decided by Yang on 2026-10-18). How many figures live where is set by the densities of the culture areas (milestone 2 section 3) and the size classes of settlements; the tree decides which figures these are, where they live and which figure each came from. Population estimates are used only to check the tree (section 6.1).
- It is not a family history of real people. Famous people are separate figures with their own records (spec section 6); they are not part of the tree.

### 3.5 Roots

| Root | Figure 0 of the root | Where and when |
| --- | --- | --- |
| Modern humans | The first person, `african-stone-age` | Koobi Fora at clock time 0 (1 January 70,000 BCE) |
| Neanderthals | One figure per Neanderthal camp present at clock time 0 | The Neanderthal culture area at 70,000 BCE (milestone 2 section 4), with camps at full density from the start |

Neanderthal camps grow no further after the start (decided by Yang on 2026-10-18). From about 45,000 BCE their branch thins out and its last camps disappear by about 38,000 BCE, as an event "Neanderthals disappear" whose card explains that the reasons are still debated (small and scattered groups, climate swings, competition with modern humans) and that their genes live on in us.

## 4. How the tree grows

The rules below run inside the data build (section 5), never in the app. They take as inputs the culture areas, densities and migrations of milestone 2 section 3 and 9, the land, sea, ice and desert at each date (milestone 1), settlements and their populations (later milestones), and the events that remove people.

### 4.1 Targets

For every place and date the data gives a **target**: how many camps a culture area should have and how many figures each should hold.

- **Camp spacing** follows the density of the culture area: **Proposed** about 400 km between camps for `medium`, 600 km for `low` and 900 km for `sparse`, measured on the true globe before the history lens. With figures drawn at the size of trees (milestone 2 section 5.1), this keeps camps from overlapping at their drawn size; it replaces the camp cells of milestone 2 section 3.2.
- **Figures per camp** follow the band sizes of milestone 2 section 3.3 (6 to 10, 8 to 14, 10 to 18 for `sparse`, `low` and `medium`), with a lodging holding up to 4 figures (**Proposed**) and a camp up to 5 lodgings.
- **Settlements** (milestone 3 onwards) carry a size class over time in their records instead of population numbers: hamlet, village, town, city and great city, with **Proposed** targets of about 10, 20, 40, 80 and 150 figures, so a city of a million people has about ten times the figures of a village of a thousand, not a thousand times. The targets are tuned against the figure budget of spec section 9 when settlements arrive.

Rough world totals the targets give (**Proposed**, to check against the budget): 1 figure at 70,000 BCE, about 200 at the end of the prologue (Africa at `sparse` density, decided by Yang on 2026-10-18 so the globe is not crowded: about 25 camps of 6 to 10), about 1,000 at 50,000 BCE, about 2,000 at 10,000 BCE when nearly all habitable land is reached, and some tens of thousands by 1991. The view never holds more than a fraction of them.

### 4.2 The prologue

The first person is alone at first. Over the first minute of watching (25 years at regular speed) she walks in from the lake shore, builds a grass hut, lights the hearth and goes hunting for an eland, and comes back to the fire (a new template `lone-hunt`, built from the approved `figure-african-stone-age-woman`, `shelter-grass-hut`, `prop-hearth` and `animal-eland` and the existing clips; **Proposed**). Then the second person steps out of the hut.

During the prologue the habitable land of Africa south of the Sahara band is reached by a **front** that spreads outward from Lake Turkana over land at a steady pace, so that the whole of it is inside the front by about 62,000 BCE (**Proposed**), about 5 h 20 min of watching at regular speed and 20 minutes at fast forward. Camps may be founded only behind the front. After 62,000 BCE the culture areas and migrations of milestone 2 alone decide where camps may be. The Out of Africa migration starts after the prologue, at c. 60,000 BCE (section 7).

### 4.3 Coming out of a lodging, and budding

The build steps through time in steps of 25 years of history (**Proposed**; one minute of watching), and inside a step every action gets its exact clock time from a hash of stable inputs.

1. **Emergence.** A camp below its target lets one new figure come out of one of its lodgings that has room, at most one per lodging every 50 years (**Proposed**). Its parent is a figure living in that lodging, chosen by hash. In the world the new figure steps out of the doorway and joins the camp's work; nobody pops into view (spec section 5).
2. **A new lodging.** When every lodging of a camp is full and the camp has fewer lodgings than its band size allows, a figure of the camp builds another lodging beside the hearth.
3. **Budding.** When a camp is at its full size and there is free habitable land within reach, two to four of its figures (chosen by hash, never the root) walk off together and found a new camp at the best free spot at least one camp spacing away and at most two spacings away (**Proposed**). Spots are scored as in milestone 2 section 3.2: near a river, lake or coast is better, steep or high ground worse. The first of them to arrive is the builder. If the new camp starts a branch (section 3.3), the branch is recorded.
4. **No growth beyond the target.** A camp at its target only works and moves; it never sheds figures to reach a lower target.

### 4.4 Moving, and losing people

- **Camps move.** Before villages, a camp moves to a new spot inside its area at the end of every residence window (1,000 years before 10,000 BCE, milestone 2 section 3.2). Its figures take down their lodgings, walk together to the new spot and build them again. The tree records the move as new home entries and new lodgings, so a band is seen walking, never fading out and back in.
- **The land changes.** When the sea rises over a camp, ice advances over it or the land turns to desert, the camp moves to the nearest habitable spot before that happens; nobody is lost to it. The Green Sahara (spec section 3) opens land to camps between about 9000 and 3500 BCE, and as it dries the camps move away, south or to the Nile.
- **Lost figures.** People never die of age (spec section 2.4). War, famine, epidemic and disaster events remove the share of figures in their area that the record gives; which figures are lost is decided by hash, so it is the same every time (spec section 9). A lost figure sinks down and fades out, with no blood (spec section 4). The first person is never lost (**Proposed**), so the root of the tree can always be found, still living by Lake Turkana and taking on each new era's role there.
- **Refilling.** After a loss the camp is below its target again, and new figures come out of its lodgings as the population recovers, at the pace the data gives.

## 5. The tree build

The tree is computed by the data build (`npm run build-data`), in a step after the culture areas, migrations, settlements and events are validated.

Until the culture profile records of milestone 2 exist, the build reads the areas it needs from `data/curated/culture-areas.json`: per culture, its density and one polygon per snapshot date, each with a source. The first entry is `african-stone-age` at `sparse` density in Africa south of the Sahara band, without Arabia and Madagascar; the habitat (land at the date, no ice, aridity under 0.8, below 3,500 m, **Proposed**) cuts it down to where people could live. The build writes the whole tree to `data/build/tree/tree.json` (git-ignored) for the commands of section 6, alongside the chunks the app loads.

- **Deterministic.** The build uses only whole-number arithmetic, the hash of `app/src/core/hash.ts` and the deterministic maths of `app/src/core/detmath.ts` (milestone 2 section 2.3), never `Math.random` or the wall clock. The same inputs give a byte-identical tree on every machine, and a test stores the hash of the canonical serialisation.
- **Output.** Figures and lodgings are split into chunks by place and time window like all other content (spec section 10): a figure belongs to every chunk whose tile it lives in during that time window. Branches are small and go into a single chunk loaded with the first figures. Rough size (**Proposed** estimate): under 1 MB compressed for the whole of history.
- **Checks.** The build fails when any of these is false:
  - every figure but a root has a parent that is alive and living in the lodging the figure comes out of, at the moment it comes out;
  - every lodging stands on land that is habitable at its date for its whole life, and no two camps are closer than the spacing allows;
  - no figure lives outside a culture area that allows people there at the date, and no branch reaches a continent before its migration does (milestone 2 section 3.1);
  - each camp's figure count stays within its target, apart from losses still recovering;
  - the tree has exactly two roots, and every figure reaches one of them through its parents.

## 6. Keeping track: reasoning about the tree

The tree is meant to be looked at, both by us while building the world and in a simple form by the viewer.

- **Report.** `npm run tree -- report` writes a readable summary of the built tree to `data/build/tree/report.md` (git-ignored): figures, camps, births, moves and losses per world region and time window; every branch with its date, place, first figure and parent branch; losses per event; and the results of the checks of section 5.

### 6.1 Checking against population estimates

No population data is used to build the tree, but we check from time to time that it tells the right story (Yang, 2026-10-18). `npm run tree -- check-population` compares the tree with a small curated table of published population estimates per world region and date (`data/curated/population-check.yaml`, each row with its source, for example world totals of about a few hundred thousand to a million people at 70,000 BCE, about 5 million at 10,000 BCE, about 200 million at 1 CE and 5.4 billion in 1991). Since one figure stands for more people the more people there are, the check does not expect the figure count to match; it expects the share of the world's figures in each region to follow the share of the world's people there, damped the same way as the settlement targets (**Proposed**: the cube root), and the growth to happen in the same periods. It lists every region and date where the tree is off by more than a factor of 2 (**Proposed**). It is a report for us, not a build failure, and runs whenever the culture areas, densities or settlements change a lot.

### 6.2 The family tree view

Once the world is fully populated the tree holds tens of thousands of figures, so it is shown as a very detailed timeline that lets us jump straight to its key moments for debugging (Yang, 2026-10-18).

- **Where.** In development builds the address flag `?tree` opens a panel above the timeline, with the same axis as the timeline (spec section 7.1), zoomable down to single years.
- **Lanes.** Each branch is a lane, nested under its parent branch and drawn from its first figure to the end of the timeline, with the number of its figures over time as the lane's thickness. Lanes can be folded and filtered by world region.
- **Key moments** are marks on the lanes, generated by the tree build: a branch starting (a migration passing a named point, a new culture, a settlement founded), the first lodging of each kind in a region (the first hut in Asia, the first house, fort or palace), losses to an event, a camp moving away from rising sea, ice or desert, and failed or near-failed checks of section 5.
- **Jumping.** Clicking a mark moves the clock to that moment and flies the camera to its place; clicking a lane shows its line back to the root, as `lineage` does. Selecting a figure on the globe highlights its lane.
- **Data.** The key moments are a small list per time window, in the tree's chunks (section 5); the view loads them as it scrolls, like the rest of the content.

A view of the tree for viewers, such as a "Family tree of humankind" button, may follow later; for now the tree is for development and the family line on the figure card.
- **Questions.** `npm run tree -- at <date> [--region <id>]` lists the camps and figures alive then, and `npm run tree -- lineage <figure id>` prints the figure's line back to its root, shortened to the branch points ("figure 1,822, Danube 40,000 BCE ← first camp in Europe 45,100 BCE ← crossing of the Bab-el-Mandeb 60,000 BCE ← Lake Turkana 70,000 BCE").
- **Tree overlay for development.** In development builds, the address flag `?tree` draws lines on the globe from each camp to the camp it budded from, coloured by branch, for the camps founded in the time window in view, so the spread of humankind can be watched and checked.
- **On the figure card.** The card of every ordinary figure adds one line about its family, in both languages, built from its branch chain, for example "Her family's line goes back to the first person at Lake Turkana and left Africa about 60,000 BCE." / "Die Linie ihrer Familie reicht zurück bis zum ersten Menschen am Turkana-See und verließ Afrika um 60.000 v. Chr." Double-tapping the line flies to the camp where the branch began, at its founding date (**Proposed**).


## 7. Changes to the rest of the spec

- **Start of the timeline** (spec section 2.5): the timeline already begins at 70,000 BCE; the app now opens there, at clock time 0, at Lake Turkana, close enough to see the first person, instead of at 50,000 BCE (decided by Yang on 2026-10-18). The first load stays within the 3 MB of spec section 10, since the opening view needs the African tiles, one camp and its models.
- **Out of Africa** moves from c. 70,000 BCE to c. 60,000 BCE ([events.md](events.md) and milestone 2 section 12), close to the mainstream genetic estimate of a main dispersal between about 60,000 and 50,000 years ago; the card mentions earlier groups whose lines died out. **The first people in Sahul** are shown at c. 50,000 BCE, with older dates such as Madjedbebe (about 65,000 years ago) named as debated.
- **Milestone 2** builds the tree for modern humans and Neanderthals up to 9000 BCE in place of its camp cells, residence fades and figure ids (milestone 2 sections 3, 5.4 and 15), together with the report, the population check and the family tree view of section 6. No population data is used (decided by Yang on 2026-10-18).
- **Foliage** ([foliage.md](foliage.md#4-placement) section 4): a tree takes a few years to grow and a few years to disappear (**Proposed** 5 years each, about 12 seconds at regular speed), unless people fell it, which takes a moment: where a camp, lodging or field is founded on a tree's spot, the builders fell it and it tips over and is gone within half a year of the timeline (decided by Yang on 2026-10-18).
- **Milestone 3 onwards** add lodgings of farming villages and settlements, and figures coming out of houses, forts and palaces.

## 8. Performance

Nothing about the tree is simulated in the app. The world query loads the tree chunks for the tiles and time window in view and keeps the figures whose `born` is before the clock time and whose `lost` is after it, which is a lookup over a short sorted list per chunk. The figure limits and levels of detail of spec section 9 and milestone 2 section 5.5 are unchanged. Tree chunks are world data like culture areas: the query shows a tile's ordinary figures once its chunk has arrived and never guesses them, so loading changes when figures are drawn, never who they are.

## 9. Open questions for Yang

None at the moment.
