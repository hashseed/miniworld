# Milestone 2: First people

This is the detailed spec for the second milestone in [milestones.md](milestones.md#2-first-people). It refines [spec.md](spec.md) for what milestone 2 builds; where the two disagree, fix whichever is wrong in the same pull request. Decisions marked **Proposed** are defaults chosen so work can start and are open for Yang to change; the open questions are in section 17.

**Goal:** the first living humans, and the systems that let small stories play out on the globe. A viewer opens the app at 50,000 BCE and sees camps of people at work in Africa, along the coasts of Asia, in Sahul and in Europe, where Neanderthals still live. Families walk out of Africa along the coasts. On the steppe a band of hunters stalks a mammoth, over and over while history is paused. Zooming in on Lascaux opens the hill like a dollhouse, and painters are at work inside by torchlight. At about 9500 BCE the stone rings of Göbekli Tepe rise in southeastern Anatolia. Tapping any figure explains what it is doing, in English or German.

The milestone proves the world query in its Web Worker, figures driven by the life clock, cross-device determinism, and four systems every later milestone reuses: **vignettes** (small staged stories that loop), **landmarks** (recognisable buildings that rise over their real years), **migrations**, and **cutaways** for things too small to see from above.

Decided by Yang on 2026-10-17: no population model is needed for this milestone (where people live comes from culture areas and migrations, section 3); vignettes, landmarks, migrations and a way to show small-scale scenes are the core of the milestone; vignettes come in three forms: repeated, singular and long, and short but stretched so they can be watched (section 6).

## 1. Deliverables at a glance

| Area | Delivered | Section |
| --- | --- | --- |
| World query | Scene from date, life clock and view in a Web Worker; deterministic arithmetic | 2 |
| Where people live | Culture areas by date, camps, density without a population model | 3 |
| Culture profiles | Seven hunter-gatherer profiles from Africa to the Americas | 4 |
| Figures | Rig, parts, animations, tasks and levels of detail | 5 |
| Vignettes | Templates, records, scripts, looping, repeats, stretching | 6 |
| Small scenes | Cutaways and scene markers | 7 |
| Landmarks | Records, construction stages, ruins, visibility from orbit | 8 |
| Migrations | Dated paths, walking families, rafts | 9 |
| Events | The part of the event system this milestone needs | 10 |
| Info cards | Figure, vignette, landmark and event cards | 11 |
| Content | The records of this milestone | 12 |
| Assets | Generated figures, props and landmarks, reviewed by Yang | 13 |

## 2. World query

### 2.1 The worker and the scene

The world query runs in a Web Worker (`app/src/world/`). It receives the date, the life clock, the play state and the view (camera position, the visible quadtree tiles) and returns a **scene**: the camps, figures, vignette instances, landmarks, migration groups and markers in and near the view, each with a stable id. The renderer and the interface only draw the scene; they never decide anything about the world.

The pure functions of `app/src/time`, `app/src/core` and the date-dependent parts of `app/src/globe` (sea level, ocean mask, ice, aridity) move into the worker unchanged ([milestone-1.md](milestone-1.md#22-repository-layout) section 2.2), so the world query knows where land, sea, ice and desert are at the date.

### 2.2 Motion as segments

Figures and props move every frame, but the worker does not run every frame. For every moving thing it returns **segments**: a start and end on the life clock, a start and end position, a heading, and an animation clip with its start offset. The renderer interpolates positions and plays clips on the GPU from the life clock. The worker returns segments covering at least the next 10 seconds of life clock and is asked again when the earliest segment set runs out, when the date crosses a time-window boundary, or when the view changes tiles. When everything is frozen nothing is recomputed and the renderer holds the frozen life clock, so every figure stops mid-step.

### 2.3 Determinism rules

The same date, life clock and view always give the same scene, on every device and browser.

- **Hashing.** Every choice that looks random is the 32-bit hash of `app/src/core/hash.ts` (milestone 1) over stable inputs, such as a figure id and a life-clock slot. Inputs are integers and string ids, never floating-point values.
- **Integer inputs.** Dates are whole days and the life clock whole milliseconds (milestone 1 section 3). Positions in the scene are latitude and longitude in whole microdegrees (about 0.1 m, far below anything visible), and stage coordinates in whole centimetres.
- **No engine-dependent maths.** `Math.sin`, `Math.cos`, `Math.atan2`, `Math.exp`, `Math.pow` and their relatives may differ between JavaScript engines in the last bits, so the world query never calls them. It uses only `+ − × ÷` and `Math.sqrt` on doubles, which IEEE 754 makes exact on every device, plus deterministic polynomial versions of sine, cosine and arctangent in `app/src/core/detmath.ts`. Rounding to microdegrees happens once, at the end of each computation. A lint rule forbids the engine functions in `app/src/world/` and `app/src/core/`; the renderer is free to use them.
- **Loading never changes the world.** A camp, figure or vignette exists in the scene whether or not its models, textures or text have arrived (spec section 10). Missing models draw as neutral placeholders.

### 2.4 Budget

A full world query for the densest view of this milestone takes under 8 ms on the reference phone (spec section 9). Updates triggered by the life clock alone, which are the most frequent, recompute only segments and take under 2 ms.

## 3. Where people live

There is no population model in this milestone (decided by Yang). Where people live, and roughly how many there are, comes from the culture profiles and migrations.

### 3.1 Culture areas

Every culture profile record has an `area` per period: GeoJSON polygons at snapshot dates, such as "Africa south of the Sahara band" at 70,000 BCE, or "Sahul coasts" at 50,000 BCE and "all of Sahul" at 40,000 BCE. Between snapshots the area grows or shrinks along the matching migration paths (section 9): land counts as inside an area once the migration front has passed it. On any date a point of land is inhabited by a culture when it is inside that culture's area, is land at the date (sea level, milestone 1 section 5.1), is not under ice, and is not desert (aridity under 0.8, milestone 1 section 4.3). Two cultures may share land, as Neanderthals and modern humans did in Europe from about 45,000 to 38,000 BCE.

The data build checks that every culture area at every snapshot is consistent with the migrations that feed it: no area reaches a continent before a migration arrives there.

### 3.2 Camps

People live in camps. The world is divided into **camp cells** (quadtree tiles at level 7, about 75 km across). For each cell and **residence window** (1,000 years before 10,000 BCE, **Proposed**), a hash decides whether the cell holds a camp, given the culture's density (section 3.3), and where in the cell it stands. Candidate spots are scored: near a river, lake or coast is better, steep or high ground is worse; the hash picks among the best few, so camps cluster along water as they did. When a residence window ends, the band moves: the old camp fades out and a new one fades in elsewhere in the cell over a few seconds of watching time.

A camp has a hearth, two to five shelters from the culture's architecture set, work spots (knapping stone, drying rack, hide frame, wood pile) and a ring of paths, laid out from the camp's hash. From orbit each camp shows as a small puff of hearth smoke, so inhabited land reads at a glance.

### 3.3 Density

Each culture area per period carries a `density` of `sparse`, `low` or `medium`, which sets the share of cells with a camp (**Proposed**: 1 in 12, 1 in 6 and 1 in 3) and the band size shown in a camp (**Proposed**: 6 to 10, 8 to 14 and 10 to 18 figures). These are visual densities, not population counts: the card for a camp says that a band was usually 20 to 50 people and that the whole world then held perhaps a few million. HYDE takes over as the population source from 10,000 BCE in later milestones (spec section 4).

## 4. Culture profiles of this milestone

| Id | Profile | Area and span (approximate) | Look and life | Typical activities |
| --- | --- | --- | --- | --- |
| `african-stone-age` | African hunter-gatherers (Middle and Later Stone Age) | Africa, start of timeline to the end of this milestone | Light clothing of hide, ostrich-eggshell beads, grass shelters | Gathering plants, hunting with spears and later bows, collecting shellfish on the coasts, knapping stone, tending fire, making beads |
| `neanderthal` | Neanderthals | Europe and western Asia, start of timeline to c. 38,000 BCE | Stockier build, heavy fur wraps, hide shelters and rock overhangs | Hunting with thrusting spears, scraping hides, knapping stone, tending fire |
| `coastal-asia-hunter` | Hunter-gatherers of southern and eastern Asia | Arabia, the coasts of India, Sundaland and East Asia, from the arrival of modern humans | Light hide and plant-fibre clothing, lean-to shelters | Fishing and collecting shellfish, gathering, hunting, knapping stone, making rafts on the coasts |
| `first-australians` | First Australians | Sahul, from c. 60,000 to 50,000 BCE (arrival debated) | Possum-skin cloaks in the south, bark shelters, ochre body paint | Gathering, hunting, fishing, grinding seeds, painting on rock, burning grass to renew it |
| `ice-age-hunter` | Ice-age hunters of Europe | Europe, c. 43,000 to 10,000 BCE | Tailored fur clothing sewn with bone needles, hide tents, mammoth-bone huts on the plains of Ukraine | Hunting reindeer, horse and mammoth, sewing, carving figurines, painting in caves, knapping stone |
| `steppe-beringia-hunter` | Mammoth hunters of Siberia and Beringia, and the first Americans | Siberia from c. 30,000 BCE, Beringia, the Americas from c. 14,000 BCE (date debated) | Heavy fur clothing, hide tents, fluted spear points in the Americas | Hunting mammoth, bison and caribou, fishing, sewing, knapping stone |
| `natufian` | Natufians and the builders of Göbekli Tepe | The Levant and upper Mesopotamia, c. 12,500 to 8800 BCE | Round stone-based huts, the first villages of hunter-gatherers | Harvesting wild cereals with sickles, grinding grain, hunting gazelle, carving stone; builders at Göbekli Tepe |

- Every profile lists its architecture set, clothing, tools, animals (as asset or vocabulary ids), its activity mix (the share of figures doing each activity), its roles, and a card sentence per activity in both languages (section 11, [content-format.md](content-format.md#5-fields-per-kind)).
- Women, men and children appear in every band. Any role may be held by a woman or a man unless the profile's sources say otherwise; the card text is written so it never assumes.
- Profiles end where their real way of life ends. Morphing into the profiles that follow is milestone 3, so in this milestone land whose profile has ended stays empty: this milestone's world is complete from the start of the timeline to about 9000 BCE.

## 5. Figures

### 5.1 Look and scale

Figures follow the toy-planet style of spec section 8: chunky, rounded clay-like shapes, slightly large heads and hands, flat cel-shaded colours in three bands with dark ink outlines, no textures with painted detail beyond simple colour regions. A figure is about 700 triangles at the closest level of detail.

People and everything they make are drawn at a fixed **miniature factor**: **Proposed** 90, so a person of 1.7 m stands about 150 m tall on the globe, and the dozen figures of a close view fill the screen from the camera's lowest altitude of about 2 km (milestone 1 section 6.1). Stages, camps and landmarks are authored at life size and scaled by the same factor, so it can be tuned in one place.

**Seen from afar** (decided by Yang on 2026-10-18: everything visible from orbit and alive, not to scale). Vignettes grow as the camera rises, so their cast can be seen moving at every altitude, up to orbit:

- **Figures** are never shorter than **Proposed** 22 CSS pixels on screen for an adult. Animals keep their true proportion close up; as the cast grows, big animals are drawn at most **Proposed** 1.6 times an adult's height, so people stay readable next to a mammoth.
- **The stage layout** (where marks are and how far figures walk) grows with the figures, so figures are never drawn more than **Proposed** 6 times larger relative to their stage than in life. A stage of 80 m radius is then about 170 pixels across its radius from any altitude where it has grown, and its groups (camp, lookout, herd) stay apart.

Close up, both are at the miniature factor; they start growing about 7 km from the camera. From afar a vignette is a diorama, not a scale model. Figures stand on the ground at their own position, following the curve of the globe. The more they are enlarged and the more steeply the camera looks down, the further they lean over their feet towards the top of the screen, up to about 65 degrees, like the cut-outs of a pop-up book, so even from straight above they are seen from the side. Speeds follow the layout, so figures cover the same share of their stage in the same time at every altitude. This is drawing only: the player, its positions and its timing are unchanged.

### 5.2 Rig and parts

- One shared skeleton for all humans, with per-profile body proportions (Neanderthals stockier, children smaller) applied as bone scales.
- Parts per profile: clothing, hair and headgear, held tools (spear, digging stick, scraper, needle, torch, basket, sickle) attached to hand bones. A figure's look is its profile plus a hash of its id choosing among the profile's variants of colour and parts.
- Figures are instanced: one draw call per profile part set and level of detail.

### 5.3 Animations

Clips are baked into an animation texture and played on the GPU (milestone 1 section 11.4). The first clip set: idle, walk, run, carry, crouch-work, knap, scrape, dig, gather, throw, stab-thrust, paint, tend-fire, sit, talk, point, wave, paddle, haul, lift, sleep, sink (for figures lost to an effect), play (children). Clips have no blood or wounds in any form. Every action in the vignette vocabulary (section 6.4) maps to one or more clips.

### 5.4 Tasks

Ordinary figures live in their camp. Each figure's id is the hash of its camp and its index in the band, so it stays the same as long as the camp stands. Life-clock time is cut into **slots** of 10 to 30 seconds per figure (length from a hash of figure id and slot number). In each slot the figure picks a task from its profile's activity mix (hash of figure id and slot), walks to the matching work spot, works there and may carry something back. Gatherers and hunters may walk out of the camp and return within one slot. The worker turns the slot's task into segments (section 2.2).

### 5.5 Levels of detail

| Camera altitude (approximate) | Figures drawn as |
| --- | --- |
| Under 20 km | Full rig, animated |
| 20 to 80 km | Simplified rig of about 150 triangles, walk and work clips only |
| 80 to 300 km | Coloured marks, one per figure, moving along their segments |
| Above 300 km | Camps only, as hearth smoke |

The limit on animated figures (milestone 1 section 11.2) caps the first level; figures beyond the limit fall back to the next level, nearest kept first.

## 6. Vignettes

### 6.1 What a vignette is

A **vignette** is a small staged story at a place and time: Vikings raiding a village, hunters stalking a mammoth, workers hauling a pillar into place, painters at work in a cave. It has a cast of figures, props, a stage and a short script that plays on the life clock in a loop of about one to two minutes. With history running the vignette plays while its date span lasts; when history is paused it stops mid-beat (spec section 2.3).

Vignettes are where the stories of history become visible. Ordinary figures show how people lived; vignettes show what happened.

Every vignette is one of three forms (decided by Yang):

| Form | Example | How it maps to dates |
| --- | --- | --- |
| **Repeated** | Viking raids, mammoth hunts | One record covers a span and an area; instances are placed at dates and sites chosen by hash (section 6.6) |
| **Singular and long** | Building the pyramids, Göbekli Tepe | One instance over the real span; the date drives progress, such as a landmark's construction stage (section 8), while the loop keeps the work going |
| **Short but stretched** | The raid on Lindisfarne, a single battle | One instance whose true span is too short to watch; it is shown for a minimum watching time (section 6.7) |

### 6.2 Templates and records

To keep vignettes clean, the stage and script live in a reusable **template**, and the vignette record only says where, when, and what fills the template's parameters. A typical vignette record is ten lines of fields plus its card text. Templates hold no viewer text, so they are plain YAML files in `data/curated/templates/` ([content-format.md](content-format.md#1-records)). A template has:

- **Parameters**: named slots filled by the record, such as the cultures of raiders and villagers, or the ship.
- **Stage**: the size of the stage, its orientation rule, named **marks** (positions in metres at life size around the stage centre, stored as whole centimetres) with what must be under each (land, water, coast), and the **props** with the asset or parameter they show.
- **Cast**: named groups, each with a culture or an animal (or a parameter for either), role, count and starting mark. Animals, such as the hunted mammoth, are cast members like people and move by the same actions.
- **Beats**: the script, a list of steps at times on the loop, each giving a group or prop an action from the vocabulary (section 6.4).
- **Loop**: its length in life-clock seconds.

```yaml
# data/curated/templates/coastal-raid.yaml
id: coastal-raid
params: { raiders: culture, villagers: culture, ship: asset }
loop: 80 s
stage:
  radius: 120 m
  orient: { x: towards-sea }          # +x points to the nearest sea at the date
  marks:
    offshore: { at: [140, 0], on: water }
    beach:    { at: [55, 0],  on: coast }
    huts:     { at: [-10, 5], on: land }
    store:    { at: [-25, -15], on: land }
    woods:    { at: [-90, 40], on: land }
  props:
    ship:   { asset: $ship, at: offshore }
    houses: { asset: $villagers.houses, count: 3, around: huts }
cast:
  raiders:   { culture: $raiders, role: warrior, count: 6, at: ship }
  villagers: { culture: $villagers, role: [farmer, child], count: 7, at: huts }
beats:
  - { at: 0,  ship: { sail-to: beach }, raiders: ride }
  - { at: 10, raiders: { run-to: huts } }
  - { at: 11, villagers: { flee-to: woods } }
  - { at: 18, raiders: { take-from: store, carry-to: ship } }
  - { at: 40, raiders: board, ship: { sail-to: offshore } }
  - { at: 52, villagers: { walk-to: huts } }
  - { at: 60, villagers: { work-at: huts } }
```

```markdown
---
id: viking-raids-britain
kind: vignette
template: coastal-raid
with: { raiders: norse-viking-age, villagers: anglo-saxon, ship: longship }
when: { from: 793, to: 1066 }
where: { area: geo/viking-raid-coasts-britain-ireland }
repeat: { per: 10 years, count: 3, sites: { places: [tag: coastal-settlement] } }
region: europe-mediterranean
sources: [{ ref: ... }]
links: { events: [raid-on-lindisfarne] }
---

## en

# Viking raids

Viking crews from Scandinavia sail to the coasts of Britain and Ireland, take what they can carry from villages and monasteries, and sail home. ...

## de

# Wikingerüberfälle

...
```

The Viking raid is the worked example for this spec; it ships with the Viking Age in a later milestone. The raid on Lindisfarne itself would be a second record using the same template with `where: { place: lindisfarne }` and a single date.

### 6.3 Fields of a vignette record

| Field | Meaning |
| --- | --- |
| `template` | The template id |
| `with` | The template's parameters |
| `when`, `where` | The envelope's span and place (content-format sections 3 and 4). A singular vignette has a place or point; a repeated one an area |
| `repeat` | For repeated vignettes: how many instances per period, and where they may stand (section 6.6) |
| `progress` | For singular vignettes that drive something by date, such as `{ landmark: gobekli-tepe }` (section 8) |
| `stretch` | Optional override of the minimum watching time (section 6.7), or `false` |
| `cutaway` | Optional interior set for small scenes (section 7) |
| `links` | Usually the event, landmark or people the vignette shows |

### 6.4 Action vocabulary

Beats use only actions from `vocab/actions.yaml`, so every vignette is made of the same small set of well-tested pieces:

`walk-to`, `run-to`, `flee-to`, `follow`, `surround`, `wait`, `work-at`, `take-from`, `carry-to`, `give-to`, `talk`, `point`, `cheer`, `kneel`, `sit`, `ride`, `board`, `sail-to`, `paddle-to`, `haul`, `lift`, `throw-at`, `clash`, `fall`, `paint`, `hold-torch`, `appear`, `vanish`.

- Each action has a movement rule (to a mark, along a path, in place) and one or more clips (section 5.3); groups spread around their target in a formation given by a hash of figure index.
- Props have their own actions: `sail-to`, `move-to`, `burn` (cartoon smoke and orange flame shapes), `rise` and `fall` (for things being raised or toppled), `show` and `hide`.
- `clash` and `fall` follow spec section 4: armed figures meet in a short stylised scuffle, and a figure that falls sinks down and fades out, with no blood. An animal hunted in a vignette falls the same way.
- A new action is a vocabulary entry, its movement rule and its clips, added together. The actions later milestones need are listed in [dioramas.md](dioramas.md#3-additions-to-the-action-vocabulary) section 3.

### 6.5 Looping and the clocks

A vignette instance plays its script at **phase** = (life clock + offset) modulo the loop length, where the offset is the hash of the instance id. Everything about the instance at a given moment is a pure function of the record, the date and the phase, so it is deterministic and needs no state.

- The loop must close: at the end of the loop every cast member and prop is back at its starting mark, or has left by `vanish`, `board` or walking off the stage edge and re-enters the same way at the start. The data build checks this by running every template through one loop.
- Lasting consequences do not come from the loop. A village that is burnt for good is an event effect (`abandon`, content-format section 6), not a beat; the loop shows the action, the world state shows the outcome.
- Ordinary figures keep out of a stage while a vignette instance stands there, and figures of a host camp may be the vignette's cast (section 6.6), so nobody is ever drawn twice.

### 6.6 Repeated vignettes

A repeated vignette's span is cut into periods of `repeat.per` (for example 10 years). In each period the hash of the record id and the period number picks `repeat.count` instance dates in the period and, for each, a site from `repeat.sites`:

- `places`: place records, by id or tag (such as every coastal settlement standing at that date);
- `camps`: the camps of a culture in the area (for hunts, fishing and other everyday stories of hunter-gatherers); the camp's band becomes the cast where the template's roles match;
- `points`: hashed points in the area that meet the template's mark rules, or a curated list of candidate points (each optionally with its own `from` and `to`), from which the hash picks;
- `routes`: route records, for ships, caravans, trains and aircraft; each instance travels one route, with small stages at its two ends ([dioramas.md](dioramas.md#1-rules) section 1).

A site is only used when every mark of the template lands on what it needs at the date (water, coast or land); otherwise the hash moves on to the next candidate, so the result stays deterministic. Instances do not overlap at one site.

### 6.7 Stretching short events

Some events lasted a few days, which at the timeline's normal speed would pass in a fraction of a second. So every vignette instance is **shown for at least a minimum watching time**: **Proposed** 30 seconds at ×1 (decided in principle by Yang). Its shown span is its true span widened symmetrically around its peak (or centre) until it covers that much watching time on the rate curve (spec section 2.1). Because the stretch comes from the rate curve and not from the current speed or zoom, it is deterministic; zooming in, which slows the clock (spec section 2.2), gives longer to watch as usual.

- The card always gives the true date, and for a stretched instance adds one line: "Shown for longer than it really took, so you can watch it."
- Stretching applies to the vignette only, never to world state: a building stands, a border changes and an effect applies at its true date.
- At 5 years per minute, 30 seconds is 2.5 years, so a raid in 793 is visible from about 792 to 794. In the deep past the minimum is far shorter than any span there, so it rarely applies.

### 6.8 Finding vignettes

Every vignette instance in the view can be seen from any altitude, because its cast keeps a minimum size on screen (section 5.1); tapping its cast opens its card and double-tapping flies down to it. Double-clicking a vignette's linked event flies the camera to its stage and moves time into its shown span.

### 6.9 Validation

The data build fails when a template uses an unknown action, mark, group or parameter, when its loop does not close (section 6.5), when a beat lies outside the loop, or when a record leaves a parameter unfilled or fills it with an asset or culture that does not exist at its dates. Every vignette names its sources like any record.

## 7. Small scenes

Some of history happens at a scale too small to see from above, even with miniatures: painters in a cave, a scribe at a desk, a scientist at a workbench.

### 7.1 Cutaways

A vignette may have a `cutaway` set: an interior (a cave, and in later milestones a house, temple or workshop) built as a prop under or inside the terrain at the stage. When the camera comes within about 10 km, the hill or building opens like a dollhouse: the half facing the camera is cut away along a vertical plane through the stage centre, with a clean cel-shaded cut face in the colour of rock or wall and an ink outline, and the interior and its cast are visible inside. The cut follows the camera's heading as the viewer turns. This is drawing only; the world state is the same whatever the camera does.

Inside, the scene uses its own warm palette for torchlight, painted into the set rather than lit, in keeping with the studio lighting of spec section 8.

### 7.2 Scene markers

From further away, a cutaway shows as a floating **scene marker**: a round badge with the icon of its template (paintbrush, pillar) on a short stalk above its site. Vignettes need no marker, since their cast stays visible (section 5.1). Markers keep a minimum size of about 28 CSS pixels on screen, fade out once the cast is large enough to see, and are drawn in one batch. Tapping a marker opens the vignette's card; double-tapping flies down to it. At orbit, markers are thinned out by importance so they never crowd the view: linked events first, then singular vignettes, then repeated ones.

## 8. Landmarks

A **landmark** is a unique, recognisable building or site: the pyramids of Giza, Hagia Sophia, Göbekli Tepe. Each has its own record (`kind: landmark`, [content-format.md](content-format.md#5-fields-per-kind)) and its own approved model, and is never generated procedurally.

```markdown
---
id: gobekli-tepe
kind: landmark
when: { from: c. 9500 BCE, to: today }
where: { point: [37.2233, 38.9224] }
region: middle-east-north-africa
debated: cause
stages:
  - { from: c. 9500 BCE, asset: gobekli-tepe-ring-1 }
  - { from: c. 9300 BCE, asset: gobekli-tepe-rings-1-2 }
  - { from: c. 9000 BCE, asset: gobekli-tepe-rings-1-4 }
  - { from: c. 8800 BCE, asset: gobekli-tepe-late-rooms }
  - { from: c. 8000 BCE, asset: gobekli-tepe-buried-hill }
build: { from: c. 9500 BCE, to: c. 8000 BCE, vignette: gobekli-tepe-building }
beacon: wonder
sources: [{ ref: ... }]
---
```

The stage dates in this example are illustrative; the record's dates are set from its sources.

- **Stages.** A landmark is a list of models by date: construction stages, later changes (Hagia Sophia gains minarets after 1453) and its end state, such as ruins or, for Göbekli Tepe, the hill that covered it until long after the end of the timeline. Between construction stages the next stage rises gradually, as in the construction event type of spec section 5.
- **Building it.** `build` names the span of construction and a singular vignette (section 6) with the building-site template: workers hauling, lifting and carving, looping while the date drives the stages.
- **Seen from orbit.** Landmarks marked `beacon: wonder` keep a minimum on-screen size of about 32 CSS pixels as the camera rises, growing up to 40 times their miniature size, with a label in the viewer's language. So the pyramids can be found from space. Below the altitude where the true miniature is larger, they are drawn at their real miniature size.
- **Places.** A place record lists its landmarks by link instead of describing them; event records of the construction type link to the landmark they build.

## 9. Migrations

A migration is an event of type Migration (or Voyage for sea crossings) whose `where` is a dated path (content-format section 4), possibly branching into several paths, and whose effect is to extend a culture area (section 3.1).

- **The front.** At any date the front is the interpolated position along each path. Land behind the front and inside the culture's next area snapshot is inhabited.
- **Walking families.** Near the front, groups of six to ten figures (adults and children with bundles, baskets and carried fire) walk along the path. Each group's base position follows the front by date; on the life clock the group walks a short stretch, makes camp, and walks on. When history is paused they stop mid-step.
- **Rafts.** Sea crossings, such as from Sunda to Sahul across straits of up to about 90 km at the time, are a repeated vignette with the raft-crossing template along the crossing points of the path.
- **On the overlay.** A migration path is drawn as an animated dotted line while it is active, the first use of the route overlay (spec section 7.2).

## 10. Events in this milestone

Milestone 3 builds the full event system. This milestone pulls forward only what its migrations, vignettes and landmarks need:

- Event records and their schema, with the types Migration, Voyage, Construction and Invention or idea (spec section 5) and presenters for them.
- Events as icons and bars on the timeline (spec section 7.1), and double-click fly-to to an event's place and its shown span.
- The scene markers of section 7.2.

The "Happening now" list, the floating event markers of spec section 5 and the remaining event types stay in milestone 3.

## 11. Info cards

Tapping a figure, vignette, scene marker, landmark or event opens a card: a panel on desktop, a bottom sheet on phones (spec section 7.5). Cards never pause time.

- **Figure card:** the figure's role in the viewer's language (German role nouns in the feminine or masculine form to match the figure, from `vocab/roles.yaml`), its culture, the activity sentence for what it is doing right now, and a line about its culture. The activity sentence is written without pronouns, so it reads correctly for anyone: "Shaping a stone blade by striking it with another stone. Sharp blades were needed for cutting meat and hides."
- **Vignette, landmark and event cards:** the record's card text, the date (with "c." where approximate, and the stretch note of section 6.7 where it applies) and "Learn more".
- **Camp card** (tapping hearth smoke or a shelter): what a band was and how it lived, from the culture record.

Card texts come from text chunks loaded when the card opens (content-format section 7); while loading, the card shows its title from the structure data and a loading state.

## 12. Content of this milestone

| Kind | Records |
| --- | --- |
| Culture profiles | The seven of section 4 |
| Migrations (events) | Out of Africa (c. 70,000 BCE, from East Africa across the Bab-el-Mandeb and along the coasts of Arabia and India to Sundaland); first people reach Sahul (c. 60,000 to 50,000 BCE, debated; Voyage); modern humans reach Europe (c. 45,000 BCE) and East Asia (c. 43,000 BCE, debated); into Siberia and Beringia (c. 30,000 BCE); people reach the Americas (c. 14,000 BCE, debated and possibly earlier; then south along the Pacific coast and through the opening ice-free corridor) |
| Vignettes | Mammoth hunt (repeated, camps of `ice-age-hunter` and `steppe-beringia-hunter`); shellfish gathering at the shore (repeated, coastal camps of `african-stone-age` and `coastal-asia-hunter`); raft crossing to Sahul (repeated along the crossing); painters at Lascaux (singular, cutaway, c. 15,000 BCE); building Göbekli Tepe (singular and long, c. 9500 to 8000 BCE) |
| Landmarks | Göbekli Tepe; Lascaux cave, as a cutaway landmark whose painted walls grow by stage |
| Events | Those above from [events.md](events.md) (Modern humans leave Africa, First people reach Australia, Lascaux cave paintings, People reach the Americas, Building of Göbekli Tepe), plus the eruption of the Phlegraean Fields (c. 37,900 BCE) as a card on the timeline only, without its presenter |

All dates are checked against sources when the records are written, and the rows in [events.md](events.md) gain their `id` column then (content-format section 9). Debated dates say so on the card.

## 13. Assets

### 13.1 How assets are made

**Proposed:** figures, parts, props, shelters and landmarks are modelled by scripts in `assets/src/` from rounded primitives (capsules, spheres, rounded boxes and lathed shapes), which suits the clay-toy look, and exported as glTF with meshopt compression. Animations are keyframed in the same scripts on the shared skeleton and baked into animation textures by the asset build. Cave paintings and other flat art are generated images. Every asset has a review sheet: turnaround renders in the app's own cel-shaded renderer, at close and medium zoom, produced by `npm run asset-sheets` with Playwright.

### 13.2 Review and order

1. **Art sheet first.** Before any other asset, one sheet showing a figure of each profile at close zoom on the globe, next to a camp, for Yang to approve the look of people.
2. Then the rig and clips, the profile parts, the camp props, the vignette props (raft, torch, mammoth), and the landmarks.

Every asset is listed in `data/assets/manifest.json` with its status (milestone 1 section 12). Until approved, the app draws a flat-coloured stand-in of the same size, and the production build fails if an unapproved asset is referenced.

### 13.3 The prehistoric model set

The first models are the people, shelters and animals of the seven culture profiles of section 4. Each is a modelling script in `assets/src/` that returns the model at life size in metres, facing +Z with its feet on y = 0, so the miniature factor (section 5.1) is applied in one place. Colours are flat vertex-colour regions, lit by the same cel-shaded studio light as the globe (milestone 1 section 3.6) and outlined in ink by an inverted hull.

**People.** Every profile has a man, a woman and a child, built on the shared skeleton of section 5.2 (body, head, upper and lower arms, legs) so the same clips drive all of them. **Proposed:** about 600 to 950 triangles at the closest level of detail (about 800 on average), at most 1,050 with the carried bundle that only the carry clip shows, slightly above the 700 of section 5.1 because round clay shapes need some more; the simplified level of section 5.5 stays at about 150. Details too small to see at diorama size, such as ears and noses, are left out. Dioramas are not to scale (decided by Yang on 2026-10-18): figures and animals are drawn far larger than life so they can be seen from orbit, so every model is built for a bold silhouette with few details, chunky limbs and strong colour contrast, and heads and hands are about 1.4 times life size so roles read from a distance. Clothing, hair and the held tool change per profile; the body proportions change only for Neanderthals (shorter, broader chest, short shins, heavy brow, no chin). Skin and hair colours are picked per figure by hash from a range per profile, wide in every band. Early modern Europeans are given medium to dark skin, because ancient DNA shows light skin spread in Europe only after about 8000 BCE (Olalde et al. 2014, *Nature* 507). Neanderthals range from light to medium skin with some red hair (Lalueza-Fox et al. 2007, *Science* 318).

| Profile | Clothing | Tools in hand |
| --- | --- | --- |
| `african-stone-age` | Short hide wrap or apron, ostrich-eggshell bead strings | Spear, digging stick, bow (bows from c. 62,000 BCE, Sibudu) |
| `neanderthal` | Draped untailored hide over the shoulders, fur wraps on the legs | Heavy thrusting spear, stone scraper |
| `coastal-asia-hunter` | Plant-fibre skirt or hide wrap | Fishing spear, shell basket |
| `first-australians` | Possum-skin cloak (in the south), ochre lines on the skin | Spear, digging stick, wooden dish |
| `ice-age-hunter` | Tailored fur tunic, trousers and boots sewn with bone needles | Spear with spear-thrower (from c. 16,000 BCE; spear alone before), sewing needle |
| `steppe-beringia-hunter` | Heavy hooded fur parka, fur trousers and boots | Spear (with a fluted point in the Americas), scraper |
| `natufian` | Hide tunic, bead headband | Flint sickle in a bone haft, grinding stone |

**Shelters and camp props.**

| Id | Model | Profiles |
| --- | --- | --- |
| `shelter-hide-tent` | Cone of poles covered in sewn hides, smoke hole at the top | `ice-age-hunter`, `steppe-beringia-hunter` |
| `shelter-mammoth-bone-hut` | Dome of mammoth jaws, tusks and long bones over a hide cover (Mezhyrich, Ukraine, c. 13,000 BCE) | `ice-age-hunter` on the plains of Ukraine |
| `shelter-windbreak` | Hide stretched on a curved row of poles, as at the mouth of a rock shelter | `neanderthal` |
| `shelter-grass-hut` | Low dome of bent branches thatched with grass | `african-stone-age` |
| `shelter-lean-to` | Sloping roof of branches and leaves on two forked posts | `coastal-asia-hunter` |
| `shelter-bark` | Curved sheets of bark over a frame of bent saplings | `first-australians` |
| `shelter-natufian-house` | Round house sunk into the ground on a ring of stones, with a brush roof (Ain Mallaha) | `natufian` |
| `prop-hearth` | Ring of stones with a cartoon fire | All |
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

**Clips.** Until the asset build bakes animation textures (section 5.3), each clip is a pure function of the clip and the seconds since it started, in `assets/src/clips.ts`, which vignettes may call every frame and the bake will sample. The first set is what the mammoth hunt needs: idle, walk, run, carry (a hide-wrapped bundle of meat across the shoulders), work (crouched, cutting), point, throw (the spear leaves the hand 0.55 s into a 3 s gesture) and cheer for people; idle, walk, run and fall for animals, where the animal rolls onto its side and sinks a little over 3 s, with nothing more shown.

**Review sheets.** `npm run asset-sheets` serves `app/asset-sheet.html` with the dev server and saves one image per sheet with Playwright: each profile's man, woman and child beside its shelter and hearth; a turnaround of one figure; all shelters; all animals with a figure for scale. The sheets go to Yang for review (section 13.2) and every model is listed in `data/assets/manifest.json` with status `generated` until approved.

## 14. Performance

The budget of spec section 9 holds with this milestone's content. Two new scenes join the stress scene of milestone 1 in `npm run perf`:

- **Densest camps**: the Danube valley at 40,000 BCE (Neanderthals and modern humans together) at about 15 km altitude.
- **Busiest vignettes**: the Göbekli Tepe building site at 9200 BCE at close zoom, with every repeated vignette in the view forced on.

## 15. Tests

| Test | Checks |
| --- | --- |
| Deterministic maths | `detmath` against `Math` within its stated error over the whole input range, and fixed outputs for fixed inputs stored as golden values |
| Lint | No engine-dependent maths functions in `app/src/world/` and `app/src/core/` |
| Schema and validation | Templates, vignettes, landmarks, cultures and migrations (section 6.9); every loop closes; culture areas agree with migrations |
| Golden scenes | For a fixed list of cases (date, life clock, view): the scene's camps, figure ids, roles, tasks, segment end points and vignette phases, stored as a readable summary and a hash of the canonical serialisation. Cases: East Africa and the Bab-el-Mandeb at 50,000 BCE; the Danube at 40,000 BCE; Sahul at 45,000 BCE; Beringia and the Great Plains at 30,000 and 12,000 BCE; Lascaux at 15,000 BCE; Göbekli Tepe at 9200 BCE; each at life clock 0, 37,000 ms and 3,600,000 ms |
| Expected answers | No people in the Americas at 30,000 BCE; no Neanderthals after 38,000 BCE; Sahul inhabited at 45,000 BCE; no camp on sea, ice or deep desert at any golden case; a repeated vignette is identical at life clock t and t plus its loop length on the same day |
| Cross-browser | The golden scenes computed in Chromium, Firefox and WebKit through Playwright, in the worker, must match the stored results exactly |
| Browser tests | Pausing history keeps figures and vignettes moving; freezing stops them; tapping a figure opens its card in both languages; double-clicking the Göbekli Tepe event flies there and shows the building site |
| Models | Every model of section 13.3 is built the same way every time, stays within its triangle budget (people 1,050, animals 1,200, shelters 1,000), stands on the ground at a believable height and faces +Z; clips give the same pose for the same time whatever came before; the spear leaves the hand at the release time; the falling animal stays on the ground; every model is listed in the asset manifest |
| Performance check | Draw calls and triangles of the two new scenes (section 14) |

## 16. Exit criteria and how they are checked

| Criterion (from [milestones.md](milestones.md#2-first-people)) | Checked by |
| --- | --- |
| Opening at 50,000 BCE shows bands of people at work in Africa and spreading along the coasts of Asia | Golden scenes; screenshots at the golden cases for review; Yang watches on desktop and phone |
| Scrubbing from 70,000 to 9000 BCE shows people leaving Africa and reaching Sahul, Europe, Siberia and finally the Americas | Expected-answer tests; Yang watches a scrub |
| A repeated, a singular and a stretched vignette play while history runs and stop mid-beat when it is paused | Browser tests; Yang watches the mammoth hunt and the Göbekli Tepe building site |
| Lascaux can be found from orbit by its marker and opens as a cutaway | Browser test; Yang review |
| Göbekli Tepe rises over its real span, can be found from orbit, and becomes a buried hill | Golden scene at 9200 BCE; screenshots at its stage dates |
| Tapping a figure explains what it is doing, in English and German | Browser tests; review in both languages |
| Golden snapshots match on two different machines | The cross-browser test in CI, plus the same test run on the reference laptop |

The definition of done in [milestones.md](milestones.md#definition-of-done-every-milestone) applies as well.

## 17. Out of scope and open questions

**Out of scope:** morphing between eras, farming, villages and settlements as place records, borders, place names, famous people, the "Happening now" list, epidemics, wars and battles in the world (the Viking raid is only the worked example of section 6), the population data of HYDE, offline use beyond the service worker cache.

**Open questions for Yang:**

1. The miniature factor of 90 (section 5.1).
2. The minimum watching time of 30 seconds for stretched vignettes (section 6.7).
3. Making figures, props and landmarks with modelling scripts and reviewing them on generated sheets (section 13.1).
4. Neanderthals as their own profile in the first milestone with people (section 4).
5. The arrival of people in the Americas shown at c. 14,000 BCE, with the earlier dates (such as the White Sands footprints, about 21,000 BCE) mentioned as debated on the card.

## 18. First slice: the mammoth hunt

Decided by Yang on 2026-10-18: the mammoth hunt (`mammoth-hunt` in [dioramas.md](dioramas.md#5-europe-and-mediterranean)) is built first, on top of milestone 1, as the worked example of how a diorama is stored as data files and played by a small engine. It proves the template and record formats, their data build step, the deterministic player and the loop on the life clock before the rest of this milestone exists. Everything not listed here stays as specified above and is built with the milestone.

### 18.1 What the slice builds

| Part | In the slice | Later in this milestone |
| --- | --- | --- |
| Template and record | `data/curated/templates/big-game-hunt.yaml` and `data/curated/vignettes/mammoth-hunt.md`, in the formats of section 18.2 | More templates and records (section 12) |
| Data build | Parses, validates and compiles them into the vignette layer of section 18.4 | Unchanged |
| Player | Pure functions in `app/src/world/` (section 18.5), called on the main thread | Called from the world query in the Web Worker (section 2) |
| Sites | A curated list of candidate points (section 6.6) | Camps of the hunting cultures (section 3.2) |
| Figures and animals | Flat-coloured, cel-shaded stand-ins built from simple shapes, posed on the main thread | Approved assets, rig and GPU clips (sections 5 and 13) |
| Size and card | The cast keeps its minimum size on screen up to orbit (section 5.1); tapping it opens the record's card in English or German; double-tapping flies down to the stage | Unchanged |

Stand-ins are allowed because no asset is approved yet (section 13.2): they are drawn at the right size in plain colours and are replaced by approved assets later without changing any data.

### 18.2 File formats

**Template** (`data/curated/templates/<id>.yaml`, YAML 1.2 read with the failsafe schema, so every scalar is a string that the build converts by its field):

| Field | Meaning |
| --- | --- |
| `id` | Equal to the file name |
| `params` | Map of parameter name to kind: `culture` or `animal` |
| `loop` | Loop length, such as `90 s` |
| `stage.radius` | Radius at life size, such as `150 m` |
| `stage.marks` | Map of mark name to `[x, z]` in metres at life size; +x points along the stage's orientation, +z to its left |
| `cast` | Map of group name to `{ culture: $param, role, count, at }` or `{ animal: $param, count, at }` |
| `beats` | List of `{ at: <seconds>, <group>: <action> }`; an action is a bare verb (`point`) or `{ <verb>: <mark or group> }` |

**Vignette record** (`data/curated/vignettes/<id>.md`): the envelope of [content-format.md](content-format.md#2-the-record-envelope) section 2 with `kind: vignette`, plus `template`, `with` (the template's parameters), and for a repeated vignette `repeat: { per: <years> years, count, sites: { points: [...] } }`. Each candidate point is `{ name, at: [lat, lon] }` with optional `from` and `to`. Dates are written as in the spec lists, such as `c. 43,000 BCE`. The text has the fixed headings `## en` and `## de`, each with a `#` title, the card text and an optional `### Learn more` (German `### Mehr erfahren`).

### 18.3 Verbs of the slice

The player understands these verbs from section 6.4 and the additions in [dioramas.md](dioramas.md#3-additions-to-the-action-vocabulary) section 3; any other verb fails the build.

| Verb | Movement | Clip |
| --- | --- | --- |
| `wait` | Stays | idle |
| `walk-to`, `run-to`, `carry-to` | To a mark at 1.4, 4.5 or 1.3 m/s at life size, then idle | walk, run or carry, then idle |
| `work-at` | Walks to a mark if not there, then works | walk, then crouch-work |
| `point`, `throw-at`, `cheer` | Stays, facing the target group if one is named | point or throw for 3 seconds, then idle; cheer until the next beat |
| `fall` | Sinks into the ground and disappears over 3 seconds | fall |
| `appear` | Reappears at its starting mark, rising from the ground over 2 seconds | idle |

Members of a group stand in a formation around their target: member *i* of *n* gets an offset of up to 1.5 m × √*n* chosen by the hash of the group name and *i*. A moving group faces its direction of travel; a waiting group keeps its last heading.

### 18.4 The vignette layer

The data build writes one structure file per vignette record, content-hashed: the compiled template (marks in whole centimetres, beats in whole milliseconds, each group's action list) and the record's dates as whole days, its period in whole days, its candidate sites in whole microdegrees, and the scene-marker icon. It writes one text file per record and language with the title, card text and "Learn more". The startup index gains a `vignettes` list with each record's id, span and icon and the names of its structure and text files, about 100 bytes per record; the structure file is fetched when the date first comes within the span, and the text file when the card opens.

### 18.5 The player

The player is three pure functions of their inputs, with no state:

- **Instances.** For a record and a day: the period number is ⌊(day − from) / period⌋; for each of `count` slots, the hash of the record id, the period and the slot picks a site among the candidates valid at the period's start, never the same site twice in one period. An instance is shown for its whole period (its shown span), which at the rate of the deep past is about 2 minutes at ×1, as section 6.7 asks. Each instance gets an id, a phase offset (the hash of its id, modulo the loop) and an orientation, one of eight compass directions chosen by hash.
- **Pose.** For an instance and a life-clock time: phase = (life clock + offset) modulo the loop, then for every cast member its stage position in centimetres, heading as a direction (two numbers, never an angle), clip, time into the clip, and a visibility between 0 and 1 (for `fall` and `appear`).
- **Loop check.** Runs a template through one loop and lists every group that does not end where it started (section 6.5); the data build fails on any.

The player uses only integer and `+ − × ÷` arithmetic plus `Math.sqrt` (section 2.3), and the lint rule forbidding engine-dependent maths applies to `app/src/world/`. Loading never changes it: the instances and poses are the same whether or not a structure file has arrived; an instance whose file has not arrived is simply not drawn yet.

### 18.6 The mammoth hunt

- **Cast:** two scouts and two flanks of three hunters each (`ice-age-hunter`), three family members at the camp, one mammoth to be hunted and two more of its herd. Stand-ins: hunters in brown and ochre fur with spears, the mammoths dark reddish brown with tusks and a high domed head, at the miniature factor of section 5.1.
- **Script (120 s loop):** the family works at the camp throughout; the scouts walk to a lookout and point at the herd; the two flanks creep wide around the herd; at the signal the hunters run in, the rest of the herd runs to the edge of the stage and the hunted mammoth runs into a boggy hollow; spears are thrown and it falls; the hunters cut the meat and carry it back to the camp; the herd wanders back and a new mammoth appears among them, so the loop closes.
- **Sites, from c. 43,000 to c. 10,000 BCE, one period per 1,000 years, two instances per period:** Geißenklösterle (Swabian Jura), Krems-Wachtberg, Dolní Věstonice, Předmostí, Kostenki, Sungir, Yana in Siberia from c. 30,000 BCE and Mal'ta near Lake Baikal from c. 22,000 BCE. The card says that how often people killed mammoths, rather than collecting the bones of dead ones, is debated.

### 18.7 Tests

| Test | Checks |
| --- | --- |
| Formats | The template and record parse; unknown verbs, marks, groups and parameters, missing languages and dates outside the timeline fail with a clear message |
| Loop | The hunt's loop closes; a broken copy of the template fails the check |
| Golden poses | Instances at four fixed days and member poses at life clock 0, 37,000 and 3,600,000 ms, stored as a readable snapshot |
| Expected answers | No instance before 43,000 BCE or after 10,000 BCE; no Siberian site before its own start date; two different sites per period; the pose at *t* equals the pose at *t* plus the loop length |
| Browser | At a fixed date the hunt is drawn from orbit with its hunters at least 22 pixels tall; tapping a hunter opens the card; double-clicking it flies down to the hunt and the hunters move while history plays; pausing stops them |
