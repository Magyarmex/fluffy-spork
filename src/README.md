# NOVA Foundation source tree

`src/` is the authoritative NOVA TANKS application and game source. Production starts at `src/main.ts`, composes the browser runtime in `src/app/`, and builds with Vite/TypeScript into `dist/`.

## Ownership map

- `app/` browser lifecycle/composition
- `game/` deterministic gameplay/simulation, entities, battlefield, combat and progression
- `content/` canonical registries/schema/static definitions
- `input/` canonical commands plus touch/mouse/keyboard/gamepad/scripted adapters
- `ai/` perception-bounded knowledge, navigation and tactics
- `rendering/` shared renderer/camera/effects/visual factories
- `scenes/` canonical scene composition, including Blackglass and lobby battle
- `ui/` React HUD/menus/settings/touch presentation
- `audio/` semantic audio and feedback consumers
- `persistence/` versioned save schema and migrations
- `diagnostics/` structured read-only diagnostics
- `replay/` deterministic Foundation replay artifacts/player
- `shared/` cross-domain primitives that do not own gameplay policy

There is no active legacy source boundary. Historical payloads, runtime patches, materializer code and migration-only runtime selectors were retired in Mission 26 and remain recoverable from Git history / `archive/pre-mission-26-legacy-runtime` only.

Read the nearest `AGENTS.md` before editing a domain. Root architecture rules live at `../AGENTS.md`.
