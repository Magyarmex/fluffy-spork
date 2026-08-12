# Game-domain agent rules

`src/game/` owns authoritative, deterministic gameplay state and simulation.

- Keep simulation headless: no DOM, React, renderer, audio or browser globals.
- Route terrain, line-of-sight, occupancy and collision through canonical battlefield/spatial APIs.
- Treat `src/content/` registries as data authority; do not fork tank/weapon/drone/balance definitions here.
- Accept player/AI intent through canonical commands and system APIs; do not inspect presentation state.
- Emit semantic events for presentation consumers instead of triggering UI/VFX/audio directly.
- Preserve deterministic ordering, fixed-step behavior, snapshots and replayability.
