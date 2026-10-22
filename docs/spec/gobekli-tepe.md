# Göbekli Tepe

The landmark model of Göbekli Tepe as it may have looked when newly built (asked for by Yang, 2026-10-21: "let's design the 3d model for Göbekli Tepe, how it might have looked like, when newly built"). Status: **Proposed**, for review with the asset sheet (milestone-2.md section 13). The landmark record and the building vignette are in milestone-2.md section 8; the band that stands there is the anchor of sites.md.

## 1. What the model shows

Sources: Schmidt 2006 and 2010 (*Göbekli Tepe: the Stone Age sanctuaries*, Documenta Praehistorica 37) and the Deutsches Archäologisches Institut excavation reports. The model is the Layer III enclosures of the Pre-Pottery Neolithic A (c. 9500 to 8800 BCE) when new, not the ruin seen today.

- **Enclosures.** Round to oval rings cut into the limestone plateau, drawn smaller than the real 10 to 30 m so the site fits its place on the globe (Yang, 2026-10-21: "way too large"), about 10 to 15 m across: a low wall of limestone rubble set in clay, with a stone bench along its inside, and T-shaped pillars standing in the wall, facing inward. Enclosure D (about 11 m here, 20 m in fact) is the model's first ring; C is the largest (about 15 m here), B and A smaller.
- **Pillars.** Cut from the limestone of the plateau: a flat shaft with a wide crossbar on top, 2.3 to 2.7 m tall in the ring walls (real: 3 to 3.5 m). The two central pillars of an enclosure are the tallest (4.2 m with the crossbar in D, real 5.5 m) and stand parallel, facing the same way, south-east in D.
- **Figures in the stone.** The central pillars are stylised people: arms along the narrow sides folding to the front, hands over a belt, a fox-pelt loincloth below it (pillar 18). The ring pillars carry animals in low relief: foxes, boars, snakes, aurochs, cranes, vultures, scorpions.
- **Newly cut stone** is pale cream, the clay mortar and the lime-plaster floor darker and pinker. Traces of red pigment are known; the model leaves colour to the stone.
- **Open to the sky.** Whether the enclosures were roofed is debated; no roof posts are known and the pillars are too wide-set for a simple roof, so the model has none and the landmark card says that the roof is unknown.

## 2. The model

`buildGobekliTepe(rings)` in `assets/src/gobekli.ts` returns the model at life size in metres, +Y up, centred on Enclosure D, on a low platform of cut bedrock. `rings` (1 to 4) adds the neighbouring enclosures C, B and A, which are the stages `gobekli-tepe-ring-1`, `-rings-1-2` and `-rings-1-4` of milestone-2.md section 8 (the layout of the rings is schematic: their sizes are the excavation's scaled down to about half, their positions only roughly its plan). Pillars are boxes; the central pillars of each ring carry arms, hands, belt and loincloth as separate parts, and a few ring pillars a relief animal made of the kit's blobs and rods. Details smaller than about 10 cm are left out, as everywhere (milestone-2.md section 13.3).

Review: `npm run asset-sheets` draws the landmark sheet (overview, close view of the central pillars, and a person for scale).

## 3. In the world

Yang, 2026-10-21 (issue 132): "Two bands come together to build Gobekli Tepe and then celebrate/dance in and around it. Use the single ring version. It stands for 1000 years, then gradually over 500 years gradually sinks into the ground. make sure there is no weird artifacts. Let's try to reduce the number of triangles that represent the building without changing its appearance significantly."

- **Drawn as a scene prop.** Göbekli Tepe is the monument scene of its anchor (humankind.md section 8.2), drawn as the prop `prop-gobekli-ring`: the one-ring model, Enclosure D alone, with the wall and bench, eight ring pillars and the two figure-pillars, raised in six steps (`build-0` to `build-5`) by the people who gather there, then danced in and round, standing 1,000 years and then sinking by itself into the ground over the 500 years to the end (Yang, 2026-10-21: filling it with earth was dropped: "just let it sink into the ground by itself"). The landmark engine with several rings and a building vignette was removed (issue 147).
- **Fewer triangles.** The prop has at most 1,000 triangles where the model has 2,860: the floor, the bedrock and the plaster are flat discs of few sides; the wall and the bench between two pillars are one part each; faces no one can see (the undersides, the backs against the wall, the ends touching other stones) are not made; the arms, belt and pelt of the figure-pillars are one part per side and the relief animals are cut to a single blob each. Seen from the distance a person sees it from, it looks as the model does. The limit is the prop limit of milestone-2.md section 13.3.
- **No artifacts.** No part pokes out of another, no face lies in the same plane as another (z-fighting), nothing hangs under the floor, and a part that is not yet raised is hidden whole. It sinks whole, by its height, so the ground takes the floor last and no edge of it stays above the grass; the floor is no wider than the wall, so no bevel or ledge shows round the outside (Yang, 2026-10-21).
