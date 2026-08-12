# NOVA Foundation — Mission 25 Performance & Production Cutover Report

## Baseline

Mission 01 froze production at `52009c406b948a7b9a9402bb56495f20b3918ba6` with a 265,431-byte materialized `index.html`, 44 injected runtime patches, Vite warnings for classic runtime scripts, a 146 ms Vite build phase on the recorded runner, and 239/239 Node regressions passing in about 909.5 ms.

Mission 25 starts from Mission 24 integration `21d3f4c10fdc32f290bb4edd5d03973a4c311c4a`, after deterministic parity evidence was established across the mother-spec behavior matrix.

## Measurement-driven decisions

The largest verified production-path cost was architectural rather than a hot loop: production reconstructed and mutated a giant historical HTML payload and then shipped dozens of classic patch scripts outside the canonical bundle. Mission 25 removes that entire production cost instead of adding speculative micro-optimizations to simulation code that is already protected by subsystem budgets and regressions.

The canonical source shell is deliberately tiny and contains only metadata, PWA links, the application root and the Vite module entry. CI enforces a 32 KiB maximum on built `dist/index.html`; Mission 01's checked-in production shell was 265,431 bytes. JavaScript is now emitted as normal Vite assets rather than being materialized into the page or injected as versioned patch tags.

Existing measured/perceptual performance disciplines established by earlier missions remain in force: fixed-step simulation, bounded AI work, terrain/spatial queries, drone budgeting, renderer lifecycle/culling hooks, lobby cadence/throttling and reduced-motion behavior. Mission 25 intentionally does not replace those with unmeasured pools, workers, OffscreenCanvas, or cache tricks.

## Profile coverage and decisions

| Surface | Mission 25 decision |
|---|---|
| simulation | retain deterministic fixed-step kernel; no unmeasured micro-optimization |
| AI | retain bounded/staggered work and prior regression budgets |
| navigation | retain canonical terrain intelligence and spatial-query ownership |
| drones | retain established drone update/performance budgets |
| rendering | keep canonical renderer; production bundling removes legacy presentation duplication |
| particles / feedback | retain semantic-event consumers; no extra allocation-heavy redesign |
| UI | bundle React through npm/Vite; remove legacy CDN/UMD production React path |
| audio | retain semantic downstream architecture; no gameplay-authority changes |
| allocations / GC | no object-pool rewrite without a measured hot allocation path |
| lobby background | retain Mission 20 cadence, staggering, caps and reduced-motion policy |
| mobile / touch | preserve Mission 13/20/21 command, settings and performance contracts |

## Canonical production path

The deployment workflow is now source-driven:

```text
checkout
npm ci
npm run typecheck
npm run test
npm run build
npm run validate:dist
upload dist/
deploy dist/
```

It no longer reconstructs `nova-gz`, injects `nova-updates`, exposes legacy module globals, rewrites Tailwind into a materialized page, commits generated `index.html`, or pushes a bot-generated runtime commit.

A real npm lockfile is present so `npm ci` is reproducible rather than ceremonial.

## Artifact validation

`scripts/validate-dist.mjs` fails the build unless:

- `dist/index.html`, `manifest.webmanifest`, `nova-icon.svg`, and `sw.js` exist and are non-empty;
- the production shell links bundled assets and the manifest;
- no `nova-updates/`, `nova-gz/`, `__novaModules`, or `__bootModule` dependency survives in production HTML;
- the manifest preserves NOVA TANKS scope/start behavior;
- the atomic offline-update service worker contract remains present;
- at least one canonical JavaScript bundle is emitted;
- the production HTML shell remains below 32 KiB.

The root legacy assets remain in the repository only as development/parity evidence for Mission 26's retirement audit. They are not copied into `dist/` and are no longer production dependencies.

## PWA/offline behavior

The existing updater v3 remains the production service worker. Vite emits `sw.js`, `manifest.webmanifest`, and `nova-icon.svg` into `dist/`; application bootstrap still registers `./sw.js` with `updateViaCache: none`, synchronizes the latest complete build, preserves atomic staging/promotion, and retains the prior complete build as rollback reserve.

## Cutover result

Mission 25 changes the deployable product from a materialized historical runtime into a canonical TypeScript/Vite artifact while keeping the legacy runtime available only for development parity until Mission 26. No gameplay redesign is part of this cutover.
