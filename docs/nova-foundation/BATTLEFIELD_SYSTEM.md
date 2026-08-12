# Canonical Battlefield & Terrain

Mission 07 moves battlefield geometry and terrain questions into renderer-independent TypeScript under `src/game/battlefield/`.

## Authority

`Battlefield` is the canonical owner for battlefield bounds, the selected tactical template, terrain solidity, destructible-cover state, rubble records, spawn-safety checks, line-of-sight queries, swept segment/terrain hits, and the terrain broad phase.

The subsystem preserves the effective v1.6 Battlefield rules rather than redesigning them:

- arena limit: ±2250 on both axes;
- broad-phase cell size: 360;
- templates: Crossfire, Split Horizon, Four Gates;
- 90-degree rotation and mirroring of templates;
- rectangle and circle permanent geometry;
- eight destructible barricades per template with legacy HP values (300 / 330 / 290);
- destroyed cover becomes non-solid while retaining persistent rubble geometry;
- spawn queries reject solid overlap;
- line of sight ignores the first 1.5% of a segment exactly as the legacy query does;
- swept segment queries identify the first surviving solid hit.

## Spatial queries

Terrain positions are static, so a uniform 360-unit cell index is built once. Destruction changes solidity but not geometry; the index therefore remains valid for the lifetime of the battlefield. Large queries spanning more than 80 cells fall back to the complete terrain list, matching the legacy optimization strategy.

The public query surface is deliberately presentation-free:

- `contains(point, padding)`
- `isOccupied(point, padding)`
- `isSpawnSafe(point, clearance)`
- `isInsideSpawnZone(zone, point)`
- `hasLineOfSight(start, end, padding)`
- `firstTerrainHit(start, end, padding)`
- `querySolids(start, end, padding)`
- `damageCover(terrainId, amount, atMs)`

These hooks are sufficient for later movement, projectile, perception and navigation missions without moving those systems early.

## Spawn zones

The canonical battlefield records the legacy player retry annulus (700–1800 units from the origin) as the `player` spawn zone and a full-bounds `general` zone for other placement logic. Zone membership and terrain clearance are separate questions so later spawning code can preserve each entity category's existing retry policy without hiding it inside terrain code.

## Scope boundary

Mission 07 does **not** own tank movement resolution, projectile kinematics, cover damage multipliers/rewards, AI occlusion decisions, drone pathing, terrain rendering, HUD, particles or audio. Those remain in the shipping legacy runtime until their assigned missions.

The legacy `nova-updates/battlefield-v1.6.0.js` patch therefore remains active for the live game. Canonical terrain now exists alongside it as the source-driven authority that successor migrations can consume; production cutover happens later under the migration plan.

## Parity evidence

`tests/fixtures/nova-foundation/battlefield-v1.6.json` freezes constants, template inventories and representative geometry outcomes from the live v1.6 patch. `tests/node/battlefield-mission-07.test.js` compiles the simulation and battlefield TypeScript into a temporary CommonJS target and executes all authoritative queries under Node with no DOM or renderer.
