# The pyramids of Giza

The plan for the pyramids of Giza as a landmark with its dioramas: the plateau is bare desert rock, the three pyramids and the Great Sphinx are built over about 85 years, and then they stay there across the ages while the world around them changes, from the priests of the Old Kingdom to Greek travellers, Mamluk stone robbers, Napoleon's army, archaeologists and tourists in 1991. It is the first landmark of [milestones.md](milestones.md#4-early-civilisations) milestone 4, whose exit criterion is that "the Great Pyramid can be watched growing over about 20 years and then stands for the rest of history".

Asked for by Yang on 2026-10-18. It uses the landmark system of [milestone-2.md](milestone-2.md#8-landmarks) section 8 and the vignettes of section 6, with the conventions of [dioramas.md](dioramas.md): data first (a landmark record, vignette records and template YAML), scripts in English and German, dioramas not to scale and visible and alive from orbit, the claymation look, and hard history told correctly at an 11 to 12-year-old reading level. Dates follow the conventional chronology used in [events/egypt.md](events/egypt.md) and are checked against sources when the records are written. Decisions marked **Proposed** are open for Yang to change; the decisions Yang made on 2026-10-18 are listed in section 10.

## 1. The story in three acts

| Act | Dates | What the viewer sees |
| --- | --- | --- |
| **Before** | Until c. 2589 BCE | A bare limestone plateau at the edge of the western desert, above the green Nile valley; farmers and boats on the river below (`nile-farming-year`, `nile-boats` in dioramas.md) |
| **Building** | c. 2589–c. 2503 BCE | Three building sites one after the other: Khufu's Great Pyramid, then Khafre's pyramid with the Great Sphinx, then Menkaure's pyramid. Each pyramid rises course by course while crews haul, lift and fit blocks; boats bring stone to a harbour at the foot of the plateau; the workers' town bakes bread and brews beer |
| **Across the ages** | c. 2560 BCE–26 December 1991 | The finished pyramids stand for the rest of the timeline. Their look changes only where history changed them (sand around the Sphinx, the white casing stripped, a gash in Menkaure's pyramid), and the people around them change with the era: priests, ancient visitors, stone robbers, soldiers, scholars, archaeologists, tourists |

## 2. The landmark record

One landmark record `giza-pyramids` covers the whole group, because at globe scale the pyramids, the Sphinx and their temples read as one place (decided by Yang on 2026-10-18; [content-format.md](content-format.md#1-records) uses `great-pyramid.md` as an example file name, which this replaces).

```markdown
---
id: giza-pyramids
kind: landmark
when: { from: c. 2589 BCE, to: today }
where: { point: [29.9792, 31.1342] }
region: mena
debated: numbers                       # size of the work force
parts:
  khufu:     { at: [29.9792, 31.1342], stages: [...] }
  khafre:    { at: [29.9761, 31.1308], stages: [...] }
  menkaure:  { at: [29.9725, 31.1281], stages: [...] }
  sphinx:    { at: [29.9753, 31.1376], stages: [...] }
  queens:    { at: [29.9781, 31.1366], stages: [...] }
  temples:   { at: [29.9760, 31.1360], stages: [...] }
  mastabas:  { at: [29.9800, 31.1310], stages: [...] }
build:
  - { part: khufu,    from: c. 2589 BCE, to: c. 2560 BCE, vignette: khufu-pyramid-building }
  - { part: khafre,   from: c. 2558 BCE, to: c. 2532 BCE, vignette: khafre-pyramid-building }
  - { part: menkaure, from: c. 2532 BCE, to: c. 2503 BCE, vignette: menkaure-pyramid-building }
beacon: wonder
links: { people: [khufu], events: [khufu-becomes-king, great-sphinx-pyramid-khafre, pyramid-menkaure] }
sources: [{ ref: ... }]
---
```

Two extensions of the landmark format, both **Proposed** and to be written into milestone-2 section 8 and content-format section 5 when milestone 4 is built:

- **Parts.** A landmark may have named `parts`, each with its own point and its own `stages`. The landmark is drawn as the union of its parts at the date. Without parts, Giza would need one model per combination of pyramid stages, Sphinx sand and casing state; with parts, each piece changes on its own dates. A landmark without parts works as before.
- **Several builds.** `build` may be a list, each entry naming the part it builds, its span and its singular vignette. The construction stages of that part rise gradually through the span (spec section 5, construction events).

**Placement.** The pyramids stand on the desert edge on the west bank of the Nile, about 8 km from the river today and close to the floodplain in the Old Kingdom. The globe draws the Nile as a wide, smooth ribbon (spec section 6), so the true points may fall inside the drawn river or its green band. The landmark is therefore anchored to its true point and, if the drawn river or its banks cover any part's footprint, the whole group is shifted west, as one piece, to the nearest desert land that is clear of them (decided by Yang on 2026-10-18). The shift is computed once in the data build from the terrain, which is time-independent, so it is deterministic.

**Size.** Like the trees and the vignettes (milestone-2 section 5.1), the landmark keeps one drawn size at every zoom. Decided by Yang on 2026-10-18: the Great Pyramid is about three widths of the drawn Nile across with its true slope of about 52 degrees, so it is drawn on a base of about 180 km and about 115 km high, a little taller than a person, with its crew clearly visible on it (section 11.2). A first try at 270 km high and 70 degrees was too tall. The relative sizes of the three pyramids stay true to each other (Khufu and Khafre almost equal, Menkaure clearly smaller), because that is how children recognise the group.

**Model.** One clay model per part and stage, cel-shaded in the house style, together within the landmark budget of about 20,000 triangles (spec section 8). The pyramids are smooth, pale and slightly rounded at the edges like modelling clay; the stepped core shows in the construction stages and after the casing is stripped. The pyramidion (capstone) on top is pale stone; whether it was covered in metal is unknown, so it is not drawn gilded.

## 3. Stages by part

Asset ids are placeholders until the models are generated and approved (section 8). Dates are approximate unless a year is given.

| Part | From | Stage | Asset |
| --- | --- | --- | --- |
| `khufu` | c. 2589 BCE | Levelled ground with the square of the base marked out | `giza-khufu-base` |
| `khufu` | c. 2585 BCE | Lowest courses of the core with a supply ramp | `giza-khufu-low` |
| `khufu` | c. 2575 BCE | Core half built, ramp higher, the granite of the King's Chamber going in | `giza-khufu-half` |
| `khufu` | c. 2565 BCE | Core complete with the capstone; the white casing smoothed from the top down as the ramp is removed | `giza-khufu-casing` |
| `khufu` | c. 2560 BCE | Finished: smooth white sides, 146 m tall, the tallest building in the world for about 3,800 years | `giza-khufu-complete` |
| `khufu` | c. 1303 | Casing being stripped: the white sides broken, the steps of the core showing from the bottom up (section 5) | `giza-khufu-stripping` |
| `khufu` | c. 1400 | Stepped core with almost no casing and a flattened top without its capstone, as it looks today | `giza-khufu-stepped` |
| `khafre` | c. 2558 BCE | Base, then core courses (stages as Khufu's) | `giza-khafre-base` … `giza-khafre-casing` |
| `khafre` | c. 2532 BCE | Finished, with the lowest course in red granite | `giza-khafre-complete` |
| `khafre` | c. 1400 | Casing stripped except for a cap of casing near the top, as it looks today | `giza-khafre-stepped` |
| `menkaure` | c. 2532 BCE | Base, then core courses | `giza-menkaure-base` … |
| `menkaure` | c. 2503 BCE | Finished, the lower part cased in red granite that was never fully smoothed | `giza-menkaure-complete` |
| `menkaure` | 1196 | A deep gash in the north face from an attempt to tear it down (section 5) | `giza-menkaure-gash` |
| `sphinx` | c. 2550 BCE | Carved from the bedrock: a lion's body with a king's head wearing the royal headcloth, painted | `giza-sphinx-new` |
| `sphinx` | c. 2180 BCE | Paint faded, sand drifting up to the chest | `giza-sphinx-sand` |
| `sphinx` | c. 1401 BCE | Sand cleared, with a mudbrick wall and the Dream Stela between the paws | `giza-sphinx-cleared` |
| `sphinx` | c. 1000 BCE | Sand up to the chest again | `giza-sphinx-sand` |
| `sphinx` | c. 1378 | The nose broken off | `giza-sphinx-sand-noseless` |
| `sphinx` | 1925 | Fully dug out of the sand down to its paws, as it looks today | `giza-sphinx-today` |
| `queens` | c. 2580 BCE | Three small pyramids for Khufu's queens beside the Great Pyramid; later small pyramids beside Menkaure's | `giza-queens` |
| `temples` | c. 2589 BCE | Valley temples at the edge of the floodplain, causeways up to the mortuary temples at each pyramid, growing with each build | `giza-temples-1` … `-3` |
| `temples` | c. 1000 BCE | Temples in ruins, only foundations and the granite valley temple of Khafre standing | `giza-temples-ruined` |
| `mastabas` | c. 2580 BCE | Rows of flat-topped stone tombs (mastabas) for officials west and east of the Great Pyramid, growing until c. 2350 BCE | `giza-mastabas` |

The dates of the sand stages, the ruined temples and the casing removal are approximate and marked so on the card; sources decide them when the record is written. Sand around the Sphinx is a stage of the landmark, not a loop, because it is a lasting state (dioramas.md section 1).

## 4. Building the pyramids

### 4.1 The `pyramid-building` template

A new template for the building of a pyramid, used here three times and later for the other pyramids in [events/egypt.md](events/egypt.md) (Meidum, Dahshur, Saqqara, Lahun) and the pyramids of Kush at Meroë (**Proposed**; to be added to the template table of dioramas.md section 2). It is the `building-site` outline made specific: the pyramid is a prop whose height is driven by the landmark stage, and the crews work at marks that move up with it.

- **Parameters:** `builders` (culture), `pyramid` (the landmark part), `boat` (asset), `stone` (asset: limestone or granite blocks).
- **Marks:** `quarry` beside the pyramid; `harbour` on the nearest water at the date; `ramp-foot` and `ramp-top` on the side facing the quarry, `ramp-top` following the current top of the pyramid; `top`; `scribe` at the ramp foot; `town` towards the valley.
- **Props:** the pyramid (`$pyramid`, its stage from the date), the ramp (`rise` and `fall` with the stage), a sledge with a block, a boat (`$boat`) with blocks of `$stone`.
- **Cast:** a hauling crew of eight to ten, a water carrier, quarry workers, masons at the top, an overseer, a scribe, and bakers and brewers at the town.
- **Verbs:** `haul`, `lift`, `carry-to`, `work-at`, `walk-to`, `point`, `cheer`, `talk`, and the prop actions `sail-to`, `move-to`, `rise` and `fall`, all in milestone-2 section 6.4. No new verbs are needed.

The beats are the record scripts in section 4.2. The loop closes because the sledge returns empty down the ramp and a new block is cut in the quarry while the boat sails off and returns full. **Proposed** loop length: 320 s, so the crew can haul a block up the whole ramp and walk back (section 11.3).

How the blocks were raised is not fully known: archaeologists have found remains of ramps at Giza and at Hatnub, and debate whether they were straight, zigzag or wound around the pyramid. The diorama shows one straight supply ramp, which is simple to read, and the card says that the exact way is still debated (decided by Yang on 2026-10-18).

### 4.2 The three building dioramas

Each is a singular, long vignette (milestone-2 section 6.1) at its part's point, with `progress: { landmark: giza-pyramids, part: <part> }`, so the date drives the stage and the loop keeps the work going.

| Id | Diorama | German title | Span | Coordinates | Script | German script |
| --- | --- | --- | --- | --- | --- | --- |
| `khufu-pyramid-building` | Building the Great Pyramid | Der Bau der Großen Pyramide | c. 2589–c. 2560 BCE | 29.9792, 31.1342 | Quarry workers cut a block from the rock with copper chisels and wooden wedges; a crew pulls it on a wooden sledge up the ramp while one worker pours water on the sand in front of it so it slides; at the top masons lever it into place; a boat arrives at the harbour with white limestone from Tura or pink granite from Aswan for the king's burial chamber; a scribe counts the blocks; at the end of the shift the crew walks to the town for bread and beer, and the next crew comes up | Steinbrecher lösen mit Kupfermeißeln und Holzkeilen einen Block aus dem Fels; eine Mannschaft zieht ihn auf einem Holzschlitten die Rampe hinauf, während ein Arbeiter Wasser vor den Schlitten auf den Sand gießt, damit er gleitet; oben hebeln Steinmetze ihn an seinen Platz; ein Boot bringt weißen Kalkstein aus Tura oder rosa Granit aus Assuan für die Grabkammer des Königs in den Hafen; ein Schreiber zählt die Blöcke; zum Schichtende geht die Mannschaft zu Brot und Bier in die Arbeiterstadt, und die nächste Mannschaft kommt herauf |
| `khafre-pyramid-building` | Building Khafre's pyramid and the Sphinx | Der Bau der Chephren-Pyramide und des Sphinx | c. 2558–c. 2532 BCE | 29.9761, 31.1308 | As at the Great Pyramid, a crew hauls blocks up the ramp and masons set them; below, in the old quarry, carvers shape a leftover hill of rock into a lying lion with the king's face; painters colour the face and headcloth; the overseer points up at the growing pyramid; the crews change shift | Wie an der Großen Pyramide zieht eine Mannschaft Blöcke die Rampe hinauf, und Steinmetze setzen sie; unten im alten Steinbruch hauen Bildhauer aus einem übrig gebliebenen Felshügel einen liegenden Löwen mit dem Gesicht des Königs; Maler bemalen Gesicht und Kopftuch; der Aufseher zeigt hinauf zur wachsenden Pyramide; die Mannschaften wechseln die Schicht |
| `menkaure-pyramid-building` | Building Menkaure's pyramid | Der Bau der Mykerinos-Pyramide | c. 2532–c. 2503 BCE | 29.9725, 31.1281 | A boat from Aswan unloads heavy red granite blocks; a large crew hauls one on a sledge to the pyramid; masons set it in the lowest courses and start to smooth its face; above them limestone blocks go up the ramp; when the king dies the work stops and the last blocks stay rough (the loop shows the work, the landmark stage the unfinished casing) | Ein Boot aus Assuan lädt schwere rote Granitblöcke ab; eine große Mannschaft zieht einen auf einem Schlitten zur Pyramide; Steinmetze setzen ihn in die untersten Lagen und beginnen, seine Seite zu glätten; darüber werden Kalksteinblöcke die Rampe hinaufgezogen; als der König stirbt, endet die Arbeit, und die letzten Blöcke bleiben rau (die Schleife zeigt die Arbeit, die Stufe des Wahrzeichens die unfertige Verkleidung) |

### 4.3 The workers' town

| Id | Diorama | German title | Span | Coordinates | Template | Script | German script |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `giza-workers-town` | The pyramid builders' town | Die Stadt der Pyramidenarbeiter | c. 2589–c. 2500 BCE | 29.9707, 31.1384 (Heit el-Ghurab) | `workshop` | Bakers knead dough and bake bread in pots over the fire; brewers stir beer in big jars; cattle and fish arrive by boat from farms in the delta; crews come in from the building site and eat in long halls; a doctor sets a worker's broken arm; the bakers start the next batch | Bäcker kneten Teig und backen Brot in Töpfen über dem Feuer; Brauer rühren Bier in großen Krügen; Rinder und Fische kommen mit Booten von Gütern im Delta; Mannschaften kommen von der Baustelle und essen in langen Hallen; ein Arzt richtet einem Arbeiter den gebrochenen Arm; die Bäcker beginnen den nächsten Teig |

It links to the event `pyramid-builders-town` and stands while the building dioramas run; a scene marker would only be needed for a cutaway, which it does not have.

### 4.4 Who built the pyramids

The cards of the building dioramas say plainly who did the work, because the popular picture of whipped slaves is wrong and so is a softened picture of happy volunteers (spec section 4):

- The pyramids were built by Egyptians: a core of skilled, paid craftsmen working all year, and many thousands of farmers who were called up in turns to work for the king for some months, as a duty they could not refuse, often while their fields were under the flood. Estimates of the work force at one time range from about 10,000 to 30,000 (`debated: numbers`).
- They were organised in named crews, such as "Friends of Khufu", whose names they painted on the blocks. They were fed with bread, beer, beef and fish, and many were treated by doctors; skeletons show healed broken bones and hard work.
- Some died in accidents and were buried in their own tombs near the pyramids, which slaves would not have been given.
- The "Learn more" section adds the Diary of Merer (event `diary-merer`): the logbook of a boat crew that carried limestone from Tura to Giza.

## 5. Across the ages

After building, the pyramids stand for the rest of the timeline, and dioramas at their foot show who came to them in each era. They are repeated vignettes with a single site and one instance per period, so one of them is always playing (**Proposed**), or singular and stretched vignettes for single events. Each stands at its own mark on the plateau, chosen in the record, so dioramas that run at the same time never overlap (milestone-2 section 6.6). The cast follows the culture of the date (dioramas.md section 1).

Two new templates, both **Proposed** and to be added to dioramas.md section 2 because they will be used at other landmarks too:

| Template | Stage | Outline of the loop |
| --- | --- | --- |
| `sightseeing` | Open ground in front of a landmark, with a path in and out | Visitors arrive on foot, on donkeys, camels, horses or later in carriages and buses; a guide talks and points; they look up, walk around and touch the stones; one draws, writes or takes a photograph; they leave and new visitors arrive |
| `excavation` | A trench or pit beside a landmark, with spoil heaps and a tent | Workers dig and carry baskets of sand to the heap; others sieve it; an archaeologist measures and writes; a find is lifted out and shown; the team cleans the tools and starts the next layer |

| Id | Diorama | German title | Span | Template | Script | German script |
| --- | --- | --- | --- | --- | --- | --- |
| `giza-temple-priests` | Offerings for the dead kings | Opfergaben für die toten Könige | c. 2560–c. 2180 BCE | `procession` | Boats bring bread, beer, meat and flowers to the valley temple; priests in white linen carry them up the covered causeway; at the temple by the pyramid they lay them on an altar and burn incense; they read spells for the king's afterlife; they walk back down | Boote bringen Brot, Bier, Fleisch und Blumen zum Taltempel; Priester in weißem Leinen tragen sie den überdachten Aufweg hinauf; im Tempel an der Pyramide legen sie sie auf einen Altar und verbrennen Weihrauch; sie lesen Sprüche für das Leben des Königs nach dem Tod; sie gehen wieder hinunter |
| `sphinx-cleared-thutmose` | Prince Thutmose clears the Sphinx | Prinz Thutmosis befreit den Sphinx | c. 1401 BCE (stretched) | `building-site` | A prince out hunting in a chariot rests in the shade of the Sphinx's head; workers dig the sand away from its body; they build a mudbrick wall against the wind; a stone tablet is set up between the paws telling of the prince's dream that the Sphinx promised him the throne | Ein Prinz auf der Jagd ruht mit seinem Streitwagen im Schatten des Sphinxkopfes; Arbeiter graben den Sand von seinem Körper weg; sie bauen eine Lehmziegelmauer gegen den Wind; zwischen den Pfoten wird eine Steintafel aufgestellt, die vom Traum des Prinzen erzählt, in dem ihm der Sphinx den Thron versprach |
| `giza-ancient-visitors` | Visitors in ancient times | Besucher im Altertum | c. 1550 BCE–c. 400 | `sightseeing` | Egyptians of the New Kingdom come to pray at the Sphinx and leave small stone tablets; later Greek and Roman travellers ride up on donkeys; a local priest tells them old stories about the kings; they stare up at the pyramids, some scratch their names into the stone, as visitors did then; they ride back to Memphis | Ägypter des Neuen Reichs kommen, um am Sphinx zu beten, und lassen kleine Steintafeln zurück; später reiten griechische und römische Reisende auf Eseln heran; ein Priester aus der Gegend erzählt ihnen alte Geschichten über die Könige; sie schauen staunend zu den Pyramiden hinauf, manche ritzen ihre Namen in den Stein, wie es Besucher damals taten; sie reiten zurück nach Memphis |
| `giza-medieval-scholars` | Scholars measure the pyramids | Gelehrte vermessen die Pyramiden | c. 820–c. 1500 | `sightseeing` | Scholars from Cairo and Baghdad arrive on mules; one measures a side of the Great Pyramid with a rope; another copies the old writing they cannot read; a guide leads them into the tunnel; they write down what they saw and ride back to the city | Gelehrte aus Kairo und Bagdad kommen auf Maultieren; einer misst eine Seite der Großen Pyramide mit einem Seil; ein anderer schreibt die alte Schrift ab, die sie nicht lesen können; ein Führer bringt sie in den Tunnel; sie schreiben auf, was sie gesehen haben, und reiten zurück in die Stadt |
| `menkaure-demolition-attempt` | A sultan tries to tear down a pyramid | Ein Sultan will eine Pyramide abreißen | 1196 (stretched) | `building-site` | Sultan al-Aziz Uthman's workers climb Menkaure's pyramid with ropes and levers; they prise off a block and it tumbles down; they need days for each block; after eight months they give up, leaving a deep gash in the side | Die Arbeiter des Sultans al-Aziz Uthman klettern mit Seilen und Hebeln auf die Mykerinos-Pyramide; sie stemmen einen Block los, der hinunterpoltert; für jeden Block brauchen sie Tage; nach acht Monaten geben sie auf und lassen eine tiefe Kerbe in der Seite zurück |
| `casing-stone-robbers` | The white casing is taken for Cairo | Die weiße Verkleidung wird nach Kairo gebracht | c. 1303–c. 1400 | `building-site` | After an earthquake has shaken Cairo, workers climb the pyramids and lever off the loose white casing stones; they slide them down; the blocks are loaded onto carts and camels and taken to the city to rebuild mosques, walls and houses; the steps of the core show where the stones were | Nachdem ein Erdbeben Kairo erschüttert hat, klettern Arbeiter auf die Pyramiden und hebeln die losen weißen Verkleidungssteine ab; sie lassen sie hinuntergleiten; die Blöcke werden auf Karren und Kamele geladen und in die Stadt gebracht, um Moscheen, Mauern und Häuser wieder aufzubauen; wo die Steine waren, zeigen sich die Stufen des Kerns |
| `giza-travellers` | Travellers and scholars from Europe | Reisende und Gelehrte aus Europa | c. 1600–1869 | `sightseeing` | European travellers arrive with local guides and donkeys; scholars of Napoleon's expedition measure and draw the pyramids and the Sphinx, already without its nose; a traveller is helped up the giant steps; at the top they look out over the Nile and the desert; they climb down and ride off | Europäische Reisende kommen mit einheimischen Führern und Eseln; Gelehrte von Napoleons Expedition vermessen und zeichnen die Pyramiden und den Sphinx, der da schon keine Nase mehr hat; einem Reisenden wird die riesigen Stufen hinaufgeholfen; oben schauen sie über den Nil und die Wüste; sie klettern hinunter und reiten davon |
| `giza-tourists` | Tourists at the pyramids | Touristen an den Pyramiden | 1869–end of timeline | `sightseeing` | Tourists arrive on the new road by carriage, later by tram, car and bus; camel and horse drivers offer rides; guides tell the story of the kings; visitors take photographs in front of the Sphinx; some climb the Great Pyramid with guides until climbing is forbidden; they ride back towards Cairo | Touristen kommen auf der neuen Straße mit der Kutsche, später mit Straßenbahn, Auto und Bus; Kamel- und Pferdetreiber bieten Ritte an; Führer erzählen die Geschichte der Könige; Besucher machen Fotos vor dem Sphinx; manche klettern mit Führern auf die Große Pyramide, bis das Klettern verboten wird; sie reiten zurück nach Kairo |
| `giza-archaeologists` | Archaeologists at work | Archäologen bei der Arbeit | 1880–end of timeline | `excavation` | Egyptian workers dig into the sand beside a pyramid and carry baskets to the heap; boys sieve the sand for small finds; an archaeologist measures the walls of a tomb and draws a plan; a statue or a pot is lifted out, photographed and labelled for the museum; the team starts the next trench | Ägyptische Arbeiter graben neben einer Pyramide in den Sand und tragen Körbe zur Halde; Jungen sieben den Sand nach kleinen Funden; eine Archäologin oder ein Archäologe vermisst die Wände eines Grabes und zeichnet einen Plan; eine Statue oder ein Topf wird herausgehoben, fotografiert und für das Museum beschriftet; das Team beginnt den nächsten Graben |
| `sphinx-cleared-baraize` | The Sphinx dug out of the sand | Der Sphinx wird ausgegraben | 1925–1936 | `excavation` | Workers dig the sand from around the Sphinx and carry it away in baskets and small rail carts; the paws and the body appear; masons repair crumbling stone; at last the whole Sphinx stands free | Arbeiter graben den Sand rund um den Sphinx weg und bringen ihn in Körben und kleinen Loren fort; die Pfoten und der Körper kommen zum Vorschein; Steinmetze bessern bröckelnden Stein aus; schließlich steht der ganze Sphinx frei |
| `khufu-boat-found` | Khufu's boat is found | Die Cheops-Barke wird gefunden | 1954 (stretched) | `excavation` | Workers clearing sand beside the Great Pyramid find a row of huge stone slabs; they lift one; below lie the cedar planks of a boat taken apart 4,500 years before; restorers carry the planks out one by one to put the boat back together | Arbeiter, die neben der Großen Pyramide Sand wegräumen, finden eine Reihe riesiger Steinplatten; sie heben eine an; darunter liegen die Zedernbretter eines Bootes, das 4.500 Jahre zuvor zerlegt wurde; Restauratoren tragen die Bretter einzeln heraus, um das Boot wieder zusammenzusetzen |

Between c. 2180 BCE and c. 1550 BCE, while Egypt was divided and in the Middle Kingdom, the pyramids stand without a diorama of their own; the Nile dioramas of the valley below carry the region (dioramas.md section 1). The `giza-ancient-visitors` start date is set from the earliest dated New Kingdom stelae at the Sphinx when the record is written.

The Battle of the Pyramids (event `battle-pyramids`, 1798) is fought at Imbaba, about 15 km away, and is shown there as an event; the pyramids stand on its horizon. Al-Ma'mun's tunnel (event `al-mamun-great-pyramid`, 832) is an event with no diorama, because the story is a legend.

## 6. Events

**Already listed** in [events/egypt.md](events/egypt.md) and linked from the landmark: `khufu-becomes-king`, `tomb-queen-hetepheres`, `khufus-boat-buried`, `diary-merer`, `great-sphinx-pyramid-khafre`, `pyramid-builders-town`, `pyramid-menkaure`, `dream-stela-sphinx`, `herodotus-visits-egypt`, `al-mamun-great-pyramid`, `battle-pyramids`, `egyptian-antiquities-service`. The list's date for the completion of the Great Pyramid (c. 2560 BCE) is kept here as the end of `khufu-pyramid-building`; `people.md` gives Khufu's reign as c. 2589–2566 BCE, but the Diary of Merer shows casing stone still arriving in about his 27th year, so the end date is set from sources when the record is written (section 10).

**Proposed new rows** for [events/egypt.md](events/egypt.md), added by the thread that writes the records (**Proposed**):

| Id | Date | Event | German | Place | Coordinates | Type | What you see |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `menkaure-demolition-attempt` | 1196 | A sultan tries to tear down a pyramid | Ein Sultan will eine Pyramide abreißen | Giza | 29.97, 31.13 | Destruction | Al-Aziz Uthman's workers give up after eight months, leaving a gash in Menkaure's pyramid (told by Abd al-Latif al-Baghdadi) |
| `earthquake-1303` | 1303 | Earthquake in Egypt | Erdbeben in Ägypten | Cairo | 30.05, 31.25 | Natural disaster | Mosques and houses in Cairo and Alexandria are damaged; the pyramids' loose casing stones are later taken to rebuild them (date of the stripping approximate) |
| `sphinx-loses-its-nose` | c. 1378 | The Sphinx loses its nose | Der Sphinx verliert seine Nase | Giza | 29.98, 31.14 | Destruction | According to al-Maqrizi a Sufi named Muhammad Sa'im al-Dahr damaged the face; drawings from before 1798 already show it without a nose, so it was not Napoleon's soldiers (debated) |
| `pyramids-road` | 1869 | Road to the pyramids | Straße zu den Pyramiden | Giza | 30.00, 31.18 | Construction | Khedive Ismail builds a tree-lined road from Cairo to the pyramids for the guests of the Suez Canal opening |
| `petrie-surveys-giza` | 1880–1882 | Petrie surveys Giza | Petrie vermisst Gizeh | Giza | 29.98, 31.13 | Invention or idea | Flinders Petrie measures the pyramids exactly and shows how carefully they were built |
| `sphinx-dug-out` | 1925–1936 | The Sphinx dug out | Der Sphinx wird ausgegraben | Giza | 29.98, 31.14 | Construction | Émile Baraize's workers free the whole Sphinx from the sand for the first time in modern times |
| `khufu-boat-found` | 1954 | Khufu's boat found | Die Cheops-Barke wird gefunden | Giza | 29.98, 31.14 | Invention or idea | Kamal el-Mallakh finds the sealed pit; Ahmed Youssef Moustafa rebuilds the 43-metre cedar boat over many years |
| `giza-world-heritage` | 1979 | Giza becomes World Heritage | Gizeh wird Welterbe | Giza | 29.98, 31.13 | Founding | UNESCO lists Memphis and its necropolis, with the pyramid fields from Giza to Dahshur, as World Heritage |

Ids are unique within their kind (content-format section 2), so an event and the diorama that tells it may share an id (`menkaure-demolition-attempt`, `khufu-boat-found`); the vignette links to the event.

## 7. Cards

**Landmark card** (draft; the record's text is written from it in both languages):

> **The pyramids of Giza.** Three kings of Egypt, Khufu, Khafre and Menkaure, had these pyramids built as their tombs about 4,500 years ago. The biggest, the Great Pyramid, was the tallest building in the world for about 3,800 years. It was built by Egyptian workers, not slaves: skilled craftsmen and many thousands of farmers who had to work for the king in turns. The Great Sphinx, a lion with a king's head, was carved from the rock beside them. The pyramids are the only one of the Seven Wonders of the ancient world that still stands.

> **Die Pyramiden von Gizeh.** Drei Könige Ägyptens, Cheops, Chephren und Mykerinos, ließen diese Pyramiden vor etwa 4.500 Jahren als ihre Gräber bauen. Die größte, die Cheops-Pyramide, war etwa 3.800 Jahre lang das höchste Bauwerk der Welt. Gebaut haben sie ägyptische Arbeiter, keine Sklaven: erfahrene Handwerker und viele tausend Bauern, die abwechselnd für den König arbeiten mussten. Neben ihnen wurde der Große Sphinx, ein Löwe mit Königskopf, aus dem Fels gehauen. Die Pyramiden sind das einzige der sieben Weltwunder der Antike, das noch steht.

The card's later lines change with the date, like any landmark card: before c. 2560 BCE it says the Great Pyramid is being built; after c. 1400 it says the white casing was taken for Cairo's buildings; after 1378 it mentions the nose. Myths are answered with evidence and not repeated at length: the card says who built the pyramids and how we know, and says that the Sphinx's nose was gone before Napoleon came.

## 8. Assets

Every model is generated in the claymation house style and must be approved by Yang before it ships (spec section 13, milestone-2 section 13).

| Asset | What |
| --- | --- |
| `giza-khufu-*`, `giza-khafre-*`, `giza-menkaure-*` | Construction stages, complete, stripped and (Menkaure) gashed pyramids, as in section 3 |
| `giza-sphinx-*` | New and painted, buried to the chest, cleared with the Dream Stela, noseless, today |
| `giza-queens`, `giza-temples-*`, `giza-mastabas` | Small pyramids, temples and causeways, ruins, tomb fields |
| `pyramid-ramp` | A straight supply ramp of mudbrick and rubble that rises and falls with the stage |
| `stone-sledge`, `stone-block-limestone`, `stone-block-granite` | Props of the building dioramas |
| `old-kingdom-cargo-boat` | A wooden Nile boat with a square sail carrying blocks |
| Culture figures | The Old Kingdom Egyptian culture profile (workers, scribes, overseers, priests, bakers), built for milestone 4; later visitors and workers from the culture profiles of their dates |

## 9. When it ships and what it needs elsewhere

- **Milestone.** The landmark and the building dioramas ship with milestone 4 (Early civilisations), with the Egyptian culture profile. The dioramas of section 5 ship with the milestone that builds the culture profile of their date; before then the pyramids stand without that diorama.
- **dioramas.md.** Needs a line in its introduction pointing to this file for Giza (where it already names "building the pyramids" as a singular vignette that belongs to its landmark), and the three templates `pyramid-building`, `sightseeing` and `excavation` added to its section 2 table. Left to the thread that owns dioramas.md.
- **milestone-2.md section 8 and content-format.md section 5.** The landmark `parts` field and list-valued `build` of section 2, written in when milestone 4 is built.
- **events/egypt.md.** The new rows of section 6.

## 10. Decisions

Decided by Yang on 2026-10-18:

1. One combined landmark for the whole Giza group, with parts (section 2).
2. When the drawn Nile covers the site, the whole group shifts west onto clear desert (section 2).
3. One straight supply ramp in the building dioramas, with the card saying the method is debated (section 4.1).
4. The gap at Giza from c. 2180 to c. 1550 BCE stays open for now; the farming dioramas of the Nile valley that carry the region then are worked out in detail later.
5. The Great Pyramid is finished c. 2560 BCE, as in events/egypt.md; the sources settle the exact date and Khufu's reign when the records are written (section 6).
6. The pyramids are drawn at one fixed size: the Great Pyramid about three widths of the drawn Nile across, at its true slope; the pyramids stand close together (section 11.2).
7. The builders clearly look like ancient Egyptians: wigs, broad collars and white linen (section 11.5).
8. Only three people build at a time, from the ground like a sand castle: no ramp and nobody standing on the pyramid. This replaces decision 3 for the slice; the card still tells of the ramps (section 11.3).
9. The Sphinx is drawn taller than a person (section 11.2).
10. The first slice is shelved: its models are approved as assets, but the diorama is taken off the globe (section 12).

## 11. First slice: the pyramids rise

Asked for by Yang on 2026-10-18: the Giza landmark and its three building dioramas are built ahead of milestone 4, on top of the mammoth-hunt slice ([milestone-2.md](milestone-2.md#18-first-slice-the-mammoth-hunt) section 18), as the worked example of a landmark and of a singular vignette that a landmark's construction drives. Everything not listed here stays as specified above and is built with milestone 4.

### 11.1 What the slice builds

| Part | In the slice | Later |
| --- | --- | --- |
| Landmark record | `data/curated/landmarks/giza-pyramids.md` with the parts `khufu`, `khafre`, `menkaure` and `sphinx` and their stages from section 3 | The parts `queens`, `temples` and `mastabas` |
| Models | Script-built clay models in `assets/src/landmarks.ts`: a pyramid that can be drawn at any point of its construction, complete, half stripped, stepped or gashed, and the Sphinx with or without sand and nose | Ramps, sledges, boats, the workers' town |
| Data build | Validates the landmark record, shifts the group west off the drawn Nile (section 2), and writes a structure file and a text file per language; the startup index gains a `landmarks` list | Unchanged |
| Landmark layer | Draws every part at the date's stage, rising with the date during its build, at one fixed drawn size at every zoom (section 11.2); tapping a part opens the landmark card | Unchanged |
| Building dioramas | `khufu-pyramid-building`, `khafre-pyramid-building` and `menkaure-pyramid-building` on the `pyramid-building` template, with a stonecutter and two carriers | Haulers with sledges, the water carrier, scribe and overseer, the boat from Tura or Aswan, the Sphinx carvers and the bakers of section 4 |
| Figures | The cast is the `old-kingdom-egyptian` culture profile (section 11.5), built like the prehistoric figures and shown once Yang approves them; until then, stand-ins | Unchanged |

The models are new assets: they are drawn in their clay look only once Yang approves them in `data/assets/manifest.json` (spec section 13). Until then each is drawn as a flat-coloured stand-in of the same shape, like the stand-in figures of milestone-2 section 18.1. A preview build on devenv started with `VITE_PREVIEW_ASSETS=1` also draws the models with status `generated`, so Yang can review them in place; such a build is never shipped.

### 11.2 The landmark record

```markdown
---
id: giza-pyramids
kind: landmark
when: { from: c. 2589 BCE, to: today }
where: { point: [29.9792, 31.1342] }
region: mena
icon: pyramid
beacon: wonder
size: { part: khufu, across: 180 km, high: 115 km }
spacing: 0.7
parts:
  khufu:
    at: [29.9792, 31.1342]
    stages:
      - { from: c. 2589 BCE, asset: giza-khufu }
      - { from: c. 1303, asset: giza-khufu-stripping }
      - { from: c. 1400, asset: giza-khufu-stepped }
  ...
build:
  - { part: khufu, from: c. 2589 BCE, to: c. 2560 BCE, vignette: khufu-pyramid-building }
  ...
sources: [...]
---
```

- A part is drawn from its first stage's date. The stage whose span contains a `build` entry is drawn **rising**: at a fraction *f* of the build span the stepped core stands to *f* / 0.85 of the full height, in whole courses of the model; from *f* = 0.85 the core is complete and the white casing is laid from the top down, until the stage's finished asset stands at the end of the span.
- **Fixed size** (decided by Yang on 2026-10-18). `size` names a pyramid part and how big it is drawn: `across` its base and `high` its apex, in km. That gives the landmark two factors, drawn km per life-size metre across the ground (180 km over 230.3 m, about 0.78) and upwards (115 km over 146.6 m, also about 0.78), used for every pyramid of the group at every zoom, like the trees. With equal factors the pyramids keep their true slope and their true sizes relative to each other; the two factors stay so a record could exaggerate height. The Sphinx and other parts that are not pyramids keep their shape and are drawn evenly at the upward factor times the part's own `scale` (decided by Yang on 2026-10-18: the Sphinx must be taller than a person, so `scale: 6` draws it about 95 km high). Its model has chunky toy proportions, 46 m long for its 20 m height instead of the real 73 m, so it is about 215 km long and does not crowd the pyramids.
- **Spacing.** The parts' positions are kept as offsets from the landmark's point in metres, and drawn at the across factor times `spacing` (0.7 at Giza), so the pyramids stand close together with narrow gaps rather than at their true distances.
- **Open end.** `to: today` includes the last day of the timeline, so the landmark is still drawn when history ends.
- The data build moves the group's drawn point west, in steps of 1 km and at most 600 km, until no point of the group's footprint (every part's base at the drawn size and spacing, with 160 m south of each pyramid for its crew) lies on a river, a lake or the sea of today (section 2); dry land below sea level, such as the Qattara Depression, counts as land, and if no shift is fully dry the one with the least water wins. The true point stays the one used for flying to the landmark and for its card.

### 11.3 The `pyramid-building` template

The template of section 4.1 in the format of milestone-2 section 18.2, built like a sand castle (decided by Yang on 2026-10-18): the crew works from the ground beside the pyramid, and nobody stands on it. Two additions:

- **Fit.** `stage.fit` (such as `230 m`, the base of the Great Pyramid) is the size the marks are written for. A record whose `progress` names a landmark part has every mark scaled by the part's base over the fit, so one template serves pyramids of every size.
- **Offset.** A cast group may have `offset: [x, z]` in metres: it stands that far from its marks, like a formation offset, drawn at the figures' size.

Its marks lie around the pyramid's centre, with +x east and +z north: `quarry` south-east of the pyramid, `pile-west` and `pile-east` south of it, and `foot-west` and `foot-east` just outside the middle of its south face; the stage radius is 300 m.

Script (120 s): a stonecutter works at the quarry all loop long; two carriers each carry a limestone block on the shoulder from their stone pile to the foot of the pyramid, crouch and set it there, cheer each other, and walk back to the pile for the next. Each carrier has marks of its own, so they never overlap.

The landmark's cast vocabulary also allows props: a cast group may be `{ prop: $param, count, at }` with a parameter of kind `prop`, moved with `haul` (3 m/s on the stage, with the haul clip, leaning forward and pulling a rope) or `walk-to`, and drawn from its asset. Props stand flat on the ground and do not lean towards the camera like the figures (milestone-2 section 5.1). The slice's template uses none.

### 11.4 Singular vignettes

A vignette record with `progress: { landmark, part }` and no `repeat` is **singular**: it has one instance over its whole span, standing at the drawn centre of that part, oriented with +x to the east, with a phase offset from the hash of its id (milestone-2 section 6.5). Its stage is laid out at the landmark's across factor, so the marks stay around the pyramid, while the figures keep their own fixed size (milestone-2 section 5.1); members of a group are spread by their figure size, so a crew does not merge into one blob.

### 11.5 The Egyptian builders

Decided by Yang on 2026-10-18: the people must clearly look like ancient Egyptians. The `old-kingdom-egyptian` profile has brown skin and, as in Old Kingdom tomb paintings and statues (Gay Robins, *The Art of Ancient Egypt*, 1997):

- **Men:** a blunt black bob wig to the jaw, a broad collar of blue beads between gold bands, a short, flared white linen kilt with a pleated front panel, bare chest, no beard. A carrier carries a limestone block on the shoulder. The overseer carries a long staff, the scribe his palette with red and black ink.
- **Women:** a long black wig with two locks over the shoulders and a blue band, the broad collar, and a white linen sheath dress on two straps, flared below the knee so the legs stay inside it when walking.
- **Children:** a shaved head with the sidelock of youth, and a small kilt.

### 11.6 Standing on the landmark

The height of the ground under a figure on a stage of a building diorama is the higher of the terrain and the landmark's surface at its stage position, drawn at the upward factor: the pyramid's stepped core or casing at its current height, with a flat top, computed from the same numbers as the model. The crew works beside the pyramid, so it normally stands on the terrain.

### 11.7 Tests

| Test | Checks |
| --- | --- |
| Format | The landmark record parses; unknown parts, assets and vignettes, stages out of order and builds outside the record's span fail with a clear message |
| Placement | The shift is zero away from water and moves the group west of a river laid across it; the footprint covers every part and its crew at the drawn size |
| Rising | The drawn height is zero at the start of a build, grows in whole courses, and is complete at its end; the stages are picked by date |
| Singular | One instance over the whole span; the template's marks are scaled by the part's size; the loop closes at every pyramid's size |
| Models | Every landmark asset builds within the 20,000-triangle landmark budget, and the Egyptian figures within the figure budget |
| Browser | At a date in the building of the Great Pyramid, the pyramid and its crew are drawn at Giza; tapping the pyramid opens the landmark card (dropped while the slice is shelved, section 12) |

## 12. Shelved

Decided by Yang on 2026-10-18, after reviewing the slice on devenv: the Old Kingdom Egyptian figures and the Giza models (pyramids and Sphinx at every stage) are approved as assets, but the Giza diorama is taken off the globe completely. Nothing of Giza is drawn at any date, and the startup index has no landmark.

- **Kept.** The approved models in `assets/src/people.ts` and `assets/src/landmarks.ts`, the `old-kingdom-egyptian` culture profile, and the general machinery of the slice: the landmark build and layer, singular vignettes driven by a build, group offsets, props and standing on a landmark (section 11). The `stone-sledge` prop stays unreviewed; nothing uses it.
- **Moved out of the content.** The landmark record, the three building vignettes, the `pyramid-building` template and their three sources move from `data/curated/` to `data/build/fixtures/giza/`, where the tests of section 11.7 still build them. The data build never reads that folder.
- **Dropped.** The browser test of section 11.7.

Bringing Giza back means moving the records back into `data/curated/` and restoring the browser test, with whatever changes Yang asks for then.
