# NOVA Foundation — Canonical UI System

Mission 21 establishes a presentation-only UI boundary:

```text
Simulation / Application APIs
        ↓ snapshots + commands
Selectors / UIStore
        ↓ immutable read model
React presentation
```

## Authority boundary

`UIStore` accepts `AuthoritativeUIFrame` snapshots and derives immutable HUD, evolution, contact, settings, tips, and debug read models. It does not own `GameWorld`, `EntityStore`, combat, targeting, movement, or progression mutation APIs.

User intent crosses back into the application only through `UIController` and its `UIApplicationPort`. Match controls use Mission 13 `GameCommand` values (`swarm-order`, `designate-target`, fire/ability/ultimate, etc.). Evolution/mastery/gene choices are requests to an application-owned port; React never calls `EvolutionSystem.evolve` against authoritative state.

## Live settings

Mission 21 preserves the v1.7.7 Pilot Console fair-play contract:

- aim sensitivity: 0.60–1.60;
- move sensitivity: 0.60–1.60;
- joystick size: 0.80–1.30 presentation scale;
- joystick opacity: 0.30–1.00;
- screen shake: 0.00–1.00;
- no aim assist, zoom, enemy-information, hitbox, damage, speed, cooldown, fire-rate, evolution, or AI tuning is exposed.

`InputSettings.moveSensitivity` is backward-compatible and optional for older callers. `TouchInputAdapter` applies it before the existing deadzone/normalization path, so it changes thumb travel response but cannot produce a movement command outside the canonical [-1, 1] range.

Persistence of these preferences remains a persistence-layer concern for Mission 23; Mission 21 provides the stable settings read/write interface without putting storage in React.

## Spotter/contact presentation

`MessageFeed` migrates v1.9.3 Quiet Relay exactly as presentation behavior:

- friendly CONTACT variants share `CONTACT RELAY`, 1400 ms cooldown;
- hostile SPOTTED variants share `SPOTTED · RELAY`, 1900 ms cooldown;
- observer down/restored messages each use 1200 ms cooldown.

This de-duplicates player-facing text only. Perception, relay state, target memory, combat AI, and later semantic audio remain upstream.

## Surfaces

`CanonicalUI` provides the canonical React shell for lobby/menu navigation, match HUD, evolution choices, Pilot settings, tips, Blackglass chrome, debug output, touch presentation, swarm controls, and contact messages. It consumes only `UIStore` via `useSyncExternalStore` and forwards actions to `UIController`.

The shell is intentionally replaceable. A different React tree—or a non-React UI—can consume the same read model and application port without changing authoritative match state.
