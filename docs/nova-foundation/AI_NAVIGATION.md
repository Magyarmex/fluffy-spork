# AI Navigation & Terrain Intelligence

Mission 15 establishes the canonical, headless navigation boundary under `src/ai/navigation/`.

## Authority boundary

Navigation consumes Mission 07 `Battlefield` geometry directly. It does not read DOM/canvas geometry, renderer state, hostile entity authority, weapon state, or class doctrine. Mission 16 remains responsible for target choice, tactical intent, engagement, retreat, firing, abilities, and lineage-specific behavior.

## Route planning

`RoutePlanner` provides deterministic 8-neighbor A* over a configurable world-space grid. It first attempts a direct canonical terrain query, then plans around solid terrain when necessary. Diagonal corner cutting is forbidden. Route smoothing uses the same canonical battlefield line-of-sight query and clearance used for planning.

The planner supports bounded expansion budgets and reports diagnostics (`expandedNodes`, generated nodes, direct-path status, cost, cache hit). A small deterministic cache is keyed by start/goal, clearance, expansion budget, current solid-terrain IDs, and dynamic-obstacle state. Destructible cover therefore invalidates cached routes automatically when it becomes non-solid.

## Dynamic obstruction and local avoidance

Dynamic obstacles are explicit circle primitives supplied by the caller. They affect route cells, direct-route checks, cache identity, and local steering. They do not become hidden global state.

`localAvoidance()` adjusts a desired movement direction away from nearby dynamic obstacles. It is a low-level movement aid only; it cannot select enemies or combat actions.

## Tank and drone hooks

`NavigationService` exposes the same planner through tank and drone helpers with different default clearances. These are hooks for later missions, not independent AI stacks. Mission 17 can use the drone hook without creating a second pathfinder.

## Anti-stuck behavior

`StuckMonitor` tracks deterministic per-agent movement progress by simulation tick. Once an agent with a destination remains within the movement epsilon for the configured duration, it emits a bounded alternating lateral/backward recovery vector and requests replanning. It never teleports an entity or bypasses canonical movement/collision.

## Performance budget

The Mission 15 regression suite executes representative repeated pathfinding loads on all canonical battlefield templates and asserts a bounded expansion count plus a generous wall-clock CI ceiling. The expansion budget is the gameplay-relevant hard limit; wall-clock timing is recorded as a regression signal rather than gameplay state.

## Migration status

The materialized runtime remains the shipping AI/navigation authority until its later assigned cutover. This mission creates the canonical replacement service and regression coverage without pulling Mission 16 tactics or Mission 17 drone behavior forward.
