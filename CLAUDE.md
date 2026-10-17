# Miniworld

A passive, historically accurate 3D globe diorama of world history for the browser (desktop and phone), localised in English and German, which are developed together as equal localisations. The audience is an 11-year-old exploring history with a parent.

## Spec first, always

The spec in `docs/spec/` is the source of truth. Before implementing any change to behaviour, content or data format, update the spec first, in the same pull request or an earlier one. If code and spec disagree, the spec wins until the spec is changed. Start any task by reading the relevant part of `docs/spec/spec.md`.

## Development environment

- Local development happens in Yang's devenv Docker container, which Claude Code controls remotely. Run commands there with `npm run …`; nothing project-specific is installed globally.
- `npm run dev` serves the app on port 8800 (http://localhost:8800), listening on all interfaces so it is reachable from outside the container.

## Rules that are easy to break

- Determinism: the world is a pure function of the historical date and the life clock. No `Math.random`, no wall-clock time in world state, whole-day integer dates. Loading state must never change the computed world.
- Language: the spec, code and comments are in English. English and German are equal localisations developed together: no user-visible string in code or textures, and every UI string and content record has `en` and `de`. German labels run longer, so layouts must allow for it.
- Licences: the code is closed source (`LICENSE`, all rights reserved). Data sources must be freely available and commercially usable, with a small simplified extract kept under `data/sources/` (not the full download); no NC, ND or unlicensed data, and share-alike or GPL only with Yang's approval (spec section 13).
- Accuracy: every content record names a source; uncertain dates are marked approximate. Procedural detail never contradicts data.
- Presentation: nothing bloody, nothing softened. Hard history (war, slavery, colonial violence, the Holocaust) is named and explained correctly at an 11 to 12-year-old reading level.
- Assets are generated and must be approved by Yang before use; only assets with status `approved` in the asset manifest may ship.
- Content is streamed in chunks by place, time window and language (spec section 10); never add content that the app must download in full at startup beyond the light index.
