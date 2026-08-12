# Content-domain agent rules

`src/content/` is the single canonical static-data authority.

- Tanks, weapons, drones, upgrades, evolutions, battlefield templates, balance constants and visual metadata belong in canonical registries/schema here.
- Scenes, AI, rendering, UI and tests must consume these definitions rather than maintain private copies.
- Schema changes require deterministic validation and migration of every consumer in the same change.
- Keep gameplay behavior out of registry declarations; behavior belongs to the appropriate `src/game/` system.
- Preserve stable IDs used by persistence, replay and diagnostics unless an explicit migration is supplied.
