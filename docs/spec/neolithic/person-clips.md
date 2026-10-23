# Neolithic person clips

The clips that make the farmer's-day roles of [people-profiles.md](people-profiles.md) section 4 look like what they do. They extend the clip set of [milestone-2.md](../milestone-2.md) section 13.3 and live beside the others in `assets/src/clips.ts`. Each is a pure function of the clip and the seconds since it started, listed in `PERSON_LOOPS` (so the bake can sample it) and playable on any person built by `buildPerson`. They have no blood or wounds and nothing in them is hurried: each is a calm working rhythm.

A person holds one tool in the right hand on the `tool` bone (people-profiles.md section 3). In these clips the tool stays in that hand and is turned so that its working end points where the work is (the clip sets the `tool` bone's rotation from where the arm is, so the haft is not tied to the forearm); no clip needs a bone or prop the models do not have. Where a clip needs something that is not held (a quern, a sheaf, the animal being milked, the field), that is a village or field prop placed by the tree, and the clip only says where the hands go.

| Clip | Loop (s) | Tool it expects | What the body does |
| --- | --- | --- | --- |
| `till` | 1.8 | `hoe` (or `digging-stick`) | Feet apart, the tool is swung up over the shoulder, then brought down in a quick stroke so its blade bites the soil in front of the feet while the body stoops; a short pull back, then up again. The left hand steadies the haft. |
| `sow` | 1.2 (two steps) | `basket` | A slow walk (planted gait, like `walk`) with the basket held against the belly in the right hand; with each step the left hand dips into it, then throws out sideways in an arc and comes back. |
| `reap` | 3.2 | `sickle` | Bends from the knees and waist to the standing grain, the left hand grasps a bundle of stalks, the sickle in the right hand cuts across its foot in one stroke towards the body, the reaper rises with the bundle in the left hand, then bends once more to lay the sheaf down, and straightens. |
| `thresh` | 1.2 | `crook` or `digging-stick` (any long stick) | Standing with a wide stance, the stick is raised behind the shoulder and brought down to beat the grain on the floor ahead, with a little treading of the feet in time. |
| `grind` | 2.0 | `grinding-stone` | Kneeling on both knees behind the quern (`prop-quern`, its hand-stone surface about 0.2 m above the ground and 0.45 m ahead of the knees), the torso rocks and both hands push the hand stone away and draw it back. |
| `milk` | 1.2 | none (the held tool is hidden) | A low squat beside the animal, the torso leaning forward, both hands reaching forward and down to the udder, squeezing in turn. |
| `shape` | 4.0 | `pot` | Sitting cross-legged, the unfinished pot is held in the lap by the right hand and turned in small steps, while the left hand smooths its wall up and down. |
| `spin` | 2.4 | `spindle` | Standing, the right hand holds the drop spindle up in front of the chest so that it hangs and twirls; the hand lowers and lifts with the drop; the left hand draws fibre out to the side and back, twice per loop. |

- Loops: every pose comes round again after the loop length, and the tests check it with the other clips. A clip that holds a stoop or a squat blends from `idle` and back like every other clip (`blendPerson`).
- `sow` is a stepping clip: it joins `GAITS` so `gaitSpeed` gives the speed at which a figure must move for its standing foot to stay still.
- `till`, `reap`, `thresh` and `grind` replace `work` for the roles `farmer`, `reaper`, `grinder` (and the threshing of the harvest); `milk` is for herders with an animal that is milked; `shape` is for the potter and `spin` for the weaver. `work` stays as the fallback for any role the tree has no clip for.
- Review: each clip is reviewed with `npm run anim -- person:<profile>:<kind>:<tool> <round> <clip>:0-<loop> 8` (the optional fourth part of the subject names the held tool, for example `person:anatolian-farmer:man:hoe`), the way every clip is reviewed (milestone-2.md section 13.5).
