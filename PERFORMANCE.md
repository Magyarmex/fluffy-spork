# NOVA TANKS Performance Contract

NOVA is a real-time browser game. Performance work must protect the combat model first: do not buy frame time by silently weakening collision, damage, projectile simulation, input responsiveness, or class behavior.

## Frame-budget targets

At 60 Hz the entire frame is 16.67 ms. These are engineering targets for a representative mid-tier mobile device, not claims about every phone:

- simulation/update EMA: under 5 ms
- render EMA: under 8 ms
- update + render comfortably below 16.67 ms in ordinary combat
- isolated peaks should recover immediately rather than form sustained multi-frame stalls
- tactical AI planning should normally run at 8–15 Hz and reuse cached decisions between planning ticks
- physical collision, player input, projectiles, damage, and movement integration remain frame-rate exact

## v1.7.5 Frame Budget campaign

The v1.6 Battlefield and v1.7 Combined Arms systems added terrain-aware line of sight, predictive routing, blast occlusion, drone routing, fuse previews, and destructible cover. Those features multiplied geometry queries in frame-rate paths.

v1.7.5 applies four rules:

1. **Broad phase before narrow phase.** Public terrain segment queries first select nearby spatial cells, then run the same exact rectangle/circle hit tests only on candidates.
2. **Planning is not physics.** AI predictive route probes are staggered to 11 Hz per tank. Controller route planning is bounded to 14 Hz. Cached waypoints continue steering every frame.
3. **No hot-path allocation churn.** Spatial-query scratch storage is reused instead of allocating a new candidate array per trace.
4. **Measure continuously.** Update/render CPU time and terrain-query counters are exposed through `NovaPerf.snapshot(game)` and periodically mirrored to `window.__NOVA_PERF_LAST__`.

The campaign deliberately does not change weapon stats, damage, cooldowns, evolution values, collision answers, or the full-rate combat simulation.

## Runtime telemetry

From a live game session, `window.__NOVA_PERF_LAST__` contains a compact rolling snapshot. With direct access to the current `Game` instance, `NovaPerf.snapshot(game)` returns the full counters.

Useful fields:

- `updateMs` / `renderMs`: exponential moving averages
- `updatePeakMs` / `renderPeakMs`: slowly decaying recent peaks
- `terrainQueries`: public terrain trace count
- `avgTerrainCandidates`: average solids surviving the spatial broad phase
- `aiRouteFramesSkipped`: AI movement frames that reused cached routing instead of replanning
- `droneRouteFramesSkipped`: drone update frames that reused cached routing
- entity counts: tanks, drones, bullets, shapes

## Regression rules

Any feature that enters `Game.update`, `moveTank`, `updateDrones`, projectile update, AI update, or render should answer these questions before merge:

- Does the work scale with tanks, drones, bullets, shapes, particles, or terrain?
- Is it physics/combat that truly requires every frame, or planning/presentation that can be cached or decimated?
- Can a broad phase reject most candidates before exact geometry/math?
- Does it allocate arrays/objects/gradients/audio nodes every frame?
- Does it introduce a nested entity × entity scan?
- Is there a regression test proving optimization does not change the gameplay answer?

Performance changes must keep the normal build and full Node suite green.

## Next optimization targets

Telemetry should determine order, but the remaining known candidates are:

1. Battlefield's private per-entity terrain collision loops for neutral shapes and drones.
2. Battlefield's private per-bullet all-solid swept collision pass under projectile-heavy builds.
3. Terrain rendering that rebuilds Canvas gradients and large blurred shadows every frame.
4. Nested spotter owner/drone lookups that can be indexed by owner/id.
5. Startup weight from stacked historical runtime patches and the Tailwind browser compiler; these are primarily load/parse costs rather than the current combat-frame bottleneck.

Do not optimize these by intuition alone once v1.7.5 telemetry is available. Profile the actual dominant category first, preserve the game result, then reduce how often or how broadly that result is computed.
