# Miniworld

A passive, historically accurate diorama of world history on a 3D globe, made for exploring history together with a child. Miniature people live era-typical lives on accurate continents, from the last ice age to the present day. The app runs in the browser on desktop and phones, in English and German.

The specification lives in [docs/spec](docs/spec/README.md) and is the source of truth for everything the app does.

## Getting started

Node is pinned in `.nvmrc`; everything else comes with `npm ci`.

```sh
npm ci
npm run build-data -- --fixture   # quick synthetic map data; `npm run build-data` for the real map
npm run dev                       # http://localhost:8800
```

Checks and tests:

```sh
npm run check                     # lint, typecheck, unit tests
npm run coverage                  # unit tests with the coverage report
npm run test:browser              # browser tests on fixture data (spec milestone 1, section 2.5)
```
