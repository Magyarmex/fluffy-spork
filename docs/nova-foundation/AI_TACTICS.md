# Canonical AI Tactics & Tank Controllers

Mission 16 moves high-level tank decisions out of the historical patch stack and into `src/ai/tactics/` and `src/ai/controllers/`.

## Authority boundary

`TankAIController` accepts dynamic hostile information only as Mission 12/14 `PerceivedWorld` knowledge, converts it through `AIKnowledge`, uses Mission 15 `NavigationService` for route/steering intent, consumes Mission 11 `TankBuild`, and emits Mission 13 `GameCommand` envelopes with source `ai`. It never reads renderer state, raw hostile `EntityState`, `GameWorld`, player input, or legacy globals.

The controller does not own movement physics, collision, weapon execution, cooldowns, damage, or abilities. Those remain canonical simulation/combat responsibilities. A firing command is therefore intent, not permission to bypass terrain or combat rules.

## Fairness

The current v1.10.5 shared-battlefield-view rule remains authoritative: public tank position may be considered globally, while precise hidden details remain unavailable. Direct fire additionally requires a live contact, physical direct sight, and canonical build weapon range. Tactical decisions are reaction-limited and cached. Aim retains a deterministic positive error floor and never introduces AI-only stats.

Target scoring uses range fit, punishability when health is legitimately known, live knowledge, direct sight, designation, and an explicit friendly-commitment saturation penalty. No player-input or private-intent signal exists in the API.

## Lineage doctrine

- Gunner prefers pressure range and commits abilities only in real firing windows.
- Cannon favors medium-long lanes and may time abilities around legal direct-fire pressure; structural cover damage remains CombatSystem authority.
- Guardian accepts close engagement and retreats only at a lower health threshold.
- Sniper preserves long spacing and repositions when collapsed upon.
- Controller keeps the hull at command distance and may issue the existing canonical `swarm-order`; Mission 17 remains responsible for how drones execute that order.
- Origin uses neutral starter doctrine.

## Migration boundary

Historical AI patches remain part of the shipping legacy runtime until later cutover. Mission 16 does not delete them prematurely and does not migrate complete drone behavior, rendering, lobby AI policy, or production runtime ownership.
