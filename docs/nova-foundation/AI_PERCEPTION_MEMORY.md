# AI Perception & Memory — Mission 14

Mission 14 moves AI knowledge acquisition onto the canonical Mission 12 perception model. It does not migrate navigation or tactics.

## Authority boundary

`PerceptionCore` remains the authority for what an observer is legitimately allowed to know. `AIKnowledge` accepts only `PerceivedWorld`; the AI perception/memory layer does not import `EntityState`, `GameWorld`, raw entity collections, renderer state, input state, navigation, or tactics.

This makes the information flow explicit:

```text
canonical game state
    -> PerceptionCore
    -> PerceivedWorld
    -> AIKnowledge
    -> AIMemory / ThreatAwareness
    -> later navigation & tactics missions
```

A later AI controller may reason from this information, but it cannot use this layer to move, fire, choose abilities, route, or bypass physical mechanics.

## Shared Battlefield View parity

The current v1.10.5 player information model exposes every living tank position on the shared battlefield map. Therefore covered or distant hostile tanks remain live positional knowledge for AI when `PerceptionCore` marks them `public-map`. This does not expose precise hostile health or rotation through cover, and it never authorizes fire through terrain.

If future stealth disables that public tracking, Mission 12 hides the contact first. Mission 14 then receives either bounded last-known information or no contact at all; it has no alternate raw-state path.

## Observation and threat-awareness inputs

`AIObservation` is a stable AI-side copy of one perceived contact. It contains only fields already present in `PerceivedWorld`.

`ThreatAwareness` is deliberately descriptive rather than tactical. It records distance, a class/build-supplied range band, visibility source/freshness, and whether precise details are legitimately known. It does not score targets or select actions.

The optional `preferredRange` parameter exists so later lineage controllers can receive class-relevant awareness without putting class doctrine into the perception layer.

## Memory and target memory

`AIMemory` stores only observations that previously crossed the perception boundary. Live observations have confidence 1. When a contact disappears from the current `PerceivedWorld`, its AI memory becomes explicitly remembered/last-known, visibility flags are cleared, precise rotation/health are stripped, and confidence decays deterministically to the configured TTL.

A remembered target must already be a known hostile targetable contact. Target memory follows the same confidence and expiry rules as contact memory; it cannot keep an expired contact alive.

Public-map contacts do not decay while they continue to be publicly tracked, matching the Shared Battlefield View doctrine.

## Fairness guard

Mission 14 regression coverage proves:

- covered public-map tanks remain live positional knowledge without through-cover combat details;
- genuinely hidden targets cannot leak changed position, health, or rotation through AI memory;
- stale memory decays and expires deterministically;
- target memory cannot outlive its legitimate contact memory;
- class/build range awareness remains descriptive only;
- `src/ai/perception/` and `src/ai/memory/` cannot import raw entity/world authority or later navigation/tactics layers.

## Deliberately deferred

Mission 15 owns navigation, path planning, obstacle handling, and terrain intelligence. Mission 16 owns target selection, positioning, engagement decisions, firing, abilities, and lineage-specific combat doctrine. Mission 14 does not pull either mission forward.
