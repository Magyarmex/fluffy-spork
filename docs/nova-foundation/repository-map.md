# NOVA Foundation — Repository Ownership Map

Mission 02 establishes directory-level source ownership. The goal is not to migrate gameplay yet; it is to make it impossible to mistake unrelated historical scaffolding for canonical NOVA source.

## Canonical NOVA source

`src/` now means NOVA TANKS only.

The skeleton follows the Foundation specification:

```text
src/
├── app/
├── legacy/
├── game/
│   ├── world/
│   ├── entities/{tanks,drones,projectiles,shapes,powerups}/
│   ├── combat/
│   ├── movement/
│   ├── collision/
│   ├── battlefield/
│   ├── targeting/
│   ├── progression/
│   ├── spawning/
│   └── simulation/
├── ai/{perception,memory,navigation,tactics,controllers}/
├── input/{commands,touch,mouse,keyboard,gamepad}/
├── content/{tanks,lineages,weapons,drones,upgrades,evolutions,battlefields,balance}/
├── rendering/{camera,tanks,drones,projectiles,battlefield,effects}/
├── scenes/{gameplay,lobby,blackglass}/
├── audio/
├── ui/{hud,menus,settings,evolution,debug}/
├── persistence/
├── diagnostics/
└── shared/
```

Mission 03 owns the application shell (`src/main.ts`, `src/app/*`). Mission 04 owns the actual legacy bridge. Empty domain placeholders therefore carry no gameplay implementation yet.

## Removed unrelated application

The previous conventional TypeScript/Vite application was verified to be an Aquascape terrain modeller, not NOVA TANKS. Evidence included:

- package name `aquascape-lab`;
- `src/core/project.ts` defining aquarium tank dimensions, substrate terrain grids, material types and `createProject('Aquascape')`;
- `src/ui/App.tsx` implementing a Three.js terrain editor with Model/Simulate/Analyze tabs and raise/lower/smooth/flatten/ramp/paint tools;
- `src/render/*`, `src/tools/*`, `src/sim/slump.ts`, `src/core/*`, `src/ui/*`, `src/styles/*`, and `src/tests/*` forming one closed application dependency graph;
- the root `runtime/` directory being a CommonJS mirror used only by the three Aquascape Node test files `grid.test.js`, `serialization.test.js`, and `slump.test.js`.

Because these files were unrelated and their references terminated inside the Aquascape application/test graph, they were deleted rather than archived. Git history is the archive.

Removed package dependencies that were exclusive to that graph:

- `three`
- `@types/three`
- `zustand`
- `idb`
- `vitest` and the hand-written `types/vitest` shim

The hand-written `types/node` shim was also removed because the package already carries `@types/node`.

## Retained current NOVA production/legacy runtime

The following remain active intentionally and are **not** canonical `src/` source yet:

- `index.html` — materialized current production game;
- `nova-gz/` — compressed historical base payload used by materialization;
- `nova-payload/` — historical payload material retained by the current release architecture;
- `nova-updates/` — active and historical runtime update layers;
- `.github/workflows/deploy.yml` — current materializer/release path;
- `manifest.webmanifest`, `pwa-register.js`, `sw.js`, `nova-icon.svg` — current PWA/offline path;
- `tests/node/` — current NOVA legacy regression suite after removal of the three Aquascape-only test files.

These assets remain because Mission 02 is forbidden from replacing the gameplay runtime or materializer. Their ownership is temporary and their retirement is assigned to later missions.

## Package and build identity

`package.json` is now named `nova-tanks`.

The package retains React/ReactDOM and the React Vite plugin because the Foundation target includes a source-driven application/UI shell. Tailwind tooling remains because current CI/materialization validates it. Unrelated Aquascape-only packages were removed.

The build remains intentionally transitional:

```text
npm run typecheck
npm run build
npm run test
```

`vite build` still processes the current legacy production `index.html`; Mission 03 will install the source-driven application entry. This preserves playability while source ownership is normalized.

## Path aliases

TypeScript and Vite now share NOVA-domain aliases:

```text
@app          src/app
@game         src/game
@ai           src/ai
@input        src/input
@content      src/content
@rendering    src/rendering
@scenes       src/scenes
@audio        src/audio
@ui           src/ui
@persistence src/persistence
@diagnostics src/diagnostics
@shared       src/shared
@legacy       src/legacy
```

The old Aquascape aliases (`@core`, `@render`, `@sim`, `@tools`) were removed.

## Test ownership

`tests/node/` is the current legacy NOVA regression harness and remains active.

The target Foundation test categories are reserved as:

```text
tests/unit/
tests/simulation/
tests/parity/
tests/regression/
tests/integration/
tests/fixtures/
```

Later missions should migrate behavior-focused coverage into those domains rather than adding new patch-presence tests indefinitely.

## Other root ownership

- `docs/` — NOVA design, release and Foundation migration documentation.
- `tools/` — reserved for NOVA build/development tooling outside application runtime.
- `archive/` — reserved only for artifacts that genuinely need to remain in-tree; verified dead/unrelated source should prefer Git history.
- root design documents (`AI_DOCTRINE.md`, `BATTLEFIELD.md`, etc.) — current NOVA project documentation, not application source.

## Mission 02 boundary

No gameplay system was migrated, rewritten, rebalanced, or removed. No active NOVA runtime patch, PWA path, persistence behavior, materializer step, or production HTML behavior was intentionally changed.
