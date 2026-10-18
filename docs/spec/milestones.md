# Milestones

Each milestone ends with something to show an 11-year-old. The first three prove the hardest technical ideas (the globe, the two clocks, morphing figures) on a small slice of history before content is added era by era. Later milestones are mostly content: culture profiles, events, people and borders, built on systems that already exist.

Milestones are done in order. A milestone is finished when every exit criterion below holds and the definition of done is met; it is not finished because its time ran out.

## Definition of done (every milestone)

- The spec describes everything the milestone built, and was updated before the code.
- Every user-visible string and content record added has English and German text, and the app is reviewed in both languages.
- Golden snapshot tests cover the new dates and places, and the scene for the same date and life-clock time is identical across runs and devices.
- The performance budget (spec section 9) holds on the reference laptop and phone with the stress scene and the new content.
- Every content record names its source, and every shipped asset is approved by Yang.
- The app runs in the devenv dev container with `npm run dev` on http://localhost:8800 and works on desktop and phone browsers.

## 1. Globe and time

**Goal:** a beautiful, empty Earth you can fly around and travel through time on. Proves the renderer, the clocks, the timeline and content streaming.

Detailed spec: [milestone-1.md](milestone-1.md).

**Scope**

- TypeScript project with npm scripts and pinned Node, CI running lint, typecheck and tests.
- Globe from elevation and coastline data: cube-sphere quadtree terrain, painted terrain textures, water, exaggerated elevation, curved horizon close up.
- Camera from orbit to ground with mouse, touch and keyboard controls.
- Historical clock with the rate curve and a speed slider from ×1/64 to ×64; life clock; play and pause.
- Timeline with the World lane and regional lanes from [eras.md](eras.md), zoom, scrubbing and the true time scale toggle.
- Sea level and ice sheets changing with the date.
- English and German UI shell with a language switch and per-language date and number formatting.
- Settings, last date, camera and bookmarks in local storage.
- Content pipeline: manifest, light startup index, chunks by place, time and language, content-hashed files, service worker cache.
- Performance stress scene with thousands of placeholder figures over a dense area, plus a fixed quality level and dynamic resolution.
- History lens ([history-lens.md](history-lens.md)): event-dense regions drawn larger, with a strength slider from 0% (true sizes) to 200% and an animated morph to each new strength.

**Exit criteria**

- Scrubbing from 50,000 BCE to the end of the timeline shows Beringia, Doggerland and Sundaland drowning and the ice sheets retreating.
- The stress scene meets the performance budget on both reference devices.
- The first view loads with at most about 3 MB on a phone.
- Switching language changes every visible string without a reload.

**Out of scope:** real figures, settlements, events and borders.

## 2. First people

**Goal:** the first living humans, and the small stories they live out. Proves the world query, the life clock driving figures, determinism, and the vignette, landmark, migration and cutaway systems every later milestone reuses.

Detailed spec: [milestone-2.md](milestone-2.md).

**Scope**

- World query in a Web Worker computing a scene from date, life clock and area in view, with deterministic arithmetic on every device.
- First figure rig with instanced, GPU-animated figures and levels of detail, in the toy-planet style.
- Culture profiles for the hunter-gatherers of Africa, Asia, Sahul, Europe (including Neanderthals), Siberia and the Americas, and the Natufians: camps, hunting, gathering, tool-making, fire.
- Where people live from culture areas and migrations, with a hand-set density per area; no population model.
- Vignettes: small staged stories that loop on the life clock, built from templates, in three forms: repeated, singular and long, and short but stretched so they can be watched.
- Landmarks with construction stages, visible from orbit, starting with Göbekli Tepe.
- Cutaways and scene markers for small scenes, starting with the painters of Lascaux.
- The Out of Africa migration and the settlement of Sahul, Europe, Asia and the Americas as migration events.
- The part of the event system these need: event records, timeline icons and double-click fly-to.
- Info cards for figures, camps, vignettes, landmarks and events.

**Exit criteria**

- Opening at 50,000 BCE shows bands of people at work in Africa and spreading along the coasts of Asia.
- Scrubbing from 70,000 to 9000 BCE shows people reaching Sahul, Europe, Siberia and finally the Americas.
- Pausing history keeps people and vignettes going; freezing everything stops them mid-step.
- Lascaux opens as a cutaway, and Göbekli Tepe rises over its real span and can be found from orbit.
- Golden snapshots match on two different machines.

**Out of scope:** farming, morphing, settlements, borders, famous people, a population model.

## 3. Neolithic

**Goal:** people settle down. Proves morphing across eras and the event system.

**Scope**

- Morphing: figures change roles, clothes and tools across a transition window.
- Neolithic culture profiles for the Fertile Crescent and Europe: fields, herds, mudbrick and timber houses, pottery.
- Settlements growing from population data.
- The rest of the event system: all event types, floating event markers and the "Happening now" list (event records, timeline icons and fly-to come in milestone 2).
- First events from [events.md](events.md): the start of farming, Çatalhöyük, Doggerland drowning.
- Construction and founding event visuals.

**Exit criteria**

- Watching the Fertile Crescent from 10,000 to 5000 BCE, the same figures visibly become farmers and villages appear.
- Double-clicking an event on the timeline flies to the place and moves time to it.

**Out of scope:** borders, famous people, cities.

## 4. Early civilisations

**Goal:** the first cities, states and named people.

**Scope**

- Culture profiles for Egypt, Mesopotamia, the Indus Valley and Shang China.
- Cities with landmarks built over their real construction years, starting with the pyramids of Giza.
- Border overlay with polity data, crossfading between snapshot dates.
- Place names overlay with historical and modern names.
- Famous people: unique figures, life paths, cards and the "Famous people" list, starting with the people of this period in [people.md](people.md).
- Battle and political change event visuals.

**Exit criteria**

- The Great Pyramid can be watched growing over about 20 years and then stands for the rest of history.
- The border overlay shows Egypt and the Akkadian Empire at the right dates.
- Hatshepsut, Tutankhamun and Ramesses II can be found from the list and followed.

## 5. Classical world

**Goal:** the age of empires around the Mediterranean, Persia, India and China.

**Scope**

- Culture profiles for Greece, Persia, Rome (Kingdom, Republic, Empire), Carthage, Maurya India, Qin and Han China.
- War events with armies marching along routes and front lines on the border overlay.
- Trade routes, starting with the Silk Road.
- Natural disaster visuals, starting with Vesuvius.
- Events and people of the period from the content lists.

**Exit criteria**

- The stages of Rome are visible on the timeline and the overlay, from village to empire.
- Han China and the Roman Empire can be seen at the same time, linked by caravans.

## 6. Late antiquity and Middle Ages

**Goal:** the fall of empires, migrations and new faiths.

**Scope**

- The Migration Period and the end of the Western Roman Empire; Byzantium.
- Religion event visuals and the spread of Christianity, Buddhism and Islam.
- Culture profiles for the caliphates, medieval Europe, Tang and Song China, the Mongols, Mali, the Maya, Angkor.
- Epidemic visuals, starting with the Black Death.

**Exit criteria**

- Scrubbing from 300 to 600 shows peoples migrating and the Western Roman border dissolving.
- The Black Death visibly thins the population of Europe and the Near East and the towns recover afterwards.

## 7. Early modern

**Goal:** the world becomes connected, and colonialism begins.

**Scope**

- Voyage visuals with ships tracing real routes: Zheng He, Columbus, Vasco da Gama, Magellan.
- Culture profiles for the Renaissance, the Ottomans, the Aztec and Inca empires, Ming and Qing China, the Mughal Empire, Edo Japan.
- Colonial borders on the overlay and the conquest of the Americas, shown truthfully at the agreed reading level.
- Printing and the Reformation as idea and religion events.

**Exit criteria**

- The first circumnavigation can be followed around the globe.
- The cards for the conquest of the Americas and the slave trade are reviewed by Yang for accuracy and tone.

## 8. Modern age

**Goal:** industry, nation states, the world wars and the Cold War, up to the end of the timeline in 1991.

**Scope**

- Culture profiles for industrial cities, railways, steamships, then the 20th century.
- Nation-state borders, decolonisation and the Cold War on the overlay.
- The world wars with front lines; the Holocaust and the atomic bombings presented with care and accuracy.
- Modern events up to the end of the timeline (the dissolution of the Soviet Union on 26 December 1991) from the content lists.

**Exit criteria**

- Scrubbing from 1800 to 1991 shows railways spreading, borders changing and cities growing.
- All cards on the world wars and the Holocaust are reviewed by Yang for accuracy and tone.

## 9. Polish

**Goal:** a complete, robust first version.

**Scope**

- Offline use for visited places and periods.
- Performance tuning on older phones.
- More culture profiles and events wherever coverage is thin, especially Africa, the Americas and Oceania.
- Onboarding for first-time viewers.

**Exit criteria**

- A full watch of history at normal speed runs without errors on both reference devices.
- Every region of the world has a culture profile for every period on its timeline lane.

## Later: guided tours

Passive camera journeys through a story, such as "A day in Rome" or "The travels of Marco Polo", built on the same timeline and fly-to. Planned after milestone 9.
