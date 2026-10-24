# Milestone 2: First people

This is the detailed spec for the second milestone in [milestones.md](milestones.md#2-first-people). It refines [spec.md](spec.md) for what milestone 2 builds; where the two disagree, fix whichever is wrong in the same pull request. Decisions marked **Proposed** are defaults chosen so work can start and are open for Yang to change; the open questions are in section 17.

**Goal:** the first living humans, and the systems that let small stories play out on the globe. A viewer opens the app at 70,000 BCE on a single person by Lake Turkana in Kenya, who builds a grass hut and hunts; new people step out of the hut, and camp by camp her family fills Africa ([humankind.md](humankind.md)). At 50,000 BCE there are camps of people at work in Africa, along the coasts of Asia, in Sahul and in Europe, where Neanderthals still live. Families walk out of Africa along the coasts. On the steppe a band of hunters stalks a mammoth, over and over for as long as its era lasts. Zooming in on Lascaux opens the hill like a dollhouse, and painters are at work inside by torchlight. At about 9500 BCE the stone rings of Göbekli Tepe rise in southeastern Anatolia. Tapping any figure explains what it is doing, in English or German.

The milestone proves the world query in its Web Worker, figures driven by the clock (spec section 2.1), cross-device determinism, and the systems every later milestone reuses: the tree of humankind and its **migrations**. Vignettes, landmarks and cutaways were planned and removed (sections 6 to 8).

Decided by Yang on 2026-10-17: no population model is needed for this milestone (where people live comes from culture areas and migrations, section 3); the tree of humankind and migrations are the core of the milestone (on 2026-10-18 Yang added the tree of humankind of [humankind.md](humankind.md), which decides where figures come from; there is still no population data).

## 1. Deliverables at a glance

| Area | Delivered | Section |
| --- | --- | --- |
| World query | Scene from the clock and view in a Web Worker; deterministic arithmetic | 2 |
| Where people live | Culture areas by date, camps, density without population data; the tree of humankind from the first person to 9000 BCE | 3, [humankind.md](humankind.md) |
| Culture profiles | Seven hunter-gatherer profiles from Africa to the Americas | 4 |
| Figures | Rig, parts, animations, tasks and levels of detail | 5 |
| Vignettes | Removed | 6 |
| Small scenes | Not built | 7 |
| Landmarks | Removed | 8 |
| Migrations | Arrival points, the arrival map, canoe crossings, adapting to each region | 9, [peopling.md](peopling.md) |
| Events | The part of the event system this milestone needs | 10 |
| Info cards | Figure, site, animal and event cards | 11 |
| Content | The records of this milestone | 12 |
| Assets | Generated figures and props, reviewed by Yang | 13 |

## 2. World query

### 2.1 The worker and the scene

The world query runs in a Web Worker (`app/src/world/`). It receives the clock, the play state and the view (camera position, the visible quadtree tiles) and returns a **scene**: the camps, figures, migration groups and markers in and near the view, each with a stable id. The renderer and the interface only draw the scene; they never decide anything about the world.

The pure functions of `app/src/time`, `app/src/core` and `app/src/planet` (sea level, ocean mask, ice, ground height) move into the worker unchanged ([milestone-1.md](milestone-1.md#22-repository-layout) section 2.2), so the world query knows where land, sea, ice and desert are at the date. It is a separate worker from the terrain workers of milestone 1 (section 11.5), which only build meshes and textures.

### 2.2 Motion as segments

Figures and props move every frame, but the worker does not run every frame. For every moving thing it returns **segments**: a start and end on the clock, a start and end position, a heading, and an animation clip with its start offset. The renderer interpolates positions and plays clips on the GPU from the clock. The worker returns segments covering at least the next 10 seconds of real time at the current speed mode (so 160 seconds of clock time in fast forward) and is asked again when the earliest segment set runs out, when the clock crosses a time-window boundary, or when the view changes tiles. When history is paused nothing is recomputed and the renderer holds the stopped clock, so every figure stops mid-step. When the clock jumps (scrubbing, a bookmark), the worker is asked at once for the new clock time.

### 2.3 Determinism rules

The same clock time and view always give the same scene, on every device and browser.

- **Hashing.** Every choice that looks random is the 32-bit hash of `app/src/core/hash.ts` (milestone 1) over stable inputs, such as a figure id and a clock slot. Inputs are integers and string ids, never floating-point values.
- **Integer inputs.** The clock is whole milliseconds and dates derived from it are whole days (milestone 1 section 3). Positions in the scene are latitude and longitude in whole microdegrees (about 0.1 m, far below anything visible), and stage coordinates in whole centimetres.
- **No engine-dependent maths.** `Math.sin`, `Math.cos`, `Math.atan2`, `Math.exp`, `Math.pow` and their relatives may differ between JavaScript engines in the last bits, so the world query never calls them. It uses only `+ − × ÷` and `Math.sqrt` on doubles, which IEEE 754 makes exact on every device, plus deterministic polynomial versions of sine, cosine and arctangent in `app/src/core/detmath.ts`. Rounding to microdegrees happens once, at the end of each computation. A lint rule forbids the engine functions in `app/src/world/` and `app/src/core/`; the renderer is free to use them.
- **Loading never changes the world.** A camp or figure exists in the scene whether or not its models, textures or text have arrived (spec section 10). Missing models draw as neutral placeholders.

### 2.4 Budget

A full world query for the densest view of this milestone takes under 8 ms on the reference phone (spec section 9). Updates triggered by the clock moving on within a time window, which are the most frequent, recompute only segments and take under 2 ms.

## 3. Where people live

There is no population data in this milestone (decided by Yang). Where people live, and roughly how many there are, comes from the culture profiles and migrations. Which figures live there, in which lodgings, and which figure each came from is decided by the tree of humankind ([humankind.md](humankind.md)), which the data build computes from these areas and densities.

### 3.1 Culture areas

Every culture profile record has an `area` per period: GeoJSON polygons at snapshot dates, such as "Africa south of the Sahara band" at 70,000 BCE, or "Sahul coasts" at 50,000 BCE and "all of Sahul" at 40,000 BCE. Between snapshots the area grows or shrinks along the matching migration paths (section 9): land counts as inside an area once the migration front has passed it. On any date a point of land is inhabited by a culture when it is inside that culture's area, is land at the date (sea level, milestone 1 section 5.1), is not under ice, and is not desert (aridity under 0.8, milestone 1 section 4.3). Two cultures may share land, as Neanderthals and modern humans did in Europe from about 45,000 to 38,000 BCE.

The data build checks that every culture area at every snapshot is consistent with the migrations that feed it: no area reaches a continent before a migration arrives there.

### 3.2 Camps

People live in camps. Camps are founded by the tree of humankind ([humankind.md](humankind.md#4-how-the-tree-grows) section 4), which replaces the camp cells and fades of earlier drafts: a camp stands at least one camp spacing from the next (section 3.3), at a spot scored for being near a river, lake or coast and away from steep or high ground, so camps cluster along water as they did. At the end of each **residence window** (100 years before 10,000 BCE, about 4 minutes of watching at regular speed, staggered by hash so camps do not all move at once; decided by Yang on 2026-10-18: these are nomads) a band takes down its shelters, walks to a new spot nearby and builds them again; it never fades out and back in.

A camp has a hearth, two to five shelters from the culture's architecture set, work spots (knapping stone, drying rack, hide frame, wood pile) and a ring of paths, laid out from the camp's hash. From orbit each camp shows as a small puff of hearth smoke, so inhabited land reads at a glance.

### 3.3 Density

Each culture area per period carries a `density` of `remote`, `sparse`, `low` or `medium`, which sets the spacing between camps (**Proposed**: about 2,800, 1,350, 900 and 600 km, [humankind.md](humankind.md#41-targets) section 4.1). Every camp shows a band of 3 to 5 figures, whatever the density (decided by Yang on 2026-10-18). These are visual densities, not population counts: the card for a camp says that a band was usually 20 to 50 people and that the whole world then held perhaps a few million. No population data is used in later milestones either; settlements carry size classes, and population estimates only check the tree ([humankind.md](humankind.md#61-checking-against-population-estimates) section 6.1).

## 4. Culture profiles of this milestone

| Id | Profile | Area and span (approximate) | Look and life | Typical activities |
| --- | --- | --- | --- | --- |
| `african-stone-age` | African hunter-gatherers (Middle and Later Stone Age) | Africa, start of timeline to the end of this milestone | Light clothing of hide, ostrich-eggshell beads, grass shelters | Gathering plants, hunting with spears and later bows, collecting shellfish on the coasts, knapping stone, tending fire, making beads |
| `neanderthal` | Neanderthals | Europe and western Asia, start of timeline to c. 38,000 BCE | Stockier build, heavy fur wraps, hide shelters and rock overhangs | Hunting with thrusting spears, scraping hides, knapping stone, tending fire |
| `coastal-asia-hunter` | Hunter-gatherers of southern and eastern Asia | Arabia, the coasts of India, Sundaland and East Asia, from the arrival of modern humans | Light hide and plant-fibre clothing, closed brush huts (the grass hut for now; lean-tos are open, so they cannot hide the people who step out of them, Yang, 2026-10-19) | Fishing and collecting shellfish, gathering, hunting, knapping stone, making rafts on the coasts |
| `first-australians` | First Australians | Sahul, from c. 50,000 BCE (arrival debated, possibly earlier) | Possum-skin cloaks in the south, bark shelters, ochre body paint | Gathering, hunting, fishing, grinding seeds, painting on rock, burning grass to renew it |
| `ice-age-hunter` | Ice-age hunters of Europe | Europe, c. 43,000 to 10,000 BCE | Tailored fur clothing sewn with bone needles, hide tents, mammoth-bone huts on the plains of Ukraine | Hunting reindeer, horse and mammoth, sewing, carving figurines, painting in caves, knapping stone |
| `steppe-beringia-hunter` | Mammoth hunters of Siberia and Beringia, and the first Americans | Siberia from c. 30,000 BCE, Beringia, the Americas from c. 14,000 BCE (date debated) | Heavy fur clothing, hide tents, fluted spear points in the Americas | Hunting mammoth, bison and caribou, fishing, sewing, knapping stone |
| `natufian` | Natufians and the builders of Göbekli Tepe | The Levant and upper Mesopotamia, c. 12,500 to 8800 BCE | Round stone-based huts, the first villages of hunter-gatherers | Harvesting wild cereals with sickles, grinding grain, hunting gazelle, carving stone; builders at Göbekli Tepe |

- Every profile lists its architecture set, clothing, tools, animals (as asset or vocabulary ids), its activity mix (the share of figures doing each activity), its roles, and a card sentence per activity in both languages (section 11, [content-format.md](content-format.md#5-fields-per-kind)).
- Women, men and children appear in every band. Any role may be held by a woman or a man unless the profile's sources say otherwise; the card text is written so it never assumes.
- Profiles end where their real way of life ends. Morphing into the profiles that follow is milestone 3, so in this milestone land whose profile has ended stays empty: this milestone's world is complete from the start of the timeline to about 9000 BCE.

## 5. Figures

### 5.1 Look and scale

Figures follow the toy-planet style of spec section 8: chunky, rounded clay-like shapes, slightly large heads and hands, flat cel-shaded colours in three bands with dark ink outlines, no textures with painted detail beyond simple colour regions. A figure is about 700 triangles at the closest level of detail.

People and everything they make are drawn at a fixed **miniature factor**: **Proposed** 90, so a person of 1.7 m stands about 150 m tall on the globe, and the dozen figures of a close view fill the screen from the camera's lowest altitude of about 2 km (milestone 1 section 6.1). Camps are authored at life size and scaled by the same factor, so it can be tuned in one place.

**Fixed size, like the trees** (decided by Yang on 2026-10-18: everything visible from orbit and alive, not to scale; and "mammoths and humans should not scale based on zoom level. they behave like trees in terms of zoom sizing"). This replaces the miniature factor: like the trees of [foliage.md](foliage.md), a camp keeps one drawn size at every zoom.

- **Figures** are drawn at **Proposed** 42.5 km per life-size metre (50 until Yang asked on 2026-10-19 to make everything 15% smaller), so an adult stands about 75 km tall, about half as tall as a tree. Big animals are drawn at most **Proposed** 1.6 times an adult's height, so people stay readable next to a mammoth (about 140 km tall).
- **The stage layout** (where marks are and how far figures walk) is drawn at **Proposed** one third of the figures' factor, about 14 km per metre, so figures are 3 times larger relative to their stage than in life. A camp of 40 m radius spans about 570 km, and its layout leaves room for the enlarged figures, so no two figures overlap.

From orbit an adult is then about 15 pixels tall on a desktop screen; close to the ground a figure towers over the scene, as a tree does. A camp is a diorama, not a scale model. Figures stand on the ground at their own position, following the curve of the globe. They always stand upright on the ground, whatever the camera does, so from straight above they are seen from the top, like the huts around them (Yang, 2026-10-18: "The people's tilt should not depend on camera perspective!"). This is drawing only: positions and timing are unchanged.

### 5.2 Rig and parts

- One shared skeleton for all humans, with per-profile body proportions (Neanderthals stockier, children smaller) applied as bone scales.
- Parts per profile: clothing, hair and headgear, held tools (spear, digging stick, scraper, needle, torch, basket, sickle) attached to hand bones. A figure's look is its profile plus a hash of its id choosing among the profile's variants of colour and parts.
- Figures are instanced: one draw call per profile part set and level of detail. So are the camps of the tree of humankind: lodgings, hearths, racks, spits, canoes, flags, carrying poles, spears and hunted animals are copies of a few models, posed per copy (lodgings going up step by step, fires flickering); only an animal fading in or out is drawn on its own.

### 5.3 Animations

Clips are baked into an animation texture and played on the GPU (milestone 1 section 11.4). In the app (Yang, 2026-10-20) each model's clips are baked the first time a copy plays them, 30 frames a second, into a texture with a row of part matrices per frame (an all-zero matrix for a hidden part, such as a tool put away). Each copy names two neighbouring frames of its clip and, while it eases from one clip into the next, two of the old clip as well; the vertex shader blends between them, so the CPU poses nothing per frame. A clip is either a loop, whose every cycle fits its loop length a whole number of times (people's idle repeats after 16 seconds, an animal's after six strides), or a one-off gesture that holds still once done; the tests check both for every clip. Blending matrices instead of joint angles differs only slightly over the short blend of a change of clip. The first clip set: idle, walk, run, carry, crouch-work, knap, scrape, dig, gather, throw, stab-thrust, paint, tend-fire, sit, talk, point, wave, paddle, haul, lift, sleep, sink (for figures lost to an effect), play (children). Clips have no blood or wounds in any form. Every action in the vignette vocabulary (section 6.4) maps to one or more clips.

**Fluid motion** (Yang, 2026-10-18: "make sure her movements are fluid"). Every clip is smooth in angle and in speed, so no joint snaps:

- **Planted feet.** The stepping clips (walk, run, carry, haul) turn the standing leg at an even pace while its foot is down and swing the other leg forward on a smooth curve that leaves and meets the stance at the same speed. A figure playing one moves at that clip's **gait speed** (`gaitSpeed` in `assets/src/clips.ts`, from the leg length and the clip's stride: about 1.1 m/s walking for an adult woman), so the standing foot stays where it was put down instead of sliding. The hips rise over the standing leg, dip as a heel comes down, and turn and roll a little with each stride; the torso turns against the hips and the head keeps looking ahead; lower arms trail the upper arms.
- **Easing between clips.** A change of clip never cuts: over 0.35 s (`BLEND_SECONDS`) every joint angle and the speed ease from the old clip into the new one. Held and carried things switch half way through.
- **Checked by tests.** Moving at the gait speed, the standing foot of walk, carry and haul stays within 5 cm of where it was put down and of the ground; across every change between two clips, no body part turns faster than 30 radians per second at 60 frames per second (the snap of a throw is the one faster movement, as in life).
- The review sheet `founder-motion` (`asset-sheet.html?sheet=founder-motion`) shows the first person walking in, working at the hearth, standing, walking on and throwing; `window.setFrame(seconds)` poses it at any moment, so a short film for review is recorded frame by frame.

### 5.4 Tasks

Ordinary figures live in their camp. Each figure's id is its id in the tree of humankind ([humankind.md](humankind.md#31-figures) section 3.1), so it stays the same for as long as the figure lives, wherever its camp moves. Clock time is cut into **slots** of 10 to 30 seconds per figure (length from a hash of figure id and slot number). In each slot the figure picks a task from its profile's activity mix (hash of figure id and slot), walks to the matching work spot, works there and may carry something back. Gatherers and hunters may walk out of the camp and return within one slot. The worker turns the slot's task into segments (section 2.2).

### 5.5 Levels of detail

| Camera altitude (approximate) | Figures drawn as |
| --- | --- |
| Under 20 km | Full rig, animated |
| 20 to 80 km | Simplified rig of about 150 triangles, walk and work clips only |
| 80 to 300 km | Coloured marks, one per figure, moving along their segments |
| Above 300 km | Camps only, as hearth smoke |

The limit on animated figures (milestone 1 section 11.2) caps the first level; figures beyond the limit fall back to the next level, nearest kept first.

## 6. Vignettes

Removed (Yang, 2026-10-22: "remove the whole thing. it's not used and not really useful anymore", issue 147). The vignette engine (templates, records, the player, the vignette layer and the action vocabulary) was built for the shelved Giza diorama and nothing else used it; the scenes of the tree of humankind (humankind.md sections 8.1 and 8.2) have their own plans and need none of it. The info cards (section 11) stay: site cards and animal cards use them. The recurring dioramas of [dioramas.md](dioramas.md) are an idea list only until a new way to stage them is specified.

## 7. Small scenes

Cutaways and scene markers were specified for vignettes and never built. The caves are scenes of the tree of humankind, drawn as props on the ground (humankind.md section 8.2); a cutaway view would need a new spec.

## 8. Landmarks

Removed (Yang, 2026-10-22: "remove the whole thing. it's not used and not really useful anymore", issue 147). The landmark engine (records, construction stages, the landmark layer and the Giza pyramid and Sphinx models) is gone with the vignettes; the Giza plans are no longer kept. Göbekli Tepe and the painted caves are scene props of the tree (humankind.md section 8.2), not landmarks.

## 9. Migrations

How people spread out of Africa and adapt to each region is designed in [peopling.md](peopling.md) (decided by Yang on 2026-10-18). Its arrival map replaces the front below, the tree's budding bands replace the walking families, and the rafts become small canoes at its listed crossings; where this section and peopling.md disagree, peopling.md wins.

A migration is an event of type Migration (or Voyage for sea crossings) whose `where` is a dated path (content-format section 4), possibly branching into several paths, and whose effect is to extend a culture area (section 3.1).

- **The front.** At any date the front is the interpolated position along each path. Land behind the front and inside the culture's next area snapshot is inhabited.
- **Walking families.** Near the front, groups of six to ten figures (adults and children with bundles, baskets and carried fire) walk along the path. Each group's base position follows the front by date; on the clock the group walks a short stretch, makes camp, and walks on. When history is paused they stop mid-step.
- **Rafts.** Sea crossings, such as from Sunda to Sahul across straits of up to about 90 km at the time, are crossings of the tree (peopling.md section 6) along the crossing points of the path.
- **On the overlay.** A migration path is drawn as an animated dotted line while it is active, the first use of the route overlay (spec section 7.2).

## 10. Events in this milestone

Milestone 3 builds the full event system. This milestone pulls forward only what its migrations need:

- Event records and their schema, with the types Migration, Voyage, Construction and Invention or idea (spec section 5) and presenters for them.
- Events as icons and bars on the timeline (spec section 7.1), and double-click fly-to to an event's place and its shown span.
- The scene markers of section 7.2.

The "Happening now" list, the floating event markers of spec section 5 and the remaining event types stay in milestone 3.

## 11. Info cards

Tapping a figure, scene, animal or event opens a card: a panel on desktop, a bottom sheet on phones (spec section 7.5). Cards never pause time.

- **Figure card:** the figure's role in the viewer's language (German role nouns in the feminine or masculine form to match the figure, from `vocab/roles.yaml`), its culture, the activity sentence for what it is doing right now, and a line about its culture. The activity sentence is written without pronouns, so it reads correctly for anyone: "Shaping a stone blade by striking it with another stone. Sharp blades were needed for cutting meat and hides."
- **Site, animal and event cards:** the record's card text, the date (with "c." where approximate) and "Learn more".
- **Camp card** (tapping hearth smoke or a shelter): what a band was and how it lived, from the culture record.

Card texts come from text chunks loaded when the card opens (content-format section 7); while loading, the card shows its title from the structure data and a loading state.

## 12. Content of this milestone

| Kind | Records |
| --- | --- |
| Culture profiles | The seven of section 4 |
| Migrations (events) | Out of Africa (c. 60,000 BCE, after the tree has filled Africa, from East Africa across the Bab-el-Mandeb and along the coasts of Arabia and India to Sundaland); first people reach Sahul (c. 50,000 BCE, older dates such as Madjedbebe debated; Voyage); modern humans reach Europe (c. 45,000 BCE) and East Asia (c. 43,000 BCE, debated); into Siberia and Beringia (c. 30,000 BCE); people reach the Americas (c. 14,000 BCE, debated and possibly earlier; then south along the Pacific coast and through the opening ice-free corridor) |
| Events | Those above from [events.md](events.md) (Modern humans leave Africa, First people reach Australia, Lascaux cave paintings, People reach the Americas, Building of Göbekli Tepe), plus the eruption of the Phlegraean Fields (c. 37,900 BCE) as a card on the timeline only, without its presenter |

All dates are checked against sources when the records are written, and the rows in [events.md](events.md) gain their `id` column then (content-format section 9). Debated dates say so on the card.

## 13. Assets

### 13.1 How assets are made

**Proposed:** figures, parts, props and shelters are modelled by scripts in `assets/src/` from rounded primitives (capsules, spheres, rounded boxes and lathed shapes), which suits the clay-toy look, and exported as glTF with meshopt compression. Animations are keyframed in the same scripts on the shared skeleton and baked into animation textures by the asset build. Cave paintings and other flat art are generated images. Every asset has a review sheet: turnaround renders in the app's own cel-shaded renderer, at close and medium zoom, produced by `npm run asset-sheets` with Playwright.

### 13.2 Review and order

1. **Art sheet first.** Before any other asset, one sheet showing a figure of each profile at close zoom on the globe, next to a camp, for Yang to approve the look of people.
2. Then the rig and clips, the profile parts, the camp props and the animals.

Every asset is listed in `data/assets/manifest.json` with its status (milestone 1 section 12). Until approved, the app draws a flat-coloured stand-in of the same size; only a preview build with `VITE_PREVIEW_ASSETS=1` draws it for review (milestone 1 section 12).

**Approval by content.** A model is code, so its approval is tied to the geometry Yang saw: the manifest entry of every approved model also records `geometry`, a hash of what the script builds by default (variant 0 with its default tool): the vertex positions, vertex colours and indices of every part and each part's placement, rounded to 0.1 mm and colours to 0.001, so the hash does not depend on the last bits of floating-point maths. The model tests fail when a model no longer matches its hash, so a model that changes needs approving again. After Yang approves it, `npm run approve-assets -- <id>...` records the new hash, the status `approved` and the review date. The plant models of [foliage.md](foliage.md) are approved the same way.

### 13.3 The prehistoric model set

The first models are the people, shelters and animals of the seven culture profiles of section 4. Each is a modelling script in `assets/src/` that returns the model at life size in metres, facing +Z with its feet on y = 0, so the miniature factor (section 5.1) is applied in one place. Colours are flat vertex-colour regions, lit by the same cel-shaded studio light as the globe (milestone 1 section 3.6) and outlined in ink by an inverted hull.

**People.** Every profile has a man, a woman and a child, built on the shared skeleton of section 5.2 (body, head, upper and lower arms, legs) so the same clips drive all of them. **Proposed:** about 600 to 950 triangles at the closest level of detail (about 800 on average), at most 1,100 with the carried bundle that only the carry clip shows (1,050 until the face was redone), slightly above the 700 of section 5.1 because round clay shapes need some more; the simplified level of section 5.5 stays at about 150. Details too small to see at diorama size, such as ears, are left out. The face is two dark eyes, a small nose and a mouth on a head smoother than the other clay parts, each set on its surface so no lump hides it (Yang, 2026-10-20: "people have very unreal faces"; until then two small dots that the lumpy clay half swallowed). Dioramas are not to scale (decided by Yang on 2026-10-18): figures and animals are drawn far larger than life so they can be seen from orbit, so every model is built for a bold silhouette with few details, chunky limbs and strong colour contrast, and heads and hands are about 1.4 times life size so roles read from a distance. Clothing, hair and the held tool change per profile; the body proportions change only for Neanderthals (shorter, broader chest, short shins, heavy brow, no chin). Skin and hair colours are picked per figure by hash from a range per profile, wide in every band. Skin is never so dark that the clay shading of faces and limbs is lost: the `african-stone-age` range runs over warm mid browns (Yang, 2026-10-18: true to life, but features must stay visible). Early modern Europeans are given medium to dark skin, because ancient DNA shows light skin spread in Europe only after about 8000 BCE (Olalde et al. 2014, *Nature* 507). Neanderthals range from light to medium skin with some red hair (Lalueza-Fox et al. 2007, *Science* 318).

| Profile | Clothing | Tools in hand |
| --- | --- | --- |
| `african-stone-age` | Short hide wrap or apron, ostrich-eggshell bead strings | Spear, digging stick (the men carry spears; from about 45,000 BCE they hunt with a bow, drawn as its own prop during the `shoot` clip, humankind.md section 8.1; Yang, 2026-10-19 and 2026-10-22) |
| `neanderthal` | Draped untailored hide over the shoulders, fur wraps on the legs | Heavy thrusting spear, stone scraper |
| `coastal-asia-hunter` | Plant-fibre skirt or hide wrap | Fishing spear, shell basket |
| `first-australians` | Possum-skin cloak (in the south), ochre lines on the skin | Spear, digging stick, wooden dish |
| `ice-age-hunter` | Tailored fur tunic, trousers and boots sewn with bone needles | Spear with spear-thrower (from c. 16,000 BCE; spear alone before), sewing needle |
| `steppe-beringia-hunter` | Heavy hooded fur parka, fur trousers and boots | Spear (with a fluted point in the Americas), scraper |
| `natufian` | Hide tunic, bead headband | Flint sickle in a bone haft, grinding stone |

**The first person.** One more figure, `figure-first-person`, is the first person of the tree of humankind, who stands alone at Lake Turkana at the start of the timeline (asked for by Yang on 2026-10-18; the tree is specified separately). She is a woman of `african-stone-age` with a fixed look instead of a hashed one, so she can always be recognised: a red-ochre headband, which she keeps in every later era as her mark; a hide wrap and skirt dyed with red ochre; a string of ostrich-eggshell beads and a second, longer string of shell beads (shell beads are known in Africa from at least about 75,000 years ago at Blombos Cave, d'Errico et al. 2005, *Journal of Human Evolution* 48); red-ochre bands on her upper arms; her hair in a bun; and a spear, since she hunts. She uses the same skeleton and clips as everyone else and stays within the people's budget of 1,050 triangles (936). `npm run asset-sheets` draws her turnaround beside an ordinary woman (`first-person`) and her first camp with the grass hut, the hearth and an eland (`first-person-camp`).

**Shelters and camp props.**

| Id | Model | Profiles |
| --- | --- | --- |
| `shelter-hide-tent` | Cone of poles covered in sewn hides, smoke hole at the top | `ice-age-hunter`, `steppe-beringia-hunter` |
| `shelter-mammoth-bone-hut` | Dome of mammoth jaws, tusks and long bones over a hide cover (Mezhyrich, Ukraine, c. 13,000 BCE) | `ice-age-hunter` on the plains of Ukraine |
| `shelter-windbreak` | Hide stretched on a curved row of poles, as at the mouth of a rock shelter | `neanderthal` |
| `shelter-grass-hut` | Small brush hut of mobile foragers, as the Hadza and San build in an afternoon: a dome of bent branches about 2.4 m across, grass laid loosely over it in three ragged rows over closed bands of grass, so no ground or frame shows through, branch tips poking out on top, a low shadowed doorway; built in steps (frame, then the grass from the ground up), see [humankind.md](humankind.md) section 8.1 (changed by Yang on 2026-10-18: nomads build light huts, not a settled thatched dome) | `african-stone-age` |
| `shelter-lean-to` | Sloping roof of branches and leaves on two forked posts | none for now: an open shelter cannot hide the people who step out of it (Yang, 2026-10-19: "the half open shelters in south and east asia are not suitable for the 'grow population by having people come out of lodges' trick"); `coastal-asia-hunter` uses `shelter-grass-hut` until a closed leaf hut of its own is made |
| `shelter-bark` | Curved sheets of bark over a frame of bent saplings | `first-australians` |
| `shelter-natufian-house` | Round house sunk into the ground on a ring of stones, with a brush roof (Ain Mallaha) | `natufian` |
| `prop-hearth` | Ring of stones with a cartoon fire whose flames flicker, each flame its own bone | All |
| `prop-drying-rack` | Poles with a stretched hide | All but `natufian` |

**Animals.** 300 to 3,000 triangles each (spec section 8), built from the same primitives, standing at life size. Nothing is shown wounded.

| Id | Animal | Where |
| --- | --- | --- |
| `animal-mammoth` | Woolly mammoth | Europe, Siberia, Beringia, North America |
| `animal-woolly-rhino` | Woolly rhinoceros | Europe and northern Asia |
| `animal-reindeer` | Reindeer, caribou in America | Europe, northern Asia, Beringia |
| `animal-horse` | Wild horse, dun with a dark upright mane as in cave paintings | Europe and Asia |
| `animal-bison` | Steppe bison | Europe, northern Asia, North America |
| `animal-cave-bear` | Cave bear | Europe |
| `animal-wolf` | Grey wolf (dogs come with milestone 3) | Northern hemisphere |
| `animal-eland` | Eland | Africa |
| `animal-gazelle` | Mountain gazelle | The Levant |
| `animal-kangaroo` | Grey kangaroo | Sahul |

**Clips.** Until the asset build bakes animation textures (section 5.3), each clip is a pure function of the clip and the seconds since it started, in `assets/src/clips.ts`, which the tree's figures call every frame and the bake will sample. The first set: idle, walk, run, carry (a hide-wrapped bundle of meat across the shoulders), work (crouched, cutting), knap (kneeling, striking a hand axe held on the knee with a hammerstone; models whose culture knaps carry both stones on bones `knap` and `hammer`, shown only during this clip, while the held tool is hidden), point, throw (the spear leaves the hand 0.55 s into a 3 s gesture), shoot (a bow drawn and an arrow loosed 1.1 s into a 2.4 s gesture, with the held tool hidden) and cheer for people (the Neolithic farm-work clips till, sow, reap, thresh, grind, milk, shape and spin are in [neolithic/person-clips.md](neolithic/person-clips.md)); idle, walk, run and fall for animals, where the animal rolls onto its side and sinks a little over 3 s and then lies still, with nothing more shown.

**Review sheets.** `npm run asset-sheets` serves `app/asset-sheet.html` with the dev server and saves one image per sheet with Playwright: each profile's man, woman and child beside its shelter and hearth; a turnaround of one figure; all shelters; all animals with a figure for scale. The sheets go to Yang for review (section 13.2); one model at a time follows the loop of section 13.4 and every model is listed in `data/assets/manifest.json` with status `generated` until approved.

### 13.4 The model design and review loop

How a new model, or a change to one, goes from Yang's description to approval. The loop is one conversation; the cost of a round is one render and one message.

1. **Brief.** Yang describes the addition in a sentence or two. Claude restates it as a model card in the thread: asset id, real size in metres (w x h x l), role (animal, shelter, prop, landmark), how people interact with it, culture and time, source for the look, and the triangle budget of section 13.3. Yang corrects the card before any geometry is made.
2. **Build.** Claude adds the model script under `assets/src/`, its entry in `approval.ts` and in the manifest with status `generated`, and any clip it needs. Nothing else is touched; no data build, no spec change beyond the model card.
3. **Render.** `npm run model -- <id> <round>` draws the model on the data-free review page (`app/asset-sheet.html`, which hot-reloads and needs no world data) and saves `assets/review/<id>/r<round>-<sheet>.png`, 1600x900 each:
   - `views`: front, side and top in orthographic projection and a three-quarter view, each with a man of the ice-age hunter profile for scale, and the size and triangle count in the corner;
   - `with-people`: the model with people in the poses they take in the game (hunters throwing, pointing and standing by an animal; a family and a worker by a shelter and its hearth);
   - for a moving model, `--clip=<clip> --t=<seconds>` poses it, and the existing `clips-animal` sheet shows the motion strip.
   `--only=<sheet,...>` renders just the sheets a round changed. `assets/review/` is git-ignored.
4. **Self-check.** Before sending, Claude looks at the images and fixes what is plainly wrong: wrong scale against the man, feet not on the ground, front not facing +Z, over budget, a silhouette that does not read at game distance, people clipping the model or looking the wrong way. A round never reaches Yang with a known defect.
5. **Send in the thread.** Claude sends the images of the round into the conversation (the SendUserFile tool, display `render`) with one caption naming the round and what changed, so Yang reviews without opening files or a server. If the session cannot place files in the thread, Claude says so and serves the page `http://localhost:8800/asset-sheet.html?sheet=views&id=<id>` instead.
6. **Feedback.** Yang answers with numbered remarks, in any words. Claude changes only what was asked, renders only the affected sheets with the next round number and sends them. Earlier rounds stay on disk for comparison.
7. **Approve.** When Yang says the model works, Claude runs `npm run approve-assets -- <id>` (status `approved` with the geometry hash), `npm run check`, and opens the pull request; Yang merges.

Speed rules. A round runs only the model's own build, `models.test.ts` filtered to the model (`npx vitest run assets -t <id>`) and the render; the full `npm run check` runs once, at approval. The geometry hash only has to match for approved models, so rounds on a `generated` model never fail it. The renders use SwiftShader, so rounds do not need a GPU.

### 13.5 Animation review loop

Yang describes a motion; Claude changes the clip in `assets/src/clips.ts`, renders a round and opens the PNG with the Read tool, which shows it in the conversation (`SendUserFile` is not used); Yang answers with numbered notes; repeat until Yang approves. A round takes a few seconds because it renders one image from one page and runs no tests.

1. **Round.** `npm run anim -- <subject> <round> [seq] [n]`, for example `npm run anim -- animal-mammoth 2 walk:0-1.4,run:0-1 10`. `subject` is an animal id or `person:<profile>:<kind>` (with an optional `:<tool>` to put a given tool in the hand); `seq` is a comma-separated list of `clip:from-to` in seconds (default `walk:0-1`); `n` is the frame count (default 8). The runner starts the dev server if none answers on port 8800 and writes `assets/review/<subject>/a<round>.png`.
2. **The image** has one row per view (side, front, top, three-quarter) and one column per frame, every frame drawn in the app's cel-shaded look with the same framing, so a limb's path reads along a row and a foot that slides or a body that bobs shows in the side row. The header gives the size and triangle count; each column is labelled with its clip and time.
3. **Self-check first.** Claude looks at the image first and says what it sees: feet on the ground and not sliding, no limb through the body, the loop closes (first and last frame of a cycle match), the motion matches the note.
4. **Feedback** is numbered and names a view and a time ("3: side, 0.6 s, the back foot lifts too early"); Claude changes only what was named and bumps the round.
5. **Checks.** The clip tests in `assets/src/models.test.ts` run once at approval, with `npm run check`; clips stay pure functions of the clip and the seconds, so a round is reproducible.

Chromium needs `CHROMIUM=/usr/bin/chromium` and, in the devenv sandbox, has to run outside it.

## 14. Performance

The budget of spec section 9 holds with this milestone's content. Two new scenes join the stress scene of milestone 1 in `npm run perf`:

- **Densest camps**: the Danube valley at 40,000 BCE (Neanderthals and modern humans together) at about 15 km altitude.

## 15. Tests

| Test | Checks |
| --- | --- |
| Deterministic maths | `detmath` against `Math` within its stated error over the whole input range, and fixed outputs for fixed inputs stored as golden values |
| Lint | No engine-dependent maths functions in `app/src/world/` and `app/src/core/` |
| Schema and validation | Cultures and migrations; culture areas agree with migrations |
| Golden scenes | For a fixed list of cases (clock time, view): the scene's camps, figure ids, roles, tasks, segment end points, stored as a readable summary and a hash of the canonical serialisation. Cases: Lake Turkana at 70,000 BCE (clock time 0) and at 69,000 BCE; Africa at 62,000 BCE; East Africa and the Bab-el-Mandeb at 50,000 BCE; the Danube at 40,000 BCE; Sahul at 45,000 BCE; Beringia and the Great Plains at 30,000 and 12,000 BCE; Lascaux at 15,000 BCE; Göbekli Tepe at 9200 BCE; each at the clock time at which its date begins, and 37,000 ms and 1,800,000 ms later |
| Expected answers | No people in the Americas at 30,000 BCE; no Neanderthals after 38,000 BCE; Sahul inhabited at 45,000 BCE; no camp on sea, ice or deep desert at any golden case |
| Cross-browser | The golden scenes computed in Chromium, Firefox and WebKit through Playwright, in the worker, must match the stored results exactly |
| Browser tests | Pausing history stops figures mid-step; tapping a figure opens its card in both languages; double-clicking the Göbekli Tepe event flies there |
| Models | Every model of section 13.3 is built the same way every time, stays within its triangle budget (people 1,100, animals 1,300 since their legs got knees (Yang, 2026-10-18), shelters 1,000, the few painted caves of humankind.md section 8.2 2,400 for their hill, stones and drawings), stands on the ground at a believable height and faces +Z; clips give the same pose for the same time whatever came before; the spear leaves the hand at the release time; the falling animal stays on the ground; every model is listed in the asset manifest, and every approved one with the geometry hash it was approved with; only models still waiting for review are not approved |
| Performance check | Draw calls and triangles of the two new scenes (section 14) |

## 16. Exit criteria and how they are checked

| Criterion (from [milestones.md](milestones.md#2-first-people)) | Checked by |
| --- | --- |
| Opening at 70,000 BCE shows the first person at Lake Turkana building a hut and hunting, and by 50,000 BCE bands of people at work in Africa and spreading along the coasts of Asia | Golden scenes; the tree checks and report ([humankind.md](humankind.md#5-the-tree-build) sections 5 and 6); screenshots at the golden cases for review; Yang watches on desktop and phone |
| Scrubbing from 70,000 to 9000 BCE shows people leaving Africa and reaching Sahul, Europe, Siberia and finally the Americas | Expected-answer tests; Yang watches a scrub |
| Göbekli Tepe rises over its real span, can be found from orbit, and becomes a buried hill | Golden scene at 9200 BCE; screenshots at its stage dates |
| Tapping a figure explains what it is doing, in English and German | Browser tests; review in both languages |
| Golden snapshots match on two different machines | The cross-browser test in CI, plus the same test run on the reference laptop |

The definition of done in [milestones.md](milestones.md#definition-of-done-every-milestone) applies as well.

## 17. Out of scope and open questions

**Out of scope:** morphing between eras, farming, villages and settlements as place records, borders, place names, famous people, the "Happening now" list, epidemics, wars and battles in the world (the Viking raid is only the worked example of section 6), the population data of HYDE, offline use beyond the service worker cache.

**Open questions for Yang:**

1. The miniature factor of 90 (section 5.1).
2. The factors of the three speed modes, ×1/8, ×1 and ×16 (milestone 1 section 3.3).
3. Making figures and props with modelling scripts and reviewing them on generated sheets (section 13.1).
4. Neanderthals as their own profile in the first milestone with people (section 4).
5. The arrival of people in the Americas shown at c. 14,000 BCE, with the earlier dates (such as the White Sands footprints, about 21,000 BCE) mentioned as debated on the card.

## 18. First slice: the mammoth hunt

Removed (Yang, 2026-10-22: "remove the whole thing. it's not used and not really useful anymore", issue 147). The slice (the file formats, verbs, vignette layer, player and the mammoth hunt fixture) was built and then removed with the vignette engine. The figure models, stand-ins and clips it needed are still used by the tree of humankind.
