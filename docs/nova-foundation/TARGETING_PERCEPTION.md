# Targeting, Contacts & Perception Core

Mission 12 establishes the canonical information boundary between authoritative simulation state and controller-facing knowledge.

## Current information contract

NOVA v1.10.5 deliberately changed AI awareness to match the player's shared battlefield view: every living tank shown on the normal minimap remains a live positional contact through cover and at long range. Terrain therefore blocks physical fire, not public tank tracking. Mission 12 preserves that shipped rule with `publicTankTracking: true` as the default policy.

That public track is intentionally narrower than a raw entity reference. A covered public-map contact exposes identity, team, kind and current position, but not precise hostile health or rotation. Direct line of sight may expose those detailed fields. This makes the visibility boundary explicit and gives future stealth or presentation changes one policy seam rather than allowing controllers to read `GameWorld` directly.

## Core types

- `PerceptionCore` converts authoritative entity state into a copied `PerceivedWorld`.
- `PerceivedContact` records relation, information source, position, freshness and visibility flags.
- `DesignationRegistry` owns bounded team target designations.
- `TargetingService` validates/acquires targets only from `PerceivedWorld`.
- `relayObserverIds` makes spotter/observer contribution explicit; ordinary allies do not silently become reconnaissance relays.
- Last-known contacts retain the last legitimate observation only. They never update from concealed live state and expire after a deterministic policy TTL.

## Knowledge versus permission

Information does not bypass mechanics. A public-map, relayed or designated contact can be known and selected, but direct-fire legality still belongs to combat plus Mission 07 battlefield line-of-sight. This preserves the v1.10.5 rule that walls block shots even when the target location is known.

Mission 12 does not implement tactical target scoring, class AI, path planning, UI messages, rendering, input, or weapon behavior. Those remain assigned to later missions.

## Fairness invariants

1. Controller-facing code receives `PerceivedWorld`, never mutable `EntityState` objects.
2. A hostile entity that is neither directly visible, publicly tracked, relayed nor designated is absent unless a legitimate last-known record exists.
3. Last-known records freeze at the previous legitimate observation; concealed movement and health changes cannot leak into them.
4. Relay requires an explicitly declared friendly observer with line of sight.
5. Designations expire deterministically and do not expose precise hostile combat details by themselves.
6. The default policy mirrors the current player minimap contract; a future stealth mechanic must disable public tracking for affected targets before AI can observe them.

## Legacy relationship

The materialized runtime remains the shipping authority during migration. Existing `shared-battlefield-view-v1.10.5.js`, Sniper/Forward Observer logic and Spotter communication patches are not removed in this mission. Their information semantics are represented canonically here so Missions 14–16 can migrate AI without importing unrestricted legacy world reads.
