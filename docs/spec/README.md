# Miniworld specification

This folder is the source of truth for what Miniworld does. Every change to behaviour, content or data format is written here first, then implemented (see [CLAUDE.md](../../CLAUDE.md)).

| File | Contents |
| --- | --- |
| [spec.md](spec.md) | Vision, time model, globe, history data, events, people, interface, localisation, visual style, architecture, content delivery, development environment, licences |
| [milestones.md](milestones.md) | Build order, scope and exit criteria for each milestone, and the definition of done |
| [milestone-1.md](milestone-1.md) | Detailed spec for milestone 1, Globe and time |
| [milestone-2.md](milestone-2.md) | Detailed spec for milestone 2, First people: figures, vignettes, landmarks, migrations and cutaways |
| [history-lens.md](history-lens.md) | Design of the default lens that draws regions with many events larger |
| [humankind.md](humankind.md) | The tree of humankind: one first person at Lake Turkana, people stepping out of lodgings, the tree the data build computes and how to inspect it (proposed) |
| [peopling.md](peopling.md) | How humankind leaves Africa and spreads over the world up to the Neolithic thresholds: dated arrival points, the arrival map, canoe crossings, adapting to each region through culture profiles and their limits, and red flags where farming begins |
| [sites.md](sites.md) | The camp sites of the tree of humankind: a fixed lattice of sites with room for all activities, the links between them over land or by canoe, and the rules bound to region and time (cultures, arrivals, thresholds, morphs) that decide which bands live where |
| [foliage.md](foliage.md) | Trees and bushes over the land, from the climate data, readable from orbit (proposed) |
| [wildlife.md](wildlife.md) | Small groups of typical wild animals on every continent, and how their ranges change with history (proposed) |
| [dioramas.md](dioramas.md) | Recurring dioramas (repeated vignettes) for every region and era, with their templates and scripts |
| [giza.md](giza.md) | The pyramids of Giza: the landmark, its building dioramas and the dioramas around it across the ages (proposed; first slice shelved, models approved) |
| [content-format.md](content-format.md) | How content records are written, validated, indexed and fed into the app |
| [eras.md](eras.md) | Era and empire ranges shown as coloured bands on the timeline |
| [events.md](events.md) | The first list of world events and how each appears on the globe, and natural disasters, epidemics and famines |
| [wars.md](wars.md) | Major wars and battles, with the famous people who took part |
| [events/](events/) | Dense regional event lists (China, Egypt, Mesopotamia and Iran, India, Europe) with an event at least every 20 years |
| [people.md](people.md) | The first list of famous people |

The spec is written in English. English and German are equal localisations of the app, developed together; translated strings live in the localisation files, not here. The spec started as a Claude Doc draft written with Yang on 2026-10-17. From now on, changes are made here.
