# NOVA TANKS Performance Contract

NOVA is a real-time browser game. Performance work must protect the combat model first: do not buy frame time by silently weakening collision, damage, projectile simulation, input responsiveness, visual quality, class behavior, or feedback.

## Frame-budget targets

At 60 Hz the entire frame is 16.67 ms. These are engineering targets for a representative mid-tier mobile device, not claims about every phone:

- simulation/update EMA: under 5 ms
- render EMA: under 8 ms
- update + render comfortably below 16.67 ms in ordinary combat
- isolated peaks should recover immediately rather than form sustained multi-frame stalls
- tactical AI planning should normally run at 8–15 Hz and reuse cached decisions between planning ticks
- physical collision, player input, projectiles, damage, and movement integration remain frame-rate exact
- production startup must not perform source compilation that can be completed at release time

## v1.7.5 — Frame Budget

The v1.6 Battlefield and v1.7 Combined Arms systems added terrain-aware line of sight, predictive routing, blast occlusion, drone routing, fuse previews, and destructible cover. Those features multiplied geometry queries in frame-rate paths.

v1.7.5 established four rules:

1. **Broad phase before narrow phase.** Public terrain segment queries first select nearby spatial cells, then run the same exact rectangle/circle hit tests only on candidates.
2. **Planning is not physics.** AI predictive route probes are staggered to 11 Hz per tank. Controller route planning is bounded to 14 Hz. Cached waypoints continue steering every frame.
3. **No hot-path allocation churn.** Spatial-query scratch storage is reused instead of allocating a new candidate array per trace.
4. **Measure continuously.** Update/render CPU time and terrain-query counters are exposed through `NovaPerf.snapshot(game)` and periodically mirrored to `window.__NOVA_PERF_LAST__`.

## v1.7.8 — Zero Churn

The second campaign follows work beneath the public terrain API and into the rest of the frame loop. Its principle is simple: if the answer, picture, or input is unchanged, do not allocate, scan, compile, rerender, or force layout again to obtain it.

### Physics and combat

- Battlefield's **private** tank, drone, neutral-shape, projectile, LoS, spawn-safety and splash-cover geometry now uses an exact static terrain cell index. This closes the major gap left by v1.7.5, where public traces were spatialized but Battlefield's closure-local collision helpers still scanned every solid.
- Terrain collision candidate scratch storage is reused. Destructible cover remains in the same cells for the entire match; destruction only changes solidity, so the index never needs a positional rebuild.
- Projectile sweeps still use continuous segment collision and retain nearest-hit semantics. Spatial pruning changes only which obviously distant solids are rejected before exact math.
- Blast-cover hardening uses scalar three-point exposure sampling and a reusable nested blast context rather than temporary vectors, sample arrays and context objects.
- Spotter relay validation indexes the first live spotter by owner once per drone pass instead of scanning all drones separately for every tank contact.

### Entity indexing and allocation

- The core entity spatial hash keeps its Map and cell arrays alive. `clear()` empties only buckets active in the previous frame, so ordinary movement no longer destroys and recreates hash arrays continuously.
- Shape IDs have a synchronized `Map`, making `getShape(id)` constant-time rather than a linear scan.
- `nearestShape` reuses the already-built entity spatial hash, preserving exact distance selection while rejecting distant entities first.
- Movement and aim vectors reuse stable scratch objects.
- Combined Arms waypoint scoring, blast exposure, fuse previews, route steering and screen transforms avoid transient arrays/vectors where persistent state or scalars are sufficient.
- Forward Observer sensory math shares projectile kinematics across spotters for the current simulation time and reuses sensor/render scratch state.
- Controller Swarm Discipline recycles per-owner squad buckets, arrays and claim sets; drone snapshots live on the drone for the frame instead of being represented by fresh nested arrays and Maps.

### Input and UI

- Twin-stick movement still samples continuously and paints at display refresh rate, but pointer movement no longer sends every coordinate through React state and rerenders the surrounding App tree.
- React owns stick mount/unmount state; the live base/knob positions are painted directly from Input state on `requestAnimationFrame`.
- Stick DOM references are cached while mounted instead of rediscovered every visual frame.
- Canvas bounds are cached and refreshed only on actual layout changes (`resize`, scrolling that can move the canvas, Visual Viewport changes, and `ResizeObserver`) instead of calling `getBoundingClientRect()` in every pointer/mouse-aim hot path.

### Startup

- Production no longer ships the Tailwind browser compiler. The exact pinned Tailwind v4.3.2 theme and detected utility set are compiled/minified during materialization and inlined as ordinary CSS.
- CI independently compiles the production utility set and checks representative critical classes before a release can merge.
- Development source remains explicit in `.github/nova-tailwind.css`, while the playable build pays zero CSS compilation cost at startup.

None of these changes lowers simulation frequency, removes effects, lowers resolution, reduces particles, simplifies collision answers, changes damage, changes weapon/class stats, or makes AI omniscient/less constrained.

## Runtime telemetry

From a live game session, `window.__NOVA_PERF_LAST__` contains a compact rolling snapshot. With direct access to the current `Game` instance, `NovaPerf.snapshot(game)` returns the full counters.

Useful fields:

- `updateMs` / `renderMs`: exponential moving averages
- `updatePeakMs` / `renderPeakMs`: slowly decaying recent peaks
- `terrainQueries`: public terrain trace count
- `avgTerrainCandidates`: average solids surviving the public spatial broad phase
- `battlefieldQueries`: Battlefield-private broad-phase query count
- `battlefieldAvgCandidates`: average solids surviving Battlefield's private spatial broad phase
- `entityHashBucketCreates`: total hash cell arrays ever created during the match; after the bounded arena's cells have been visited this should plateau rather than rise every frame
- `aiRouteFramesSkipped`: AI movement frames that reused cached routing instead of replanning
- `droneRouteFramesSkipped`: drone update frames that reused cached routing
- entity counts: tanks, drones, bullets, shapes

## Regression rules

Any feature that enters `Game.update`, `moveTank`, `updateDrones`, projectile update, AI update, input, or render should answer these questions before merge:

- Does the work scale with tanks, drones, bullets, shapes, particles, terrain, or pointer frequency?
- Is it physics/combat that truly requires every frame, or planning/presentation that can be cached or decimated?
- Can a broad phase reject most candidates before exact geometry/math?
- Does it allocate arrays, objects, Maps, Sets, gradients or audio nodes every frame?
- Is it forcing style/layout measurement in an input/render hot path?
- Is it routing high-frequency imperative state through React when React only needs structural state?
- Does it introduce an entity × entity or entity × terrain scan that could be indexed?
- Is source transformation/compilation happening in the player browser that could happen during release materialization?
- Is there a regression test proving optimization does not change the gameplay answer?

Performance changes must keep the normal build, production CSS build and full Node suite green.

## Optimization boundary after v1.7.8

The major high-confidence structural costs identified by source inspection are now removed or bounded. Remaining opportunities are deliberately not automatic work items:

1. **Terrain visual raster caching.** Battlefield still creates gradients and uses large Canvas shadows for visible fortifications. Pre-rendered sprites could be faster, but camera zoom, DPR and dynamic damage/flash/crack state make exact visual equivalence non-trivial. Do not trade sharpness or lighting fidelity for an assumed gain; require render telemetry and image-diff validation first.
2. **Historical runtime-layer consolidation.** The versioned patch architecture adds parse/request surface. The service worker already stages dependencies in parallel and caches complete builds. Consolidation may improve cold startup but is a larger architectural migration whose real benefit must be measured after static Tailwind removes the dominant avoidable browser-side compilation step.
3. **Small helper allocations in legacy lineage code.** A few older AI/presentation helpers still return tiny temporary vectors. Their bounded entity counts make them lower-order costs. Touch them only if an allocation profile shows meaningful GC pressure after the v1.7.8 changes.
4. **Canvas drawing itself.** Tanks, projectiles, particles, text and effects fundamentally require drawing. Any next reduction must come from demonstrated redundant work, not fewer effects or lower visual quality.

The stop condition is therefore evidence-based: once v1.7.8 is deployed, do not continue changing hot paths merely because code can be made cleverer. Resume only when real-device telemetry, a browser performance trace, or a reproducible stress scene identifies a remaining material bottleneck whose optimization can preserve the exact gameplay and visual contract.
