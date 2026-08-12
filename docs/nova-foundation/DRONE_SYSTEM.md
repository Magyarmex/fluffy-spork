# Canonical Drone Systems

Mission 17 establishes `src/game/entities/drones/` as the canonical behavior authority for drone-bearing systems.

## Authority boundary

Drones remain Mission 08 entities and use Mission 09 `DroneMovement` for physical integration. `DroneSystem` does not move entities, resolve collisions, or apply damage. It emits deterministic behavior intents: destination, steering direction, attack eligibility, repair fraction, observation/harvest intent, recovery speed requirements, and IFF state. Later simulation orchestration applies those intents through the already-canonical movement and combat systems.

Route planning, local avoidance, and anti-stuck recovery are delegated to Mission 15 `NavigationService`. Dynamic hostile knowledge comes only from Mission 12 `PerceivedWorld`; target selection does not reach into unrestricted hostile entity state. Observer drones are surfaced explicitly as `relayObserverIds` so Mission 12 can authorize their relay contribution rather than granting implicit omniscience.

## Controller parity

The current v1.10.7 Second Body rules remain the dedicated Controller reference behavior:

- a Controller `swarm-order` is shared command intent rather than a private drone control language;
- launched attack runs are committed and cannot be bent by recall, repair, local defense, or navigation recovery until explicitly completed;
- deeper attack pressure spends hull-local interception coverage, using the effective command leash supplied by the canonical build/orchestrator;
- critically damaged drones may disengage for recovery while ordinary chip damage does not automatically cancel an active attack;
- Controller out-of-combat repair waits 2.6 seconds after damage, occurs within 145 units of the owner, is suppressed by a hostile drone inside 225 units, and restores 11% max health per second;
- active-pressure Controller repair starts below 18% health (12% for Broodmother); recalled/non-pressure drones may recycle below 62% and leave repair above the established recovery threshold;
- Controller recovery intent preserves the current 1.08 speed multiplier and 150-unit/second minimum-speed requirement without implementing a second movement integrator.

## Universal non-Controller Field Service

Mission 17 also preserves the separate v1.10.3 Field Service rules rather than accidentally granting Controller logistics to every drone. A surviving non-Controller drone may repair in place after 4.6 seconds without fresh damage at 4.5% max health per second. Repair is suppressed by a visible hostile tank or drone within 310 units, by an explicitly committed attack, or while Mission 10 reports the drone's weapon as still recovering. Field Service never takes over routing or target selection.

## Formations, roles, harvesting, and IFF

Formation goals are deterministic and presentation-free. Follow/recall uses a ring, attack uses a crescent (Broodmother uses a claw), and defend uses a phalanx. Observer, harvester, guardian, support, and hunter roles are derived from canonical drone definition identity without adding renderer-owned gameplay state. Harvester drones may select legitimate neutral shape/powerup contacts exposed by the canonical perceived world; collection resolution remains the owning gameplay system.

Every operational state and intent carries owner, team, and optional allegiance IFF metadata. The current v1.7.6 IFF release remains presentation-only: Mission 18 may render friendly/hostile identity from canonical state but cannot decide allegiance itself.

## Migration boundary

Historical materialized drone patches remain in the shipping runtime until later orchestration/cutover missions replace their live authority. Mission 17 makes the canonical path complete without prematurely deleting the shipping implementation. Rendering particles/lights, audio, visual IFF presentation, damage application, and physical integration remain their existing canonical owners.
