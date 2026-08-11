# Canonical Rendering System

Mission 18 establishes `src/rendering/` as NOVA TANKS' presentation boundary.

## Authority boundary

Rendering consumes canonical content definitions, entity snapshots and semantic game events. It emits deterministic render commands. It does not move entities, resolve collisions, choose targets, decide allegiance, apply gameplay outcomes, or mutate simulation state. The simulation can therefore be tested and replayed without a canvas, while presentation can be replaced without changing game rules.

`CanonicalVisualFactory` is the single adapter from canonical content metadata to presentation descriptors. Tank color, icon, size, barrel geometry, drone role and projectile weapon identity come from the Mission 05 registries rather than renderer-local class tables.

## Muzzle geometry

Barrel geometry uses canonical `BarrelDefinition`. Tank turret rotation owns the local lateral/forward transform; each barrel's `off` rotates its visible axis and `len` terminates at the visible muzzle. This geometry is presentation-only; spawning and collision remain outside rendering.

## Drone IFF

Mission 17 supplies allegiance as gameplay state. Mission 18 only presents it. The current IFF Halo contract is preserved: friendly/owned drones use `#4da8ff`, hostile drones use `#ff4d62`, outer/core alpha are 0.18/0.30, and hunter versus escort halos retain the existing 31/18 versus 24/14 radii. Native class color remains visible in the drone body.

## Signal discipline

The canonical intent registry carries forward v1.10.9's one-signal/one-job doctrine. World-space effects are built only from semantic events whose payload already contains presentation position. Effects never infer hidden events from game state. Remaining reticle, edge and HUD channels stay for later scene/UI migration rather than being duplicated here.

## Deterministic render state

`Renderer.render()` returns a stable layer-sorted command frame plus allocation-facing counts (`entitiesVisited`, `entitiesRendered`, command count and effect count). These expose the obvious per-entity construction hot path without prematurely starting Mission 22's performance campaign.

Canvas/backend execution is downstream of this command boundary. Mission 18 proves gameplay presentation can be described entirely from canonical definitions, snapshots and semantic events before later orchestration and scene cutovers wire it into the shipping runtime.
