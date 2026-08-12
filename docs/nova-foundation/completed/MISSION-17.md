# Mission 17 Completion

Status: COMPLETE

## Scope completed

- Added canonical `src/game/entities/drones/` behavior authority for first-class Mission 08 drone entities.
- Added deterministic drone roles, operational state, formations, movement orders, attack commitment, defense/interception, repair/recovery, harvesting hooks, observer relay output, target selection, and IFF state.
- Kept command ownership explicit: only drones owned by the commanding tank are processed, and Controller orders consume the Mission 13 canonical `swarm-order` command.
- Routed drone movement goals, local avoidance, pathfinding, and anti-stuck recovery through Mission 15 `NavigationService`; Mission 09 remains the sole physical drone movement/collision integrator.
- Routed dynamic hostile knowledge through Mission 12 `PerceivedWorld`; drone targeting cannot read unrestricted hostile entity/world state.
- Exposed surviving observer drones as explicit `relayObserverIds` for Mission 12 authorization rather than granting implicit swarm omniscience.
- Added canonical owner/team/allegiance IFF metadata for later presentation consumption without moving allegiance decisions into rendering.

## Gameplay parity preserved

- Preserved v1.10.7 Second Body / Controller recycling behavior: 2.6 second damage delay, 11% max-health-per-second repair, 145-unit owner recovery radius, 225-unit hostile-drone repair suppression, active-pressure thresholds of 18% (12% Broodmother), recalled/non-pressure recycling threshold of 62%, and the established recovery exit threshold.
- Preserved Controller recovery mobility intent: 1.08 speed multiplier with the historical 150-unit/second minimum speed requirement, while leaving physical integration to Mission 09.
- Preserved sticky committed attack runs: recall, repair, local interception, and recovery steering cannot bend an attack once launched until the run is explicitly completed.
- Preserved v1.10.7 Second Body local-defense tradeoff: deeper swarm pressure progressively spends local interception coverage, using the command leash supplied by the canonical build/orchestrator.
- Preserved the separate v1.10.3 Field Service doctrine for non-Controller drones: 4.6 second damage delay, 4.5% max-health-per-second in-place repair, 310-unit visible hostile tank/drone suppression, committed-attack suppression, and weapon-recovery suppression. Non-Controller drones do not inherit Controller logistics.
- Preserved current v1.7.6 IFF ownership/allegiance semantics as gameplay state only; the blue/red halo remains presentation-only for Mission 18.

## Validation performed

- Verified Mission 16 was already `COMPLETE` and its exact NOVASTAR integration commit `adc0e4a00836345bb92293ac96f059ae129f1e00` had green post-merge CI before Mission 17 work began.
- The first Mission 17 implementation run (`31505630181`) correctly exposed an unnecessary barrel-export regression in the older Mission 08 isolated compile fixture. All Mission 17 tests passed in that run; the unnecessary export was removed rather than weakening the older invariant.
- Re-reviewed shipped drone repair authority before sealing and found the universal v1.10.3 Field Service path was intentionally slower than Controller repair. The canonical implementation was corrected to preserve both doctrines instead of flattening them.
- Corrected implementation head `58f2d0b176d7459b4e99df596cbbe2d4a493efe6` passed CI run `31506287572`: production build/typecheck, full Node regression suite, and production Tailwind validation all succeeded.
- Mission 17 regression coverage includes deterministic formations/deep-pressure defense, Controller repair, non-Controller Field Service, committed attacks, local interception, observer relay/IFF state, canonical route/anti-stuck integration, perception-limited target selection, and architectural rejection of a second physics model, renderer authority, or unrestricted world access.

## Legacy and migration boundary

- Canonical drone behavior no longer depends on historical patch globals or renderer-owned geometry/state.
- Historical materialized drone patches remain in the shipping runtime until the later orchestration/cutover missions replace their live runtime authority. They are not deleted prematurely because the mother specification requires gameplay parity throughout migration.
- Damage application remains with canonical combat ownership; physical drone movement remains Mission 09; navigation remains Mission 15; perception remains Mission 12; presentation/IFF lighting remains Mission 18.
- The Mission 08 entity barrel remains unchanged, preserving its stable isolated compilation/API boundary; the Mission 17 subsystem is imported explicitly from `src/game/entities/drones/`.

## Mainline reconciliation

Production `main` remained at `52009c406b948a7b9a9402bb56495f20b3918ba6` while this mission was developed. No newer production commit required reconciliation. Current shipped drone behavior through v1.10.9 was nevertheless reviewed where relevant and preserved in the canonical Mission 17 boundary.

## Next mission

Mission 18 may be considered unblocked only after this sealed Mission 17 head is merged into `NOVASTAR-INITIATIVE` and CI succeeds on the exact integration commit.
