# Neolithic houses of the western Old World

Asked for by Yang as part of the Neolithic model set (milestone 3): the lodgings that replace huts when a village settles. Status: **Proposed**, for review with the asset sheet (milestone-2.md section 13.2); every model has status `generated` in `data/assets/manifest.json` until Yang approves it. The models are scripted in `assets/src/neolithicHouses.ts` and registered with the shelters (`SHELTERS` in `assets/src/shelters.ts`). Where the evidence is thin, the section says so, and the model is a reconstruction, not a find.

## 1. Rules shared by all five

- **Kind of model.** Each is a lodging kind of humankind.md section 3.2, chosen from the architecture set of the culture profile at the place and date. Like every shelter it is built at life size in metres, faces +Z with its door on that side, stands on y = 0, and has at most 1,000 triangles (milestone-2.md section 13.3). Built from the clay-toy kit (`assets/src/kit.ts`): rounded primitives, flat vertex colours, cel shading, ink outline.
- **Closed outline.** Box-like parts are rounded prisms with smoothed normals (not hard-edged boxes), so the ink outline of the inverted hull stays closed and sits on the model, never in a gap beside it.
- **Colours read as the material** (Yang rejected a dark brown sign: wood is oak-coloured, a light warm brown):

| Material | Colour | Used for |
| --- | --- | --- |
| Mudbrick | sandy, `#c9a672` | Walls of the Levant, Anatolian and Mehrgarh houses |
| Lime or mud plaster | pale cream, `#e2d3ac` | Plastered walls and roofs (Levant, Anatolia) |
| Oak timber | light warm brown, `#b88a54` | Roof beams, posts, ladder, door frames |
| Thatch and reed | golden, `#d2b865` | LBK roof, Egyptian mats |
| Daub | light clay, `#d6bf92` | Wattle-and-daub walls of the longhouse |
| Stone | grey, `STONE` | Thresholds and steps |
| Doorway | dark `#3a2a20` as for the other shelters | Door openings and roof hatch |

- **Building steps.** Each model has bones `build-0` (walls or frame) and `build-1` (roof, ladder and thatch) so a village builds the walls first and the roof second (humankind.md section 8.1).
- **Sizes** are the real sizes where the village ring allows. A lodging stands on a ring of 12 layout metres round the hearth, five to a ring, so the longhouse is drawn shorter than most real ones (section 4).

## 2. `shelter-pre-pottery-levant-house`

**What.** A single-storey mudbrick house of the Pre-Pottery Neolithic of the southern Levant, about 4.6 by 5.4 m outside, walls 2.2 m high with a plastered face, and a flat roof of oak beams covered with mud and lime plaster that overhangs a little. The corners are rounded and the beam ends show along the sides. A low door with a stone threshold faces +Z.

**Evidence.** At Jericho the Pre-Pottery Neolithic A (c. 9500 to 8700 BCE) has round to oval houses of hand-moulded, plano-convex mudbricks, 4 to 5 m across; in the Pre-Pottery Neolithic B (c. 8700 to 7000 BCE) the plan turns rectangular with rounded corners and rooms of 2 to 5 m, with plastered floors and walls, sometimes painted red, at Jericho, Ain Ghazal (Jordan) and Beidha (Kenyon 1957, *Digging up Jericho*; Bar-Yosef 1986, *Current Anthropology* 27; Rollefson 1998, *Paléorient* 24; Kuijt and Goring-Morris 2002, *Journal of World Prehistory* 16). Roofs were flat, of beams, reeds and mud (the burnt roofs of Ain Ghazal and Çayönü kept their beam impressions). The model is the transitional "round-cornered rectangle", so it reads as the step between the round Natufian house and the later square one.

**Why it looks so.** A pale plaster face and oak beam ends are what a viewer from the camera distance sees; the door, small and low, shows the house keeps heat. Not drawn: the interior, which was dug 0.3 to 0.5 m below the yard.

**Profile.** `levant-farmer` (proposed name: the Pre-Pottery Neolithic farmers of the Levant, successors of `natufian`, from the `fertile-crescent` threshold of peopling.md section 3.6, c. 9500 to 6500 BCE).

## 3. `shelter-anatolian-house` and `shelter-anatolian-house-joined`

**What.** A rectangular mudbrick house about 5.6 by 6.2 m outside and 2.6 m high, plastered pale, with a flat roof edged by a low parapet. There is no door in the ground floor: the way in is a hatch in the roof, reached by an oak ladder that leans on the front wall (+Z) and stands above the roof edge. Next to the hatch the roof has a smoke opening; a band and two stripes of red ochre are painted on the plaster. The variant `-joined` has a second, lower room built against its left side with a shared wall, as the houses of Çatalhöyük were packed with no streets between them.

**Evidence.** Çatalhöyük East (Turkey, c. 7100 to 6000 BCE) is a town of rectangular mudbrick houses of one room about 25 m² inside, sharing walls, entered from the roof by a ladder through the smoke-hole, the oven and hearth on the south wall below it; roofs of timber, reeds and clay were the town's streets (Mellaart 1967, *Çatal Hüyük: A Neolithic Town in Anatolia*; Hodder 2006, *The Leopard's Tale*; Düring 2006, *Constructing Communities*; Çatalhöyük Research Project reports, Hodder ed. 2005 to 2014). Walls were plastered white and renewed again and again; red and ochre paintings of geometric patterns and scenes are known from the **inside** of houses. **Doubtful:** the red paint on the outside of the model is borrowed from the interiors so that "painted plaster" can be seen from afar; no exterior paint is shown by the finds. Yang may drop the stripes.

**Why it looks so.** The ladder and the hatch are the one thing that tells a Çatalhöyük house from any other flat-roofed house, so they are drawn big and the ladder rises a metre over the roof. Figures that come out of this lodging come out at the foot of the ladder.

**Profile.** `anatolian-farmer` (proposed: the farmers of central Anatolia, c. 7100 to 6000 BCE and the Neolithic of Anatolia in general). Use `-joined` once a village has three or more lodgings of this kind, and the plain one for a founding house.

## 4. `shelter-lbk-longhouse`

**What.** A timber longhouse of the Linearbandkeramik (LBK) farmers of central Europe: about 15 m long and 5.6 m wide, with low wattle-and-daub walls on oak posts, and one big roof of golden thatch that comes down nearly to the ground, with a round ridge and a hipped end. The door is in the middle of the long wall facing +Z. Posts stand in rows along both walls; a smoke hole shows in each gable.

**Evidence.** LBK settlements (c. 5500 to 4500 BCE, from Hungary to the Paris Basin) are known from post-hole plans of long houses 12 to 45 m long, 5 to 7 m wide, with three or five rows of heavy posts, in three parts (a north-west storeroom or cattle end, a middle living part, a south-east end), wattle and daub walls, and a steep gabled roof, probably of thatch (Modderman 1970, *Linearbandkeramik aus Elsloo und Stein*; Bogucki and Grygiel 1993, *Journal of Field Archaeology* 20; Coudart 1998, *Architecture et société néolithique*; Lüning 2000, *Steinzeitliche Bauern in Deutschland*). Walls and roofs are reconstructed (as at Lauchheim and Cuiry-lès-Chaudardes); no wall has survived.

**Why it is shorter.** A typical house was 25 to 30 m long. A lodging stands 12 layout metres from the hearth in a ring of five, where a 25 m building would run into its neighbours and the hearth, so the model is the **short type** of 15 m (houses of 10 to 15 m are common in the oldest LBK and for single families), at the 2.7 : 1 proportion of those, not the 4 to 5 : 1 of the long ones. **Needs Yang's eye:** whether the village layout should give it a longer ring instead. The door is on the long side because the model must face the hearth; a gable-end door is as likely in reconstructions.

**Profile.** `central-european-farmer` (proposed: the LBK farmers, c. 5500 to 4500 BCE, of the middle Danube, Rhine and Paris Basin).

## 5. `shelter-mehrgarh-house`

**What.** A rectangular block of sun-dried mudbrick about 6.4 by 4.6 m outside and 2.1 m high, flat roofed, in which cross walls divide the inside into small compartments; the cross walls show as low raised ridges in the roof. The brick courses along the roof edge are drawn as rows of long hand-moulded bricks. A narrow door faces +Z, with a step.

**Evidence.** Period I of Mehrgarh (Balochistan, Pakistan, c. 7000 to 5500 BCE, aceramic) has mudbrick buildings of rectangular plan, many divided into four or more small rooms or compartments about 1 to 2 m wide, of hand-moulded bricks (long, "cigar-shaped" in the earliest layers); the compartments may be dwellings, stores or both (Jarrige et al. 1995, *Mehrgarh: Field Reports 1974 to 1985*; Jarrige 2008, in *Mehrgarh Neolithic*, Pragdhara 18; Jarrige et al. 2013, *Mehrgarh: Neolithic Period, Seasons 1997 to 2000*). Their roofs are not preserved: a flat roof of brushwood and clay is by analogy with the later brick houses of the region. 

**Why it looks so.** The ridges and the heavy block read as "many small rooms"; the raw brick colour (redder and less plastered than the Levant house) tells the two apart.

**Profile.** `south-asian-farmer` (proposed; from the `south-asia-farming` threshold of peopling.md section 3.6, Mehrgarh c. 7000 BCE).

## 6. `shelter-egyptian-neolithic-hut`

**What.** A low oval hut of reed bundles and woven mats, about 4.2 by 3.4 m and 1.6 m high: arched reed bundles bent over and tied, covered with overlapping rows of mats, a rim of mud at the foot, a mat flap for the door facing +Z, and a woven windbreak mat on two poles beside the door.

**Evidence.** Settlements of the Fayum A culture (c. 5400 to 4500 BCE), Merimde Beni-Salama (c. 4800 to 4300 BCE) and the Badarian (c. 4400 to 4000 BCE) leave hearths, post holes, storage pits and shallow oval hollows with windbreak lines of posts, not houses; Merimde has oval huts partly sunk in the ground, probably of reed, mats and mud (Caton-Thompson and Gardner 1934, *The Desert Fayum*; Brunton and Caton-Thompson 1928, *The Badarian Civilisation*; Wenke et al. 1988, *Journal of Field Archaeology* 15; Eiwanger 1984, *Merimde-Beni-Salâme I*; Midant-Reynes 2000, *The Prehistory of Egypt*). The hut is a reconstruction by analogy with the reed huts of the marsh Arabs and the Nile Delta; **doubtful in the details**, which is why it is plain.

**Profile.** `nile-farmer` (proposed: Fayum, Merimde and the Badarian, c. 5400 to 4000 BCE; the Predynastic of milestone 3 continues from it).

## 7. Which profile uses which

| Profile (proposed names) | Lodging kinds |
| --- | --- |
| `levant-farmer` | `shelter-pre-pottery-levant-house` (replaces `shelter-natufian-house`) |
| `anatolian-farmer` | `shelter-anatolian-house`, `shelter-anatolian-house-joined` |
| `central-european-farmer` | `shelter-lbk-longhouse` |
| `south-asian-farmer` | `shelter-mehrgarh-house` |
| `nile-farmer` | `shelter-egyptian-neolithic-hut` |

The profile names are proposals; the people profiles are specified elsewhere and the table is updated to their ids. These models are not yet entered in `CAMP_SHELTER`, because the profiles do not exist.

## 8. Review

`npm run asset-sheets` draws the shelters sheet with them and, for each, a single sheet (`sheet=single&id=...`) from two sides with a person for scale. Triangle budget 1,000 each.
