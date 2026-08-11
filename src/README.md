# NOVA TANKS source ownership

`src/` is reserved exclusively for canonical NOVA TANKS source.

Mission 02 removed the unrelated Aquascape terrain-modeling application that previously occupied this tree. Gameplay is intentionally **not** migrated here yet; later NOVASTAR missions populate the domains below in sequence.

## Canonical domains

- `app/` — application bootstrap and lifecycle (Mission 03)
- `legacy/` — temporary legacy compatibility boundary (Mission 04; deletion target)
- `content/` — authoritative definitions and balance data (Mission 05)
- `game/` — simulation/world/entities/combat/movement/collision/battlefield/targeting/progression/spawning
- `ai/` — perception, memory, navigation, tactics, controllers
- `input/` — canonical commands and human-device adapters
- `rendering/` — presentation-only rendering
- `scenes/` — gameplay, lobby and Blackglass composition
- `audio/` — audio presentation
- `ui/` — HUD, menus, settings, evolution and debug presentation
- `persistence/` — versioned player state and settings
- `diagnostics/` — structured runtime diagnostics
- `shared/` — dependency-light shared primitives

## Current state

`shared/projectIdentity.ts` is the only canonical TypeScript implementation intentionally present after Mission 02. It exists so type-checking validates a real NOVA-owned source tree without stealing Mission 03's application-shell scope.

The shipped legacy NOVA runtime still lives outside `src/` in the root materialization assets (`index.html`, `nova-gz/`, `nova-payload/`, `nova-updates/`, PWA files, and materializer workflow). Those remain temporary production inputs until their assigned migration missions retire them.

Do not place unrelated experiments or historical applications under `src/`.
